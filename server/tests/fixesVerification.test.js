'use strict';

import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import app from '../server';
import AssessmentCycle from '../models/AssessmentCycle';
import Tenant from '../models/Tenant';
import jwt from 'jsonwebtoken';

describe('Havilah Fixes Verification Test Suite', () => {
  const JWT_SECRET = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';

  const createMockQuery = (data) => ({
    select: () => createMockQuery(data),
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
  });

  describe('1. CSP & Button Click Fix', () => {
    it('should include script-src-attr unsafe-inline in Content-Security-Policy header', async () => {
      const res = await request(app).get('/health');
      expect(res.headers['content-security-policy']).toBeDefined();
      expect(res.headers['content-security-policy']).toContain("script-src-attr 'unsafe-inline'");
    });
  });

  describe('2. AssessmentCycle.getActiveForEmployee depth propagation', () => {
    it('should return depth and copsoq_depth from getActiveForEmployee', async () => {
      vi.spyOn(AssessmentCycle, 'find').mockReturnValue({
        lean: vi.fn().mockResolvedValue([
          {
            cycle_id: 'cycle-123',
            survey_type: 'copsoq3',
            copsoq_depth: 'middle',
            status: 'unlocked',
            deadline: new Date()
          }
        ])
      });

      const activeMap = await AssessmentCycle.getActiveForEmployee('comp-1', 'dept-1');
      expect(activeMap.copsoq3).toBeDefined();
      expect(activeMap.copsoq3.status).toBe('unlocked');
      expect(activeMap.copsoq3.depth).toBe('middle');
      expect(activeMap.copsoq3.copsoq_depth).toBe('middle');

      AssessmentCycle.find.mockRestore();
    });
  });

  describe('3. Assessment Cycle Status API depth propagation', () => {
    it('should return depth for copsoq3 even when falling back to tenant defaults', async () => {
      const token = jwt.sign(
        { userId: 'u1', companyId: 'comp-1', departmentId: 'dept-1', role: 'employee', status: 'active' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-1',
          lifecycle_state: 'active',
          locked_at: null,
          settings: {
            default_lock_policy: {
              copsoq3: 'unlocked',
              copsoq_depth: 'long'
            }
          }
        })
      );

      vi.spyOn(AssessmentCycle, 'getActiveForEmployee').mockResolvedValue({});

      const res = await request(app)
        .get('/api/v1/assessment-cycles/status')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.status.copsoq3).toBeDefined();
      expect(res.body.status.copsoq3.depth).toBe('long');
      expect(res.body.status.copsoq3.copsoq_depth).toBe('long');

      Tenant.findOne.mockRestore();
      AssessmentCycle.getActiveForEmployee.mockRestore();
    });
  });

  describe('4. HR COPSOQ Depth Settings', () => {
    it('should get current depth and reject invalid depth', async () => {
      const hrToken = jwt.sign(
        { userId: 'hr1', companyId: 'comp-1', role: 'hr_admin', status: 'active' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-1',
          lifecycle_state: 'active',
          locked_at: null,
          settings: {
            default_lock_policy: {
              copsoq_depth: 'middle'
            }
          }
        })
      );

      const getRes = await request(app)
        .get('/api/v1/hr/settings/copsoq-depth')
        .set('Authorization', `Bearer ${hrToken}`);

      expect(getRes.status).toBe(200);
      expect(getRes.body.copsoq_depth).toBe('middle');

      const patchRes = await request(app)
        .patch('/api/v1/hr/settings/copsoq-depth')
        .set('Authorization', `Bearer ${hrToken}`)
        .send({ copsoq_depth: 'invalid_depth' });

      expect(patchRes.status).toBe(400);

      Tenant.findOne.mockRestore();
    });
  });

  describe('5. Auth Change Password validation', () => {
    it('should reject missing fields on /api/v1/auth/change-password', async () => {
      const userToken = jwt.sign(
        { userId: 'u1', companyId: 'comp-1', role: 'employee', status: 'active' },
        JWT_SECRET,
        { expiresIn: '1h' }
      );

      vi.spyOn(Tenant, 'findOne').mockImplementation(() =>
        createMockQuery({
          company_id: 'comp-1',
          lifecycle_state: 'active',
          locked_at: null
        })
      );

      const res = await request(app)
        .post('/api/v1/auth/change-password')
        .set('Authorization', `Bearer ${userToken}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_FIELDS');

      Tenant.findOne.mockRestore();
    });
  });
});
