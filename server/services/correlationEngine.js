'use strict';

/**
 * Correlation Engine
 * 
 * Links clinical outcomes (PHQ-9, GAD-7, PSS-10, FAS-10) to 
 * aggregated COPSOQ III environmental drivers at the departmental level.
 */

function generateInsights(aggregateMetrics) {
  const insights = [];

  // Expected input: 
  // aggregateMetrics is an object keyed by survey_type containing the aggregated metrics for that survey
  // e.g. {
  //   phq9: { count: 12, avg_composite_score: 11.2 },
  //   copsoq3_middle: { count: 15, avg_dimension_scores: { 'Meaning of Work': 45, 'Recognition': 30, ... } }
  // }
  
  // Flatten COPSOQ dimension scores
  let copsoqDimensions = {};
  for (const survey of ['copsoq3_core', 'copsoq3_middle', 'copsoq3_long']) {
    if (aggregateMetrics[survey] && aggregateMetrics[survey].avg_dimension_scores) {
      copsoqDimensions = { ...copsoqDimensions, ...aggregateMetrics[survey].avg_dimension_scores };
    }
  }

  // Helper to safely extract a score
  const getDimScore = (dim) => copsoqDimensions[dim] !== undefined ? copsoqDimensions[dim] : null;

  // A. PHQ-9 (Depression Index)
  if (aggregateMetrics.phq9 && aggregateMetrics.phq9.avg_composite_score >= 10) {
    insights.push({
      clinical_indicator: 'PHQ-9 (Depression Index)',
      flag: 'Moderate-to-Severe',
      avg_score: aggregateMetrics.phq9.avg_composite_score,
      correlated_drivers: [
        { dimension: 'Meaning of Work', avg_score: getDimScore('Meaning of Work'), typical_direction: 'Low' },
        { dimension: 'Recognition', avg_score: getDimScore('Recognition'), typical_direction: 'Low' },
        { dimension: 'Role Conflicts', avg_score: getDimScore('Role Conflicts'), typical_direction: 'High' }
      ]
    });
  }

  // B. GAD-7 (Anxiety Index)
  if (aggregateMetrics.gad7 && aggregateMetrics.gad7.avg_composite_score >= 10) {
    insights.push({
      clinical_indicator: 'GAD-7 (Anxiety Index)',
      flag: 'Moderate-to-Severe',
      avg_score: aggregateMetrics.gad7.avg_composite_score,
      correlated_drivers: [
        { dimension: 'Job Insecurity', avg_score: getDimScore('Job Insecurity'), typical_direction: 'High' },
        { dimension: 'Predictability', avg_score: getDimScore('Predictability'), typical_direction: 'Low' },
        { dimension: 'Vertical Trust', avg_score: getDimScore('Vertical Trust'), typical_direction: 'Low' }
      ]
    });
  }

  // C. PSS-10 (Perceived Stress)
  if (aggregateMetrics.pss10 && aggregateMetrics.pss10.avg_composite_score >= 27) {
    insights.push({
      clinical_indicator: 'PSS-10 (Perceived Stress)',
      flag: 'High',
      avg_score: aggregateMetrics.pss10.avg_composite_score,
      correlated_drivers: [
        { dimension: 'Quantitative Demands', avg_score: getDimScore('Quantitative Demands'), typical_direction: 'High' },
        { dimension: 'Influence at Work', avg_score: getDimScore('Influence at Work'), typical_direction: 'Low' },
        { dimension: 'Work Pace', avg_score: getDimScore('Work Pace'), typical_direction: 'High' }
      ]
    });
  }

  // D. FAS-10 (Fatigue Assessment)
  if (aggregateMetrics.fas10 && aggregateMetrics.fas10.avg_composite_score >= 22) {
    insights.push({
      clinical_indicator: 'FAS-10 (Fatigue Assessment)',
      flag: 'Substantial Fatigue',
      avg_score: aggregateMetrics.fas10.avg_composite_score,
      correlated_drivers: [
        { dimension: 'Cognitive Demands', avg_score: getDimScore('Cognitive Demands'), typical_direction: 'High' },
        { dimension: 'Social Support from Supervisor', avg_score: getDimScore('Social Support from Supervisor'), typical_direction: 'Low' },
        { dimension: 'Social Support from Colleagues', avg_score: getDimScore('Social Support from Colleagues'), typical_direction: 'Low' },
        { dimension: 'Sense of Community at Work', avg_score: getDimScore('Sense of Community at Work'), typical_direction: 'Low' }
      ]
    });
  }

  return insights;
}

module.exports = {
  generateInsights
};
