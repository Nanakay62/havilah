'use strict';

require('./testConfig');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const app = require('../server');

const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const Referral = require('../models/Referral');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');
const AuditLog = require('../models/AuditLog');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const AnonHazardLog = require('../models/AnonHazardLog');
const AssessmentCycle = require('../models/AssessmentCycle');
const HealthArticle = require('../models/HealthArticle');
const Alert = require('../models/Alert');
const Report = require('../models/Report');
const Invitation = require('../models/Invitation');
const DepartmentSnapshot = require('../models/DepartmentSnapshot');
const PendingNotification = require('../models/PendingNotification');
const PulseResponse = require('../models/PulseResponse');
const WhistleblowerReport = require('../models/WhistleblowerReport');

const paystack = require('../utils/paystack');
const samlUtil = require('../utils/saml');
const { encryptField, hashField } = require('../utils/crypto');
const { generateTotpSecret, generateTotpCode } = require('../utils/totp');
const { callSignalingHub } = require('../services/callSignaling');
const { buildNSizeAggregation } = require('../aggregations/nSizePrivacy');
const { generateInsights } = require('../services/correlationEngine');
const { processTrialReminders } = require('../scheduler/complianceScheduler');
const emailService = require('../utils/emailService');
const { revokeUserSession, clearUserSessionRevocation } = require('../middleware/auth');

const SECRET = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';
const crypto = require('crypto');

const createMockQuery = (data) => {
  const q = {
    select: () => createMockQuery(data),
    sort: () => createMockQuery(data),
    limit: () => createMockQuery(data),
    skip: () => createMockQuery(data),
    populate: () => createMockQuery(data),
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
  };
  return q;
};

