'use strict';

const AnonHazardLog = require('../models/AnonHazardLog');
const Department = require('../models/Department');

/**
 * @fileoverview N-Size privacy aggregation pipeline builder.
 *
 * Implements the core privacy guarantee of the Wellframe platform:
 * departments with fewer than `nSizeThreshold` survey responses have their
 * metrics SUPPRESSED and automatically rolled up to the parent department
 * or company-wide level.
 *
 * This prevents statistical re-identification of individuals in small teams.
 */

/** @type {number} Default minimum number of responses required to expose metrics */
const DEFAULT_N_SIZE_THRESHOLD = 5;

/**
 * Builds and executes an N-size-safe aggregation pipeline on AnonHazardLog.
 *
 * @param {string} companyId — Tenant company_id (mandatory for isolation).
 * @param {object} [options={}]
 * @param {string} [options.departmentId]    — Optional department filter.
 * @param {string} [options.surveyType]      — Optional survey type filter.
 * @param {string} [options.periodStart]     — ISO 8601 start date for submitted_at range.
 * @param {string} [options.periodEnd]       — ISO 8601 end date for submitted_at range.
 * @param {number} [options.nSizeThreshold=5] — Minimum response count before metrics are exposed.
 * @returns {Promise<Array<{
 *   department_id: string,
 *   department_name: string,
 *   response_count: number,
 *   meets_n_size: boolean,
 *   metrics: object|null,
 *   rolled_up: boolean,
 *   rolled_up_from: string[],
 *   roll_up_level: string|null,
 *   privacy_notice: string
 * }>>}
 */
async function buildNSizeAggregation(companyId, options = {}) {
  const {
    departmentId,
    surveyType,
    periodStart,
    periodEnd,
    nSizeThreshold = DEFAULT_N_SIZE_THRESHOLD,
  } = options;

  // ── Stage 1: $match — tenant isolation + optional filters ──────────
  /** @type {object} */
  const matchStage = { company_id: companyId };

  if (departmentId) {
    matchStage.department_id = departmentId;
  }
  if (surveyType) {
    matchStage.survey_type = surveyType;
  }
  if (periodStart || periodEnd) {
    matchStage.submitted_at = {};
    if (periodStart) {
      matchStage.submitted_at.$gte = new Date(periodStart);
    }
    if (periodEnd) {
      matchStage.submitted_at.$lte = new Date(periodEnd);
    }
  }

  // ── Stage 2–5: Core aggregation pipeline ───────────────────────────
  const pipeline = [
    { $match: matchStage },

    // Stage 2: Group by department_id
    {
      $group: {
        _id: '$department_id',
        count: { $sum: 1 },
        avg_composite: { $avg: '$composite_score' },
        avg_likelihood: { $avg: '$likelihood' },
        avg_severity: { $avg: '$severity' },
        severity_bands: { $push: '$severity_band' },
        dimension_scores_list: { $push: '$dimension_scores' },
      },
    },

    // Stage 3: Lookup department info
    {
      $lookup: {
        from: 'departments',
        let: { dept_id: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$department_id', '$$dept_id'] },
            },
          },
          { $limit: 1 },
          {
            $project: {
              department_id: 1,
              name: 1,
              parent_department_id: 1,
              path: 1,
            },
          },
        ],
        as: 'department_info',
      },
    },

    // Unwind the single-element department_info array
    {
      $unwind: {
        path: '$department_info',
        preserveNullAndEmptyArrays: true,
      },
    },

    // Stage 4: Add n-size compliance flag
    {
      $addFields: {
        meets_n_size: { $gte: ['$count', nSizeThreshold] },
        department_id: '$_id',
        department_name: { $ifNull: ['$department_info.name', 'Unknown'] },
        parent_department_id: '$department_info.parent_department_id',
      },
    },
  ];

  const rawResults = await AnonHazardLog.aggregate(pipeline);

  // ── Post-processing: roll-up and metric computation ────────────────
  const meetingThreshold = [];
  const belowThreshold = [];

  for (const result of rawResults) {
    if (result.meets_n_size) {
      meetingThreshold.push(result);
    } else {
      belowThreshold.push(result);
    }
  }

  /** @type {Array} */
  const finalResults = [];

  // Process departments meeting the threshold — expose full metrics
  for (const dept of meetingThreshold) {
    finalResults.push({
      department_id: dept.department_id,
      department_name: dept.department_name,
      response_count: dept.count,
      meets_n_size: true,
      metrics: computeMetrics(dept),
      rolled_up: false,
      rolled_up_from: [],
      roll_up_level: null,
      privacy_notice: 'Data meets minimum sample size requirement.',
    });
  }

  // Process departments BELOW threshold — attempt parent roll-up
  if (belowThreshold.length > 0) {
    // Group below-threshold departments by parent_department_id
    /** @type {Map<string, Array>} */
    const parentGroups = new Map();

    for (const dept of belowThreshold) {
      const parentId = dept.parent_department_id || '__company_root__';
      if (!parentGroups.has(parentId)) {
        parentGroups.set(parentId, []);
      }
      parentGroups.get(parentId).push(dept);
    }

    for (const [parentId, children] of parentGroups) {
      if (parentId === '__company_root__') {
        // No parent to roll up to — go company-wide
        const companyRollup = await rollUpToCompany(companyId, matchStage, nSizeThreshold, children);
        finalResults.push(companyRollup);
        continue;
      }

      // Re-aggregate at the parent level: include all children of the parent
      const parentMatchStage = { ...matchStage };
      delete parentMatchStage.department_id;

      // Find all sibling department_ids under this parent
      const siblings = await Department.find({
        company_id: companyId,
        parent_department_id: parentId,
        is_active: true,
      }).select('department_id').lean();

      const siblingIds = siblings.map((s) => s.department_id);

      const parentPipeline = [
        {
          $match: {
            ...parentMatchStage,
            department_id: { $in: siblingIds },
          },
        },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avg_composite: { $avg: '$composite_score' },
            avg_likelihood: { $avg: '$likelihood' },
            avg_severity: { $avg: '$severity' },
            severity_bands: { $push: '$severity_band' },
            dimension_scores_list: { $push: '$dimension_scores' },
          },
        },
      ];

      const parentAgg = await AnonHazardLog.aggregate(parentPipeline);

      if (parentAgg.length > 0 && parentAgg[0].count >= nSizeThreshold) {
        // Parent-level roll-up meets threshold
        const parentDept = await Department.findOne({
          company_id: companyId,
          department_id: parentId,
        }).select('name department_id').lean();

        const childDeptIds = children.map((c) => c.department_id);

        finalResults.push({
          department_id: parentId,
          department_name: parentDept ? parentDept.name : 'Parent Group',
          response_count: parentAgg[0].count,
          meets_n_size: true,
          metrics: computeMetrics(parentAgg[0]),
          rolled_up: true,
          rolled_up_from: childDeptIds,
          roll_up_level: 'parent',
          privacy_notice: `Data rolled up to parent department to meet minimum sample size of ${nSizeThreshold}.`,
        });
      } else {
        // Parent-level still insufficient — roll up to company-wide
        const childDeptIds = children.map((c) => c.department_id);
        const companyRollup = await rollUpToCompany(companyId, matchStage, nSizeThreshold, children);
        companyRollup.rolled_up_from = childDeptIds;
        finalResults.push(companyRollup);
      }
    }
  }

  return finalResults;
}

