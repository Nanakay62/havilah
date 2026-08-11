'use strict';

const { generateInsights } = require('../server/services/correlationEngine');

const aggregateMetrics = {
  phq9: { count: 12, avg_composite_score: 11.2 },
  pss10: { count: 12, avg_composite_score: 28 },
  copsoq3_middle: { 
    count: 15, 
    avg_dimension_scores: { 
      'Meaning of Work': 45, 
      'Recognition': 30, 
      'Role Conflicts': 80,
      'Quantitative Demands': 85,
      'Influence at Work': 40,
      'Work Pace': 90
    } 
  }
};

const insights = generateInsights(aggregateMetrics);
console.log("Insights generated:");
console.log(JSON.stringify(insights, null, 2));
