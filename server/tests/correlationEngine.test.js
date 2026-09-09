'use strict';

import { describe, it, expect } from 'vitest';
const correlationEngine = require('../services/correlationEngine');

describe('Statistical Pearson Correlation Engine', () => {
  it('computes exact positive correlation (r = 1.0) for identical proportional series', () => {
    const x = [10, 20, 30, 40, 50];
    const y = [20, 40, 60, 80, 100];
    const result = correlationEngine.pearsonCorrelation(x, y);
    expect(result).not.toBeNull();
    expect(result.r).toBe(1);
    expect(result.strength).toBe('Strong');
    expect(result.direction).toBe('Positive');
    expect(result.sampleSize).toBe(5);
  });

  it('computes exact negative correlation (r = -1.0) for inverted series', () => {
    const x = [10, 20, 30, 40, 50];
    const y = [100, 80, 60, 40, 20];
    const result = correlationEngine.pearsonCorrelation(x, y);
    expect(result).not.toBeNull();
    expect(result.r).toBe(-1);
    expect(result.strength).toBe('Strong');
    expect(result.direction).toBe('Inverse');
    expect(result.sampleSize).toBe(5);
  });

  it('returns null when sample size is insufficient (N < 5)', () => {
    const x = [10, 20, 30];
    const y = [20, 40, 60];
    const result = correlationEngine.pearsonCorrelation(x, y);
    expect(result).toBeNull();
  });

  it('returns r = 0 with strength None when variance is zero (constant values)', () => {
    const x = [50, 50, 50, 50, 50];
    const y = [20, 40, 60, 80, 100];
    const result = correlationEngine.pearsonCorrelation(x, y);
    expect(result).not.toBeNull();
    expect(result.r).toBe(0);
    expect(result.strength).toBe('None');
    expect(result.direction).toBe('Neutral');
  });

  it('suppresses empirical correlations when sample size N < 5 for privacy preservation', () => {
    const pairedData = {
      workload: {
        copsoqScores: [80, 85, 90],
        clinicalScores: [75, 80, 85],
        surveyType: 'phq9'
      }
    };
    const results = correlationEngine.computeEmpiricalCorrelations(pairedData);
    expect(results).toHaveLength(0);
  });

  it('computes valid empirical correlations when sample size N >= 5', () => {
    const pairedData = {
      workload: {
        copsoqScores: [80, 60, 90, 40, 70, 50],
        clinicalScores: [75, 55, 88, 35, 68, 48],
        surveyType: 'phq9'
      }
    };
    const results = correlationEngine.computeEmpiricalCorrelations(pairedData);
    expect(results.length).toBe(1);
    expect(results[0].dimension).toBe('workload');
    expect(results[0].correlation_coefficient).toBeGreaterThan(0.9);
    expect(results[0].sample_size).toBe(6);
    expect(results[0].iso_control_recommendation).toBeDefined();
    expect(results[0].iso_control_recommendation.control_id).toBe('JDM-01');
  });

  it('returns appropriate ISO 45003 control recommendations for hazard dimensions', () => {
    const rec1 = correlationEngine.getIsoControlRecommendation('quantitative_demands', 0.8);
    expect(rec1.control_id).toBe('JDM-01');
    expect(rec1.category).toBe('Primary Control');

    const rec2 = correlationEngine.getIsoControlRecommendation('autonomy', -0.6);
    expect(rec2.control_id).toBe('JCT-01');
    expect(rec2.category).toBe('Primary Control');

    const rec3 = correlationEngine.getIsoControlRecommendation('unrecognized_dimension', 0.5);
    expect(rec3.control_id).toBe('GEN-01');
    expect(rec3.category).toBe('Secondary Control');
  });
});
