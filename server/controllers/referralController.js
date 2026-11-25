'use strict';

const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const { randomUUID } = crypto;
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const Referral = require('../models/Referral');
const Assessor = require('../models/Assessor');
const User = require('../models/User');
const { decryptField, hashField } = require('../utils/crypto');
const { validateSession, requireRole } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantIsolation');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');
const { sendClinicalDispatch } = require('../utils/emailService');
const { parseMonthRangeQuery } = require('../utils/dateRangeFilter');
const paystack = require('../utils/paystack');
const { resolveAppBaseUrl } = require('../utils/runtimeConfig');
const {
  CONSULTATION_FEE_GHS,
  CONSULTATION_FEE_PESEWAS,
  WELCOME_DISCOUNT_CONSULTATION_FEE_GHS,
  WELCOME_DISCOUNT_CONSULTATION_FEE_PESEWAS,
  activateConsultationFromPaystack,
} = require('../services/billingActivation');

const GUEST_POOL_COMPANY_ID = '00000000-0000-4000-8000-000000000001';

async function resolveActiveDefaultAssessor() {
  const preferredAssessorEmail = process.env.CLINICAL_INTAKE_EMAIL || process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'clarke.edith@gmail.com';
  return (
    (await Assessor.findOne({ email: preferredAssessorEmail, active: true })) ||
    (await Assessor.findOne({ email: 'dr.clarke@fzsafety.com', active: true })) ||
    (await Assessor.findOne({ active: true, email: { $not: /@clinic\.com$|\.test@/ } })) ||
    (await Assessor.findOne({ active: true }))
  );
}

async function ensureGuestPoolTenant() {
  let tenant = await Tenant.findOne({
    $or: [{ account_type: 'system_guest' }, { slug: 'guest-clinical-pool' }],
  });
  if (!tenant) {
    const assessor = await resolveActiveDefaultAssessor();
    if (!assessor) return null;
    tenant = await Tenant.create({
      company_id: GUEST_POOL_COMPANY_ID,
      company_name: 'Guest Clinical Consultations',
      slug: 'guest-clinical-pool',
      account_type: 'system_guest',
      billing_tier: 'free',
      subscription: { tier: 'free', status: 'active', currency: 'GHS', maxEmployees: 1 },
      max_allowed_seats: 1,
      used_seats: 0,
      lifecycle_state: 'active',
      access_expires_at: null,
      activeAssessorId: assessor._id,
    });
  } else if (!tenant.activeAssessorId) {
    const assessor = await resolveActiveDefaultAssessor();
    if (assessor) {
      tenant.activeAssessorId = assessor._id;
      await tenant.save();
    }
  }
  return tenant;
}

const router = express.Router();

/**
 * Helper to check if a string is a raw UUID or objectId hex string
 */
function isRawUuid(str) {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) || /^[0-9a-f]{24}$/i.test(trimmed);
}

/**
 * Resolves a human-readable department name from UUID / code or session fallback
 */
async function resolveReadableDepartment(rawDept, companyId, sessionData) {
  let candidate = rawDept || sessionData?.department_name || sessionData?.department_id || 'General';
  
  if (typeof candidate === 'string') {
    candidate = candidate.trim();
  }

  // Only perform DB lookup if the candidate is a UUID / ObjectId
  if (isRawUuid(candidate)) {
    if (companyId) {
      try {
        const deptDoc = await Department.findOne({
          $or: [
            { department_id: candidate },
            { _id: candidate },
            { department_code: candidate },
            { company_id: companyId, department_id: candidate },
            { company_id: companyId, department_code: candidate }
          ]
        }).select('name').lean();
        if (deptDoc && deptDoc.name) {
          return deptDoc.name;
        }
      } catch (e) {}
    }
    return 'General';
  }
  
  return candidate || 'General';
}

/**
 * @route   POST /api/v1/referrals/guest-checkout
 * @desc    Public zero-signup Guest Consultation checkout (GHS 349, includes Excuse Duty if clinically warranted)
 * @access  Public (Rate-limited)
 */
