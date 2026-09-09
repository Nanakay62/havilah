'use strict';

/**
 * @fileoverview ISO 45003 Psychosocial Correlation & Analytics Engine.
 * 
 * Computes Pearson correlation coefficients (r) between clinical outcome measures 
 * (PHQ-9, GAD-7, PSS-10, FAS-10) and environmental COPSOQ III hazard dimensions.
 */

/**
 * Computes Pearson correlation coefficient (r) between two continuous variables.
 * Enforces a strict minimum of N >= 5 paired observations.
 * 
 * @param {number[]} xArr - Independent variable (e.g. Workload, Autonomy score)
 * @param {number[]} yArr - Dependent variable (e.g. PHQ-9 depression, PSS-10 stress)
 * @returns {{ r: number, sampleSize: number, strength: string, direction: string, confidence: string }|null}
 */
function pearsonCorrelation(xArr, yArr) {
  if (!Array.isArray(xArr) || !Array.isArray(yArr) || xArr.length !== yArr.length) {
    return null;
  }
  const n = xArr.length;
  if (n < 5) {
    return null; // Enforce N >= 5 anonymity and minimum statistical validity
  }

  const meanX = xArr.reduce((a, b) => a + b, 0) / n;
  const meanY = yArr.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let i = 0; i < n; i++) {
    const diffX = xArr[i] - meanX;
    const diffY = yArr[i] - meanY;
    num += diffX * diffY;
    denX += diffX * diffX;
    denY += diffY * diffY;
  }

  const denom = Math.sqrt(denX * denY);
  if (denom === 0) {
    return { r: 0, sampleSize: n, strength: 'None', direction: 'Neutral', confidence: 'Low' };
  }

  const r = parseFloat((num / denom).toFixed(3));
  const absR = Math.abs(r);
  const strength = absR >= 0.7 ? 'Strong' : absR >= 0.4 ? 'Moderate' : absR >= 0.2 ? 'Weak' : 'Negligible';
  const direction = r > 0.05 ? 'Positive' : r < -0.05 ? 'Inverse' : 'Neutral';
  const confidence = n >= 30 ? 'High' : n >= 15 ? 'Moderate' : 'Preliminary';

  return { r, sampleSize: n, strength, direction, confidence };
}

/**
 * Computes statistical correlations from departmental paired response arrays.
 * 
 * @param {Object} pairedData - Keyed by dimension names with arrays of values
 * @returns {Array<Object>} List of evaluated correlation insights with ISO 45003 actions
 */
function computeEmpiricalCorrelations(pairedData = {}) {
  const results = [];

  for (const [dimName, data] of Object.entries(pairedData)) {
    if (!data.copsoqScores || !data.clinicalScores) continue;

    const stats = pearsonCorrelation(data.copsoqScores, data.clinicalScores);
    if (!stats) continue;

    results.push({
      dimension: dimName,
      survey_type: data.surveyType || 'generic',
      correlation_coefficient: stats.r,
      sample_size: stats.sampleSize,
      strength: stats.strength,
      direction: stats.direction,
      confidence: stats.confidence,
      iso_control_recommendation: getIsoControlRecommendation(dimName, stats.r),
    });
  }

  return results.sort((a, b) => Math.abs(b.correlation_coefficient) - Math.abs(a.correlation_coefficient));
}

/**
 * Recommends primary or secondary ISO 45003 organizational controls
 */
function getIsoControlRecommendation(dimension, r) {
  const d = (dimension || '').toLowerCase();
  if (d.includes('demand') || d.includes('pace') || d.includes('workload')) {
    return {
      control_id: 'JDM-01',
      category: 'Primary Control',
      action: 'Job Demand Management: Review headcount, reprioritize backlogs, and eliminate low-value meetings.',
    };
  }
  if (d.includes('autonomy') || d.includes('influence') || d.includes('control')) {
    return {
      control_id: 'JCT-01',
      category: 'Primary Control',
      action: 'Autonomy Enhancement: Delegate scheduling discretion and decision rights to operational teams.',
    };
  }
  if (d.includes('clarity') || d.includes('conflict') || d.includes('role')) {
    return {
      control_id: 'RCL-01',
      category: 'Primary Control',
      action: 'Role Clarification: Conduct RACI workshops to resolve overlapping responsibilities.',
    };
  }
  if (d.includes('support') || d.includes('community') || d.includes('trust')) {
    return {
      control_id: 'SUP-01',
      category: 'Secondary Control',
      action: 'Supervisor Support: Provide psychological safety training and normalize check-ins.',
    };
  }
  return {
    control_id: 'GEN-01',
    category: 'Secondary Control',
    action: 'Targeted Psychosocial Review: Schedule an anonymous pulse assessment for the affected department.',
  };
}

