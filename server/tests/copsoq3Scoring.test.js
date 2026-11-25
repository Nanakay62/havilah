'use strict';

const { scoreCOPSOQ3, COPSOQ3_ITEMS } = require('../utils/copsoq3Scoring');

describe('COPSOQ-III Official Scoring Implementation', () => {
  it('maps item codes to correct dimension and direction', () => {
    expect(COPSOQ3_ITEMS['QD1']).toBeDefined();
    expect(COPSOQ3_ITEMS['QD1'].dim).toBe('Quantitative Demands');
    expect(COPSOQ3_ITEMS['QD1'].type).toBe('desc'); // Type desc: [100, 75, 50, 25, 0]

    expect(COPSOQ3_ITEMS['QD4']).toBeDefined();
    expect(COPSOQ3_ITEMS['QD4'].type).toBe('asc'); // Reverse scored item: [0, 25, 50, 75, 100]
  });

  it('correctly scores an assessment when valid items meet threshold', () => {
    // Answer all QD items: QD1=0 (100), QD2=0 (100), QD3=0 (100), QD4=4 (100)
    const responses = [
      { item_code: 'QD1', value: 0 },
      { item_code: 'QD2', value: 0 },
      { item_code: 'QD3', value: 0 },
      { item_code: 'QD4', value: 4 },
    ];

    const result = scoreCOPSOQ3(responses);
    expect(result).toBeDefined();
    expect(result.dimension_scores.has('Quantitative Demands')).toBe(true);
    expect(result.dimension_scores.get('Quantitative Demands')).toBe(100);
    expect(result.composite_score).toBe(100);
    expect(result.severity_band).toBe('severe');
  });

  it('rejects dimension calculation if fewer than 50% of items are answered', () => {
    // Quantitative demands has 4 items. Only answer 1 item (25% < 50%)
    const responses = [
      { item_code: 'QD1', value: 0 },
    ];

    const result = scoreCOPSOQ3(responses);
    expect(result.dimension_scores.has('Quantitative Demands')).toBe(false);
    expect(result.composite_score).toBe(0);
    expect(result.severity_band).toBe('healthy');
  });

  it('handles empty and invalid responses without throwing', () => {
    const result = scoreCOPSOQ3([]);
    expect(result.composite_score).toBe(0);
    expect(result.severity_band).toBe('healthy');

    const invalid = scoreCOPSOQ3([
      { item_code: 'UNKNOWN_ITEM', value: 3 },
      { item_code: 'QD1', value: -1 },
      { item_code: 'QD2', value: 99 },
    ]);
    expect(invalid.composite_score).toBe(0);
  });

  it('aligns frontend 32-item Core questionnaire with backend valence-aware scoring and dimension weights', () => {
    const path = require('path');
    if (typeof global.window === 'undefined') global.window = global;
    require(path.resolve(__dirname, '../../public/js/data.js'));

    const core = global.window.copsoq3_core;
    const dimMeta = global.window.COPSOQ3_DIM_META;
    expect(core.questions).toHaveLength(32);

    const healthyScores = core.questions.map((q) => (dimMeta[q.dim].valence === 'hazard' ? 0 : 100));
    expect(core.score(healthyScores)).toBe(100);

    const healthyResponses = core.questions.map((q) => ({
      item_code: q.id,
      score: dimMeta[q.dim].valence === 'hazard' ? 0 : 100,
    }));
    const backendHealthy = scoreCOPSOQ3(healthyResponses, { version: 'copsoq3_core' });
    expect(backendHealthy.wellbeing_index).toBe(100);
    expect(backendHealthy.composite_score).toBe(0);
    expect(backendHealthy.severity_band).toBe('healthy');

    const strainScores = core.questions.map((q) => (dimMeta[q.dim].valence === 'hazard' ? 100 : 0));
    expect(core.score(strainScores)).toBe(0);

    const strainResponses = core.questions.map((q) => ({
      item_code: q.id,
      score: dimMeta[q.dim].valence === 'hazard' ? 100 : 0,
    }));
    const backendStrain = scoreCOPSOQ3(strainResponses, { version: 'copsoq3_core' });
    expect(backendStrain.wellbeing_index).toBe(0);
    expect(backendStrain.composite_score).toBe(100);
    expect(backendStrain.severity_band).toBe('severe');
  });

  it('enforces version-aware >= 50% dimension completion rule across Core, Middle, and Long', () => {
    const singleQdInMiddle = scoreCOPSOQ3([{ item_code: 'QD1', score: 100 }], { version: 'copsoq3_middle' });
    expect(singleQdInMiddle.dimension_scores.has('Quantitative Demands')).toBe(false);

    const twoQdInMiddle = scoreCOPSOQ3(
      [{ item_code: 'QD1', score: 100 }, { item_code: 'QD2', score: 50 }],
      { version: 'copsoq3_middle' }
    );
    expect(twoQdInMiddle.dimension_scores.get('Quantitative Demands')).toBe(75);

    const oneQdInCore = scoreCOPSOQ3([{ item_code: 'QD2', score: 50 }], { version: 'copsoq3_core' });
    expect(oneQdInCore.dimension_scores.get('Quantitative Demands')).toBe(50);

    const twoQdInLong = scoreCOPSOQ3(
      [{ item_code: 'QD1', score: 100 }, { item_code: 'QD2', score: 100 }],
      { version: 'copsoq3_long' }
    );
    expect(twoQdInLong.dimension_scores.get('Quantitative Demands')).toBe(100);
  });

  it('scores COPSOQ-III Long items GH2 (0-10), QD4/OD4 alias, BO1..4, SE1..6, BU2 while skipping 5M and Not relevant (-1)', () => {
    const longRes = scoreCOPSOQ3(
      [
        { item_code: 'GH1', value: 0 },
        { item_code: 'GH2', value: 8 },
        { item_code: 'OD4', value: 4 },
        { item_code: 'QD1', value: 0 },
        { item_code: 'BO1', value: 2 },
        { item_code: 'BO2', value: 2 },
        { item_code: 'SE1', value: 0 },
        { item_code: 'SE2', value: 0 },
        { item_code: 'SE3', value: 0 },
        { item_code: 'BU2', score: -1 },
        { item_code: 'GS2', value: 1 },
        { item_code: 'BU3', value: 1 },
      ],
      { version: 'copsoq3_long' }
    );

    expect(longRes.dimension_scores.get('Self-Rated Health')).toBe(90);
    expect(longRes.dimension_scores.get('Quantitative Demands')).toBe(100);
    expect(longRes.dimension_scores.get('Burnout')).toBe(50);
    expect(longRes.dimension_scores.get('Self-Efficacy')).toBe(100);
    expect(longRes.dimension_scores.has('Bullying')).toBe(false);
    expect(longRes.dimension_scores.has('Gossip and Slander')).toBe(false);
  });
});

