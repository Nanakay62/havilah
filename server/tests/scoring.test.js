'use strict';

const { scorePHQ9, scoreGAD7, scorePSS10, scoreFAS10 } = require('../controllers/hazardController');

describe('Clinical Screener Scoring Implementations', () => {
  describe('PHQ-9 (Depression Screener)', () => {
    it('scores minimal/healthy depression correctly (score 0-4)', () => {
      const responses = Array.from({ length: 9 }, (_, i) => ({ question_index: i, value: 0 }));
      const result = scorePHQ9(responses);

      expect(result.raw_score).toBe(0);
      expect(result.composite_score).toBe(0);
      expect(result.severity_band).toBe('healthy');
      expect(result.likelihood).toBe(1);
      expect(result.severity).toBe(1);
    });

    it('scores mild depression correctly (score 5-9)', () => {
      const responses = [
        { question_index: 0, value: 2 },
        { question_index: 1, value: 2 },
        { question_index: 2, value: 2 },
        ...Array.from({ length: 6 }, (_, i) => ({ question_index: i + 3, value: 0 }))
      ];
      const result = scorePHQ9(responses);

      expect(result.raw_score).toBe(6);
      expect(result.severity_band).toBe('mild');
      expect(result.severity).toBe(2);
    });

    it('scores moderate depression correctly (score 10-14)', () => {
      const responses = Array.from({ length: 9 }, (_, i) => ({ question_index: i, value: i < 6 ? 2 : 0 }));
      const result = scorePHQ9(responses);

      expect(result.raw_score).toBe(12);
      expect(result.severity_band).toBe('moderate');
      expect(result.severity).toBe(3);
    });

    it('scores severe depression correctly (score 15-27)', () => {
      const responses = Array.from({ length: 9 }, (_, i) => ({ question_index: i, value: 3 }));
      const result = scorePHQ9(responses);

      expect(result.raw_score).toBe(27);
      expect(result.composite_score).toBe(100);
      expect(result.severity_band).toBe('severe');
      expect(result.severity).toBe(5);
    });
  });

  describe('GAD-7 (Anxiety Screener)', () => {
    it('scores healthy anxiety band (0-4)', () => {
      const responses = Array.from({ length: 7 }, (_, i) => ({ question_index: i, value: 0 }));
      const result = scoreGAD7(responses);

      expect(result.raw_score).toBe(0);
      expect(result.severity_band).toBe('healthy');
    });

    it('scores severe anxiety band (15+)', () => {
      const responses = Array.from({ length: 7 }, (_, i) => ({ question_index: i, value: 3 }));
      const result = scoreGAD7(responses);

      expect(result.raw_score).toBe(21);
      expect(result.composite_score).toBe(100);
      expect(result.severity_band).toBe('severe');
      expect(result.severity).toBe(5);
    });
  });

  describe('PSS-10 (Perceived Stress Scale with reverse items)', () => {
    it('correctly reverse-scores items 3, 4, 6, 7', () => {
      // If user answers 4 to reverse items, their contribution is 4 - 4 = 0
      // If user answers 0 to direct items, their contribution is 0
      const responses = Array.from({ length: 10 }, (_, i) => ({
        question_index: i,
        value: [3, 4, 6, 7].includes(i) ? 4 : 0
      }));

      const result = scorePSS10(responses);
      expect(result.raw_score).toBe(0);
      expect(result.severity_band).toBe('healthy');
    });

    it('scores high stress when non-reversed items are high and reversed items are low', () => {
      // Answering 4 on non-reversed items (6 items * 4 = 24)
      // Answering 0 on reversed items (4 - 0 = 4; 4 items * 4 = 16)
      // Total = 40 (max stress)
      const responses = Array.from({ length: 10 }, (_, i) => ({
        question_index: i,
        value: [3, 4, 6, 7].includes(i) ? 0 : 4
      }));

      const result = scorePSS10(responses);
      expect(result.raw_score).toBe(40);
      expect(result.severity_band).toBe('severe');
    });
  });

  describe('FAS-10 (Fatigue Assessment Scale with reverse items)', () => {
    it('correctly calculates fatigue score and reverse-scores items 3, 9', () => {
      // 10 items scored 1-5.
      // If low fatigue: direct items = 1, reverse items = 5 (6 - 5 = 1) -> sum = 10 (lowest possible fatigue)
      const responses = Array.from({ length: 10 }, (_, i) => ({
        question_index: i,
        value: [3, 9].includes(i) ? 5 : 1
      }));

      const result = scoreFAS10(responses);
      expect(result.raw_score).toBe(10);
      expect(result.severity_band).toBe('healthy');
    });
  });
});
