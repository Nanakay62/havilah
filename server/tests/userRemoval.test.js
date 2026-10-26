'use strict';

const { TEST_JWT_SECRET } = require('./testConfig');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Department = require('../models/Department');
const Invitation = require('../models/Invitation');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const PendingNotification = require('../models/PendingNotification');
const AuditLog = require('../models/AuditLog');
const { hashField } = require('../utils/crypto');
const {
  HR_MAX_ACCOUNT_AGE_DAYS,
  findUserByEmail,
  checkRemovalAllowed,
  removeUser,
} = require('../services/userRemovalService');

const COMPANY_A = '11111111-1111-4111-a111-111111111111';
const COMPANY_B = '22222222-2222-4222-a222-222222222222';

function makeToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET || TEST_JWT_SECRET, { expiresIn: '2h' });
}

const superAdminToken = makeToken({
  userId: 'usr-superadmin-1',
  companyId: COMPANY_A,
  role: 'super_admin',
  isSystemSuperAdmin: true,
});

const hrAdminTokenA = makeToken({
  userId: 'usr-hr-a',
  companyId: COMPANY_A,
  role: 'hr_admin',
  isSystemSuperAdmin: false,
});

const employeeTokenA = makeToken({
  userId: 'usr-emp-a',
  companyId: COMPANY_A,
  role: 'employee',
  isSystemSuperAdmin: false,
});

function chainSelectLean(result) {
  return {
    select: () => ({
      lean: () => Promise.resolve(result),
    }),
    lean: () => Promise.resolve(result),
  };
}

