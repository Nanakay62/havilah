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

  const AssessmentCycle = require('../models/AssessmentCycle');
  const emailService = require('../utils/emailService');
  let originalAssessmentUpdateMany;
  let originalSendMail;

  beforeEach(() => {
    originalTenantFindOne = Tenant.findOne;
    originalTenantFindOneAndUpdate = Tenant.findOneAndUpdate;
    originalAuditLogAppend = AuditLog.append;
    originalAssessmentUpdateMany = AssessmentCycle.updateMany;
    originalSendMail = emailService.sendMail;

    // Default mock query resolves to active tenant
    Tenant.findOne = () => createMockQuery({ ...mockActiveTenant });
    Tenant.findOneAndUpdate = () => Promise.resolve({ ...mockActiveTenant });
    AuditLog.append = () => Promise.resolve({});
    AssessmentCycle.updateMany = () => Promise.resolve({ modifiedCount: 0 });
    emailService.sendMail = async () => ({ skipped: true, messageId: 'mock-msg-id' });
  });

  afterEach(() => {
    Tenant.findOne = originalTenantFindOne;
    Tenant.findOneAndUpdate = originalTenantFindOneAndUpdate;
    AuditLog.append = originalAuditLogAppend;
    AssessmentCycle.updateMany = originalAssessmentUpdateMany;
    emailService.sendMail = originalSendMail;

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

  describe('Corporate Proforma Invoices, Trial Extensions & SuperAdmin Settlement', () => {
    it('POST /api/v1/billing/request-invoice calculates 15% annual discount and stores invoice', async () => {
      const tenantInstance = {
        ...mockActiveTenant,
        company_name: 'Accra Mining Corp',
        contact_email: 'finance@accramining.com',
        subscription: { ...mockActiveTenant.subscription, invoices: [] },
        save: function() { return Promise.resolve(this); }
      };
      Tenant.findOne = () => createMockQuery(tenantInstance);

      const res = await request(app)
        .post('/api/v1/billing/request-invoice')
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .send({ tier: 'pro', interval: 'annual', poNumber: 'PO-2026-99' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.invoice.invoiceNumber).toMatch(/^INV-HAV-/);
      expect(res.body.invoice.amountGhs).toBe(Math.round(15450 * 12 * 0.85));
      expect(res.body.invoice.poNumber).toBe('PO-2026-99');
      expect(tenantInstance.subscription.invoices).toHaveLength(1);
    });

    it('GET /api/v1/billing/invoices lists stored tenant invoices newest-first', async () => {
      Tenant.findOne = () => createMockQuery({
        company_name: 'Accra Mining Corp',
        subscription: {
          invoices: [
            { invoiceNumber: 'INV-HAV-2026-AAA111', tier: 'starter', amountGhs: 5500, status: 'paid' },
            { invoiceNumber: 'INV-HAV-2026-BBB222', tier: 'pro', amountGhs: 15450, status: 'pending' }
          ]
        }
      });

      const res = await request(app)
        .get('/api/v1/billing/invoices')
        .set('Authorization', `Bearer ${hrAdminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.invoices.map(i => i.invoiceNumber)).toEqual([
        'INV-HAV-2026-BBB222',
        'INV-HAV-2026-AAA111'
      ]);
    });

    it('POST /api/v1/billing/request-extension saves a clamped pending trial extension request', async () => {
      const tenantInstance = {
        ...mockActiveTenant,
        company_name: 'Accra Mining Corp',
        subscription: { ...mockActiveTenant.subscription, status: 'trialing' },
        save: function() { return Promise.resolve(this); }
      };
      Tenant.findOne = () => createMockQuery(tenantInstance);

      const res = await request(app)
        .post('/api/v1/billing/request-extension')
        .set('Authorization', `Bearer ${hrAdminToken}`)
        .send({ requestedDays: 90, reason: 'Board sign-off delayed' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.extension_request.status).toBe('pending');
      expect(res.body.extension_request.requestedDays).toBe(30);
      expect(res.body.extension_request.reason).toBe('Board sign-off delayed');
    });

    it('SuperAdmin GET /billing/pending & POST /mark-paid settle invoice and activate tier', async () => {
      const expressLib = require('express');
      const superAdminRouter = require('../routes/superAdmin');
      const saApp = expressLib();
      saApp.use(expressLib.json());
      saApp.use('/api/v1/superadmin', superAdminRouter);

      const prevKey = process.env.SUPER_ADMIN_KEY;
      process.env.SUPER_ADMIN_KEY = 'test-superadmin-billing-key';
      const origTenantFind = Tenant.find;

      const tenantInstance = {
        company_id: TEST_COMPANY_ID,
        company_name: 'Accra Mining Corp',
        billing_tier: 'trial',
        lifecycle_state: 'active',
        access_expires_at: new Date(),
        subscription: {
          tier: 'pro',
          status: 'trialing',
          extensionRequest: { status: 'pending', requestedDays: 14, reason: 'Procurement review' },
          invoices: [{ invoiceNumber: 'INV-HAV-2026-CCC333', tier: 'pro', interval: 'monthly', amountGhs: 15450, status: 'pending' }]
        },
        save: function() { return Promise.resolve(this); }
      };

      Tenant.find = () => createMockQuery([tenantInstance]);
      Tenant.findOne = () => createMockQuery(tenantInstance);

      try {
        const pendingRes = await request(saApp)
          .get('/api/v1/superadmin/billing/pending')
          .set('x-admin-key', 'test-superadmin-billing-key');

        expect(pendingRes.status).toBe(200);
        expect(pendingRes.body.pendingInvoices).toHaveLength(1);
        expect(pendingRes.body.pendingExtensions).toHaveLength(1);

        const paidRes = await request(saApp)
          .post(`/api/v1/superadmin/tenants/${TEST_COMPANY_ID}/invoices/INV-HAV-2026-CCC333/mark-paid`)
          .set('x-admin-key', 'test-superadmin-billing-key')
          .send({ paymentReference: 'WIRE-901' });

        expect(paidRes.status).toBe(200);
        expect(paidRes.body.success).toBe(true);
        expect(tenantInstance.subscription.invoices[0].status).toBe('paid');
        expect(tenantInstance.subscription.status).toBe('active');
        expect(tenantInstance.billing_tier).toBe('pro');
        expect(tenantInstance.max_allowed_seats).toBe(999999);
      } finally {
        Tenant.find = origTenantFind;
        if (prevKey === undefined) delete process.env.SUPER_ADMIN_KEY;
        else process.env.SUPER_ADMIN_KEY = prevKey;
      }
    });

    it('processTrialReminders triggers 14d, 7d, 3d, 1d, expired checkpoints without duplicating already-sent checkpoints', async () => {
      const { processTrialReminders } = require('../scheduler/complianceScheduler');
      const now = new Date('2026-06-01T12:00:00Z');
      const dayMs = 24 * 60 * 60 * 1000;
      const makeTrialTenant = (id, daysLeft, sent = []) => ({
        company_id: id,
        company_name: `Org ${id}`,
        contact_email: `hr@${id}.example.com`,
        lifecycle_state: 'active',
        subscription: {
          status: 'trialing',
          trialEndsAt: new Date(now.getTime() + daysLeft * dayMs),
          remindersSent: [...sent]
        },
        save: function() { return Promise.resolve(this); }
      });

      const t14 = makeTrialTenant('t14', 14);
      const t7 = makeTrialTenant('t7', 7);
      const t3 = makeTrialTenant('t3', 3);
      const t1 = makeTrialTenant('t1', 1);
      const tExp = makeTrialTenant('tExp', 0);

      const origFind = Tenant.find;
      Tenant.find = () => Promise.resolve([t14, t7, t3, t1, tExp]);
      try {
        const firstRun = await processTrialReminders(now);
        expect(firstRun).toEqual([
          { company_id: 't14', checkpoint: '14d' },
          { company_id: 't7', checkpoint: '7d' },
          { company_id: 't3', checkpoint: '3d' },
          { company_id: 't1', checkpoint: '1d' },
          { company_id: 'tExp', checkpoint: 'expired' }
        ]);
        expect(tExp.lifecycle_state).toBe('expired');

        const secondRun = await processTrialReminders(now);
        expect(secondRun).toEqual([]);
      } finally {
        Tenant.find = origFind;
      }
    });
  });
});