describe('Audit Remediation Regression Suite (All 4 Phases)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('CRIT-01: GET /api/v1/referrals/my-active strict isolation', () => {
    it('returns null instead of falling back to another employee referral in the same tenant', async () => {
      const token = jwt.sign(
        { userId: 'emp-b-001', companyId: 'comp-crit01', role: 'employee', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-crit01', lifecycle_state: 'active', locked_at: null })
      );
      vi.spyOn(User, 'findOne').mockImplementation(() =>
        createMockQuery({
          user_id: 'emp-b-001',
          status: 'active',
          role: 'employee',
          email_encrypted: JSON.stringify(encryptField('employee.b@corp.com')),
        })
      );
      const refSpy = vi.spyOn(Referral, 'findOne').mockImplementation(() => createMockQuery(null));

      const res = await request(app)
        .get('/api/v1/referrals/my-active?email=employee.a@corp.com')
        .set('X-User-Email', 'employee.a@corp.com')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeNull();
      // Must query ONLY once with employee.b@corp.com, never fall back to company-wide query
      expect(refSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('CRIT-02 & LOW-02: POST /api/v1/assessments/toggle authorization & scoping', () => {
    it('rejects unauthenticated and employee requests while permitting HR Admin scoped to their own tenant', async () => {
      const unauthRes = await request(app)
        .post('/api/v1/assessments/toggle')
        .send({ tenant_id: 'victim-tenant', survey_type: 'phq9', status: 'unlocked' });
      expect(unauthRes.status).toBe(401);

      const empToken = jwt.sign(
        { userId: 'emp-1', companyId: 'comp-a', role: 'employee', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-a', lifecycle_state: 'active', locked_at: null })
      );
      const empRes = await request(app)
        .post('/api/v1/assessments/toggle')
        .set('Authorization', `Bearer ${empToken}`)
        .send({ tenant_id: 'victim-tenant', survey_type: 'phq9', status: 'unlocked' });
      expect(empRes.status).toBe(403);

      const hrToken = jwt.sign(
        { userId: 'hr-1', companyId: 'comp-a', role: 'hr_admin', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(AssessmentCycle, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
      vi.spyOn(AssessmentCycle.prototype, 'save').mockResolvedValue(true);
      vi.spyOn(AssessmentCycle, 'getActiveForEmployee').mockResolvedValue({});

      const hrRes = await request(app)
        .post('/api/v1/assessments/toggle')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ tenant_id: 'victim-tenant', survey_type: 'phq9', status: 'locked' });
      expect(hrRes.status).toBe(200);
      expect(hrRes.body.tenant_id).toBe('comp-a');
    });
  });

  describe('CRIT-03: Billing Paystack reference verification checks tenant, amount, and replay', () => {
    it('blocks cross-tenant payment references and underpaid transactions', async () => {
      const hrToken = jwt.sign(
        { userId: 'hr-b', companyId: 'tenant-b', role: 'hr_admin', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(paystack, 'isConfigured').mockReturnValue(true);
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'tenant-b',
          lifecycle_state: 'active',
          locked_at: null,
          subscription: { transactionReferences: [] },
        })
      );
      vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
        status: 'success',
        reference: 'PAY-TENANT-A',
        amount: 1545000,
        currency: 'GHS',
        metadata: { company_id: 'tenant-a', tier: 'pro' },
        customer: { customer_code: 'CUS_A' },
      });

      const mismatchRes = await request(app)
        .get('/api/v1/billing/verify/PAY-TENANT-A')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(mismatchRes.status).toBe(403);
      expect(mismatchRes.body.error).toBe('TENANT_MISMATCH');

      // Underpaid amount attempt
      vi.spyOn(paystack, 'verifyTransaction').mockResolvedValue({
        status: 'success',
        reference: 'PAY-UNDERPAID',
        amount: 100, // 1 GHS instead of 15450 GHS
        currency: 'GHS',
        metadata: { company_id: 'tenant-b', tier: 'pro' },
      });
      const underpaidRes = await request(app)
        .get('/api/v1/billing/verify/PAY-UNDERPAID')
        .set('Authorization', `Bearer ${hrToken}`);
      expect(underpaidRes.status).toBe(400);
      expect(underpaidRes.body.error).toBe('AMOUNT_MISMATCH');
    });
  });

  describe('CRIT-04: GET /api/v1/tenant/config secret redaction', () => {
    it('never exposes Paystack tokens, invoices, or IdP certificates to employees', async () => {
      const empToken = jwt.sign(
        { userId: 'emp-cfg', companyId: 'comp-cfg', role: 'employee', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() => ({
        select: () => createMockQuery({ company_id: 'comp-cfg', lifecycle_state: 'active', locked_at: null }),
        lean: () => Promise.resolve({ company_id: 'comp-cfg', lifecycle_state: 'active', locked_at: null }),
        then: (res) =>
          res({
            company_id: 'comp-cfg',
            company_name: 'Cfg Corp',
            hotline_config: { crisis_number: '988' },
            billing_tier: 'pro',
            subscription: {
              tier: 'pro',
              status: 'active',
              paystackAuthorizationCode: 'AUTH_SECRET_TOKEN',
              paystackEmailToken: 'EMAIL_DISABLE_SECRET',
              invoices: [{ invoiceNumber: 'INV-1', amountGhs: 5500 }],
            },
            sso_config: { enabled: true, provider: 'Okta', idp_certificate: 'PRIVATE_CERT_DATA' },
            getEffectiveTier: () => 'pro',
          }),
      }));

      const res = await request(app)
        .get('/api/v1/tenant/config')
        .set('Authorization', `Bearer ${empToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.hotline_config.crisis_number).toBe('988');
      expect(res.body.data.effectiveTier).toBe('pro');
      expect(res.body.data.subscription.paystackAuthorizationCode).toBeUndefined();
      expect(res.body.data.subscription.paystackEmailToken).toBeUndefined();
      expect(res.body.data.subscription.invoices).toBeUndefined();
      expect(res.body.data.sso_config.idp_certificate).toBeUndefined();
      expect(res.body.data.sso_config.enabled).toBe(true);
    });
  });

  describe('CRIT-05 & HIGH-06: Staff Doctor 2FA login & referral case authorization', () => {
    it('completes Staff Doctor 2FA login without infinite challenge loop and isolates other doctors cases', async () => {
      const doctorSecret = generateTotpSecret();
      const practiceId = '507f1f77bcf86cd799439011';
      const docAId = '507f1f77bcf86cd799439012';
      const docBId = '507f1f77bcf86cd799439013';

      const challengeToken = jwt.sign(
        {
          purpose: '2fa_login',
          entityType: 'doctor',
          assessorId: practiceId,
          doctorId: docAId,
          email: 'doca@clinic.org',
          name: 'Dr A',
          role: 'doctor',
        },
        SECRET,
        { expiresIn: '5m' }
      );

      vi.spyOn(Doctor, 'findById').mockResolvedValue({
        _id: docAId,
        practiceId,
        email: 'doca@clinic.org',
        fullName: 'Dr A',
        role: 'doctor',
        specialty: 'Occupational Medicine',
        active: true,
        totp_enabled: true,
        totp_secret: doctorSecret,
        totp_recovery_codes_hashes: [],
      });
      vi.spyOn(Assessor, 'findById').mockResolvedValue({
        _id: practiceId,
        name: 'Lead',
        organization: 'Havilah Clinic',
        active: true,
      });

      const verifyRes = await request(app)
        .post('/api/v1/assessor/login/verify-2fa')
        .send({ temp_token: challengeToken, code: generateTotpCode(doctorSecret) });

      expect(verifyRes.status).toBe(200);
      expect(verifyRes.body.requires_2fa).toBeUndefined();
      expect(verifyRes.body.token).toBeTruthy();

      // Now use Dr A's token to attempt modifying or deleting Dr B's referral
      vi.spyOn(Referral, 'findById').mockResolvedValue({
        _id: '507f1f77bcf86cd799439099',
        assignedAssessorId: practiceId,
        assignedDoctorId: docBId,
        status: 'pending',
      });

      const patchRes = await request(app)
        .patch('/api/v1/assessor/referrals/507f1f77bcf86cd799439099/archive')
        .set('Authorization', `Bearer ${verifyRes.body.token}`)
        .send({ archive: true });
      expect(patchRes.status).toBe(403);

      const delRes = await request(app)
        .delete('/api/v1/assessor/referrals/507f1f77bcf86cd799439099')
        .set('Authorization', `Bearer ${verifyRes.body.token}`);
      expect(delRes.status).toBe(403);
      expect(delRes.body.error).toBe('CLINIC_ADMIN_REQUIRED');
    });
  });

  describe('CRIT-06: WebRTC signaling room ownership & cross-room hijack blocking', () => {
    it('blocks doctors from joining referrals outside their practice/assignment and blocks cross-room signal messages', async () => {
      vi.spyOn(Referral, 'findOne').mockImplementation(() =>
        createMockQuery({
          _id: 'ref-1',
          referenceCode: 'REF-ROOM01',
          assignedAssessorId: 'practice-A',
          assignedDoctorId: 'doc-A1',
        })
      );

      const otherPracticeToken = jwt.sign(
        { assessorId: 'practice-B', role: 'clinic_admin', isLeadAssessor: true },
        SECRET,
        { expiresIn: '1h' }
      );
      expect(await callSignalingHub.verifyRoomAccess('REF-ROOM01', 'doctor', otherPracticeToken)).toBe(false);

      const unassignedDocToken = jwt.sign(
        { assessorId: 'practice-A', doctorId: 'doc-A2', role: 'doctor', isLeadAssessor: false },
        SECRET,
        { expiresIn: '1h' }
      );
      expect(await callSignalingHub.verifyRoomAccess('REF-ROOM01', 'doctor', unassignedDocToken)).toBe(false);

      const assignedDocToken = jwt.sign(
        { assessorId: 'practice-A', doctorId: 'doc-A1', role: 'doctor', isLeadAssessor: false },
        SECRET,
        { expiresIn: '1h' }
      );
      expect(await callSignalingHub.verifyRoomAccess('REF-ROOM01', 'doctor', assignedDocToken)).toBe(true);

      // Cross-room signaling message hijack test
      const victimDoctorWs = { readyState: 1, send: vi.fn() };
      callSignalingHub.rooms.set('REF-VICTIM99', { doctor: victimDoctorWs, employee: null, callState: 'idle' });
      const attackerWs = { referenceCode: 'REF-OWN1', referenceCodes: ['REF-OWN1'], role: 'employee', readyState: 1, send: vi.fn() };

      await callSignalingHub.handleSignalMessage(attackerWs, {
        action: 'offer',
        referenceCode: 'REF-VICTIM99',
        offer: { type: 'offer', sdp: 'evil' },
      });

      expect(victimDoctorWs.send).not.toHaveBeenCalled();
      expect(callSignalingHub.rooms.get('REF-VICTIM99').employee).toBeNull();
      expect(attackerWs.send).toHaveBeenCalled();
      callSignalingHub.rooms.delete('REF-VICTIM99');
    });
  });

  describe('CRIT-07: SuperAdmin HR impersonation token claim normalization', () => {
    it('populates req.sessionData.company_id cleanly during impersonation', async () => {
      const adminKey = process.env.SUPER_ADMIN_KEY || 'test-super-admin-key-2026';
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-imp-1',
          company_name: 'Impersonated Corp',
          lifecycle_state: 'active',
          locked_at: null,
        })
      );
      vi.spyOn(AuditLog, 'append').mockResolvedValue({});
      vi.spyOn(Department, 'find').mockImplementation(() => createMockQuery([]));
      vi.spyOn(PersonalWellnessLog, 'countDocuments').mockResolvedValue(0);

      const impRes = await request(app)
        .post('/api/v1/superadmin/impersonate')
        .set('x-admin-key', adminKey)
        .send({ company_id: 'comp-imp-1' });

      expect(impRes.status).toBe(200);
      expect(impRes.body.impersonation_token).toBeTruthy();

      const analyticsRes = await request(app)
        .get('/api/v1/hr/analytics')
        .set('Authorization', `Bearer ${impRes.body.impersonation_token}`);
      expect(analyticsRes.status).toBe(200);
      expect(analyticsRes.body.company_name).toBe('Impersonated Corp');
    });
  });

  describe('HIGH-01, HIGH-02, HIGH-03, & MED-02: Onboarding, AuditLog, Purge & Cascade Delete', () => {
    it('enforces validateSession on /onboarding/bulk-import, uses $expr in /accept-consent, and accepts governance AuditLog enums', async () => {
      const unauthBulk = await request(app).post('/api/v1/onboarding/bulk-import').send({ employees: [] });
      expect(unauthBulk.status).toBe(401);

      // Verify AuditLog Mongoose schema accepts SuperAdmin & HR governance events without validation errors
      const governanceEvents = [
        'HR_IMPERSONATION_STARTED',
        'DATA_RETENTION_PURGE_EXECUTED',
        'TENANT_LOCKED',
        'TENANT_STATUS_CHANGED',
        'TENANT_SUBSCRIPTION_OVERRIDE',
        'TENANT_COPSOQ_DEPTH_UPDATED',
      ];
      for (const evt of governanceEvents) {
        const entry = new AuditLog({
          company_id: 'comp-1',
          actor_user_id: 'admin-1',
          actor_role: 'super_admin',
          event_type: evt,
          event_payload: { ok: true },
          sha256_hash: '0'.repeat(64),
        });
        await expect(entry.validate()).resolves.toBeUndefined();
      }
    });

    it('purges PersonalWellnessLog & AnonHazardLog by submitted_at and cascades deletes on tenant deletion', async () => {
      const adminKey = process.env.SUPER_ADMIN_KEY || 'test-super-admin-key-2026';
      const pwlDelSpy = vi.spyOn(PersonalWellnessLog, 'deleteMany').mockResolvedValue({ deletedCount: 4 });
      const anonDelSpy = vi.spyOn(AnonHazardLog, 'deleteMany').mockResolvedValue({ deletedCount: 3 });
      vi.spyOn(AuditLog, 'append').mockResolvedValue({});

      const purgeRes = await request(app)
        .post('/api/v1/superadmin/purge-data')
        .set('x-admin-key', adminKey)
        .send({ retention_months: 12 });

      expect(purgeRes.status).toBe(200);
      expect(purgeRes.body.purged_count).toBe(7);
      expect(pwlDelSpy.mock.calls[0][0]).toHaveProperty('submitted_at');
      expect(pwlDelSpy.mock.calls[0][0]).not.toHaveProperty('created_at');
      expect(anonDelSpy.mock.calls[0][0]).toHaveProperty('submitted_at');

      // Cascade delete check
      vi.spyOn(Tenant, 'findOne').mockResolvedValue({
        _id: '507f1f77bcf86cd799439055',
        company_id: 'comp-del-1',
        company_name: 'Delete Corp',
      });
      const spies = [
        vi.spyOn(User, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(Invitation, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(Department, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(DepartmentSnapshot, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(AssessmentCycle, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(Alert, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(Referral, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(Report, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(WhistleblowerReport, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(PendingNotification, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(PulseResponse, 'deleteMany').mockResolvedValue({}),
        vi.spyOn(Tenant, 'deleteOne').mockResolvedValue({}),
      ];

      const delRes = await request(app)
        .delete('/api/v1/superadmin/tenants/comp-del-1')
        .set('x-admin-key', adminKey);
      expect(delRes.status).toBe(200);
      for (const s of spies) expect(s).toHaveBeenCalled();
    });
  });

  describe('HIGH-04: K-anonymity (N >= 5) differencing attack prevention', () => {
    it('never pools above-threshold departments with <5 departments in company-wide rollups', async () => {
      vi.spyOn(AnonHazardLog, 'aggregate').mockImplementation(async (pipeline) => {
        const match = pipeline[0]?.$match || {};
        // Stage 1 group by department_id
        if (!match.department_id) {
          return [
            {
              _id: 'dept-eng',
              department_id: 'dept-eng',
              department_name: 'Engineering',
              parent_department_id: null,
              count: 5,
              meets_n_size: true,
              avg_composite: 80,
              avg_likelihood: 2,
              avg_severity: 2,
              severity_bands: ['healthy', 'healthy', 'healthy', 'healthy', 'healthy'],
              dimension_scores_list: [],
            },
            {
              _id: 'dept-legal',
              department_id: 'dept-legal',
              department_name: 'Legal',
              parent_department_id: null,
              count: 1,
              meets_n_size: false,
              avg_composite: 20,
              avg_likelihood: 4,
              avg_severity: 4,
              severity_bands: ['severe'],
              dimension_scores_list: [],
            },
          ];
        }
        // Roll-up query must ONLY filter to ['dept-legal']
        expect(match.department_id.$in).toEqual(['dept-legal']);
        return [
          {
            _id: null,
            count: 1,
            avg_composite: 20,
            avg_likelihood: 4,
            avg_severity: 4,
            severity_bands: ['severe'],
            dimension_scores_list: [],
          },
        ];
      });

      const results = await buildNSizeAggregation('comp-privacy');
      const eng = results.find((r) => r.department_id === 'dept-eng');
      const legalPool = results.find((r) => r.department_id === '__company_wide__');

      expect(eng.meets_n_size).toBe(true);
      expect(eng.response_count).toBe(5);
      expect(legalPool.meets_n_size).toBe(false);
      expect(legalPool.response_count).toBe(1);
      expect(legalPool.metrics).toBeNull();
    });
  });

  describe('HIGH-05: Strict rate limiting on /api/v1/whistleblower/track', () => {
    it('blocks PIN brute-force after 5 failed attempts with 429', async () => {
      vi.spyOn(Report, 'findOne').mockResolvedValue({
        trackingCode: 'WBL-999999',
        pinHash: bcrypt.hashSync('654321', 4),
      });

      let lastStatus = 200;
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/v1/whistleblower/track')
          .set('CF-Connecting-IP', '198.51.100.201')
          .send({ trackingCode: 'WBL-999999', pin: '000000' });
        lastStatus = res.status;
      }
      expect(lastStatus).toBe(429);
    });
  });

  describe('HIGH-07, HIGH-08, & HIGH-09: Auth 2FA cookies, session revocation, and scheduler trial email decryption', () => {
    it('sets both token and refreshToken cookies on user 2FA verification', async () => {
      const secret = generateTotpSecret();
      const tempToken = jwt.sign(
        {
          purpose: '2fa_login',
          entityType: 'user',
          userId: 'usr-2fa-cookies',
          companyId: 'comp-1',
          role: 'employee',
          status: 'active',
        },
        SECRET,
        { expiresIn: '5m' }
      );
      vi.spyOn(User, 'findOne').mockResolvedValue({
        user_id: 'usr-2fa-cookies',
        company_id: 'comp-1',
        department_id: 'dept-1',
        role: 'employee',
        status: 'active',
        full_name: 'Cookie User',
        totp_enabled: true,
        totp_secret: secret,
        totp_recovery_codes_hashes: [],
        save: vi.fn().mockResolvedValue(true),
      });

      const res = await request(app)
        .post('/api/v1/auth/login/verify-2fa')
        .send({ temp_token: tempToken, code: generateTotpCode(secret) });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'] || [];
      expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
      expect(cookies.some((c) => c.startsWith('refreshToken='))).toBe(true);
    });

    it('immediately rejects revoked/deleted/deactivated sessions in validateSession', async () => {
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-1', lifecycle_state: 'active', locked_at: null })
      );
      const userToken = jwt.sign(
        { userId: 'usr-revoked-01', companyId: 'comp-1', role: 'employee', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      revokeUserSession('usr-revoked-01');
      const revokedRes = await request(app)
        .get('/api/v1/learn/categories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(revokedRes.status).toBe(401);
      expect(revokedRes.body.error).toBe('SESSION_INVALID');
      clearUserSessionRevocation('usr-revoked-01');

      // Also verify deactivated DB user is rejected immediately
      vi.spyOn(User, 'findOne').mockImplementation(() =>
        createMockQuery({ user_id: 'usr-revoked-01', status: 'deactivated', role: 'employee' })
      );
      const deactRes = await request(app)
        .get('/api/v1/learn/categories')
        .set('Authorization', `Bearer ${userToken}`);
      expect(deactRes.status).toBe(401);
      expect(deactRes.body.error).toBe('SESSION_INVALID');
    });

    it('HIGH-01: /onboarding/accept-consent uses atomic $expr seat check and /bulk-import uses valid crypto helpers', async () => {
      const hrToken = jwt.sign(
        { userId: 'hr-onb-1', companyId: 'comp-onb', role: 'tenant_admin', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-onb',
          lifecycle_state: 'active',
          locked_at: null,
          used_seats: 1,
          max_allowed_seats: 10,
        })
      );
      vi.spyOn(Department, 'findOne').mockResolvedValue({ department_id: 'dept-ops', name: 'Operations' });
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(User.prototype, 'save').mockResolvedValue(true);

      const bulkRes = await request(app)
        .post('/api/v1/onboarding/bulk-import')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({
          employees: [
            { email: 'alice@onb.com', full_name: 'Alice', department_path: 'Operations', role: 'employee' },
          ],
        });
      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.created).toHaveLength(1);
      expect(bulkRes.body.errors).toEqual([]);

      // Verify /accept-consent passes $expr comparison instead of string literal
      const mockPendingUser = {
        user_id: 'usr-pend-1',
        company_id: 'comp-onb',
        role: 'employee',
        status: 'pending_consent',
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockResolvedValue(mockPendingUser);
      const findUpdateSpy = vi.spyOn(Tenant, 'findOneAndUpdate').mockResolvedValue({ company_id: 'comp-onb', used_seats: 2 });
      vi.spyOn(AuditLog, 'append').mockResolvedValue({});

      const consentRes = await request(app)
        .post('/api/v1/onboarding/accept-consent')
        .send({ token: 'consent-tok-1' });
      expect(consentRes.status).toBe(200);
      expect(findUpdateSpy.mock.calls[0][0]).toEqual({
        company_id: 'comp-onb',
        $expr: { $lt: ['$used_seats', '$max_allowed_seats'] },
      });
    });

    it('MED-03 & LOW-01: enforces atomic seat claim in registration and blocks missing JWT_SECRET in production assessorAuth', async () => {
      // Simulate lost seat race during /auth/register when Tenant.updateOne returns modifiedCount: 0
      vi.spyOn(Tenant, 'findOne').mockResolvedValue({
        company_id: 'comp-race',
        used_seats: 4,
        max_allowed_seats: 5,
      });
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      const seatSpy = vi.spyOn(Tenant, 'updateOne').mockResolvedValue({ modifiedCount: 0 });
      const userCreateSpy = vi.spyOn(User, 'create').mockResolvedValue({});
      vi.spyOn(require('../models/Invitation'), 'findOne').mockResolvedValue({
        activation_code: 'RACE-123',
        company_id: 'comp-race',
        status: 'active',
      });

      const regRes = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email: 'latecomer@race.com',
          fullName: 'Late User',
          password: 'StrongPassword!2026',
          code: 'RACE-123',
        });
      expect(regRes.status).toBe(400);
      expect(regRes.body.error).toBe('SEAT_LIMIT_EXCEEDED');
      expect(userCreateSpy).not.toHaveBeenCalled();
      expect(seatSpy.mock.calls[0][0]).toEqual({
        company_id: 'comp-race',
        $expr: { $lt: ['$used_seats', '$max_allowed_seats'] },
      });

      // Production guard in assessorAuth
      const { requireAssessorAuth } = require('../middleware/assessorAuth');
      const prevEnv = process.env.NODE_ENV;
      const prevSecret = process.env.JWT_SECRET;
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      let statusSent = null;
      const resMock = { status: (c) => ({ json: () => { statusSent = c; } }) };
      await requireAssessorAuth({ headers: { authorization: 'Bearer abc.def.ghi' } }, resMock, () => {});
      process.env.NODE_ENV = prevEnv;
      process.env.JWT_SECRET = prevSecret;
      expect(statusSent).toBe(500);
    });

    it('decrypts JSON-stringified email_encrypted for HR admins in processTrialReminders', async () => {
      const mockTenant = {
        company_id: 'comp-trial-1',
        company_name: 'Trial Corp',
        lifecycle_state: 'active',
        subscription: {
          status: 'trialing',
          trialEndsAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
          remindersSent: [],
        },
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(Tenant, 'find').mockResolvedValue([mockTenant]);
      vi.spyOn(User, 'findOne').mockResolvedValue({
        email_encrypted: JSON.stringify(encryptField('hr.owner@trialcorp.com')),
      });
      const mailSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({ success: true });

      const sent = await processTrialReminders(new Date());
      expect(sent).toHaveLength(1);
      expect(mailSpy).toHaveBeenCalledWith(expect.objectContaining({ to: 'hr.owner@trialcorp.com' }));
    });
  });

  describe('HIGH-10: Clinical polarity fixes in Learn, Wellness Dashboard, and CorrelationEngine', () => {
    it('does not trigger burnout/crisis focus areas for healthy PHQ-9 scores and uses correct PHQ-9/GAD-7 fallback math', async () => {
      const token = jwt.sign(
        { userId: 'usr-healthy', companyId: 'comp-h', role: 'employee', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-h', lifecycle_state: 'active', locked_at: null })
      );
      vi.spyOn(PersonalWellnessLog, 'find').mockImplementation(() =>
        createMockQuery([
          {
            user_id: 'usr-healthy',
            survey_type: 'phq9',
            composite_score: 100, // 100 = optimal wellbeing
            clinical_score: 0, // 0 = minimal depression
            dimension_scores: { mood: 100 },
            submitted_at: new Date(),
          },
        ])
      );
      vi.spyOn(HealthArticle, 'find').mockImplementation(() => createMockQuery([]));

      const learnRes = await request(app)
        .get('/api/v1/learn/recommended')
        .set('Authorization', `Bearer ${token}`);
      expect(learnRes.status).toBe(200);
      expect(learnRes.body.focus_areas).toEqual([]);

      // Also check dashboard-data fallback clinical_score for legacy PHQ-9/GAD-7 logs without clinical_score
      vi.spyOn(User, 'findOne').mockResolvedValue({ user_id: 'usr-healthy', baseline_profile: {} });
      vi.spyOn(PersonalWellnessLog, 'find').mockImplementation(() =>
        createMockQuery([
          { survey_type: 'phq9', composite_score: 90, submitted_at: new Date() },
          { survey_type: 'gad7', composite_score: 90, submitted_at: new Date() },
        ])
      );

      const dashRes = await request(app)
        .get('/api/v1/wellness/dashboard-data')
        .set('Authorization', `Bearer ${token}`);
      expect(dashRes.status).toBe(200);
      expect(dashRes.body.history[0].clinical_score).toBe(3); // round(0.1 * 27) = 3, NOT 24
      expect(dashRes.body.history[1].clinical_score).toBe(2); // round(0.1 * 21) = 2, NOT 19

      // CorrelationEngine cutoffs (0-100% scale from hazardController)
      const lowRiskInsights = generateInsights({
        phq9: { avg_composite_score: 15 }, // < 37%
        gad7: { avg_composite_score: 20 }, // < 47.6%
        pss10: { avg_composite_score: 30 }, // < 67.5%
        fas10: { avg_composite_score: 25 }, // < 30%
      });
      expect(lowRiskInsights).toHaveLength(0);

      const highRiskInsights = generateInsights({
        phq9: { avg_composite_score: 45 },
        pss10: { avg_composite_score: 70 },
        fas10: { avg_composite_score: 40 },
      });
      expect(highRiskInsights.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('MED-01, MED-04, MED-05 & CRIT-08: Regex safety, SSO domain binding, Demo email escaping, Frontend XSS & mirror parity', () => {
    it('safely handles regex metacharacters in search queries without throwing 500', async () => {
      const token = jwt.sign(
        { userId: 'usr-reg', companyId: 'comp-reg', role: 'hr_admin', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-reg', lifecycle_state: 'active', locked_at: null })
      );
      vi.spyOn(PersonalWellnessLog, 'aggregate').mockResolvedValue([]);
      vi.spyOn(HealthArticle, 'find').mockImplementation(() => createMockQuery([]));
      vi.spyOn(HealthArticle, 'countDocuments').mockResolvedValue(0);

      const learnSearch = await request(app)
        .get('/api/v1/learn/articles?search=(unclosed%5Bbracket*?')
        .set('Authorization', `Bearer ${token}`);
      expect(learnSearch.status).toBe(200);

      const trendsSearch = await request(app)
        .get('/api/v1/hr/trends?survey_type=(phq9%5B')
        .set('Authorization', `Bearer ${token}`);
      expect(trendsSearch.status).toBe(200);
    });

    it('rejects SSO email domain mismatch in /sso/callback and HTML injection in /demo-request', async () => {
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-sso-dom',
          domain: 'trusted.org',
          lifecycle_state: 'active',
          sso_config: { enabled: true },
        })
      );
      vi.spyOn(samlUtil, 'validateSamlResponse').mockResolvedValue({
        profile: { email: 'attacker@evil.com', displayName: 'Evil' },
      });

      const ssoRes = await request(app)
        .post('/api/v1/sso/callback')
        .send({ SAMLResponse: 'valid-base64', RelayState: 'comp-sso-dom' });
      expect(ssoRes.status).toBe(403);
      expect(ssoRes.body.error).toBe('SSO_DOMAIN_MISMATCH');

      const demoRes = await request(app)
        .post('/api/v1/demo-request')
        .send({ email: '<script>alert(1)</script>@attacker.com' });
      expect(demoRes.status).toBe(400);
    });

    it('enforces XSS escaping in superadmin.js, assessorPortal.js, dashboard.html and dashboard mirror parity', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const dashA = fs.readFileSync(path.join(rootDir, 'app/dashboard.html'), 'utf8');
      const dashB = fs.readFileSync(path.join(rootDir, 'private/app/dashboard.html'), 'utf8');
      expect(dashA).toBe(dashB);
      expect(dashA).not.toContain('X-User-Email');
      expect(dashA).toContain('isSafeHttpUrl');
      expect(dashA).toContain('sanitizeSafeAttachmentHref');

      const superadminJs = fs.readFileSync(path.join(rootDir, 'public/js/superadmin.js'), 'utf8');
      expect(superadminJs).toContain('escapeJsAttrSafe');
      expect(superadminJs).toContain('${escapeHtmlSafe(t.company_name)}');

      const assessorJs = fs.readFileSync(path.join(rootDir, 'public/js/assessorPortal.js'), 'utf8');
      expect(assessorJs).toContain('escapeJsAttr');
      expect(assessorJs).toContain('sanitizeSafeHref');
      expect(assessorJs).toContain('${escapeHtml(patientName)}');
    });
  });

  describe('Follow-up Review Remediations (R1, R2, R4, R5, R7, R9)', () => {
    it('R1: allows repeated valid /whistleblower/track live-sync polls (200) while still blocking invalid PIN brute-force (429)', async () => {
      vi.spyOn(Report, 'findOne').mockResolvedValue({
        trackingCode: 'WBL-LIVE01',
        pinHash: bcrypt.hashSync('123456', 4),
        category: 'Ethics',
        urgency: 'Standard',
        status: 'submitted',
        description: 'Live sync check',
        involvesLeadershipOrHR: false,
        thread: [],
      });

      // 8 consecutive valid polls from the same client IP must all succeed
      for (let i = 0; i < 8; i++) {
        const res = await request(app)
          .post('/api/v1/whistleblower/track')
          .set('CF-Connecting-IP', '198.51.100.210')
          .send({ trackingCode: 'WBL-LIVE01', pin: '123456' });
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      }

      // 6 consecutive wrong PINs from another IP still hit 429 on attempt #6
      let lastBadStatus = 401;
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/v1/whistleblower/track')
          .set('CF-Connecting-IP', '198.51.100.211')
          .send({ trackingCode: 'WBL-LIVE01', pin: '999999' });
        lastBadStatus = res.status;
      }
      expect(lastBadStatus).toBe(429);
    });

    it('R2: Paystack webhook charge.success rejects underpaid tier tampering and accepts valid planCode payments', async () => {
      const secret = 'sk_test_webhook_r2_secret_2026';
      process.env.PAYSTACK_SECRET_KEY = secret;
      process.env.PAYSTACK_PLAN_PRO = 'PLN_pro_valid_2026';

      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-r2',
          lifecycle_state: 'active',
          billing_tier: 'starter',
          subscription: { transactionReferences: [] },
        })
      );
      const updateSpy = vi.spyOn(Tenant, 'findOneAndUpdate').mockResolvedValue({ company_id: 'comp-r2' });
      vi.spyOn(AssessmentCycle, 'updateMany').mockResolvedValue({ modifiedCount: 0 });
      vi.spyOn(AuditLog, 'append').mockResolvedValue({});

      // Underpaid pro upgrade attempt via webhook
      const badPayload = JSON.stringify({
        event: 'charge.success',
        data: {
          reference: 'PAY-TAMPERED-1',
          amount: 100, // 1 GHS for pro tier
          currency: 'GHS',
          metadata: { company_id: 'comp-r2', tier: 'pro' },
        },
      });
      const badSig = crypto.createHmac('sha512', secret).update(badPayload).digest('hex');
      const badRes = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', badSig)
        .set('Content-Type', 'application/json')
        .send(badPayload);
      expect(badRes.status).toBe(200);
      expect(updateSpy).not.toHaveBeenCalled();

      // Valid planCode webhook payment
      const planPayload = JSON.stringify({
        event: 'charge.success',
        data: {
          reference: 'PAY-PLAN-PRO-1',
          amount: 1545000,
          currency: 'GHS',
          plan: { plan_code: 'PLN_pro_valid_2026' },
          metadata: { company_id: 'comp-r2', tier: 'pro' },
        },
      });
      const planSig = crypto.createHmac('sha512', secret).update(planPayload).digest('hex');
      const planRes = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', planSig)
        .set('Content-Type', 'application/json')
        .send(planPayload);
      expect(planRes.status).toBe(200);
      expect(updateSpy).toHaveBeenCalledTimes(1);

      delete process.env.PAYSTACK_PLAN_PRO;
      delete process.env.PAYSTACK_SECRET_KEY;
    });

    it('R4: /auth/change-password returns a fresh active token and revokes the previous token immediately', async () => {
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-r4', lifecycle_state: 'active', locked_at: null })
      );
      const oldPasswordHash = bcrypt.hashSync('OldPass#123', 4);
      const mockUser = {
        user_id: 'usr-r4-pw',
        company_id: 'comp-r4',
        department_id: 'dept-1',
        role: 'employee',
        status: 'active',
        token_version: 0,
        passwordHash: oldPasswordHash,
        save: vi.fn().mockResolvedValue(true),
      };
      vi.spyOn(User, 'findOne').mockResolvedValue(mockUser);
      vi.spyOn(HealthArticle, 'aggregate').mockResolvedValue([]);

      const oldToken = jwt.sign(
        { userId: 'usr-r4-pw', companyId: 'comp-r4', role: 'employee', status: 'active', tv: 0 },
        SECRET,
        { expiresIn: '1h' }
      );

      const changeRes = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${oldToken}`)
        .send({ currentPassword: 'OldPass#123', newPassword: 'NewStrongPass#2026' });

      expect(changeRes.status).toBe(200);
      expect(changeRes.body.success).toBe(true);
      expect(changeRes.body.token).toBeTruthy();
      expect(mockUser.token_version).toBe(1);

      // Old token must be rejected
      const oldCheck = await request(app)
        .get('/api/v1/learn/categories')
        .set('Authorization', `Bearer ${oldToken}`);
      expect(oldCheck.status).toBe(401);
      expect(oldCheck.body.error).toBe('SESSION_INVALID');

      // New token must remain authorized
      const newCheck = await request(app)
        .get('/api/v1/learn/categories')
        .set('Authorization', `Bearer ${changeRes.body.token}`);
      expect(newCheck.status).toBe(200);

      clearUserSessionRevocation('usr-r4-pw');
    });

    it('R5: rate-limits failed /referrals/status/:referenceCode guesses without blocking valid 2.5s polls', async () => {
      vi.spyOn(Referral, 'findOne').mockImplementation((query) => {
        if (query && query.referenceCode === 'REF-VALID01') {
          return createMockQuery({
            referenceCode: 'REF-VALID01',
            status: 'scheduled',
            thread: [],
            clinicalDetails: {},
          });
        }
        return createMockQuery(null);
      });

      // Valid live-sync polls > 10 times succeed
      for (let i = 0; i < 12; i++) {
        const okRes = await request(app)
          .get('/api/v1/referrals/status/REF-VALID01')
          .set('CF-Connecting-IP', '198.51.100.220');
        expect(okRes.status).toBe(200);
      }

      // 11 consecutive 404 guesses hit 429
      let last404Status = 404;
      for (let i = 0; i < 11; i++) {
        const missRes = await request(app)
          .get('/api/v1/referrals/status/REF-GUESS' + i)
          .set('CF-Connecting-IP', '198.51.100.221');
        last404Status = missRes.status;
      }
      expect(last404Status).toBe(429);
    });

    it('R7: UserSchema persists consent_token/consent_accepted_at, makes passwordHash optional for pending_consent, and allows hr_admin bulk-import', async () => {
      const pendingUser = new User({
        company_id: 'comp-r7',
        department_id: 'dept-1',
        email_hash: hashField('pending@r7.org'),
        email_encrypted: JSON.stringify(encryptField('pending@r7.org')),
        full_name: 'Pending Employee',
        role: 'employee',
        status: 'pending_consent',
        consent_token: 'consent-uuid-123',
        consent_token_expires_at: new Date(Date.now() + 3600000),
      });
      await expect(pendingUser.validate()).resolves.toBeUndefined();
      expect(pendingUser.consent_token).toBe('consent-uuid-123');
      expect(pendingUser.consent_token_expires_at).toBeInstanceOf(Date);

      // Verify hr_admin can access /onboarding/bulk-import
      const hrToken = jwt.sign(
        { userId: 'hr-r7', companyId: 'comp-r7', role: 'hr_admin', status: 'active' },
        SECRET,
        { expiresIn: '1h' }
      );
      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({ company_id: 'comp-r7', lifecycle_state: 'active', used_seats: 0, max_allowed_seats: 10 })
      );
      vi.spyOn(Department, 'findOne').mockResolvedValue({ department_id: 'dept-hr', name: 'HR' });
      vi.spyOn(User, 'findOne').mockResolvedValue(null);
      vi.spyOn(User.prototype, 'save').mockResolvedValue(true);

      const bulkRes = await request(app)
        .post('/api/v1/onboarding/bulk-import')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ employees: [{ email: 'emp@r7.org', full_name: 'Emp R7', department_path: 'HR', role: 'employee' }] });
      expect(bulkRes.status).toBe(200);
      expect(bulkRes.body.created).toHaveLength(1);
    });

    it('R9: hrDashboard.js escapes table/thread interpolations with escapeHrHtml', () => {
      const rootDir = path.resolve(__dirname, '../..');
      const hrJs = fs.readFileSync(path.join(rootDir, 'public/js/hrDashboard.js'), 'utf8');
      expect(hrJs).toContain('${escapeHrHtml(r.trackingCode');
      expect(hrJs).toContain('${escapeHrHtml(r.category');
      expect(hrJs).toContain('${escapeHrHtml(r.referenceCode');
      expect(hrJs).toContain('${escapeHrHtml(msg.message');
      expect(hrJs).toContain('const safeDeptName = escapeHrHtml(invite.department_name)');
    });
  });
});
