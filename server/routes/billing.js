'use strict';

const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Referral = require('../models/Referral');
const AssessmentCycle = require('../models/AssessmentCycle');
const AuditLog = require('../models/AuditLog');
const { validateSession, requireRole } = require('../middleware/auth');
const { requireCompanyTenant } = require('../middleware/tierGate');
const logger = require('../utils/logger');
const { withTransaction } = require('../utils/dbTransaction');
const paystack = require('../utils/paystack');
const crypto = require('crypto');
const { sendMail } = require('../utils/emailService');
const { resolveAppBaseUrl } = require('../utils/runtimeConfig');
const { decryptField } = require('../utils/crypto');
const {
  CONSULTATION_FEE_GHS,
  WELCOME_DISCOUNT_CONSULTATION_FEE_GHS,
  TIERS,
  getPaystackPlanCode,
  isValidPaystackTierPayment,
  activateSubscriptionFromPaystack,
  activateConsultationFromPaystack,
} = require('../services/billingActivation');

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
        const paymentType = String(data.metadata?.type || '').toLowerCase();

        if (paymentType === 'consultation' || paymentType === 'guest_consultation') {
          const result = await activateConsultationFromPaystack({
            referralId: data.metadata?.referral_id,
            reference,
            data,
          });
          if (!result.ok) {
            logger.warn({ reference, result }, '[Paystack Webhook] Consultation activation skipped/failed');
          } else if (result.alreadyApplied) {
            return res.status(200).json({ received: true, duplicate: true });
          } else {
            logger.info({ reference, referralId: data.metadata?.referral_id, paymentType }, '[Paystack Webhook] Consultation activated via charge.success');
          }
          break;
        }

        const companyId = data.metadata?.company_id;
        const planCode = getPaystackPlanCode(data);
        const planMatchedTier = planCode
          ? Object.values(TIERS).find((t) => {
              const code = t.planCode || process.env[`PAYSTACK_PLAN_${t.tier.toUpperCase()}`];
              return code && code === planCode;
            })?.tier
          : null;
        const tierKey = (data.metadata?.tier || planMatchedTier || 'pro').toLowerCase();
        const tierConfig = TIERS[tierKey];

        if (!companyId) {
          logger.warn({ reference }, '[Paystack Webhook] charge.success missing metadata.company_id');
          break;
        }

        if (!tierConfig || tierKey === 'free' || !isValidPaystackTierPayment(data, tierConfig)) {
          logger.warn(
            { reference, companyId, tierKey, amount: data.amount, currency: data.currency, planCode },
            '[Paystack Webhook] charge.success failed tier/amount/plan validation'
          );
          break;
        }

        const tenant = await Tenant.findOne({ company_id: companyId });
        if (!tenant) {
          logger.warn({ companyId }, '[Paystack Webhook] Tenant not found for charge.success');
          break;
        }

        const expectedAccountType = tierConfig.accountType || 'company';
        const actualAccountType = tenant.account_type || 'company';
        if (actualAccountType !== expectedAccountType) {
          logger.warn({ companyId, actualAccountType, expectedAccountType, tierKey }, '[Paystack Webhook] Tier account_type mismatch');
          break;
        }

        // Idempotency check: Skip duplicate event deliveries
        const priorRefs = tenant.subscription?.transactionReferences || [];
        if (reference && priorRefs.includes(reference)) {
          logger.info({ reference, companyId }, '[Paystack Webhook] Duplicate charge.success event ignored');
          return res.status(200).json({ received: true, duplicate: true });
        }

        const nextPeriodEnd = await activateSubscriptionFromPaystack({
          tenant,
          tierKey,
          tierConfig,
          data,
          reference,
        });

        await AssessmentCycle.updateMany(
          {
            company_id: companyId,
            status: 'unlocked',
            deadline: { $lt: new Date() }
          },
          {
            $set: { deadline: nextPeriodEnd }
          }
        ).catch(() => {});

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
// Protected Billing Endpoints
// ---------------------------------------------------------------------------
router.use(validateSession);

const requireBillingManager = requireRole('individual', 'hr_admin', 'tenant_admin', 'super_admin');
const requireCompanyBillingAdmin = [requireCompanyTenant, requireRole('hr_admin', 'tenant_admin', 'super_admin')];
const requireConsultationUser = requireRole('individual', 'employee', 'hr_admin', 'tenant_admin', 'super_admin');

/**
 * GET /api/v1/billing/status
 * Returns current tenant tier, status, seat utilization, and available upgrade tiers
 */
