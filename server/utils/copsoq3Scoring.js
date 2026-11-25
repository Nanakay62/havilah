'use strict';

/**
 * COPSOQ III (Copenhagen Psychosocial Questionnaire Version 3)
 * Official scoring implementation (Burr et al., 2019).
 *
 * All items map onto a 0-100 scale. A dimension score is valid only if a
 * respondent answers at least 50% of the items administered for that dimension
 * in the active questionnaire version (Core, Middle, or Long).
 *
 * Dimension valences are preserved explicitly (hazards: high = worse;
 * resources: high = better) so aggregate risk and wellbeing indices never
 * mix opposite directions.
 */

const SCORE_MAP = {
  desc: [100, 75, 50, 25, 0],
  asc: [0, 25, 50, 75, 100],
};

// Multi-select perpetrator attribution items (5M) are qualitative descriptors, not 0-100 scale items.
const SKIP_ITEM_CODES = new Set(['GS2', 'UT2', 'HSM2', 'SH2', 'TV2', 'PV2', 'BU3']);

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

  // Offensive Behaviors (Long)
  GS1: { dim: 'Gossip and Slander', type: 'desc' },
  CQ1: { dim: 'Conflicts and Quarrels', type: 'desc' },
  UT1: { dim: 'Unpleasant Teasing', type: 'desc' },
  HSM1: { dim: 'Cyber Bullying', type: 'desc' },
  SH1: { dim: 'Sexual Harassment', type: 'desc' },
  TV1: { dim: 'Threats of Violence', type: 'desc' },
  PV1: { dim: 'Physical Violence', type: 'desc' },
  BU1: { dim: 'Bullying', type: 'desc' },
  BU2: { dim: 'Bullying', type: 'desc' },

  // Health & Well-Being
  GH1: { dim: 'Self-Rated Health', type: 'desc' },
  GH2: { dim: 'Self-Rated Health', type: 'scale10' },
  SL1: { dim: 'Sleeping Troubles', type: 'desc' },
  SL2: { dim: 'Sleeping Troubles', type: 'desc' },
  SL3: { dim: 'Sleeping Troubles', type: 'desc' },
  SL4: { dim: 'Sleeping Troubles', type: 'desc' },
  BO1: { dim: 'Burnout', type: 'desc' },
  BO2: { dim: 'Burnout', type: 'desc' },
  BO3: { dim: 'Burnout', type: 'desc' },
  BO4: { dim: 'Burnout', type: 'desc' },
  ST1: { dim: 'Stress', type: 'desc' },
  ST2: { dim: 'Stress', type: 'desc' },
  ST3: { dim: 'Stress', type: 'desc' },
  SO1: { dim: 'Somatic Stress', type: 'desc' },
  SO2: { dim: 'Somatic Stress', type: 'desc' },
  SO3: { dim: 'Somatic Stress', type: 'desc' },
  SO4: { dim: 'Somatic Stress', type: 'desc' },
  CS1: { dim: 'Cognitive Stress', type: 'desc' },
  CS2: { dim: 'Cognitive Stress', type: 'desc' },
  CS3: { dim: 'Cognitive Stress', type: 'desc' },
  CS4: { dim: 'Cognitive Stress', type: 'desc' },
  DS1: { dim: 'Depressive Symptoms', type: 'desc' },
  DS2: { dim: 'Depressive Symptoms', type: 'desc' },
  DS3: { dim: 'Depressive Symptoms', type: 'desc' },
  DS4: { dim: 'Depressive Symptoms', type: 'desc' },
  SE1: { dim: 'Self-Efficacy', type: 'desc' },
  SE2: { dim: 'Self-Efficacy', type: 'desc' },
  SE3: { dim: 'Self-Efficacy', type: 'desc' },
  SE4: { dim: 'Self-Efficacy', type: 'desc' },
  SE5: { dim: 'Self-Efficacy', type: 'desc' },
  SE6: { dim: 'Self-Efficacy', type: 'desc' },
};

const DIMENSION_VALENCE = {
  'Quantitative Demands': 'hazard',
  'Work Pace': 'hazard',
  'Cognitive Demands': 'hazard',
  'Emotional Demands': 'hazard',
  'Demands for Hiding Emotions': 'hazard',
  'Influence at Work': 'resource',
  'Possibilities for Development': 'resource',
  'Variation of Work': 'resource',
  'Control over Working time': 'resource',
  'Meaning of Work': 'resource',
  Predictability: 'resource',
  Recognition: 'resource',
  'Role Clarity': 'resource',
  'Role Conflicts': 'hazard',
  'Illegitimate Tasks': 'hazard',
  'Quality of Leadership': 'resource',
  'Social Support from Supervisor': 'resource',
  'Social Support from Colleagues': 'resource',
  'Sense of Community at Work': 'resource',
  'Commitment to the Workplace': 'resource',
  'Work Engagement': 'resource',
  'Job Insecurity': 'hazard',
  'Insecurity over Working Conditions': 'hazard',
  'Quality of Work': 'resource',
  'Job Satisfaction': 'resource',
  'Work Life Conflict': 'hazard',
  'Horizontal Trust': 'resource',
  'Vertical Trust': 'resource',
  'Organizational Justice': 'resource',
  'Gossip and Slander': 'hazard',
  'Conflicts and Quarrels': 'hazard',
  'Unpleasant Teasing': 'hazard',
  'Cyber Bullying': 'hazard',
  'Sexual Harassment': 'hazard',
  'Threats of Violence': 'hazard',
  'Physical Violence': 'hazard',
  Bullying: 'hazard',
  'Self-Rated Health': 'resource',
  'Sleeping Troubles': 'hazard',
  Burnout: 'hazard',
  Stress: 'hazard',
  'Somatic Stress': 'hazard',
  'Cognitive Stress': 'hazard',
  'Depressive Symptoms': 'hazard',
  'Self-Efficacy': 'resource',
};