describe('HR Analytics Pipeline Deduplication & Zero-Imputation Safeguards', () => {
  const request = require('supertest');
  const jwt = require('jsonwebtoken');
  const app = require('../server');
  const Tenant = require('../models/Tenant');
  const Department = require('../models/Department');
  const PersonalWellnessLog = require('../models/PersonalWellnessLog');

  const originals = {};
  const secret = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
  const companyId = 'comp-analytics-dedup-test';
  const hrToken = jwt.sign({ userId: 'hr-user-1', companyId, role: 'hr_admin' }, secret, { expiresIn: '1h' });

  const mockQuery = (data) => {
    const q = {
      select: () => q,
      sort: () => q,
      limit: () => q,
      lean: () => Promise.resolve(data),
      then: (res, rej) => Promise.resolve(data).then(res, rej),
    };
    return q;
  };

  beforeEach(() => {
    originals.tenantFindOne = Tenant.findOne;
    originals.deptFind = Department.find;
    originals.pwlCount = PersonalWellnessLog.countDocuments;
    originals.pwlAggregate = PersonalWellnessLog.aggregate;

    Tenant.findOne = () => mockQuery({
      company_id: companyId,
      company_name: 'Dedup Check Ltd',
      used_seats: 10,
      max_allowed_seats: 25,
    });
    Department.find = () => mockQuery([
      { department_id: 'd1', name: 'Operations', company_id: companyId, is_active: true },
    ]);
    PersonalWellnessLog.countDocuments = async () => 12;
  });

  afterEach(() => {
    Tenant.findOne = originals.tenantFindOne;
    Department.find = originals.deptFind;
    PersonalWellnessLog.countDocuments = originals.pwlCount;
    PersonalWellnessLog.aggregate = originals.pwlAggregate;
  });

  it('deduplicates respondents by user_id in /api/v1/hr/analytics, omits $ifNull fake 70/40 defaults, and preserves null dimensions', async () => {
    let capturedPipeline = null;

    PersonalWellnessLog.aggregate = async (pipeline) => {
      capturedPipeline = pipeline;
      return [{
        unique_respondents: 6,
        total_responses: 12,
        avgMood: 76,
        avgCalm: null,
        avgStress: 68,
        avgEnergy: null,
        avgWorkFit: 80,
      }];
    };

    const res = await request(app)
      .get('/api/v1/hr/analytics')
      .set('Authorization', 'Bearer ' + hrToken);

    expect(res.status).toBe(200);
    expect(res.body.meets_n_threshold).toBe(true);
    expect(res.body.unique_respondents).toBe(6);
    expect(res.body.averages).toEqual({
      mood: 76,
      calm: null,
      stress: 68,
      energy: null,
      work_fit: 80,
    });

    const pipelineJson = JSON.stringify(capturedPipeline);
    expect(pipelineJson).not.toContain('$ifNull');
    expect(capturedPipeline[1]).toEqual({ $sort: { submitted_at: -1 } });
    expect(capturedPipeline[2].$group._id).toBe('$user_id');
    expect(capturedPipeline[2].$group.mood_vals).toEqual({ $push: '$dimension_scores.mood' });
    expect(capturedPipeline[3].$project.mood.$arrayElemAt).toBeDefined();

    PersonalWellnessLog.aggregate = async () => [{
      unique_respondents: 3,
      total_responses: 15,
      avgMood: 70,
    }];
    const suppressedRes = await request(app)
      .get('/api/v1/hr/analytics')
      .set('Authorization', 'Bearer ' + hrToken);

    expect(suppressedRes.status).toBe(200);
    expect(suppressedRes.body.status).toBe('SUPPRESSED');
    expect(suppressedRes.body.meets_n_threshold).toBe(false);
  });

  it('passes days query filter to /api/v1/hr/analytics and returns participation_rate', async () => {
    let capturedPipeline = null;
    PersonalWellnessLog.aggregate = async (pipeline) => {
      capturedPipeline = pipeline;
      return [{
        unique_respondents: 5,
        total_responses: 10,
        avgMood: 80,
        avgCalm: 75,
        avgStress: 70,
        avgEnergy: 65,
        avgWorkFit: 85,
      }];
    };

    const res = await request(app)
      .get('/api/v1/hr/analytics?days=30')
      .set('Authorization', 'Bearer ' + hrToken);

    expect(res.status).toBe(200);
    expect(res.body.participation_rate).toBe(50);
    expect(capturedPipeline[0].$match.submitted_at.$gte).toBeInstanceOf(Date);
  });

  it('returns canonical 0-100 risk dimensions in /api/v1/hr/heatmap with N >= 5 enforcement', async () => {
    const AnonHazardLog = require('../models/AnonHazardLog');
    const origAnonAgg = AnonHazardLog.aggregate;

    AnonHazardLog.aggregate = async () => [
      {
        department_id: 'd1',
        department_name: 'Operations',
        count: 6,
        meets_n_size: true,
        avg_composite: 25,
        avg_likelihood: 2,
        avg_severity: 2,
        severity_bands: ['healthy', 'healthy', 'healthy', 'mild', 'mild', 'healthy'],
        dimension_scores_list: [],
        log_entries: [
          { survey_type: 'phq9', composite_score: 40, dimension_scores: { depression: 40 } },
          { survey_type: 'copsoq3_core', composite_score: 10, dimension_scores: { 'Meaning of Work': 90, risk_work_fit: 10 } },
          { survey_type: 'daily_pulse', composite_score: 25, dimension_scores: { mood: 80, calm: 70, risk_mood: 20, risk_calm: 30 } },
        ],
      },
    ];

    try {
      const hmRes = await request(app)
        .get('/api/v1/hr/heatmap')
        .set('Authorization', 'Bearer ' + hrToken);

      expect(hmRes.status).toBe(200);
      expect(hmRes.body.success).toBe(true);
      expect(hmRes.body.data).toHaveLength(1);
      expect(hmRes.body.data[0].metrics.avg_risk_dimensions.mood).toBe(30);
      expect(hmRes.body.data[0].metrics.avg_risk_dimensions.calm).toBe(30);
      expect(hmRes.body.data[0].metrics.avg_risk_dimensions.work_fit).toBe(10);
      expect(hmRes.body.data[0].metrics.avg_risk_dimensions.energy).toBeNull();
    } finally {
      AnonHazardLog.aggregate = origAnonAgg;
    }
  });

  it('rejects incomplete clinical submission with 400 VALIDATION_ERROR on /api/v1/wellness/submit-checkin', async () => {
    const User = require('../models/User');
    const AssessmentCycle = require('../models/AssessmentCycle');
    const origUserFind = User.findOne;
    const origCycleFind = AssessmentCycle.findOne;
    const empToken = jwt.sign(
      { userId: 'emp-incomplete-1', companyId, departmentId: 'd1', role: 'employee', status: 'active' },
      secret,
      { expiresIn: '1h' }
    );

    User.findOne = () => mockQuery({
      user_id: 'emp-incomplete-1',
      company_id: companyId,
      department_id: 'd1',
      role: 'employee',
      status: 'active',
      baseline_profile: {},
      save: async () => true,
    });
    AssessmentCycle.findOne = () => mockQuery({ cycle_id: 'c-1', survey_type: 'phq9', status: 'unlocked' });
    const origCycleUpd = AssessmentCycle.updateOne;
    AssessmentCycle.updateOne = async () => ({ modifiedCount: 1 });

    try {
      const res = await request(app)
        .post('/api/v1/wellness/submit-checkin')
        .set('Authorization', 'Bearer ' + empToken)
        .send({ survey_type: 'phq9', answers: [1, 2] });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    } finally {
      User.findOne = origUserFind;
      AssessmentCycle.findOne = origCycleFind;
      AssessmentCycle.updateOne = origCycleUpd;
    }
  });
});
