'use strict';

const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');
const { validateSession, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { withTransaction } = require('../utils/dbTransaction');
const paystack = require('../utils/paystack');

// Tier specifications and ISO 45003 feature entitlements (in GHS)
const TIERS = {
  free: {
    tier: 'free',
    name: 'Free (Community)',
    seats: 10,
    priceMonthlyGhs: 0,
    planCode: null,
    features: [
      'Standard psychosocial hazard logging',
      '1 HR Administrator account',
      'Up to 10 active employees',
      'Hardcoded privacy shield (N >= 5)',
      'Core COPSOQ-III screening'
    ]
  },
  starter: {
    tier: 'starter',
    name: 'Starter Tier',
    seats: 100,
    priceMonthlyGhs: 5500,
    planCode: process.env.PAYSTACK_PLAN_STARTER || null,
    features: [
      'Up to 100 active employee seats',
      'Daily micro pulse check-ins',
      'Clinical EAP intake routing & referrals',
      'Dedicated medical assessor link',
      'Basic ISO 45003 hazard logging',
      'HR analytics ledger & heatmaps (N >= 5)'
    ]
  },
  pro: {
    tier: 'pro',
    name: 'Professional Tier (ISO 45003 Standard)',
    seats: 999999, // Unlimited seats
    priceMonthlyGhs: 15450,
    planCode: process.env.PAYSTACK_PLAN_PRO || null,
    features: [
      'Unlimited employees & seats',
      'Full COPSOQ III assessment suite (Core, Middle, Long)',
      'Automated ISO 45003 compliance audit trail & board-ready PDF export',
      'Empirical Pearson correlation engine (workload vs. burnout)',
      'Longitudinal trend analysis & predictive alerts',
      'Full whistleblower encrypted drop-box with conflict guard & HMAC receipts',
      'Assessor dialogue & video consultation links',
      'Priority 24/7 support SLA'
    ]
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise Tier',
    seats: 999999,
    priceMonthlyGhs: 35000,
    planCode: process.env.PAYSTACK_PLAN_ENTERPRISE || null,
    features: [
      'Unlimited / multi-subsidiary employee seats',
      'Dedicated clinical partner integration & warm handoffs',
      'Custom SSO (SAML 2.0 / Okta / Azure AD)',
      'Multi-entity cross-subsidiary rollup dashboards',
      'Quarterly ISO 45003 compliance auditor sign-off reports',
      'Dedicated compliance engineer & custom SLA'
    ]
  }
};

// ---------------------------------------------------------------------------
// 1. Paystack Webhook (Unauthenticated - uses HMAC-SHA512 signature verification)
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-paystack-signature'];
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

  if (!paystack.isConfigured()) {
    logger.warn('[Paystack Webhook] Webhook ping received but PAYSTACK_SECRET_KEY is not configured');
    return res.status(200).json({ received: true });
  }

  if (!paystack.verifyWebhookSignature(rawBody, signature)) {
    logger.warn('[Paystack Webhook] Signature verification failed');
    return res.status(400).send('Invalid signature');
  }

  const event = req.body;
  if (!event || !event.event) {
    return res.status(400).json({ error: 'Malformed webhook payload' });
  }

  try {
    switch (event.event) {
      case 'charge.success': {
        const data = event.data || {};
        const reference = data.reference;
        const companyId = data.metadata?.company_id;
        const tierKey = (data.metadata?.tier || 'pro').toLowerCase();
        const tierConfig = TIERS[tierKey] || TIERS.pro;

        if (!companyId) {
          logger.warn({ reference }, '[Paystack Webhook] charge.success missing metadata.company_id');
          break;
        }

        const tenant = await Tenant.findOne({ company_id: companyId });
        if (!tenant) {
          logger.warn({ companyId }, '[Paystack Webhook] Tenant not found for charge.success');
          break;
        }

        // Idempotency check: Skip duplicate event deliveries
        const priorRefs = tenant.subscription?.transactionReferences || [];
        if (reference && priorRefs.includes(reference)) {
          logger.info({ reference, companyId }, '[Paystack Webhook] Duplicate charge.success event ignored');
          return res.status(200).json({ received: true, duplicate: true });
        }

        const nextPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

        await withTransaction(async (dbSession) => {
          await Tenant.findOneAndUpdate(
            { company_id: companyId },
            {
              $set: {
                'subscription.tier': tierKey,
                'subscription.status': 'active',
                'subscription.currency': 'GHS',
                'subscription.cancelAtPeriodEnd': false,
                'subscription.currentPeriodEnd': nextPeriodEnd,
                'subscription.customerId': data.customer?.customer_code || tenant.subscription?.customerId,
                'subscription.paystackCustomerCode': data.customer?.customer_code || tenant.subscription?.paystackCustomerCode,
                'subscription.paystackAuthorizationCode': data.authorization?.authorization_code || tenant.subscription?.paystackAuthorizationCode,
                'subscription.paystackPlanCode': data.plan?.plan_code || tenant.subscription?.paystackPlanCode,
                'subscription.paystackSubscriptionCode': data.subscription_code || tenant.subscription?.paystackSubscriptionCode,
                'subscription.maxEmployees': tierConfig.seats,
                billing_tier: tierKey,
                max_allowed_seats: tierConfig.seats,
                lifecycle_state: 'active',
                access_expires_at: nextPeriodEnd
              },
              $addToSet: {
                'subscription.transactionReferences': reference
              }
            },
            { session: dbSession || undefined }
          );

          await AuditLog.append(
            {
              company_id: companyId,
              actor_user_id: 'SYSTEM_PAYSTACK_WEBHOOK',
              actor_role: 'system',
              event_type: 'tenant_state_changed',
              event_payload: {
                previous_state: tenant.lifecycle_state,
                new_state: 'active',
                billing_tier: tierKey,
                paystack_reference: reference,
                currency: 'GHS',
                amount_pesewas: data.amount
              }
            },
            { session: dbSession || undefined }
          );
        });

        logger.info({ companyId, tier: tierKey, reference }, '[Paystack Webhook] Tenant subscription activated/renewed via charge.success');
        break;
      }

      case 'subscription.create': {
        const data = event.data || {};
        const customerCode = data.customer?.customer_code;
        const subscriptionCode = data.subscription_code;
        const emailToken = data.email_token;
        const planCode = data.plan?.plan_code;

        if (subscriptionCode) {
          await Tenant.findOneAndUpdate(
            {
              $or: [
                { 'subscription.paystackCustomerCode': customerCode },
                { 'subscription.customerId': customerCode },
                { 'subscription.paystackPlanCode': planCode }
              ]
            },
            {
              $set: {
                'subscription.paystackSubscriptionCode': subscriptionCode,
                'subscription.subscriptionCode': subscriptionCode,
                'subscription.paystackEmailToken': emailToken || null,
                'subscription.status': 'active'
              }
            }
          );
          logger.info({ subscriptionCode, customerCode }, '[Paystack Webhook] subscription.create recorded with email_token');
        }
        break;
      }

      case 'subscription.disable': {
        const data = event.data || {};
        const subscriptionCode = data.subscription_code;

        if (subscriptionCode) {
          // Cancellation stops future billing only. Access continues until currentPeriodEnd.
          await Tenant.findOneAndUpdate(
            {
              $or: [
                { 'subscription.paystackSubscriptionCode': subscriptionCode },
                { 'subscription.subscriptionCode': subscriptionCode }
              ]
            },
            {
              $set: {
                'subscription.cancelAtPeriodEnd': true
              }
            }
          );
          logger.info({ subscriptionCode }, '[Paystack Webhook] subscription.disable recorded; auto-renewal stopped');
        }
        break;
      }

      case 'invoice.payment_failed': {
        const data = event.data || {};
        const customerCode = data.customer?.customer_code;
        if (customerCode) {
          await Tenant.findOneAndUpdate(
            {
              $or: [
                { 'subscription.paystackCustomerCode': customerCode },
                { 'subscription.customerId': customerCode }
              ]
            },
            {
              $set: {
                'subscription.status': 'past_due'
              }
            }
          );
          logger.warn({ customerCode }, '[Paystack Webhook] Invoice payment failed; marked past_due');
        }
        break;
      }

      case 'refund.processed':
      case 'refund.failed': {
        const data = event.data || {};
        logger.info({ event: event.event, refundData: data }, '[Paystack Webhook] Refund event received');
        break;
      }

      default:
        logger.debug({ event: event.event }, '[Paystack Webhook] Unhandled event type passed through');
        break;
    }

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error({ err: err.message }, '[Paystack Webhook] Processing error');
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ---------------------------------------------------------------------------
// Protected Billing Endpoints (require HR/Tenant/Super Admin)
// ---------------------------------------------------------------------------
router.use(validateSession);
router.use(requireRole('hr_admin', 'tenant_admin', 'super_admin'));

/**
 * GET /api/v1/billing/status
 * Returns current tenant tier, status, seat utilization, and available upgrade tiers
 */
router.get('/status', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const tenant = await Tenant.findOne({ company_id }).lean();

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const sub = tenant.subscription || {};
    const tier = sub.tier || tenant.billing_tier || 'trial';
    const status = sub.status || 'trialing';
    const trialEndsAt = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
    const currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : (tenant.access_expires_at ? new Date(tenant.access_expires_at) : null);
    const cancelAtPeriodEnd = Boolean(sub.cancelAtPeriodEnd);

    const now = new Date();
    let daysRemaining = null;
    if (status === 'trialing' && trialEndsAt) {
      daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (currentPeriodEnd) {
      daysRemaining = Math.max(0, Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    // Access is granted if currentPeriodEnd > now, regardless of cancelAtPeriodEnd
    const isActive = (currentPeriodEnd && currentPeriodEnd > now) || status === 'active' || (status === 'trialing' && (daysRemaining === null || daysRemaining > 0));

    res.json({
      success: true,
      company_id,
      company_name: tenant.company_name,
      currency: 'GHS',
      subscription: {
        tier,
        status,
        is_active: isActive,
        cancel_at_period_end: cancelAtPeriodEnd,
        days_remaining: daysRemaining,
        trial_ends_at: trialEndsAt,
        current_period_end: currentPeriodEnd,
        used_seats: tenant.used_seats || 0,
        max_allowed_seats: tenant.max_allowed_seats || 100,
        has_paystack_customer: !!(sub.paystackCustomerCode || sub.customerId),
        has_paystack_subscription: !!(sub.paystackSubscriptionCode || sub.subscriptionCode),
        transaction_count: (sub.transactionReferences || []).length
      },
      current_tier_details: TIERS[tier] || null,
      available_tiers: TIERS
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/billing/initialize (alias: /create-checkout-session)
 * Generates a Paystack Checkout Session for subscription upgrades (GHS, MoMo, Cards)
 */
async function handleInitializePayment(req, res, next) {
  try {
    const { company_id, email } = req.sessionData;
    const { tier = 'pro', callback_url } = req.body;

    const tierKey = tier.toLowerCase();
    const tierConfig = TIERS[tierKey];
    if (!tierConfig || tierKey === 'free') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TIER',
        message: `Invalid tier '${tier}'. Valid paid options: starter, pro, enterprise`
      });
    }

    if (!paystack.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'BILLING_DISABLED',
        message: 'Paystack payments are not configured in this environment. Please contact support.',
        simulated_upgrade_available: true
      });
    }

    const tenant = await Tenant.findOne({ company_id });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const payerEmail = email || tenant.admin_email || `billing-${company_id.slice(0, 8)}@wellframe.internal`;
    const defaultCallback = `${req.protocol}://${req.get('host')}/dashboard?checkout=success`;
    const amountInPesewas = Math.round(tierConfig.priceMonthlyGhs * 100);

    const transactionData = await paystack.initializeTransaction({
      email: payerEmail,
      amountInPesewas,
      planCode: tierConfig.planCode,
      callbackUrl: callback_url || defaultCallback,
      metadata: {
        company_id,
        tier: tierConfig.tier,
        company_name: tenant.company_name
      },
      channels: ['card', 'mobile_money']
    });

    res.json({
      success: true,
      authorization_url: transactionData.authorization_url,
      access_code: transactionData.access_code,
      reference: transactionData.reference
    });
  } catch (err) {
    next(err);
  }
}

router.post('/initialize', handleInitializePayment);
router.post('/create-checkout-session', handleInitializePayment);

/**
 * GET /api/v1/billing/verify/:reference
 * Verifies transaction with Paystack immediately on return redirect for fast UI feedback
 */
router.get('/verify/:reference', async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { company_id } = req.sessionData;

    if (!paystack.isConfigured()) {
      return res.status(503).json({ success: false, error: 'BILLING_DISABLED' });
    }

    const data = await paystack.verifyTransaction(reference);

    if (data.status === 'success') {
      const tierKey = (data.metadata?.tier || 'pro').toLowerCase();
      const tierConfig = TIERS[tierKey] || TIERS.pro;
      const nextPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await Tenant.findOneAndUpdate(
        { company_id },
        {
          $set: {
            'subscription.tier': tierKey,
            'subscription.status': 'active',
            'subscription.currency': 'GHS',
            'subscription.cancelAtPeriodEnd': false,
            'subscription.currentPeriodEnd': nextPeriodEnd,
            'subscription.paystackCustomerCode': data.customer?.customer_code,
            'subscription.customerId': data.customer?.customer_code,
            'subscription.maxEmployees': tierConfig.seats,
            billing_tier: tierKey,
            max_allowed_seats: tierConfig.seats,
            lifecycle_state: 'active',
            access_expires_at: nextPeriodEnd
          },
          $addToSet: {
            'subscription.transactionReferences': reference
          }
        }
      );
    }

    res.json({
      success: true,
      status: data.status,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/billing/cancel
 * Cancels auto-renewal (sets cancelAtPeriodEnd: true). Does not revoke paid access immediately.
 */
router.post('/cancel', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const tenant = await Tenant.findOne({ company_id });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const sub = tenant.subscription || {};
    const subscriptionCode = sub.paystackSubscriptionCode || sub.subscriptionCode;
    let emailToken = sub.paystackEmailToken;

    // If active on a Paystack plan, disable auto-debit with Paystack
    if (subscriptionCode && paystack.isConfigured()) {
      if (!emailToken) {
        // Fallback: fetch subscription details to obtain email_token
        try {
          const subDetails = await paystack.getSubscription(subscriptionCode);
          emailToken = subDetails?.email_token;
        } catch (e) {
          logger.warn({ err: e.message, subscriptionCode }, '[Paystack Cancel] Failed to fetch subscription email_token fallback');
        }
      }

      if (emailToken) {
        try {
          await paystack.disableSubscription({ code: subscriptionCode, token: emailToken });
        } catch (err) {
          logger.error({ err: err.message, subscriptionCode }, '[Paystack Cancel] disableSubscription failed');
        }
      }
    }

    // Mark cancellation locally. Access remains intact until currentPeriodEnd / access_expires_at.
    tenant.subscription = tenant.subscription || {};
    tenant.subscription.cancelAtPeriodEnd = true;
    await tenant.save();

    await AuditLog.append({
      company_id,
      actor_user_id: req.sessionData.user_id,
      actor_role: req.sessionData.role,
      event_type: 'tenant_state_changed',
      event_payload: {
        action: 'subscription_cancelled',
        company_id,
        current_period_end: tenant.subscription?.currentPeriodEnd,
        access_until: tenant.access_expires_at
      }
    });

    const accessUntilDate = tenant.subscription.currentPeriodEnd || tenant.access_expires_at;

    res.json({
      success: true,
      message: 'Subscription auto-renewal has been stopped. Access remains active until the end of your billing cycle.',
      cancelAtPeriodEnd: true,
      accessUntil: accessUntilDate ? accessUntilDate.toISOString().split('T')[0] : null
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/billing/portal (alias for subscription manage link)
 */
router.get('/portal', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const tenant = await Tenant.findOne({ company_id }).lean();
    const subscriptionCode = tenant?.subscription?.paystackSubscriptionCode || tenant?.subscription?.subscriptionCode;

    if (!subscriptionCode || !paystack.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'No active Paystack subscription code found for self-service portal.'
      });
    }

    const manageUrl = await paystack.generateSubscriptionManageLink(subscriptionCode);
    if (!manageUrl) {
      return res.status(503).json({
        success: false,
        error: 'LINK_UNAVAILABLE',
        message: 'Paystack subscription management link is currently unavailable.'
      });
    }

    res.json({
      success: true,
      url: manageUrl
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/billing/admin/refund/:tenantId
 * Admin-only endpoint to issue full or partial refunds against a recorded transaction reference
 */
router.post('/admin/refund/:tenantId', async (req, res, next) => {
  try {
    if (!req.sessionData?.isSystemSuperAdmin && req.sessionData?.role !== 'super_admin') {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Super Admin credentials required for refund issuance'
      });
    }

    const { tenantId } = req.params;
    const { transactionReference, amountInPesewas, customerNote, merchantNote } = req.body;

    if (!transactionReference) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_TRANSACTION_REFERENCE',
        message: 'transactionReference is required for refund processing'
      });
    }

    const tenant = await Tenant.findOne({ company_id: tenantId });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const refundData = await paystack.createRefund({
      transactionReference,
      amountInPesewas: amountInPesewas ? Number(amountInPesewas) : undefined,
      customerNote,
      merchantNote
    });

    await AuditLog.append({
      company_id: tenantId,
      actor_user_id: req.sessionData.user_id,
      actor_role: req.sessionData.role,
      event_type: 'tenant_state_changed',
      event_payload: {
        action: 'admin_refund_issued',
        tenantId,
        transactionReference,
        amountInPesewas,
        refund_reference: refundData?.reference,
        status: refundData?.status
      }
    });

    res.json({
      success: true,
      message: 'Refund requested with Paystack successfully. Refund status is pending telco/banking reconciliation.',
      refund: refundData
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