const VERSION_ITEM_LISTS = {
  copsoq3_core: [
    'QD2', 'QD3', 'WP1', 'WP2', 'EDX2', 'ED3', 'INX1', 'PD2', 'PD3', 'MW1',
    'PR1', 'PR2', 'RE1', 'CL1', 'CO2', 'CO3', 'QL3', 'QL4', 'SSX1', 'SCX1',
    'SW1', 'JI1', 'JI3', 'IW1', 'JS4', 'WF2', 'WF3', 'TM1', 'TMX2', 'JU1',
    'JU4', 'GH1',
  ],
  copsoq3_middle: [
    'QD1', 'QD2', 'QD3', 'WP1', 'WP2', 'ED1', 'EDX2', 'ED3', 'HE2', 'HE3',
    'HE4', 'INX1', 'IN3', 'IN4', 'IN6', 'PD2', 'PD3', 'PD4', 'CT1', 'CT2',
    'CT3', 'CT4', 'MW1', 'MW2', 'PR1', 'PR2', 'RE1', 'CL1', 'CL2', 'CL3',
    'CO2', 'CO3', 'IT1', 'QLX1', 'QL3', 'QL4', 'SSX1', 'SSX2', 'SCX1', 'SCX2',
    'SW1', 'SW3', 'JI1', 'JI3', 'IW1', 'IW3', 'IW4', 'QW2', 'JS1', 'JS4',
    'JS5', 'WF2', 'WF3', 'TE3', 'TM1', 'TMX2', 'TM4', 'JU1', 'JU4', 'GH1',
  ],
  copsoq3_long: [
    'QD1', 'QD2', 'QD3', 'QD4', 'WP1', 'WP2', 'WP3', 'CD1', 'CD2', 'CD3',
    'CD4', 'ED1', 'EDX2', 'ED3', 'HE1', 'HE2', 'HE3', 'HE4', 'INX1', 'IN2',
    'IN3', 'IN4', 'IN5', 'IN6', 'PD2', 'PD3', 'PD4', 'VA1', 'VA2', 'CT1',
    'CT2', 'CT3', 'CT4', 'CT5', 'MW1', 'MW2', 'PR1', 'PR2', 'RE1', 'RE2',
    'RE3', 'CL1', 'CL2', 'CL3', 'CO2', 'CO3', 'IT1', 'QLX1', 'QL2', 'QL3',
    'QL4', 'SSX1', 'SSX2', 'SSX3', 'SCX1', 'SCX2', 'SC3', 'SW1', 'SW2', 'SW3',
    'CW1', 'CW2', 'CWX3', 'CW4', 'CW5', 'WE1', 'WE2', 'WE3', 'JI1', 'JI2',
    'JI3', 'IW1', 'IW2', 'IW3', 'IW4', 'IW5', 'QW1', 'QW2', 'JS1', 'JS2',
    'JS3', 'JS4', 'JS5', 'WFX1', 'WF2', 'WF3', 'WF5', 'WF6', 'TE1', 'TE2',
    'TE3', 'TM1', 'TMX2', 'TM3', 'TM4', 'JU1', 'JU2', 'JU3', 'JU4', 'GS1',
    'GS2', 'CQ1', 'UT1', 'UT2', 'HSM1', 'HSM2', 'SH1', 'SH2', 'TV1', 'TV2',
    'PV1', 'PV2', 'BU1', 'BU3', 'BU2', 'GH1', 'GH2', 'SL1', 'SL2', 'SL3',
    'SL4', 'BO1', 'BO2', 'BO3', 'BO4', 'ST1', 'ST2', 'ST3', 'SO1', 'SO2',
    'SO3', 'SO4', 'CS1', 'CS2', 'CS3', 'CS4', 'DS1', 'DS2', 'DS3', 'DS4',
    'SE1', 'SE2', 'SE3', 'SE4', 'SE5', 'SE6',
  ],
};

function buildDimCounts(itemCodes) {
  const counts = {};
  for (const rawCode of itemCodes) {
    if (SKIP_ITEM_CODES.has(rawCode)) continue;
    const def = COPSOQ3_ITEMS[rawCode];
    if (!def) continue;
    counts[def.dim] = (counts[def.dim] || 0) + 1;
  }
  return counts;
}

