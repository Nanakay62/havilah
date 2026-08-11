'use strict';

/**
 * COPSOQ III (Copenhagen Psychosocial Questionnaire Version 3)
 * Official scoring implementation.
 * 
 * All implementations feature CORE, MIDDLE, and LONG items.
 * A scale's final score is only valid if a respondent has answered at least 50% 
 * of the items in that specific scale.
 */

// Scoring arrays based on user index (0-4)
// 'desc': Types 1, 2, 6, 9 (100, 75, 50, 25, 0)
// 'asc': Types 1R, 2R, 3 (0, 25, 50, 75, 100)
const SCORE_MAP = {
  desc: [100, 75, 50, 25, 0],
  asc: [0, 25, 50, 75, 100]
};

// Map of Item Code to its Dimension and Scoring Direction
const COPSOQ3_ITEMS = {
  // Quantitative Demands
  QD1: { dim: 'Quantitative Demands', type: 'desc' },
  QD2: { dim: 'Quantitative Demands', type: 'desc' },
  QD3: { dim: 'Quantitative Demands', type: 'desc' },
  QD4: { dim: 'Quantitative Demands', type: 'asc' },
  
  // Work Pace
  WP1: { dim: 'Work Pace', type: 'desc' },
  WP2: { dim: 'Work Pace', type: 'desc' },
  WP3: { dim: 'Work Pace', type: 'desc' },
  
  // Cognitive Demands
  CD1: { dim: 'Cognitive Demands', type: 'desc' },
  CD2: { dim: 'Cognitive Demands', type: 'desc' },
  CD3: { dim: 'Cognitive Demands', type: 'desc' },
  CD4: { dim: 'Cognitive Demands', type: 'desc' },

  // Emotional Demands
  ED1: { dim: 'Emotional Demands', type: 'desc' },
  EDX2: { dim: 'Emotional Demands', type: 'desc' },
  ED3: { dim: 'Emotional Demands', type: 'desc' },

  // Demands for Hiding Emotions
  HE1: { dim: 'Demands for Hiding Emotions', type: 'desc' },
  HE2: { dim: 'Demands for Hiding Emotions', type: 'desc' },
  HE3: { dim: 'Demands for Hiding Emotions', type: 'desc' },
  HE4: { dim: 'Demands for Hiding Emotions', type: 'desc' },

  // Influence at Work
  INX1: { dim: 'Influence at Work', type: 'desc' },
  IN2: { dim: 'Influence at Work', type: 'desc' },
  IN3: { dim: 'Influence at Work', type: 'desc' },
  IN4: { dim: 'Influence at Work', type: 'desc' },
  IN5: { dim: 'Influence at Work', type: 'desc' },
  IN6: { dim: 'Influence at Work', type: 'desc' },

  // Possibilities for Development
  PD2: { dim: 'Possibilities for Development', type: 'desc' },
  PD3: { dim: 'Possibilities for Development', type: 'desc' },
  PD4: { dim: 'Possibilities for Development', type: 'desc' },

  // Variation of Work
  VA1: { dim: 'Variation of Work', type: 'desc' },
  VA2: { dim: 'Variation of Work', type: 'asc' },

  // Control over Working time
  CT1: { dim: 'Control over Working time', type: 'desc' },
  CT2: { dim: 'Control over Working time', type: 'desc' },
  CT3: { dim: 'Control over Working time', type: 'desc' },
  CT4: { dim: 'Control over Working time', type: 'desc' },
  CT5: { dim: 'Control over Working time', type: 'asc' },

  // Meaning of Work
  MW1: { dim: 'Meaning of Work', type: 'desc' },
  MW2: { dim: 'Meaning of Work', type: 'desc' },

  // Predictability
  PR1: { dim: 'Predictability', type: 'desc' },
  PR2: { dim: 'Predictability', type: 'desc' },

  // Recognition
  RE1: { dim: 'Recognition', type: 'desc' },
  RE2: { dim: 'Recognition', type: 'desc' },
  RE3: { dim: 'Recognition', type: 'desc' },

  // Role Clarity
  CL1: { dim: 'Role Clarity', type: 'desc' },
  CL2: { dim: 'Role Clarity', type: 'desc' },
  CL3: { dim: 'Role Clarity', type: 'desc' },

  // Role Conflicts
  CO2: { dim: 'Role Conflicts', type: 'desc' },
  CO3: { dim: 'Role Conflicts', type: 'desc' },

  // Illegitimate Tasks
  IT1: { dim: 'Illegitimate Tasks', type: 'desc' },

  // Quality of Leadership
  QLX1: { dim: 'Quality of Leadership', type: 'desc' },
  QL2: { dim: 'Quality of Leadership', type: 'desc' },
  QL3: { dim: 'Quality of Leadership', type: 'desc' },
  QL4: { dim: 'Quality of Leadership', type: 'desc' },

  // Social Support from Supervisor
  SSX1: { dim: 'Social Support from Supervisor', type: 'desc' },
  SSX2: { dim: 'Social Support from Supervisor', type: 'desc' },
  SSX3: { dim: 'Social Support from Supervisor', type: 'desc' },

  // Social Support from Colleagues
  SCX1: { dim: 'Social Support from Colleagues', type: 'desc' },
  SCX2: { dim: 'Social Support from Colleagues', type: 'desc' },
  SC3: { dim: 'Social Support from Colleagues', type: 'desc' },

  // Sense of Community at Work
  SW1: { dim: 'Sense of Community at Work', type: 'desc' },
  SW2: { dim: 'Sense of Community at Work', type: 'desc' },
  SW3: { dim: 'Sense of Community at Work', type: 'desc' },

  // Commitment to the Workplace
  CW1: { dim: 'Commitment to the Workplace', type: 'desc' },
  CW2: { dim: 'Commitment to the Workplace', type: 'desc' },
  CWX3: { dim: 'Commitment to the Workplace', type: 'desc' },
  CW4: { dim: 'Commitment to the Workplace', type: 'asc' },
  CW5: { dim: 'Commitment to the Workplace', type: 'desc' },

  // Work Engagement
  WE1: { dim: 'Work Engagement', type: 'asc' },
  WE2: { dim: 'Work Engagement', type: 'asc' },
  WE3: { dim: 'Work Engagement', type: 'asc' },

  // Job Insecurity
  JI1: { dim: 'Job Insecurity', type: 'desc' },
  JI2: { dim: 'Job Insecurity', type: 'desc' },
  JI3: { dim: 'Job Insecurity', type: 'desc' },

  // Insecurity over Working Conditions
  IW1: { dim: 'Insecurity over Working Conditions', type: 'desc' },
  IW2: { dim: 'Insecurity over Working Conditions', type: 'desc' },
  IW3: { dim: 'Insecurity over Working Conditions', type: 'desc' },
  IW4: { dim: 'Insecurity over Working Conditions', type: 'desc' },
  IW5: { dim: 'Insecurity over Working Conditions', type: 'asc' },

  // Quality of Work
  QW1: { dim: 'Quality of Work', type: 'desc' },
  QW2: { dim: 'Quality of Work', type: 'desc' },

  // Job Satisfaction
  JS1: { dim: 'Job Satisfaction', type: 'desc' },
  JS2: { dim: 'Job Satisfaction', type: 'desc' },
  JS3: { dim: 'Job Satisfaction', type: 'desc' },
  JS4: { dim: 'Job Satisfaction', type: 'desc' },
  JS5: { dim: 'Job Satisfaction', type: 'desc' },

  // Work Life Conflict
  WFX1: { dim: 'Work Life Conflict', type: 'desc' },
  WF2: { dim: 'Work Life Conflict', type: 'desc' },
  WF3: { dim: 'Work Life Conflict', type: 'desc' },
  WF5: { dim: 'Work Life Conflict', type: 'desc' },
  WF6: { dim: 'Work Life Conflict', type: 'desc' },

  // Horizontal Trust
  TE1: { dim: 'Horizontal Trust', type: 'asc' },
  TE2: { dim: 'Horizontal Trust', type: 'asc' },
  TE3: { dim: 'Horizontal Trust', type: 'desc' },

  // Vertical Trust
  TM1: { dim: 'Vertical Trust', type: 'desc' },
  TMX2: { dim: 'Vertical Trust', type: 'desc' },
  TM3: { dim: 'Vertical Trust', type: 'asc' },
  TM4: { dim: 'Vertical Trust', type: 'desc' },

  // Organizational Justice
  JU1: { dim: 'Organizational Justice', type: 'desc' },
  JU2: { dim: 'Organizational Justice', type: 'desc' },
  JU3: { dim: 'Organizational Justice', type: 'desc' },
  JU4: { dim: 'Organizational Justice', type: 'desc' },
};