router.get('/status', requireBillingManager, async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const tenant = await Tenant.findOne({ company_id });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const accountType = tenant.account_type || 'company';
    const sub = tenant.subscription || {};
    const tier = sub.tier || tenant.billing_tier || 'trial';
    const status = sub.status || 'trialing';
    const effectiveTier = typeof tenant.getEffectiveTier === 'function' ? tenant.getEffectiveTier() : tier;
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

    const filteredAvailableTiers = Object.fromEntries(
      Object.entries(TIERS).filter(([, cfg]) => (cfg.accountType || 'company') === (accountType === 'individual' ? 'individual' : 'company'))
    );

    res.json({
      success: true,
      company_id,
      company_name: tenant.company_name,
      account_type: accountType,
      currency: 'GHS',
      consultation_fee_ghs: CONSULTATION_FEE_GHS,
      welcome_discount_fee_ghs: WELCOME_DISCOUNT_CONSULTATION_FEE_GHS,
      subscription: {
        tier,
        effective_tier: effectiveTier,
        status,
        is_active: isActive,
        cancel_at_period_end: cancelAtPeriodEnd,
        days_remaining: daysRemaining,
        trial_ends_at: trialEndsAt,
        current_period_end: currentPeriodEnd,
        used_seats: tenant.used_seats || 0,
        max_allowed_seats: tenant.max_allowed_seats || 100,
        welcome_consultation_benefit: sub.welcomeConsultationBenefit || 'none',
        welcome_consultation_used: Boolean(sub.welcomeConsultationUsed),
        has_paystack_customer: !!(sub.paystackCustomerCode || sub.customerId),
        has_paystack_subscription: !!(sub.paystackSubscriptionCode || sub.subscriptionCode),
        transaction_count: (sub.transactionReferences || []).length,
        extension_request: sub.extensionRequest || { status: 'none' },
        invoices: accountType === 'individual' ? [] : (sub.invoices || []).slice(-20).reverse(),
        paystack_configured: paystack.isConfigured()
      },
      current_tier_details: TIERS[tier] || null,
      available_tiers: filteredAvailableTiers
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
    const { company_id, email, user_id } = req.sessionData;
    const { tier = 'pro', callback_url } = req.body;

    const tierKey = String(tier || '').toLowerCase();
    const tierConfig = TIERS[tierKey];
    if (!tierConfig || tierKey === 'free') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TIER',
        message: `Invalid tier '${tier}'. Valid paid options: personal, personal_annual, starter, pro, enterprise`
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

    const actualAccountType = tenant.account_type || 'company';
    const expectedAccountType = tierConfig.accountType || 'company';
    if (actualAccountType !== expectedAccountType) {
      return res.status(403).json({
        success: false,
        error: 'TIER_ACCOUNT_TYPE_MISMATCH',
        message: actualAccountType === 'individual'
          ? 'Individual accounts can only subscribe to Personal plans (personal, personal_annual).'
          : 'Organization accounts cannot subscribe to Personal B2C plans.'
      });
    }

    let payerEmail = email || tenant.admin_email || '';
    if (!payerEmail && user_id) {
      try {
        const u = await User.findOne({ user_id }).select('email_encrypted').lean();
        if (u?.email_encrypted) {
          const enc = typeof u.email_encrypted === 'string' ? JSON.parse(u.email_encrypted) : u.email_encrypted;
          payerEmail = decryptField(enc);
        }
      } catch (_) {}
    }
    if (!payerEmail) {
      payerEmail = `billing-${company_id.slice(0, 8)}@wellframe.internal`;
    }

    const defaultCallback = actualAccountType === 'individual'
      ? `${resolveAppBaseUrl(req)}/app/dashboard.html?checkout=success`
      : `${resolveAppBaseUrl(req)}/dashboard?checkout=success`;
    const priceGhs = tierConfig.priceGhs ?? tierConfig.priceMonthlyGhs;
    const amountInPesewas = Math.round(priceGhs * 100);

    const transactionData = await paystack.initializeTransaction({
      email: payerEmail,
      amountInPesewas,
      planCode: tierConfig.planCode,
      callbackUrl: callback_url || defaultCallback,
      metadata: {
        company_id,
        tier: tierConfig.tier,
        account_type: actualAccountType,
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

// POST /api/v1/billing/request-invoice - Generate corporate proforma invoice for bank/EFT/cheque billing
router.post('/request-invoice', ...requireCompanyBillingAdmin, async (req, res, next) => {
  try {
    const { company_id, user_id, role } = req.sessionData;
    const { tier = 'pro', interval = 'annual', poNumber = '', billingEmail = '', notes = '' } = req.body;
    const tierKey = String(tier).toLowerCase();
    const tierConfig = TIERS[tierKey];

    if (!tierConfig || tierKey === 'free') {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TIER',
        message: 'Valid paid subscription tier (starter, pro, or enterprise) is required for invoicing.'
      });
    }

    const billingInterval = String(interval).toLowerCase() === 'monthly' ? 'monthly' : 'annual';
    const amountGhs = billingInterval === 'annual'
      ? Math.round(tierConfig.priceMonthlyGhs * 12 * 0.85)
      : tierConfig.priceMonthlyGhs;

    const tenant = await Tenant.findOne({ company_id });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'TENANT_NOT_FOUND' });
    }

    const invoiceNumber = `INV-HAV-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const dueAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
    const invoice = {
      invoiceNumber,
      tier: tierKey,
      interval: billingInterval,
      amountGhs,
      status: 'pending',
      poNumber: String(poNumber || '').trim().slice(0, 80),
      billingEmail: String(billingEmail || tenant.contact_email || '').trim(),
      notes: String(notes || '').trim().slice(0, 400),
      issuedAt: new Date(),
      dueAt
    };

    if (!tenant.subscription) tenant.subscription = {};
    if (!Array.isArray(tenant.subscription.invoices)) tenant.subscription.invoices = [];
    tenant.subscription.invoices.push(invoice);
    await tenant.save();

    await AuditLog.append({
      company_id,
      actor_user_id: user_id,
      actor_role: role,
      event_type: 'tenant_state_changed',
      event_payload: {
        action: 'proforma_invoice_requested',
        invoiceNumber,
        tier: tierKey,
        interval: billingInterval,
        amountGhs
      }
    }).catch(() => {});

    const recipient = invoice.billingEmail || tenant.contact_email;
    if (recipient) {
      await sendMail({
        to: recipient,
        subject: `Havilah Proforma Invoice ${invoiceNumber} (${tierConfig.name})`,
        html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #e2e8f0;border-radius:10px;">
          <h2 style="margin-top:0;color:#0f172a;">Proforma Invoice: ${invoiceNumber}</h2>
          <p><strong>Organization:</strong> ${tenant.company_name}</p>
          <p><strong>Plan:</strong> ${tierConfig.name} (${billingInterval})</p>
          <p><strong>Amount Due:</strong> GHS ${amountGhs.toLocaleString()}</p>
          <p><strong>Due Date:</strong> ${dueAt.toDateString()}</p>
          ${invoice.poNumber ? `<p><strong>PO Reference:</strong> ${invoice.poNumber}</p>` : ''}
          <p style="font-size:13px;color:#475569;">Please quote <strong>${invoiceNumber}</strong> on your bank transfer or cheque settlement. Access activates upon confirmation by Havilah Finance / Super Admin.</p>
        </div>`
      }).catch(() => {});
    }

    return res.status(201).json({
      success: true,
      invoice,
      message: `Proforma invoice ${invoiceNumber} generated successfully.`
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/billing/invoices
router.get('/invoices', ...requireCompanyBillingAdmin, async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const tenant = await Tenant.findOne({ company_id }).select('subscription.invoices company_name').lean();
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'TENANT_NOT_FOUND' });
    }
    const invoices = [...(tenant.subscription?.invoices || [])].reverse();
    return res.json({ success: true, invoices });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/billing/request-extension - HR requests trial extension
router.post('/request-extension', ...requireCompanyBillingAdmin, async (req, res, next) => {
  try {
    const { company_id, user_id, role } = req.sessionData;
    const { requestedDays = 14, reason = '' } = req.body;
    const days = Math.min(30, Math.max(7, Number(requestedDays) || 14));

    const tenant = await Tenant.findOne({ company_id });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'TENANT_NOT_FOUND' });
    }

    if (!tenant.subscription) tenant.subscription = {};
    tenant.subscription.extensionRequest = {
      status: 'pending',
      requestedDays: days,
      reason: String(reason || '').trim().slice(0, 500),
      requestedBy: user_id,
      requestedAt: new Date(),
      resolvedAt: null,
      resolvedBy: null
    };
    await tenant.save();

    await AuditLog.append({
      company_id,
      actor_user_id: user_id,
      actor_role: role,
      event_type: 'tenant_state_changed',
      event_payload: {
        action: 'trial_extension_requested',
        requestedDays: days,
        reason: tenant.subscription.extensionRequest.reason
      }
    }).catch(() => {});

    const notifyTo = process.env.SUPERADMIN_EMAIL || process.env.SUPPORT_EMAIL || '';
    if (notifyTo) {
      await sendMail({
        to: notifyTo,
        subject: `[Havilah] Trial Extension Request - ${tenant.company_name} (+${days}d)`,
        html: `<p><strong>${tenant.company_name}</strong> (${company_id}) requested a <strong>${days}-day</strong> trial extension.</p><p>Reason: ${tenant.subscription.extensionRequest.reason || 'Not provided'}</p>`
      }).catch(() => {});
    }

    return res.json({
      success: true,
      extension_request: tenant.subscription.extensionRequest,
      message: `Extension request for ${days} days submitted to platform administration.`
    });
  } catch (err) {
    next(err);
  }
});

