'use strict';

require('./testConfig');
const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const app = require('../server');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Referral = require('../models/Referral');
const Assessor = require('../models/Assessor');
const AuditLog = require('../models/AuditLog');
const AssessmentCycle = require('../models/AssessmentCycle');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const AnonHazardLog = require('../models/AnonHazardLog');
const paystack = require('../utils/paystack');
const emailService = require('../utils/emailService');
const { hashField, encryptField } = require('../utils/crypto');
const { processTrialReminders } = require('../scheduler/complianceScheduler');

const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';
const IND_COMPANY_ID = '11111111-2222-4333-8444-555555555555';
const IND_USER_ID = '22222222-3333-4444-8555-666666666666';
const CORP_COMPANY_ID = '33333333-4444-4555-8666-777777777777';
const CORP_EMP_USER_ID = '44444444-5555-4666-8777-888888888888';

const indToken = jwt.sign(
  {
    userId: IND_USER_ID,
    companyId: IND_COMPANY_ID,
    departmentId: 'personal',
    role: 'individual',
    status: 'active',
    accountType: 'individual',
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

const corpAdminToken = jwt.sign(
  {
    userId: '55555555-6666-4777-8888-999999999999',
    companyId: CORP_COMPANY_ID,
    role: 'hr_admin',
    status: 'active',
    accountType: 'company',
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

const corpEmpToken = jwt.sign(
  {
    userId: CORP_EMP_USER_ID,
    companyId: CORP_COMPANY_ID,
    departmentId: 'eng',
    role: 'employee',
    status: 'active',
    accountType: 'company',
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

const superAdminToken = jwt.sign(
  {
    userId: '66666666-7777-4888-8999-000000000000',
    companyId: CORP_COMPANY_ID,
    role: 'super_admin',
    isSystemSuperAdmin: true,
    status: 'active',
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

function makeChainQuery(data) {
  const q = {
    select: () => q,
    sort: () => q,
    skip: () => q,
    limit: () => q,
    populate: () => q,
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
  };
  return q;
}

function makeTenantDoc(overrides = {}) {
  const base = {
    _id: new mongoose.Types.ObjectId(),
    company_id: IND_COMPANY_ID,
    company_name: 'Ama Boateng (Personal)',
    slug: 'ind-ama-1234',
    account_type: 'individual',
    billing_tier: 'personal',
    lifecycle_state: 'active',
    access_expires_at: null,
    used_seats: 1,
    max_allowed_seats: 1,
    activeAssessorId: new mongoose.Types.ObjectId(),
    subscription: {
      tier: 'personal',
      status: 'trialing',
      currency: 'GHS',
      trialEndsAt: new Date(Date.now() + 20 * 86400000),
      currentPeriodEnd: null,
      welcomeConsultationBenefit: 'none',
      welcomeConsultationUsed: false,
      transactionReferences: [],
      remindersSent: [],
    },
    save: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  base.getEffectiveTier = function () {
    return Tenant.schema.methods.getEffectiveTier.call(this);
  };
  return base;
}

describe('B2C Individual Accounts & Guest Consultation Mode', () => {
  const origPaystackSecret = process.env.PAYSTACK_SECRET_KEY;

  beforeEach(() => {
    vi.spyOn(AuditLog, 'append').mockResolvedValue({});
    vi.spyOn(AssessmentCycle, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
    vi.spyOn(emailService, 'sendMail').mockResolvedValue({ skipped: true });
    vi.spyOn(emailService, 'sendClinicalDispatch').mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (origPaystackSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
    else process.env.PAYSTACK_SECRET_KEY = origPaystackSecret;
  });

  describe('Models, Registration & Separation', () => {
    it('enforces immutable account_type on Tenant and includes individual on User.role', () => {
      expect(Tenant.schema.path('account_type').options.immutable).toBe(true);
      expect(Tenant.schema.path('account_type').options.enum.values).toEqual(['company', 'individual', 'system_guest']);
      expect(User.schema.path('role').options.enum.values).toContain('individual');
    });

    it('POST /api/v1/auth/register-individual creates personal workspace (30d trial, access_expires_at: null) and blocks duplicate email', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValueOnce(null);
      vi.spyOn(Assessor, 'findOne').mockResolvedValue({ _id: new mongoose.Types.ObjectId(), active: true });
      vi.spyOn(Tenant, 'findOne').mockResolvedValue(null);

      let capturedTenantInput = null;
      let capturedUserInput = null;
      vi.spyOn(Tenant, 'create').mockImplementation(async (docs) => {
        const d = Array.isArray(docs) ? docs[0] : docs;
        capturedTenantInput = d;
        return [makeTenantDoc(d)];
      });
      vi.spyOn(User, 'create').mockImplementation(async (docs) => {
        const d = Array.isArray(docs) ? docs[0] : docs;
        capturedUserInput = d;
        return [d];
      });

      const res = await request(app)
        .post('/api/v1/auth/register-individual')
        .send({
          fullName: 'Ama Boateng',
          email: 'ama.b2c@example.com',
          password: 'StrongPassword123!',
          timezone: 'Africa/Accra',
          consentAccepted: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.user.role).toBe('individual');
      expect(res.body.user.account_type).toBe('individual');
      expect(res.body.tenant.account_type).toBe('individual');
      expect(res.body.tenant.effectiveTier).toBe('personal');
      expect(res.body.redirectUrl).toBe('/app/dashboard.html');
      expect(capturedTenantInput.access_expires_at).toBeNull();
      expect(capturedTenantInput.subscription.status).toBe('trialing');
      expect(capturedUserInput.role).toBe('individual');

      // Duplicate email rejected across accounts
      vi.spyOn(User, 'findOne').mockResolvedValueOnce({ user_id: 'existing' });
      const dupRes = await request(app)
        .post('/api/v1/auth/register-individual')
        .send({
          fullName: 'Ama Duplicate',
          email: 'ama.b2c@example.com',
          password: 'StrongPassword123!',
          consentAccepted: true,
        });
      expect(dupRes.status).toBe(400);
      expect(dupRes.body.error).toBe('EMAIL_ALREADY_EXISTS');
    });

    it('blocks individual accounts from company-only routes (/hr, /assessment-cycles/active, /billing/request-invoice, /vault/submit)', async () => {
      const indTenant = makeTenantDoc();
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(indTenant));

      const hrRes = await request(app).get('/api/v1/hr/analytics').set('Authorization', `Bearer ${indToken}`);
      expect(hrRes.status).toBe(403);
      expect(hrRes.body.error).toBe('NOT_AVAILABLE_FOR_INDIVIDUALS');

      const acRes = await request(app).get('/api/v1/assessment-cycles/active').set('Authorization', `Bearer ${indToken}`);
      expect(acRes.status).toBe(403);
      expect(acRes.body.error).toBe('NOT_AVAILABLE_FOR_INDIVIDUALS');

      const invRes = await request(app)
        .post('/api/v1/billing/request-invoice')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ tier: 'pro' });
      expect(invRes.status).toBe(403);
      expect(invRes.body.error).toBe('NOT_AVAILABLE_FOR_INDIVIDUALS');

      const vaultRes = await request(app)
        .post('/api/v1/vault/submit')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ category: 'ethics', description: 'Test report' });
      expect(vaultRes.status).toBe(403);
      expect(vaultRes.body.error).toBe('NOT_AVAILABLE_FOR_INDIVIDUALS');
    });
  });

  describe('Free Tier Continuity (No Lockout) & Self-Screening Gates', () => {
    it('downgrades expired individual trial to free without locking lifecycle_state, keeps Daily Pulse open, and gates COPSOQ/PHQ-9/Export with 402', async () => {
      const expiredIndTenant = makeTenantDoc({
        billing_tier: 'personal',
        lifecycle_state: 'active',
        access_expires_at: null,
        subscription: {
          tier: 'personal',
          status: 'trialing',
          trialEndsAt: new Date(Date.now() - 2 * 86400000),
          remindersSent: [],
          welcomeConsultationBenefit: 'none',
          welcomeConsultationUsed: false,
        },
      });

      const enc = encryptField('ama.free@example.com');
      const mockIndUser = {
        user_id: IND_USER_ID,
        company_id: IND_COMPANY_ID,
        role: 'individual',
        status: 'active',
        email_encrypted: JSON.stringify(enc),
        baseline_profile: {},
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(Tenant, 'find').mockResolvedValueOnce([expiredIndTenant]);
      vi.spyOn(User, 'findOne').mockImplementation(() => makeChainQuery(mockIndUser));
      const checkpoints = await processTrialReminders(new Date());
      expect(checkpoints).toEqual([{ company_id: IND_COMPANY_ID, checkpoint: 'expired' }]);
      expect(expiredIndTenant.billing_tier).toBe('free');
      expect(expiredIndTenant.subscription.tier).toBe('free');
      expect(expiredIndTenant.subscription.status).toBe('canceled');
      expect(expiredIndTenant.lifecycle_state).toBe('active');
      expect(expiredIndTenant.getEffectiveTier()).toBe('free');

      // Now verify API behavior on that expired/free individual tenant
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(expiredIndTenant));
      vi.spyOn(PersonalWellnessLog, 'create').mockResolvedValue({});
      const anonSpy = vi.spyOn(AnonHazardLog.prototype, 'save').mockResolvedValue({});

      // Daily Pulse remains open (200) and does NOT write to AnonHazardLog
      const pulseRes = await request(app)
        .post('/api/v1/wellness/daily-pulse')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ mood: 4, calm: 4, stress: 3, energy: 4, work_fit: 4 });
      expect(pulseRes.status).toBe(200);
      expect(anonSpy).not.toHaveBeenCalled();

      // COPSOQ-III returns 402 UPGRADE_REQUIRED
      const copsoqRes = await request(app)
        .post('/api/v1/wellness/submit-checkin')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ survey_type: 'copsoq3_core', answers: [2, 2, 2] });
      expect(copsoqRes.status).toBe(402);
      expect(copsoqRes.body.error).toBe('UPGRADE_REQUIRED');

      // Export returns 402 UPGRADE_REQUIRED
      const exportRes = await request(app)
        .get('/api/v1/wellness/export')
        .set('Authorization', `Bearer ${indToken}`);
      expect(exportRes.status).toBe(402);
      expect(exportRes.body.error).toBe('UPGRADE_REQUIRED');
    });

    it('allows active-trial individuals to submit PHQ-9 without an HR AssessmentCycle and without polluting AnonHazardLog', async () => {
      const trialTenant = makeTenantDoc();
      const mockIndUser = {
        user_id: IND_USER_ID,
        company_id: IND_COMPANY_ID,
        role: 'individual',
        status: 'active',
        baseline_profile: {},
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(trialTenant));
      vi.spyOn(User, 'findOne').mockImplementation(() => makeChainQuery(mockIndUser));
      vi.spyOn(PersonalWellnessLog, 'create').mockResolvedValue({});
      const cycleSpy = vi.spyOn(AssessmentCycle, 'findOne');

      const res = await request(app)
        .post('/api/v1/wellness/submit-checkin')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ survey_type: 'phq9', answers: [1, 1, 1, 0, 1, 0, 1, 0, 0] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.anon_log_id).toBeNull();
      expect(cycleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Billing, Account-Type Guard, Monthly Credit vs. Annual Free Consult', () => {
    it('enforces tier separation on /billing/initialize and /billing/status', async () => {
      process.env.PAYSTACK_SECRET_KEY = 'sk_test_b2c';
      vi.spyOn(paystack, 'isConfigured').mockReturnValue(true);
      vi.spyOn(paystack, 'initializeTransaction').mockResolvedValue({
        authorization_url: 'https://checkout.paystack.com/test123',
        access_code: 'ac_test',
        reference: 'ref_sub_1',
      });

      const indTenant = makeTenantDoc();
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(indTenant));

      const statusRes = await request(app).get('/api/v1/billing/status').set('Authorization', `Bearer ${indToken}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.account_type).toBe('individual');
      expect(Object.keys(statusRes.body.available_tiers)).toEqual(['personal', 'personal_annual']);

      // Individual cannot buy starter
      const badInd = await request(app)
        .post('/api/v1/billing/initialize')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ tier: 'starter' });
      expect(badInd.status).toBe(403);
      expect(badInd.body.error).toBe('TIER_ACCOUNT_TYPE_MISMATCH');

      // Individual can initialize personal (GHS 150)
      const okInd = await request(app)
        .post('/api/v1/billing/initialize')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ tier: 'personal' });
      expect(okInd.status).toBe(200);
      expect(okInd.body.authorization_url).toContain('paystack.com');

      // Company cannot buy personal
      const corpTenant = makeTenantDoc({ company_id: CORP_COMPANY_ID, account_type: 'company', billing_tier: 'pro' });
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(corpTenant));
      const badCorp = await request(app)
        .post('/api/v1/billing/initialize')
        .set('Authorization', `Bearer ${corpAdminToken}`)
        .send({ tier: 'personal' });
      expect(badCorp.status).toBe(403);
      expect(badCorp.body.error).toBe('TIER_ACCOUNT_TYPE_MISMATCH');
    });

    it('Personal Monthly grants GHS 150 consultation credit (GHS 199 top-up once) and Annual grants 1 full free consultation', async () => {
      process.env.PAYSTACK_SECRET_KEY = 'sk_test_b2c';
      vi.spyOn(paystack, 'isConfigured').mockReturnValue(true);

      // 1. Trialing individual gets NO free consultation (must pay GHS 349)
      const trialTenant = makeTenantDoc();
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(trialTenant));
      vi.spyOn(Referral, 'create').mockImplementation(async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc }));

      const trialConsult = await request(app)
        .post('/api/v1/referrals/occupational-health')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ patientName: 'Ama', patientContact: 'ama@example.com', notes: 'Check-up' });
      expect(trialConsult.status).toBe(202);
      expect(trialConsult.body.paymentRequired).toBe(true);
      expect(trialConsult.body.amountGhs).toBe(349);

      // 2. Monthly webhook activates discount_150 and keeps access_expires_at: null
      let capturedUpdate = null;
      vi.spyOn(Tenant, 'findOneAndUpdate').mockImplementation(async (_q, u) => {
        capturedUpdate = u;
        return trialTenant;
      });
      const monthlyWebhookBody = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_m_150', amount: 15000, currency: 'GHS', metadata: { company_id: IND_COMPANY_ID, tier: 'personal' } },
      });
      const sigMonthly = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(monthlyWebhookBody).digest('hex');
      const whMonthly = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', sigMonthly)
        .set('Content-Type', 'application/json')
        .send(monthlyWebhookBody);
      expect(whMonthly.status).toBe(200);
      expect(capturedUpdate.$set['subscription.welcomeConsultationBenefit']).toBe('discount_150');
      expect(capturedUpdate.$set.access_expires_at).toBeNull();

      // Paid Monthly user's 1st consultation costs GHS 199 (349 - 150 credit)
      const paidMonthlyTenant = makeTenantDoc({
        subscription: {
          tier: 'personal',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
          welcomeConsultationBenefit: 'discount_150',
          welcomeConsultationUsed: false,
          transactionReferences: ['ref_m_150'],
        },
      });
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(paidMonthlyTenant));
      const discConsult = await request(app)
        .post('/api/v1/referrals/occupational-health')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ patientName: 'Ama', patientContact: 'ama@example.com', notes: 'Need doctor' });
      expect(discConsult.status).toBe(202);
      expect(discConsult.body.amountGhs).toBe(199);
      expect(discConsult.body.discountAppliedGhs).toBe(150);
      expect(discConsult.body.payerType).toBe('welcome_discount');

      // 3. Annual webhook sets +365d and free_one
      const annualBody = JSON.stringify({
        event: 'charge.success',
        data: { reference: 'ref_y_1500', amount: 150000, currency: 'GHS', metadata: { company_id: IND_COMPANY_ID, tier: 'personal_annual' } },
      });
      const sigAnnual = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(annualBody).digest('hex');
      await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', sigAnnual)
        .set('Content-Type', 'application/json')
        .send(annualBody);
      const diffDays = (new Date(capturedUpdate.$set['subscription.currentPeriodEnd']).getTime() - Date.now()) / 86400000;
      expect(diffDays).toBeGreaterThan(360);
      expect(capturedUpdate.$set['subscription.welcomeConsultationBenefit']).toBe('free_one');

      // Annual user's 1st consultation succeeds immediately at GHS 0
      const paidAnnualTenant = makeTenantDoc({
        billing_tier: 'personal_annual',
        subscription: {
          tier: 'personal_annual',
          status: 'active',
          currentPeriodEnd: new Date(Date.now() + 365 * 86400000),
          welcomeConsultationBenefit: 'free_one',
          welcomeConsultationUsed: false,
          transactionReferences: ['ref_y_1500'],
        },
      });
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(paidAnnualTenant));
      vi.spyOn(Tenant, 'findOneAndUpdate').mockResolvedValue(paidAnnualTenant);
      const freeAnnualConsult = await request(app)
        .post('/api/v1/referrals/occupational-health')
        .set('Authorization', `Bearer ${indToken}`)
        .send({ patientName: 'Ama', patientContact: 'ama@example.com', notes: 'Annual check' });
      expect(freeAnnualConsult.status).toBe(200);
      expect(freeAnnualConsult.body.payerType).toBe('welcome_credit');
    });
  });

  describe('Guest Mode (GHS 349) & Company Free-Tier Self-Pay Privacy', () => {
    it('Guest Mode requires disclaimer, hides awaiting_payment until GHS 349 webhook, and enforces guestToken on status/chat', async () => {
      process.env.PAYSTACK_SECRET_KEY = 'sk_test_b2c';
      vi.spyOn(paystack, 'isConfigured').mockReturnValue(true);
      vi.spyOn(paystack, 'initializeTransaction').mockResolvedValue({
        authorization_url: 'https://checkout.paystack.com/guest349',
        access_code: 'ac_guest',
        reference: 'ref_guest_349',
      });

      const guestPoolTenant = makeTenantDoc({
        company_id: '00000000-0000-4000-8000-000000000001',
        company_name: 'Guest Clinical Consultations',
        slug: 'guest-clinical-pool',
        account_type: 'system_guest',
      });
      vi.spyOn(Tenant, 'findOne').mockResolvedValue(guestPoolTenant);

      // Missing disclaimer rejected
      const noDisc = await request(app)
        .post('/api/v1/referrals/guest-checkout')
        .send({ patientName: 'Kwame', patientEmail: 'kwame@example.com', patientPhone: '0240000000', notes: 'Fever' });
      expect(noDisc.status).toBe(400);
      expect(noDisc.body.error).toBe('DISCLAIMER_REQUIRED');

      let savedGuestReferral = null;
      vi.spyOn(Referral, 'create').mockImplementation(async (doc) => {
        savedGuestReferral = { _id: new mongoose.Types.ObjectId(), thread: [], ...doc };
        return savedGuestReferral;
      });

      const guestInit = await request(app)
        .post('/api/v1/referrals/guest-checkout')
        .send({
          patientName: 'Kwame Mensah',
          patientEmail: 'kwame@example.com',
          patientPhone: '0240000000',
          notes: 'Severe migraine',
          employerName: 'Goldfields Ghana',
          staffId: 'GF-402',
          clinicalDisclaimerAccepted: true,
        });
      expect(guestInit.status).toBe(201);
      expect(guestInit.body.amountGhs).toBe(349);
      expect(savedGuestReferral.status).toBe('awaiting_payment');
      expect(savedGuestReferral.billing.payerType).toBe('guest_pay');

      const { referenceCode, guestToken } = guestInit.body;

      // Before payment: invalid token -> 403; valid token -> 402 PAYMENT_REQUIRED
      vi.spyOn(Referral, 'findOne').mockImplementation(() => makeChainQuery(savedGuestReferral));
      const badTokRes = await request(app).get(`/api/v1/referrals/status/${referenceCode}?token=wrong`);
      expect(badTokRes.status).toBe(403);
      const pendingPayRes = await request(app).get(`/api/v1/referrals/status/${referenceCode}?token=${guestToken}`);
      expect(pendingPayRes.status).toBe(402);

      // Simulate Paystack GHS 349 webhook
      vi.spyOn(Referral, 'findById').mockResolvedValue(savedGuestReferral);
      vi.spyOn(Referral, 'findOneAndUpdate').mockImplementation(async () => {
        savedGuestReferral.status = 'pending';
        savedGuestReferral.billing.isBilled = true;
        savedGuestReferral.billing.settlementStatus = 'settled';
        return savedGuestReferral;
      });
      vi.spyOn(Assessor, 'findById').mockImplementation(() => makeChainQuery({ _id: savedGuestReferral.assignedAssessorId, email: 'doc@clinic.test' }));

      const guestWhBody = JSON.stringify({
        event: 'charge.success',
        data: {
          reference: 'ref_guest_349',
          amount: 34900,
          currency: 'GHS',
          metadata: { type: 'guest_consultation', referral_id: String(savedGuestReferral._id), track_url: 'https://example.com/consult' },
        },
      });
      const guestSig = crypto.createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(guestWhBody).digest('hex');
      const whRes = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', guestSig)
        .set('Content-Type', 'application/json')
        .send(guestWhBody);
      expect(whRes.status).toBe(200);
      expect(savedGuestReferral.status).toBe('pending');

      // After payment, valid token returns consultation room
      const okRoomRes = await request(app).get(`/api/v1/referrals/status/${referenceCode}?token=${guestToken}`);
      expect(okRoomRes.status).toBe(200);
      expect(okRoomRes.body.data.referenceCode).toBe(referenceCode);
    });

    it('Free-tier company employee self-pays GHS 349 and HR /employer-billing excludes self_pay rows while counting them anonymously', async () => {
      const freeCorpTenant = makeTenantDoc({
        company_id: CORP_COMPANY_ID,
        company_name: 'Small Org Ltd',
        account_type: 'company',
        billing_tier: 'free',
        subscription: { tier: 'free', status: 'active' },
      });
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => makeChainQuery(freeCorpTenant));
      vi.spyOn(User, 'findOne').mockImplementation(() => makeChainQuery({ department_id: 'unassigned' }));
      vi.spyOn(Referral, 'create').mockImplementation(async (doc) => ({ _id: new mongoose.Types.ObjectId(), ...doc }));

      const empConsult = await request(app)
        .post('/api/v1/referrals/occupational-health')
        .set('Authorization', `Bearer ${corpEmpToken}`)
        .send({ patientName: 'Kofi Employee', patientContact: 'kofi@smallorg.com', notes: 'Private check' });
      expect(empConsult.status).toBe(202);
      expect(empConsult.body.amountGhs).toBe(349);
      expect(empConsult.body.payerType).toBe('self_pay');
      expect(empConsult.body.isPrivateEmployeeSelfPay).toBe(true);

      let capturedFindQuery = null;
      vi.spyOn(Referral, 'find').mockImplementation((q) => {
        capturedFindQuery = q;
        return makeChainQuery([]);
      });
      vi.spyOn(Referral, 'countDocuments').mockResolvedValue(3);

      const hrBillingRes = await request(app)
        .get('/api/v1/referrals/employer-billing')
        .set('Authorization', `Bearer ${corpAdminToken}`);
      expect(hrBillingRes.status).toBe(200);
      expect(capturedFindQuery['billing.payerType']).toEqual({ $ne: 'self_pay' });
      expect(capturedFindQuery.status).toEqual({ $ne: 'awaiting_payment' });
      expect(hrBillingRes.body.self_pay_count_this_month).toBe(3);
    });

    it('SuperAdmin /assessor-payouts aggregates payouts across payer types and /consult serves 200', async () => {
      const aId = new mongoose.Types.ObjectId();
      vi.spyOn(Referral, 'find').mockImplementation(() => makeChainQuery([
        { assignedAssessorId: aId, status: 'completed', billing: { payerType: 'guest_pay', isBilled: true, amount: 349 } },
        { assignedAssessorId: aId, status: 'pending', billing: { payerType: 'welcome_discount', isBilled: true, amount: 199 } },
      ]));
      vi.spyOn(Assessor, 'find').mockImplementation(() => makeChainQuery([{ _id: aId, name: 'Dr. Clarke', organization: 'FZ Safety' }]));

      const payoutRes = await request(app)
        .get('/api/v1/superadmin/assessor-payouts')
        .set('Authorization', `Bearer ${superAdminToken}`);
      expect(payoutRes.status).toBe(200);
      expect(payoutRes.body.payouts[0].totalConsultations).toBe(2);
      expect(payoutRes.body.payouts[0].collectedGhs).toBe(548);

      const consultPageRes = await request(app).get('/consult');
      expect(consultPageRes.status).toBe(200);
      expect(consultPageRes.text).toContain('Doctor Consultation');
    });
  });
});
