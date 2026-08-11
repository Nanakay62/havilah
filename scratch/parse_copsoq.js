const data1 = [
  {
    scale: 'Quantitative Demands',
    dimension: 'QD',
    items: [
      { id: 'QD1', question: 'Is your workload unevenly distributed so it piles up?', level: 'MIDDLE', responseType: 1 },
      { id: 'QD2', question: 'How often do you not have time to complete all your work tasks?', level: 'CORE', responseType: 1 },
      { id: 'QD3', question: 'Do you get behind with your work?', level: 'CORE', responseType: 1 },
      { id: 'OD4', question: 'Do you have enough time for your work tasks?', level: 'LONG', responseType: '1R' }
    ]
  },
  {
    scale: 'Work Pace',
    dimension: 'WP',
    items: [
      { id: 'WP1', question: 'Do you have to work very fast?', level: 'CORE', responseType: 1 },
      { id: 'WP2', question: 'Do you work at a high pace throughout the day?', level: 'CORE', responseType: 2 },
      { id: 'WP3', question: 'Is it necessary to keep working at a high pace?', level: 'LONG', responseType: 2 }
    ]
  },
  {
    scale: 'Cognitive Demands',
    dimension: 'CD',
    items: [
      { id: 'CD1', question: 'Do you have to keep your eyes on lots of things while you work?', level: 'LONG', responseType: 1 },
      { id: 'CD2', question: 'Does your work require that you remember a lot of things?', level: 'LONG', responseType: 1 },
      { id: 'CD3', question: 'Does your work demand that you are good at coming up with new ideas?', level: 'LONG', responseType: 1 },
      { id: 'CD4', question: 'Does your work require you to make difficult decisions?', level: 'LONG', responseType: 1 }
    ]
  },
  {
    scale: 'Emotional Demands',
    dimension: 'ED',
    items: [
      { id: 'ED1', question: 'Does your work put you in emotionally disturbing situations?', level: 'MIDDLE', responseType: 1 },
      { id: 'EDX2', question: 'Do you have to deal with other people\'s personal problems as part of your work?', level: 'CORE', responseType: 1 },
      { id: 'ED3', question: 'Is your work emotionally demanding?', level: 'CORE', responseType: 2 }
    ]
  },
  {
    scale: 'Demands for Hiding Emotions',
    dimension: 'HE',
    items: [
      { id: 'HE1', question: 'Are you required to treat everyone equally, even if you do not feel like it?', level: 'LONG', responseType: 1 },
      { id: 'HE2', question: 'Does your work require that you hide your feelings?', level: 'MIDDLE', responseType: 2 },
      { id: 'HE3', question: 'Are you required to be kind and open towards everyone - regardless of how they behave towards you?', level: 'MIDDLE', responseType: 2 },
      { id: 'HE4', question: 'Does your work require that you do not state your opinion?', level: 'MIDDLE', responseType: 1 }
    ]
  },
  {
    scale: 'Influence at Work',
    dimension: 'IN',
    items: [
      { id: 'INX1', question: 'Do you have a large degree of influence on the decisions concerning your work?', level: 'CORE', responseType: 2 },
      { id: 'IN2', question: 'Do you have a say in choosing who you work with?', level: 'LONG', responseType: 1 },
      { id: 'IN3', question: 'Can you influence the amount of work assigned to you?', level: 'MIDDLE', responseType: 1 },
      { id: 'IN4', question: 'Do you have any influence on what you do at work?', level: 'MIDDLE', responseType: 2 },
      { id: 'IN5', question: 'Can you influence how quickly you work?', level: 'LONG', responseType: 2 },
      { id: 'IN6', question: 'Do you have any influence on HOW you do your work?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Possibilities for Development',
    dimension: 'PD',
    items: [
      { id: 'PD2', question: 'Do you have the possibility of learning new things through your work?', level: 'CORE', responseType: 2 },
      { id: 'PD3', question: 'Can you use your skills or expertise in your work?', level: 'CORE', responseType: 2 },
      { id: 'PD4', question: 'Does your work give you the opportunity to develop your skills?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Variation of Work',
    dimension: 'VA',
    items: [
      { id: 'VA1', question: 'Is your work varied?', level: 'LONG', responseType: 1 },
      { id: 'VA2', question: 'Do you have to do the same thing over and over again?', level: 'LONG', responseType: '1R' }
    ]
  },
  {
    scale: 'Control over Working Time',
    dimension: 'CT',
    items: [
      { id: 'CT1', question: 'Can you decide when to take a break?', level: 'MIDDLE', responseType: 1 },
      { id: 'CT2', question: 'Can you take holidays more or less when you wish?', level: 'MIDDLE', responseType: 1 },
      { id: 'CT3', question: 'Can you leave your work to have a chat with a colleague?', level: 'MIDDLE', responseType: 1 },
      { id: 'CT4', question: 'If you have some private business is it possible for you to leave your place of work for half an hour without special permission?', level: 'MIDDLE', responseType: 1 },
      { id: 'CT5', question: 'Do you have to do overtime?', level: 'LONG', responseType: '1R' }
    ]
  },
  {
    scale: 'Meaning of Work',
    dimension: 'MW',
    items: [
      { id: 'MW1', question: 'Is your work meaningful?', level: 'CORE', responseType: 2 },
      { id: 'MW2', question: 'Do you feel that the work you do is important?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Predictability',
    dimension: 'PR',
    items: [
      { id: 'PR1', question: 'At your place of work, are you informed well in advance concerning for example important decisions, changes or plans for the future?', level: 'CORE', responseType: 2 },
      { id: 'PR2', question: 'Do you receive all the information you need in order to do your work well?', level: 'CORE', responseType: 2 }
    ]
  },
  {
    scale: 'Recognition',
    dimension: 'RE',
    items: [
      { id: 'RE1', question: 'Is your work recognized and appreciated by the management?', level: 'CORE', responseType: 2 },
      { id: 'RE2', question: 'Does the management at your workplace respect you?', level: 'LONG', responseType: 2 },
      { id: 'RE3', question: 'Are you treated fairly at your workplace?', level: 'LONG', responseType: 2 }
    ]
  },
  {
    scale: 'Role Clarity',
    dimension: 'CL',
    items: [
      { id: 'CL1', question: 'Does your work have clear objectives?', level: 'CORE', responseType: 2 },
      { id: 'CL2', question: 'Do you know exactly which areas are your responsibility?', level: 'MIDDLE', responseType: 2 },
      { id: 'CL3', question: 'Do you know exactly what is expected of you at work?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Role Conflicts',
    dimension: 'CO',
    items: [
      { id: 'CO2', question: 'Are contradictory demands placed on you at work?', level: 'CORE', responseType: 2 },
      { id: 'CO3', question: 'Do you sometimes have to do things which ought to have been done in a different way?', level: 'CORE', responseType: 2 }
    ]
  },
  {
    scale: 'Illegitimate Tasks',
    dimension: 'IT',
    items: [
      { id: 'IT1', question: 'Do you sometimes have to do things which seem to be unnecessary?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Quality of Leadership',
    dimension: 'QL',
    items: [
      { id: 'QLX1', question: 'To what extent would you say that your immediate superior makes sure that the members of staff have good development opportunities?', level: 'MIDDLE', responseType: 21 },
      { id: 'QL2', question: 'To what extent would you say that your immediate superior gives high priority to job satisfaction?', level: 'LONG', responseType: 21 },
      { id: 'QL3', question: 'To what extent would you say that your immediate superior is good at work planning?', level: 'CORE', responseType: 21 },
      { id: 'QL4', question: 'To what extent would you say that your immediate superior is good at solving conflicts?', level: 'CORE', responseType: 21 }
    ]
  },
  {
    scale: 'Social Support from Supervisor',
    dimension: 'SS',
    items: [
      { id: 'SSX1', question: 'How often is your immediate superior willing to listen to your problems at work, if needed?', level: 'MIDDLE', responseType: 11 },
      { id: 'SSX2', question: 'How often do you get help and support from your immediate superior, if needed?', level: 'CORE', responseType: 11 },
      { id: 'SSX3', question: 'How often does your immediate superior talk with you about how well you carry out your work?', level: 'LONG', responseType: 11 }
    ]
  },
  {
    scale: 'Social Support from Colleagues',
    dimension: 'SC',
    items: [
      { id: 'SCX1', question: 'How often do you get help and support from your colleagues, if needed?', level: 'CORE', responseType: 11 },
      { id: 'SCX2', question: 'How often are your colleagues willing to listen to your problems at work, if needed?', level: 'MIDDLE', responseType: 11 },
      { id: 'SC3', question: 'How often do your colleagues talk with you about how well you carry out your work?', level: 'LONG', responseType: 11 }
    ]
  },
  {
    scale: 'Sense of Community at Work',
    dimension: 'SW',
    items: [
      { id: 'SW1', question: 'Is there a good atmosphere between you and your colleagues?', level: 'CORE', responseType: 11 },
      { id: 'SW2', question: 'Is there good co-operation between the colleagues at work?', level: 'LONG', responseType: 11 },
      { id: 'SW3', question: 'Do you feel part of a community at your place of work?', level: 'MIDDLE', responseType: 11 }
    ]
  },
  {
    scale: 'Commitment to the Workplace',
    dimension: 'CW',
    items: [
      { id: 'CW1', question: 'Do you enjoy telling others about your place of work?', level: 'LONG', responseType: 2 },
      { id: 'CW2', question: 'Do you feel that your place of work is of great importance to you?', level: 'LONG', responseType: 2 },
      { id: 'CWX3', question: 'Would you recommend other people to apply for a position at your workplace?', level: 'LONG', responseType: 2 },
      { id: 'CW4', question: 'How often do you consider looking for work elsewhere?', level: 'LONG', responseType: '1R' },
      { id: 'CW5', question: 'Are you proud of being part of this organization?', level: 'LONG', responseType: 2 }
    ]
  },
  {
    scale: 'Work Engagement',
    dimension: 'WE',
    items: [
      { id: 'WE1', question: 'At my work, I feel bursting with energy.', level: 'LONG', responseType: 3 },
      { id: 'WE2', question: 'I am enthusiastic about my job.', level: 'LONG', responseType: 3 },
      { id: 'WE3', question: 'I am immersed in my work.', level: 'LONG', responseType: 3 }
    ]
  },
  {
    scale: 'Job Insecurity',
    dimension: 'JI',
    items: [
      { id: 'JI1', question: 'Are you worried about becoming unemployed?', level: 'CORE', responseType: 2 },
      { id: 'JI2', question: 'Are you worried about new technology making you redundant?', level: 'LONG', responseType: 2 },
      { id: 'JI3', question: 'Are you worried about it being difficult for you to find another job if you became unemployed?', level: 'CORE', responseType: 2 }
    ]
  },
  {
    scale: 'Insecurity over Working Conditions',
    dimension: 'IW',
    items: [
      { id: 'IW1', question: 'Are you worried about being transferred to another job against your will?', level: 'CORE', responseType: 2 },
      { id: 'IW2', question: 'Are you worried about your working tasks being changed against your will?', level: 'LONG', responseType: 2 },
      { id: 'IW3', question: 'Are you worried about the timetable being changed against your will?', level: 'MIDDLE', responseType: 2 },
      { id: 'IW4', question: 'Are you worried about a decrease in your salary against your will?', level: 'MIDDLE', responseType: 2 },
      { id: 'IW5', question: 'Are there good prospects in your job?', level: 'LONG', responseType: '2R' }
    ]
  },
  {
    scale: 'Quality of Work',
    dimension: 'QW',
    items: [
      { id: 'QW1', question: 'To what extent do you find it possible to perform your work tasks at a satisfactory quality?', level: 'LONG', responseType: 2 },
      { id: 'QW2', question: 'Are you satisfied with the quality of the work performed at your workplace?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Job Satisfaction',
    dimension: 'JS',
    items: [
      { id: 'JS1', question: 'Regarding your work in general: How pleased are you with your work prospects?', level: 'MIDDLE', responseType: 6 },
      { id: 'JS2', question: 'Regarding your work in general: How pleased are you with the physical working conditions?', level: 'LONG', responseType: 6 },
      { id: 'JS3', question: 'Regarding your work in general: How pleased are you with the way your abilities are used?', level: 'LONG', responseType: 6 },
      { id: 'JS4', question: 'Regarding your work in general: How pleased are you with your job as a whole, everything taken into consideration?', level: 'CORE', responseType: 6 },
      { id: 'JS5', question: 'Regarding your work in general: How pleased are you with your salary?', level: 'MIDDLE', responseType: 6 }
    ]
  },
  {
    scale: 'Work Life Conflict',
    dimension: 'WF',
    items: [
      { id: 'WFX1', question: 'Are there times when you need to be at work and at home at the same time?', level: 'LONG', responseType: 1 },
      { id: 'WF2', question: 'Do you feel that your work drains so much of your energy that it has a negative effect on your private life?', level: 'CORE', responseType: 2 }
    ]
  }
];
const data2 = [
  {
    scale: 'Work Life Conflict',
    dimension: 'WF',
    items: [
      { id: 'WF2', question: 'Do you feel that your work drains so much of your energy that it has a negative effect on your private life?', level: 'CORE', responseType: 2 },
      { id: 'WF3', question: 'Do you feel that your work takes so much of your time that it has a negative effect on your private life?', level: 'CORE', responseType: 2 },
      { id: 'WF5', question: 'The demands of my work interfere with my private and family life?', level: 'LONG', responseType: 2 },
      { id: 'WF6', question: 'Due to work-related duties, I have to make changes to my plans for private and family activities.', level: 'LONG', responseType: 2 }
    ]
  },
  {
    scale: 'Horizontal Trust',
    dimension: 'TE',
    items: [
      { id: 'TE1', question: 'Do the employees withhold information from each other?', level: 'LONG', responseType: '2R' },
      { id: 'TE2', question: 'Do the employees withhold information from the management?', level: 'LONG', responseType: '2R' },
      { id: 'TE3', question: 'Do the employees in general trust each other?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Vertical Trust',
    dimension: 'TM',
    items: [
      { id: 'TM1', question: 'Does the management trust the employees to do their work well?', level: 'CORE', responseType: 2 },
      { id: 'TMX2', question: 'Can the employees trust the information that comes from the management?', level: 'CORE', responseType: 2 },
      { id: 'TM3', question: 'Does the management withhold important information from the employees?', level: 'LONG', responseType: '2R' },
      { id: 'TM4', question: 'Are the employees able to express their views and feelings?', level: 'MIDDLE', responseType: 2 }
    ]
  },
  {
    scale: 'Organizational Justice',
    dimension: 'JU',
    items: [
      { id: 'JU1', question: 'Are conflicts resolved in a fair way?', level: 'CORE', responseType: 2 },
      { id: 'JU2', question: 'Are employees appreciated when they have done a good job?', level: 'LONG', responseType: 2 },
      { id: 'JU3', question: 'Are all suggestions from employees treated seriously by the management?', level: 'LONG', responseType: 2 },
      { id: 'JU4', question: 'Is the work distributed fairly?', level: 'CORE', responseType: 2 }
    ]
  },
  {
    scale: 'Gossip and Slander',
    dimension: 'GS',
    items: [
      { id: 'GS1', question: 'Have you been exposed to gossip and slander at your workplace during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'GS2', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' }
    ]
  },
  {
    scale: 'Conflicts and Quarrels',
    dimension: 'CQ',
    items: [
      { id: 'CQ1', question: 'Have you been involved in quarrels or conflicts at your workplace during the last 12 months?', level: 'LONG', responseType: 4 }
    ]
  },
  {
    scale: 'Unpleasant Teasing',
    dimension: 'UT',
    items: [
      { id: 'UT1', question: 'Have you been exposed to unpleasant teasing at your workplace during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'UT2', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' }
    ]
  },
  {
    scale: 'Cyber Bullying',
    dimension: 'HSM',
    items: [
      { id: 'HSM1', question: 'Have you been exposed to work-related harassment on social media (e.g. Facebook), by e-mail or text messages during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'HSM2', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' }
    ]
  },
  {
    scale: 'Sexual Harassment',
    dimension: 'SH',
    items: [
      { id: 'SH1', question: 'Have you been exposed to undesired sexual attention at your workplace during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'SH2', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' }
    ]
  },
  {
    scale: 'Threats of Violence',
    dimension: 'TV',
    items: [
      { id: 'TV1', question: 'Have you been exposed to threats of violence at your workplace during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'TV2', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' }
    ]
  },
  {
    scale: 'Physical Violence',
    dimension: 'PV',
    items: [
      { id: 'PV1', question: 'Have you been exposed to physical violence at your workplace during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'PV2', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' }
    ]
  },
  {
    scale: 'Bullying',
    dimension: 'BU',
    items: [
      { id: 'BU1', question: 'Bullying means that a person repeatedly is exposed to unpleasant or degrading treatment, and that the person finds it difficult to defend himself or herself against it. Have you been exposed to bullying at your workplace during the last 12 months?', level: 'LONG', responseType: 4 },
      { id: 'BU3', question: 'If yes, from whom? (You may tick off more than one)', level: 'LONG', responseType: '5M' },
      { id: 'BU2', question: 'How often do you feel unjustly criticized, bullied or shown up in front of others by your colleagues or your superior?', level: 'LONG', responseType: '1§' }
    ]
  },
  {
    scale: 'Self Rated Health',
    dimension: 'GH',
    items: [
      { id: 'GH1', question: 'In general, would you say your health is:', level: 'CORE', responseType: 7 },
      { id: 'GH2', question: 'If you evaluate the best conceivable state of health at 10 points and the worst at 0 points: how many points do you then give your present state of health?', level: 'LONG', responseType: 8 }
    ]
  },
  {
    scale: 'Sleeping Troubles',
    dimension: 'SL',
    items: [
      { id: 'SL1', question: 'How often have you slept badly and restlessly?', level: 'LONG', responseType: 9 },
      { id: 'SL2', question: 'How often have you found it hard to go to sleep?', level: 'LONG', responseType: 9 },
      { id: 'SL3', question: 'How often have you woken up too early and not been able to get back to sleep?', level: 'LONG', responseType: 9 },
      { id: 'SL4', question: 'How often have you woken up several times and found it difficult to get back to sleep?', level: 'LONG', responseType: 9 }
    ]
  },
  {
    scale: 'Burnout',
    dimension: 'BO',
    items: [
      { id: 'BO1', question: 'How often have you felt worn out?', level: 'LONG', responseType: 9 },
      { id: 'BO2', question: 'How often have you been physically exhausted?', level: 'LONG', responseType: 9 },
      { id: 'BO3', question: 'How often have you been emotionally exhausted?', level: 'LONG', responseType: 9 },
      { id: 'BO4', question: 'How often have you felt tired?', level: 'LONG', responseType: 9 }
    ]
  },
  {
    scale: 'Stress',
    dimension: 'ST',
    items: [
      { id: 'ST1', question: 'How often have you had problems relaxing?', level: 'LONG', responseType: 9 },
      { id: 'ST2', question: 'How often have you been irritable?', level: 'LONG', responseType: 9 },
      { id: 'ST3', question: 'How often have you been tense?', level: 'LONG', responseType: 9 }
    ]
  },
  {
    scale: 'Somatic Stress',
    dimension: 'SO',
    items: [
      { id: 'SO1', question: 'How often have you had stomach ache?', level: 'LONG', responseType: 9 },
      { id: 'SO2', question: 'How often have you had a headache?', level: 'LONG', responseType: 9 },
      { id: 'SO3', question: 'How often have you had palpitations?', level: 'LONG', responseType: 9 },
      { id: 'SO4', question: 'How often have you had tension in various muscles?', level: 'LONG', responseType: 9 }
    ]
  },
  {
    scale: 'Cognitive Stress',
    dimension: 'CS',
    items: [
      { id: 'CS1', question: 'How often have you had problems concentrating?', level: 'LONG', responseType: 9 },
      { id: 'CS2', question: 'How often have you found it difficult to think clearly?', level: 'LONG', responseType: 9 },
      { id: 'CS3', question: 'How often have you had difficulty in taking decisions?', level: 'LONG', responseType: 9 },
      { id: 'CS4', question: 'How often have you had difficulty with remembering?', level: 'LONG', responseType: 9 }
    ]
  },
  {
    scale: 'Depressive Symptoms',
    dimension: 'DS',
    items: [
      { id: 'DS1', question: 'How often have you felt sad?', level: 'LONG', responseType: 9 },
      { id: 'DS2', question: 'How often have you lacked self-confidence?', level: 'LONG', responseType: 9 },
      { id: 'DS3', question: 'How often have you had a bad conscience or felt guilty?', level: 'LONG', responseType: 9 },
      { id: 'DS4', question: 'How often have you lacked interest in everyday things?', level: 'LONG', responseType: 9 }
    ]
  },
  {
    scale: 'Self-Efficacy',
    dimension: 'SE',
    items: [
      { id: 'SE1', question: 'I am always able to solve difficult problems, if I try hard enough.', level: 'LONG', responseType: 10 },
      { id: 'SE2', question: 'If people work against me, I find a way of achieving what I want.', level: 'LONG', responseType: 10 },
      { id: 'SE3', question: 'It is easy for me to stick to my plans and reach my objectives.', level: 'LONG', responseType: 10 },
      { id: 'SE4', question: 'I feel confident that I can handle unexpected events.', level: 'LONG', responseType: 10 },
      { id: 'SE5', question: 'When I have a problem, I can usually find several ways of solving it.', level: 'LONG', responseType: 10 },
      { id: 'SE6', question: 'Regardless of what happens, I usually manage.', level: 'LONG', responseType: 10 }
    ]
  }
];

const merged = {};
const allData = [...data1, ...data2];
allData.forEach(dim => {
  if (!merged[dim.dimension]) merged[dim.dimension] = { dimension: dim.dimension, items: [] };
  dim.items.forEach(item => {
    // avoid duplicates
    if (!merged[dim.dimension].items.find(i => i.id === item.id)) {
      merged[dim.dimension].items.push(item);
    }
  });
});

const core = [];
const middle = [];
const long = [];

Object.values(merged).forEach(dim => {
  dim.items.forEach(item => {
    const q = { id: item.id, text: item.question, dim: dim.dimension, responseType: item.responseType };
    if (item.level === 'CORE') {
      core.push(q);
      middle.push(q);
      long.push(q);
    } else if (item.level === 'MIDDLE') {
      middle.push(q);
      long.push(q);
    } else if (item.level === 'LONG') {
      long.push(q);
    }
  });
});

require('fs').writeFileSync('parsed_copsoq.json', JSON.stringify({ core, middle, long }, null, 2));
console.log('Core: ' + core.length + ' Middle: ' + middle.length + ' Long: ' + long.length);