router.post('/initialize', requireBillingManager, handleInitializePayment);
router.post('/create-checkout-session', requireBillingManager, handleInitializePayment);

/**
 * GET /api/v1/billing/verify/:reference
 * Verifies transaction with Paystack immediately on return redirect for fast UI feedback
 */
router.get('/verify/:reference', requireBillingManager, async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { company_id } = req.sessionData;

    if (!paystack.isConfigured()) {
      return res.status(503).json({ success: false, error: 'BILLING_DISABLED' });
    }

    if (!reference || typeof reference !== 'string' || !reference.trim()) {
      return res.status(400).json({ success: false, error: 'INVALID_REFERENCE' });
    }

    const cleanRef = reference.trim();

    // Prevent cross-tenant replay or double-redemption of an already recorded Paystack reference
    const existingHolder = await Tenant.findOne({ 'subscription.transactionReferences': cleanRef })
      .select('company_id subscription.transactionReferences')
      .lean();
    const isAlreadyRecorded = Boolean(
      existingHolder &&
      Array.isArray(existingHolder.subscription?.transactionReferences) &&
      existingHolder.subscription.transactionReferences.includes(cleanRef)
    );
    if (isAlreadyRecorded && String(existingHolder.company_id) !== String(company_id)) {
      return res.status(403).json({
        success: false,
        error: 'REFERENCE_ALREADY_REDEEMED',
        message: 'This payment reference belongs to another organization.',
      });
    }

    const data = await paystack.verifyTransaction(cleanRef);

    if (data.status === 'success') {
      // Strictly bind verified payment metadata to the authenticated caller's tenant
      const metaCompanyId = data.metadata?.company_id;
      if (!metaCompanyId || String(metaCompanyId) !== String(company_id)) {
        return res.status(403).json({
          success: false,
          error: 'TENANT_MISMATCH',
          message: 'Transaction tenant metadata does not match your workspace.',
        });
      }

      const tierKey = String(data.metadata?.tier || '').toLowerCase();
      const tierConfig = TIERS[tierKey];
      if (!tierConfig || tierKey === 'free') {
        return res.status(400).json({
          success: false,
          error: 'INVALID_TIER',
          message: 'Verified transaction does not specify a valid paid subscription tier.',
        });
      }

      const tenant = await Tenant.findOne({ company_id });
      if (!tenant) {
        return res.status(404).json({ success: false, error: 'Tenant not found' });
      }
      if ((tenant.account_type || 'company') !== (tierConfig.accountType || 'company')) {
        return res.status(403).json({
          success: false,
          error: 'TIER_ACCOUNT_TYPE_MISMATCH',
          message: 'Subscription tier does not match account type.',
        });
      }

      if (!isValidPaystackTierPayment(data, tierConfig)) {
        return res.status(400).json({
          success: false,
          error: 'AMOUNT_MISMATCH',
          message: 'Verified transaction amount is below the required plan price.',
        });
      }

      if (isAlreadyRecorded) {
        return res.json({
          success: true,
          status: data.status,
          reference: data.reference,
          amount: data.amount,
          currency: data.currency,
          already_applied: true,
        });
      }

      const nextPeriodEnd = await activateSubscriptionFromPaystack({
        tenant,
        tierKey,
        tierConfig,
        data,
        reference: cleanRef,
        actorId: req.sessionData.user_id || 'BILLING_VERIFY',
        actorRole: req.sessionData.role || 'system',
      });

      await AssessmentCycle.updateMany(
        {
          company_id,
          status: 'unlocked',
          deadline: { $lt: new Date() }
        },
        {
          $set: { deadline: nextPeriodEnd }
        }
      ).catch(() => {});
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
 * POST /api/v1/billing/consultation/checkout
 * Initializes a one-off Paystack checkout for an awaiting_payment consultation (GHS 349 or GHS 199 welcome discount)
 */
router.post('/consultation/checkout', requireConsultationUser, async (req, res, next) => {
  try {
    const { company_id, user_id, email } = req.sessionData;
    const { referralId, callback_url } = req.body || {};

    if (!referralId) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'referralId is required.',
      });
    }

    if (!paystack.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'BILLING_DISABLED',
        message: 'Paystack payments are not configured in this environment.',
      });
    }

    const referral = await Referral.findOne({ _id: referralId, company_id });
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Consultation request not found.' });
    }
    if (referral.billing?.payerUserId && referral.billing.payerUserId !== user_id) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'You can only pay for your own consultation request.' });
    }
    if (referral.status !== 'awaiting_payment') {
      return res.status(400).json({ success: false, error: 'ALREADY_PAID', message: 'This consultation does not require payment.' });
    }

    let payerEmail = email || referral.clinicalDetails?.patientContact || '';
    if (!payerEmail && user_id) {
      try {
        const u = await User.findOne({ user_id }).select('email_encrypted').lean();
        if (u?.email_encrypted) {
          const enc = typeof u.email_encrypted === 'string' ? JSON.parse(u.email_encrypted) : u.email_encrypted;
          payerEmail = decryptField(enc);
        }
      } catch (_) {}
    }
    if (!payerEmail || !payerEmail.includes('@')) {
      payerEmail = `consult-${user_id.slice(0, 8)}@wellframe.internal`;
    }

    const amountInPesewas = referral.billing?.expectedAmountPesewas || (CONSULTATION_FEE_GHS * 100);
    const defaultCallback = `${resolveAppBaseUrl(req)}/app/dashboard.html?consult_checkout=success&ref=${encodeURIComponent(referral.referenceCode)}`;

    const transactionData = await paystack.initializeTransaction({
      email: payerEmail,
      amountInPesewas,
      callbackUrl: callback_url || defaultCallback,
      metadata: {
        type: 'consultation',
        referral_id: String(referral._id),
        reference_code: referral.referenceCode,
        company_id,
        user_id,
      },
      channels: ['card', 'mobile_money'],
    });

    return res.json({
      success: true,
      authorization_url: transactionData.authorization_url,
      access_code: transactionData.access_code,
      reference: transactionData.reference,
      amountGhs: amountInPesewas / 100,
      referenceCode: referral.referenceCode,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/billing/consultation/verify/:reference
 * Verifies a one-off consultation payment upon Paystack return redirect
 */
router.get('/consultation/verify/:reference', requireConsultationUser, async (req, res, next) => {
  try {
    const { reference } = req.params;
    const { user_id } = req.sessionData;

    if (!paystack.isConfigured()) {
      return res.status(503).json({ success: false, error: 'BILLING_DISABLED' });
    }

    const cleanRef = String(reference || '').trim();
    if (!cleanRef) {
      return res.status(400).json({ success: false, error: 'INVALID_REFERENCE' });
    }

    const data = await paystack.verifyTransaction(cleanRef);
    if (data.status !== 'success') {
      return res.status(402).json({ success: false, error: 'PAYMENT_NOT_COMPLETED', status: data.status });
    }

    if (data.metadata?.user_id && String(data.metadata.user_id) !== String(user_id)) {
      return res.status(403).json({ success: false, error: 'USER_MISMATCH', message: 'Transaction does not belong to your account.' });
    }

    const result = await activateConsultationFromPaystack({
      referralId: data.metadata?.referral_id,
      reference: cleanRef,
      data,
    });

    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.reason || 'ACTIVATION_FAILED' });
    }

    return res.json({
      success: true,
      status: 'pending',
      reference: cleanRef,
      referenceCode: result.referral.referenceCode,
      already_applied: Boolean(result.alreadyApplied),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/billing/cancel
 * Cancels auto-renewal (sets cancelAtPeriodEnd: true). Does not revoke paid access immediately.
 */
router.post('/cancel', requireBillingManager, async (req, res, next) => {
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
router.get('/portal', requireBillingManager, async (req, res, next) => {
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
