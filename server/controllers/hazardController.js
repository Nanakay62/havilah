'use strict';

const express = require('express');
const Department = require('../models/Department');
const DepartmentSnapshot = require('../models/DepartmentSnapshot');
const AnonHazardLog = require('../models/AnonHazardLog');
const { validateSession, requireConsent, requireRole } = require('../middleware/auth');
const { stripIdentity } = require('../middleware/anonymizer');
const { enforceTenantScope } = require('../middleware/tenantIsolation');
const { buildNSizeAggregation } = require('../aggregations/nSizePrivacy');
const { coarsenTimestamp } = require('../utils/crypto');
const { scoreCOPSOQ3 } = require('../utils/copsoq3Scoring');
const { generateInsights } = require('../services/correlationEngine');

const router = express.Router();

/**
 * @fileoverview Hazard log controller — anonymous survey submission and
 * privacy-safe analytics for ISO 45003 psychosocial risk assessments.
 *
 * All submissions pass through the anonymizer middleware to ensure ZERO
 * linkage between the assessment data and the individual user.
 */

/* ─────────────────────────────────────────────
 *  Survey scoring constants
 * ───────────────────────────────────────────── */

/**
 * Default risk category mapping per survey type.
 * @type {Record<string, string>}
 */
const DEFAULT_RISK_CATEGORY = {
  phq9: 'psychosocial',
  gad7: 'psychosocial',
  pss10: 'psychosocial',
  fas10: 'workload',
  copsoq3_core: 'organizational',
  copsoq3_middle: 'organizational',
  copsoq3_long: 'organizational',
};

/**
 * PSS-10 reverse-scored item indices (0-indexed).
 * Items 3, 4, 6, 7 use reverse scoring (0→4, 1→3, 2→2, 3→1, 4→0).
 * @type {Set<number>}
 */
const PSS10_REVERSE_ITEMS = new Set([3, 4, 6, 7]);

/**
 * FAS-10 reverse-scored item indices (0-indexed).
 * Items 3 and 9 use reverse scoring on a 1–5 scale (1→5, 2→4, 3→3, 4→2, 5→1).
 * @type {Set<number>}
 */
const FAS10_REVERSE_ITEMS = new Set([3, 9]);

/* ─────────────────────────────────────────────
 *  Scoring functions
 * ───────────────────────────────────────────── */

/**
 * Scores a PHQ-9 assessment.
 * Range: 0–27. Bands: 0–4 healthy, 5–9 mild, 10–14 moderate, 15+ severe.
 *
 * @param {Array<{question_index: number, value: number}>} responses
 * @returns {{ raw_score: number, severity_band: string, composite_score: number, likelihood: number, severity: number, dimension_scores: Map<string, number> }}
 */
function scorePHQ9(responses) {
  const raw = responses.reduce((sum, r) => sum + r.value, 0);
  const maxScore = 27;
  const composite = Math.round((raw / maxScore) * 100 * 100) / 100;

  let severity_band;
  let severity;
  let likelihood;

  if (raw <= 4) {
    severity_band = 'healthy';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 9) {
    severity_band = 'mild';
    severity = 2;
    likelihood = 2;
  } else if (raw <= 14) {
    severity_band = 'moderate';
    severity = 3;
    likelihood = 3;
  } else {
    severity_band = 'severe';
    severity = raw <= 19 ? 4 : 5;
    likelihood = raw <= 19 ? 4 : 5;
  }

  const dimension_scores = new Map([['depression', composite]]);

  return { raw_score: raw, severity_band, composite_score: composite, likelihood, severity, dimension_scores };
}

/**
 * Scores a GAD-7 assessment.
 * Range: 0–21. Bands: 0–4 healthy, 5–9 mild, 10–14 moderate, 15+ severe.
 *
 * @param {Array<{question_index: number, value: number}>} responses
 * @returns {{ raw_score: number, severity_band: string, composite_score: number, likelihood: number, severity: number, dimension_scores: Map<string, number> }}
 */
