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

  describe('Industry-Standard Clinical Cutoffs & Severity Bands', () => {
    const cs = require('../utils/clinicalScoring');

    const makeAnswers = (len, sumTarget, maxPerItem, fixedIndices = {}) => {
      const vals = new Array(len).fill(0);
      let remaining = sumTarget;
      Object.entries(fixedIndices).forEach(([idx, val]) => {
        vals[Number(idx)] = val;
        remaining -= val;
      });
      for (let i = 0; i < len && remaining > 0; i++) {
        if (Object.prototype.hasOwnProperty.call(fixedIndices, i)) continue;
        const take = Math.min(maxPerItem, remaining);
        vals[i] = take;
        remaining -= take;
      }
      return vals.map((value, question_index) => ({ question_index, value }));
    };

    it('enforces exact PHQ-9 boundaries (0/4/5/9/10/14/15/19/20/27) and Item 9 crisis flag', () => {
      const expected = [
        [0, 'healthy', 'Minimal'], [4, 'healthy', 'Minimal'],
        [5, 'mild', 'Mild Depression'], [9, 'mild', 'Mild Depression'],
        [10, 'moderate', 'Moderate Depression'], [14, 'moderate', 'Moderate Depression'],
        [15, 'severe', 'Moderately Severe Depression'], [19, 'severe', 'Moderately Severe Depression'],
        [20, 'severe', 'Severe Depression'], [27, 'severe', 'Severe Depression'],
      ];
      for (const [sum, band, label] of expected) {
        const res = cs.scorePHQ9(makeAnswers(9, sum, 3, sum > 24 ? {} : { 8: 0 }));
        expect(res.raw_score).toBe(sum);
        expect(res.severity_band).toBe(band);
        expect(res.severity_label).toBe(label);
      }

      const lowWithQ9 = cs.scorePHQ9(makeAnswers(9, 1, 3, { 8: 1 }));
      expect(lowWithQ9.raw_score).toBe(1);
      expect(lowWithQ9.wellbeing_index).toBe(Math.round(100 - (1 / 27) * 100));
    });

    it('enforces exact GAD-7 boundaries (0/4/5/9/10/14/15/21)', () => {
      const expected = [
        [0, 'healthy'], [4, 'healthy'],
        [5, 'mild'], [9, 'mild'],
        [10, 'moderate'], [14, 'moderate'],
        [15, 'severe'], [21, 'severe'],
      ];
      for (const [sum, band] of expected) {
        const res = cs.scoreGAD7(makeAnswers(7, sum, 3));
        expect(res.raw_score).toBe(sum);
        expect(res.severity_band).toBe(band);
      }
    });

    it('enforces exact PSS-10 boundaries with reverse items [3,4,6,7] (13=healthy, 14..26=moderate, 27..40=severe)', () => {
      const makePss = (rawSum) => {
        const scores = new Array(10).fill(0);
        let rem = rawSum;
        for (let i = 0; i < 10 && rem > 0; i++) {
          const take = Math.min(4, rem);
          scores[i] = take;
          rem -= take;
        }
        return scores.map((s, i) => ({
          question_index: i,
          value: cs.PSS10_REVERSE_ITEMS.has(i) ? (4 - s) : s,
        }));
      };

      expect(cs.scorePSS10(makePss(0)).severity_band).toBe('healthy');
      expect(cs.scorePSS10(makePss(13)).severity_band).toBe('healthy');
      expect(cs.scorePSS10(makePss(14)).severity_band).toBe('moderate');
      expect(cs.scorePSS10(makePss(26)).severity_band).toBe('moderate');
      expect(cs.scorePSS10(makePss(27)).severity_band).toBe('severe');
      expect(cs.scorePSS10(makePss(40)).severity_band).toBe('severe');
    });

    it('enforces exact FAS-10 boundaries with reverse items [3,9] (10..21=healthy, 22..34=moderate, 35..50=severe)', () => {
      const makeFas = (rawSum) => {
        const itemScores = new Array(10).fill(1);
        let rem = rawSum - 10;
        for (let i = 0; i < 10 && rem > 0; i++) {
          const take = Math.min(4, rem);
          itemScores[i] += take;
          rem -= take;
        }
        return itemScores.map((s, i) => ({
          question_index: i,
          value: cs.FAS10_REVERSE_ITEMS.has(i) ? (6 - s) : s,
        }));
      };

      expect(cs.scoreFAS10(makeFas(10)).severity_band).toBe('healthy');
      expect(cs.scoreFAS10(makeFas(21)).severity_band).toBe('healthy');
      expect(cs.scoreFAS10(makeFas(22)).severity_band).toBe('moderate');
      expect(cs.scoreFAS10(makeFas(34)).severity_band).toBe('moderate');
      expect(cs.scoreFAS10(makeFas(35)).severity_band).toBe('severe');
      expect(cs.scoreFAS10(makeFas(50)).severity_band).toBe('severe');
    });

    it('reconstructs legacy raw clinical totals accurately from 0-100 wellbeing index', () => {
      expect(cs.reconstructRawFromIndex('phq9', 100)).toBe(0);
      expect(cs.reconstructRawFromIndex('phq9', 0)).toBe(27);
      expect(cs.reconstructRawFromIndex('gad7', 100)).toBe(0);
      expect(cs.reconstructRawFromIndex('gad7', 0)).toBe(21);
      expect(cs.reconstructRawFromIndex('pss10', 65)).toBe(14);
      expect(cs.reconstructRawFromIndex('fas10', 100)).toBe(10);
      expect(cs.reconstructRawFromIndex('fas10', 70)).toBe(22);
      expect(cs.reconstructRawFromIndex('fas10', 0)).toBe(50);
    });

    it('normalizes Daily Pulse 1-5 Likert linearly onto 0-100, classifies severity, derives ISO week, and rounds via Largest Remainder', () => {
      expect(cs.normalizeDailyPulseRating(1)).toBe(0);
      expect(cs.normalizeDailyPulseRating(2)).toBe(25);
      expect(cs.normalizeDailyPulseRating(3)).toBe(50);
      expect(cs.normalizeDailyPulseRating(4)).toBe(75);
      expect(cs.normalizeDailyPulseRating(5)).toBe(100);

      expect(cs.classifyDailyPulse(100).severity_band).toBe('healthy');
      expect(cs.classifyDailyPulse(60).severity_band).toBe('mild');
      expect(cs.classifyDailyPulse(40).severity_band).toBe('moderate');
      expect(cs.classifyDailyPulse(20).severity_band).toBe('severe');

      expect(cs.getIsoWeekNumber(new Date('2026-01-01T12:00:00Z'))).toBe(1);
      expect(cs.getIsoWeekNumber(new Date('2026-12-31T12:00:00Z'))).toBe(53);

      const equalThree = cs.roundPercentagesLargestRemainder({ a: 1, b: 1, c: 1, d: 0 }, ['a', 'b', 'c', 'd']);
      expect(equalThree.d).toBe(0);
      expect(equalThree.a + equalThree.b + equalThree.c + equalThree.d).toBe(100);
    });

    it('computes accurate clinical bands, COPSOQ-III Core 4 ISO areas, and partial-module Overall average in AssessmentReportPdf', () => {
      const path = require('path');
      if (typeof global.window === 'undefined') global.window = global;
      require(path.resolve(__dirname, '../../public/js/data.js'));
      global.HavilahPdfConfig = require(path.resolve(__dirname, '../../public/js/pdf/pdfConfig.js'));
      global.HavilahPdfFonts = {};
      global.HavilahPdfComponents = {};
      const AssessmentReportPdf = require(path.resolve(__dirname, '../../public/js/assessmentReportPdf.js'));

      const pssMod = AssessmentReportPdf.resolveAssessmentData({ surveyType: 'pss10', rawScore: 14 });
      expect(pssMod.band.label).toBe('Moderate stress');

      const fasMod = AssessmentReportPdf.resolveAssessmentData({ surveyType: 'fas10', rawScore: 22 });
      expect(fasMod.band.label).toBe('Moderate fatigue');

      const copsoqMod = AssessmentReportPdf.resolveAssessmentData({
        surveyType: 'copsoq3_core',
        answers: new Array(32).fill(50),
      });
      expect(copsoqMod.wellbeingScore).toBe(50);
      expect(copsoqMod.rows).toHaveLength(4);
      expect(copsoqMod.rows.every((r) => r.scoreText === '50/100')).toBe(true);

      const overallPartial = AssessmentReportPdf.resolveAssessmentData({
        surveyType: 'overall',
        moduleScores: { phq9: 90, gad7: 60, pss10: 60 },
      });
      expect(overallPartial.wellbeingScore).toBe(70);
      expect(overallPartial.hero.secondaryValue).toBe('3 of 5 modules completed');
      const uncompleted = overallPartial.sortedPillars.filter((p) => p.score === null);
      expect(uncompleted).toHaveLength(2);
    });
  });
});