// Count how many items belong to each dimension to calculate the 50% threshold
const DIMENSION_ITEM_COUNTS = {};
for (const code of Object.keys(COPSOQ3_ITEMS)) {
  const dim = COPSOQ3_ITEMS[code].dim;
  DIMENSION_ITEM_COUNTS[dim] = (DIMENSION_ITEM_COUNTS[dim] || 0) + 1;
}

/**
 * Scores a COPSOQ III assessment based on official guidelines.
 * @param {Array<{item_code: string, value: number}>} responses
 * @returns {{ raw_score: number, severity_band: string, composite_score: number, likelihood: number, severity: number, dimension_scores: Map<string, number> }}
 */
function scoreCOPSOQ3(responses) {
  const dimAnswers = new Map();

  for (const r of responses) {
    const item = COPSOQ3_ITEMS[r.item_code];
    // If the item code is unknown, or value is out of range, ignore it.
    if (!item || typeof r.value !== 'number' || r.value < 0 || r.value > 4) continue;
    
    if (!dimAnswers.has(item.dim)) {
      dimAnswers.set(item.dim, []);
    }
    
    const scoreVal = SCORE_MAP[item.type][r.value];
    dimAnswers.get(item.dim).push(scoreVal);
  }

  const dimension_scores = new Map();
  let totalScaleSum = 0;
  let validScales = 0;

  for (const [dim, answers] of dimAnswers.entries()) {
    const expectedCount = DIMENSION_ITEM_COUNTS[dim];
    // Rule: Valid only if at least 50% of the items are answered
    if (answers.length >= expectedCount / 2) {
      const scaleScore = answers.reduce((a, b) => a + b, 0) / answers.length;
      dimension_scores.set(dim, Math.round(scaleScore * 100) / 100);
      totalScaleSum += scaleScore;
      validScales++;
    }
  }

  // Composite = average of valid dimension averages
  const composite = validScales > 0 ? Math.round((totalScaleSum / validScales) * 100) / 100 : 0;

  let severity_band;
  let severity;
  let likelihood;

  // Since COPSOQ doesn't have a universal "healthy vs severe" scale that applies to ALL dimensions equally 
  // (e.g. high quantitative demands is bad, but high meaning of work is good), the composite score 
  // is typically not used for clinical bands. But to maintain compatibility with AnonHazardLog Schema,
  // we generate a heuristic severity band. We can interpret higher composite as 'higher psychosocial risk'
  // assuming reverse-scored items correctly reflect risk. However, since COPSOQ has mixed valences 
  // without a single overarching direction, we just return safe defaults and rely on specific dimensions for the Correlation Engine.
  if (composite <= 25) {
    severity_band = 'healthy';
    severity = 1;
    likelihood = 1;
  } else if (composite <= 50) {
    severity_band = 'mild';
    severity = 2;
    likelihood = 2;
  } else if (composite <= 75) {
    severity_band = 'moderate';
    severity = 3;
    likelihood = 3;
  } else {
    severity_band = 'severe';
    severity = composite <= 90 ? 4 : 5;
    likelihood = composite <= 90 ? 4 : 5;
  }

  return { 
    raw_score: composite, 
    severity_band, 
    composite_score: composite, 
    likelihood, 
    severity, 
    dimension_scores 
  };
}

module.exports = {
  scoreCOPSOQ3,
  COPSOQ3_ITEMS
};