function scoreGAD7(responses) {
  const raw = responses.reduce((sum, r) => sum + r.value, 0);
  const maxScore = 21;
  const composite = Math.round((raw / maxScore) * 100 * 100) / 100;

  let severity_band;
  let severity;
  let likelihood;

  if (raw <= 4) {
    severity_band = 'healthy';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 9) {
    severity_band = 'mild';
    severity = 2;
    likelihood = 2;
  } else if (raw <= 14) {
    severity_band = 'moderate';
    severity = 3;
    likelihood = 3;
  } else {
    severity_band = 'severe';
    severity = raw <= 18 ? 4 : 5;
    likelihood = raw <= 18 ? 4 : 5;
  }

  const dimension_scores = new Map([['anxiety', composite]]);

  return { raw_score: raw, severity_band, composite_score: composite, likelihood, severity, dimension_scores };
}

/**
 * Scores a PSS-10 (Perceived Stress Scale) assessment.
 * Range: 0–40. Reverse-score items 3, 4, 6, 7 (0-indexed).
 * Bands: 0–13 healthy, 14–26 mild, 27+ severe.
 *
 * @param {Array<{question_index: number, value: number}>} responses
 * @returns {{ raw_score: number, severity_band: string, composite_score: number, likelihood: number, severity: number, dimension_scores: Map<string, number> }}
 */
function scorePSS10(responses) {
  let raw = 0;
  for (const r of responses) {
    if (PSS10_REVERSE_ITEMS.has(r.question_index)) {
      raw += (4 - r.value); // Reverse: 0→4, 1→3, 2→2, 3→1, 4→0
    } else {
      raw += r.value;
    }
  }

  const maxScore = 40;
  const composite = Math.round((raw / maxScore) * 100 * 100) / 100;

  let severity_band;
  let severity;
  let likelihood;

  if (raw <= 13) {
    severity_band = 'healthy';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 26) {
    severity_band = 'mild';
    severity = 2;
    likelihood = 2 + Math.floor((raw - 14) / 7); // 2 or 3
  } else {
    severity_band = 'severe';
    severity = 4 + (raw >= 34 ? 1 : 0); // 4 or 5
    likelihood = 4 + (raw >= 34 ? 1 : 0);
  }

  const dimension_scores = new Map([['perceived_stress', composite]]);

  return { raw_score: raw, severity_band, composite_score: composite, likelihood, severity, dimension_scores };
}

/**
 * Scores a FAS-10 (Fatigue Assessment Scale) assessment.
 * Range: 10–50 (each item 1–5). Reverse-score items 3, 9 (0-indexed).
 * Bands: 10–21 healthy, 22–34 mild, 35+ severe.
 *
 * @param {Array<{question_index: number, value: number}>} responses
 * @returns {{ raw_score: number, severity_band: string, composite_score: number, likelihood: number, severity: number, dimension_scores: Map<string, number> }}
 */
function scoreFAS10(responses) {
  let raw = 0;
  for (const r of responses) {
    if (FAS10_REVERSE_ITEMS.has(r.question_index)) {
      raw += (6 - r.value); // Reverse on 1–5 scale: 1→5, 2→4, 3→3, 4→2, 5→1
    } else {
      raw += r.value;
    }
  }

  const maxScore = 50;
  const minScore = 10;
  const composite = Math.round(((raw - minScore) / (maxScore - minScore)) * 100 * 100) / 100;

  let severity_band;
  let severity;
  let likelihood;

  if (raw <= 21) {
    severity_band = 'healthy';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 34) {
    severity_band = 'mild';
    severity = 2;
    likelihood = 2 + Math.floor((raw - 22) / 7); // 2 or 3
  } else {
    severity_band = 'severe';
    severity = 4 + (raw >= 43 ? 1 : 0);
    likelihood = 4 + (raw >= 43 ? 1 : 0);
  }

  const dimension_scores = new Map([['fatigue', composite]]);

  return { raw_score: raw, severity_band, composite_score: composite, likelihood, severity, dimension_scores };
}