/**
 * Rolls up metrics to the company-wide level when both department and parent
 * levels fail the n-size threshold.
 *
 * @param {string} companyId
 * @param {object} baseMatch — Original match criteria (excluding department_id).
 * @param {number} nSizeThreshold
 * @param {Array}  failedDepts — Departments that failed the threshold.
 * @returns {Promise<object>}
 */
async function rollUpToCompany(companyId, baseMatch, nSizeThreshold, failedDepts) {
  const companyMatch = { ...baseMatch };
  delete companyMatch.department_id;
  companyMatch.company_id = companyId;

  const companyPipeline = [
    { $match: companyMatch },
    {
      $group: {
        _id: null,
        count: { $sum: 1 },
        avg_composite: { $avg: '$composite_score' },
        avg_likelihood: { $avg: '$likelihood' },
        avg_severity: { $avg: '$severity' },
        severity_bands: { $push: '$severity_band' },
        dimension_scores_list: { $push: '$dimension_scores' },
      },
    },
  ];

  const companyAgg = await AnonHazardLog.aggregate(companyPipeline);
  const failedDeptIds = failedDepts.map((d) => d.department_id);

  if (companyAgg.length > 0 && companyAgg[0].count >= nSizeThreshold) {
    return {
      department_id: '__company_wide__',
      department_name: 'Company-Wide Aggregate',
      response_count: companyAgg[0].count,
      meets_n_size: true,
      metrics: computeMetrics(companyAgg[0]),
      rolled_up: true,
      rolled_up_from: failedDeptIds,
      roll_up_level: 'company',
      privacy_notice: `Data rolled up to company-wide level to meet minimum sample size of ${nSizeThreshold}.`,
    };
  }

  // Even company-wide doesn't meet threshold — suppress entirely
  return {
    department_id: '__company_wide__',
    department_name: 'Company-Wide Aggregate',
    response_count: companyAgg.length > 0 ? companyAgg[0].count : 0,
    meets_n_size: false,
    metrics: null,
    rolled_up: true,
    rolled_up_from: failedDeptIds,
    roll_up_level: 'company',
    privacy_notice: `Insufficient responses (< ${nSizeThreshold}) even at company-wide level. Metrics are suppressed to protect anonymity.`,
  };
}

