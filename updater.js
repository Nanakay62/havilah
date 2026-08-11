const fs = require('fs');
const parsed = require('./parsed_copsoq.json');
const mappings = `
  var COPSOQ3_CORE_MAPPINGS = {
    1: { 'Always': 100, 'Often': 75, 'Sometimes': 50, 'Seldom': 25, 'Never/hardly ever': 0 },
    11: { 'Always': 100, 'Often': 75, 'Sometimes': 50, 'Seldom': 25, 'Never/hardly ever': 0 },
    '1R': { 'Always': 0, 'Often': 25, 'Sometimes': 50, 'Seldom': 75, 'Never/hardly ever': 100 },
    2: { 'To a very large extent': 100, 'To a large extent': 75, 'Somewhat': 50, 'To a small extent': 25, 'To a very small extent': 0 },
    21: { 'To a very large extent': 100, 'To a large extent': 75, 'Somewhat': 50, 'To a small extent': 25, 'To a very small extent': 0 },
    '2R': { 'To a very large extent': 0, 'To a large extent': 25, 'Somewhat': 50, 'To a small extent': 75, 'To a very small extent': 100 },
    3: { 'Never': 0, 'Seldom': 25, 'Sometimes': 50, 'Often': 75, 'Always': 100 },
    4: { 'Yes, daily': 100, 'Yes, weekly': 75, 'Yes, monthly': 50, 'Yes, a few times': 25, 'No': 0 },
    '5M': { 'Colleagues': 1, 'Manager/superior': 1, 'Subordinates': 1, 'Clients/customers/patients': 1 },
    6: { 'Very satisfied': 100, 'Satisfied': 75, 'Neither/Nor': 50, 'Unsatisfied': 25, 'Very unsatisfied': 0 },
    7: { 'Excellent': 100, 'Very good': 75, 'Good': 50, 'Fair': 25, 'Poor': 0 },
    8: { '10': 100, '9': 90, '8': 80, '7': 70, '6': 60, '5': 50, '4': 40, '3': 30, '2': 20, '1': 10, '0': 0 },
    9: { 'All the time': 100, 'A large part of the time': 75, 'Part of the time': 50, 'A small part of the time': 25, 'Not at all': 0 },
    10: { 'Fits perfectly': 100, 'Fits quite well': 75, 'Fits partly': 50, 'Fits poorly': 25, 'Does not fit': 0 },
    '1sec': { 'Always': 100, 'Often': 75, 'Sometimes': 50, 'Seldom': 25, 'Never/hardly ever': 0, 'Not relevant': -1 }
  };
`;
let dataJs = fs.readFileSync('./js/data.js', 'utf8');
const copsoqBaseStr = `  var copsoq3_core = {
    id: 'copsoq3_core', code: 'COPSOQ-III', name: 'Work environment',
    description: 'Copenhagen Psychosocial Questionnaire III - Core Version.',
    estimatedMinutes: 5, dimension: 'workfit',
    dimensions: ['QD','WP','CD','ED','HE','IN','PD','VA','CT','MW','PR','RE','CL','CO','IT','QL','SS','SC','SW','CW','WE','JI','IW','QW','JS','WF','TE','TM','JU','GS','CQ','UT','HSM','SH','TV','PV','BU','GH','SL','BO','ST','SO','CS','DS','SE'],
    dimensionLabels: {
      QD: 'Quantitative Demands', WP: 'Work Pace', CD: 'Cognitive Demands', ED: 'Emotional Demands',
      HE: 'Demands for Hiding Emotions', IN: 'Influence at Work', PD: 'Possibilities for Development',
      VA: 'Variation of Work', CT: 'Control over Working Time', MW: 'Meaning of Work', PR: 'Predictability',
      RE: 'Recognition', CL: 'Role Clarity', CO: 'Role Conflicts', IT: 'Illegitimate Tasks',
      QL: 'Quality of Leadership', SS: 'Social Support from Supervisor', SC: 'Social Support from Colleagues',
      SW: 'Sense of Community at Work', CW: 'Commitment to the Workplace', WE: 'Work Engagement',
      JI: 'Job Insecurity', IW: 'Insecurity over Working Conditions', QW: 'Quality of Work',
      JS: 'Job Satisfaction', WF: 'Work Life Conflict', TE: 'Horizontal Trust', TM: 'Vertical Trust',
      JU: 'Organizational Justice', GS: 'Gossip and Slander', CQ: 'Conflicts and Quarrels',
      UT: 'Unpleasant Teasing', HSM: 'Cyber Bullying', SH: 'Sexual Harassment', TV: 'Threats of Violence',
      PV: 'Physical Violence', BU: 'Bullying', GH: 'Self Rated Health', SL: 'Sleeping Troubles',
      BO: 'Burnout', ST: 'Stress', SO: 'Somatic Stress', CS: 'Cognitive Stress', DS: 'Depressive Symptoms', SE: 'Self-Efficacy'
    },
    questions: ${JSON.stringify(parsed.core)}, mappings: COPSOQ3_CORE_MAPPINGS, maxScore: 100,
    severity: function (score) {
      if (score <= 25) return { band: 'low_risk', label: 'Low psychosocial risk', color: '#4FB286' };
      if (score <= 50) return { band: 'moderate_risk', label: 'Moderate psychosocial risk', color: '#7DBE8B' };
      if (score <= 75) return { band: 'high_risk', label: 'High psychosocial risk', color: '#E8A33D' };
      return { band: 'very_high_risk', label: 'Very high psychosocial risk', color: '#B23A48' };
    },
    score: function (responses) {
      var sum = 0, count = 0;
      for (var i = 0; i < responses.length; i++) {
        if (responses[i] !== undefined && responses[i] >= 0) {
          sum += responses[i]; count++;
        }
      }
      return count > 0 ? Math.round(sum / count) : 0;
    },
    scoreDimensions: function (responses) {
      var dimScores = {}; var dims = this.dimensions;
      for (var d = 0; d < dims.length; d++) {
        var dimName = dims[d]; var items = [];
        for (var q = 0; q < this.questions.length; q++) {
          if (this.questions[q].dim === dimName) {
            var val = responses[q];
            if (val !== undefined && val >= 0) items.push(val);
          }
        }
        var sum = 0;
        for (var k = 0; k < items.length; k++) sum += items[k];
        dimScores[dimName] = items.length > 0 ? Math.round(sum / items.length) : 0;
      }
      return dimScores;
    }
  };
  var copsoq3_middle = Object.assign({}, copsoq3_core, { id: 'copsoq3_middle', name: 'Work environment (Middle)', estimatedMinutes: 10, questions: ${JSON.stringify(parsed.middle)} });
  var copsoq3_long = Object.assign({}, copsoq3_core, { id: 'copsoq3_long', name: 'Work environment (Long)', estimatedMinutes: 15, questions: ${JSON.stringify(parsed.long)} });
`;
dataJs = dataJs.split('var copsoq3_core = {')[0] + mappings + '\n' + copsoqBaseStr;
fs.writeFileSync('./js/data.js', dataJs);

