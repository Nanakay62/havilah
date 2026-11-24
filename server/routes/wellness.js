'use strict';

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const { validateSession, requireConsent } = require('../middleware/auth');
const { requireFeature } = require('../middleware/tierGate');
const hazardController = require('../controllers/hazardController');
const { scoreCOPSOQ3, VERSION_ITEM_LISTS } = require('../utils/copsoq3Scoring');
const { coarsenTimestamp } = require('../utils/crypto');
const {
  getIsoWeekNumber,
  normalizeDailyPulseRating,
  classifyDailyPulse,
  scoreClinicalAssessment,
  reconstructRawFromIndex,
} = require('../utils/clinicalScoring');

// Helper to compute core dimensions and clinical scales
function evaluateCrisisRisk(surveyType, answers, rawScore, hotlineConfig = {}) {
  const normType = String(surveyType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let phq9Item9Score = 0;

  if (normType.includes('PHQ9') && answers) {
    if (Array.isArray(answers) && answers.length >= 9) {
      phq9Item9Score = Number(answers[8]) || 0;
    } else if (typeof answers === 'object') {
      const q9Candidate = answers.phq9_q9 ?? answers.q9 ?? answers['8'] ?? answers[8];
      phq9Item9Score = Number(q9Candidate) || 0;
    }
  }

  const hotlines = {
    crisis_number: hotlineConfig.crisis_number || '+233 24 362 9870',
    ghana_helpline: '+233 24 362 9870',
    emergency_ghana: '112 / 193',
    international_crisis: '988 (US/CA) or local emergency services',
    eap_number: hotlineConfig.eap_number || '',
    occupational_health_contact: hotlineConfig.occupational_health_contact || ''
  };

  if (phq9Item9Score >= 1) {
    return {
      triggered: true,
      level: 'crisis',
      reason: 'phq9_self_harm',
      phq9_item9_score: phq9Item9Score,
      headline: 'Immediate Support Is Available',
      message: 'Your response indicates thoughts of self-harm or being better off dead. You do not have to carry this alone: confidential crisis support and an urgent clinician callback are available right now.',
      hotlines
    };
  }

  if ((normType.includes('PHQ9') && rawScore >= 20) || (normType.includes('GAD7') && rawScore >= 15)) {
    return {
      triggered: true,
      level: 'urgent',
      reason: normType.includes('PHQ9') ? 'severe_depression' : 'severe_anxiety',
      phq9_item9_score: phq9Item9Score,
      headline: 'Priority Clinical Support Recommended',
      message: 'Your screening score falls in the severe range. Immediate helpline numbers and confidential clinician support are available below.',
      hotlines
    };
  }

  return {
    triggered: false,
    level: 'none',
    phq9_item9_score: phq9Item9Score,
    hotlines
  };
}

function computeDimensions(surveyType, answers, structuredResponses = null) {
  const normType = (surveyType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  if (normType.includes('COPSOQ')) {
    const versionList = VERSION_ITEM_LISTS[surveyType] || VERSION_ITEM_LISTS.copsoq3_core;
    const copsoqInput = Array.isArray(structuredResponses) && structuredResponses.length > 0
      ? structuredResponses
      : (Array.isArray(answers) ? answers : []).map((v, idx) => {
          const obj = (v !== null && typeof v === 'object') ? v : null;
          if (obj) return obj;
          const code = versionList[idx];
          const num = Number(v);
          return Number.isFinite(num) ? { item_code: code, question_index: idx, score: num } : null;
        }).filter(Boolean);

    const scored = scoreCOPSOQ3(copsoqInput, { version: VERSION_ITEM_LISTS[surveyType] ? surveyType : undefined });
    const normalized = scored.wellbeing_index;
    const severityLabel = normalized >= 75
      ? 'Optimal Psychosocial Fit'
      : normalized >= 50
        ? 'Moderate Psychosocial Risk'
        : 'Elevated Psychosocial Risk';

    const dimsObj = {};
    if (scored.dimension_scores instanceof Map) {
      for (const [k, v] of scored.dimension_scores.entries()) {
        dimsObj[k] = v;
      }
    }

    return {
      dimLabel: 'work_fit',
      normalized,
      rawScore: normalized,
      maxScore: 100,
      severityLabel,
      severity_band: scored.severity_band,
      dimension_scores: dimsObj,
    };
  }

  const clinical = scoreClinicalAssessment(surveyType, Array.isArray(answers) ? answers : []);
  return {
    dimLabel: clinical.dim_label,
    normalized: clinical.wellbeing_index,
    rawScore: clinical.raw_score,
    maxScore: clinical.max_score,
    severityLabel: clinical.severity_label,
    severity_band: clinical.severity_band,
  };
}

// Ensure the user has consented before submitting check-ins
router.use(validateSession);

/**
 * @route   GET /api/v1/wellness/active-cycles
 * @desc    Fetch active assessment cycles for the authenticated employee
 * @access  Authenticated (consent not required for cycle check)
 */
router.get('/active-cycles', async (req, res, next) => {
  try {
    const { company_id, department_id, user_id } = req.sessionData;
    const AssessmentCycle = require('../models/AssessmentCycle');
    const TenantModel = require('../models/Tenant');
    let tenant = null;
    try {
      tenant = await TenantModel.findOne({ company_id });
    } catch (_) {}

    if (tenant && tenant.account_type === 'individual') {
      const effectiveTier = typeof tenant.getEffectiveTier === 'function' ? tenant.getEffectiveTier() : 'free';
      const individualTypes = ['copsoq3', 'phq9', 'gad7', 'pss10', 'fas10'];
      const recentCutoff = new Date();
      recentCutoff.setDate(recentCutoff.getDate() - 90);
      const completedLogs = await PersonalWellnessLog.find({
        user_id,
        survey_type: { $in: [...individualTypes, 'copsoq3_core', 'copsoq3_middle', 'copsoq3_long'] },
        submitted_at: { $gte: recentCutoff },
      }).select('survey_type submitted_at').lean();
      const completedTypes = new Set(completedLogs.map((l) => (l.survey_type && l.survey_type.startsWith('copsoq') ? 'copsoq3' : l.survey_type)));

      if (effectiveTier !== 'personal') {
        return res.json({
          success: true,
          account_type: 'individual',
          effective_tier: effectiveTier,
          active_cycles: [],
          locked_instruments: ['COPSOQ_III', 'PHQ-9', 'GAD-7', 'PSS-10', 'FAS-10'],
        });
      }

      const cycles = individualTypes.map((type) => ({
        survey_type: type,
        status: 'unlocked',
        ...(type === 'copsoq3' ? { copsoq_depth: 'core' } : {}),
        completed: completedTypes.has(type),
      }));
      return res.json({
        success: true,
        account_type: 'individual',
        effective_tier: effectiveTier,
        active_cycles: cycles,
      });
    }

    // Get active unlocked cycles for this employee's company/department
    const activeMap = await AssessmentCycle.getActiveForEmployee(company_id, department_id);

    // Check which surveys the user has already completed in recent cycles
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - 90); // Look back 90 days

    const completedLogs = await PersonalWellnessLog.find({
      user_id,
      survey_type: { $in: Object.keys(activeMap) },
      submitted_at: { $gte: recentCutoff },
    }).select('survey_type submitted_at').lean();

    const completedTypes = new Set(completedLogs.map(l => l.survey_type));

    const cycles = Object.entries(activeMap).map(([type, cycle]) => ({
      ...cycle,
      survey_type: type,
      completed: completedTypes.has(type),
    }));

    res.json({ success: true, active_cycles: cycles });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/wellness/daily-pulse
 * @desc    Submit daily 5-dimension pulse check-in (Mood, Calm, Stress, Energy, Work-Fit)
 * @access  Authenticated
 */
router.post('/daily-pulse', async (req, res, next) => {
  try {
    const { mood, calm, stress, energy, work_fit } = req.body;
    const userId = req.sessionData.user_id;
    const companyId = req.sessionData.company_id;

    // Normalize ratings (1-5 Likert scale mapped linearly to 0-100: (val - 1) * 25)
    const profileScores = {
      mood: normalizeDailyPulseRating(mood),
      calm: normalizeDailyPulseRating(calm),
      stress: normalizeDailyPulseRating(stress),
      energy: normalizeDailyPulseRating(energy),
      work_fit: normalizeDailyPulseRating(work_fit),
    };

    // 1. Update User baseline profile
    const user = await User.findOne({ user_id: userId });
    if (user) {
      if (!user.baseline_profile) user.baseline_profile = {};
      Object.assign(user.baseline_profile, profileScores, { last_updated: new Date() });
      await user.save();
    }

    const overallBalance = Math.round(
      (profileScores.mood + profileScores.calm + profileScores.stress + profileScores.energy + profileScores.work_fit) / 5
    );
    const pulseRiskComposite = Math.max(0, Math.min(100, 100 - overallBalance));
    const pulseClassification = classifyDailyPulse(overallBalance);

    // 2. Log to PersonalWellnessLog
    await PersonalWellnessLog.create({
      user_id: userId,
      company_id: companyId,
      department_id: req.sessionData.department_id || (user && user.department_id) || 'unassigned',
      survey_type: 'daily_pulse',
      composite_score: overallBalance,
      overallIndex: overallBalance,
      dimension_scores: profileScores,
    });

    // 3. Dual-write to AnonHazardLog for department aggregate tracking (N >= 5 protected) on company tenants only
    const TenantModel = require('../models/Tenant');
    let tenantForPulse = null;
    try {
      const tq = TenantModel.findOne({ company_id: companyId });
      tenantForPulse = (tq && typeof tq.select === 'function')
        ? await tq.select('account_type').lean()
        : (tq && typeof tq.lean === 'function' ? await tq.lean() : await tq);
    } catch (_) {}
    if (!tenantForPulse || tenantForPulse.account_type !== 'individual') {
      const AnonHazardLog = require('../models/AnonHazardLog');
      const submittedAt = coarsenTimestamp(new Date());

      const anonDoc = new AnonHazardLog({
        company_id: companyId,
        department_id: req.sessionData.department_id || 'GENERAL',
        department_snapshot_id: req.sessionData.department_id || 'GENERAL',
        survey_type: 'daily_pulse',
        risk_category: 'psychosocial',
        dimension_scores: {
          mood: profileScores.mood,
          calm: profileScores.calm,
          stress: profileScores.stress,
          energy: profileScores.energy,
          work_fit: profileScores.work_fit,
          overall_balance: overallBalance,
        },
        composite_score: pulseRiskComposite,
        likelihood: pulseClassification.likelihood,
        severity: pulseClassification.severity,
        severity_band: pulseClassification.severity_band,
        submitted_at: submittedAt,
        period_year: submittedAt.getUTCFullYear(),
        period_month: submittedAt.getUTCMonth() + 1,
        period_week: getIsoWeekNumber(submittedAt),
      });
      await anonDoc.save().catch(e => console.warn('[DailyPulse] AnonHazardLog write bypassed:', e.message));
    }

    res.json({
      success: true,
      message: 'Pulse Logged! 🌟',
      baseline_profile: profileScores,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/wellness/accept-consent
 * @desc    Accept double opt-in consent for the authenticated employee and activate session
 * @access  Authenticated (consent not required prior to acceptance)
 */
const jwt = require('jsonwebtoken');
const AuditLog = require('../models/AuditLog');
const Tenant = require('../models/Tenant');

router.post('/accept-consent', async (req, res, next) => {
  try {
    const userId = req.sessionData ? req.sessionData.user_id : null;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'AUTHENTICATION_REQUIRED' });
    }

    let user = null;
    try {
      user = await User.findOne({ user_id: userId });
    } catch (dbErr) {
      console.warn('[accept-consent] User lookup bypassed/offline:', dbErr.message);
    }

    // Support demo session if not persisted in MongoDB
    if (!user && (userId === 'usr-demo-employee' || String(userId).startsWith('usr-demo-'))) {
      user = {
        user_id: userId,
        company_id: req.sessionData.company_id || 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
        department_id: req.sessionData.department_id || 'dept-engineering',
        role: req.sessionData.role || 'employee',
        status: 'active'
      };
    } else if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User record not found.' });
    }

    if (user && user.save && user.status !== 'active') {
      try {
        if (user.company_id) {
          const tenant = await Tenant.findOne({ company_id: user.company_id });
          if (tenant && tenant.used_seats >= tenant.max_allowed_seats) {
            return res.status(400).json({
              success: false,
              error: 'SEAT_LIMIT_EXCEEDED',
              message: 'This organization has reached its maximum seat limit. Please contact your HR administrator.'
            });
          }
          if (tenant) {
            await Tenant.updateOne({ company_id: user.company_id }, { $inc: { used_seats: 1 } });
          }
        }

        user.status = 'active';
        user.consent_accepted_at = new Date();
        user.consent_token = undefined;
        user.consent_token_expires_at = undefined;
        await user.save();

        // Atomic Audit Log for GDPR compliance
        await AuditLog.append({
          company_id: user.company_id,
          actor_user_id: user.user_id,
          actor_role: user.role,
          event_type: 'consent_accepted',
          event_payload: { event: 'consent_accepted', user_id: user.user_id, role: user.role }
        });
      } catch (auditErr) {
        console.warn('[accept-consent] DB/Audit log warning:', auditErr.message);
      }
    }

    // Issue refreshed JWT token with status: 'active'
    const payload = {
      userId: user.user_id,
      companyId: user.company_id || req.sessionData.company_id,
      departmentId: user.department_id || req.sessionData.department_id,
      role: user.role || req.sessionData.role,
      status: 'active',
      isSystemSuperAdmin: req.sessionData.isSystemSuperAdmin || false
    };

    const jwtSecret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'wellframe-test-jwt-secret-2026');
    const token = jwt.sign(payload, jwtSecret, { expiresIn: '24h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    return res.json({
      success: true,
      token,
      message: 'Consent recorded successfully. You may now complete assessments.',
      user: {
        user_id: user.user_id,
        role: user.role,
        status: 'active'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.use(requireConsent);

router.post('/submit-checkin', async (req, res, next) => {
  try {
    const { survey_type, answers, scores, responses: structuredInput } = req.body;
    if (!survey_type) {
      return res.status(400).json({ error: 'survey_type is required' });
    }

    const userId = req.sessionData.user_id;
    const companyId = req.sessionData.company_id;

    // Fetch the user to update baseline
    const user = await User.findOne({ user_id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!user.baseline_profile) {
      user.baseline_profile = { mood: null, calm: null, stress: null, energy: null, work_fit: null, social: null, purpose: null };
    }

    let anonLogId = null;
    let crisisProtocol = null;
    let scoreSummary = null;

    const TenantModel = require('../models/Tenant');
    let callerTenant = null;
    if (companyId) {
      try {
        callerTenant = await TenantModel.findOne({ company_id: companyId });
      } catch (_) {}
    }
    const isIndividualTenant = Boolean(callerTenant && callerTenant.account_type === 'individual');

    if (survey_type !== 'checkin_slider') {
      if (isIndividualTenant) {
        const effectiveTier = typeof callerTenant.getEffectiveTier === 'function' ? callerTenant.getEffectiveTier() : 'free';
        if (effectiveTier !== 'personal') {
          return res.status(402).json({
            success: false,
            error: 'UPGRADE_REQUIRED',
            feature: String(survey_type).toLowerCase().startsWith('copsoq') ? 'copsoq' : 'clinical_scales',
            currentTier: effectiveTier,
            requiredTier: 'personal',
            upgradeUrl: '/app/dashboard.html?open=billing',
            message: 'Your 30-day trial has ended. Upgrade to Havilah Personal (GHS 150/month or GHS 1,500/year) to run COPSOQ-III and clinical screenings.',
          });
        }
      } else {
        const AssessmentCycle = require('../models/AssessmentCycle');
        const cycle = await AssessmentCycle.findOne({
          company_id: companyId,
          survey_type: survey_type.startsWith('copsoq3') ? 'copsoq3' : survey_type,
          status: 'unlocked',
          $or: [
            { department_id: null },
            { department_id: req.sessionData.department_id }
          ]
        }).sort({ created_at: -1 });
        if (!cycle) {
          return res.status(403).json({ success: false, error: 'ASSESSMENT_LOCKED', message: 'This assessment is not currently available. It must be unlocked by your HR administrator.' });
        }
        if (cycle.deadline && new Date() > new Date(cycle.deadline)) {
          return res.status(403).json({ success: false, error: 'ASSESSMENT_EXPIRED', message: 'The deadline for this assessment has passed.' });
        }
        // Increment completion count
        await AssessmentCycle.updateOne({ cycle_id: cycle.cycle_id }, { $inc: { completion_count: 1 } });
      }
    }

    if (survey_type === 'checkin_slider') {
      if (!scores) {
        return res.status(400).json({ error: 'scores object is required for checkin_slider' });
      }

      const mood = normalizeDailyPulseRating(scores.mood);
      const calm = normalizeDailyPulseRating(scores.calm);
      const stress = normalizeDailyPulseRating(scores.stress);
      const energy = normalizeDailyPulseRating(scores.energy);
      const work_fit = normalizeDailyPulseRating(scores.work_fit);

      user.baseline_profile.mood = mood;
      user.baseline_profile.calm = calm;
      user.baseline_profile.stress = stress;
      user.baseline_profile.energy = energy;
      user.baseline_profile.work_fit = work_fit;
      user.baseline_profile.last_updated = new Date();

      const overall_balance = Math.round((mood + calm + stress + energy + work_fit) / 5);
      const pulseClassification = classifyDailyPulse(overall_balance);
      const submittedAt = coarsenTimestamp(new Date());

      const AnonHazardLog = require('../models/AnonHazardLog');
      const anonDoc = new AnonHazardLog({
        company_id: companyId,
        department_id: req.sessionData.department_id,
        department_snapshot_id: req.sessionData.department_id,
        survey_type: 'daily_pulse',
        risk_category: 'psychosocial',
        dimension_scores: {
          mood, calm, stress, energy, work_fit, overall_balance
        },
        composite_score: Math.max(0, Math.min(100, 100 - overall_balance)),
        likelihood: pulseClassification.likelihood,
        severity: pulseClassification.severity,
        severity_band: pulseClassification.severity_band,
        submitted_at: submittedAt,
        period_year: submittedAt.getUTCFullYear(),
        period_month: submittedAt.getUTCMonth() + 1,
        period_week: getIsoWeekNumber(submittedAt),
      });
      await anonDoc.save();
      anonLogId = anonDoc.log_id;
    } else {
      const hasStructured = Array.isArray(structuredInput) && structuredInput.length > 0;
      if (!Array.isArray(answers) && !hasStructured) {
        return res.status(400).json({ error: 'answers array is required' });
      }

      const normSurvey = String(survey_type || '').toLowerCase();
      const versionList = VERSION_ITEM_LISTS[normSurvey] || VERSION_ITEM_LISTS.copsoq3_core;

      let hazardResponses = [];
      if (hasStructured) {
        hazardResponses = structuredInput
          .map((item, idx) => {
            if (!item || typeof item !== 'object') return null;
            const val = typeof item.value === 'number' && Number.isFinite(item.value) ? item.value : undefined;
            const sc = typeof item.score === 'number' && Number.isFinite(item.score) ? item.score : undefined;
            if ((sc !== undefined && sc < 0) || (sc === undefined && val !== undefined && val < 0)) return null;
            if (val === undefined && sc === undefined) return null;
            return {
              item_code: item.item_code || versionList[idx],
              question_index: typeof item.question_index === 'number' ? item.question_index : idx,
              value: val !== undefined ? val : sc,
              score: sc,
            };
          })
          .filter(Boolean);
      } else if (normSurvey.startsWith('copsoq')) {
        hazardResponses = (answers || [])
          .map((val, idx) => {
            const num = Number(val);
            if (!Number.isFinite(num) || num < 0) return null;
            return {
              item_code: versionList[idx],
              question_index: idx,
              value: num,
              score: num,
            };
          })
          .filter(Boolean);
      } else {
        hazardResponses = (answers || [])
          .map((val, idx) => {
            const num = Number(val);
            if (!Number.isFinite(num)) return null;
            return { question_index: idx, value: num };
          })
          .filter(Boolean);
      }

      if (hazardResponses.length > 0 && !isIndividualTenant) {
        const mockReq = {
          body: {
            survey_type,
            responses: hazardResponses,
          },
          sessionData: req.sessionData,
          anonymizedContext: { company_id: companyId, department_id: req.sessionData.department_id },
          ip: null,
        };

        const mockRes = {
          json: (data) => { if (data && data.success) anonLogId = data.log_id; },
          status: () => mockRes,
        };
        await hazardController.submitLog(mockReq, mockRes, next);
      }

      const computed = computeDimensions(survey_type, answers || [], hazardResponses);
      const tenantDoc = companyId ? await Tenant.findOne({ company_id: companyId }).select('hotline_config').lean() : null;
      crisisProtocol = evaluateCrisisRisk(survey_type, answers || hazardResponses, computed.rawScore, tenantDoc?.hotline_config || {});
      const effectiveSeverityLabel = (crisisProtocol.triggered && crisisProtocol.level === 'crisis')
        ? 'Crisis Attention Required'
        : computed.severityLabel;
      user.baseline_profile[computed.dimLabel] = computed.normalized;
      user.baseline_profile.last_updated = new Date();
      await user.save();

      await PersonalWellnessLog.create({
        user_id: userId,
        company_id: companyId,
        department_id: req.sessionData.department_id || user.department_id || 'unassigned',
        survey_type,
        composite_score: computed.normalized,
        overallIndex: computed.normalized,
        clinical_score: computed.rawScore,
        max_score: computed.maxScore,
        severity_label: effectiveSeverityLabel,
        dimension_scores: user.baseline_profile,
      });

      scoreSummary = {
        raw_score: computed.rawScore,
        max_score: computed.maxScore,
        wellbeing_index: computed.normalized,
        severity_label: effectiveSeverityLabel,
        severity_band: computed.severity_band,
        dimension_scores: computed.dimension_scores || null,
      };
    }

    res.json({
      success: true,
      baseline_profile: user.baseline_profile,
      anon_log_id: anonLogId,
      crisis_protocol: crisisProtocol,
      score_summary: scoreSummary,
    });

  } catch (err) {
    next(err);
  }
});

router.get('/dashboard-data', async (req, res, next) => {
  try {
    const userId = req.sessionData.user_id;

    const user = await User.findOne({ user_id: userId });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Fetch user wellness history sorted by submission time ascending
    const rawHistory = await PersonalWellnessLog.find({ user_id: userId })
      .sort({ submitted_at: 1 })
      .lean();

    // Deduplicate / aggregate history data points
    const dailyMap = new Map();
    rawHistory.forEach(log => {
      const dateObj = log.submitted_at ? new Date(log.submitted_at) : new Date();
      const dateKey = dateObj.toISOString().split('T')[0];
      const surveyType = log.survey_type || 'daily_pulse';
      const normCheck = (surveyType || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isDaily = !surveyType || normCheck === 'checkinslider' || normCheck === 'dailypulse' || normCheck === 'pulse';

      if (isDaily) {
        const dims = log.dimension_scores || {};
        const rawMood = dims.mood ?? dims.Mood;
        const rawCalm = dims.calm ?? dims.Calm;
        const rawStress = dims.stress ?? dims.Stress;
        const rawEnergy = dims.energy ?? dims.Energy;
        const rawWorkFit = dims.work_fit ?? dims.workFit ?? dims.WorkFit;

        const validScores = [rawMood, rawCalm, rawStress, rawEnergy, rawWorkFit].filter(v => typeof v === 'number' && Number.isFinite(v));
        const composite = validScores.length > 0
          ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
          : (log.composite_score ?? log.overallIndex ?? 50);

        const resolveDim = (val) => (typeof val === 'number' && Number.isFinite(val) ? val : composite);
        const mood = resolveDim(rawMood);
        const calm = resolveDim(rawCalm);
        const stress = resolveDim(rawStress);
        const energy = resolveDim(rawEnergy);
        const workFit = resolveDim(rawWorkFit);

        dailyMap.set(dateKey, {
          date: dateKey,
          timestamp: dateObj,
          survey_type: surveyType,
          score: composite,
          overallIndex: composite,
          source: surveyType,
          dimensions: {
            mood,
            calm,
            stress,
            energy,
            workFit,
            work_fit: workFit
          }
        });
      } else {
        // Formal Clinical Assessment (PHQ-9, GAD-7, PSS-10, FAS-10, COPSOQ III)
        const overallIndex = log.composite_score ?? log.overallIndex ?? log.score ?? 0;
        let clinicalScore = log.clinical_score ?? log.raw_score;
        let maxScore = log.max_score;
        let severityLabel = log.severity_label;

        const normType = (surveyType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (normType.includes('PHQ9')) {
          maxScore = maxScore || 27;
          if (clinicalScore === undefined || clinicalScore === null) clinicalScore = reconstructRawFromIndex('phq9', overallIndex);
          severityLabel = severityLabel || (clinicalScore >= 20 ? 'Severe Depression' : clinicalScore >= 15 ? 'Moderately Severe Depression' : clinicalScore >= 10 ? 'Moderate Depression' : clinicalScore >= 5 ? 'Mild Depression' : 'Minimal');
        } else if (normType.includes('GAD7')) {
          maxScore = maxScore || 21;
          if (clinicalScore === undefined || clinicalScore === null) clinicalScore = reconstructRawFromIndex('gad7', overallIndex);
          severityLabel = severityLabel || (clinicalScore >= 15 ? 'Severe Anxiety' : clinicalScore >= 10 ? 'Moderate Anxiety' : clinicalScore >= 5 ? 'Mild Anxiety' : 'Minimal');
        } else if (normType.includes('PSS10')) {
          maxScore = maxScore || 40;
          if (clinicalScore === undefined || clinicalScore === null) clinicalScore = reconstructRawFromIndex('pss10', overallIndex);
          severityLabel = severityLabel || (clinicalScore >= 27 ? 'High Perceived Stress' : clinicalScore >= 14 ? 'Moderate Stress' : 'Low Stress');
        } else if (normType.includes('FAS10')) {
          maxScore = maxScore || 50;
          if (clinicalScore === undefined || clinicalScore === null) clinicalScore = reconstructRawFromIndex('fas10', overallIndex);
          severityLabel = severityLabel || (clinicalScore >= 35 ? 'Severe Fatigue' : clinicalScore >= 22 ? 'Mild-Moderate Fatigue' : 'Not Fatigued');
        } else if (normType.includes('COPSOQ')) {
          maxScore = maxScore || 100;
          if (clinicalScore === undefined || clinicalScore === null) clinicalScore = overallIndex;
          severityLabel = severityLabel || (overallIndex >= 75 ? 'Optimal Psychosocial Fit' : overallIndex >= 50 ? 'Moderate Psychosocial Risk' : 'Elevated Psychosocial Risk');
        } else {
          maxScore = maxScore || 100;
          if (clinicalScore === undefined || clinicalScore === null) clinicalScore = overallIndex;
          severityLabel = severityLabel || (overallIndex >= 75 ? 'Optimal' : overallIndex >= 50 ? 'Moderate Risk Tier' : 'High Risk Tier');
        }

        dailyMap.set(dateKey + '_' + surveyType, {
          date: dateKey,
          timestamp: dateObj,
          survey_type: surveyType,
          score: overallIndex,
          overallIndex: overallIndex,
          source: surveyType,
          dimensions: null,
          is_clinical: true,
          clinical_score: clinicalScore,
          max_score: maxScore,
          severity_label: severityLabel
        });
      }
    });

    const history = Array.from(dailyMap.values()).slice(-30);

    res.json({
      success: true,
      baseline_profile: user.baseline_profile || {
        mood: null, calm: null, stress: null, energy: null, work_fit: null, social: null, purpose: null
      },
      history
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/wellness/export
 * GDPR Art. 20 - Right to data portability.
 * Exports all personal wellbeing check-ins as downloadable JSON.
 */
router.get('/export', validateSession, requireConsent, requireFeature('pdf_export'), async (req, res, next) => {
  try {
    const { user_id } = req.sessionData;
    const logs = await PersonalWellnessLog.find({ user_id })
      .sort({ submitted_at: -1 })
      .lean();

    res.setHeader('Content-Disposition', 'attachment; filename="my-wellbeing-data.json"');
    res.setHeader('Content-Type', 'application/json');

    return res.json({
      success: true,
      exported_at: new Date().toISOString(),
      user_id,
      record_count: logs.length,
      records: logs,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