/**
 * Main switch for scoring assessments
 * @param {string} surveyType
 * @param {Array<{question_index?: number, item_code?: string, value: number}>} responses
 */
function scoreAssessment(surveyType, responses) {
  switch (surveyType) {
    case 'phq9':  return scorePHQ9(responses);
    case 'gad7':  return scoreGAD7(responses);
    case 'pss10': return scorePSS10(responses);
    case 'fas10': return scoreFAS10(responses);
    case 'copsoq3_core':
    case 'copsoq3_middle':
    case 'copsoq3_long': return scoreCOPSOQ3(responses);
    default:
      throw new Error(`Unsupported survey type: ${surveyType}`);
  }
}

/* ─────────────────────────────────────────────
 *  POST /submit
 * ───────────────────────────────────────────── */

router.post(
  '/submit',
  validateSession,
  requireConsent,
  stripIdentity,
  (req, res, next) => submitLog(req, res, next)
);

/**
 * @route   POST /api/v1/hazard-logs/submit
 * @desc    Submit an anonymous psychosocial risk assessment
 * @access  Authenticated + Consented (identity stripped by anonymizer)
 */
const submitLog = async (req, res, next) => {
    try {
      const { survey_type, responses, risk_category, qualitative_text } = req.body;

      // ── Validation ───────────────────────────────────────────────────
      if (!survey_type) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'survey_type is required',
        });
      }

      const validSurveyTypes = ['phq9', 'gad7', 'pss10', 'fas10', 'copsoq3_core', 'copsoq3_middle', 'copsoq3_long'];
      if (!validSurveyTypes.includes(survey_type)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `survey_type must be one of: ${validSurveyTypes.join(', ')}`,
        });
      }

      if (!Array.isArray(responses) || responses.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'responses must be a non-empty array of {question_index|item_code, value} objects',
        });
      }

      // Validate each response entry
      for (let i = 0; i < responses.length; i++) {
        const r = responses[i];
        const hasIdentifier = (typeof r.question_index === 'number') || (typeof r.item_code === 'string');
        if (!hasIdentifier || typeof r.value !== 'number') {
          return res.status(400).json({
            success: false,
            error: 'VALIDATION_ERROR',
            message: `responses[${i}] must have numeric value and either question_index (number) or item_code (string)`,
          });
        }
      }

      // ── Extract from anonymized context (NOT from body) ────────────
      const { company_id, department_id } = req.anonymizedContext;

      // ── Fetch department and create snapshot ────────────────────────
      const department = await Department.findOne({
        company_id,
        department_id,
        is_active: true,
      }).lean();

      if (!department) {
        return res.status(404).json({
          success: false,
          error: 'DEPARTMENT_NOT_FOUND',
          message: 'The department associated with this submission could not be found',
        });
      }

      const snapshot = await DepartmentSnapshot.capture(department);

      // ── Score the assessment ───────────────────────────────────────
      const scoring = scoreAssessment(survey_type, responses);

      // ── Coarsen timestamp ──────────────────────────────────────────
      const submittedAt = coarsenTimestamp(new Date());

      // ── Derive period fields ───────────────────────────────────────
      const periodYear = submittedAt.getUTCFullYear();
      const periodMonth = submittedAt.getUTCMonth() + 1;

      // ISO week number
      const d = new Date(Date.UTC(submittedAt.getUTCFullYear(), submittedAt.getUTCMonth(), submittedAt.getUTCDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const periodWeek = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);

      // ── Resolve risk category ──────────────────────────────────────
      const resolvedRiskCategory = risk_category || DEFAULT_RISK_CATEGORY[survey_type] || 'psychosocial';

      // ── Convert dimension_scores Map to plain object for Mongoose ──
      const dimensionScoresObj = {};
      if (scoring.dimension_scores instanceof Map) {
        for (const [key, value] of scoring.dimension_scores) {
          dimensionScoresObj[key] = value;
        }
      }

      // ── Create the anonymous hazard log ────────────────────────────
      const log = await AnonHazardLog.create({
        company_id,
        department_id,
        department_snapshot_id: snapshot.snapshot_id,
        survey_type,
        risk_category: resolvedRiskCategory,
        dimension_scores: dimensionScoresObj,
        composite_score: scoring.composite_score,
        likelihood: scoring.likelihood,
        severity: scoring.severity,
        severity_band: scoring.severity_band,
        submitted_at: submittedAt,
        period_year: periodYear,
        period_month: periodMonth,
        period_week: periodWeek,
      });

      return res.status(201).json({
        success: true,
        log_id: log.log_id,
      });
    } catch (err) {
      next(err);
    }
  };

