'use strict';

const request = require('supertest');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const AuditLog = require('../models/AuditLog');

const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
const TEST_COMPANY_ID = '99999999-9999-4999-a999-999999999999';

const hrAdminToken = jwt.sign(
  {
    userId: 'usr-hr-admin-01',
    companyId: TEST_COMPANY_ID,
    role: 'hr_admin'
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

const employeeToken = jwt.sign(
  {
    userId: 'usr-employee-01',
    companyId: TEST_COMPANY_ID,
    role: 'employee'
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

const superAdminToken = jwt.sign(
  {
    userId: 'usr-superadmin-01',
    companyId: TEST_COMPANY_ID,
    role: 'super_admin',
    isSystemSuperAdmin: true
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

// Helper for chainable Mongoose mock queries (.select().sort().lean())
const createMockQuery = (data) => ({
  select: () => createMockQuery(data),
  sort: () => createMockQuery(data),
  lean: () => Promise.resolve(data),
  then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
});

describe('Billing & Paystack Security Controls (Ghana Payments)', () => {
  const originalPaystackSecret = process.env.PAYSTACK_SECRET_KEY;
  let originalTenantFindOne;
  let originalTenantFindOneAndUpdate;
  let originalAuditLogAppend;

  const mockActiveTenant = {
    company_id: TEST_COMPANY_ID,
    company_name: 'Accra Tech Hub',
    lifecycle_state: 'active',
    access_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    billing_tier: 'starter',
    subscription: {
      tier: 'starter',
      status: 'active',
      currency: 'GHS',
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      cancelAtPeriodEnd: false,
      transactionReferences: []
    },
    used_seats: 12,
    max_allowed_seats: 100,
    save: function() { return Promise.resolve(this); }
  };

  beforeEach(() => {
    originalTenantFindOne = Tenant.findOne;
    originalTenantFindOneAndUpdate = Tenant.findOneAndUpdate;
    originalAuditLogAppend = AuditLog.append;

    // Default mock query resolves to active tenant
    Tenant.findOne = () => createMockQuery({ ...mockActiveTenant });
    Tenant.findOneAndUpdate = () => Promise.resolve({ ...mockActiveTenant });
    AuditLog.append = () => Promise.resolve({});
  });

  afterEach(() => {
    Tenant.findOne = originalTenantFindOne;
    Tenant.findOneAndUpdate = originalTenantFindOneAndUpdate;
    AuditLog.append = originalAuditLogAppend;

    if (originalPaystackSecret) {
      process.env.PAYSTACK_SECRET_KEY = originalPaystackSecret;
    } else {
      delete process.env.PAYSTACK_SECRET_KEY;
    }
  });

  describe('Authentication & Access Control', () => {
    it('rejects unauthenticated access to /api/v1/billing/status with 401', async () => {
      const res = await request(app).get('/api/v1/billing/status');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('rejects unauthenticated access to /api/v1/billing/initialize with 401', async () => {
      const res = await request(app)
        .post('/api/v1/billing/initialize')
        .send({ tier: 'pro' });
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated access to /api/v1/billing/cancel with 401', async () => {
      const res = await request(app)
        .post('/api/v1/billing/cancel')
        .send({});
      expect(res.status).toBe(401);
    });

    it('rejects unauthenticated access to /api/v1/billing/portal with 401', async () => {
      const res = await request(app).get('/api/v1/billing/portal');
      expect(res.status).toBe(401);
    });

    it('rejects non-admin roles (e.g. employee) from /api/v1/billing/status with 403', async () => {
      const res = await request(app)
        .get('/api/v1/billing/status')
        .set('Authorization', `Bearer ${employeeToken}`);
      expect(res.status).toBe(403);
    });

    it('rejects non-super-admin callers from /api/v1/billing/admin/refund/:tenantId with 403', async () => {
      const res = await request(app)
        .post(`/api/v1/billing/admin/refund/${TEST_COMPANY_ID}`)
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .send({ transactionReference: 'TEST_REF_123' });
      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  describe('Paystack Webhook & HMAC-SHA512 Signature Verification', () => {
    it('handles billing webhook ping cleanly when unconfigured', async () => {
      delete process.env.PAYSTACK_SECRET_KEY;
      const res = await request(app)
        .post('/api/v1/billing/webhook')
        .send({ event: 'ping', data: {} });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('rejects webhook requests with invalid HMAC-SHA512 signature', async () => {
      process.env.PAYSTACK_SECRET_KEY = 'sk_test_mock_paystack_secret_key_123';
      const payload = { event: 'charge.success', data: { reference: 'ref_123' } };

      const res = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', 'invalid_hex_signature_512')
        .send(payload);

      expect(res.status).toBe(400);
    });

    it('accepts valid Paystack webhook signature and processes charge.success event', async () => {
      const secret = 'sk_test_valid_mock_key_ghana_paystack_2026';
      process.env.PAYSTACK_SECRET_KEY = secret;

      const payload = {
        event: 'charge.success',
        data: {
          reference: 'PAY_TEST_REF_998877',
          amount: 1545000,
          currency: 'GHS',
          customer: { customer_code: 'CUS_mock_123' },
          metadata: {
            company_id: TEST_COMPANY_ID,
            tier: 'pro'
          }
        }
      };

      const raw = JSON.stringify(payload);
      const signature = crypto.createHmac('sha512', secret).update(raw).digest('hex');

      let updatedWith = null;
      Tenant.findOneAndUpdate = (query, update) => {
        updatedWith = update;
        return Promise.resolve({ company_id: TEST_COMPANY_ID });
      };

      const res = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
      expect(updatedWith).toBeDefined();
      expect(updatedWith.$set['subscription.tier']).toBe('pro');
      expect(updatedWith.$set['subscription.currency']).toBe('GHS');
      expect(updatedWith.$set['subscription.status']).toBe('active');
    });

    it('ignores duplicate charge.success webhook delivery for already-processed reference (idempotency)', async () => {
      const secret = 'sk_test_valid_mock_key_ghana_paystack_2026';
      process.env.PAYSTACK_SECRET_KEY = secret;

      const existingRef = 'PAY_DUPLICATE_REF_001';
      const payload = {
        event: 'charge.success',
        data: {
          reference: existingRef,
          amount: 550000,
          currency: 'GHS',
          customer: { customer_code: 'CUS_mock_456' },
          metadata: {
            company_id: TEST_COMPANY_ID,
            tier: 'starter'
          }
        }
      };

      const raw = JSON.stringify(payload);
      const signature = crypto.createHmac('sha512', secret).update(raw).digest('hex');

      Tenant.findOne = () => createMockQuery({
        ...mockActiveTenant,
        subscription: { transactionReferences: [existingRef] }
      });

      let updateCalled = false;
      Tenant.findOneAndUpdate = () => {
        updateCalled = true;
        return Promise.resolve({});
      };

      const res = await request(app)
        .post('/api/v1/billing/webhook')
        .set('x-paystack-signature', signature)
        .set('Content-Type', 'application/json')
        .send(raw);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, duplicate: true });
      expect(updateCalled).toBe(false);
    });
  });

  describe('Billing Status & Subscription Cancellation', () => {
    it('returns GHS currency and pricing structure for authenticated admin', async () => {
      const futureExpiry = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);

      Tenant.findOne = () => createMockQuery({
        ...mockActiveTenant,
        billing_tier: 'starter',
        subscription: {
          tier: 'starter',
          status: 'active',
          currency: 'GHS',
          currentPeriodEnd: futureExpiry,
          cancelAtPeriodEnd: false,
          transactionReferences: ['REF_123']
        }
      });

      const res = await request(app)
        .get('/api/v1/billing/status')
        .set('Authorization', `Bearer ${hrAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.currency).toBe('GHS');
      expect(res.body.subscription.tier).toBe('starter');
      expect(res.body.subscription.is_active).toBe(true);
      expect(res.body.subscription.cancel_at_period_end).toBe(false);
      expect(res.body.available_tiers.starter.priceMonthlyGhs).toBe(5500);
      expect(res.body.available_tiers.pro.priceMonthlyGhs).toBe(15450);
    });

    it('POST /api/v1/billing/cancel marks cancelAtPeriodEnd: true while preserving active period end', async () => {
      const futureExpiry = new Date(Date.now() + 20 * 24 * 60 * 60 * 1000);

      const tenantInstance = {
        ...mockActiveTenant,
        subscription: {
          tier: 'pro',
          status: 'active',
          currentPeriodEnd: futureExpiry,
          cancelAtPeriodEnd: false
        },
        access_expires_at: futureExpiry,
        save: function() {
          this.subscription.cancelAtPeriodEnd = true;
          return Promise.resolve(this);
        }
      };

      Tenant.findOne = () => createMockQuery(tenantInstance);

      const res = await request(app)
        .post('/api/v1/billing/cancel')
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cancelAtPeriodEnd).toBe(true);
      expect(res.body.accessUntil).toBe(futureExpiry.toISOString().split('T')[0]);
      expect(tenantInstance.subscription.cancelAtPeriodEnd).toBe(true);
    });
  });
});
