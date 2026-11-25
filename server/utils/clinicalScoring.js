'use strict';

/**
 * Shared psychometric scoring, Likert scaling, ISO week derivation,
 * and Largest-Remainder percentage rounding utilities.
 */

const PSS10_REVERSE_ITEMS = new Set([3, 4, 6, 7]);
const FAS10_REVERSE_ITEMS = new Set([3, 9]);

class ClinicalValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ClinicalValidationError';
    this.statusCode = 400;
    this.code = 'VALIDATION_ERROR';
  }
}

/**
 * Compute UTC ISO 8601 week number (1..53).
 * @param {Date|string|number} [date]
 * @returns {number}
 */
function getIsoWeekNumber(date = new Date()) {
  const src = date instanceof Date ? date : new Date(date);
  const safe = Number.isNaN(src.getTime()) ? new Date() : src;
  const d = new Date(Date.UTC(safe.getUTCFullYear(), safe.getUTCMonth(), safe.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

/**
 * Round category counts into integer percentages summing to 100 using
 * Largest-Remainder (Hamilton) allocation while preserving exact 0% for zero counts.
 * @param {Record<string, number>} countsObj
 * @param {string[]} keys
 * @returns {Record<string, number>}
 */
function roundPercentagesLargestRemainder(countsObj, keys) {
  const result = {};
  let total = 0;
  for (const k of keys) {
    const val = Math.max(0, Number(countsObj && countsObj[k]) || 0);
    total += val;
    result[k] = 0;
  }
  if (total === 0) return result;

  let floorSum = 0;
  const positive = [];
  keys.forEach((k, idx) => {
    const count = Math.max(0, Number(countsObj[k]) || 0);
    if (count === 0) return;
    const exact = (count / total) * 100;
    const floored = Math.floor(exact);
    result[k] = floored;
    floorSum += floored;
    positive.push({
      key: k,
      count,
      idx,
      remainder: exact - floored,
    });
  });

  let remaining = 100 - floorSum;
  positive.sort((a, b) => {
    if (Math.abs(b.remainder - a.remainder) > 1e-12) return b.remainder - a.remainder;
    if (b.count !== a.count) return b.count - a.count;
    return a.idx - b.idx;
  });

  let cursor = 0;
  while (remaining > 0 && positive.length > 0) {
    result[positive[cursor % positive.length].key] += 1;
    remaining -= 1;
    cursor += 1;
  }
  return result;
}

/**
 * Normalize a 1-5 Likert rating onto the standard 0-100 scale: (val - 1) * 25.
 * Values > 5 are clamped to 0..100 for legacy slider compatibility.
 * Missing or non-numeric ratings return null instead of fabricating a neutral 50.
 * @param {number|null|undefined} val
 * @returns {number|null}
 */
function normalizeDailyPulseRating(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'number' ? val : Number(val);
  if (!Number.isFinite(num)) return null;
  if (num === 0) return 0;
  if (num >= 1 && num <= 5) return Math.round((num - 1) * 25);
  return Math.max(0, Math.min(100, Math.round(num)));
}

/**
 * Classify a 0-100 Daily Pulse composite wellbeing score (higher = healthier)
 * into AnonHazardLog severity fields.
 * @param {number} overallBalance
 * @returns {{ severity_band: string, severity: number, likelihood: number }}
 */
function classifyDailyPulse(overallBalance) {
  const score = Math.max(0, Math.min(100, Number(overallBalance) || 0));
  if (score >= 75) return { severity_band: 'healthy', severity: 1, likelihood: 1 };
  if (score >= 50) return { severity_band: 'mild', severity: 2, likelihood: 2 };
  if (score >= 30) return { severity_band: 'moderate', severity: 3, likelihood: 3 };
  const extreme = score < 20 ? 5 : 4;
  return { severity_band: 'severe', severity: extreme, likelihood: extreme };
}

/**
 * Strictly validate and sum clinical instrument responses (Option A: complete-case required).
 * Ensures every expected item [0..expectedCount-1] is present once and within [minVal, maxVal].
 */
function validateAndSumClinicalItems(responses, options) {
  const {
    instrument,
    expectedCount,
    minVal,
    maxVal,
    reverseSet = null,
    reverseBase = 0,
  } = options;

  if (!Array.isArray(responses) || responses.length < expectedCount) {
    const actualCount = Array.isArray(responses) ? responses.length : 0;
    throw new ClinicalValidationError(
      `${instrument} requires all ${expectedCount} questions to be answered (received ${actualCount}).`
    );
  }
  if (responses.length > expectedCount) {
    throw new ClinicalValidationError(
      `${instrument} expects ${expectedCount} items (received ${responses.length}).`
    );
  }

  const seenIndices = new Set();
  let total = 0;

  for (let i = 0; i < responses.length; i++) {
    const entry = responses[i];
    const isObj = entry !== null && typeof entry === 'object';
    const rawIdx = isObj && entry.question_index !== undefined && entry.question_index !== null
      ? Number(entry.question_index)
      : i;

    if (!Number.isInteger(rawIdx) || rawIdx < 0 || rawIdx >= expectedCount) {
      throw new ClinicalValidationError(
        `${instrument} contains an invalid question index at position ${i}.`
      );
    }
    if (seenIndices.has(rawIdx)) {
      throw new ClinicalValidationError(
        `${instrument} contains a duplicate answer for question ${rawIdx + 1}.`
      );
    }

    const rawCandidate = isObj ? entry.value : entry;
    if (rawCandidate === null || rawCandidate === undefined || rawCandidate === '') {
      throw new ClinicalValidationError(
        `${instrument} question ${rawIdx + 1} is unanswered.`
      );
    }
    const rawVal = Number(rawCandidate);
    if (!Number.isInteger(rawVal) || rawVal < minVal || rawVal > maxVal) {
      throw new ClinicalValidationError(
        `${instrument} question ${rawIdx + 1} must be an integer between ${minVal} and ${maxVal}.`
      );
    }

    seenIndices.add(rawIdx);
    total += reverseSet && reverseSet.has(rawIdx) ? (reverseBase - rawVal) : rawVal;
  }

  if (seenIndices.size !== expectedCount) {
    throw new ClinicalValidationError(
      `${instrument} requires all ${expectedCount} questions to be answered.`
    );
  }

  return total;
}

/**
 * Score PHQ-9 (9 items, 0-3, total 0-27).
 * Standard bands (Kroenke et al.): 0-4 Minimal, 5-9 Mild, 10-14 Moderate,
 * 15-19 Moderately Severe, 20-27 Severe.
 */
function scorePHQ9(responses) {
  const raw = Math.max(0, Math.min(27, validateAndSumClinicalItems(responses, {
    instrument: 'PHQ-9',
    expectedCount: 9,
    minVal: 0,
    maxVal: 3,
  })));
  const maxScore = 27;
  const composite = Math.round((raw / maxScore) * 100 * 100) / 100;
  const wellbeingIndex = Math.max(0, Math.min(100, Math.round(100 - (raw / maxScore) * 100)));

  let severity_band;
  let severity_label;
  let severity;
  let likelihood;

  if (raw <= 4) {
    severity_band = 'healthy';
    severity_label = 'Minimal';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 9) {
    severity_band = 'mild';
    severity_label = 'Mild Depression';
    severity = 2;
    likelihood = 2;
  } else if (raw <= 14) {
    severity_band = 'moderate';
    severity_label = 'Moderate Depression';
    severity = 3;
    likelihood = 3;
  } else if (raw <= 19) {
    severity_band = 'severe';
    severity_label = 'Moderately Severe Depression';
    severity = 4;
    likelihood = 4;
  } else {
    severity_band = 'severe';
    severity_label = 'Severe Depression';
    severity = 5;
    likelihood = 5;
  }

  return {
    raw_score: raw,
    min_score: 0,
    max_score: maxScore,
    wellbeing_index: wellbeingIndex,
    severity_band,
    severity_label,
    dim_label: 'mood',
    composite_score: composite,
    likelihood,
    severity,
    dimension_scores: new Map([
      ['depression', composite],
      ['risk_mood', composite],
    ]),
  };
}

/**
 * Score GAD-7 (7 items, 0-3, total 0-21).
 * Standard bands (Spitzer et al.): 0-4 Minimal, 5-9 Mild, 10-14 Moderate, 15-21 Severe.
 */
function scoreGAD7(responses) {
  const raw = Math.max(0, Math.min(21, validateAndSumClinicalItems(responses, {
    instrument: 'GAD-7',
    expectedCount: 7,
    minVal: 0,
    maxVal: 3,
  })));
  const maxScore = 21;
  const composite = Math.round((raw / maxScore) * 100 * 100) / 100;
  const wellbeingIndex = Math.max(0, Math.min(100, Math.round(100 - (raw / maxScore) * 100)));

  let severity_band;
  let severity_label;
  let severity;
  let likelihood;

  if (raw <= 4) {
    severity_band = 'healthy';
    severity_label = 'Minimal';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 9) {
    severity_band = 'mild';
    severity_label = 'Mild Anxiety';
    severity = 2;
    likelihood = 2;
  } else if (raw <= 14) {
    severity_band = 'moderate';
    severity_label = 'Moderate Anxiety';
    severity = 3;
    likelihood = 3;
  } else {
    severity_band = 'severe';
    severity_label = 'Severe Anxiety';
    severity = raw <= 18 ? 4 : 5;
    likelihood = raw <= 18 ? 4 : 5;
  }

  return {
    raw_score: raw,
    min_score: 0,
    max_score: maxScore,
    wellbeing_index: wellbeingIndex,
    severity_band,
    severity_label,
    dim_label: 'calm',
    composite_score: composite,
    likelihood,
    severity,
    dimension_scores: new Map([
      ['anxiety', composite],
      ['risk_calm', composite],
    ]),
  };
}

/**
 * Score PSS-10 (10 items, 0-4, reverse items [3,4,6,7], total 0-40).
 * Standard bands (Cohen et al.): 0-13 Low Stress (healthy),
 * 14-26 Moderate Stress (moderate), 27-40 High Perceived Stress (severe).
 */
function scorePSS10(responses) {
  const raw = Math.max(0, Math.min(40, validateAndSumClinicalItems(responses, {
    instrument: 'PSS-10',
    expectedCount: 10,
    minVal: 0,
    maxVal: 4,
    reverseSet: PSS10_REVERSE_ITEMS,
    reverseBase: 4,
  })));
  const maxScore = 40;
  const composite = Math.round((raw / maxScore) * 100 * 100) / 100;
  const wellbeingIndex = Math.max(0, Math.min(100, Math.round(100 - (raw / maxScore) * 100)));

  let severity_band;
  let severity_label;
  let severity;
  let likelihood;

  if (raw <= 13) {
    severity_band = 'healthy';
    severity_label = 'Low Stress';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 26) {
    severity_band = 'moderate';
    severity_label = 'Moderate Stress';
    severity = 3;
    likelihood = 2 + Math.floor((raw - 14) / 7);
  } else {
    severity_band = 'severe';
    severity_label = 'High Perceived Stress';
    severity = 4 + (raw >= 34 ? 1 : 0);
    likelihood = 4 + (raw >= 34 ? 1 : 0);
  }

  return {
    raw_score: raw,
    min_score: 0,
    max_score: maxScore,
    wellbeing_index: wellbeingIndex,
    severity_band,
    severity_label,
    dim_label: 'stress',
    composite_score: composite,
    likelihood,
    severity,
    dimension_scores: new Map([
      ['perceived_stress', composite],
      ['risk_stress', composite],
    ]),
  };
}

/**
 * Score FAS-10 (10 items, 1-5, reverse items [3,9], total 10-50).
 * Standard bands (Michielsen & De Vries): 10-21 Not Fatigued (healthy),
 * 22-34 Mild-Moderate Fatigue (moderate), 35-50 Severe Fatigue (severe).
 */
function scoreFAS10(responses) {
  const raw = Math.max(10, Math.min(50, validateAndSumClinicalItems(responses, {
    instrument: 'FAS-10',
    expectedCount: 10,
    minVal: 1,
    maxVal: 5,
    reverseSet: FAS10_REVERSE_ITEMS,
    reverseBase: 6,
  })));
  const minScore = 10;
  const maxScore = 50;
  const span = maxScore - minScore;
  const composite = Math.round(((raw - minScore) / span) * 100 * 100) / 100;
  const wellbeingIndex = Math.max(0, Math.min(100, Math.round(100 - ((raw - minScore) / span) * 100)));

  let severity_band;
  let severity_label;
  let severity;
  let likelihood;

  if (raw <= 21) {
    severity_band = 'healthy';
    severity_label = 'Not Fatigued';
    severity = 1;
    likelihood = 1;
  } else if (raw <= 34) {
    severity_band = 'moderate';
    severity_label = 'Mild-Moderate Fatigue';
    severity = 3;
    likelihood = 2 + Math.floor((raw - 22) / 7);
  } else {
    severity_band = 'severe';
    severity_label = 'Severe Fatigue';
    severity = 4 + (raw >= 43 ? 1 : 0);
    likelihood = 4 + (raw >= 43 ? 1 : 0);
  }

  return {
    raw_score: raw,
    min_score: minScore,
    max_score: maxScore,
    wellbeing_index: wellbeingIndex,
    severity_band,
    severity_label,
    dim_label: 'energy',
    composite_score: composite,
    likelihood,
    severity,
    dimension_scores: new Map([
      ['fatigue', composite],
      ['risk_energy', composite],
    ]),
  };
}

/**
 * Dispatch scoring for clinical screening instruments (PHQ-9, GAD-7, PSS-10, FAS-10).
 * @param {string} surveyType
 * @param {Array} answers
 */
function scoreClinicalAssessment(surveyType, answers) {
  const norm = String(surveyType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (norm.includes('PHQ9')) return scorePHQ9(answers);
  if (norm.includes('GAD7')) return scoreGAD7(answers);
  if (norm.includes('PSS10')) return scorePSS10(answers);
  if (norm.includes('FAS10')) return scoreFAS10(answers);
  throw new Error(`Unsupported clinical survey type: ${surveyType}`);
}

/**
 * Reconstruct a legacy clinical raw score from a 0-100 wellbeing index.
 * Preserves the [min_score, max_score] domain for each instrument.
 * @param {string} surveyType
 * @param {number} overallIndex
 * @returns {number}
 */
function reconstructRawFromIndex(surveyType, overallIndex) {
  const idx = Math.max(0, Math.min(100, Number(overallIndex) || 0));
  const norm = String(surveyType || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (norm.includes('PHQ9')) return Math.max(0, Math.min(27, Math.round((1 - idx / 100) * 27)));
  if (norm.includes('GAD7')) return Math.max(0, Math.min(21, Math.round((1 - idx / 100) * 21)));
  if (norm.includes('PSS10')) return Math.max(0, Math.min(40, Math.round((1 - idx / 100) * 40)));
  if (norm.includes('FAS10')) return Math.max(10, Math.min(50, Math.round(10 + (1 - idx / 100) * 40)));
  return Math.round(idx);
}

/**
 * Extract canonical 0-100 risk scores (higher = more risk) across the 5 dashboard
 * pillars from any AnonHazardLog document, handling both canonical `risk_*` keys
 * and legacy module-specific keys.
 *
 * @param {object} log
 * @returns {{ mood: number|null, calm: number|null, stress: number|null, energy: number|null, work_fit: number|null }}
 */
function extractCanonicalRiskDimensions(log) {
  const out = { mood: null, calm: null, stress: null, energy: null, work_fit: null };
  if (!log || typeof log !== 'object') return out;

  const dims = log.dimension_scores;
  const readDim = (key) => {
    if (!dims) return undefined;
    if (dims instanceof Map) return dims.get(key);
    return dims[key];
  };
  const clampRisk = (val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    if (!Number.isFinite(num)) return null;
    return Math.max(0, Math.min(100, Math.round(num * 100) / 100));
  };

  for (const pillar of ['mood', 'calm', 'stress', 'energy', 'work_fit']) {
    const explicit = clampRisk(readDim(`risk_${pillar}`));
    if (explicit !== null) out[pillar] = explicit;
  }

  const normType = String(log.survey_type || '').toLowerCase();
  const compositeRisk = clampRisk(log.composite_score);

  if (normType.includes('phq9') && out.mood === null) {
    out.mood = clampRisk(readDim('depression')) ?? compositeRisk;
  } else if (normType.includes('gad7') && out.calm === null) {
    out.calm = clampRisk(readDim('anxiety')) ?? compositeRisk;
  } else if (normType.includes('pss10') && out.stress === null) {
    out.stress = clampRisk(readDim('perceived_stress')) ?? compositeRisk;
  } else if (normType.includes('fas10') && out.energy === null) {
    out.energy = clampRisk(readDim('fatigue')) ?? compositeRisk;
  } else if (normType.includes('copsoq') && out.work_fit === null) {
    out.work_fit = compositeRisk;
  } else if (normType === 'daily_pulse' || normType === 'checkin_slider') {
    for (const pillar of ['mood', 'calm', 'stress', 'energy', 'work_fit']) {
      if (out[pillar] === null) {
        const wellbeing = clampRisk(readDim(pillar));
        if (wellbeing !== null) {
          out[pillar] = clampRisk(100 - wellbeing);
        }
      }
    }
  }

  return out;
}

module.exports = {
  ClinicalValidationError,
  PSS10_REVERSE_ITEMS,
  FAS10_REVERSE_ITEMS,
  getIsoWeekNumber,
  roundPercentagesLargestRemainder,
  normalizeDailyPulseRating,
  classifyDailyPulse,
  extractCanonicalRiskDimensions,
  scorePHQ9,
  scoreGAD7,
  scorePSS10,
  scoreFAS10,
  scoreClinicalAssessment,
  reconstructRawFromIndex,
};
