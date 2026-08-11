'use strict';

const { scoreCOPSOQ3 } = require('../server/utils/copsoq3Scoring');

const responses = [
  // Quantitative Demands (1 is desc, 1R is asc)
  { item_code: 'QD1', value: 0 }, // 'Always' -> index 0 on desc is 100
  { item_code: 'QD2', value: 1 }, // 'Often' -> index 1 on desc is 75
  { item_code: 'QD3', value: 2 }, // 'Sometimes' -> index 2 on desc is 50
  { item_code: 'QD4', value: 0 }, // 'Always' on 1R (asc) -> index 0 is 0
  
  // Work Pace (All desc)
  { item_code: 'WP1', value: 4 }, // 'Never' -> index 4 on desc is 0
  { item_code: 'WP2', value: 4 }, // 0
  { item_code: 'WP3', value: 4 }, // 0
];

const result = scoreCOPSOQ3(responses);
result.dimension_scores = Object.fromEntries(result.dimension_scores);
console.log("Scoring Result:", JSON.stringify(result, null, 2));
