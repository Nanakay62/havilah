'use strict';

const express = require('express');
const router = express.Router();
const Tenant = require('../models/Tenant');
const { validateSession, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

// Stripe initialization (gracefully null if key not set)
let stripe = null;
if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('replace_with')) {
  try {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to initialize Stripe client');
  }
}

// Tier specifications and ISO 45003 feature entitlements
const TIERS = {
  starter: {
    tier: 'starter',
    name: 'Starter Tier',
    seats: 50,
    priceMonthlyUsd: 299,
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_starter_monthly',
    features: [
      'Up to 50 active employee seats',
      'Daily micro pulse check-ins',
      'PHQ-9 & GAD-7 clinical screeners',
      'Basic ISO 45003 hazard logging',
      'Aggregate department analytics (N >= 5)'
    ]
  },
  pro: {
    tier: 'pro',
    name: 'Professional Tier (ISO 45003 Standard)',
    seats: 250,
    priceMonthlyUsd: 799,
    priceId: process.env.STRIPE_PRICE_PRO || 'price_pro_monthly',
    features: [
      'Up to 250 active employee seats',
      'Full COPSOQ III assessment suite (Core, Middle, Long)',
      'Automated ISO 45003 compliance audit trail & PDF export',
      'Empirical Pearson correlation engine (workload vs. burnout)',
      'Longitudinal trend analysis & predictive alerts',
      'Whistleblower encrypted drop-box with HMAC token receipts'
    ]
  },
  enterprise: {
    tier: 'enterprise',
    name: 'Enterprise Tier',
    seats: 1000,
    priceMonthlyUsd: 1999,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise_monthly',
    features: [
      'Unlimited / custom employee seats (starting at 1,000)',
      'Dedicated clinical partner integration & warm handoffs',
      'Custom SSO (SAML 2.0 / Okta / Azure AD)',
      'Multi-entity cross-subsidiary rollup dashboards',
      'Quarterly ISO 45003 compliance auditor sign-off reports',
      'Dedicated compliance engineer & 24/7 SLA'
    ]
  }
};

/**
 * Helper to get active Stripe client or throw
 */
