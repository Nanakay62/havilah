/**
 * @fileoverview Havilah Platform - Survey Instrument Data & Reference Constants
 * Contains all validated psychometric instruments, crisis detection patterns,
 * ISO 45003 controls, emergency resources, legal content, and dimension mappings.
 * @version 2.0.0
 */

'use strict';

/** @type {Object} Global data namespace */
var WF_DATA = (function () {

  /* ──────────────────────────────────────────────
   *  PHQ-9 - Patient Health Questionnaire
   * ────────────────────────────────────────────── */

  /** @type {Object} */
  var phq9 = {
    id: 'phq9',
    code: 'PHQ-9',
    name: 'Depression self-check',
    description: 'Nine questions on mood, motivation, and energy over the past two weeks.',
    estimatedMinutes: 3,
    dimension: 'mood',
    questions: [
      { id: 'phq9_q1', text: 'Little interest or pleasure in doing things' },
      { id: 'phq9_q2', text: 'Feeling down, depressed, or hopeless' },
      { id: 'phq9_q3', text: 'Trouble falling or staying asleep, or sleeping too much' },
      { id: 'phq9_q4', text: 'Feeling tired or having little energy' },
      { id: 'phq9_q5', text: 'Poor appetite or overeating' },
      { id: 'phq9_q6', text: 'Feeling bad about yourself - or that you are a failure or have let yourself or your family down' },
      { id: 'phq9_q7', text: 'Trouble concentrating on things, such as reading the newspaper or watching television' },
      { id: 'phq9_q8', text: 'Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual' },
      { id: 'phq9_q9', text: 'Thoughts that you would be better off dead, or of hurting yourself in some way' }
    ],
    options: [
      { text: 'Not at all', value: 0 },
      { text: 'Several days', value: 1 },
      { text: 'More than half the days', value: 2 },
      { text: 'Nearly every day', value: 3 }
    ],
    maxScore: 27,
    /** @param {number} score */
    severity: function (score) {
      if (score <= 4) return { band: 'minimal', label: 'Minimal', color: '#4FB286' };
      if (score <= 9) return { band: 'mild', label: 'Mild', color: '#7DBE8B' };
      if (score <= 14) return { band: 'moderate', label: 'Moderate', color: '#E8A33D' };
      if (score <= 19) return { band: 'moderately_severe', label: 'Moderately severe', color: '#E5646E' };
      return { band: 'severe', label: 'Severe', color: '#B23A48' };
    },
    /** @param {number[]} responses */
    score: function (responses) {
      var total = 0;
      for (var i = 0; i < responses.length; i++) total += responses[i];
      return total;
    }
  };

  /* ──────────────────────────────────────────────
   *  GAD-7 - Generalized Anxiety Disorder
   * ────────────────────────────────────────────── */

  /** @type {Object} */
  var gad7 = {
    id: 'gad7',
    code: 'GAD-7',
    name: 'Anxiety self-check',
    description: 'Seven questions on nervousness, worry, and restlessness over the past two weeks.',
    estimatedMinutes: 2,
    dimension: 'calm',
    questions: [
      { id: 'gad7_q1', text: 'Feeling nervous, anxious, or on edge' },
      { id: 'gad7_q2', text: 'Not being able to stop or control worrying' },
      { id: 'gad7_q3', text: 'Worrying too much about different things' },
      { id: 'gad7_q4', text: 'Trouble relaxing' },
      { id: 'gad7_q5', text: 'Being so restless that it\'s hard to sit still' },
      { id: 'gad7_q6', text: 'Becoming easily annoyed or irritable' },
      { id: 'gad7_q7', text: 'Feeling afraid, as if something awful might happen' }
    ],
    options: [
      { text: 'Not at all', value: 0 },
      { text: 'Several days', value: 1 },
      { text: 'More than half the days', value: 2 },
      { text: 'Nearly every day', value: 3 }
    ],
    maxScore: 21,
    severity: function (score) {
      if (score <= 4) return { band: 'minimal', label: 'Minimal', color: '#4FB286' };
      if (score <= 9) return { band: 'mild', label: 'Mild', color: '#7DBE8B' };
      if (score <= 14) return { band: 'moderate', label: 'Moderate', color: '#E8A33D' };
      return { band: 'severe', label: 'Severe', color: '#B23A48' };
    },
    score: function (responses) {
      var total = 0;
      for (var i = 0; i < responses.length; i++) total += responses[i];
      return total;
    }
  };

  /* ──────────────────────────────────────────────
   *  PSS-10 - Perceived Stress Scale
   * ────────────────────────────────────────────── */

  /** @type {Object} */
  var pss10 = {
    id: 'pss10',
    code: 'PSS-10',
    name: 'Perceived stress scale',
    description: 'Ten questions on how unpredictable, uncontrollable, and overloaded life feels.',
    estimatedMinutes: 4,
    dimension: 'stress',
    reverseItems: [3, 4, 6, 7], // 0-indexed: questions 4, 5, 7, 8
    questions: [
      { id: 'pss10_q1', text: 'In the last month, how often have you been upset because of something that happened unexpectedly?' },
      { id: 'pss10_q2', text: 'In the last month, how often have you felt that you were unable to control the important things in your life?' },
      { id: 'pss10_q3', text: 'In the last month, how often have you felt nervous and stressed?' },
      { id: 'pss10_q4', text: 'In the last month, how often have you felt confident about your ability to handle your personal problems?', reverse: true },
      { id: 'pss10_q5', text: 'In the last month, how often have you felt that things were going your way?', reverse: true },
      { id: 'pss10_q6', text: 'In the last month, how often have you found that you could not cope with all the things that you had to do?' },
      { id: 'pss10_q7', text: 'In the last month, how often have you been able to control irritations in your life?', reverse: true },
      { id: 'pss10_q8', text: 'In the last month, how often have you felt that you were on top of things?', reverse: true },
      { id: 'pss10_q9', text: 'In the last month, how often have you been angered because of things that were outside of your control?' },
      { id: 'pss10_q10', text: 'In the last month, how often have you felt difficulties were piling up so high that you could not overcome them?' }
    ],
    options: [
      { text: 'Never', value: 0 },
      { text: 'Almost never', value: 1 },
      { text: 'Sometimes', value: 2 },
      { text: 'Fairly often', value: 3 },
      { text: 'Very often', value: 4 }
    ],
    maxScore: 40,
    severity: function (score) {
      if (score <= 13) return { band: 'low', label: 'Low stress', color: '#4FB286' };
      if (score <= 26) return { band: 'moderate', label: 'Moderate stress', color: '#E8A33D' };
      return { band: 'high', label: 'High perceived stress', color: '#B23A48' };
    },
    score: function (responses) {
      var total = 0;
      var rev = [3, 4, 6, 7];
      for (var i = 0; i < responses.length; i++) {
        if (rev.indexOf(i) !== -1) {
          total += (4 - responses[i]);
        } else {
          total += responses[i];
        }
      }
      return total;
    }
  };

  /* ──────────────────────────────────────────────
   *  FAS-10 - Fatigue Assessment Scale
   * ────────────────────────────────────────────── */

  /** @type {Object} */
  var fas10 = {
    id: 'fas10',
    code: 'FAS-10',
    name: 'Fatigue assessment',
    description: 'Ten questions on physical and mental fatigue, and their impact on daily function.',
    estimatedMinutes: 4,
    dimension: 'energy',
    reverseItems: [3, 9], // 0-indexed: questions 4, 10
    questions: [
      { id: 'fas10_q1', text: 'I am bothered by fatigue' },
      { id: 'fas10_q2', text: 'I get tired very quickly' },
      { id: 'fas10_q3', text: 'I don\'t do much during the day' },
      { id: 'fas10_q4', text: 'I have enough energy for everyday life', reverse: true },
      { id: 'fas10_q5', text: 'Physically, I feel exhausted' },
      { id: 'fas10_q6', text: 'I have problems starting things' },
      { id: 'fas10_q7', text: 'I have problems thinking clearly' },
      { id: 'fas10_q8', text: 'I feel no desire to do anything' },
      { id: 'fas10_q9', text: 'Mentally, I feel exhausted' },
      { id: 'fas10_q10', text: 'When I am doing something, I can concentrate quite well', reverse: true }
    ],
    options: [
      { text: 'Never', value: 1 },
      { text: 'Sometimes', value: 2 },
      { text: 'Regularly', value: 3 },
      { text: 'Often', value: 4 },
      { text: 'Always', value: 5 }
    ],
    maxScore: 50,
    severity: function (score) {
      if (score <= 21) return { band: 'no_fatigue', label: 'Not fatigued', color: '#4FB286' };
      if (score <= 34) return { band: 'mild_moderate', label: 'Mild-Moderate', color: '#E8A33D' };
      return { band: 'severe', label: 'Severe', color: '#B23A48' };
    },
    score: function (responses) {
      var total = 0;
      var rev = [3, 9];
      for (var i = 0; i < responses.length; i++) {
        if (rev.indexOf(i) !== -1) {
          total += (6 - responses[i]);
        } else {
          total += responses[i];
        }
      }
      return total;
    }
  };

  
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

  var copsoq3_core = {
    id: 'copsoq3_core', code: 'COPSOQ-III', name: 'Work environment',
    description: 'Copenhagen Psychosocial Questionnaire III - Core Version.',
    estimatedMinutes: 5, dimension: 'workfit',
    dimensions: ['QD','WP','CD','ED','HE','IN','PD','VA','CT','MW','PR','RE','CL','CO','IT','QL','SS','SC','SW','CW','WE','JI','IW','QW','JS','WF','TE','TM','JU','GS','CQ','UT','HSM','SH','TV','PV','BU','GH','SL','BO','ST','SO','CS','DS','SE'],
    questions: [
      { id: 'q1', text: 'How would you rate your general mood over the past week?', responseType: 7 },
      { id: 'q2', text: 'How relaxed or free from anxiety have you felt during work hours?', responseType: 1 },
      { id: 'q3', text: 'How frequently have you felt overwhelmed by your daily workload?', responseType: '1R' },
      { id: 'q4', text: 'How would you rate your stamina and physical energy levels at work?', responseType: 7 },
      { id: 'q5', text: 'Do you have clear role objectives and adequate resources to complete your tasks?', responseType: 2 },
      { id: 'q6', text: 'Do you feel supported and valued by your immediate team members?', responseType: 2 },
      { id: 'q7', text: 'Is there a climate of trust and open communication in your department?', responseType: 2 },
      { id: 'q8', text: 'Do you feel that your daily tasks contribute to a meaningful goal?', responseType: 2 },
      { id: 'q9', text: 'Does your current role provide a sense of personal pride and achievement?', responseType: 2 }
    ], mappings: COPSOQ3_CORE_MAPPINGS, maxScore: 100,
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
  var copsoq3_middle = Object.assign({}, copsoq3_core, { id: 'copsoq3_middle', name: 'Work environment (Middle)', estimatedMinutes: 10, questions: [{"id":"QD1","text":"Is your workload unevenly distributed so it piles up?","dim":"QD","responseType":1},{"id":"QD2","text":"How often do you not have time to complete all your work tasks?","dim":"QD","responseType":1},{"id":"QD3","text":"Do you get behind with your work?","dim":"QD","responseType":1},{"id":"WP1","text":"Do you have to work very fast?","dim":"WP","responseType":1},{"id":"WP2","text":"Do you work at a high pace throughout the day?","dim":"WP","responseType":2},{"id":"ED1","text":"Does your work put you in emotionally disturbing situations?","dim":"ED","responseType":1},{"id":"EDX2","text":"Do you have to deal with other people's personal problems as part of your work?","dim":"ED","responseType":1},{"id":"ED3","text":"Is your work emotionally demanding?","dim":"ED","responseType":2},{"id":"HE2","text":"Does your work require that you hide your feelings?","dim":"HE","responseType":2},{"id":"HE3","text":"Are you required to be kind and open towards everyone - regardless of how they behave towards you?","dim":"HE","responseType":2},{"id":"HE4","text":"Does your work require that you do not state your opinion?","dim":"HE","responseType":1},{"id":"INX1","text":"Do you have a large degree of influence on the decisions concerning your work?","dim":"IN","responseType":2},{"id":"IN3","text":"Can you influence the amount of work assigned to you?","dim":"IN","responseType":1},{"id":"IN4","text":"Do you have any influence on what you do at work?","dim":"IN","responseType":2},{"id":"IN6","text":"Do you have any influence on HOW you do your work?","dim":"IN","responseType":2},{"id":"PD2","text":"Do you have the possibility of learning new things through your work?","dim":"PD","responseType":2},{"id":"PD3","text":"Can you use your skills or expertise in your work?","dim":"PD","responseType":2},{"id":"PD4","text":"Does your work give you the opportunity to develop your skills?","dim":"PD","responseType":2},{"id":"CT1","text":"Can you decide when to take a break?","dim":"CT","responseType":1},{"id":"CT2","text":"Can you take holidays more or less when you wish?","dim":"CT","responseType":1},{"id":"CT3","text":"Can you leave your work to have a chat with a colleague?","dim":"CT","responseType":1},{"id":"CT4","text":"If you have some private business is it possible for you to leave your place of work for half an hour without special permission?","dim":"CT","responseType":1},{"id":"MW1","text":"Is your work meaningful?","dim":"MW","responseType":2},{"id":"MW2","text":"Do you feel that the work you do is important?","dim":"MW","responseType":2},{"id":"PR1","text":"At your place of work, are you informed well in advance concerning for example important decisions, changes or plans for the future?","dim":"PR","responseType":2},{"id":"PR2","text":"Do you receive all the information you need in order to do your work well?","dim":"PR","responseType":2},{"id":"RE1","text":"Is your work recognized and appreciated by the management?","dim":"RE","responseType":2},{"id":"CL1","text":"Does your work have clear objectives?","dim":"CL","responseType":2},{"id":"CL2","text":"Do you know exactly which areas are your responsibility?","dim":"CL","responseType":2},{"id":"CL3","text":"Do you know exactly what is expected of you at work?","dim":"CL","responseType":2},{"id":"CO2","text":"Are contradictory demands placed on you at work?","dim":"CO","responseType":2},{"id":"CO3","text":"Do you sometimes have to do things which ought to have been done in a different way?","dim":"CO","responseType":2},{"id":"IT1","text":"Do you sometimes have to do things which seem to be unnecessary?","dim":"IT","responseType":2},{"id":"QLX1","text":"To what extent would you say that your immediate superior makes sure that the members of staff have good development opportunities?","dim":"QL","responseType":21},{"id":"QL3","text":"To what extent would you say that your immediate superior is good at work planning?","dim":"QL","responseType":21},{"id":"QL4","text":"To what extent would you say that your immediate superior is good at solving conflicts?","dim":"QL","responseType":21},{"id":"SSX1","text":"How often is your immediate superior willing to listen to your problems at work, if needed?","dim":"SS","responseType":11},{"id":"SSX2","text":"How often do you get help and support from your immediate superior, if needed?","dim":"SS","responseType":11},{"id":"SCX1","text":"How often do you get help and support from your colleagues, if needed?","dim":"SC","responseType":11},{"id":"SCX2","text":"How often are your colleagues willing to listen to your problems at work, if needed?","dim":"SC","responseType":11},{"id":"SW1","text":"Is there a good atmosphere between you and your colleagues?","dim":"SW","responseType":11},{"id":"SW3","text":"Do you feel part of a community at your place of work?","dim":"SW","responseType":11},{"id":"JI1","text":"Are you worried about becoming unemployed?","dim":"JI","responseType":2},{"id":"JI3","text":"Are you worried about it being difficult for you to find another job if you became unemployed?","dim":"JI","responseType":2},{"id":"IW1","text":"Are you worried about being transferred to another job against your will?","dim":"IW","responseType":2},{"id":"IW3","text":"Are you worried about the timetable being changed against your will?","dim":"IW","responseType":2},{"id":"IW4","text":"Are you worried about a decrease in your salary against your will?","dim":"IW","responseType":2},{"id":"QW2","text":"Are you satisfied with the quality of the work performed at your workplace?","dim":"QW","responseType":2},{"id":"JS1","text":"Regarding your work in general: How pleased are you with your work prospects?","dim":"JS","responseType":6},{"id":"JS4","text":"Regarding your work in general: How pleased are you with your job as a whole, everything taken into consideration?","dim":"JS","responseType":6},{"id":"JS5","text":"Regarding your work in general: How pleased are you with your salary?","dim":"JS","responseType":6},{"id":"WF2","text":"Do you feel that your work drains so much of your energy that it has a negative effect on your private life?","dim":"WF","responseType":2},{"id":"WF3","text":"Do you feel that your work takes so much of your time that it has a negative effect on your private life?","dim":"WF","responseType":2},{"id":"TE3","text":"Do the employees in general trust each other?","dim":"TE","responseType":2},{"id":"TM1","text":"Does the management trust the employees to do their work well?","dim":"TM","responseType":2},{"id":"TMX2","text":"Can the employees trust the information that comes from the management?","dim":"TM","responseType":2},{"id":"TM4","text":"Are the employees able to express their views and feelings?","dim":"TM","responseType":2},{"id":"JU1","text":"Are conflicts resolved in a fair way?","dim":"JU","responseType":2},{"id":"JU4","text":"Is the work distributed fairly?","dim":"JU","responseType":2},{"id":"GH1","text":"In general, would you say your health is:","dim":"GH","responseType":7}] });
  var copsoq3_long = Object.assign({}, copsoq3_core, { id: 'copsoq3_long', name: 'Work environment (Long)', estimatedMinutes: 15, questions: [{"id":"QD1","text":"Is your workload unevenly distributed so it piles up?","dim":"QD","responseType":1},{"id":"QD2","text":"How often do you not have time to complete all your work tasks?","dim":"QD","responseType":1},{"id":"QD3","text":"Do you get behind with your work?","dim":"QD","responseType":1},{"id":"OD4","text":"Do you have enough time for your work tasks?","dim":"QD","responseType":"1R"},{"id":"WP1","text":"Do you have to work very fast?","dim":"WP","responseType":1},{"id":"WP2","text":"Do you work at a high pace throughout the day?","dim":"WP","responseType":2},{"id":"WP3","text":"Is it necessary to keep working at a high pace?","dim":"WP","responseType":2},{"id":"CD1","text":"Do you have to keep your eyes on lots of things while you work?","dim":"CD","responseType":1},{"id":"CD2","text":"Does your work require that you remember a lot of things?","dim":"CD","responseType":1},{"id":"CD3","text":"Does your work demand that you are good at coming up with new ideas?","dim":"CD","responseType":1},{"id":"CD4","text":"Does your work require you to make difficult decisions?","dim":"CD","responseType":1},{"id":"ED1","text":"Does your work put you in emotionally disturbing situations?","dim":"ED","responseType":1},{"id":"EDX2","text":"Do you have to deal with other people's personal problems as part of your work?","dim":"ED","responseType":1},{"id":"ED3","text":"Is your work emotionally demanding?","dim":"ED","responseType":2},{"id":"HE1","text":"Are you required to treat everyone equally, even if you do not feel like it?","dim":"HE","responseType":1},{"id":"HE2","text":"Does your work require that you hide your feelings?","dim":"HE","responseType":2},{"id":"HE3","text":"Are you required to be kind and open towards everyone - regardless of how they behave towards you?","dim":"HE","responseType":2},{"id":"HE4","text":"Does your work require that you do not state your opinion?","dim":"HE","responseType":1},{"id":"INX1","text":"Do you have a large degree of influence on the decisions concerning your work?","dim":"IN","responseType":2},{"id":"IN2","text":"Do you have a say in choosing who you work with?","dim":"IN","responseType":1},{"id":"IN3","text":"Can you influence the amount of work assigned to you?","dim":"IN","responseType":1},{"id":"IN4","text":"Do you have any influence on what you do at work?","dim":"IN","responseType":2},{"id":"IN5","text":"Can you influence how quickly you work?","dim":"IN","responseType":2},{"id":"IN6","text":"Do you have any influence on HOW you do your work?","dim":"IN","responseType":2},{"id":"PD2","text":"Do you have the possibility of learning new things through your work?","dim":"PD","responseType":2},{"id":"PD3","text":"Can you use your skills or expertise in your work?","dim":"PD","responseType":2},{"id":"PD4","text":"Does your work give you the opportunity to develop your skills?","dim":"PD","responseType":2},{"id":"VA1","text":"Is your work varied?","dim":"VA","responseType":1},{"id":"VA2","text":"Do you have to do the same thing over and over again?","dim":"VA","responseType":"1R"},{"id":"CT1","text":"Can you decide when to take a break?","dim":"CT","responseType":1},{"id":"CT2","text":"Can you take holidays more or less when you wish?","dim":"CT","responseType":1},{"id":"CT3","text":"Can you leave your work to have a chat with a colleague?","dim":"CT","responseType":1},{"id":"CT4","text":"If you have some private business is it possible for you to leave your place of work for half an hour without special permission?","dim":"CT","responseType":1},{"id":"CT5","text":"Do you have to do overtime?","dim":"CT","responseType":"1R"},{"id":"MW1","text":"Is your work meaningful?","dim":"MW","responseType":2},{"id":"MW2","text":"Do you feel that the work you do is important?","dim":"MW","responseType":2},{"id":"PR1","text":"At your place of work, are you informed well in advance concerning for example important decisions, changes or plans for the future?","dim":"PR","responseType":2},{"id":"PR2","text":"Do you receive all the information you need in order to do your work well?","dim":"PR","responseType":2},{"id":"RE1","text":"Is your work recognized and appreciated by the management?","dim":"RE","responseType":2},{"id":"RE2","text":"Does the management at your workplace respect you?","dim":"RE","responseType":2},{"id":"RE3","text":"Are you treated fairly at your workplace?","dim":"RE","responseType":2},{"id":"CL1","text":"Does your work have clear objectives?","dim":"CL","responseType":2},{"id":"CL2","text":"Do you know exactly which areas are your responsibility?","dim":"CL","responseType":2},{"id":"CL3","text":"Do you know exactly what is expected of you at work?","dim":"CL","responseType":2},{"id":"CO2","text":"Are contradictory demands placed on you at work?","dim":"CO","responseType":2},{"id":"CO3","text":"Do you sometimes have to do things which ought to have been done in a different way?","dim":"CO","responseType":2},{"id":"IT1","text":"Do you sometimes have to do things which seem to be unnecessary?","dim":"IT","responseType":2},{"id":"QLX1","text":"To what extent would you say that your immediate superior makes sure that the members of staff have good development opportunities?","dim":"QL","responseType":21},{"id":"QL2","text":"To what extent would you say that your immediate superior gives high priority to job satisfaction?","dim":"QL","responseType":21},{"id":"QL3","text":"To what extent would you say that your immediate superior is good at work planning?","dim":"QL","responseType":21},{"id":"QL4","text":"To what extent would you say that your immediate superior is good at solving conflicts?","dim":"QL","responseType":21},{"id":"SSX1","text":"How often is your immediate superior willing to listen to your problems at work, if needed?","dim":"SS","responseType":11},{"id":"SSX2","text":"How often do you get help and support from your immediate superior, if needed?","dim":"SS","responseType":11},{"id":"SSX3","text":"How often does your immediate superior talk with you about how well you carry out your work?","dim":"SS","responseType":11},{"id":"SCX1","text":"How often do you get help and support from your colleagues, if needed?","dim":"SC","responseType":11},{"id":"SCX2","text":"How often are your colleagues willing to listen to your problems at work, if needed?","dim":"SC","responseType":11},{"id":"SC3","text":"How often do your colleagues talk with you about how well you carry out your work?","dim":"SC","responseType":11},{"id":"SW1","text":"Is there a good atmosphere between you and your colleagues?","dim":"SW","responseType":11},{"id":"SW2","text":"Is there good co-operation between the colleagues at work?","dim":"SW","responseType":11},{"id":"SW3","text":"Do you feel part of a community at your place of work?","dim":"SW","responseType":11},{"id":"CW1","text":"Do you enjoy telling others about your place of work?","dim":"CW","responseType":2},{"id":"CW2","text":"Do you feel that your place of work is of great importance to you?","dim":"CW","responseType":2},{"id":"CWX3","text":"Would you recommend other people to apply for a position at your workplace?","dim":"CW","responseType":2},{"id":"CW4","text":"How often do you consider looking for work elsewhere?","dim":"CW","responseType":"1R"},{"id":"CW5","text":"Are you proud of being part of this organization?","dim":"CW","responseType":2},{"id":"WE1","text":"At my work, I feel bursting with energy.","dim":"WE","responseType":3},{"id":"WE2","text":"I am enthusiastic about my job.","dim":"WE","responseType":3},{"id":"WE3","text":"I am immersed in my work.","dim":"WE","responseType":3},{"id":"JI1","text":"Are you worried about becoming unemployed?","dim":"JI","responseType":2},{"id":"JI2","text":"Are you worried about new technology making you redundant?","dim":"JI","responseType":2},{"id":"JI3","text":"Are you worried about it being difficult for you to find another job if you became unemployed?","dim":"JI","responseType":2},{"id":"IW1","text":"Are you worried about being transferred to another job against your will?","dim":"IW","responseType":2},{"id":"IW2","text":"Are you worried about your working tasks being changed against your will?","dim":"IW","responseType":2},{"id":"IW3","text":"Are you worried about the timetable being changed against your will?","dim":"IW","responseType":2},{"id":"IW4","text":"Are you worried about a decrease in your salary against your will?","dim":"IW","responseType":2},{"id":"IW5","text":"Are there good prospects in your job?","dim":"IW","responseType":"2R"},{"id":"QW1","text":"To what extent do you find it possible to perform your work tasks at a satisfactory quality?","dim":"QW","responseType":2},{"id":"QW2","text":"Are you satisfied with the quality of the work performed at your workplace?","dim":"QW","responseType":2},{"id":"JS1","text":"Regarding your work in general: How pleased are you with your work prospects?","dim":"JS","responseType":6},{"id":"JS2","text":"Regarding your work in general: How pleased are you with the physical working conditions?","dim":"JS","responseType":6},{"id":"JS3","text":"Regarding your work in general: How pleased are you with the way your abilities are used?","dim":"JS","responseType":6},{"id":"JS4","text":"Regarding your work in general: How pleased are you with your job as a whole, everything taken into consideration?","dim":"JS","responseType":6},{"id":"JS5","text":"Regarding your work in general: How pleased are you with your salary?","dim":"JS","responseType":6},{"id":"WFX1","text":"Are there times when you need to be at work and at home at the same time?","dim":"WF","responseType":1},{"id":"WF2","text":"Do you feel that your work drains so much of your energy that it has a negative effect on your private life?","dim":"WF","responseType":2},{"id":"WF3","text":"Do you feel that your work takes so much of your time that it has a negative effect on your private life?","dim":"WF","responseType":2},{"id":"WF5","text":"The demands of my work interfere with my private and family life?","dim":"WF","responseType":2},{"id":"WF6","text":"Due to work-related duties, I have to make changes to my plans for private and family activities.","dim":"WF","responseType":2},{"id":"TE1","text":"Do the employees withhold information from each other?","dim":"TE","responseType":"2R"},{"id":"TE2","text":"Do the employees withhold information from the management?","dim":"TE","responseType":"2R"},{"id":"TE3","text":"Do the employees in general trust each other?","dim":"TE","responseType":2},{"id":"TM1","text":"Does the management trust the employees to do their work well?","dim":"TM","responseType":2},{"id":"TMX2","text":"Can the employees trust the information that comes from the management?","dim":"TM","responseType":2},{"id":"TM3","text":"Does the management withhold important information from the employees?","dim":"TM","responseType":"2R"},{"id":"TM4","text":"Are the employees able to express their views and feelings?","dim":"TM","responseType":2},{"id":"JU1","text":"Are conflicts resolved in a fair way?","dim":"JU","responseType":2},{"id":"JU2","text":"Are employees appreciated when they have done a good job?","dim":"JU","responseType":2},{"id":"JU3","text":"Are all suggestions from employees treated seriously by the management?","dim":"JU","responseType":2},{"id":"JU4","text":"Is the work distributed fairly?","dim":"JU","responseType":2},{"id":"GS1","text":"Have you been exposed to gossip and slander at your workplace during the last 12 months?","dim":"GS","responseType":4},{"id":"GS2","text":"If yes, from whom? (You may tick off more than one)","dim":"GS","responseType":"5M"},{"id":"CQ1","text":"Have you been involved in quarrels or conflicts at your workplace during the last 12 months?","dim":"CQ","responseType":4},{"id":"UT1","text":"Have you been exposed to unpleasant teasing at your workplace during the last 12 months?","dim":"UT","responseType":4},{"id":"UT2","text":"If yes, from whom? (You may tick off more than one)","dim":"UT","responseType":"5M"},{"id":"HSM1","text":"Have you been exposed to work-related harassment on social media (e.g. Facebook), by e-mail or text messages during the last 12 months?","dim":"HSM","responseType":4},{"id":"HSM2","text":"If yes, from whom? (You may tick off more than one)","dim":"HSM","responseType":"5M"},{"id":"SH1","text":"Have you been exposed to undesired sexual attention at your workplace during the last 12 months?","dim":"SH","responseType":4},{"id":"SH2","text":"If yes, from whom? (You may tick off more than one)","dim":"SH","responseType":"5M"},{"id":"TV1","text":"Have you been exposed to threats of violence at your workplace during the last 12 months?","dim":"TV","responseType":4},{"id":"TV2","text":"If yes, from whom? (You may tick off more than one)","dim":"TV","responseType":"5M"},{"id":"PV1","text":"Have you been exposed to physical violence at your workplace during the last 12 months?","dim":"PV","responseType":4},{"id":"PV2","text":"If yes, from whom? (You may tick off more than one)","dim":"PV","responseType":"5M"},{"id":"BU1","text":"Bullying means that a person repeatedly is exposed to unpleasant or degrading treatment, and that the person finds it difficult to defend himself or herself against it. Have you been exposed to bullying at your workplace during the last 12 months?","dim":"BU","responseType":4},{"id":"BU3","text":"If yes, from whom? (You may tick off more than one)","dim":"BU","responseType":"5M"},{"id":"BU2","text":"How often do you feel unjustly criticized, bullied or shown up in front of others by your colleagues or your superior?","dim":"BU","responseType":"1�"},{"id":"GH1","text":"In general, would you say your health is:","dim":"GH","responseType":7},{"id":"GH2","text":"If you evaluate the best conceivable state of health at 10 points and the worst at 0 points: how many points do you then give your present state of health?","dim":"GH","responseType":8},{"id":"SL1","text":"How often have you slept badly and restlessly?","dim":"SL","responseType":9},{"id":"SL2","text":"How often have you found it hard to go to sleep?","dim":"SL","responseType":9},{"id":"SL3","text":"How often have you woken up too early and not been able to get back to sleep?","dim":"SL","responseType":9},{"id":"SL4","text":"How often have you woken up several times and found it difficult to get back to sleep?","dim":"SL","responseType":9},{"id":"BO1","text":"How often have you felt worn out?","dim":"BO","responseType":9},{"id":"BO2","text":"How often have you been physically exhausted?","dim":"BO","responseType":9},{"id":"BO3","text":"How often have you been emotionally exhausted?","dim":"BO","responseType":9},{"id":"BO4","text":"How often have you felt tired?","dim":"BO","responseType":9},{"id":"ST1","text":"How often have you had problems relaxing?","dim":"ST","responseType":9},{"id":"ST2","text":"How often have you been irritable?","dim":"ST","responseType":9},{"id":"ST3","text":"How often have you been tense?","dim":"ST","responseType":9},{"id":"SO1","text":"How often have you had stomach ache?","dim":"SO","responseType":9},{"id":"SO2","text":"How often have you had a headache?","dim":"SO","responseType":9},{"id":"SO3","text":"How often have you had palpitations?","dim":"SO","responseType":9},{"id":"SO4","text":"How often have you had tension in various muscles?","dim":"SO","responseType":9},{"id":"CS1","text":"How often have you had problems concentrating?","dim":"CS","responseType":9},{"id":"CS2","text":"How often have you found it difficult to think clearly?","dim":"CS","responseType":9},{"id":"CS3","text":"How often have you had difficulty in taking decisions?","dim":"CS","responseType":9},{"id":"CS4","text":"How often have you had difficulty with remembering?","dim":"CS","responseType":9},{"id":"DS1","text":"How often have you felt sad?","dim":"DS","responseType":9},{"id":"DS2","text":"How often have you lacked self-confidence?","dim":"DS","responseType":9},{"id":"DS3","text":"How often have you had a bad conscience or felt guilty?","dim":"DS","responseType":9},{"id":"DS4","text":"How often have you lacked interest in everyday things?","dim":"DS","responseType":9},{"id":"SE1","text":"I am always able to solve difficult problems, if I try hard enough.","dim":"SE","responseType":10},{"id":"SE2","text":"If people work against me, I find a way of achieving what I want.","dim":"SE","responseType":10},{"id":"SE3","text":"It is easy for me to stick to my plans and reach my objectives.","dim":"SE","responseType":10},{"id":"SE4","text":"I feel confident that I can handle unexpected events.","dim":"SE","responseType":10},{"id":"SE5","text":"When I have a problem, I can usually find several ways of solving it.","dim":"SE","responseType":10},{"id":"SE6","text":"Regardless of what happens, I usually manage.","dim":"SE","responseType":10}] });


  // Export to global scope
  window.phq9 = phq9;
  window.gad7 = gad7;
  window.pss10 = pss10;
  window.fas10 = fas10;
  window.copsoq3_core = copsoq3_core;
  window.copsoq3_middle = copsoq3_middle;
  window.copsoq3_long = copsoq3_long;
  window.COPSOQ3_CORE_MAPPINGS = COPSOQ3_CORE_MAPPINGS;

  return {
    phq9: phq9,
    gad7: gad7,
    pss10: pss10,
    fas10: fas10,
    copsoq3_core: copsoq3_core,
    copsoq3_middle: copsoq3_middle,
    copsoq3_long: copsoq3_long,
    COPSOQ3_CORE_MAPPINGS: COPSOQ3_CORE_MAPPINGS
  };
})();
