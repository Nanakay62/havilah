'use strict';

const Tenant = require('../models/Tenant');
const Referral = require('../models/Referral');
const Assessor = require('../models/Assessor');
const AuditLog = require('../models/AuditLog');
const { withTransaction } = require('../utils/dbTransaction');
const { sendClinicalDispatch, sendMail } = require('../utils/emailService');
const logger = require('../utils/logger');

const CONSULTATION_FEE_GHS = 349;
const CONSULTATION_FEE_PESEWAS = 34900;
const WELCOME_DISCOUNT_CONSULTATION_FEE_GHS = 199;
const WELCOME_DISCOUNT_CONSULTATION_FEE_PESEWAS = 19900;

const TIERS = {
  free: {
    tier: 'free',
    accountType: 'company',
    name: 'Free (Community)',
    seats: 10,
    priceMonthlyGhs: 0,
    intervalDays: 30,
    planCode: null,
    features: [
      'Standard psychosocial hazard logging',
      '1 HR Administrator account',
      'Up to 10 active employees',
      'Hardcoded privacy shield (N >= 5)',
      'Core COPSOQ-III screening'
    ]
  },
  personal: {
    tier: 'personal',
    accountType: 'individual',
    name: 'Personal Monthly',
    seats: 1,
    priceMonthlyGhs: 150,
    priceGhs: 150,
    intervalDays: 30,
    planCode: process.env.PAYSTACK_PLAN_PERSONAL || null,
    features: [
      'Full COPSOQ-III, PHQ-9, GAD-7, PSS-10 & FAS-10 self-screenings',
      'Daily Pulse & personal wellbeing trends',
      'GDPR / personal data export',
      'One-time GHS 150 credit toward your first clinician consultation (GHS 199 vs. GHS 349)'
    ]
  },
  personal_annual: {
    tier: 'personal_annual',
    accountType: 'individual',
    name: 'Personal Annual',
    seats: 1,
    priceMonthlyGhs: 1500,
    priceGhs: 1500,
    intervalDays: 365,
    planCode: process.env.PAYSTACK_PLAN_PERSONAL_ANNUAL || null,
    features: [
      'Everything in Personal Monthly (2 months free)',
      '1 complimentary Welcome Clinician Consultation (+ Excuse Duty if clinically indicated)',
      'Priority personal wellbeing insights & exports'
    ]
  },
  starter: {
    tier: 'starter',
    accountType: 'company',
    name: 'Starter Tier',
    seats: 100,
    priceMonthlyGhs: 5500,
    intervalDays: 30,
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
    accountType: 'company',
    name: 'Professional Tier (ISO 45003 Standard)',
    seats: 999999,
    priceMonthlyGhs: 15450,
    intervalDays: 30,
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
    accountType: 'company',
    name: 'Enterprise Tier',
    seats: 999999,
    priceMonthlyGhs: 35000,
    intervalDays: 30,
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

function getPaystackPlanCode(data) {
  if (!data) return null;
  if (typeof data.plan === 'string' && data.plan.trim()) return data.plan.trim();
  if (data.plan && typeof data.plan.plan_code === 'string' && data.plan.plan_code.trim()) {
    return data.plan.plan_code.trim();
  }
  if (data.plan_object && typeof data.plan_object.plan_code === 'string' && data.plan_object.plan_code.trim()) {
    return data.plan_object.plan_code.trim();
  }
  return null;
}

function isValidPaystackTierPayment(data, tierConfig) {
  if (!data || !tierConfig || tierConfig.tier === 'free') return false;
  const planCode = getPaystackPlanCode(data);
  const configuredPlanCode = tierConfig.planCode || process.env[`PAYSTACK_PLAN_${tierConfig.tier.toUpperCase()}`] || null;
  if (configuredPlanCode && planCode && planCode === configuredPlanCode) {
    return true;
  }
  const currency = String(data.currency || 'GHS').toUpperCase();
  const basePriceGhs = tierConfig.priceGhs ?? tierConfig.priceMonthlyGhs;
  const expectedMinPesewas = Math.round(basePriceGhs * 100);
  return currency === 'GHS' && Number(data.amount || 0) >= expectedMinPesewas;
}

/**
 * Idempotently activates or renews a subscription for a Tenant from a verified Paystack transaction.
 */
async function activateSubscriptionFromPaystack({ tenant, tierKey, tierConfig, data, reference, actorId = 'SYSTEM_PAYSTACK_WEBHOOK', actorRole = 'system' }) {
  const intervalDays = tierConfig.intervalDays || 30;
  const nextPeriodEnd = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000);
  const isIndividual = tenant.account_type === 'individual';

  const updateSet = {
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
    access_expires_at: isIndividual ? null : nextPeriodEnd,
  };

  if (isIndividual && !tenant.subscription?.welcomeConsultationUsed) {
    if (tierKey === 'personal_annual') {
      updateSet['subscription.welcomeConsultationBenefit'] = 'free_one';
    } else if (tierKey === 'personal' && tenant.subscription?.welcomeConsultationBenefit !== 'free_one') {
      updateSet['subscription.welcomeConsultationBenefit'] = 'discount_150';
    }
  }

  await withTransaction(async (dbSession) => {
    await Tenant.findOneAndUpdate(
      {
        company_id: tenant.company_id,
        'subscription.transactionReferences': { $ne: reference },
      },
      {
        $set: updateSet,
        $addToSet: {
          'subscription.transactionReferences': reference,
        },
      },
      { session: dbSession || undefined }
    );

    await AuditLog.append(
      {
        company_id: tenant.company_id,
        actor_user_id: actorId,
        actor_role: actorRole,
        event_type: 'tenant_state_changed',
        event_payload: {
          previous_state: tenant.lifecycle_state,
          new_state: 'active',
          billing_tier: tierKey,
          paystack_reference: reference,
          currency: 'GHS',
          amount_pesewas: data.amount,
        },
      },
      { session: dbSession || undefined }
    );
  });

  return nextPeriodEnd;
}

/**
 * Idempotently activates an awaiting_payment consultation referral after Paystack payment verification.
 */
async function activateConsultationFromPaystack({ referralId, reference, data }) {
  if (!referralId) return { ok: false, reason: 'MISSING_REFERRAL_ID' };
  const referral = await Referral.findById(referralId);
  if (!referral) return { ok: false, reason: 'REFERRAL_NOT_FOUND' };

  if (referral.billing?.paystackReference === reference && referral.status !== 'awaiting_payment') {
    return { ok: true, alreadyApplied: true, referral };
  }

  const currency = String(data?.currency || 'GHS').toUpperCase();
  const minPesewas = referral.billing?.expectedAmountPesewas || CONSULTATION_FEE_PESEWAS;
  if (currency !== 'GHS' || Number(data?.amount || 0) < minPesewas) {
    return { ok: false, reason: 'AMOUNT_MISMATCH', expected: minPesewas, received: data?.amount };
  }

  const amountGhs = Math.round(Number(data.amount)) / 100;
  const updated = await Referral.findOneAndUpdate(
    { _id: referral._id, status: 'awaiting_payment' },
    {
      $set: {
        status: 'pending',
        'billing.amount': amountGhs,
        'billing.currency': 'GHS',
        'billing.isBilled': true,
        'billing.billedAt': new Date(),
        'billing.settlementStatus': 'settled',
        'billing.settledAt': new Date(),
        'billing.paystackReference': reference,
      },
    },
    { new: true }
  );

  if (!updated) {
    const current = await Referral.findById(referral._id);
    if (current && current.billing?.paystackReference === reference) {
      return { ok: true, alreadyApplied: true, referral: current };
    }
    return { ok: false, reason: 'ALREADY_ACTIVATED' };
  }

  if (updated.billing?.payerType === 'welcome_discount' && updated.company_id) {
    await Tenant.updateOne(
      { company_id: updated.company_id },
      { $set: { 'subscription.welcomeConsultationUsed': true } }
    ).catch((err) => logger.warn({ err: err.message }, '[BillingActivation] Failed to mark welcomeConsultationUsed'));
  }

  // Dispatch assessor notification & guest tracking email non-blockingly
  try {
    const assessor = await Assessor.findById(updated.assignedAssessorId).lean();
    let targetEmail = assessor?.notificationEmail || assessor?.email;
    if (!targetEmail || targetEmail.includes('@clinic.com') || targetEmail.includes('.test@')) {
      targetEmail = process.env.CLINICAL_INTAKE_EMAIL || process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'clarke.edith@gmail.com';
    }
    const labelMap = {
      guest_pay: 'Guest Consultation (Paid)',
      welcome_discount: 'Individual (Welcome Credit)',
      self_pay: 'Private Self-Pay Consultation',
    };
    await sendClinicalDispatch({
      referenceCode: updated.referenceCode,
      companyName: labelMap[updated.billing?.payerType] || 'Individual Consultation',
      to: targetEmail,
      priority: updated.priority || 'standard',
    });

    if (updated.billing?.payerType === 'guest_pay' && updated.clinicalDetails?.patientContact) {
      const trackUrl = data?.metadata?.track_url || '';
      const linkHtml = trackUrl ? `<p><a href="${trackUrl}">Open your private Consultation Room &amp; Download Link</a></p>` : '';
      await sendMail({
        to: updated.clinicalDetails.patientContact,
        subject: `[Havilah] Consultation Confirmed (${updated.referenceCode})`,
        html: `<p>Your payment of GHS ${amountGhs.toFixed(2)} for a Havilah clinical consultation has been confirmed.</p><p><strong>Reference Code:</strong> ${updated.referenceCode}</p>${linkHtml}<p>Our assigned medical assessor will message or schedule your session shortly. If clinically indicated after your consultation, your verifiable Digital Excuse Duty certificate will appear in your consultation room.</p>`,
      }).catch(() => {});
    }
  } catch (err) {
    logger.warn({ err: err.message, referralId }, '[BillingActivation] Notification warning');
  }

  return { ok: true, alreadyApplied: false, referral: updated };
}

module.exports = {
  CONSULTATION_FEE_GHS,
  CONSULTATION_FEE_PESEWAS,
  WELCOME_DISCOUNT_CONSULTATION_FEE_GHS,
  WELCOME_DISCOUNT_CONSULTATION_FEE_PESEWAS,
  TIERS,
  getPaystackPlanCode,
  isValidPaystackTierPayment,
  activateSubscriptionFromPaystack,
  activateConsultationFromPaystack,
};