/**
 * Computes the detailed metrics object from a raw aggregation group result.
 *
 * @param {object} group — A single group from the aggregation pipeline.
 * @param {number} group.count
 * @param {number} group.avg_composite
 * @param {number} group.avg_likelihood
 * @param {number} group.avg_severity
 * @param {string[]} group.severity_bands
 * @param {Array<Map|object>} group.dimension_scores_list
 * @returns {object}
 */
function computeMetrics(group) {
  // ── Severity distribution as percentages ───────────────────────────
  const severityCounts = { healthy: 0, mild: 0, moderate: 0, severe: 0 };
  if (group.severity_bands && Array.isArray(group.severity_bands)) {
    for (const band of group.severity_bands) {
      if (band in severityCounts) {
        severityCounts[band] += 1;
      }
    }
  }

  const total = group.count || 1;
  const severityDistribution = {};
  for (const [band, count] of Object.entries(severityCounts)) {
    severityDistribution[band] = Math.round((count / total) * 10000) / 100; // 2 decimal places
  }

  // ── Average dimension scores (merge all Maps/objects) ──────────────
  const dimensionSums = {};
  const dimensionCounts = {};

  if (group.dimension_scores_list && Array.isArray(group.dimension_scores_list)) {
    for (const scores of group.dimension_scores_list) {
      if (!scores) continue;

      // Handle both Map instances and plain objects (from aggregation)
      const entries = scores instanceof Map
        ? scores.entries()
        : Object.entries(scores);

      for (const [key, value] of entries) {
        // Skip internal Mongoose Map keys
        if (key === '_id' || key === '$init') continue;
        const numVal = Number(value);
        if (!Number.isFinite(numVal)) continue;

        dimensionSums[key] = (dimensionSums[key] || 0) + numVal;
        dimensionCounts[key] = (dimensionCounts[key] || 0) + 1;
      }
    }
  }

  const avgDimensionScores = {};
  for (const [key, sum] of Object.entries(dimensionSums)) {
    avgDimensionScores[key] = Math.round((sum / dimensionCounts[key]) * 100) / 100;
  }

  return {
    avg_composite_score: Math.round((group.avg_composite || 0) * 100) / 100,
    avg_likelihood: Math.round((group.avg_likelihood || 0) * 100) / 100,
    avg_severity: Math.round((group.avg_severity || 0) * 100) / 100,
    severity_distribution: severityDistribution,
    avg_dimension_scores: avgDimensionScores,
  };
}

/**
 * Verifies that n-size privacy compliance is maintained across a set of results.
 * Ensures no entry with fewer than `threshold` responses has exposed metrics.
 *
 * @param {Array} results — Output from buildNSizeAggregation.
 * @param {number} [threshold=DEFAULT_N_SIZE_THRESHOLD]
 * @returns {{ compliant: boolean, violations: Array<{ department_id: string, response_count: number, reason: string }> }}
 */
function verifyNSizeCompliance(results, threshold = DEFAULT_N_SIZE_THRESHOLD) {
  /** @type {Array<{ department_id: string, response_count: number, reason: string }>} */
  const violations = [];

  for (const entry of results) {
    if (entry.response_count < threshold && entry.metrics !== null) {
      violations.push({
        department_id: entry.department_id,
        response_count: entry.response_count,
        reason: `Department has ${entry.response_count} responses (below threshold of ${threshold}) but metrics are exposed`,
      });
    }

    if (!entry.meets_n_size && entry.metrics !== null) {
      violations.push({
        department_id: entry.department_id,
        response_count: entry.response_count,
        reason: 'meets_n_size is false but metrics object is not null',
      });
    }
  }

  return {
    compliant: violations.length === 0,
    violations,
  };
}

module.exports = {
  buildNSizeAggregation,
  verifyNSizeCompliance,
  DEFAULT_N_SIZE_THRESHOLD,
};
