'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { requireConsent, validateSession } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');

describe('Consent Enforcement, Audit Hash-Chain Verification, & Tier Normalization', () => {
  const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
  const COMPANY_ID = 'comp-consent-audit-test';

  describe('1. requireConsent Middleware & Session Status Flow', () => {
    it('blocks request with 403 CONSENT_REQUIRED when user status is pending_consent', () => {
      const req = {
        sessionData: {
          user_id: 'usr-pending',
          company_id: COMPANY_ID,
          role: 'employee',
          status: 'pending_consent',
        },
      };

      let statusSent = null;
      let jsonSent = null;
      const res = {
        status: (code) => {
          statusSent = code;
          return {
            json: (data) => {
              jsonSent = data;
            },
          };
        },
      };

      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      requireConsent(req, res, next);

      expect(nextCalled).toBe(false);
      expect(statusSent).toBe(403);
      expect(jsonSent.error).toBe('CONSENT_REQUIRED');
      expect(jsonSent.message).toContain('pending_consent');
    });

    it('allows request when user status is active', () => {
      const req = {
        sessionData: {
          user_id: 'usr-active',
          company_id: COMPANY_ID,
          role: 'employee',
          status: 'active',
        },
      };

      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      requireConsent(req, {}, next);
      expect(nextCalled).toBe(true);
    });

    it('populates status: pending_consent from JWT into req.sessionData', async () => {
      const token = jwt.sign(
        {
          userId: 'usr-pending-jwt',
          companyId: COMPANY_ID,
          role: 'employee',
          status: 'pending_consent',
        },
        TEST_SECRET,
        { expiresIn: '1h' }
      );

      const req = {
        headers: { authorization: `Bearer ${token}` },
        cookies: {},
      };

      let nextCalled = false;
      const next = () => {
        nextCalled = true;
      };

      const originalFindOne = Tenant.findOne;
      Tenant.findOne = () => ({
        select: () => ({
          lean: () => Promise.resolve({ company_id: COMPANY_ID, locked_at: null }),
        }),
      });

      try {
        await validateSession(req, {}, next);
      } finally {
        Tenant.findOne = originalFindOne;
      }

      expect(nextCalled).toBe(true);
      expect(req.sessionData).toBeDefined();
      expect(req.sessionData.status).toBe('pending_consent');

      // Now pass this req into requireConsent - it must reject
      let statusSent = null;
      let jsonSent = null;
      const res = {
        status: (code) => {
          statusSent = code;
          return {
            json: (data) => {
              jsonSent = data;
            },
          };
        },
      };

      let consentNextCalled = false;
      requireConsent(req, res, () => {
        consentNextCalled = true;
      });

      expect(consentNextCalled).toBe(false);
      expect(statusSent).toBe(403);
      expect(jsonSent.error).toBe('CONSENT_REQUIRED');
    });
  });

  describe('2. GET /api/v1/hr/audit/verify-chain', () => {
    const hrToken = jwt.sign(
      {
        userId: 'hr-auditor-01',
        companyId: COMPANY_ID,
        role: 'hr_admin',
        status: 'active',
      },
      TEST_SECRET,
      { expiresIn: '1h' }
    );

    it('returns successful verification result for audit log chain', async () => {
      const originalVerifyChain = AuditLog.verifyChain;
      const originalTenantFindOne = Tenant.findOne;
      const createMockQuery = (data) => ({
        select: () => createMockQuery(data),
        lean: () => Promise.resolve(data),
        then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
      });

      try {
        Tenant.findOne = () =>
          createMockQuery({
            company_id: COMPANY_ID,
            lifecycle_state: 'active',
            locked_at: null,
            access_expires_at: new Date(Date.now() + 86400000),
          });

        AuditLog.verifyChain = async (cid) => ({
          valid: true,
          entries_checked: 42,
          broken_at: null,
        });

        const res = await request(app)
          .get('/api/v1/hr/audit/verify-chain')
          .set('Authorization', `Bearer ${hrToken}`);

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.valid).toBe(true);
        expect(res.body.entries_checked).toBe(42);
        expect(res.body.broken_at).toBeNull();
        expect(res.body.company_id).toBe(COMPANY_ID);
      } finally {
        AuditLog.verifyChain = originalVerifyChain;
        Tenant.findOne = originalTenantFindOne;
      }
    });
  });

  describe('3. Tenant Schema Billing Tier Normalization', () => {
    it('normalizes legacy "trial" tier to "free"', () => {
      const tenant = new Tenant({
        company_name: 'Test Trial Co',
        slug: 'test-trial-co',
        billing_tier: 'trial',
      });

      expect(tenant.billing_tier).toBe('free');
    });

    it('normalizes legacy "professional" tier to "pro"', () => {
      const tenant = new Tenant({
        company_name: 'Test Pro Co',
        slug: 'test-pro-co',
        billing_tier: 'professional',
      });

      expect(tenant.billing_tier).toBe('pro');
    });

    it('preserves clean tiers: free, starter, pro, enterprise', () => {
      for (const tier of ['free', 'starter', 'pro', 'enterprise']) {
        const tenant = new Tenant({
          company_name: `Test ${tier} Co`,
          slug: `test-${tier}-co`,
          billing_tier: tier,
        });
        expect(tenant.billing_tier).toBe(tier);
      }
    });
  });
});
