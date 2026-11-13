'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const AnonHazardLog = require('../models/AnonHazardLog');
const AssessmentCycle = require('../models/AssessmentCycle');
const Referral = require('../models/Referral');
const { verifyNSizeCompliance } = require('../aggregations/nSizePrivacy');

const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
const COMPANY_ID = 'comp-privacy-test-01';

const createMockQuery = (data) => {
  const q = {
    select: () => q,
    sort: () => q,
    limit: () => q,
    populate: () => q,
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject)
  };
  return q;
};

const hrAdminToken = jwt.sign(
  { userId: 'usr-hr-privacy-01', companyId: COMPANY_ID, role: 'hr_admin' },
  TEST_SECRET,
  { expiresIn: '1h' }
);

const employeeToken = jwt.sign(
  { userId: 'usr-emp-privacy-01', companyId: COMPANY_ID, role: 'employee' },
  TEST_SECRET,
  { expiresIn: '1h' }
);

describe('Core Privacy Promises: N >= 5 Threshold & Zero Individual HR Visibility', () => {
  const originals = {};

  beforeEach(() => {
    originals.tenantFindOne = Tenant.findOne;
    originals.tenantCountDocuments = Tenant.countDocuments;
    originals.deptFind = Department.find;
    originals.pwlCount = PersonalWellnessLog.countDocuments;
    originals.pwlAggregate = PersonalWellnessLog.aggregate;
    originals.anonCount = AnonHazardLog.countDocuments;
    originals.anonFind = AnonHazardLog.find;
    originals.cycleFind = AssessmentCycle.find;
    originals.referralFind = Referral.find;

    Tenant.findOne = () => createMockQuery({
      company_id: COMPANY_ID,
      company_name: 'Privacy Corp',
      used_seats: 12,
      max_allowed_seats: 50
    });
    Tenant.countDocuments = async () => 5;
    Department.find = () => createMockQuery([
      { department_id: 'dept-eng', name: 'Engineering', company_id: COMPANY_ID, is_active: true },
      { department_id: 'dept-small', name: 'Legal', company_id: COMPANY_ID, is_active: true }
    ]);
  });

  afterEach(() => {
    Tenant.findOne = originals.tenantFindOne;
    Tenant.countDocuments = originals.tenantCountDocuments;
    Department.find = originals.deptFind;
    PersonalWellnessLog.countDocuments = originals.pwlCount;
    PersonalWellnessLog.aggregate = originals.pwlAggregate;
    AnonHazardLog.countDocuments = originals.anonCount;
    AnonHazardLog.find = originals.anonFind;
    AssessmentCycle.find = originals.cycleFind;
    Referral.find = originals.referralFind;
  });

  it('Promise 1: HR cannot query another worker completion status (?worker_id=...) — returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/assessments/completed-status?worker_id=usr-emp-target-99')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('PRIVACY_VIOLATION');
  });

  it('Promise 1: Another employee cannot query someone else completion status — returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/assessments/completed-status?worker_id=usr-emp-other-02')
      .set('Authorization', `Bearer ${employeeToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('PRIVACY_VIOLATION');
  });

  it('Promise 1: Cross-tenant completed-status queries are rejected with 403', async () => {
    const res = await request(app)
      .get('/api/v1/assessments/completed-status?tenant_id=other-company-999')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('CROSS_TENANT_FORBIDDEN');
  });

  it('Promise 1: HR /api/v1/hr/analytics never returns individual score arrays (moodList/mood array) even when N >= 5', async () => {
    PersonalWellnessLog.countDocuments = async () => 6;
    PersonalWellnessLog.aggregate = async () => ([{
      _id: null,
      total_responses: 6,
      avgMood: 74,
      avgCalm: 68,
      avgStress: 38,
      avgEnergy: 72,
      avgWorkFit: 79
    }]);

    const res = await request(app)
      .get('/api/v1/hr/analytics')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).not.toBe('SUPPRESSED');
    expect(res.body.averages).toEqual({
      mood: 74,
      calm: 68,
      stress: 38,
      energy: 72,
      work_fit: 79
    });
    expect(Array.isArray(res.body.aggregated_scores?.mood)).toBe(false);
    expect(Array.isArray(res.body.aggregated_scores?.calm)).toBe(false);
    expect(Array.isArray(res.body.aggregated_scores?.stress)).toBe(false);
    expect(res.body.aggregated_scores?.individual_series_omitted).toBe(true);
  });

  it('Promise 1: HR /api/v1/referrals/employer-billing strictly omits patientName, contact, notes, thread, and priority', async () => {
    Referral.find = () => createMockQuery([
      {
        referenceCode: 'HAV-ANON1',
        departmentName: 'Engineering',
        preferredTime: 'Morning',
        status: 'completed',
        billing: { amount: 300, currency: 'GHS', isBilled: true, settlementStatus: 'pending_payment' },
        createdAt: new Date()
      }
    ]);

    const res = await request(app)
      .get('/api/v1/referrals/employer-billing')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const row = res.body.data[0];
    expect(row.referenceCode).toBe('HAV-ANON1');
    expect(row.patientName).toBeUndefined();
    expect(row.patientContact).toBeUndefined();
    expect(row.clinicalDetails).toBeUndefined();
    expect(row.priority).toBeUndefined();
    expect(row.topic).toBeUndefined();
    expect(row.notes).toBeUndefined();
    expect(row.thread).toBeUndefined();
  });

  it('Promise 2: Groups with N < 5 fail verifyNSizeCompliance unless metrics are null (suppressed)', () => {
    const check = verifyNSizeCompliance([
      {
        department_id: 'dept-leaked',
        response_count: 4,
        meets_n_size: true,
        metrics: { burnout: 70 }
      },
      {
        department_id: 'dept-suppressed',
        response_count: 4,
        meets_n_size: false,
        metrics: null
      },
      {
        department_id: 'dept-valid',
        response_count: 5,
        meets_n_size: true,
        metrics: { burnout: 70 }
      }
    ], 5);

    expect(check.compliant).toBe(false);
    expect(check.violations).toHaveLength(1);
    expect(check.violations[0].department_id).toBe('dept-leaked');
  });

  it('Promise 2: HR /api/v1/hr/analytics suppresses groups with N < 5 and suppresses unknown departments without leaking company data', async () => {
    PersonalWellnessLog.countDocuments = async () => 10;
    PersonalWellnessLog.aggregate = async (pipeline) => {
      const matchStage = pipeline.find(p => p.$match)?.$match || {};
      if (matchStage.department_id === 'dept-small' || matchStage.department_id === '__unmatched_department__') {
        return [{ _id: null, total_responses: matchStage.department_id === 'dept-small' ? 4 : 0 }];
      }
      return [{ _id: null, total_responses: 10, avgMood: 75 }];
    };

    const smallRes = await request(app)
      .get('/api/v1/hr/analytics?department=Legal')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(smallRes.status).toBe(200);
    expect(smallRes.body.status).toBe('SUPPRESSED');
    expect(smallRes.body.meets_n_threshold).toBe(false);
    expect(smallRes.body.averages).toBeUndefined();

    const unknownDeptRes = await request(app)
      .get('/api/v1/hr/analytics?department=NonExistentTeam')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(unknownDeptRes.status).toBe(200);
    expect(unknownDeptRes.body.status).toBe('SUPPRESSED');
    expect(unknownDeptRes.body.meets_n_threshold).toBe(false);
    expect(unknownDeptRes.body.averages).toBeUndefined();
  });

  it('Promise 2: HR /api/v1/hr/severity-trends suppresses individual weeks with N < 5 even when company total >= 5', async () => {
    AnonHazardLog.countDocuments = async () => 7;
    AnonHazardLog.find = () => createMockQuery([
      // 2026-W10 has only 2 submissions (< 5) -> MUST be suppressed
      { period_year: 2026, period_week: 10, severity_band: 'severe' },
      { period_year: 2026, period_week: 10, severity_band: 'severe' },
      // 2026-W11 has 5 submissions (>= 5) -> Allowed
      { period_year: 2026, period_week: 11, severity_band: 'healthy' },
      { period_year: 2026, period_week: 11, severity_band: 'healthy' },
      { period_year: 2026, period_week: 11, severity_band: 'mild' },
      { period_year: 2026, period_week: 11, severity_band: 'moderate' },
      { period_year: 2026, period_week: 11, severity_band: 'healthy' }
    ]);

    const res = await request(app)
      .get('/api/v1/hr/severity-trends')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.labels).toEqual(['2026-W11']);
    expect(res.body.labels).not.toContain('2026-W10');
  });

  it('Promise 2: HR /api/v1/hr/severity-trends returns SUPPRESSED if no single reporting week reaches N >= 5', async () => {
    AnonHazardLog.countDocuments = async () => 6;
    AnonHazardLog.find = () => createMockQuery([
      { period_year: 2026, period_week: 10, severity_band: 'severe' },
      { period_year: 2026, period_week: 10, severity_band: 'mild' },
      { period_year: 2026, period_week: 11, severity_band: 'healthy' },
      { period_year: 2026, period_week: 11, severity_band: 'moderate' },
      { period_year: 2026, period_week: 12, severity_band: 'healthy' },
      { period_year: 2026, period_week: 12, severity_band: 'mild' }
    ]);

    const res = await request(app)
      .get('/api/v1/hr/severity-trends')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('SUPPRESSED');
    expect(res.body.labels).toEqual([]);
  });

  it('Promise 2: HR /api/v1/hr/benchmarks omits instruments with sample_size < 5', async () => {
    PersonalWellnessLog.aggregate = async () => ([
      { _id: 'phq9', avgScore: 14, count: 3 },
      { _id: 'copsoq3', avgScore: 76, count: 12 }
    ]);

    const res = await request(app)
      .get('/api/v1/hr/benchmarks')
      .set('Authorization', `Bearer ${hrAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.benchmarks.phq9).toBeUndefined();
    expect(res.body.benchmarks.copsoq3).toBeDefined();
    expect(res.body.benchmarks.copsoq3.sample_size).toBe(12);
  });
});