/**
 * Generates ISO 45003 environmental insights from aggregate metrics.
 * 
 * @param {Object} aggregateMetrics - Aggregated scores per survey
 * @returns {Array<Object>} Actionable insights
 */
function generateInsights(aggregateMetrics = {}) {
  const insights = [];

  let copsoqDimensions = {};
  for (const survey of ['copsoq3_core', 'copsoq3_middle', 'copsoq3_long']) {
    if (aggregateMetrics[survey] && aggregateMetrics[survey].avg_dimension_scores) {
      copsoqDimensions = { ...copsoqDimensions, ...aggregateMetrics[survey].avg_dimension_scores };
    }
  }

  const getDimScore = (dim) => copsoqDimensions[dim] !== undefined ? copsoqDimensions[dim] : null;

  // A. PHQ-9 (Depression Index)
  if (aggregateMetrics.phq9 && aggregateMetrics.phq9.avg_composite_score >= 10) {
    insights.push({
      clinical_indicator: 'PHQ-9 (Depression Index)',
      flag: 'Moderate-to-Severe',
      avg_score: aggregateMetrics.phq9.avg_composite_score,
      iso_control: getIsoControlRecommendation('Meaning of Work', -0.5),
      correlated_drivers: [
        { dimension: 'Meaning of Work', avg_score: getDimScore('Meaning of Work'), typical_direction: 'Low', expected_r: -0.48 },
        { dimension: 'Recognition', avg_score: getDimScore('Recognition'), typical_direction: 'Low', expected_r: -0.42 },
        { dimension: 'Role Conflicts', avg_score: getDimScore('Role Conflicts'), typical_direction: 'High', expected_r: +0.51 }
      ]
    });
  }

  // B. GAD-7 (Anxiety Index)
  if (aggregateMetrics.gad7 && aggregateMetrics.gad7.avg_composite_score >= 10) {
    insights.push({
      clinical_indicator: 'GAD-7 (Anxiety Index)',
      flag: 'Moderate-to-Severe',
      avg_score: aggregateMetrics.gad7.avg_composite_score,
      iso_control: getIsoControlRecommendation('Predictability', -0.6),
      correlated_drivers: [
        { dimension: 'Job Insecurity', avg_score: getDimScore('Job Insecurity'), typical_direction: 'High', expected_r: +0.57 },
        { dimension: 'Predictability', avg_score: getDimScore('Predictability'), typical_direction: 'Low', expected_r: -0.45 },
        { dimension: 'Vertical Trust', avg_score: getDimScore('Vertical Trust'), typical_direction: 'Low', expected_r: -0.39 }
      ]
    });
  }

  // C. PSS-10 (Perceived Stress)
  if (aggregateMetrics.pss10 && aggregateMetrics.pss10.avg_composite_score >= 27) {
    insights.push({
      clinical_indicator: 'PSS-10 (Perceived Stress)',
      flag: 'High',
      avg_score: aggregateMetrics.pss10.avg_composite_score,
      iso_control: getIsoControlRecommendation('Quantitative Demands', +0.65),
      correlated_drivers: [
        { dimension: 'Quantitative Demands', avg_score: getDimScore('Quantitative Demands'), typical_direction: 'High', expected_r: +0.62 },
        { dimension: 'Influence at Work', avg_score: getDimScore('Influence at Work'), typical_direction: 'Low', expected_r: -0.49 },
        { dimension: 'Work Pace', avg_score: getDimScore('Work Pace'), typical_direction: 'High', expected_r: +0.55 }
      ]
    });
  }

  // D. FAS-10 (Fatigue Assessment)
  if (aggregateMetrics.fas10 && aggregateMetrics.fas10.avg_composite_score >= 22) {
    insights.push({
      clinical_indicator: 'FAS-10 (Fatigue Assessment)',
      flag: 'Substantial Fatigue',
      avg_score: aggregateMetrics.fas10.avg_composite_score,
      iso_control: getIsoControlRecommendation('Workload', +0.55),
      correlated_drivers: [
        { dimension: 'Cognitive Demands', avg_score: getDimScore('Cognitive Demands'), typical_direction: 'High', expected_r: +0.47 },
        { dimension: 'Social Support from Supervisor', avg_score: getDimScore('Social Support from Supervisor'), typical_direction: 'Low', expected_r: -0.38 },
        { dimension: 'Social Support from Colleagues', avg_score: getDimScore('Social Support from Colleagues'), typical_direction: 'Low', expected_r: -0.34 },
        { dimension: 'Sense of Community at Work', avg_score: getDimScore('Sense of Community at Work'), typical_direction: 'Low', expected_r: -0.40 }
      ]
    });
  }

  return insights;
}

module.exports = {
  pearsonCorrelation,
  computeEmpiricalCorrelations,
  getIsoControlRecommendation,
  generateInsights,
};
