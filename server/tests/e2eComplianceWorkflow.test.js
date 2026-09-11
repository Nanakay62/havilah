'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const WhistleblowerReport = require('../models/WhistleblowerReport');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');

const Department = require('../models/Department');
const AnonHazardLog = require('../models/AnonHazardLog');

describe('End-to-End ISO 45003 Compliance Lifecycle Integration Suite (Stage 3 Gate)', () => {
  const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
  const COMPANY_ID = 'e2e-acme-test-id';
  const DEPT_ID = 'e2e-eng-dept-id';

  const mockActiveTenant = {
    _id: '66e1f0a00000000000000001',
    company_id: COMPANY_ID,
    company_name: 'Acme Test Labs Ltd',
    domain: 'acmetest.org',
    lifecycle_state: 'active',
    locked_at: null,
    access_expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
    billing_tier: 'professional',
    used_seats: 3,
    max_allowed_seats: 50,
    benchmark_sharing_opt_in: true,
  };

  const hrAdminToken = jwt.sign(
    {
      userId: 'usr-hr-admin-01',
      companyId: COMPANY_ID,
      departmentId: DEPT_ID,
      role: 'hr_admin',
    },
    TEST_SECRET,
    { expiresIn: '2h' }
  );

  const employeeToken = jwt.sign(
    {
      userId: 'usr-employee-01',
      companyId: COMPANY_ID,
      departmentId: DEPT_ID,
      role: 'employee',
    },
    TEST_SECRET,
    { expiresIn: '2h' }
  );

  // Reusable chainable Mongoose mock query builder
  const createMockQuery = (data) => ({
    select: () => createMockQuery(data),
    sort: () => createMockQuery(data),
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
  });

  beforeEach(() => {
    Department.findOne = () => createMockQuery({ name: 'Engineering', department_id: DEPT_ID });
    Department.find = () => createMockQuery([{ name: 'Engineering', department_id: DEPT_ID }]);
    AnonHazardLog.prototype.save = async () => ({});
  });

  // -------------------------------------------------------------------------
  // Stage 1: Tenant Lifecycle & Access Enforcement
  // -------------------------------------------------------------------------
  describe('Step 1: Tenant Lifecycle & Access Status Enforcement', () => {
    it('blocks access when tenant lifecycle_state is suspended with 403 TENANT_SUSPENDED', async () => {
      const originalFindOne = Tenant.findOne;
      try {
        Tenant.findOne = () =>
          createMockQuery({
            ...mockActiveTenant,
            lifecycle_state: 'suspended',
            locked_at: new Date(),
          });

        const res = await request(app)
          .get('/api/v1/hr/analytics')
          .set('Authorization', `Bearer ${hrAdminToken}`);

        expect(res.status).toBe(403);
        expect(res.body.code).toBe('TENANT_SUSPENDED');
      } finally {
        Tenant.findOne = originalFindOne;
      }
    });

    it('blocks access when tenant subscription access has expired with 403', async () => {
      const originalFindOne = Tenant.findOne;
      const originalUpdateOne = Tenant.updateOne;
      try {
        Tenant.findOne = () =>
          createMockQuery({
            ...mockActiveTenant,
            access_expires_at: new Date(Date.now() - 24 * 60 * 60 * 1000), // Expired yesterday
          });
        Tenant.updateOne = async () => ({ modifiedCount: 1 });

        const res = await request(app)
          .get('/api/v1/hr/analytics')
          .set('Authorization', `Bearer ${hrAdminToken}`);

        expect(res.status).toBe(403);
        expect(res.body.error).toContain('Access expired');
      } finally {
        Tenant.findOne = originalFindOne;
        Tenant.updateOne = originalUpdateOne;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stage 2: Corporate Email & Invitation Code Verification
  // -------------------------------------------------------------------------
  describe('Step 2: Corporate Invitation Verification Workflow', () => {
    it('rejects verification when activation code is missing or unresolvable', async () => {
      const originalFindOne = Invitation.findOne;
      try {
        Invitation.findOne = async () => null;

        const res = await request(app)
          .post('/api/v1/auth/verify-invite')
          .send({ code: 'INVALID-CODE-999' });

        expect(res.status).toBe(400);
        expect(res.body.success).toBe(false);
      } finally {
        Invitation.findOne = originalFindOne;
      }
    });

    it('verifies valid activation code and locks department context', async () => {
      const originalFindOneInvite = Invitation.findOne;
      const originalFindOneTenant = Tenant.findOne;
      try {
        Invitation.findOne = async () => ({
          activation_code: 'WF-ENG-88AB',
          company_id: COMPANY_ID,
          department_id: DEPT_ID,
          status: 'active',
          expires_at: new Date(Date.now() + 86400000),
        });

        Tenant.findOne = () => createMockQuery(mockActiveTenant);

        const res = await request(app)
          .post('/api/v1/auth/verify-invite')
          .send({ code: 'WF-ENG-88AB' });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.companyName).toBe(mockActiveTenant.company_name);
        expect(res.body.companyId).toBe(COMPANY_ID);
      } finally {
        Invitation.findOne = originalFindOneInvite;
        Tenant.findOne = originalFindOneTenant;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stage 3: Employee Account Activation & Password Security Gate
  // -------------------------------------------------------------------------
  describe('Step 3: Employee Account Activation & Security Gate', () => {
    it('rejects activation attempt if password fails complexity rules', async () => {
      const res = await request(app)
        .post('/api/v1/auth/activate')
        .send({
          email: 'alice@acmetest.org',
          fullName: 'Alice Test',
          password: 'simplepassword', // Lacks length >= 12, uppercase, numbers, symbols
          code: 'WF-ENG-88AB',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('WEAK_PASSWORD');
    });

    it('successfully activates account and returns token when all criteria pass', async () => {
      const originalFindOneInvite = Invitation.findOne;
      const originalFindOneTenant = Tenant.findOne;
      const originalFindOneUser = User.findOne;
      const originalCreateUser = User.create;
      const originalUpdateTenant = Tenant.updateOne;
      try {
        Invitation.findOne = async () => ({
          activation_code: 'WF-ENG-88AB',
          company_id: COMPANY_ID,
          department_id: DEPT_ID,
          status: 'active',
          usage_count: 0,
          expires_at: new Date(Date.now() + 86400000),
          save: async () => {},
        });

        Tenant.findOne = () => createMockQuery(mockActiveTenant);
        User.findOne = async () => null; // No existing account

        User.create = async (doc) => {
          const data = Array.isArray(doc) ? doc[0] : doc;
          return {
            user_id: 'usr-activated-999',
            role: 'employee',
            full_name: data.full_name,
            company_id: data.company_id,
            department_id: data.department_id,
          };
        };

        Tenant.updateOne = async () => ({ modifiedCount: 1 });

        const res = await request(app)
          .post('/api/v1/auth/activate')
          .send({
            email: 'alice@acmetest.org',
            fullName: 'Alice Test',
            password: 'Compliant#Password2026!',
            code: 'WF-ENG-88AB',
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(res.body.user).toHaveProperty('user_id');
      } finally {
        Invitation.findOne = originalFindOneInvite;
        Tenant.findOne = originalFindOneTenant;
        User.findOne = originalFindOneUser;
        User.create = originalCreateUser;
        Tenant.updateOne = originalUpdateTenant;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stage 4: Psychosocial Pulse Check-in Ingestion
  // -------------------------------------------------------------------------
  describe('Step 4: Psychosocial Micro Pulse Ingestion', () => {
    it('rejects unauthenticated pulse check-in submissions with 401', async () => {
      const res = await request(app)
        .post('/api/v1/wellness/daily-pulse')
        .send({ mood: 4, calm: 4, stress: 2, energy: 3, work_fit: 5 });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('ingests 5-dimension pulse check-in and updates baseline profile for authenticated user', async () => {
      const originalFindOneTenant = Tenant.findOne;
      const originalFindOneUser = User.findOne;
      const originalCreateLog = PersonalWellnessLog.create;
      try {
        Tenant.findOne = () => createMockQuery(mockActiveTenant);
        User.findOne = async () => ({
          user_id: 'usr-employee-01',
          baseline_profile: {},
          save: async () => {},
        });
        PersonalWellnessLog.create = async (doc) => ({ _id: 'mock-log-id', ...doc });

        const res = await request(app)
          .post('/api/v1/wellness/daily-pulse')
          .set('Authorization', `Bearer ${employeeToken}`)
          .send({ mood: 4, calm: 4, stress: 2, energy: 3, work_fit: 5 });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.baseline_profile).toBeDefined();
      } finally {
        Tenant.findOne = originalFindOneTenant;
        User.findOne = originalFindOneUser;
        PersonalWellnessLog.create = originalCreateLog;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stage 5: Department Anonymity Privacy Firewall Enforcement (N >= 5)
  // -------------------------------------------------------------------------
  describe('Step 5: Privacy Firewall Enforcement (N >= 5 Anonymity Threshold)', () => {
    it('suppresses granular department analytics when cohort response count is under 5', async () => {
      const originalFindOneTenant = Tenant.findOne;
      const originalCountDocs = PersonalWellnessLog.countDocuments;
      const originalAggregate = PersonalWellnessLog.aggregate;
      try {
        Tenant.findOne = () => createMockQuery(mockActiveTenant);
        PersonalWellnessLog.countDocuments = async () => 3;
        PersonalWellnessLog.aggregate = async () => [
          {
            _id: null,
            total_responses: 3, // < 5 threshold
            avgMood: 75,
          },
        ];

        const res = await request(app)
          .get('/api/v1/hr/analytics')
          .set('Authorization', `Bearer ${hrAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.status).toBe('SUPPRESSED');
        expect(res.body.meets_n_threshold).toBe(false);
        expect(res.body.N_threshold).toBe(5);
        expect(res.body.total_responses).toBe(3);
      } finally {
        Tenant.findOne = originalFindOneTenant;
        PersonalWellnessLog.countDocuments = originalCountDocs;
        PersonalWellnessLog.aggregate = originalAggregate;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stage 6: Encrypted Whistleblower Vault Filing & Identity Scrubbing
  // -------------------------------------------------------------------------
  describe('Step 6: Anonymous Encrypted Whistleblower Vault Submission', () => {
    it('rejects vault submission lacking required category or description', async () => {
      const originalFindOneTenant = Tenant.findOne;
      try {
        Tenant.findOne = () => createMockQuery(mockActiveTenant);

        const res = await request(app)
          .post('/api/v1/vault/submit')
          .set('Authorization', `Bearer ${employeeToken}`)
          .send({ category: '' });

        expect(res.status).toBe(400);
        expect(res.body.error).toBe('VALIDATION_ERROR');
      } finally {
        Tenant.findOne = originalFindOneTenant;
      }
    });

    it('persists encrypted report without attaching user_id identity', async () => {
      const originalFindOneTenant = Tenant.findOne;
      const originalCreateReport = WhistleblowerReport.create;
      let persistedPayload = null;

      try {
        Tenant.findOne = () => createMockQuery(mockActiveTenant);
        WhistleblowerReport.create = async (payload) => {
          persistedPayload = payload;
          return {
            report_id: 'WB-TEST-889900',
            ...payload,
          };
        };

        const res = await request(app)
          .post('/api/v1/vault/submit')
          .set('Authorization', `Bearer ${employeeToken}`)
          .send({
            category: 'Psychosocial Safety Hazard',
            description: 'Excessive overtime and structural lack of role clarity identified.',
            urgency: 'high',
          });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.report_id).toBe('WB-TEST-889900');

        // Verify whistleblower security invariants:
        // 1. User ID must NOT be stored anywhere on the report object
        expect(persistedPayload.user_id).toBeUndefined();
        // 2. Company ID is retained for tenant context
        expect(persistedPayload.company_id).toBe(COMPANY_ID);
        // 3. Raw description must NOT be stored in plaintext
        expect(persistedPayload.description).toBeUndefined();
        // 4. Encrypted ciphertext, IV, and auth tag are saved
        expect(persistedPayload.description_encrypted).toBeDefined();
        expect(persistedPayload.description_iv).toBeDefined();
        expect(persistedPayload.description_tag).toBeDefined();
      } finally {
        Tenant.findOne = originalFindOneTenant;
        WhistleblowerReport.create = originalCreateReport;
      }
    });
  });

  // -------------------------------------------------------------------------
  // Stage 7: Cross-Tenant Dynamic ISO 45003 Industry Benchmark Aggregation
  // -------------------------------------------------------------------------
  describe('Step 7: Cross-Tenant Dynamic Industry Benchmark Aggregation', () => {
    it('provides aggregated cross-tenant benchmarks to authorized HR admin', async () => {
      const originalFindOneTenant = Tenant.findOne;
      const originalCountTenants = Tenant.countDocuments;
      const originalAggregateLog = PersonalWellnessLog.aggregate;

      try {
        Tenant.findOne = () => createMockQuery(mockActiveTenant);
        Tenant.countDocuments = async () => 3;

        PersonalWellnessLog.aggregate = async () => [
          {
            _id: 'COPSOQ3_SHORT',
            avgScore: 58.4,
            count: 42,
          },
          {
            _id: 'PHQ9',
            avgScore: 6.2,
            count: 28,
          },
        ];

        const res = await request(app)
          .get('/api/v1/hr/benchmarks')
          .set('Authorization', `Bearer ${hrAdminToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.total_active_organizations).toBe(3);
        expect(res.body.benchmarks).toBeDefined();
        expect(res.body.benchmarks.COPSOQ3_SHORT).toHaveProperty('average_score', 58.4);
        expect(res.body.benchmarks.COPSOQ3_SHORT).toHaveProperty('sample_size', 42);
        expect(res.body.benchmarks.COPSOQ3_SHORT).toHaveProperty('industry_confidence', 'High');
        expect(res.body.benchmarks.PHQ9).toHaveProperty('average_score', 6.2);
      } finally {
        Tenant.findOne = originalFindOneTenant;
        Tenant.countDocuments = originalCountTenants;
        PersonalWellnessLog.aggregate = originalAggregateLog;
      }
    });
  });
});
