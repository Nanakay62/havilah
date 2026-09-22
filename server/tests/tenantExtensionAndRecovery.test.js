'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const AssessmentCycle = require('../models/AssessmentCycle');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const Department = require('../models/Department');
const AnonHazardLog = require('../models/AnonHazardLog');
const PulseResponse = require('../models/PulseResponse');
const Invitation = require('../models/Invitation');
const WhistleblowerReport = require('../models/WhistleblowerReport');
const Alert = require('../models/Alert');
const { relinkTenantData } = require('../scripts/relinkTenantData');
const { hashField } = require('../utils/crypto');

const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
const TEST_COMPANY_ID = '11111111-1111-4111-a111-111111111111';

const superAdminToken = jwt.sign(
  {
    userId: 'usr-superadmin-test',
    companyId: TEST_COMPANY_ID,
    role: 'super_admin',
    isSystemSuperAdmin: true,
  },
  TEST_SECRET,
  { expiresIn: '2h' }
);

describe('Tenant Extension & Data Retention Safeguards', () => {
  let origTenantFindOne;
  let origTenantFindOneAndUpdate;
  let origTenantCreate;
  let origUserFindOne;
  let origCycleUpdateMany;

  beforeEach(() => {
    origTenantFindOne = Tenant.findOne;
    origTenantFindOneAndUpdate = Tenant.findOneAndUpdate;
    origTenantCreate = Tenant.create;
    origUserFindOne = User.findOne;
    origCycleUpdateMany = AssessmentCycle.updateMany;
  });

  afterEach(() => {
    Tenant.findOne = origTenantFindOne;
    Tenant.findOneAndUpdate = origTenantFindOneAndUpdate;
    Tenant.create = origTenantCreate;
    User.findOne = origUserFindOne;
    AssessmentCycle.updateMany = origCycleUpdateMany;
  });

  describe('1. POST /api/v1/superadmin/tenants/:id/extend-access', () => {
    it('synchronizes subscription.trialEndsAt and maintains Pro tier entitlements on access extension', async () => {
      const expiredDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

      const mockExpiredTenant = {
        company_id: TEST_COMPANY_ID,
        company_name: 'Expired Corp',
        lifecycle_state: 'expired',
        access_expires_at: expiredDate,
        billing_tier: 'pro',
        subscription: {
          tier: 'pro',
          status: 'trialing',
          trialEndsAt: expiredDate,
        },
      };

      let capturedUpdateFields = null;

      Tenant.findOne = vi.fn().mockImplementation((query) => {
        if (query.company_id === TEST_COMPANY_ID) {
          return Promise.resolve(mockExpiredTenant);
        }
        return Promise.resolve(null);
      });

      Tenant.findOneAndUpdate = vi.fn().mockImplementation((query, updateFields) => {
        capturedUpdateFields = updateFields;
        return Promise.resolve({
          ...mockExpiredTenant,
          ...updateFields,
          subscription: {
            ...mockExpiredTenant.subscription,
            trialEndsAt: updateFields['subscription.trialEndsAt'],
            status: updateFields['subscription.status'] || mockExpiredTenant.subscription.status,
          },
        });
      });

      AssessmentCycle.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });

      const res = await request(app)
        .post(`/api/v1/superadmin/tenants/${TEST_COMPANY_ID}/extend-access`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ daysToAdd: 30 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify trialEndsAt was synchronized with new expiry
      expect(capturedUpdateFields).toBeDefined();
      expect(capturedUpdateFields.access_expires_at).toBeInstanceOf(Date);
      expect(capturedUpdateFields['subscription.trialEndsAt']).toBeInstanceOf(Date);
      expect(capturedUpdateFields.lifecycle_state).toBe('active');
      expect(capturedUpdateFields.locked_at).toBeNull();
      expect(capturedUpdateFields['subscription.status']).toBe('trialing');

      // Verify assessment cycles were updated
      expect(AssessmentCycle.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          company_id: TEST_COMPANY_ID,
          status: 'unlocked',
        }),
        expect.objectContaining({
          $set: expect.objectContaining({
            deadline: expect.any(Date),
          }),
        })
      );
    });

    it('rejects invalid daysToAdd parameters', async () => {
      const res = await request(app)
        .post(`/api/v1/superadmin/tenants/${TEST_COMPANY_ID}/extend-access`)
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({ daysToAdd: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('between 1 and 365');
    });
  });

  describe('2. POST /api/v1/superadmin/tenants - Protection against duplicate re-provisioning', () => {
    it('rejects provisioning when a tenant with the same slug already exists', async () => {
      Tenant.findOne = vi.fn().mockImplementation((query) => {
        if (query.slug === 'existing-corp') {
          return Promise.resolve({ company_name: 'Existing Corp', slug: 'existing-corp' });
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .post('/api/v1/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          company_name: 'Existing Corp',
          slug: 'existing-corp',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DUPLICATE_SLUG');
      expect(res.body.message).toContain('Extend Access rather than provisioning a duplicate tenant');
    });

    it('rejects provisioning when an HR Admin email already belongs to an existing tenant', async () => {
      Tenant.findOne = vi.fn().mockImplementation((query) => {
        if (query.company_id === 'original-tenant-id') {
          return {
            lean: () => Promise.resolve({ company_name: 'Original Company Ltd', company_id: 'original-tenant-id' }),
          };
        }
        return Promise.resolve(null);
      });

      User.findOne = vi.fn().mockImplementation((query) => {
        const targetHash = hashField('existing.hr@company.com');
        if (query.email_hash === targetHash) {
          return Promise.resolve({
            user_id: 'usr-existing-hr',
            company_id: 'original-tenant-id',
            role: 'hr_admin',
          });
        }
        return Promise.resolve(null);
      });

      const res = await request(app)
        .post('/api/v1/superadmin/tenants')
        .set('Authorization', `Bearer ${superAdminToken}`)
        .send({
          company_name: 'Brand New Duplicate Corp',
          slug: 'brand-new-slug',
          hr_admin_email: 'existing.hr@company.com',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('USER_ALREADY_EXISTS');
      expect(res.body.message).toContain('orphan their existing survey responses');
    });
  });

  describe('3. relinkTenantData utility', () => {
    beforeEach(() => {
      AnonHazardLog.countDocuments = vi.fn().mockResolvedValue(5);
      AnonHazardLog.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 5 });

      PulseResponse.countDocuments = vi.fn().mockResolvedValue(8);
      PulseResponse.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 8 });

      Invitation.countDocuments = vi.fn().mockResolvedValue(4);
      Invitation.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 4 });

      WhistleblowerReport.countDocuments = vi.fn().mockResolvedValue(1);
      WhistleblowerReport.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 1 });

      Alert.countDocuments = vi.fn().mockResolvedValue(2);
      Alert.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });
    });

    it('migrates all collections from source to target company_id', async () => {
      const sourceId = 'old-source-uuid-111';
      const targetId = 'new-target-uuid-222';

      Tenant.findOne = vi.fn().mockResolvedValue({ company_id: targetId, company_name: 'Target Corp' });
      Tenant.updateOne = vi.fn().mockResolvedValue({ acknowledged: true });

      PersonalWellnessLog.countDocuments = vi.fn().mockResolvedValue(15);
      PersonalWellnessLog.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 15 });

      Department.countDocuments = vi.fn().mockResolvedValue(3);
      Department.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 3 });

      AssessmentCycle.countDocuments = vi.fn().mockResolvedValue(2);
      AssessmentCycle.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 2 });

      User.countDocuments = vi.fn().mockImplementation((query) => {
        if (query.company_id === sourceId) return Promise.resolve(10);
        if (query.company_id === targetId) return Promise.resolve(10);
        return Promise.resolve(0);
      });
      User.updateMany = vi.fn().mockResolvedValue({ modifiedCount: 10 });

      const result = await relinkTenantData(sourceId, targetId, { dryRun: false });

      expect(result.success).toBe(true);
      expect(result.recordsMigrated.PersonalWellnessLog).toBe(15);
      expect(result.recordsMigrated.AnonHazardLog).toBe(5);
      expect(result.recordsMigrated.PulseResponse).toBe(8);
      expect(result.recordsMigrated.Department).toBe(3);
      expect(result.recordsMigrated.AssessmentCycle).toBe(2);
      expect(result.recordsMigrated.Invitation).toBe(4);
      expect(result.recordsMigrated.WhistleblowerReport).toBe(1);
      expect(result.recordsMigrated.Alert).toBe(2);
      expect(result.recordsMigrated.User).toBe(10);

      expect(PersonalWellnessLog.updateMany).toHaveBeenCalledWith(
        { company_id: sourceId },
        { $set: { company_id: targetId } }
      );
      expect(Department.updateMany).toHaveBeenCalledWith(
        { company_id: sourceId },
        { $set: { company_id: targetId } }
      );
    });

    it('honors dry-run mode without modifying records', async () => {
      const sourceId = 'old-source-uuid-333';
      const targetId = 'new-target-uuid-444';

      Tenant.findOne = vi.fn().mockResolvedValue({ company_id: targetId, company_name: 'Target Corp' });

      PersonalWellnessLog.countDocuments = vi.fn().mockResolvedValue(42);
      PersonalWellnessLog.updateMany = vi.fn();

      const result = await relinkTenantData(sourceId, targetId, { dryRun: true });

      expect(result.success).toBe(true);
      expect(result.dryRun).toBe(true);
      expect(result.recordsMigrated.PersonalWellnessLog).toBe(42);
      expect(result.recordsMigrated.AnonHazardLog).toBe(5);
      expect(PersonalWellnessLog.updateMany).not.toHaveBeenCalled();
      expect(AnonHazardLog.updateMany).not.toHaveBeenCalled();
    });
  });
});
