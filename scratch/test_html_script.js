
/* ============================================================
   WELLFRAME APPLICATION — Production Implementation
   ============================================================ */

const App = (() => {

  /* ---------- STATE ---------- */
  const state = {
    currentView: 'landing',
    user: {
      name: 'Amara Okafor',
      email: 'amara.okafor@wellframe.io',
      role: 'HR Director',
      avatar: 'AD'
    },
    settings: {
      emailNotifications: true,
      pulseReminders: true,
      managerVisibility: false,
      anonymousMode: true,
      weeklyDigest: true,
      darkMode: false
    },
    notifications: [
      { id: 1, icon: 'critical', title: 'Sales team — severe stress spike', desc: 'PSS-10 moderate+ up 18% in 14 days. Recommend pulse check-in.', time: '2 hours ago', read: false },
      { id: 2, icon: 'moderate', title: 'Engineering fatigue above threshold', desc: 'FAS-10 scores shifted from healthy to adjusting after release week.', time: 'Yesterday', read: false },
      { id: 3, icon: 'info', title: 'Quarterly COPSOQ-II opens Monday', desc: 'Scheduled deployment to 1,842 employees on Monday 09:00.', time: '2 days ago', read: false },
      { id: 4, icon: 'moderate', title: 'Operations night-shift cohort', desc: '28% response drop. Consider schedule-aware reminders.', time: '3 days ago', read: true },
      { id: 5, icon: 'info', title: 'New: FAS-10 fatigue module available', desc: 'Add fatigue tracking to your quarterly pulse.', time: '5 days ago', read: true },
      { id: 6, icon: 'info', title: 'Board report ready for download', desc: 'Q3 wellness summary is available in HR Analytics → Export.', time: '1 week ago', read: true }
    ],
    surveyProgress: {
      phq9: { completed: true, lastTaken: '4d ago' },
      gad7: { completed: true, lastTaken: '4d ago' },
      pss10: { completed: false, progress: 6, total: 10 },
      fas10: { completed: false },
      copsoq: { completed: false }
    },
    wellbeing: {
      score: 74,
      marker: 22,
      dimensions: [
        { label: 'Mood', value: 74, status: 'healthy' },
        { label: 'Calm', value: 66, status: 'healthy' },
        { label: 'Stress', value: 48, status: 'moderate' },
        { label: 'Energy', value: 55, status: 'moderate' },
        { label: 'Work-fit', value: 77, status: 'healthy' }
      ]
    },
    hrFilters: {
      department: 'all',
      role: 'all',
      time: '30',
      metric: 'phq9'
    },
    charts: {},
    cmdSelectedIndex: 0,
    cmdItems: []
  };

  /* ---------- SURVEY DEFINITIONS ---------- */
  const surveys = {
    phq9: {
      code: 'PHQ-9', title: 'Depression self-check',
      questions: [
        'Over the last two weeks, how often have you felt little interest or pleasure in doing things?',
        'Over the last two weeks, how often have you felt down, depressed, or hopeless?',
        'Over the last two weeks, how often have you had trouble falling/staying asleep, or sleeping too much?',
        'Over the last two weeks, how often have you felt tired or had little energy?',
        'Over the last two weeks, how often have you had poor appetite or overeaten?',
        'Over the last two weeks, how often have you felt bad about yourself — that you are a failure or let people down?',
        'Over the last two weeks, how often have you had trouble concentrating on things like reading or watching TV?',
        'Over the last two weeks, how often have you moved or spoken so slowly others noticed — or so fidgety you moved a lot more than usual?',
        'Over the last two weeks, how often have you had thoughts that you would be better off dead, or of hurting yourself in some way?'
      ]
    },
    gad7: {
      code: 'GAD-7', title: 'Anxiety self-check',
      questions: [
        'Over the last two weeks, how often have you felt nervous, anxious, or on edge?',
        'Over the last two weeks, how often have you not been able to stop or control worrying?',
        'Over the last two weeks, how often have you found yourself worrying about different things?',
        'Over the last two weeks, how often have you had trouble relaxing?',
        'Over the last two weeks, how often have you been so restless that it is hard to sit still?',
        'Over the last two weeks, how often have you become easily annoyed or irritable?',
        'Over the last two weeks, how often have you felt afraid as if something awful might happen?'
      ]
    },
    pss10: {
      code: 'PSS-10', title: 'Perceived stress scale',
      questions: [
        'In the last month, how often have you felt unable to control the important things in your life?',
        'In the last month, how often have you felt confident about your ability to handle your personal problems?',
        'In the last month, how often have you felt that things were going your way?',
        'In the last month, how often have you felt that difficulties were piling up so high you could not overcome them?',
        'In the last month, how often have you been upset because of something that happened unexpectedly?',
        'In the last month, how often have you felt nervous and stressed?',
        'In the last month, how often have you been able to control irritations in your life?',
        'In the last month, how often have you felt that you were on top of things?',
        'In the last month, how often have you been angered because of things outside your control?',
        'In the last month, how often have you felt difficulties were so great you could not overcome them?'
      ]
    },
    fas10: {
      code: 'FAS-10', title: 'Fatigue assessment',
      questions: [
        'In the past month, how often have you felt physically exhausted?',
        'In the past month, how often have you felt mentally exhausted?',
        'In the past month, how often have you had trouble concentrating?',
        'In the past month, how often has fatigue interfered with your work or daily activities?',
        'In the past month, how often have you felt too tired to start tasks?',
        'In the past month, how often have you needed to rest more than usual?',
        'In the past month, how often have you felt too tired to socialize?',
        'In the past month, how often have you had trouble recovering after exertion?',
        'In the past month, how often have you felt sleepy during the day?',
        'In the past month, how often has fatigue affected your mood?'
      ]
    },
    copsoq: {
      code: 'COPSOQ-II', title: 'Work environment',
      questions: [
        'How often do you have to work very fast?',
        'How often do you find your work demanding?',
        'How often do you have the possibility to learn new things at work?',
        'How often does your work give you the opportunity to use your skills and knowledge?',
        'How often do you have influence on your work pace?',
        'How often do you have influence on what tasks you do?',
        'How often does your immediate supervisor help you with work challenges?',
        'How often do colleagues support you when needed?',
        'How often do you feel your work is recognized and valued?',
        'How often can you predict when work demands will increase?',
        'How often do you feel your job offers clear role clarity?',
        'How often do you feel your workload is sustainable long-term?'
      ]
    }
  };

  const surveyOptions = [
    { text: 'Not at all', value: 0 },
    { text: 'Several days', value: 1 },
    { text: 'More than half the days', value: 2 },
    { text: 'Nearly every day', value: 3 }
  ];

  /* ---------- DATA ---------- */
  const heatmapDepts = [
    { dept: 'Engineering', scores: [22, 28, 35, 40, 32, 18, 25] },
    { dept: 'Sales', scores: [45, 52, 68, 58, 48, 38, 55] },
    { dept: 'Operations', scores: [38, 42, 48, 44, 50, 32, 41] },
    { dept: 'Human Resources', scores: [28, 30, 32, 35, 28, 22, 26] },
    { dept: 'Finance', scores: [32, 36, 40, 42, 38, 28, 34] },
    { dept: 'Marketing', scores: [25, 30, 38, 36, 30, 24, 29] },
    { dept: 'Customer Success', scores: [42, 48, 55, 50, 46, 35, 44] }
  ];
  const heatmapDims = ['Mood', 'Calm', 'Stress', 'Energy', 'Sleep', 'Work-fit', 'Social'];

  const deptData = [
    { name: 'Human Resources', score: 81, trend: '+4.2', color: '#4FB286', count: 24 },
    { name: 'Engineering', score: 78, trend: '+2.8', color: '#4FB286', count: 412 },
    { name: 'Marketing', score: 74, trend: '+1.6', color: '#4FB286', count: 86 },
    { name: 'Finance', score: 71, trend: '+0.4', color: '#4FB286', count: 64 },
    { name: 'Operations', score: 67, trend: '-1.2', color: '#E8A33D', count: 298 },
    { name: 'Customer Success', score: 64, trend: '-2.1', color: '#E8A33D', count: 184 },
    { name: 'Sales', score: 58, trend: '-4.8', color: '#E5646E', count: 774 }
  ];

  const resources = [
    { cat: 'Breathing & relaxation', items: [
      { title: 'Box breathing for acute stress', meta: '4 min · Audio guided', color: 'linear-gradient(135deg, #00B7C3, #0078D4)', icon: 'breath' },
      { title: '4-7-8 breath for sleep onset', meta: '5 min · Audio guided', color: 'linear-gradient(135deg, #7000FF, #0078D4)', icon: 'moon' },
      { title: 'Progressive muscle relaxation', meta: '12 min · Video', color: 'linear-gradient(135deg, #4FB286, #00B7C3)', icon: 'activity' }
    ]},
    { cat: 'Cognitive exercises', items: [
      { title: 'Reframing catastrophic thoughts', meta: '7 min · Interactive', color: 'linear-gradient(135deg, #0078D4, #7000FF)', icon: 'brain' },
      { title: 'Gratitude practice — 3 good things', meta: '5 min · Worksheet', color: 'linear-gradient(135deg, #4FB286, #00B7C3)', icon: 'heart' },
      { title: 'Values clarification exercise', meta: '15 min · Worksheet', color: 'linear-gradient(135deg, #00B7C3, #0078D4)', icon: 'compass' }
    ]},
    { cat: 'Sleep & recovery', items: [
      { title: 'Sleep hygiene for shift workers', meta: '7 min · Article', color: 'linear-gradient(135deg, #7000FF, #0078D4)', icon: 'moon' },
      { title: 'Building a wind-down routine', meta: '6 min · Article', color: 'linear-gradient(135deg, #4FB286, #7000FF)', icon: 'moon' },
      { title: 'Recovery between shifts', meta: '8 min · Article', color: 'linear-gradient(135deg, #00B7C3, #4FB286)', icon: 'activity' }
    ]},
    { cat: 'Movement & body', items: [
      { title: 'Desk mobility — 5 minute reset', meta: '5 min · Video', color: 'linear-gradient(135deg, #4FB286, #00B7C3)', icon: 'activity' },
      { title: 'Walking meditation', meta: '10 min · Audio', color: 'linear-gradient(135deg, #0078D4, #00B7C3)', icon: 'wind' }
    ]},
    { cat: 'Immediate support', items: [
      { title: 'Talk to an EAP counselor', meta: 'Confidential · 24/7', color: 'linear-gradient(135deg, #4FB286, #00B7C3)', icon: 'phone' },
      { title: 'Crisis support line', meta: '988 · Available 24/7', color: 'linear-gradient(135deg, #E5646E, #B23A48)', icon: 'phone' },
      { title: 'Request occupational health referral', meta: 'Confidential · Manager not notified', color: 'linear-gradient(135deg, #7000FF, #0078D4)', icon: 'file' }
    ]}
  ];

  const resourceIcons = {
    breath: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a10 10 0 1 0 10 10"/><path d="M22 2 12 12"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    activity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',
    brain: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2z"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>',
    wind: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
  };

  const alertItems = [
    { icon: 'critical', title: 'Sales team · Severe stress spike', desc: 'PSS-10 moderate+ up 18% in 14 days. Recommend pulse check-in.', time: '2 hours ago' },
    { icon: 'moderate', title: 'Engineering · Fatigue above threshold', desc: 'FAS-10 scores shifted from healthy to adjusting after release week.', time: 'Yesterday' },
    { icon: 'info', title: 'Quarterly COPSOQ-II window opens', desc: 'Scheduled deployment to 1,842 employees on Monday.', time: '2 days ago' },
    { icon: 'moderate', title: 'Operations night-shift cohort', desc: '28% response drop. Consider schedule-aware reminders.', time: '3 days ago' }
  ];

  /* ---------- HELPERS ---------- */
  function $(s) { return document.querySelector(s); }
  function $$(s) { return document.querySelectorAll(s); }
  function el(tag, cls, html) { const e = document.createElement(tag); if(cls) e.className = cls; if(html !== undefined) e.innerHTML = html; return e; }
  function riskColor(s) { return s < 30 ? '#4FB286' : s < 40 ? '#7DBE8B' : s < 50 ? '#E8A33D' : s < 65 ? '#E5646E' : '#B23A48'; }
  function statusLabel(v) { return v >= 70 ? 'healthy' : v >= 50 ? 'moderate' : 'critical'; }
  function statusText(s) { return s === 'healthy' ? 'Healthy' : s === 'moderate' ? 'Adjusting' : 'At risk'; }
  function statusColor(s) { return s === 'healthy' ? '#4FB286' : s === 'moderate' ? '#E8A33D' : '#E5646E'; }

  /* ---------- TOAST ---------- */
  function toast(title, desc, type = 'info') {
    const container = $('#toastContainer');
    const t = el('div', 'toast ' + type);
    const icons = {
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
      success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
      warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
    };
    t.innerHTML = `<div class="toast-icon">${icons[type] || icons.info}</div><div style="flex:1;"><div class="toast-title">${title}</div>${desc ? `<div class="toast-desc">${desc}</div>` : ''}</div><button class="toast-close" aria-label="Dismiss"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>`;
    container.appendChild(t);
    const remove = () => { t.style.animation = 'toastSlide 0.3s reverse forwards'; setTimeout(() => t.remove(), 300); };
    t.querySelector('.toast-close').addEventListener('click', remove);
    setTimeout(remove, 4500);
  }

  /* ---------- NAVIGATION ---------- */
  function navigate(view) {
    state.currentView = view;
    $$('.view').forEach(v => v.classList.remove('active'));
    $('#view-' + view).classList.add('active');
    $$('.nav-item[data-view]').forEach(n => n.classList.toggle('active', n.dataset.view === view));
    window.scrollTo({ top: 0, behavior: 'smooth' });
    closeAllDropdowns();
    if (view === 'employee') {
      renderWellbeing();
      renderSurveys();
      renderRecommended();
      setTimeout(initEmployeeChart, 100);
    }
    if (view === 'hr') {
      renderKPIs();
      setTimeout(() => { initSeverityChart(); initRadarChart(); }, 100);
      renderHeatmap();
      renderDeptList();
      renderAlerts();
    }
  }

  /* ---------- DROPDOWN ---------- */
  function toggleDropdown() {
    const dd = $('#profileDropdown');
    const btn = $('#profileBtn');
    const isOpen = dd.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen);
  }
  function closeAllDropdowns() {
    $('#profileDropdown').classList.remove('open');
    $('#profileBtn').setAttribute('aria-expanded', 'false');
  }

  /* ---------- COMMAND PALETTE ---------- */
  const cmdIndex = [
    { group: 'Navigate', items: [
      { title: 'Go to Platform', desc: 'Landing page', icon: 'home', action: () => navigate('landing') },
      { title: 'Go to My Wellness', desc: 'Employee dashboard', icon: 'heart', action: () => navigate('employee') },
      { title: 'Go to HR Analytics', desc: 'Admin dashboard', icon: 'chart', action: () => navigate('hr') }
    ]},
    { group: 'Surveys', items: [
      { title: 'Start PHQ-9', desc: 'Depression self-check · 3 min', icon: 'clipboard', action: () => { navigate('employee'); setTimeout(() => openSurvey('phq9'), 300); } },
      { title: 'Start GAD-7', desc: 'Anxiety self-check · 2 min', icon: 'clipboard', action: () => { navigate('employee'); setTimeout(() => openSurvey('gad7'), 300); } },
      { title: 'Start PSS-10', desc: 'Perceived stress · 4 min', icon: 'clipboard', action: () => { navigate('employee'); setTimeout(() => openSurvey('pss10'), 300); } },
      { title: 'Start FAS-10', desc: 'Fatigue assessment · 4 min', icon: 'clipboard', action: () => { navigate('employee'); setTimeout(() => openSurvey('fas10'), 300); } },
      { title: 'Start COPSOQ-II', desc: 'Work environment · 12 min', icon: 'clipboard', action: () => { navigate('employee'); setTimeout(() => openSurvey('copsoq'), 300); } }
    ]},
    { group: 'Actions', items: [
      { title: 'Open Resources', desc: 'Self-care library', icon: 'book', action: () => openResources() },
      { title: 'View Notifications', desc: state.notifications.filter(n => !n.read).length + ' unread', icon: 'bell', action: () => openNotifications() },
      { title: 'Open Settings', desc: 'Preferences & privacy', icon: 'gear', action: () => openSettings() },
      { title: 'Export HR Report', desc: 'CSV / PDF download', icon: 'download', action: () => { navigate('hr'); setTimeout(() => openExport(), 300); } },
      { title: 'Launch Pulse Survey', desc: 'Send to employees', icon: 'send', action: () => { navigate('hr'); setTimeout(() => openPulseBuilder(), 300); } },
      { title: 'Book a Demo', desc: 'Schedule with specialist', icon: 'play', action: () => bookDemo() },
      { title: 'Start Free Trial', desc: 'Set up workspace', icon: 'rocket', action: () => startTrial() }
    ]}
  ];

  const cmdIcons = {
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>',
    chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>',
    clipboard: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>',
    bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>',
    play: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
    rocket: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>'
  };

  function openCmdPalette() {
    $('#cmdBackdrop').classList.add('show');
    $('#cmdPalette').classList.add('open');
    $('#cmdInput').value = '';
    $('#cmdInput').focus();
    renderCmdResults('');
  }
  function closeCmdPalette() {
    $('#cmdBackdrop').classList.remove('show');
    $('#cmdPalette').classList.remove('open');
  }
  function renderCmdResults(query) {
    const q = query.toLowerCase().trim();
    const results = $('#cmdResults');
    results.innerHTML = '';
    state.cmdItems = [];
    
    let groups = cmdIndex;
    if (q) {
      groups = cmdIndex.map(g => ({
        group: g.group,
        items: g.items.filter(it => it.title.toLowerCase().includes(q) || it.desc.toLowerCase().includes(q))
      })).filter(g => g.items.length > 0);
    }
    
    if (groups.length === 0) {
      results.innerHTML = '<div class="cmd-empty">No results found. Try "survey", "export", or "settings".</div>';
      return;
    }
    
    groups.forEach(g => {
      const label = el('div', 'cmd-group-label', g.group);
      results.appendChild(label);
      g.items.forEach(item => {
        const idx = state.cmdItems.length;
        state.cmdItems.push(item);
        const it = el('div', 'cmd-item');
        if (idx === state.cmdSelectedIndex) it.classList.add('selected');
        it.innerHTML = `<div class="cmd-item-icon">${cmdIcons[item.icon] || ''}</div><div class="cmd-item-text"><div class="cmd-item-title">${item.title}</div><div class="cmd-item-desc">${item.desc}</div></div>`;
        it.addEventListener('click', () => { item.action(); closeCmdPalette(); });
        it.addEventListener('mouseenter', () => {
          state.cmdSelectedIndex = idx;
          $$('.cmd-item').forEach((e, i) => e.classList.toggle('selected', i === idx));
        });
        results.appendChild(it);
      });
    });
  }
  function cmdNavigate(dir) {
    const max = state.cmdItems.length;
    if (max === 0) return;
    state.cmdSelectedIndex = (state.cmdSelectedIndex + dir + max) % max;
    $$('.cmd-item').forEach((e, i) => e.classList.toggle('selected', i === state.cmdSelectedIndex));
    const sel = $$('.cmd-item')[state.cmdSelectedIndex];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function cmdSelect() {
    if (state.cmdItems[state.cmdSelectedIndex]) {
      state.cmdItems[state.cmdSelectedIndex].action();
      closeCmdPalette();
    }
  }

  /* ---------- NOTIFICATIONS ---------- */
  function openNotifications() {
    $('#notifBackdrop').classList.add('open');
    $('#notifPanel').classList.add('open');
    renderNotifications();
    closeAllDropdowns();
  }
  function closeNotifications() {
    $('#notifBackdrop').classList.remove('open');
    $('#notifPanel').classList.remove('open');
  }
  function renderNotifications() {
    const body = $('#notifBody');
    body.innerHTML = '';
    if (state.notifications.length === 0) {
      body.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--text-3);">No notifications</div>';
      return;
    }
    const iconColors = { critical: 'rgba(229,100,110,0.12)', moderate: 'rgba(232,163,61,0.12)', info: 'var(--accent-soft)' };
    const iconFg = { critical: 'var(--critical)', moderate: 'var(--moderate)', info: 'var(--accent-deep)' };
    const iconSvgs = {
      critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
      moderate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
      info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    state.notifications.forEach(n => {
      const item = el('div', 'notif-item' + (n.read ? '' : ' unread'));
      item.innerHTML = `<div class="notif-icon" style="background: ${iconColors[n.icon]}; color: ${iconFg[n.icon]};">${iconSvgs[n.icon]}</div><div class="notif-content"><div class="notif-title">${n.title}</div><div class="notif-desc">${n.desc}</div><div class="notif-time">${n.time}</div></div>`;
      item.addEventListener('click', () => {
        n.read = true;
        renderNotifications();
        updateNotifBadge();
      });
      body.appendChild(item);
    });
  }
  function markAllRead() {
    state.notifications.forEach(n => n.read = true);
    renderNotifications();
    updateNotifBadge();
    toast('All notifications marked as read', null, 'success');
  }
  function updateNotifBadge() {
    const unread = state.notifications.filter(n => !n.read).length;
    const badge = $('#notifBadge');
    badge.style.display = unread > 0 ? 'block' : 'none';
  }

  /* ---------- MODALS ---------- */
  function openSettingsForm() {
    const bodyHtml = `
      <div style="margin-bottom:16px;">
        <label style="display:block;margin-bottom:8px;font-weight:600;">EAP Hotline Number</label>
        <input type="text" id="settingsEap" class="input" style="width:100%" placeholder="e.g. 1-800-EAP-HELP">
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;margin-bottom:8px;font-weight:600;">Crisis Number</label>
        <input type="text" id="settingsCrisis" class="input" style="width:100%" placeholder="e.g. 988">
      </div>
      <div style="margin-bottom:16px;">
        <label style="display:block;margin-bottom:8px;font-weight:600;">Occupational Health Email</label>
        <input type="email" id="settingsOccEmail" class="input" style="width:100%" placeholder="e.g. occhealth@example.com">
      </div>
    `;
    const footHtml = `
      <button class="btn btn-ghost" onclick="App.closeGeneric()">Cancel</button>
      <button class="btn btn-primary" onclick="App.saveSettingsForm()">Save Settings</button>
    `;
    openGeneric('ADMIN PANEL', 'Support Configuration', bodyHtml, footHtml);
  }

  function saveSettingsForm() {
    const eap_number = $('#settingsEap').value;
    const crisis_number = $('#settingsCrisis').value;
    const occupational_health_contact = $('#settingsOccEmail').value;
    
    // Simulate API Call to PATCH /api/v1/tenant/support-settings
    console.log('Sending PATCH /api/v1/tenant/support-settings', { eap_number, crisis_number, occupational_health_contact });
    toast('Settings updated', 'Support configuration saved successfully.', 'success');
    closeGeneric();
  }

  function submitReferral() {
    // Simulate API Call to POST /api/v1/referrals/occupational-health
    console.log('Sending POST /api/v1/referrals/occupational-health', {
      name: 'Current User',
      contact_info: 'user@example.com'
    });
    toast('Referral Submitted', 'Your secure request has been sent to occupational health.', 'success');
    closeGeneric();
  }

  /* ---------- RESOURCES ---------- */
  function openResources() {
    $('#resBackdrop').classList.add('open');
    $('#resPanel').classList.add('open');
    renderResources();
    closeAllDropdowns();
  }
  function closeResources() {
    $('#resBackdrop').classList.remove('open');
    $('#resPanel').classList.remove('open');
  }
  function renderResources(filter) {
    const body = $('#resBody');
    body.innerHTML = '';
    const f = (filter || '').toLowerCase().trim();
    let total = 0;
    resources.forEach(cat => {
      const items = f ? cat.items.filter(it => it.title.toLowerCase().includes(f) || it.meta.toLowerCase().includes(f)) : cat.items;
      if (items.length === 0) return;
      total += items.length;
      const c = el('div', 'res-category');
      c.innerHTML = `<div class="res-category-title">${cat.cat}</div>`;
      items.forEach(item => {
        const it = el('div', 'res-item');
        it.innerHTML = `<div class="res-thumb" style="background: ${item.color};">${resourceIcons[item.icon] || ''}</div><div class="res-info"><div class="res-title">${item.title}</div><div class="res-meta">${item.meta}</div></div>`;
        it.addEventListener('click', () => {
          let body = '';
          if (item.meta.includes('Audio') || item.meta.includes('Video')) {
             let yt = '1vpz6xOUZ5w'; // default
             if (item.title.toLowerCase().includes('box breathing')) yt = 'tEmt1Znux58';
             else if (item.title.toLowerCase().includes('progressive')) yt = 'ihO02wUzgkc';
             else if (item.title.toLowerCase().includes('desk')) yt = 'tAUf7aajBWE';
             else if (item.title.toLowerCase().includes('walking')) yt = 'Qd9lAunE1-E';
             
             body = `<div style="position:relative;padding-bottom:56.25%;height:0;margin-bottom:16px;border-radius:8px;overflow:hidden;"><iframe src="https://www.youtube-nocookie.com/embed/${yt}?rel=0&modestbranding=1" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allow="autoplay; encrypted-media" allowfullscreen></iframe></div><p style="color:var(--text-2);font-size:0.9rem;">${item.meta}</p>`;
          } else if (item.meta.includes('Article') || item.meta.includes('Worksheet') || item.meta.includes('Interactive')) {
             let text = `This is a functional placeholder for the ${item.title} exercise.`;
             if (item.title.includes('Sleep hygiene')) text = '<b>1. Light Exposure:</b> Limit light exposure when traveling home from a night shift.<br><br><b>2. Sleep Environment:</b> Invest in blackout curtains and a white noise machine.<br><br><b>3. Consistency:</b> Keep the same sleep schedule even on your days off when possible.';
             if (item.title.includes('wind-down')) text = '<b>Minutes 1-10:</b> Disconnect from screens and put devices in another room.<br><br><b>Minutes 11-20:</b> Engage in light hygiene routines.<br><br><b>Minutes 21-30:</b> Do a low-cognitive task like reading fiction.';
             if (item.title.includes('Reframing')) text = '<i>Interactive Wizard:</i><br><br>1. What is the catastrophic thought?<br><br>2. What is the worst-case scenario?<br><br>3. What is the most likely scenario?';
             
             body = `<div style="padding:20px;background:var(--bg-base);border-radius:var(--radius-sm); border: 1px solid var(--border);"><h4 style="margin-bottom:12px;">${item.title}</h4><p style="color:var(--text-2);line-height:1.6;font-size:0.9rem;">${text}</p></div>`;
          } else if (item.title.toLowerCase().includes('occupational health referral')) {
             body = `<div style="padding:24px;text-align:center;"><div style="width:56px;height:56px;border-radius:50%;background:rgba(112,0,255,0.1);color:var(--purple);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">${resourceIcons.file}</div><h3 style="margin-bottom:8px;">${item.title}</h3><p style="color:var(--text-2);margin-bottom:24px;">This will generate a secure, isolated email containing ONLY your name and contact info. Your survey data remains anonymous and is not attached.</p><button class="btn btn-primary" onclick="App.submitReferral();">Request Referral</button></div>`;
          } else if (item.meta.includes('Confidential') || item.meta.includes('24/7')) {
             body = `<div style="padding:24px;text-align:center;"><div style="width:56px;height:56px;border-radius:50%;background:rgba(229,100,110,0.1);color:var(--critical);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">${resourceIcons.phone}</div><h3 style="margin-bottom:8px;">${item.title}</h3><p style="color:var(--text-2);margin-bottom:24px;">${item.meta}</p><button class="btn btn-primary" onclick="App.toast('Call initiated', 'Dialing secure line...', 'success'); App.closeGeneric();">Connect Now</button></div>`;
          } else {
             body = `<p style="color:var(--text-2);">Opening ${item.title}...</p>`;
          }
          openGeneric('RESOURCE', item.cat, body, `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Close</button>`);
        });
        c.appendChild(it);
      });
      body.appendChild(c);
    });
    if (total === 0) {
      body.innerHTML = '<div style="padding: 40px 20px; text-align: center; color: var(--text-3);">No resources match your search.</div>';
    }
  }

  /* ---------- EMPLOYEE VIEW ---------- */
  function renderWellbeing() {
    const wb = state.wellbeing;
    const marker = $('#balanceMarker');
    if (marker) {
      marker.style.left = wb.marker + '%';
      marker.style.borderColor = wb.score >= 70 ? '#4FB286' : wb.score >= 50 ? '#E8A33D' : '#E5646E';
    }
    const status = $('#wellbeingStatus');
    if (status) {
      const s = statusLabel(wb.score);
      status.style.background = s === 'healthy' ? 'rgba(79,178,134,0.12)' : s === 'moderate' ? 'rgba(232,163,61,0.12)' : 'rgba(229,100,110,0.12)';
      status.style.color = statusColor(s);
      status.textContent = s === 'healthy' ? 'Healthy · Stable' : s === 'moderate' ? 'Adjusting · Monitor' : 'At risk · Support advised';
    }
    const breakdown = $('#wellbeingBreakdown');
    if (breakdown) {
      breakdown.innerHTML = '';
      wb.dimensions.forEach(d => {
        const circumference = 2 * Math.PI * 24;
        const offset = circumference - (d.value / 100) * circumference;
        const s = statusLabel(d.value);
        const item = el('div', 'breakdown-item');
        item.innerHTML = `<div class="breakdown-ring"><svg viewBox="0 0 56 56"><circle class="track" cx="28" cy="28" r="24"/><circle class="fill" cx="28" cy="28" r="24" stroke="${statusColor(s)}" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"/></svg><div class="breakdown-ring-text">${d.value}</div></div><div class="breakdown-label">${d.label}</div><div class="breakdown-status" style="color: ${statusColor(s)};">${statusText(s)}</div>`;
        breakdown.appendChild(item);
      });
    }
  }

  function renderSurveys() {
    const grid = $('#surveysGrid');
    if (!grid) return;
    grid.innerHTML = '';
    const surveyMeta = [
      { id: 'phq9', code: 'PHQ-9', title: 'Depression self-check', desc: 'Nine questions on mood, motivation, and energy over the past two weeks.', time: '3 min' },
      { id: 'gad7', code: 'GAD-7', title: 'Anxiety self-check', desc: 'Seven questions on nervousness, worry, and restlessness over the past two weeks.', time: '2 min' },
      { id: 'pss10', code: 'PSS-10', title: 'Perceived stress scale', desc: 'Ten questions on how unpredictable, uncontrollable, and overloaded life feels.', time: '4 min' },
      { id: 'fas10', code: 'FAS-10', title: 'Fatigue assessment', desc: 'Ten questions on physical and mental fatigue, and their impact on daily function.', time: '4 min' },
      { id: 'copsoq', code: 'COPSOQ-II', title: 'Work environment', desc: 'Copenhagen Psychosocial Questionnaire — demands, influence, support, and recognition at work.', time: '12 min' }
    ];
    surveyMeta.forEach(s => {
      const p = state.surveyProgress[s.id];
      const card = el('article', 'survey-card' + (p.completed ? ' completed' : ''));
      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Start ${s.code} survey`);
      let statusHtml = '';
      if (p.completed) {
        statusHtml = `<span class="survey-status done">Completed</span>`;
      } else if (p.progress) {
        statusHtml = `<span class="survey-status progress">In progress</span>`;
      } else {
        statusHtml = `<span class="survey-status">Not started</span>`;
      }
      const lastText = p.completed ? `Last taken ${p.lastTaken}` : p.progress ? `${p.progress} of ${p.total} done` : 'Never taken';
      card.innerHTML = `<div class="survey-head"><span class="survey-code">${s.code}</span>${statusHtml}</div><h3>${s.title}</h3><p class="desc">${s.desc}</p><div class="survey-meta"><span class="survey-time"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>${s.time} · ${lastText}</span><div class="survey-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></div></div>`;
      card.addEventListener('click', () => openSurvey(s.id));
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openSurvey(s.id); } });
      grid.appendChild(card);
    });
  }

  function renderRecommended() {
    const list = $('#recommendedList');
    if (!list) return;
    list.innerHTML = '';
    const recs = [
      { title: 'Box breathing for acute stress', meta: '4 min · Audio guided', color: 'linear-gradient(135deg, #00B7C3, #0078D4)', icon: 'breath' },
      { title: 'Sleep hygiene for shift workers', meta: '7 min · Article', color: 'linear-gradient(135deg, #7000FF, #0078D4)', icon: 'moon' },
      { title: 'Talk to an EAP counselor', meta: 'Confidential · 24/7', color: 'linear-gradient(135deg, #4FB286, #00B7C3)', icon: 'phone' }
    ];
    recs.forEach(r => {
      const a = el('a', 'resource-item');
      a.href = '#';
      a.innerHTML = `<div class="resource-thumb" style="background: ${r.color};">${resourceIcons[r.icon]}</div><div class="resource-info"><div class="resource-title">${r.title}</div><div class="resource-meta">${r.meta}</div></div>`;
      a.addEventListener('click', (e) => { e.preventDefault(); toast('Resource opened', r.title, 'success'); });
      list.appendChild(a);
    });
  }

  /* ---------- SURVEY MODAL ---------- */
  let currentSurvey = null;
  let currentQ = 0;
  let selectedOption = null;
  let surveyAnswers = [];

  function openSurvey(id) {
    currentSurvey = surveys[id];
    currentQ = 0;
    selectedOption = null;
    surveyAnswers = new Array(currentSurvey.questions.length).fill(null);
    $('#modalCode').textContent = currentSurvey.code;
    $('#modalTitle').textContent = currentSurvey.title;
    $('#surveyBackdrop').classList.add('show');
    renderQuestion();
    closeAllDropdowns();
  }
  function closeSurvey() {
    $('#surveyBackdrop').classList.remove('show');
  }
  function renderQuestion() {
    const q = currentSurvey.questions[currentQ];
    $('#modalQNum').textContent = `Question ${currentQ + 1} of ${currentSurvey.questions.length}`;
    $('#modalQText').textContent = q;
    $('#modalProgress').style.width = `${((currentQ + 1) / currentSurvey.questions.length) * 100}%`;
    const opts = $('#modalOptions');
    opts.innerHTML = '';
    selectedOption = surveyAnswers[currentQ];
    surveyOptions.forEach((opt, i) => {
      const e = el('div', 'option' + (selectedOption === i ? ' selected' : ''));
      e.setAttribute('role', 'button');
      e.setAttribute('tabindex', '0');
      e.innerHTML = `<div class="option-radio"></div><div class="option-text">${opt.text}</div>`;
      e.addEventListener('click', () => selectOption(i));
      e.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectOption(i); } });
      opts.appendChild(e);
    });
    $('#modalBack').style.visibility = currentQ === 0 ? 'hidden' : 'visible';
    const isLast = currentQ === currentSurvey.questions.length - 1;
    $('#modalNext').innerHTML = isLast
      ? 'Submit<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : 'Next<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>';
  }
  function selectOption(idx) {
    selectedOption = idx;
    surveyAnswers[currentQ] = idx;
    $$('.option').forEach((o, i) => o.classList.toggle('selected', i === idx));
  }
  function surveyNext() {
    if (selectedOption === null) {
      toast('Select an answer', 'Please choose one option to continue.', 'warning');
      return;
    }
    if (currentQ < currentSurvey.questions.length - 1) {
      currentQ++;
      renderQuestion();
    } else {
      // Submit
      const total = surveyAnswers.reduce((a, b) => a + (b || 0), 0);
      const maxScore = surveyAnswers.length * 3;
      const pct = Math.round((total / maxScore) * 100);
      const surveyId = Object.keys(surveys).find(k => surveys[k] === currentSurvey);
      state.surveyProgress[surveyId] = { completed: true, lastTaken: 'just now' };
      // Update wellbeing score (simple simulation)
      if (surveyId === 'phq9' || surveyId === 'gad7') {
        state.wellbeing.score = Math.max(40, 100 - pct);
        state.wellbeing.marker = Math.max(10, 100 - pct - 10);
        state.wellbeing.dimensions[0].value = Math.max(40, 100 - pct); // Mood
        state.wellbeing.dimensions[1].value = Math.max(40, 100 - pct + 5); // Calm
      }
      closeSurvey();
      toast('Check-in submitted', `Your results have been recorded confidentially. Score: ${total}/${maxScore}`, 'success');
      if (state.currentView === 'employee') {
        renderWellbeing();
        renderSurveys();
      }
    }
  }
  function surveyBack() {
    if (currentQ > 0) { currentQ--; renderQuestion(); }
  }

  /* ---------- HR VIEW ---------- */
  function applyFilters() {
    state.hrFilters.department = $('#deptFilter').value;
    state.hrFilters.role = $('#roleFilter').value;
    state.hrFilters.time = $('#timeFilter').value;
    
    // Update subtitle
    const dept = state.hrFilters.department === 'all' ? 'All departments' : state.hrFilters.department;
    const days = state.hrFilters.time;
    $('#hrSubtitle').textContent = `Showing: ${dept} · Last ${days} days · Auto-refreshed`;
    
    // Re-render charts with filter-aware data
    if (state.charts.severity) {
      state.charts.severity.data.datasets.forEach((ds, i) => {
        ds.data = generateSeverityData(i, days);
      });
      state.charts.severity.update();
    }
    if (state.charts.radar) {
      state.charts.radar.data.datasets[0].data = generateRadarData(state.hrFilters.department);
      state.charts.radar.update();
    }
    renderHeatmap();
    renderDeptList();
    renderKPIs();
    toast('Filters applied', `${dept} · Last ${days} days`, 'success');
  }
  function setMetric(btn, metric) {
    state.hrFilters.metric = metric;
    $$('.filter-pill').forEach(p => p.classList.toggle('active', p.dataset.metric === metric));
    $('#severitySubtitle').textContent = `${metric.toUpperCase()} distribution across 4 severity bands, last 8 weeks`;
    if (state.charts.severity) {
      state.charts.severity.data.datasets.forEach((ds, i) => {
        ds.data = generateSeverityData(i, state.hrFilters.time);
      });
      state.charts.severity.update();
    }
    toast('Metric switched', `Now viewing ${metric.toUpperCase()} distribution`, 'info');
  }

  function generateSeverityData(datasetIdx, days) {
    // Generate plausible distribution data; vary by metric & time
    const base = [
      [62, 64, 63, 65, 66, 67, 68, 70], // healthy
      [24, 22, 24, 22, 21, 20, 19, 18], // mild
      [10, 10, 9, 9, 9, 9, 9, 8],       // moderate
      [4, 4, 4, 4, 4, 4, 4, 4]           // severe
    ];
    const factor = parseInt(days) / 30;
    return base[datasetIdx].map(v => {
      let adjusted = v + (Math.random() - 0.5) * 6 * factor;
      if (state.hrFilters.metric === 'gad7') adjusted += datasetIdx === 0 ? -2 : 1;
      if (state.hrFilters.metric === 'pss10') adjusted += datasetIdx === 2 ? 2 : 0;
      if (state.hrFilters.metric === 'fas10') adjusted += datasetIdx === 1 ? 2 : 0;
      if (state.hrFilters.department !== 'all') adjusted += (Math.random() - 0.5) * 4;
      return Math.max(2, Math.min(90, Math.round(adjusted)));
    });
  }
  function generateRadarData(dept) {
    const base = [74, 66, 48, 55, 62, 77, 70, 68];
    if (dept === 'Sales') return base.map(v => Math.max(35, v - 12 + Math.floor(Math.random() * 4)));
    if (dept === 'Engineering') return base.map(v => Math.max(45, v + 3 + Math.floor(Math.random() * 4)));
    if (dept === 'Human Resources') return base.map(v => Math.min(95, v + 7 + Math.floor(Math.random() * 4)));
    return base.map(v => v + Math.floor((Math.random() - 0.5) * 4));
  }

  function renderKPIs() {
    const grid = $('#kpiGrid');
    if (!grid) return;
    const deptMult = state.hrFilters.department === 'all' ? 1842 : deptData.find(d => d.name === state.hrFilters.department)?.count || 200;
    const kpis = [
      { label: 'Total participants', value: deptMult.toLocaleString(), trend: '+12.4% vs last period', dir: 'up', icon: 'teal', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' },
      { label: 'Avg wellbeing index', value: '74.2', trend: '+3.1 pts', dir: 'up', icon: 'blue', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' },
      { label: 'Response rate', value: '91%', trend: '+5.0 pts', dir: 'up', icon: 'purple', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' },
      { label: 'At-risk employees', value: Math.round(deptMult * 0.082).toString(), trend: '+8 this period', dir: 'down', icon: 'critical', svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' }
    ];
    grid.innerHTML = '';
    kpis.forEach(k => {
      const card = el('div', 'kpi-card');
      const trendIcon = k.dir === 'up'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
      card.innerHTML = `<div class="kpi-top"><span class="kpi-label">${k.label}</span><div class="kpi-icon ${k.icon}">${k.svg}</div></div><div class="kpi-value">${k.value}</div><span class="kpi-trend ${k.dir}">${trendIcon}${k.trend}</span>`;
      grid.appendChild(card);
    });
  }

  async function initSeverityChart() {
    const ctx = $('#severityChart');
    if (!ctx) return;
    if (state.charts.severity) { state.charts.severity.destroy(); }
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/hr/severity-trends', { headers: { 'Authorization': 'Bearer ' + token } });
      const { success, labels, datasets } = await res.json();
      
      let chartLabels = success && labels && labels.length ? labels : ['W1','W2','W3','W4','W5','W6','W7','W8'];
      let healthy = success && datasets && datasets.healthy && datasets.healthy.length ? datasets.healthy : [65, 62, 60, 58, 55, 52, 50, 48];
      let mild = success && datasets && datasets.mild && datasets.mild.length ? datasets.mild : [20, 22, 23, 25, 27, 28, 29, 30];
      let moderate = success && datasets && datasets.moderate && datasets.moderate.length ? datasets.moderate : [10, 11, 12, 12, 13, 14, 15, 16];
      let severe = success && datasets && datasets.severe && datasets.severe.length ? datasets.severe : [5, 5, 5, 5, 5, 6, 6, 6];
      
      state.charts.severity = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: chartLabels,
          datasets: [
            { label: 'Healthy', data: healthy, backgroundColor: '#4FB286', barPercentage: 0.6, categoryPercentage: 0.8 },
            { label: 'Mild', data: mild, backgroundColor: '#E8A33D', barPercentage: 0.6, categoryPercentage: 0.8 },
            { label: 'Moderate', data: moderate, backgroundColor: '#E25E3E', barPercentage: 0.6, categoryPercentage: 0.8 },
            { label: 'Severe', data: severe, backgroundColor: '#C92A2A', barPercentage: 0.6, categoryPercentage: 0.8 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false, backgroundColor: '#1A1B1E', titleFont: { family: 'Segoe UI', size: 13 }, bodyFont: { family: 'Segoe UI', size: 12 }, padding: 12, cornerRadius: 8, callbacks: { label: function(c) { return ' ' + c.dataset.label + ': ' + c.raw + '%'; } } } },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: '#8A8D93', font: { family: 'Segoe UI', size: 11 } } },
            y: { stacked: true, beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { stepSize: 25, color: '#8A8D93', font: { family: 'Segoe UI', size: 11 }, callback: function(v) { return v + '%'; } } }
          },
          animation: { duration: 1000, easing: 'easeOutQuart' }
        }
      });
    } catch(err) { console.error(err); }
  }

  async function initRadarChart() {
    const ctx = $('#radarChart');
    if (!ctx || state.charts.radar) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/hr/radar', { headers: { 'Authorization': 'Bearer ' + token } });
      const { success, data, averages } = await res.json();
      const chartData = success && data && data.length ? data : [80, 78, 75, 78, 80, 80, 78, 80];
      
      state.charts.radar = new Chart(ctx, {
        type: 'radar',
        data: {
          labels: ['Mood', 'Calm', 'Stress', 'Energy', 'Sleep', 'Work-fit', 'Social', 'Purpose'],
          datasets: [
            { label: 'Current', data: chartData, backgroundColor: 'rgba(0, 183, 195, 0.18)', borderColor: '#00B7C3', borderWidth: 2.5, pointBackgroundColor: '#00B7C3', pointBorderColor: '#fff', pointBorderWidth: 2, pointRadius: 4 },
            { label: 'Target', data: [80, 78, 75, 78, 80, 80, 78, 80], backgroundColor: 'rgba(112, 0, 255, 0.05)', borderColor: 'rgba(112, 0, 255, 0.6)', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 0 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: '#5A5C63', font: { family: 'Segoe UI', size: 12 }, boxWidth: 10, boxHeight: 10, padding: 14 } } },
          scales: { r: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.06)' }, angleLines: { color: 'rgba(0,0,0,0.06)' }, pointLabels: { color: '#1A1B1E', font: { family: 'Segoe UI', size: 11, weight: '600' } }, ticks: { display: false } } },
          animation: { duration: 1400, easing: 'easeOutQuart' }
        }
      });
    } catch(err) {
      console.error(err);
    }
  }

  function initEmployeeChart() {
    const ctx = $('#employeeTrendChart');
    if (!ctx) return;
    if (state.charts.employee) { state.charts.employee.destroy(); }
    const gradient = ctx.getContext('2d').createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(0, 183, 195, 0.25)');
    gradient.addColorStop(1, 'rgba(0, 183, 195, 0.0)');
    state.charts.employee = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Wk 1', 'Wk 2', 'Wk 3', 'Wk 4', 'Wk 5', 'Wk 6', 'Wk 7', 'Wk 8'],
        datasets: [{ label: 'Wellbeing', data: [62, 65, 61, 68, 70, 67, 72, 74], borderColor: '#00B7C3', backgroundColor: gradient, borderWidth: 2.5, fill: true, tension: 0.42, pointBackgroundColor: '#fff', pointBorderColor: '#00B7C3', pointBorderWidth: 2, pointRadius: 4, pointHoverRadius: 6 }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { min: 40, max: 90, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { color: '#8A8D94', font: { family: 'Segoe UI', size: 11 } } },
          x: { grid: { display: false }, ticks: { color: '#8A8D94', font: { family: 'Segoe UI', size: 11 } } }
        },
        animation: { duration: 1200, easing: 'easeOutQuart' }
      }
    });
  }

  async function renderHeatmap() {
    const container = $('#heatmap');
    if (!container) return;
    container.innerHTML = '<div style="padding: 20px; text-align: center;">Loading heatmap...</div>';
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/hr/heatmap', { headers: { 'Authorization': 'Bearer ' + token } });
      const json = await res.json();
      
      let heatmapData = json.success && json.data && json.data.length ? json.data : null;
      
      if (!heatmapData) {
        // Fallback mock data for empty DB
        heatmapData = [
          { department_name: 'Engineering', meta: { n_size: 42 }, metrics: { avg_composite_score: 74, avg_dimension_scores: { workload: 62, interpersonal: 84, psychosocial: 71, environmental: 88, organizational: 65 } } },
          { department_name: 'Sales', meta: { n_size: 28 }, metrics: { avg_composite_score: 82, avg_dimension_scores: { workload: 79, interpersonal: 88, psychosocial: 80, environmental: 82, organizational: 81 } } },
          { department_name: 'Design (Protected)', meta: { n_size: 3, protected: true, rollup_strategy: 'Company Average' }, metrics: { avg_composite_score: 75, avg_dimension_scores: { workload: 70, interpersonal: 80, psychosocial: 75, environmental: 80, organizational: 70 } } }
        ];
      }
      
      container.innerHTML = '';
      const table = document.createElement('table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';
      table.style.textAlign = 'left';

      const thead = document.createElement('thead');
      thead.style.background = '#f9fafb';
      thead.style.borderBottom = '1px solid #e5e7eb';
      
      const trHead = document.createElement('tr');
      const dimensions = [
        { label: 'Department', key: 'name' },
        { label: 'Workload', key: 'workload' },
        { label: 'Interpersonal', key: 'interpersonal' },
        { label: 'Psychosocial', key: 'psychosocial' },
        { label: 'Environment', key: 'environmental' },
        { label: 'Organization', key: 'organizational' },
        { label: 'Composite Index', key: 'composite' }
      ];

      dimensions.forEach(dim => {
        const th = document.createElement('th');
        th.style.padding = '12px 16px';
        th.style.fontWeight = '600';
        th.style.fontSize = '0.75rem';
        th.style.color = '#6b7280';
        th.style.textTransform = 'uppercase';
        th.innerText = dim.label;
        trHead.appendChild(th);
      });
      thead.appendChild(trHead);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      
      heatmapData.forEach((row, index) => {
        const isProtected = row.meta && row.meta.protected;
        const metrics = row.metrics || {};
        
        const tr = document.createElement('tr');
        tr.style.borderBottom = index === heatmapData.length - 1 ? 'none' : '1px solid #e5e7eb';
        
        // Render cells
        dimensions.forEach((dim, i) => {
          if (dim.key === 'name') {
            const td = document.createElement('td');
            td.style.padding = '12px 16px';
            td.style.fontWeight = '500';
            td.style.color = '#111827';
            td.style.fontSize = '0.9rem';
            
            td.innerHTML = `<div style="display: flex; align-items: center; justify-content: space-between;"><span>${row.department_name}</span><span style="font-size: 0.75rem; color: #6b7280;">N=${row.meta ? row.meta.n_size : 0}</span></div>`;
            
            if (isProtected) {
              const notice = document.createElement('div');
              notice.style.fontSize = '0.7rem';
              notice.style.color = '#d97706';
              notice.style.marginTop = '4px';
              notice.innerText = 'Rolled up: ' + (row.meta.rollup_strategy || 'Protected');
              td.appendChild(notice);
            }
            tr.appendChild(td);
            return;
          }
          
          const td = document.createElement('td');
          td.style.padding = '12px';
          td.style.borderRadius = '4px';
          td.style.textAlign = 'center';
          td.style.fontWeight = 'bold';
          td.style.fontSize = '0.9rem';
          
          let score = null;
          if (dim.key === 'composite') {
            score = metrics.avg_composite_score;
          } else {
            score = metrics.avg_dimension_scores ? metrics.avg_dimension_scores[dim.key] : null;
          }

          if (score === null || score === undefined) {
            td.style.backgroundColor = '#f3f4f6';
            td.style.color = '#9ca3af';
            td.innerText = 'N/A';
          } else {
            // Apply color mapping
            td.innerText = Math.round(score);
            if (score >= 80) {
              td.style.backgroundColor = '#dcfce7'; td.style.color = '#166534';
            } else if (score >= 60) {
              td.style.backgroundColor = '#fef08a'; td.style.color = '#854d0e';
            } else {
              td.style.backgroundColor = '#fee2e2'; td.style.color = '#991b1b';
            }
          }
          tr.appendChild(td);
        });
        
        tbody.appendChild(tr);
      });
      
      table.appendChild(tbody);
      container.appendChild(table);
    } catch (e) {
      console.error(e);
      container.innerHTML = '<div style="padding: 20px; text-align: center; color: red;">Failed to load heatmap</div>';
    }
  }

  function renderDeptList() {
    const container = $('#deptList');
    if (!container) return;
    container.innerHTML = '';
    const data = state.hrFilters.department === 'all' ? deptData : deptData.filter(d => d.name === state.hrFilters.department);
    data.forEach(d => {
      const isUp = d.trend.startsWith('+');
      const row = el('div', 'dept-row');
      row.innerHTML = `<div class="dept-name"><span class="dept-dot" style="background: ${d.color};"></span>${d.name}</div><div class="dept-bar"><div class="dept-bar-fill" style="width: ${d.score}%; background: ${d.color};"></div></div><div class="dept-score">${d.score}</div><div class="dept-trend ${isUp ? 'up' : 'down'}">${d.trend}</div>`;
      row.addEventListener('click', () => {
        toast('Department detail', `${d.name} — ${d.count} employees · Index ${d.score} · Trend ${d.trend}`, 'info');
      });
      container.appendChild(row);
    });
  }

  async function renderAlerts() {
    const container = $('#alertsList');
    if (!container) return;
    container.innerHTML = '<div style="padding:20px;text-align:center;">Loading alerts...</div>';
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/hr/alerts', { headers: { 'Authorization': 'Bearer ' + token } });
      const { success, alerts } = await res.json();
      
      container.innerHTML = '';
      const iconSvgs = {
        critical: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
        moderate: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
      };
      
      (alerts || []).forEach(a => {
        const item = el('div', 'alert-item');
        item.innerHTML = '<div class="alert-icon ' + a.icon + '">' + iconSvgs[a.icon] + '</div><div class="alert-content"><div class="alert-title">' + a.title + '</div><div class="alert-desc">' + a.desc + '</div><div class="alert-time">' + a.time + '</div></div>';
        item.addEventListener('click', () => toast('Alert details', a.title, a.icon === 'critical' ? 'error' : a.icon === 'moderate' ? 'warning' : 'info'));
        container.appendChild(item);
      });
    } catch(err) {
      console.error(err);
      container.innerHTML = '<div style="padding:20px;text-align:center;color:red;">Failed to load alerts</div>';
    }
  }

  /* ---------- GENERIC MODAL (Settings, Profile, Export, Pulse, Legal) ---------- */
  function openGeneric(eyebrow, title, bodyHtml, footHtml) {
    $('#genericEyebrow').textContent = eyebrow;
    $('#genericTitle').textContent = title;
    $('#genericBody').innerHTML = bodyHtml;
    $('#genericFoot').innerHTML = footHtml || '';
    $('#genericBackdrop').classList.add('show');
    closeAllDropdowns();
  }
  function closeGeneric() {
    $('#genericBackdrop').classList.remove('show');
  }

  function openSettings() {
    const s = state.settings;
    const body = `
      <div class="toggle-row">
        <div><div class="toggle-label">Email notifications</div><div class="toggle-desc">Receive alerts when surveys are due or results are ready</div></div>
        <button class="toggle ${s.emailNotifications ? 'on' : ''}" data-setting="emailNotifications" aria-label="Toggle email notifications"></button>
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Pulse reminders</div><div class="toggle-desc">Adaptive reminders based on your response patterns</div></div>
        <button class="toggle ${s.pulseReminders ? 'on' : ''}" data-setting="pulseReminders" aria-label="Toggle pulse reminders"></button>
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Manager visibility</div><div class="toggle-desc">Allow your direct manager to see aggregated trends (never raw scores)</div></div>
        <button class="toggle ${s.managerVisibility ? 'on' : ''}" data-setting="managerVisibility" aria-label="Toggle manager visibility"></button>
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Anonymous mode</div><div class="toggle-desc">Strip identifiers from all stored responses</div></div>
        <button class="toggle ${s.anonymousMode ? 'on' : ''}" data-setting="anonymousMode" aria-label="Toggle anonymous mode"></button>
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Weekly digest</div><div class="toggle-desc">Personal wellbeing summary every Monday morning</div></div>
        <button class="toggle ${s.weeklyDigest ? 'on' : ''}" data-setting="weeklyDigest" aria-label="Toggle weekly digest"></button>
      </div>
      <div class="toggle-row">
        <div><div class="toggle-label">Dark mode</div><div class="toggle-desc">Use darker color palette (beta)</div></div>
        <button class="toggle ${s.darkMode ? 'on' : ''}" data-setting="darkMode" aria-label="Toggle dark mode"></button>
      </div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.saveSettings()">Save changes</button>`;
    openGeneric('SETTINGS', 'Preferences & privacy', body, foot);
    // Wire toggles
    $$('#genericBody .toggle').forEach(t => {
      t.addEventListener('click', () => {
        const key = t.dataset.setting;
        state.settings[key] = !state.settings[key];
        t.classList.toggle('on', state.settings[key]);
      });
    });
  }
  function saveSettings() {
    closeGeneric();
    toast('Settings saved', 'Your preferences have been updated.', 'success');
  }

  function openProfileSettings() {
    const u = state.user;
    const body = `
      <div class="form-group">
        <label class="form-label">Full name</label>
        <input type="text" class="form-input" id="profName" value="${u.name}" />
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" class="form-input" id="profEmail" value="${u.email}" />
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Role</label>
          <input type="text" class="form-input" id="profRole" value="${u.role}" />
        </div>
        <div class="form-group">
          <label class="form-label">Employee ID</label>
          <input type="text" class="form-input" value="WF-00142" readonly style="opacity: 0.6;" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Department</label>
        <select class="form-select" id="profDept">
          <option>Human Resources</option><option>Engineering</option><option>Sales</option><option>Operations</option><option>Finance</option><option>Marketing</option><option>Customer Success</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Manager</label>
        <input type="text" class="form-input" value="Dr. Iyanu Bello" />
      </div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.saveProfile()">Save profile</button>`;
    openGeneric('PROFILE', 'My profile', body, foot);
  }
  function saveProfile() {
    const name = $('#profName').value.trim();
    const email = $('#profEmail').value.trim();
    const role = $('#profRole').value.trim();
    if (!name || !email) { toast('Required fields', 'Name and email cannot be empty.', 'error'); return; }
    state.user.name = name;
    state.user.email = email;
    state.user.role = role;
    state.user.avatar = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
    $('.profile-name').textContent = name;
    $('.profile-role').textContent = role;
    $('.avatar').textContent = state.user.avatar;
    $('#empGreeting').textContent = `${greeting()}, ${name.split(' ')[0]}.`;
    closeGeneric();
    toast('Profile updated', 'Your changes have been saved.', 'success');
  }

  function openExport() {
    const body = `
      <p style="color: var(--text-2); margin-bottom: 20px;">Generate a board-ready report with current filters applied. Exports respect aggregation thresholds — no individual data is ever included.</p>
      <div class="form-group">
        <label class="form-label">Report format</label>
        <div class="check-group">
          <div class="check-item checked" data-format="csv" onclick="App.selectExport(this)"><div class="check-box"></div><span class="check-label">CSV (raw aggregated data)</span></div>
          <div class="check-item" data-format="pdf" onclick="App.selectExport(this)"><div class="check-box"></div><span class="check-label">PDF (executive summary)</span></div>
          <div class="check-item" data-format="xlsx" onclick="App.selectExport(this)"><div class="check-box"></div><span class="check-label">XLSX (multi-sheet workbook)</span></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Include sections</label>
        <div class="check-group">
          <div class="check-item checked" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">KPI summary</span></div>
          <div class="check-item checked" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">Severity distribution</span></div>
          <div class="check-item checked" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">Department heatmap</span></div>
          <div class="check-item" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">Trend analysis (8-week)</span></div>
          <div class="check-item" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">Active alerts log</span></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Recipient email</label>
        <input type="email" class="form-input" value="${state.user.email}" />
        <div class="form-hint">Report will be sent to this address. Delivery typically takes 1–2 minutes.</div>
      </div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.executeExport()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Generate &amp; download</button>`;
    openGeneric('EXPORT', 'Generate report', body, foot);
  }
  let exportFormat = 'csv';
  function selectExport(el) {
    $$('#genericBody .check-item[data-format]').forEach(c => c.classList.remove('checked'));
    el.classList.add('checked');
    exportFormat = el.dataset.format;
  }
  function toggleCheck(el) { el.classList.toggle('checked'); }
  function executeExport() {
    const sections = $$('#genericBody .check-item').length;
    const checked = $$('#genericBody .check-item.checked').length;
    closeGeneric();
    toast('Report generating', `${exportFormat.toUpperCase()} export with ${checked} sections — you'll receive an email shortly.`, 'success');
    // Simulate download
    setTimeout(() => {
      const csv = 'Department,Wellbeing Index,Trend,Employees\n' + deptData.map(d => `${d.name},${d.score},${d.trend},${d.count}`).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wellframe-report-${new Date().toISOString().slice(0,10)}.${exportFormat}`;
      a.click();
      URL.revokeObjectURL(url);
    }, 800);
  }

  function openPulseBuilder() {
    const body = `
      <p style="color: var(--text-2); margin-bottom: 20px;">Configure a pulse survey and send it to a targeted cohort. Recipients will be notified based on their preferred channel.</p>
      <div class="form-group">
        <label class="form-label">Pulse name</label>
        <input type="text" class="form-input" id="pulseName" placeholder="Q1 stress pulse" value="Q1 stress pulse" />
      </div>
      <div class="form-group">
        <label class="form-label">Surveys to include</label>
        <div class="check-group">
          <div class="check-item checked" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">PHQ-9</span><span class="check-meta">3 min</span></div>
          <div class="check-item checked" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">GAD-7</span><span class="check-meta">2 min</span></div>
          <div class="check-item" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">PSS-10</span><span class="check-meta">4 min</span></div>
          <div class="check-item" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">FAS-10</span><span class="check-meta">4 min</span></div>
          <div class="check-item" onclick="App.toggleCheck(this)"><div class="check-box"></div><span class="check-label">COPSOQ-II</span><span class="check-meta">12 min</span></div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Target audience</label>
        <select class="form-select" id="pulseAudience">
          <option value="all">All employees (1,842)</option>
          <option value="engineering">Engineering only (412)</option>
          <option value="sales">Sales only (774)</option>
          <option value="ops">Operations only (298)</option>
          <option value="custom">Custom selection</option>
        </select>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Open date</label>
          <input type="date" class="form-input" value="${new Date().toISOString().slice(0,10)}" />
        </div>
        <div class="form-group">
          <label class="form-label">Close date</label>
          <input type="date" class="form-input" value="${new Date(Date.now() + 14*86400000).toISOString().slice(0,10)}" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Personal message (optional)</label>
        <textarea class="form-textarea" placeholder="A brief note to employees about why this pulse matters...">Your wellbeing matters. This 5-minute check-in helps us understand how the team is doing — your responses are completely confidential.</textarea>
      </div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.launchPulse()"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4 20-7z"/></svg>Launch pulse</button>`;
    openGeneric('PULSE', 'Launch pulse survey', body, foot);
  }
  function launchPulse() {
    const name = $('#pulseName').value.trim();
    if (!name) { toast('Pulse name required', 'Please give your pulse a name.', 'error'); return; }
    const surveys = $$('#genericBody .check-item.checked').length;
    if (surveys === 0) { toast('Select surveys', 'Choose at least one survey to include.', 'error'); return; }
    const audience = $('#pulseAudience').options[$('#pulseAudience').selectedIndex].text;
    closeGeneric();
    toast('Pulse launched', `"${name}" is now live — ${audience}. Reminders will fire on day 3 and day 7.`, 'success');
  }

  function openLegal(type) {
    const docs = {
      privacy: { title: 'Privacy Policy', body: '<p style="color: var(--text-2); margin-bottom: 16px;">Wellframe collects and processes wellness data solely for the purpose of providing aggregated occupational health insights. Individual responses are encrypted at rest using AES-256 and in transit using TLS 1.3.</p><p style="color: var(--text-2); margin-bottom: 16px;">We never expose individual-level data to employers. All HR-facing analytics enforce a minimum cohort size of 5 to prevent re-identification. Employees may export or delete their data at any time.</p><p style="color: var(--text-2);">Full policy document available at <strong>wellframe.io/privacy</strong>. Last updated: 12 January 2025.</p>' },
      terms: { title: 'Terms of Service', body: '<p style="color: var(--text-2); margin-bottom: 16px;">By using Wellframe, organizations agree to use the platform exclusively for legitimate occupational health purposes, in compliance with applicable labor laws including OSHA, GDPR Article 9, and regional mental health parity statutes.</p><p style="color: var(--text-2);">Subscription tiers, SLA commitments, and acceptable use guidelines are detailed in the full terms document.</p>' },
      hipaa: { title: 'HIPAA Compliance', body: '<p style="color: var(--text-2); margin-bottom: 16px;">Wellframe operates as a Business Associate under HIPAA. We implement administrative, physical, and technical safeguards required under 45 CFR §164.308, §164.310, and §164.312.</p><p style="color: var(--text-2); margin-bottom: 16px;">A signed BAA is provided with every enterprise subscription. Our most recent HHS risk assessment was completed Q4 2024 with zero findings.</p><p style="color: var(--text-2);">Audit logs are retained for 6 years per HIPAA requirements.</p>' },
      gdpr: { title: 'GDPR & Data Processing', body: '<p style="color: var(--text-2); margin-bottom: 16px;">Under GDPR Article 9, wellness data is classified as special category data. Wellframe processes such data under explicit consent, with lawful basis documented per Article 6(1)(a) and 9(2)(a).</p><p style="color: var(--text-2); margin-bottom: 16px;">Data subjects may exercise rights of access, rectification, erasure, and portability through the in-app privacy center or by contacting our DPO.</p><p style="color: var(--text-2);">A full Data Processing Addendum (DPA) is available for download.</p>' }
    };
    const d = docs[type];
    openGeneric('LEGAL', d.title, d.body, `<button class="btn btn-primary btn-sm" onclick="App.closeGeneric()">Close</button>`);
  }

  function openContact() {
    const body = `
      <p style="color: var(--text-2); margin-bottom: 20px;">Reach our support team — we typically respond within 4 business hours.</p>
      <div class="form-group">
        <label class="form-label">Subject</label>
        <input type="text" class="form-input" placeholder="How can we help?" />
      </div>
      <div class="form-group">
        <label class="form-label">Message</label>
        <textarea class="form-textarea" placeholder="Describe your question or issue..." style="min-height: 120px;"></textarea>
      </div>
      <div style="display: flex; gap: 16px; margin-top: 20px; padding-top: 20px; border-top: 1px solid var(--border);">
        <div style="flex: 1;"><div style="font-size: 0.75rem; color: var(--text-3); font-weight: 600; margin-bottom: 4px;">EMAIL</div><div style="font-size: 0.875rem; font-weight: 500;">support@wellframe.io</div></div>
        <div style="flex: 1;"><div style="font-size: 0.75rem; color: var(--text-3); font-weight: 600; margin-bottom: 4px;">PHONE</div><div style="font-size: 0.875rem; font-weight: 500;">+1 (800) 555-0142</div></div>
        <div style="flex: 1;"><div style="font-size: 0.75rem; color: var(--text-3); font-weight: 600; margin-bottom: 4px;">HOURS</div><div style="font-size: 0.875rem; font-weight: 500;">24/7 enterprise</div></div>
      </div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.sendContact()">Send message</button>`;
    openGeneric('CONTACT', 'Contact support', body, foot);
  }
  function sendContact() {
    closeGeneric();
    toast('Message sent', 'Our support team will respond within 4 business hours.', 'success');
  }

  function openStatus() {
    const body = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        ${['API gateway','Survey engine','Analytics pipeline','Notification service','EAP routing','SSO / SAML','Data export'].map(svc => `
          <div style="display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border: 1px solid var(--border); border-radius: 10px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <span style="width: 8px; height: 8px; border-radius: 50%; background: #4FB286; box-shadow: 0 0 0 3px rgba(79,178,134,0.2);"></span>
              <span style="font-size: 0.875rem; font-weight: 500;">${svc}</span>
            </div>
            <span style="font-size: 0.75rem; color: var(--healthy); font-weight: 600;">Operational</span>
          </div>
        `).join('')}
      </div>
      <p style="color: var(--text-3); font-size: 0.75rem; margin-top: 20px;">Last incident: 47 days ago · 99.98% uptime over 90 days</p>
    `;
    openGeneric('STATUS', 'System status', body, `<button class="btn btn-primary btn-sm" onclick="App.closeGeneric()">Close</button>`);
  }

  function openHelp() {
    const body = `
      <div style="display: flex; flex-direction: column; gap: 10px;">
        ${[
          { t: 'Getting started with Wellframe', d: '5 min read · Onboarding guide' },
          { t: 'Understanding your wellbeing balance', d: '3 min read · Interpreting results' },
          { t: 'Configuring HR filters and exports', d: '4 min read · Admin guide' },
          { t: 'Privacy and confidentiality explained', d: '6 min read · Trust & safety' },
          { t: 'Inviting team members', d: '2 min read · Workspace setup' },
          { t: 'Integrations (Slack, Teams, HRIS)', d: '7 min read · Connectors' }
        ].map(a => `
          <div style="display: flex; align-items: center; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='none'">
            <div style="width: 36px; height: 36px; border-radius: 9px; background: var(--accent-soft); color: var(--accent-deep); display: flex; align-items: center; justify-content: center;">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
            </div>
            <div style="flex: 1;"><div style="font-size: 0.875rem; font-weight: 600;">${a.t}</div><div style="font-size: 0.75rem; color: var(--text-3);">${a.d}</div></div>
          </div>
        `).join('')}
      </div>
    `;
    openGeneric('HELP', 'Help center', body, `<button class="btn btn-primary btn-sm" onclick="App.closeGeneric()">Close</button>`);
  }

  function openKeyboardShortcuts() {
    const body = `
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
        <div>
          <div style="font-size: 0.6875rem; font-weight: 700; color: var(--text-3); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px;">Navigation</div>
          ${[['⌘ K','Open search'],['G then L','Go to landing'],['G then E','Go to My Wellness'],['G then H','Go to HR Analytics'],['ESC','Close any modal']].map(([k,l]) => `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);"><span style="font-size: 0.875rem;">${l}</span><kbd style="font-size: 0.75rem; padding: 2px 8px; background: rgba(0,0,0,0.05); border-radius: 5px; font-family: inherit;">${k}</kbd></div>`).join('')}
        </div>
        <div>
          <div style="font-size: 0.6875rem; font-weight: 700; color: var(--text-3); letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 12px;">Actions</div>
          ${[['N','New check-in'],['R','Open resources'],['/','Focus search'],['?','Show shortcuts'],['⌘ ,','Open settings']].map(([k,l]) => `<div style="display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border);"><span style="font-size: 0.875rem;">${l}</span><kbd style="font-size: 0.75rem; padding: 2px 8px; background: rgba(0,0,0,0.05); border-radius: 5px; font-family: inherit;">${k}</kbd></div>`).join('')}
        </div>
      </div>
    `;
    openGeneric('SHORTCUTS', 'Keyboard shortcuts', body, `<button class="btn btn-primary btn-sm" onclick="App.closeGeneric()">Close</button>`);
  }

  function signOut() {
    closeAllDropdowns();
    openGeneric('SIGN OUT', 'Sign out of Wellframe', '<p style="color: var(--text-2);">You are signed in as <strong>' + state.user.email + '</strong>. You will be returned to the sign-in screen.</p>', `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.confirmSignOut()">Sign out</button>`);
  }
  function confirmSignOut() {
    closeGeneric();
    Auth.logout();
  }

  function startTrial() {
    const body = `
      <p style="color: var(--text-2); margin-bottom: 20px;">Set up your workspace in under 15 minutes. Your first 50 employees are always free — no credit card required.</p>
      <div class="form-group"><label class="form-label">Work email</label><input type="email" class="form-input" placeholder="you@company.com" /></div>
      <div class="form-group"><label class="form-label">Organization name</label><input type="text" class="form-input" placeholder="Acme Corporation" /></div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Employees</label><select class="form-select"><option>1–50</option><option>51–200</option><option>201–500</option><option>500–2000</option><option>2000+</option></select></div>
        <div class="form-group"><label class="form-label">Region</label><select class="form-select"><option>North America</option><option>Europe</option><option>Asia Pacific</option><option>Latin America</option><option>Africa</option></select></div>
      </div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.submitTrial()">Activate trial</button>`;
    openGeneric('TRIAL', 'Start your free trial', body, foot);
  }
  function submitTrial() {
    closeGeneric();
    toast('Trial activated', 'Check your inbox to verify your workspace. Welcome to Wellframe.', 'success');
  }

  function bookDemo() {
    const body = `
      <p style="color: var(--text-2); margin-bottom: 20px;">Schedule a 30-minute walkthrough with a wellbeing specialist. We'll tailor the demo to your organization's needs.</p>
      <div class="form-row">
        <div class="form-group"><label class="form-label">First name</label><input type="text" class="form-input" placeholder="Jane" /></div>
        <div class="form-group"><label class="form-label">Last name</label><input type="text" class="form-input" placeholder="Doe" /></div>
      </div>
      <div class="form-group"><label class="form-label">Work email</label><input type="email" class="form-input" placeholder="jane@company.com" /></div>
      <div class="form-group"><label class="form-label">Preferred date</label><input type="date" class="form-input" value="${new Date(Date.now()+2*86400000).toISOString().slice(0,10)}" /></div>
      <div class="form-group"><label class="form-label">Anything specific you'd like covered?</label><textarea class="form-textarea" placeholder="Tell us about your wellness goals..."></textarea></div>
    `;
    const foot = `<button class="btn btn-ghost btn-sm" onclick="App.closeGeneric()">Cancel</button><button class="btn btn-primary btn-sm" onclick="App.submitDemo()">Schedule demo</button>`;
    openGeneric('DEMO', 'Book a demo', body, foot);
  }
  function submitDemo() {
    closeGeneric();
    toast('Demo scheduled', 'A specialist will reach out within 24 hours to confirm.', 'success');
  }

  /* ---------- GREETING ---------- */
  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  /* ---------- KEYBOARD ---------- */
  let gPressed = false;
  let gTimer = null;
  function handleKey(e) {
    // Escape closes everything
    if (e.key === 'Escape') {
      if ($('#cmdPalette').classList.contains('open')) { closeCmdPalette(); return; }
      if ($('#surveyBackdrop').classList.contains('show')) { closeSurvey(); return; }
      if ($('#genericBackdrop').classList.contains('show')) { closeGeneric(); return; }
      if ($('#notifPanel').classList.contains('open')) { closeNotifications(); return; }
      if ($('#resPanel').classList.contains('open')) { closeResources(); return; }
      closeAllDropdowns();
      return;
    }
    // Ctrl/Cmd+K opens command palette
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      openCmdPalette();
      return;
    }
    // Don't intercept when typing
    const tag = e.target.tagName;
    const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
    if (typing) return;
    if ($('#cmdPalette').classList.contains('open')) {
      if (e.key === 'ArrowDown') { e.preventDefault(); cmdNavigate(1); }
      if (e.key === 'ArrowUp') { e.preventDefault(); cmdNavigate(-1); }
      if (e.key === 'Enter') { e.preventDefault(); cmdSelect(); }
      return;
    }
    if (e.key === '/') { e.preventDefault(); openCmdPalette(); }
    if (e.key === '?') { e.preventDefault(); openKeyboardShortcuts(); }
    if (e.key === 'n') { e.preventDefault(); openSurvey('phq9'); }
    if (e.key === 'r') { e.preventDefault(); openResources(); }
    // G + key navigation
    if (e.key === 'g' && !gPressed) {
      gPressed = true;
      clearTimeout(gTimer);
      gTimer = setTimeout(() => { gPressed = false; }, 800);
      return;
    }
    if (gPressed) {
      if (e.key === 'l') { navigate('landing'); }
      if (e.key === 'e') { navigate('employee'); }
      if (e.key === 'h') { navigate('hr'); }
      gPressed = false;
    }
  }

  /* ---------- INIT ---------- */
  function init() {
    // Set greeting
    $('#empGreeting').textContent = `${greeting()}, ${state.user.name.split(' ')[0]}.`;
    updateNotifBadge();
    
    // Header buttons
    $('#searchBtn').addEventListener('click', openCmdPalette);
    $('#notifBtn').addEventListener('click', openNotifications);
    $('#profileBtn').addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
    
    // Click outside dropdown
    document.addEventListener('click', (e) => {
      if (!$('#profileDropdown').contains(e.target) && !$('#profileBtn').contains(e.target)) {
        closeAllDropdowns();
      }
    });
    
    // Command palette
    $('#cmdBackdrop').addEventListener('click', closeCmdPalette);
    $('#cmdInput').addEventListener('input', (e) => {
      state.cmdSelectedIndex = 0;
      renderCmdResults(e.target.value);
    });
    
    // Panels
    $('#notifBackdrop').addEventListener('click', closeNotifications);
    $('#resBackdrop').addEventListener('click', closeResources);
    
    // Modal backdrops
    $('#surveyBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSurvey(); });
    $('#genericBackdrop').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGeneric(); });
    
    // Keyboard
    document.addEventListener('keydown', handleKey);
    
    // Initial render
    renderWellbeing();
    renderSurveys();
    renderRecommended();
    renderKPIs();
    renderHeatmap();
    renderDeptList();
    renderAlerts();
  }

  return {
    init, navigate, toast,
    openSurvey, closeSurvey, surveyNext, surveyBack,
    openNotifications, closeNotifications, markAllRead,
    openResources, closeResources,
    openSettings, saveSettings,
    openSettingsForm, saveSettingsForm, submitReferral,
    openProfileSettings, saveProfile,
    openExport, selectExport, toggleCheck, executeExport,
    openPulseBuilder, launchPulse,
    openLegal, openContact, openStatus, openHelp, openKeyboardShortcuts,
    signOut, confirmSignOut,
    startTrial, submitTrial, bookDemo, submitDemo,
    applyFilters, setMetric,
    sendContact, closeGeneric
  };
})();

document.addEventListener('DOMContentLoaded', App.init);
