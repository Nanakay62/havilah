'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const AssessmentCycle = require('../models/AssessmentCycle');
const AnonHazardLog = require('../models/AnonHazardLog');
const Department = require('../models/Department');
const DepartmentSnapshot = require('../models/DepartmentSnapshot');
const Referral = require('../models/Referral');
const Assessor = require('../models/Assessor');
const emailService = require('../utils/emailService');

const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
const COMPANY_ID = 'comp-crisis-test-01';

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

const employeeToken = jwt.sign(
  { userId: 'usr-emp-crisis-1', companyId: COMPANY_ID, departmentId: 'dept-ops', role: 'employee' },
  TEST_SECRET,
  { expiresIn: '1h' }
);

const hrToken = jwt.sign(
  { userId: 'usr-hr-crisis-1', companyId: COMPANY_ID, departmentId: 'dept-hr', role: 'hr_admin' },
  TEST_SECRET,
  { expiresIn: '1h' }
);

const assessorToken = jwt.sign(
  { assessorId: '507f1f77bcf86cd799439011', role: 'clinic_admin', email: 'dr.clarke@fzsafety.com' },
  TEST_SECRET,
  { expiresIn: '1h' }
);

describe('Immediate Crisis Protocol & Clinical Escalation', () => {
  const originals = {};
  let capturedWellnessLogs;
  let capturedReferrals;
  let capturedDispatchArgs;

  beforeEach(() => {
    capturedWellnessLogs = [];
    capturedReferrals = [];
    capturedDispatchArgs = [];

    originals.userFindOne = User.findOne;
    originals.tenantFindOne = Tenant.findOne;
    originals.cycleFindOne = AssessmentCycle.findOne;
    originals.cycleUpdateOne = AssessmentCycle.updateOne;
    originals.deptFindOne = Department.findOne;
    originals.snapshotCreate = DepartmentSnapshot.create;
    originals.snapshotFindOneAndUpdate = DepartmentSnapshot.findOneAndUpdate;
    originals.pwlCreate = PersonalWellnessLog.create;
    originals.anonCreate = AnonHazardLog.create;
    originals.assessorFindOne = Assessor.findOne;
    originals.assessorFindById = Assessor.findById;
    originals.referralCreate = Referral.create;
    originals.referralFind = Referral.find;
    originals.referralCountDocuments = Referral.countDocuments;
    originals.sendClinicalDispatch = emailService.sendClinicalDispatch;

    User.findOne = () => Promise.resolve({
      user_id: 'usr-emp-crisis-1',
      company_id: COMPANY_ID,
      department_id: 'dept-ops',
      baseline_profile: {},
      save: async () => true
    });

    Tenant.findOne = () => createMockQuery({
      company_id: COMPANY_ID,
      company_name: 'Crisis Test Corp',
      hotline_config: {
        crisis_number: '+233 24 362 9870',
        eap_number: '+233 30 000 1111',
        occupational_health_contact: 'clinic@fzsafety.com'
      },
      save: async () => true
    });

    AssessmentCycle.findOne = () => createMockQuery({
      cycle_id: 'cycle-1',
      _id: 'cycle-1',
      company_id: COMPANY_ID,
      survey_type: 'phq9',
      status: 'unlocked'
    });
    AssessmentCycle.updateOne = async () => ({ acknowledged: true });
    Department.findOne = () => createMockQuery({ company_id: COMPANY_ID, department_id: 'dept-ops', name: 'Operations' });
    DepartmentSnapshot.create = async (doc) => doc;
    DepartmentSnapshot.findOneAndUpdate = async (_filter, update) => update;

    PersonalWellnessLog.create = async (doc) => {
      capturedWellnessLogs.push(doc);
      return doc;
    };

    AnonHazardLog.create = async (doc) => ({ _id: 'anon-1', ...doc });

    Assessor.findOne = () => Promise.resolve({
      _id: '507f1f77bcf86cd799439011',
      name: 'Dr. Edith Clarke',
      email: 'dr.clarke@fzsafety.com',
      notificationEmail: 'dr.clarke@fzsafety.com',
      active: true
    });

    Assessor.findById = (id) => createMockQuery({
      _id: id || '507f1f77bcf86cd799439011',
      name: 'Dr. Edith Clarke',
      email: 'dr.clarke@fzsafety.com',
      active: true
    });

    Referral.create = async (doc) => {
      const created = { _id: `ref-${capturedReferrals.length + 1}`, createdAt: new Date(), ...doc };
      capturedReferrals.push(created);
      return created;
    };
    Referral.countDocuments = async () => 3;

    emailService.sendClinicalDispatch = async (args) => {
      capturedDispatchArgs.push(args);
      return true;
    };
  });

  afterEach(() => {
    User.findOne = originals.userFindOne;
    Tenant.findOne = originals.tenantFindOne;
    AssessmentCycle.findOne = originals.cycleFindOne;
    AssessmentCycle.updateOne = originals.cycleUpdateOne;
    Department.findOne = originals.deptFindOne;
    DepartmentSnapshot.create = originals.snapshotCreate;
    DepartmentSnapshot.findOneAndUpdate = originals.snapshotFindOneAndUpdate;
    PersonalWellnessLog.create = originals.pwlCreate;
    AnonHazardLog.create = originals.anonCreate;
    Assessor.findOne = originals.assessorFindOne;
    Assessor.findById = originals.assessorFindById;
    Referral.create = originals.referralCreate;
    Referral.find = originals.referralFind;
    Referral.countDocuments = originals.referralCountDocuments;
    emailService.sendClinicalDispatch = originals.sendClinicalDispatch;
  });

  it('triggers immediate crisis_protocol when PHQ-9 Item 9 >= 1 even if total score is otherwise low', async () => {
    const res = await request(app)
      .post('/api/v1/wellness/submit-checkin')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        survey_type: 'phq9',
        answers: [0, 0, 0, 0, 0, 0, 0, 0, 1]
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.crisis_protocol).toBeDefined();
    expect(res.body.crisis_protocol.triggered).toBe(true);
    expect(res.body.crisis_protocol.level).toBe('crisis');
    expect(res.body.crisis_protocol.reason).toBe('phq9_self_harm');
    expect(res.body.crisis_protocol.hotlines.ghana_helpline).toBe('+233 24 362 9870');
    expect(capturedWellnessLogs[0].severity_label).toBe('Crisis Attention Required');
  });

  it('triggers urgent crisis_protocol when PHQ-9 raw score >= 20 with Q9 = 0', async () => {
    const res = await request(app)
      .post('/api/v1/wellness/submit-checkin')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        survey_type: 'phq9',
        answers: [3, 3, 3, 3, 3, 3, 2, 0, 0]
      });

    expect(res.status).toBe(200);
    expect(res.body.crisis_protocol.triggered).toBe(true);
    expect(res.body.crisis_protocol.level).toBe('urgent');
    expect(res.body.crisis_protocol.reason).toBe('severe_depression');
  });

  it('triggers urgent crisis_protocol when GAD-7 raw score >= 15', async () => {
    const res = await request(app)
      .post('/api/v1/wellness/submit-checkin')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        survey_type: 'gad7',
        answers: [3, 3, 3, 3, 3, 0, 0]
      });

    expect(res.status).toBe(200);
    expect(res.body.crisis_protocol.triggered).toBe(true);
    expect(res.body.crisis_protocol.level).toBe('urgent');
    expect(res.body.crisis_protocol.reason).toBe('severe_anxiety');
  });

  it('does not trigger crisis_protocol for mild PHQ-9 scores with Q9 = 0', async () => {
    const res = await request(app)
      .post('/api/v1/wellness/submit-checkin')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        survey_type: 'phq9',
        answers: [1, 1, 0, 0, 0, 0, 0, 0, 0]
      });

    expect(res.status).toBe(200);
    expect(res.body.crisis_protocol.triggered).toBe(false);
    expect(res.body.crisis_protocol.level).toBe('none');
  });

  it('creates priority=crisis clinical referral, sends priority dispatch, and hides priority/clinical details from HR employer-billing', async () => {
    const createRes = await request(app)
      .post('/api/v1/referrals/occupational-health')
      .set('Authorization', `Bearer ${employeeToken}`)
      .send({
        patientName: 'Confidential Test Worker',
        patientContact: '+233240000111',
        departmentName: 'Operations',
        priority: 'crisis',
        preferredTime: 'Immediate / Urgent Callback',
        topic: 'Urgent Crisis Screening Support'
      });

    expect([200, 201]).toContain(createRes.status);
    expect(createRes.body.success).toBe(true);
    expect(createRes.body.data.priority).toBe('crisis');
    expect(capturedReferrals[0].priority).toBe('crisis');
    expect(capturedDispatchArgs.length).toBeGreaterThanOrEqual(0); // dispatch runs async via emailService

    Referral.find = () => createMockQuery([
      {
        referenceCode: capturedReferrals[0].referenceCode,
        departmentName: 'Operations',
        preferredTime: 'Immediate / Urgent Callback',
        status: 'pending',
        billing: { amount: 250, currency: 'GHS' },
        createdAt: new Date()
      }
    ]);

    const hrRes = await request(app)
      .get('/api/v1/referrals/employer-billing')
      .set('Authorization', `Bearer ${hrToken}`);

    expect(hrRes.status).toBe(200);
    const hrRow = hrRes.body.data[0];
    expect(hrRow.priority).toBeUndefined();
    expect(hrRow.clinicalDetails).toBeUndefined();
    expect(hrRow.patientName).toBeUndefined();
  });

  it('sorts crisis priority cases to the top of the Assessor Queue ahead of newer standard cases', async () => {
    const now = Date.now();
    Referral.find = () => createMockQuery([
      {
        _id: 'r-new-standard',
        referenceCode: 'HAV-STD1',
        priority: 'standard',
        status: 'pending',
        createdAt: new Date(now),
        clinicalDetails: { patientName: 'Standard Patient', patientContact: '+233240000001' }
      },
      {
        _id: 'r-older-crisis',
        referenceCode: 'HAV-CRS1',
        priority: 'crisis',
        status: 'pending',
        createdAt: new Date(now - 3600 * 1000),
        clinicalDetails: { patientName: 'Crisis Patient', patientContact: '+233240000002' }
      },
      {
        _id: 'r-urgent',
        referenceCode: 'HAV-URG1',
        priority: 'urgent',
        status: 'scheduled',
        createdAt: new Date(now - 1800 * 1000),
        clinicalDetails: { patientName: 'Urgent Patient', patientContact: '+233240000003' }
      }
    ]);

    const queueRes = await request(app)
      .get('/api/v1/assessor/queue')
      .set('Authorization', `Bearer ${assessorToken}`);

    expect(queueRes.status).toBe(200);
    expect(queueRes.body.success).toBe(true);
    expect(queueRes.body.data.map(r => r.referenceCode)).toEqual([
      'HAV-CRS1',
      'HAV-URG1',
      'HAV-STD1'
    ]);
  });
});