function getStripeClient() {
  if (!stripe && process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('replace_with')) {
    const Stripe = require('stripe');
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return stripe;
}

// ---------------------------------------------------------------------------
// 1. Stripe Webhook (Unauthenticated - uses signature verification)
// ---------------------------------------------------------------------------
router.post('/webhook', async (req, res) => {
  const stripeClient = getStripeClient();
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  let event = req.body;

  if (stripeClient && endpointSecret && !endpointSecret.includes('replace_with')) {
    const sig = req.headers['stripe-signature'];
    try {
      // req.rawBody is captured by express.json({ verify: ... }) in server.js
      const payload = req.rawBody || JSON.stringify(req.body);
      event = stripeClient.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
      logger.warn({ err: err.message }, 'Stripe webhook signature verification failed');
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const companyId = session.client_reference_id || session.metadata?.company_id;
        const tierKey = session.metadata?.tier || 'pro';
        const tierConfig = TIERS[tierKey] || TIERS.pro;

        if (companyId) {
          await Tenant.findOneAndUpdate(
            { company_id: companyId },
            {
              $set: {
                'subscription.tier': tierKey,
                'subscription.status': 'active',
                'subscription.customerId': session.customer,
                'subscription.subscriptionCode': session.subscription,
                'subscription.maxEmployees': tierConfig.seats,
                billing_tier: tierKey === 'pro' ? 'professional' : tierKey,
                max_allowed_seats: tierConfig.seats,
                lifecycle_state: 'active'
              }
            }
          );
          logger.info({ companyId, tier: tierKey }, 'Tenant subscription activated via Stripe checkout');
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const status = sub.status === 'active' ? 'active' : sub.status === 'past_due' ? 'past_due' : 'active';
        const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

        await Tenant.findOneAndUpdate(
          {
            $or: [
              { 'subscription.customerId': sub.customer },
              { 'subscription.subscriptionCode': sub.id }
            ]
          },
          {
            $set: {
              'subscription.status': status,
              'subscription.currentPeriodEnd': periodEnd
            }
          }
        );
        logger.info({ customer: sub.customer, status }, 'Tenant subscription updated');
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        await Tenant.findOneAndUpdate(
          {
            $or: [
              { 'subscription.customerId': sub.customer },
              { 'subscription.subscriptionCode': sub.id }
            ]
          },
          {
            $set: {
              'subscription.status': 'canceled',
              lifecycle_state: 'suspended'
            }
          }
        );
        logger.info({ customer: sub.customer }, 'Tenant subscription canceled');
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        await Tenant.findOneAndUpdate(
          { 'subscription.customerId': invoice.customer },
          {
            $set: {
              'subscription.status': 'past_due'
            }
          }
        );
        logger.warn({ customer: invoice.customer }, 'Tenant invoice payment failed; marked past_due');
        break;
      }

      default:
        // Ignore unhandled event types cleanly
        break;
    }

    res.json({ received: true });
  } catch (err) {
    logger.error({ err: err.message }, 'Error processing Stripe webhook');
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
    const currentPeriodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;

    const now = new Date();
    let daysRemaining = null;
    if (status === 'trialing' && trialEndsAt) {
      daysRemaining = Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    } else if (currentPeriodEnd) {
      daysRemaining = Math.max(0, Math.ceil((currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));
    }

    const isActive = status === 'active' || (status === 'trialing' && (daysRemaining === null || daysRemaining > 0));

    res.json({
      success: true,
      company_id,
      company_name: tenant.company_name,
      subscription: {
        tier,
        status,
        is_active: isActive,
        days_remaining: daysRemaining,
        trial_ends_at: trialEndsAt,
        current_period_end: currentPeriodEnd,
        used_seats: tenant.used_seats || 0,
        max_allowed_seats: tenant.max_allowed_seats || 100,
        has_stripe_customer: !!sub.customerId,
      },
      current_tier_details: TIERS[tier] || null,
      available_tiers: TIERS
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/billing/create-checkout-session
 * Generates a Stripe Checkout Session for subscription upgrades
 */
router.post('/create-checkout-session', async (req, res, next) => {
  try {
    const { company_id, email } = req.sessionData;
    const { tier = 'pro', success_url, cancel_url } = req.body;

    const tierConfig = TIERS[tier.toLowerCase()];
    if (!tierConfig) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_TIER',
        message: `Invalid tier '${tier}'. Valid options: ${Object.keys(TIERS).join(', ')}`
      });
    }

    const stripeClient = getStripeClient();
    if (!stripeClient) {
      return res.status(503).json({
        success: false,
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe payments are not configured. Set STRIPE_SECRET_KEY in server/.env.',
        simulated_upgrade_available: true
      });
    }

    const tenant = await Tenant.findOne({ company_id });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    // Determine customer ID
    let customerId = tenant.subscription?.customerId;
    if (!customerId) {
      const customer = await stripeClient.customers.create({
        email: email || undefined,
        name: tenant.company_name,
        metadata: { company_id }
      });
      customerId = customer.id;
      tenant.subscription = tenant.subscription || {};
      tenant.subscription.customerId = customerId;
      await tenant.save();
    }

    const defaultSuccessUrl = `${req.protocol}://${req.get('host')}/dashboard?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const defaultCancelUrl = `${req.protocol}://${req.get('host')}/dashboard?checkout=canceled`;

    const session = await stripeClient.checkout.sessions.create({
      customer: customerId,
      client_reference_id: company_id,
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Wellframe ${tierConfig.name}`,
              description: `ISO 45003 Mental Health Compliance Platform - ${tierConfig.seats} Seats`
            },
            unit_amount: tierConfig.priceMonthlyUsd * 100,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }
      ],
      metadata: {
        company_id,
        tier: tierConfig.tier
      },
      success_url: success_url || defaultSuccessUrl,
      cancel_url: cancel_url || defaultCancelUrl
    });

    res.json({
      success: true,
      session_id: session.id,
      url: session.url
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/billing/portal
 * Generates a Stripe Customer Portal link to manage active payment methods & subscriptions
 */
router.get('/portal', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const stripeClient = getStripeClient();

    if (!stripeClient) {
      return res.status(503).json({
        success: false,
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe billing portal is not configured in this environment.'
      });
    }

    const tenant = await Tenant.findOne({ company_id }).lean();
    const customerId = tenant?.subscription?.customerId;

    if (!customerId) {
      return res.status(400).json({
        success: false,
        error: 'NO_STRIPE_CUSTOMER',
        message: 'No active Stripe billing profile found for this organization. Upgrade via checkout first.'
      });
    }

    const returnUrl = req.query.return_url || `${req.protocol}://${req.get('host')}/dashboard`;
    const portalSession = await stripeClient.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl
    });

    res.json({
      success: true,
      url: portalSession.url
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