/* ─────────────────────────────────────────────
 *  GET /analytics
 * ───────────────────────────────────────────── */

/**
 * @route   GET /api/v1/hazard-logs/analytics
 * @desc    Retrieve privacy-safe aggregated analytics for hazard logs
 * @access  Authenticated + Consented + HR Admin or Tenant Admin
 */
router.get(
  '/analytics',
  validateSession,
  requireConsent,
  requireRole('hr_admin', 'tenant_admin'),
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const { department_id, survey_type, period_start, period_end } = req.query;

      const results = await buildNSizeAggregation(req.tenantScope.company_id, {
        departmentId: department_id || undefined,
        surveyType: survey_type || undefined,
        periodStart: period_start || undefined,
        periodEnd: period_end || undefined,
      });

      return res.status(200).json({
        success: true,
        data: results,
        privacy_notice:
          'Analytics are subject to n-size anonymity rules. Departments with fewer than ' +
          'the minimum required responses have their data rolled up to ensure individual ' +
          'responses cannot be identified. All timestamps are coarsened to hour-level precision.',
      });
    } catch (err) {
      next(err);
    }
  }
);

/* -----------------------------------------------------------------------------
 *  GET /insights
 * ----------------------------------------------------------------------------- */

/**
 * @route   GET /api/v1/hazard-logs/insights
 * @desc    Retrieve multi-tenant correlation engine insights linking clinical indices to COPSOQ III drivers
 * @access  Authenticated + Consented + HR Admin or Tenant Admin
 */
router.get(
  '/insights',
  validateSession,
  requireConsent,
  requireRole('hr_admin', 'tenant_admin'),
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const { department_id, period_start, period_end } = req.query;

      // We need to fetch aggregate metrics for all surveys for this department to run the correlation engine
      const surveysToFetch = ['phq9', 'gad7', 'pss10', 'fas10', 'copsoq3_core', 'copsoq3_middle', 'copsoq3_long'];
      const aggregateMetrics = {};

      for (const stype of surveysToFetch) {
        const results = await buildNSizeAggregation(req.tenantScope.company_id, {
          departmentId: department_id || undefined,
          surveyType: stype,
          periodStart: period_start || undefined,
          periodEnd: period_end || undefined,
        });

        // If data meets n-size threshold and is available, store it
        // We assume we are correlating across the department-level view (the first result typically corresponds to the target dept)
        const targetResult = department_id ? results.find(r => r.department_id === department_id) : results.find(r => r.department_id === '__company_wide__');
        
        if (targetResult && targetResult.meets_n_size && targetResult.metrics) {
          aggregateMetrics[stype] = {
            count: targetResult.response_count,
            avg_composite_score: targetResult.metrics.avg_composite_score,
            avg_dimension_scores: targetResult.metrics.avg_dimension_scores || {}
          };
        }
      }

      const insights = generateInsights(aggregateMetrics);

      return res.status(200).json({
        success: true,
        data: insights,
        privacy_notice: 'Insights are generated exclusively from n-size compliant aggregated data (N>=5) protecting individual privacy.'
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
module.exports.submitLog = submitLog;
