
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
      { id: 3, icon: 'info', title: 'Quarterly COPSOQ III (Middle) opens Monday', desc: 'Scheduled deployment to 1,842 employees on Monday 09:00.', time: '2 days ago', read: false },
      { id: 4, icon: 'moderate', title: 'Operations night-shift cohort', desc: '28% response drop. Consider schedule-aware reminders.', time: '3 days ago', read: true },
      { id: 5, icon: 'info', title: 'New: FAS-10 fatigue module available', desc: 'Add fatigue tracking to your quarterly pulse.', time: '5 days ago', read: true },
      { id: 6, icon: 'info', title: 'Board report ready for download', desc: 'Q3 wellness summary is available in HR Analytics → Export.', time: '1 week ago', read: true }
    ],
    surveyProgress: {
      phq9: { completed: true, lastTaken: '4d ago' },
      gad7: { completed: true, lastTaken: '4d ago' },
      pss10: { completed: false, progress: 6, total: 10 },
      fas10: { completed: false },
      copsoq3_core: { completed: false },
      copsoq3_middle: { completed: false },
      copsoq3_long: { completed: false }
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
    cmdItems: [],
    surveyState: {
      active: false,
      type: null,
      currentQuestion: 0,
      answers: []
    }
  };

  const surveys = {
    phq9: window.phq9,
    gad7: window.gad7,
    pss10: window.pss10,
    fas10: window.fas10,
    copsoq3_core: window.copsoq3_core,
    copsoq3_middle: window.copsoq3_middle,
    copsoq3_long: window.copsoq3_long
  };

  function openModal(id) { document.getElementById(id).classList.add('show'); }
  function closeModal(id) { document.getElementById(id).classList.remove('show'); }

  function navigate(view) {
    state.currentView = view;
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.getElementById('view-' + view).style.display = 'block';
  }

  function openSurvey(code) {
    if (!surveys[code]) return;
    state.surveyState = { active: true, type: code, currentQuestion: 0, answers: [] };
    
    document.getElementById('modalCode').innerText = surveys[code].code;
    document.getElementById('modalTitle').innerText = surveys[code].name || surveys[code].title;
    
    openModal('surveyBackdrop');
    renderQuestion();
  }

  function closeSurvey() {
    state.surveyState.active = false;
    closeModal('surveyBackdrop');
  }

  function renderQuestion() {
    const sType = state.surveyState.type;
    const survey = surveys[sType];
    const currentIndex = state.surveyState.currentQuestion;
    
    if (currentIndex >= survey.questions.length) {
      completeSurvey();
      return;
    }
    
    document.getElementById('modalQNum').innerText = `Question ${currentIndex + 1} of ${survey.questions.length}`;
    
    const qObj = survey.questions[currentIndex];
    document.getElementById('modalQText').innerText = typeof qObj === 'string' ? qObj : qObj.text;
    
    document.getElementById('modalProgress').style.width = `${(currentIndex / survey.questions.length) * 100}%`;
    
    document.getElementById('modalBack').disabled = (currentIndex === 0);
    
    const optionsContainer = document.getElementById('modalOptions');
    optionsContainer.innerHTML = '';
    
    let options = survey.options;
    if (!options && qObj.responseType && window.COPSOQ3_CORE_MAPPINGS) {
      const mapping = window.COPSOQ3_CORE_MAPPINGS[qObj.responseType];
      if (mapping) {
        options = Object.keys(mapping).map(k => ({ text: k, value: mapping[k] }));
      }
    }
    
    if (!options) {
      options = [
        { text: 'Not at all', value: 0 },
        { text: 'Several days', value: 1 },
        { text: 'More than half the days', value: 2 },
        { text: 'Nearly every day', value: 3 }
      ];
    }
    
    options.forEach((opt, idx) => {
      const btn = document.createElement('div');
      btn.className = 'option';
      if (state.surveyState.answers[currentIndex] === opt.value) {
        btn.classList.add('selected');
      }
      btn.innerHTML = `
        <div class="option-radio"></div>
        <div class="option-text">${opt.text}</div>
      `;
      btn.onclick = () => {
        state.surveyState.answers[currentIndex] = opt.value;
        surveyNext();
      };
      optionsContainer.appendChild(btn);
    });
  }
  
  function surveyBack() {
    if (state.surveyState.currentQuestion > 0) {
      state.surveyState.currentQuestion--;
      renderQuestion();
    }
  }

  function surveyNext() {
    const survey = surveys[state.surveyState.type];
    if (state.surveyState.currentQuestion < survey.questions.length) {
      state.surveyState.currentQuestion++;
      renderQuestion();
    }
  }
  
  function completeSurvey() {
    document.getElementById('modalProgress').style.width = '100%';
    document.getElementById('modalQText').innerHTML = `<div style="text-align:center; padding: 40px 0;">
      <svg viewBox="0 0 24 24" fill="none" stroke="#4FB286" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
      <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Check-in Complete</h3>
      <p style="color: var(--text-2);">Your secure response has been recorded.</p>
      <button class="btn btn-primary" style="margin-top: 24px;" onclick="App.closeSurvey()">Done</button>
    </div>`;
    document.getElementById('modalOptions').innerHTML = '';
    document.getElementById('modalBack').style.display = 'none';
    document.getElementById('modalNext').style.display = 'none';
    document.getElementById('modalQNum').style.display = 'none';
    
    // Simulate updating backend and dashboard score
    state.surveyProgress[state.surveyState.type].completed = true;

      const recList = document.getElementById('recommendedList');
      if (recList) {
        recList.innerHTML = '';
        const resources = [
          { title: "Managing work-related stress", meta: "Article • 5 min read", icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' },
          { title: "Box breathing exercise", meta: "Audio • 3 mins", icon: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>' }
        ];
        resources.forEach(r => {
          recList.innerHTML += `<a href="#" class="resource-item" onclick="App.openResources()">
            <div class="resource-thumb" style="background: var(--accent);"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${r.icon}</svg></div>
            <div class="resource-info">
              <div class="resource-title">${r.title}</div>
              <div class="resource-meta">${r.meta}</div>
            </div>
          </a>`;
        });
      }

    renderEmployeeDashboard();
  }

  function renderEmployeeDashboard() {
    const marker = document.getElementById('balanceMarker');
    if (marker) {
      marker.style.left = state.wellbeing.marker + '%';
    }
    
    const breakdown = document.getElementById('wellbeingBreakdown');
    if (breakdown) {
      breakdown.innerHTML = '';
      state.wellbeing.dimensions.forEach(dim => {
        const div = document.createElement('div');
        div.className = 'wb-dim';
        div.innerHTML = `
          <div style="font-size: 1.25rem; font-weight: 700; color: ${dim.status === 'healthy' ? 'var(--healthy)' : 'var(--moderate)'}">${dim.value}</div>
          <div style="font-size: 0.75rem; color: var(--text-3); font-weight: 500; text-transform: uppercase;">${dim.label}</div>
        `;
        breakdown.appendChild(div);
      });
    }

    const grid = document.getElementById('surveysGrid');
    if (grid) {
      grid.innerHTML = '';
      Object.keys(surveys).forEach(code => {
        const s = surveys[code];
        if(!s) return;
        const prog = state.surveyProgress[code] || {};
        
        const card = document.createElement('div');
        card.className = `survey-card ${prog.completed ? 'completed' : ''}`;
        card.onclick = () => App.openSurvey(code);
        card.innerHTML = `
          <div class="survey-head">
            <span class="survey-code">${s.code}</span>
            <span class="survey-status ${prog.completed ? 'done' : 'progress'}">${prog.completed ? 'Completed' : 'Available'}</span>
          </div>
          <h3>${s.name || s.title}</h3>
          <p class="desc">${s.description || 'Check-in on your wellbeing.'}</p>
          <div class="survey-meta">
            <span class="survey-time">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              ${s.estimatedMinutes || 5} min
            </span>
            <div class="survey-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    if (typeof window.Chart !== 'undefined') {
      const ctx = document.getElementById('employeeTrendChart');
      if (ctx) {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4'],
                datasets: [
                    {
                        label: 'Overall Wellbeing',
                        data: [65, 68, 72, 75],
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        fill: true,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, max: 100 }
                }
            }
        });
      }
    }
    renderEmployeeDashboard();
  });


  return {
    navigate,
    openSurvey,
    closeSurvey,
    surveyNext,
    surveyBack,
    openResources: () => { openModal('resBackdrop'); document.getElementById('resPanel').classList.add('open'); },
    closeResources: () => { closeModal('resBackdrop'); document.getElementById('resPanel').classList.remove('open'); },
    openProfileSettings: () => {},
    openSettings: () => {},
    openHelp: () => {},
    openKeyboardShortcuts: () => {},
    signOut: () => { window.location.href = '/'; },
    closeNotifications: () => {
      document.getElementById('notifPanel').classList.remove('open');
      closeModal('notifBackdrop');
    },
    toggleNotifications: () => {
      const panel = document.getElementById('notifPanel');
      if (panel.classList.contains('open')) {
        panel.classList.remove('open');
        closeModal('notifBackdrop');
      } else {
        panel.classList.add('open');
        openModal('notifBackdrop');
        const badge = document.getElementById('notifBadge');
        if (badge) badge.style.display = 'none';
      }
    },
    openSearch: () => {
      const modal = document.getElementById('cmdPalette');
      if(modal) {
        modal.classList.add('open');
        openModal('cmdBackdrop');
        setTimeout(() => document.getElementById('cmdInput').focus(), 100);
      }
    },
    closeSearch: () => {
      document.getElementById('cmdPalette').classList.remove('open');
      closeModal('cmdBackdrop');
    },
    toggleProfileDropdown: () => {
      const dropdown = document.getElementById('profileDropdown');
      if(dropdown) dropdown.classList.toggle('open');
    },
    markAllRead: () => {},
    closeGeneric: () => {}
  };
})();