describe('Registered User Removal Service & Endpoints', () => {
  let origUserFindOne;
  let origUserDeleteOne;
  let origUserCreate;
  let origTenantFindOne;
  let origTenantUpdateOne;
  let origDeptFindOne;
  let origInviteFindOne;
  let origInviteUpdateMany;
  let origWellnessCount;
  let origWellnessDeleteMany;
  let origNotifDeleteMany;
  let origAuditAppend;

  beforeEach(() => {
    origUserFindOne = User.findOne;
    origUserDeleteOne = User.deleteOne;
    origUserCreate = User.create;
    origTenantFindOne = Tenant.findOne;
    origTenantUpdateOne = Tenant.updateOne;
    origDeptFindOne = Department.findOne;
    origInviteFindOne = Invitation.findOne;
    origInviteUpdateMany = Invitation.updateMany;
    origWellnessCount = PersonalWellnessLog.countDocuments;
    origWellnessDeleteMany = PersonalWellnessLog.deleteMany;
    origNotifDeleteMany = PendingNotification.deleteMany;
    origAuditAppend = AuditLog.append;

    // Default Tenant.findOne mock so validateSession's tenant lifecycle check never hits unmocked Mongo buffering
    const defaultActiveTenant = {
      company_id: COMPANY_A,
      company_name: 'Acme Corp',
      domain: 'acme.com',
      lifecycle_state: 'active',
      used_seats: 3,
      max_allowed_seats: 50,
    };
    Tenant.findOne = vi.fn().mockImplementation(() => {
      const p = Promise.resolve(defaultActiveTenant);
      p.select = () => ({ lean: () => Promise.resolve(defaultActiveTenant) });
      p.lean = () => Promise.resolve(defaultActiveTenant);
      return p;
    });
  });

  afterEach(() => {
    User.findOne = origUserFindOne;
    User.deleteOne = origUserDeleteOne;
    User.create = origUserCreate;
    Tenant.findOne = origTenantFindOne;
    Tenant.updateOne = origTenantUpdateOne;
    Department.findOne = origDeptFindOne;
    Invitation.findOne = origInviteFindOne;
    Invitation.updateMany = origInviteUpdateMany;
    PersonalWellnessLog.countDocuments = origWellnessCount;
    PersonalWellnessLog.deleteMany = origWellnessDeleteMany;
    PendingNotification.deleteMany = origNotifDeleteMany;
    AuditLog.append = origAuditAppend;
  });

  describe('1. checkRemovalAllowed business rules', () => {
    const baseTarget = {
      user_id: 'usr-target-1',
      company_id: COMPANY_A,
      role: 'employee',
      isSystemSuperAdmin: false,
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000), // 2 days old
    };

    it('exposes HR_MAX_ACCOUNT_AGE_DAYS = 30', () => {
      expect(HR_MAX_ACCOUNT_AGE_DAYS).toBe(30);
    });

    it('returns NOT_FOUND in hr mode when target belongs to a different company', () => {
      const res = checkRemovalAllowed({
        target: { ...baseTarget, company_id: COMPANY_B },
        wellnessCount: 0,
        actor: { user_id: 'usr-hr-a', company_id: COMPANY_A, role: 'hr_admin' },
        mode: 'hr',
      });
      expect(res).toEqual({ allowed: false, reasonCode: 'NOT_FOUND' });
    });

    it('returns CANNOT_REMOVE_SELF when actor attempts to remove their own account', () => {
      const res = checkRemovalAllowed({
        target: { ...baseTarget, user_id: 'usr-hr-a' },
        wellnessCount: 0,
        actor: { user_id: 'usr-hr-a', company_id: COMPANY_A, role: 'hr_admin' },
        mode: 'hr',
      });
      expect(res).toEqual({ allowed: false, reasonCode: 'CANNOT_REMOVE_SELF' });
    });

    it('returns CANNOT_REMOVE_SUPER_ADMIN for super_admin or isSystemSuperAdmin targets', () => {
      expect(
        checkRemovalAllowed({
          target: { ...baseTarget, role: 'super_admin' },
          wellnessCount: 0,
          actor: { user_id: 'usr-sa' },
          mode: 'superadmin',
        })
      ).toEqual({ allowed: false, reasonCode: 'CANNOT_REMOVE_SUPER_ADMIN' });

      expect(
        checkRemovalAllowed({
          target: { ...baseTarget, isSystemSuperAdmin: true },
          wellnessCount: 0,
          actor: { user_id: 'usr-sa' },
          mode: 'superadmin',
        })
      ).toEqual({ allowed: false, reasonCode: 'CANNOT_REMOVE_SUPER_ADMIN' });
    });

    it('returns ADMIN_REQUIRES_SUPERADMIN in hr mode when target is hr_admin or tenant_admin', () => {
      const res = checkRemovalAllowed({
        target: { ...baseTarget, role: 'hr_admin' },
        wellnessCount: 0,
        actor: { user_id: 'usr-hr-a', company_id: COMPANY_A },
        mode: 'hr',
      });
      expect(res).toEqual({ allowed: false, reasonCode: 'ADMIN_REQUIRES_SUPERADMIN' });
    });

    it('returns ADMIN_CONFIRM_REQUIRED in superadmin mode for admin targets unless confirmAdmin is true', () => {
      expect(
        checkRemovalAllowed({
          target: { ...baseTarget, role: 'hr_admin' },
          wellnessCount: 0,
          actor: { user_id: 'usr-sa' },
          mode: 'superadmin',
          confirmAdmin: false,
        })
      ).toEqual({ allowed: false, reasonCode: 'ADMIN_CONFIRM_REQUIRED' });

      expect(
        checkRemovalAllowed({
          target: { ...baseTarget, role: 'hr_admin' },
          wellnessCount: 0,
          actor: { user_id: 'usr-sa' },
          mode: 'superadmin',
          confirmAdmin: true,
        })
      ).toEqual({ allowed: true, reasonCode: null });
    });

    it('enforces the 30-day account age boundary in hr mode (29 days allowed, 31 days blocked)', () => {
      const day29 = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
      const day31 = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

      expect(
        checkRemovalAllowed({
          target: { ...baseTarget, created_at: day29 },
          wellnessCount: 0,
          actor: { user_id: 'usr-hr-a', company_id: COMPANY_A },
          mode: 'hr',
        })
      ).toEqual({ allowed: true, reasonCode: null });

      expect(
        checkRemovalAllowed({
          target: { ...baseTarget, created_at: day31 },
          wellnessCount: 0,
          actor: { user_id: 'usr-hr-a', company_id: COMPANY_A },
          mode: 'hr',
        })
      ).toEqual({ allowed: false, reasonCode: 'ACCOUNT_TOO_OLD' });
    });

    it('enforces zero wellness data in hr mode (0 allowed, 1 blocked)', () => {
      expect(
        checkRemovalAllowed({
          target: baseTarget,
          wellnessCount: 0,
          actor: { user_id: 'usr-hr-a', company_id: COMPANY_A },
          mode: 'hr',
        })
      ).toEqual({ allowed: true, reasonCode: null });

      expect(
        checkRemovalAllowed({
          target: baseTarget,
          wellnessCount: 1,
          actor: { user_id: 'usr-hr-a', company_id: COMPANY_A },
          mode: 'hr',
        })
      ).toEqual({ allowed: false, reasonCode: 'HAS_WELLNESS_DATA' });
    });
  });

  describe('2. removeUser transactional cleanup & privacy-preserving AuditLog', () => {
    it('deletes records, guards seat/invite counts from going negative, and omits email/hash/name from AuditLog', async () => {
      const target = {
        user_id: 'usr-to-remove-99',
        full_name: 'Jane Secret Doe',
        email_hash: hashField('jane.secret@acme.com'),
        company_id: COMPANY_A,
        department_id: 'dept-sales',
        role: 'employee',
      };

      const tenantQueries = [];
      const inviteQueries = [];
      let capturedAudit = null;

      PersonalWellnessLog.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 2 });
      PendingNotification.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 1 });
      Invitation.updateMany = vi.fn().mockImplementation((filter, update) => {
        inviteQueries.push({ filter, update });
        return Promise.resolve({ modifiedCount: 1 });
      });
      Tenant.updateOne = vi.fn().mockImplementation((filter, update) => {
        tenantQueries.push({ filter, update });
        return Promise.resolve({ modifiedCount: 1 });
      });
      User.deleteOne = vi.fn().mockResolvedValue({ deletedCount: 1 });
      AuditLog.append = vi.fn().mockImplementation((entry) => {
        capturedAudit = entry;
        return Promise.resolve(entry);
      });

      const res = await removeUser({
        target,
        actor: { user_id: 'usr-superadmin-1', role: 'super_admin', mode: 'superadmin' },
        reason: 'Registered with wrong activation code',
      });

      expect(res.deletedWellnessLogs).toBe(2);
      expect(res.deletedNotifications).toBe(1);
      expect(res.seatFreed).toBe(true);

      // Verify seat count never goes below 0 via query condition
      expect(tenantQueries[0].filter).toEqual({
        company_id: COMPANY_A,
        used_seats: { $gt: 0 },
      });
      expect(tenantQueries[0].update).toEqual({ $inc: { used_seats: -1 } });

      // Verify invite usage_count never goes below 0 via query condition
      expect(inviteQueries[0].filter).toEqual({
        used_by_user_id: 'usr-to-remove-99',
        usage_count: { $gt: 0 },
      });

      // Verify AuditLog entry has event_type 'user_removed' and contains NO email, hash, or full_name
      expect(capturedAudit).toBeDefined();
      expect(capturedAudit.event_type).toBe('user_removed');
      expect(capturedAudit.company_id).toBe(COMPANY_A);
      const serialized = JSON.stringify(capturedAudit);
      expect(serialized).not.toContain('jane.secret@acme.com');
      expect(serialized).not.toContain(target.email_hash);
      expect(serialized).not.toContain('Jane Secret Doe');
      expect(capturedAudit.event_payload.reason).toBe('Registered with wrong activation code');
    });
  });

  describe('3. Superadmin & HR Endpoints + Re-Registration Flow', () => {
    it('rejects employee and HR tokens on /api/v1/superadmin/users/* with 403, and employee tokens on /api/v1/hr/users/*', async () => {
      const empSaRes = await request(app)
        .post('/api/v1/superadmin/users/lookup')
        .set('Authorization', `Bearer ${employeeTokenA}`)
        .send({ email: 'a@b.com' });
      expect(empSaRes.status).toBe(403);

      const hrSaRes = await request(app)
        .post('/api/v1/superadmin/users/lookup')
        .set('Authorization', `Bearer ${hrAdminTokenA}`)
        .send({ email: 'a@b.com' });
      expect(hrSaRes.status).toBe(403);

      const empHrRes = await request(app)
        .post('/api/v1/hr/users/lookup')
        .set('Authorization', `Bearer ${employeeTokenA}`)
        .send({ email: 'a@b.com' });
      expect(empHrRes.status).toBe(403);
    });

    it('returns an identical response on HR lookup for non-existent emails and cross-tenant emails', async () => {
      const otherTenantUser = {
        user_id: 'usr-other-co',
        full_name: 'Other Co Worker',
        company_id: COMPANY_B,
        department_id: 'dept-1',
        role: 'employee',
        created_at: new Date(),
      };

      User.findOne = vi.fn().mockImplementation(({ email_hash }) => {
        if (email_hash === hashField('other@companyb.com')) {
          return Promise.resolve(otherTenantUser);
        }
        return Promise.resolve(null);
      });
      Tenant.findOne = vi.fn().mockImplementation(() => chainSelectLean({ company_name: 'Company B' }));
      Department.findOne = vi.fn().mockImplementation(() => chainSelectLean({ name: 'Ops' }));
      PersonalWellnessLog.countDocuments = vi.fn().mockResolvedValue(0);

      const missingRes = await request(app)
        .post('/api/v1/hr/users/lookup')
        .set('Authorization', `Bearer ${hrAdminTokenA}`)
        .send({ email: 'nobody@nowhere.com' });

      const crossTenantRes = await request(app)
        .post('/api/v1/hr/users/lookup')
        .set('Authorization', `Bearer ${hrAdminTokenA}`)
        .send({ email: 'other@companyb.com' });

      expect(missingRes.status).toBe(200);
      expect(crossTenantRes.status).toBe(200);
      expect(crossTenantRes.body).toEqual(missingRes.body);
      expect(crossTenantRes.body).toEqual({
        success: true,
        found: false,
        message: 'No account with this email in your organization.',
      });
    });

    it('rejects removal without a valid 5-300 char reason with 400 INVALID_REASON', async () => {
      const saRes = await request(app)
        .post('/api/v1/superadmin/users/remove')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ email: 'user@acme.com', reason: 'bad' });
      expect(saRes.status).toBe(400);
      expect(saRes.body.error).toBe('INVALID_REASON');

      const hrRes = await request(app)
        .post('/api/v1/hr/users/remove')
        .set('Authorization', `Bearer ${hrAdminTokenA}`)
        .send({ email: 'user@acme.com', reason: '' });
      expect(hrRes.status).toBe(400);
      expect(hrRes.body.error).toBe('INVALID_REASON');
    });

    it('allows re-registration with the same email after removal (no longer returns EMAIL_ALREADY_EXISTS)', async () => {
      const email = 'mistake@acme.com';
      const emailHash = hashField(email);

      let storedUser = {
        user_id: 'usr-mistake-1',
        full_name: 'Mistake User',
        email_hash: emailHash,
        company_id: COMPANY_A,
        department_id: 'unassigned',
        role: 'employee',
        status: 'active',
        created_at: new Date(),
      };

      User.findOne = vi.fn().mockImplementation((q) => {
        if (q.email_hash === emailHash) return Promise.resolve(storedUser);
        return Promise.resolve(null);
      });
      User.deleteOne = vi.fn().mockImplementation(() => {
        storedUser = null;
        return Promise.resolve({ deletedCount: 1 });
      });
      User.create = vi.fn().mockImplementation((doc) => {
        storedUser = { ...doc, user_id: 'usr-new-2' };
        return Promise.resolve(storedUser);
      });

      const mockTenant = {
        company_id: COMPANY_A,
        company_name: 'Acme Corp',
        domain: 'acme.com',
        used_seats: 3,
        max_allowed_seats: 50,
      };
      Tenant.findOne = vi.fn().mockImplementation(() => {
        const p = Promise.resolve(mockTenant);
        p.select = () => ({ lean: () => Promise.resolve(mockTenant) });
        p.lean = () => Promise.resolve(mockTenant);
        return p;
      });
      Tenant.updateOne = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      Invitation.findOne = vi.fn().mockResolvedValue({
        activation_code: 'ACME-ENG-1',
        company_id: COMPANY_A,
        department_id: 'dept-eng',
        status: 'active',
        usage_count: 1,
        save: vi.fn().mockResolvedValue(true),
      });
      Invitation.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });
      PersonalWellnessLog.countDocuments = vi.fn().mockResolvedValue(0);
      PersonalWellnessLog.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
      PendingNotification.deleteMany = vi.fn().mockResolvedValue({ deletedCount: 0 });
      AuditLog.append = vi.fn().mockResolvedValue({});

      // 1. Re-registration before removal fails with EMAIL_ALREADY_EXISTS
      const dupReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          fullName: 'Mistake User',
          password: 'StrongPassword1!',
          code: 'ACME-ENG-1',
        });
      expect(dupReg.status).toBe(400);
      expect(dupReg.body.error).toBe('EMAIL_ALREADY_EXISTS');

      // 2. HR removes the freshly-created 0-data account
      const removeRes = await request(app)
        .post('/api/v1/hr/users/remove')
        .set('Authorization', `Bearer ${hrAdminTokenA}`)
        .send({
          email,
          reason: 'Registered without department code by mistake',
        });
      expect(removeRes.status).toBe(200);
      expect(removeRes.body.success).toBe(true);

      // 3. Re-registration with the same email now succeeds
      const reReg = await request(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          fullName: 'Mistake User',
          password: 'StrongPassword1!',
          code: 'ACME-ENG-1',
        });
      expect(reReg.status).toBe(200);
      expect(reReg.body.success).toBe(true);
    });

    it('rate-limits HR user lookup with 429 TOO_MANY_REQUESTS when limit is exceeded', async () => {
      User.findOne = vi.fn().mockResolvedValue(null);

      let lastRes = null;
      // sensitiveRateLimiter(10) allows max(10*6, 30) = 60 on localhost in test mode, or 10 from non-localhost IP
      for (let i = 0; i < 65; i++) {
        lastRes = await request(app)
          .post('/api/v1/hr/users/lookup')
          .set('Authorization', `Bearer ${hrAdminTokenA}`)
          .send({ email: `probe${i}@acme.com` });
        if (lastRes.status === 429) break;
      }

      expect(lastRes.status).toBe(429);
      expect(lastRes.body.error).toBe('TOO_MANY_REQUESTS');
    });
  });
});