router.post('/guest-checkout', sensitiveRateLimiter(10), async (req, res, next) => {
  try {
    const {
      patientName,
      name,
      patientEmail,
      email,
      patientPhone,
      phone,
      preferredTime,
      topic,
      reason,
      notes,
      priority: rawPriorityInput,
      employerName,
      staffId,
      clinicalDisclaimerAccepted,
      callback_url,
    } = req.body || {};

    const cleanName = String(patientName || name || '').trim();
    const cleanEmail = String(patientEmail || email || '').trim().toLowerCase();
    const cleanPhone = String(patientPhone || phone || '').trim();
    const cleanNotes = String(notes || topic || reason || 'Guest Clinical Consultation Request').trim();

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Full name is required.' });
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'A valid email address is required.' });
    }
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'A valid phone / WhatsApp number is required.' });
    }
    if (clinicalDisclaimerAccepted !== true) {
      return res.status(400).json({
        success: false,
        error: 'DISCLAIMER_REQUIRED',
        message: 'Please acknowledge that GHS 349 covers the medical consultation and Excuse Duty is issued only if clinically warranted.',
      });
    }
    if (!paystack.isConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'BILLING_DISABLED',
        message: 'Paystack payments are not configured in this environment.',
      });
    }

    const guestTenant = await ensureGuestPoolTenant();
    if (!guestTenant || !guestTenant.activeAssessorId) {
      return res.status(409).json({
        success: false,
        error: 'NO_ACTIVE_ASSESSOR',
        message: 'No medical assessor is currently available for guest consultations.',
      });
    }

    const rawPriority = String(rawPriorityInput || 'standard').toLowerCase().trim();
    const priority = ['standard', 'urgent', 'crisis'].includes(rawPriority) ? rawPriority : 'standard';
    const referenceCode = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;
    const rawGuestToken = crypto.randomBytes(24).toString('hex');
    const guestAccessTokenHash = hashField(rawGuestToken);
    const intakeSummary = topic && notes ? `${topic} - ${notes}` : cleanNotes;

    const referral = await Referral.create({
      referenceCode,
      company_id: guestTenant.company_id,
      tenantId: guestTenant._id,
      assignedAssessorId: guestTenant.activeAssessorId,
      departmentName: 'Guest Consultation',
      preferredTime: String(preferredTime || 'As soon as available').trim(),
      priority,
      status: 'awaiting_payment',
      guestAccessTokenHash,
      patientProvidedEmployer: {
        name: String(employerName || '').trim().slice(0, 160),
        staffId: String(staffId || '').trim().slice(0, 64),
      },
      billing: {
        amount: CONSULTATION_FEE_GHS,
        currency: 'GHS',
        isBilled: false,
        settlementStatus: 'unbilled',
        payerType: 'guest_pay',
        payerUserId: null,
        expectedAmountPesewas: CONSULTATION_FEE_PESEWAS,
      },
      clinicalDetails: {
        patientName: cleanName,
        patientContact: cleanEmail,
        intakeNotes: `${intakeSummary}\n[Guest Phone: ${cleanPhone}]`,
      },
    });

    const trackUrl = `${resolveAppBaseUrl(req)}/consult?ref=${encodeURIComponent(referenceCode)}&token=${encodeURIComponent(rawGuestToken)}`;
    const transactionData = await paystack.initializeTransaction({
      email: cleanEmail,
      amountInPesewas: CONSULTATION_FEE_PESEWAS,
      callbackUrl: callback_url || trackUrl,
      metadata: {
        type: 'guest_consultation',
        referral_id: String(referral._id),
        reference_code: referenceCode,
        track_url: trackUrl,
      },
      channels: ['card', 'mobile_money'],
    });

    return res.status(201).json({
      success: true,
      authorization_url: transactionData.authorization_url,
      access_code: transactionData.access_code,
      reference: transactionData.reference,
      referenceCode,
      guestToken: rawGuestToken,
      amountGhs: CONSULTATION_FEE_GHS,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/referrals/guest-verify/:reference
 * @desc    Verifies a Guest Consultation Paystack transaction upon return redirect
 * @access  Public (Token-authenticated + Rate-limited)
 */
router.get('/guest-verify/:reference', sensitiveRateLimiter(15), async (req, res, next) => {
  try {
    const cleanRef = String(req.params.reference || '').trim();
    const rawCode = String(req.query.ref || '').trim().toUpperCase();
    const rawToken = String(req.query.token || req.headers['x-guest-token'] || '').trim();

    if (!cleanRef || !rawCode || !rawToken) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'reference, ref, and token are required.' });
    }

    const referral = await Referral.findOne({ referenceCode: rawCode });
    if (!referral || referral.billing?.payerType !== 'guest_pay') {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Guest consultation not found.' });
    }
    if (!referral.guestAccessTokenHash || referral.guestAccessTokenHash !== hashField(rawToken)) {
      return res.status(403).json({ success: false, error: 'INVALID_GUEST_TOKEN', message: 'Invalid consultation access token.' });
    }
    if (!paystack.isConfigured()) {
      return res.status(503).json({ success: false, error: 'BILLING_DISABLED' });
    }

    const data = await paystack.verifyTransaction(cleanRef);
    if (data.status !== 'success') {
      return res.status(402).json({ success: false, error: 'PAYMENT_NOT_COMPLETED', status: data.status });
    }
    if (String(data.metadata?.referral_id || '') !== String(referral._id)) {
      return res.status(403).json({ success: false, error: 'REFERRAL_MISMATCH', message: 'Payment does not match this consultation.' });
    }

    const result = await activateConsultationFromPaystack({
      referralId: referral._id,
      reference: cleanRef,
      data,
    });
    if (!result.ok) {
      return res.status(400).json({ success: false, error: result.reason || 'ACTIVATION_FAILED' });
    }

    return res.json({
      success: true,
      status: 'pending',
      referenceCode: referral.referenceCode,
      already_applied: Boolean(result.alreadyApplied),
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/referrals/occupational-health
 * @desc    Submit a confidential occupational health referral (or initiate self-pay / welcome benefit flow)
 * @access  Authenticated (Employee / Individual / Tenant User)
 */
router.post(
  '/occupational-health',
  validateSession,
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;
      const userId = req.sessionData?.user_id || null;

      // Validate required fields
      const rawPatientName = req.body.patientName || req.body.name;
      const rawPatientContact = req.body.patientContact || req.body.patientEmail || req.body.contact_info;

      if (!rawPatientName || typeof rawPatientName !== 'string' || !rawPatientName.trim() ||
          !rawPatientContact || typeof rawPatientContact !== 'string' || !rawPatientContact.trim()) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Patient name and contact information are required.',
        });
      }

      const patientName = rawPatientName.trim();
      const patientContact = rawPatientContact.trim();
      const employerName = String(req.body.employerName || '').trim().slice(0, 160);
      const staffId = String(req.body.staffId || '').trim().slice(0, 64);

      // Look up the caller's tenant and active assessor
      const tenant = await Tenant.findOne({
        $or: [
          { company_id: companyId },
          ...(mongoose.isValidObjectId(companyId) ? [{ _id: companyId }] : [])
        ]
      });

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'Tenant organization not found.',
        });
      }

      if (!tenant.activeAssessorId) {
        const defaultAssessor = await resolveActiveDefaultAssessor();
        if (defaultAssessor) {
          tenant.activeAssessorId = defaultAssessor._id;
          await tenant.save();
        } else {
          return res.status(409).json({
            success: false,
            error: 'NO_ACTIVE_ASSESSOR',
            message: 'No medical assessor is currently assigned to this workspace.',
          });
        }
      }

      const referenceCode = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;

      // Determine consultation payer path
      const accountType = tenant.account_type || 'company';
      const effectiveTier = typeof tenant.getEffectiveTier === 'function'
        ? tenant.getEffectiveTier()
        : ((!tenant.subscription && !tenant.billing_tier) ? 'pro' : (tenant.subscription?.tier || tenant.billing_tier || 'free'));

      let initialStatus = 'pending';
      let payerType = 'company_covered';
      let expectedAmountPesewas = 0;
      let billingAmount = 0;
      let isBilled = false;
      let settlementStatus = 'unbilled';

      if (accountType === 'individual') {
        const sub = tenant.subscription || {};
        const periodEnd = sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null;
        const isPaidActive = (sub.status === 'active' || (periodEnd && new Date() < periodEnd)) &&
          ['personal', 'personal_annual'].includes(sub.tier);

        if (isPaidActive && !sub.welcomeConsultationUsed) {
          if (sub.welcomeConsultationBenefit === 'free_one') {
            const claimed = await Tenant.findOneAndUpdate(
              { company_id: tenant.company_id, 'subscription.welcomeConsultationUsed': { $ne: true } },
              { $set: { 'subscription.welcomeConsultationUsed': true } }
            );
            if (claimed) {
              payerType = 'welcome_credit';
              initialStatus = 'pending';
              isBilled = true;
              settlementStatus = 'settled';
            } else {
              payerType = 'self_pay';
              initialStatus = 'awaiting_payment';
              billingAmount = CONSULTATION_FEE_GHS;
              expectedAmountPesewas = CONSULTATION_FEE_PESEWAS;
            }
          } else if (sub.welcomeConsultationBenefit === 'discount_150') {
            payerType = 'welcome_discount';
            initialStatus = 'awaiting_payment';
            billingAmount = WELCOME_DISCOUNT_CONSULTATION_FEE_GHS;
            expectedAmountPesewas = WELCOME_DISCOUNT_CONSULTATION_FEE_PESEWAS;
          } else {
            payerType = 'self_pay';
            initialStatus = 'awaiting_payment';
            billingAmount = CONSULTATION_FEE_GHS;
            expectedAmountPesewas = CONSULTATION_FEE_PESEWAS;
          }
        } else {
          // Trialing individual, Free-tier individual, or paid individual who already used welcome benefit
          payerType = 'self_pay';
          initialStatus = 'awaiting_payment';
          billingAmount = CONSULTATION_FEE_GHS;
          expectedAmountPesewas = CONSULTATION_FEE_PESEWAS;
        }
      } else {
        // Company tenant
        const hasClinicalCoverage = ['starter', 'pro', 'enterprise'].includes(effectiveTier);
        if (!hasClinicalCoverage) {
          payerType = 'self_pay';
          initialStatus = 'awaiting_payment';
          billingAmount = CONSULTATION_FEE_GHS;
          expectedAmountPesewas = CONSULTATION_FEE_PESEWAS;
        }
      }

      // Department Resolution
      let departmentName = accountType === 'individual' ? 'Personal Account' : 'General Staff';
      if (accountType !== 'individual' && userId) {
        try {
          const userRecord = await User.findOne({ user_id: userId }).select('department_id').lean();
          if (userRecord && userRecord.department_id && userRecord.department_id !== 'unassigned') {
            const deptDoc = await Department.findOne({ department_id: userRecord.department_id }).select('name').lean();
            if (deptDoc && deptDoc.name) {
              departmentName = deptDoc.name;
            }
          }
        } catch (deptErr) {
          console.warn('[Referral] Department resolution error:', deptErr.message);
        }
      }
      if (payerType === 'self_pay' && accountType !== 'individual') {
        departmentName = 'Private Self-Pay';
      }

      const topic = req.body.topic || req.body.reason || (req.body.notes && !req.body.topic ? req.body.notes : 'General Clinical Consultation Intake Request');
      const preferredTime = req.body.preferredTime || req.body.preferred_time || req.body.time || 'As soon as available';
      const notes = req.body.notes || '';
      const rawPriority = String(req.body.priority || 'standard').toLowerCase().trim();
      const priority = ['standard', 'urgent', 'crisis'].includes(rawPriority) ? rawPriority : 'standard';

      const intakeNotes = notes ? (topic ? `${topic} - ${notes}` : notes) : (topic || '');

      const referral = await Referral.create({
        referenceCode,
        company_id: tenant.company_id,
        tenantId: tenant._id,
        assignedAssessorId: tenant.activeAssessorId,
        departmentName,
        preferredTime,
        priority,
        status: initialStatus,
        patientProvidedEmployer: {
          name: employerName,
          staffId,
        },
        billing: {
          amount: billingAmount,
          currency: 'GHS',
          isBilled,
          ...(isBilled ? { billedAt: new Date(), settledAt: new Date() } : {}),
          settlementStatus,
          payerType,
          payerUserId: userId,
          expectedAmountPesewas,
        },
        clinicalDetails: {
          patientName,
          patientContact,
          intakeNotes,
        },
      });

      if (initialStatus === 'awaiting_payment') {
        const isDiscount = payerType === 'welcome_discount';
        const amountGhs = expectedAmountPesewas / 100;
        return res.status(202).json({
          success: true,
          paymentRequired: true,
          amountGhs,
          ...(isDiscount ? { originalAmountGhs: CONSULTATION_FEE_GHS, discountAppliedGhs: 150 } : {}),
          payerType,
          isPrivateEmployeeSelfPay: accountType !== 'individual' && payerType === 'self_pay',
          referralId: String(referral._id),
          referenceCode,
          message: isDiscount
            ? `Your GHS 150 welcome credit has been applied. Complete the GHS ${amountGhs} payment to notify the clinician.`
            : `Complete the GHS ${amountGhs} consultation payment to notify the clinician. Includes an official Excuse Duty certificate if clinically warranted.`,
        });
      }

      console.log('[Occupational Health Referral] Saved referral', referenceCode, 'priority:', priority, 'payerType:', payerType, 'for tenant', tenant.company_name);

      res.status(200).json({
        success: true,
        payerType,
        message: priority === 'crisis'
          ? 'Urgent clinician escalation submitted. A practitioner has been prioritized to reach out.'
          : 'Referral submitted securely to the designated medical assessor.',
        reference_code: referenceCode,
        data: {
          referenceCode,
          priority,
          status: referral.status,
          payerType,
        },
      });

      // Background email dispatch via setImmediate()
      setImmediate(async () => {
        try {
          const assessor = await Assessor.findById(tenant.activeAssessorId).lean();
          let targetEmail = assessor?.notificationEmail || assessor?.email;
          if (!targetEmail || targetEmail.includes('@clinic.com') || targetEmail.includes('.test@')) {
            targetEmail = process.env.CLINICAL_INTAKE_EMAIL || process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'clarke.edith@gmail.com';
          }

          const companyLabel = accountType === 'individual'
            ? 'Individual (Welcome Credit)'
            : (tenant.company_name || tenant.companyName || 'Organization');

          const result = await sendClinicalDispatch({
            referenceCode,
            companyName: companyLabel,
            to: targetEmail,
            priority,
          });

          if (!result.success) {
            console.warn('[Referral] Background email dispatch failed:', result.error);
          } else {
            console.log('[Occupational Health Referral] Zero-Knowledge Email dispatched to assessor:', targetEmail, 'for reference:', referenceCode);
          }
        } catch (dispatchErr) {
          console.warn('[Referral] Background email dispatch error:', dispatchErr.message);
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   GET /api/v1/referrals/employer-billing
 * @desc    Get anonymized referral billing list for Employer / HR
 * @access  Authenticated (HR Admin / Tenant Admin / Super Admin)
 */
router.get(
  '/employer-billing',
  validateSession,
  requireRole('hr_admin', 'tenant_admin', 'super_admin'),
  async (req, res, next) => {
    try {
      const companyId = req.sessionData?.company_id;

      let query = {};
      if (companyId) {
        const tenant = await Tenant.findOne({
          $or: [
            { company_id: companyId },
            ...(mongoose.isValidObjectId(companyId) ? [{ _id: companyId }] : [])
          ]
        }).select('_id').lean();

        if (!tenant) {
          return res.status(404).json({
            success: false,
            error: 'TENANT_NOT_FOUND',
            message: 'Tenant not found.',
          });
        }
        query.tenantId = tenant._id;
      }

      const dateFilter = parseMonthRangeQuery(req.query);
      if (dateFilter.error) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DATE_RANGE',
          message: dateFilter.error,
        });
      }

      if (dateFilter.active) {
        query.createdAt = dateFilter.range;
      }

      // Exclude self-paid & awaiting_payment referrals so private employee consultations never surface to HR
      query['billing.payerType'] = { $ne: 'self_pay' };
      query.status = { $ne: 'awaiting_payment' };

      // Explicitly exclude clinicalDetails and assignedAssessorId via .select()
      // HR must never receive patient-identifying fields in the response payload
      const referrals = await Referral.find(query)
        .select('referenceCode departmentName preferredTime status billing createdAt')
        .sort({ createdAt: -1 })
        .lean();

      let selfPayCountThisMonth = 0;
      if (query.tenantId) {
        const nowDate = new Date();
        const startOfMonth = new Date(Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), 1));
        selfPayCountThisMonth = await Referral.countDocuments({
          tenantId: query.tenantId,
          'billing.payerType': 'self_pay',
          status: { $ne: 'awaiting_payment' },
          createdAt: { $gte: startOfMonth },
        });
      }

      const now = Date.now();
      const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

      const data = referrals.map((r) => {
        const createdAtMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        const isStale = r.status === 'pending' && (now - createdAtMs) > FORTY_EIGHT_HOURS_MS;
        return {
          _id: r._id,
          referenceCode: r.referenceCode,
          departmentName: r.departmentName,
          preferredTime: r.preferredTime,
          status: r.status,
          billing: {
            amount: r.billing?.amount || 0,
            currency: r.billing?.currency || 'GHS',
            isBilled: !!r.billing?.isBilled,
            billedAt: r.billing?.billedAt || null,
          },
          createdAt: r.createdAt,
          isStale: !!isStale,
        };
      });

      res.json({
        success: true,
        count: data.length,
        self_pay_count_this_month: selfPayCountThisMonth,
        ...(dateFilter.active ? { period: { from: dateFilter.from, to: dateFilter.to } } : {}),
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   GET /api/v1/referrals/my-active
 * @desc    Employee active consultation / referral lookup
 * @access  Authenticated (Employee / Tenant User)
 */
router.get('/my-active', validateSession, enforceTenantScope, async (req, res, next) => {
  try {
    const companyId = req.tenantScope?.company_id || req.sessionData?.company_id;
    let userEmail = (req.user?.email || req.session?.email || '').trim();

    if (!userEmail && req.sessionData?.user_id) {
      const canQueryUser = mongoose.connection?.readyState === 1 || User.findOne !== mongoose.Model.findOne;
      if (canQueryUser) {
        try {
          const queryObj = User.findOne({ user_id: req.sessionData.user_id });
          const user = queryObj && typeof queryObj.lean === 'function' ? await queryObj.lean() : await queryObj;
          if (user && user.email_encrypted) {
            const parsed = typeof user.email_encrypted === 'string' ? JSON.parse(user.email_encrypted) : user.email_encrypted;
            userEmail = decryptField(parsed);
          }
        } catch (e) {
          userEmail = '';
        }
      }
    }

    let referral = null;

    // Strictly match the authenticated caller's own email (or payerUserId for individual/linked guest accounts) within their tenant scope.
    if (companyId && (userEmail || req.sessionData?.user_id)) {
      const tenantOrClauses = [{ company_id: companyId }];
      if (mongoose.isValidObjectId(companyId)) {
        tenantOrClauses.push({ tenantId: new mongoose.Types.ObjectId(companyId) });
      }
      const isIndividual = req.sessionData?.role === 'individual';
      let ownerFilter = null;
      if (userEmail && !isIndividual) {
        const escapedEmail = userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        ownerFilter = { 'clinicalDetails.patientContact': new RegExp(`^${escapedEmail}$`, 'i') };
      } else {
        const ownerOrClauses = [];
        if (userEmail) {
          const escapedEmail = userEmail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          ownerOrClauses.push({ 'clinicalDetails.patientContact': new RegExp(`^${escapedEmail}$`, 'i') });
        }
        if (req.sessionData?.user_id) {
          ownerOrClauses.push({ 'billing.payerUserId': req.sessionData.user_id });
        }
        ownerFilter = { $or: ownerOrClauses };
      }
      referral = await Referral.findOne({
        $and: [
          { $or: [...tenantOrClauses, ...(isIndividual && req.sessionData?.user_id ? [{ 'billing.payerUserId': req.sessionData.user_id }] : [])] },
          ownerFilter,
          { status: { $in: ['pending', 'scheduled', 'in_review'] } }
        ]
      })
        .sort({ createdAt: -1 })
        .select('referenceCode status scheduledAt appointmentNotes preferredTime createdAt clinicalDetails.meetingLink clinicalDetails.patientName')
        .lean();
    }

    if (!referral) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        referenceCode: referral.referenceCode,
        status: referral.status,
        patientName: referral.clinicalDetails?.patientName || 'Employee',
        scheduledAt: referral.scheduledAt || null,
        meetingLink: referral.clinicalDetails?.meetingLink || '',
        createdAt: referral.createdAt
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/referrals/status/:referenceCode
 * @desc    Employee status lookup & two-way clinical messaging thread
 * @access  Public / Employee (Zero-Knowledge, authenticated by Reference Code)
 */
router.get('/status/:referenceCode', sensitiveRateLimiter(10, { strictLimit: true, skipSuccessfulRequests: true }), async (req, res, next) => {
  try {
    const rawCode = (req.params.referenceCode || '').toString().trim().toUpperCase();
    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Reference code is required.' });
    }

    const referral = await Referral.findOne({ referenceCode: rawCode })
      .select('referenceCode status scheduledAt appointmentNotes preferredTime createdAt thread guestAccessTokenHash billing.payerType billing.amount billing.currency billing.settlementStatus clinicalDetails.meetingLink clinicalDetails.attachments')
      .lean();

    if (!referral) {
      return res.status(404).json({
        success: false,
        error: 'REFERRAL_NOT_FOUND',
        message: 'No consultation request found matching this reference code.',
      });
    }

    if (referral.guestAccessTokenHash) {
      const providedToken = String(req.query.token || req.headers['x-guest-token'] || '').trim();
      if (!providedToken || hashField(providedToken) !== referral.guestAccessTokenHash) {
        return res.status(403).json({
          success: false,
          error: 'INVALID_GUEST_TOKEN',
          message: 'A valid private consultation token is required to view this consultation.',
        });
      }
    }

    if (referral.status === 'awaiting_payment') {
      return res.status(referral.guestAccessTokenHash ? 402 : 404).json({
        success: false,
        error: referral.guestAccessTokenHash ? 'PAYMENT_REQUIRED' : 'REFERRAL_NOT_FOUND',
        message: referral.guestAccessTokenHash
          ? 'Consultation payment has not been confirmed yet.'
          : 'No consultation request found matching this reference code.',
      });
    }

    // Return sanitized zero-knowledge payload for patient (no internal DB IDs, no Paystack secrets, no tenant internals)
    const sanitizedData = {
      referenceCode: referral.referenceCode,
      status: referral.status || 'pending',
      scheduledAt: referral.scheduledAt || null,
      appointmentNotes: referral.appointmentNotes || '',
      meetingLink: referral.clinicalDetails?.meetingLink || '',
      preferredTime: referral.preferredTime || 'As soon as available',
      createdAt: referral.createdAt,
      paymentSummary: {
        payerType: referral.billing?.payerType || 'company_covered',
        amount: Number(referral.billing?.amount || 0),
        currency: referral.billing?.currency || 'GHS',
        settlementStatus: referral.billing?.settlementStatus || 'unbilled',
      },
      attachments: (referral.clinicalDetails?.attachments || []).map(att => ({
        fileName: att.fileName,
        fileData: att.fileData,
        fileUrl: att.fileUrl || '',
        certificateId: att.certificateId || '',
        fileType: att.fileType,
        fileSize: att.fileSize,
        uploadedAt: att.uploadedAt,
      })),
      thread: (referral.thread || []).map(msg => ({
        sender: msg.sender,
        senderName: msg.senderName || (msg.sender === 'assessor' ? 'Medical Assessor' : 'You'),
        message: msg.message,
        timestamp: msg.timestamp,
      })),
    };

    res.json({
      success: true,
      data: sanitizedData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/referrals/status/:referenceCode/message
 * @desc    Employee sends reply to Medical Assessor in the two-way clinical thread
 * @access  Public / Employee (Zero-Knowledge, authenticated by Reference Code)
 */
router.post('/status/:referenceCode/message', sensitiveRateLimiter(10, { strictLimit: true, skipSuccessfulRequests: true }), async (req, res, next) => {
  try {
    const rawCode = (req.params.referenceCode || '').toString().trim().toUpperCase();
    const { message } = req.body;

    if (!rawCode) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Reference code is required.' });
    }

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Message content is required.',
      });
    }

    const referral = await Referral.findOne({ referenceCode: rawCode });
    if (!referral) {
      return res.status(404).json({
        success: false,
        error: 'REFERRAL_NOT_FOUND',
        message: 'No consultation request found matching this reference code.',
      });
    }

    if (referral.guestAccessTokenHash) {
      const providedToken = String(req.query.token || req.headers['x-guest-token'] || req.body?.token || '').trim();
      if (!providedToken || hashField(providedToken) !== referral.guestAccessTokenHash) {
        return res.status(403).json({
          success: false,
          error: 'INVALID_GUEST_TOKEN',
          message: 'A valid private consultation token is required to reply in this consultation.',
        });
      }
    }

    if (referral.status === 'awaiting_payment') {
      return res.status(402).json({
        success: false,
        error: 'PAYMENT_REQUIRED',
        message: 'Complete consultation payment before messaging the clinician.',
      });
    }

    const newMsg = {
      sender: 'employee',
      senderName: 'Employee',
      message: message.trim(),
      timestamp: new Date(),
    };

    referral.thread = referral.thread || [];
    referral.thread.push(newMsg);
    await referral.save();

    console.log(`[Referral] Employee sent message in thread for ${referral.referenceCode}`);

    res.json({
      success: true,
      message: 'Reply sent securely to your assigned practitioner.',
      thread: referral.thread,
      data: {
        thread: referral.thread,
      },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;

