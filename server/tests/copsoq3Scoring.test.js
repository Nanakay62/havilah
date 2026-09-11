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
});