let dashboardHtml = fs.readFileSync('./private/app/dashboard.html', 'utf8');
const dashRepl = `    copsoq3_core: {
      code: 'COPSOQ-III (Core)', title: 'Work environment (Short)',
      questions: ${JSON.stringify(parsed.core)}
    },
    copsoq3_middle: {
      code: 'COPSOQ-III (Middle)', title: 'Work environment (Medium)',
      questions: ${JSON.stringify(parsed.middle)}
    },
    copsoq3_long: {
      code: 'COPSOQ-III (Long)', title: 'Work environment (Long)',
      questions: ${JSON.stringify(parsed.long)}
    }`;
dashboardHtml = dashboardHtml.split('copsoq3_core: {')[0] + dashRepl + '\n    }' + dashboardHtml.split('copsoq3_long: {')[1].substring(dashboardHtml.split('copsoq3_long: {')[1].indexOf('}') + 1);
dashboardHtml = dashboardHtml.replace(/const surveyOptions = \[[\\s\\S]*?\];/g, `const surveyOptions = [
    { text: 'Not at all', value: 0 },
    { text: 'Several days', value: 1 },
    { text: 'More than half the days', value: 2 },
    { text: 'Nearly every day', value: 3 }
  ];
${mappings}
`);
fs.writeFileSync('./private/app/dashboard.html', dashboardHtml);
console.log('Update successful');