const DIMENSION_ITEM_COUNTS = buildDimCounts(Object.keys(COPSOQ3_ITEMS));
const VERSION_DIM_COUNTS = {
  copsoq3_core: buildDimCounts(VERSION_ITEM_LISTS.copsoq3_core),
  copsoq3_middle: buildDimCounts(VERSION_ITEM_LISTS.copsoq3_middle),
  copsoq3_long: buildDimCounts(VERSION_ITEM_LISTS.copsoq3_long),
};

function resolveItemCode(r, versionList) {
  let code = r && r.item_code ? String(r.item_code).trim() : null;
  if (!code && versionList && typeof r?.question_index === 'number') {
    code = versionList[r.question_index] || null;
  }
  if (code === 'OD4') code = 'QD4';
  return code;
}

function resolveNumericScore(item, r) {
  if (typeof r.score === 'number' && Number.isFinite(r.score)) {
    if (r.score < 0 || r.score > 100) return null;
    return r.score;
  }
  if (typeof r.value !== 'number' || !Number.isFinite(r.value)) return null;
  if (item.type === 'scale10') {
    if (r.value >= 0 && r.value <= 10) return r.value * 10;
    return null;
  }
  if (r.value < 0 || r.value > 4 || !Number.isInteger(r.value)) return null;
  return SCORE_MAP[item.type][r.value];
}

/**
 * Scores a COPSOQ III assessment based on Burr et al. (2019).
 * Computes each valid dimension on its 0-100 construct scale (>= 50% items rule),
 * then valence-aligns hazard and resource dimensions to yield risk_composite
 * (0 = lowest risk, 100 = highest risk) and wellbeing_index (100 = healthiest).
 *
 * @param {Array<{item_code?: string, question_index?: number, value?: number, score?: number}>} responses
 * @param {{ version?: string }} [options]
 * @returns {{ raw_score: number, severity_band: string, composite_score: number, risk_composite: number, wellbeing_index: number, likelihood: number, severity: number, dimension_scores: Map<string, number> }}
 */
function scoreCOPSOQ3(responses, options = {}) {
  const version = options && VERSION_ITEM_LISTS[options.version] ? options.version : null;
  const versionList = version ? VERSION_ITEM_LISTS[version] : null;
  const expectedCounts = version ? VERSION_DIM_COUNTS[version] : DIMENSION_ITEM_COUNTS;

  const dimAnswers = new Map();
  const safeResponses = Array.isArray(responses) ? responses : [];

  for (const r of safeResponses) {
    if (!r || typeof r !== 'object') continue;
    const code = resolveItemCode(r, versionList);
    if (!code || SKIP_ITEM_CODES.has(code)) continue;

    const item = COPSOQ3_ITEMS[code];
    if (!item) continue;

    const scoreVal = resolveNumericScore(item, r);
    if (scoreVal === null) continue;

    if (!dimAnswers.has(item.dim)) {
      dimAnswers.set(item.dim, []);
    }
    dimAnswers.get(item.dim).push(scoreVal);
  }

  const dimension_scores = new Map();
  let totalRiskSum = 0;
  let validScales = 0;

  for (const [dim, answers] of dimAnswers.entries()) {
    const expectedCount = expectedCounts[dim] || DIMENSION_ITEM_COUNTS[dim];
    if (!expectedCount || answers.length < expectedCount / 2) continue;

    const scaleScore = answers.reduce((a, b) => a + b, 0) / answers.length;
    const roundedDim = Math.round(scaleScore * 100) / 100;
    dimension_scores.set(dim, roundedDim);

    const valence = DIMENSION_VALENCE[dim] || 'hazard';
    const riskContribution = valence === 'resource' ? (100 - scaleScore) : scaleScore;
    totalRiskSum += riskContribution;
    validScales++;
  }

  const riskComposite = validScales > 0 ? Math.round((totalRiskSum / validScales) * 100) / 100 : 0;
  const wellbeingIndex = validScales > 0 ? Math.max(0, Math.min(100, Math.round(100 - riskComposite))) : 0;

  if (validScales > 0) {
    dimension_scores.set('risk_work_fit', riskComposite);
  }

  let severity_band;
  let severity;
  let likelihood;

  if (riskComposite <= 25) {
    severity_band = 'healthy';
    severity = 1;
    likelihood = 1;
  } else if (riskComposite <= 50) {
    severity_band = 'mild';
    severity = 2;
    likelihood = 2;
  } else if (riskComposite <= 75) {
    severity_band = 'moderate';
    severity = 3;
    likelihood = 3;
  } else {
    severity_band = 'severe';
    severity = riskComposite <= 90 ? 4 : 5;
    likelihood = riskComposite <= 90 ? 4 : 5;
  }

  return {
    raw_score: riskComposite,
    severity_band,
    composite_score: riskComposite,
    risk_composite: riskComposite,
    wellbeing_index: wellbeingIndex,
    likelihood,
    severity,
    dimension_scores,
  };
}

module.exports = {
  scoreCOPSOQ3,
  COPSOQ3_ITEMS,
  DIMENSION_VALENCE,
  VERSION_ITEM_LISTS,
  VERSION_DIM_COUNTS,
  SKIP_ITEM_CODES,
};
