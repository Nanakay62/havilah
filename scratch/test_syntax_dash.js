
/* ============================================================
   WELLFRAME APPLICATION — Production Implementation
   ============================================================ */

const App = (() => {

  /* ---------- STATE ---------- */
    const state = {
    employeeHistoryPayload: [],
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
        <div class="option-text">${opt.text} <span style="color: var(--text-3); font-size: 0.85em; margin-left: 6px;">(${opt.value})</span></div>
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
  
  async function completeSurvey() {
    const sType = state.surveyState.type;
    const answers = state.surveyState.answers;
    
    // Show Loading
    document.getElementById('modalQText').innerHTML = `
      <div style="text-align:center; padding: 40px 0;">
        <svg class="animate-spin h-10 w-10 text-cyan-500 mx-auto mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        <h3 style="font-size: 1.2rem; color: var(--text-2);">Analyzing responses...</h3>
      </div>
    `;
    document.getElementById('modalOptions').innerHTML = '';
    document.getElementById('modalBack').style.display = 'none';
    document.getElementById('modalNext').style.display = 'none';
    document.getElementById('modalQNum').style.display = 'none';

    try {
      const res = await fetch('/api/v1/wellness/submit-checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ survey_type: sType, answers })
      });
      const data = await res.json();
      
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit check-in');
      }
      
      // Update global state with the returned baseline
      if (data.baseline_profile) {
        state.wellbeing.dimensions.forEach(d => {
          const dimKey = d.label === 'Work-fit' ? 'work_fit' : d.label.toLowerCase();
          const val = data.baseline_profile[dimKey];
          if (val !== null) {
            d.value = val;
            d.status = val >= 75 ? 'healthy' : val >= 50 ? 'moderate' : 'at-risk';
          }
        });
      }
    } catch (err) {
      console.error(err);
      document.getElementById('modalQText').innerHTML = `
        <div style="text-align:center; padding: 40px 0; color: var(--critical);">
          <p>Failed to save results. Please try again later.</p>
          <button class="btn btn-primary" style="margin-top: 10px;" onclick="App.closeSurvey()">Close</button>
        </div>
      `;
      return;
    }

    // Accurate Scoring Logic for UI Display (fallback if we wanted, but we already have baseline)
    let rawScore = 0;
    let normalized = 0;
    
    if (sType === 'phq9' || sType === 'gad7') {
      answers.forEach(v => rawScore += v);
      normalized = 100 - ((rawScore / 27) * 100);
    } else if (sType === 'pss10') {
      const reverse = [3, 4, 6, 7];
      answers.forEach((v, i) => {
        rawScore += reverse.includes(i) ? (4 - v) : v;
      });
      normalized = 100 - ((rawScore / 40) * 100);
    } else if (sType === 'fas10') {
      const reverse = [3, 9];
      answers.forEach((v, i) => {
        rawScore += reverse.includes(i) ? (6 - v) : v;
      });
      normalized = 100 - (((rawScore - 10) / 40) * 100);
    } else if (sType.startsWith('copsoq')) {
      answers.forEach(v => rawScore += v);
      normalized = answers.length > 0 ? (rawScore / answers.length) : 0;
    }
    
    normalized = Math.max(0, Math.min(100, Math.round(normalized)));
    let statusLabel = normalized >= 75 ? 'Healthy' : normalized >= 50 ? 'Moderate' : 'At Risk';
    let statusColor = normalized >= 75 ? 'var(--healthy)' : normalized >= 50 ? '#f59e0b' : 'var(--critical)';

    // Update Dimension Mapping
    const dimMap = { 'phq9': 'Mood', 'gad7': 'Calm', 'pss10': 'Stress', 'fas10': 'Energy', 'copsoq3_core': 'Work-fit' };
    const dimLabel = dimMap[sType] || 'Work-fit';
    
    const dimIndex = state.wellbeing.dimensions.findIndex(d => d.label === dimLabel);
    if (dimIndex !== -1) {
      state.wellbeing.dimensions[dimIndex].value = normalized;
      state.wellbeing.dimensions[dimIndex].status = statusLabel.toLowerCase().replace(' ', '-');
    }
    
    // Update composite score & trend chart
    const allVals = state.wellbeing.dimensions.map(d => d.value);
    const compositeScore = Math.round(allVals.reduce((a,b)=>a+b, 0) / allVals.length);
    state.wellbeing.composite_score = compositeScore;
    
    const todayStr = new Date().toISOString().split('T')[0];
    const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const todayEntries = state.employeeHistoryPayload.filter(e => e.date === todayStr);
    const labelStr = `Check-in ${todayEntries.length + 1} (${timeStr})`;
    
    state.employeeHistoryPayload.push({ date: todayStr, score: compositeScore, label: labelStr });
    
    state.surveyProgress[sType].completed = true;
    state.surveyProgress[sType].score = normalized;

    // Show result to user
    document.getElementById('modalProgress').style.width = '100%';
    document.getElementById('modalQText').innerHTML = `<div style="text-align:center; padding: 40px 0;">
      <svg viewBox="0 0 24 24" fill="none" stroke="${statusColor}" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
      <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Check-in Complete</h3>
      <p style="color: var(--text-2); font-size: 1.1rem; margin-bottom: 20px;">You scored <strong>${normalized}</strong> on the ${dimLabel} scale.</p>
      <div style="display: inline-block; padding: 6px 14px; border-radius: 100px; background: ${statusColor}22; color: ${statusColor}; font-weight: 600; font-size: 0.9rem; margin-bottom: 24px;">Status: ${statusLabel}</div>
      <br/>
      <button class="btn btn-primary" style="margin-top: 10px;" onclick="App.closeSurvey()">Done</button>
    </div>`;
    document.getElementById('modalOptions').innerHTML = '';
    document.getElementById('modalBack').style.display = 'none';
    document.getElementById('modalNext').style.display = 'none';
    document.getElementById('modalQNum').style.display = 'none';
    
    filterChartTimeframe('recent');
    renderEmployeeDashboard();
  }

  function renderEmployeeDashboard() {
    // Check Empty State First
    const emptyState = document.getElementById('wellbeing-empty-state');
    const heroCard = document.getElementById('wellbeing-hero-card');
    const contextDrawer = document.getElementById('wellbeing-context-drawer');
    const trendCard = document.getElementById('trend-insight-card');

    if (state.employeeHistoryPayload && state.employeeHistoryPayload.length === 0) {
      if (emptyState) emptyState.style.display = 'flex';
      if (heroCard) heroCard.style.display = 'none';
      if (contextDrawer) contextDrawer.style.display = 'none';
      if (trendCard) trendCard.style.display = 'none';
    } else {
      if (emptyState) emptyState.style.display = 'none';
      if (heroCard) heroCard.style.display = 'flex';
      // context drawer manages its own height, so don't force it to block
      if (trendCard) trendCard.style.display = 'block';
    }

    const recList = document.getElementById('recommendedList');
    if (recList) {
      recList.innerHTML = '';
      const resources = [];
      const energyDim = state.wellbeing.dimensions.find(d => d.label === 'Energy');
      if (energyDim && (energyDim.status === 'at-risk' || energyDim.status === 'moderate')) {
        resources.push({ title: "Fatigue recovery & sleep hygiene", meta: "Action Plan • 10 mins", icon: '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>' });
      }
      const stressDim = state.wellbeing.dimensions.find(d => d.label === 'Stress');
      if (stressDim && (stressDim.status === 'at-risk' || stressDim.status === 'moderate')) {
        resources.push({ title: "Managing work-related stress", meta: "Article • 5 min read", icon: '<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>' });
      }
      if (resources.length === 0) {
        resources.push({ title: "Maintaining peak balance", meta: "Article • 3 min read", icon: '<path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>' });
      }
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

    updateWellbeingRing(state.wellbeing.composite_score);
    initRadarChart(state.wellbeing.dimensions);

    const breakdown = document.getElementById('wellbeingBreakdown');
    if (breakdown) {
      breakdown.innerHTML = '';
      state.wellbeing.dimensions.forEach(dim => {
        const div = document.createElement('div');
        div.className = 'wb-dim';
        div.innerHTML = `
          <div style="font-size: 1.25rem; font-weight: 700; color: ${dim.status === 'healthy' ? 'var(--healthy)' : dim.status === 'thriving' ? '#10b981' : dim.status === 'moderate' ? '#f59e0b' : 'var(--critical)'}">${dim.value}</div>
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

  window.addEventListener('DOMContentLoaded', async () => {
    // Pull the active user name from session storage
    const activeName = localStorage.getItem('wf_user_name');
    if (activeName) {
      const firstName = activeName.split(' ')[0];
      const hr = new Date().getHours();
      const greeting = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
      
      const greetingEl = document.getElementById('empGreeting');
      if (greetingEl) greetingEl.textContent = `${greeting}, ${firstName}.`;
      
      // Update profile names
      document.querySelectorAll('.profile-name, .dropdown-header-name').forEach(el => {
        el.textContent = activeName;
      });
      
      // Update avatars
      const initials = activeName.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
      document.querySelectorAll('.avatar').forEach(el => {
        el.textContent = initials;
      });
    }
    
    const activeEmail = localStorage.getItem('wf_user_email');
    if (activeEmail) {
      document.querySelectorAll('.dropdown-header-email').forEach(el => {
        el.textContent = activeEmail;
      });
    }

    try {
      const res = await fetch('/api/v1/wellness/dashboard-data');
      const data = await res.json();
      
      if (data.success && data.baseline_profile) {
        // Sync dimensions
        state.wellbeing.dimensions.forEach(d => {
          const dimKey = d.label === 'Work-fit' ? 'work_fit' : d.label.toLowerCase();
          const val = data.baseline_profile[dimKey];
          if (val !== null) {
            d.value = val;
            d.status = val >= 75 ? 'healthy' : val >= 50 ? 'moderate' : 'at-risk';
          }
        });
        
        // Sync history
        if (data.history && data.history.length > 0) {
          state.employeeHistoryPayload = data.history.map((item, idx) => ({
            date: item.date,
            score: item.score,
            label: `Check-in ${idx + 1}`
          }));
          
          // Latest composite score
          const latest = data.history[data.history.length - 1];
          if (latest) {
            state.wellbeing.composite_score = latest.score;
          }
        } else {
          state.employeeHistoryPayload = [];
          state.wellbeing.composite_score = 0;
        }
      }
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
    }

    if (typeof window.Chart !== 'undefined') {
      const ctx = document.getElementById('employeeTrendChart');
      if (ctx) {
        window.employeeTrendChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: state.employeeHistoryPayload.map(h => h.date),
                datasets: [
                    {
                        label: 'Overall Wellbeing',
                        data: state.employeeHistoryPayload.map(h => h.score),
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
    if (typeof filterChartTimeframe === 'function') filterChartTimeframe('recent');
  });

  window.employeeRadarInstance = null;

  function initRadarChart(dimensionsData) {
    const canvas = document.getElementById('wellbeingRadarChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if (window.employeeRadarInstance) {
      window.employeeRadarInstance.destroy();
    }

    // Sort or map dimensions safely in case order varies
    const labels = ['Mood', 'Calm', 'Stress', 'Energy', 'Work-fit', 'Social', 'Purpose'];
    const currentData = labels.map(label => {
      const dim = dimensionsData.find(d => d.label === label);
      return dim ? dim.value : 0;
    });

    window.employeeRadarInstance = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Current State',
            data: currentData,
            backgroundColor: 'rgba(0, 183, 195, 0.2)', // #00B7C3 with opacity
            borderColor: '#00B7C3',
            borderWidth: 2,
            pointBackgroundColor: '#00B7C3'
          },
          {
            label: 'Target baseline',
            data: [85, 85, 85, 85, 85, 85, 85], // Fixed benchmark layer
            borderDash: [4, 4],
            backgroundColor: 'transparent',
            borderColor: '#7000FF', // Premium highlight purple
            borderWidth: 1,
            pointRadius: 0
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } }, // Keeps presentation clean
        scales: {
          r: {
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 20 }, // Hides distracting nested scale numbers
            grid: { color: 'rgba(0, 0, 0, 0.06)' },
            pointLabels: {
              font: { size: 10, weight: '600' },
              color: 'var(--text-2)'
            }
          }
        }
      }
    });
  }

  function updateWellbeingRing(score) {
    const ring = document.getElementById('wellbeing-progress-ring');
    const textDisplay = document.getElementById('wellbeing-ring-percent');
    if (!ring || !textDisplay) return;

    let numScore = parseInt(score);
    let displayScore = Math.round(numScore);
    if (isNaN(numScore)) {
        numScore = 0;
        displayScore = '--';
    }

    const circumference = 2 * Math.PI * 42; // ~263.89
    const offset = circumference - (numScore / 100) * circumference;
    
    ring.style.strokeDashoffset = offset;
    textDisplay.innerText = displayScore + '%';

    if (numScore === 0) {
      ring.style.stroke = '#f3f4f6';
    } else if (numScore >= 75) {
      ring.style.stroke = '#14b8a6'; // teal-500
    } else if (numScore >= 50) {
      ring.style.stroke = '#f59e0b'; // amber-500
    } else {
      ring.style.stroke = '#f43f5e'; // rose-500
    }
  }

  function toggleContextDrawer() {
    const drawer = document.getElementById('wellbeing-context-drawer');
    if (drawer) {
      if (drawer.style.maxHeight === '0px' || drawer.style.maxHeight === '0' || !drawer.style.maxHeight) {
        drawer.style.maxHeight = '500px';
        drawer.style.opacity = '1';
        drawer.style.marginTop = '16px';
      } else {
        drawer.style.maxHeight = '0px';
        drawer.style.opacity = '0';
        drawer.style.marginTop = '0px';
      }
    }
  }

  function filterChartTimeframe(rangeType) {
    document.querySelectorAll('.timeframe-btn').forEach(btn => {
      btn.classList.remove('active');
      btn.style.background = 'transparent';
      btn.style.color = 'var(--text-2)';
      btn.style.border = 'none';
      btn.style.fontWeight = 'normal';
      btn.style.boxShadow = 'none';
    });
    
    const btnMap = { '1M': 0, '3M': 1, 'recent': 2 };
    const buttons = document.querySelectorAll('.timeframe-btn');
    const activeBtn = buttons[btnMap[rangeType]];
    if (activeBtn) {
      activeBtn.classList.add('active');
      activeBtn.style.background = 'var(--surface)';
      activeBtn.style.color = 'var(--text-1)';
      activeBtn.style.border = '1px solid var(--border)';
      activeBtn.style.fontWeight = '600';
      activeBtn.style.boxShadow = '0 1px 3px rgba(0,0,0,0.1)';
    }

    const now = new Date();
    let filteredData = state.employeeHistoryPayload || [];

    if (rangeType === '1M') {
      const oneMonthAgo = new Date(now.setMonth(now.getMonth() - 1));
      filteredData = filteredData.filter(item => new Date(item.date) >= oneMonthAgo);
    } else if (rangeType === '3M') {
      const threeMonthsAgo = new Date(now.setMonth(now.getMonth() - 3));
      filteredData = filteredData.filter(item => new Date(item.date) >= threeMonthsAgo);
    } else if (rangeType === 'recent') {
      filteredData = filteredData.slice(-10);
    }

    if (window.employeeTrendChartInstance) {
      window.employeeTrendChartInstance.data.labels = filteredData.map((item, idx) => {
        const dateStr = new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        if (idx > 0 && item.date === filteredData[idx - 1].date) {
          return '';
        }
        return dateStr;
      });
      window.employeeTrendChartInstance.data.datasets[0].data = filteredData.map(item => item.score);
      window.employeeTrendChartInstance.update();
    }
  }


  
  
  
  const commands = [
    { title: 'My Wellness (Home)', keywords: ['home', 'dashboard'], action: () => App.navigate('employee') },
    { title: 'Global Dashboard', keywords: ['admin', 'global', 'tenant'], action: () => App.navigate('landing') },
    { title: 'Take Check-in (PHQ-9)', keywords: ['phq', 'phq9', 'depression', 'mood', 'survey'], action: () => App.openSurvey('phq9') },
    { title: 'Take Check-in (GAD-7)', keywords: ['gad', 'gad7', 'anxiety', 'worry', 'survey'], action: () => App.openSurvey('gad7') },
    { title: 'Take Check-in (PSS-10)', keywords: ['pss', 'pss10', 'stress', 'survey'], action: () => App.openSurvey('pss10') },
    { title: 'Take Check-in (FAS-10)', keywords: ['fas', 'fas10', 'fatigue', 'burnout', 'survey'], action: () => App.openSurvey('fas10') },
    { title: 'Take Check-in (COPSOQ-III)', keywords: ['copsoq', 'copsoq3', 'workplace', 'occupational', 'stress', 'survey'], action: () => App.openSurvey('copsoq') },
    { title: 'Notifications', keywords: ['alerts', 'messages'], action: () => App.toggleNotifications() },
    { title: 'Self-care Library', keywords: ['resources', 'library', 'help'], action: () => App.openResources() },
    { title: 'Binaural Beats', keywords: ['audio', 'focus', 'beats', 'soundscapes', 'noise', 'adhd'], action: () => App.openResource('res-binaural') },
    { title: 'De-Escalation Scripts', keywords: ['scripts', 'chat', 'boundaries', 'communication'], action: () => App.openResource('res-deescalation') },
    { title: 'Chronobiology', keywords: ['sleep', 'caffeine', 'light', 'biomarker'], action: () => App.openResource('res-chronobiology') },
    { title: 'Peer Walls', keywords: ['social', 'wins', 'team', 'peer'], action: () => App.openResource('res-peerwalls') },
    { title: 'Tactical Box Breathing', keywords: ['breathing', 'video', 'calm'], action: () => App.openResource('res-breathing') },
    { title: 'Cognitive Reframing', keywords: ['mindfulness', 'reframing', 'interactive'], action: () => App.openResource('res-mindfulness') },
    { title: 'Desk Mobility Reset', keywords: ['movement', 'desk', 'mobility', 'video'], action: () => App.openResource('res-movement') },
    { title: 'Async Communication', keywords: ['async', 'boundaries', 'article'], action: () => App.openResource('res-boundaries') },
    { title: 'Brain-Dump Matrix', keywords: ['worksheets', 'brain', 'dump', 'interactive'], action: () => App.openResource('res-worksheets') },
    { title: 'Settings', keywords: ['preferences', 'config'], action: () => App.openSettings() },
    { title: 'Profile Settings', keywords: ['user', 'account', 'profile'], action: () => App.openProfileSettings() },
    { title: 'Privacy Policy', keywords: ['privacy', 'legal', 'policy', 'data'], action: () => App.openLegal('privacy') },
    { title: 'Terms of Service', keywords: ['terms', 'legal', 'tos'], action: () => App.openLegal('terms') },
    { title: 'HIPAA Compliance', keywords: ['hipaa', 'legal', 'health'], action: () => App.openLegal('hipaa') },
    { title: 'GDPR Compliance', keywords: ['gdpr', 'legal', 'europe'], action: () => App.openLegal('gdpr') },
    { title: 'Contact Support', keywords: ['contact', 'support', 'help', 'email'], action: () => App.openContact() },
    { title: 'Sign Out', keywords: ['logout', 'signout', 'exit'], action: () => App.signOut() }
  ];

  let searchIndex = -1;
  let filteredCommands = [];

  function initSearch() {
    const input = document.getElementById('cmdInput');
    const resultsContainer = document.getElementById('cmdResults');

    if (!input || !resultsContainer) return;

    input.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        filteredCommands = commands;
        renderSearchResults();
        return;
      }
      
      const terms = q.split(/[\s/,-]+/);
      filteredCommands = commands.filter(c => {
        return terms.every(term => {
          if (c.title.toLowerCase().includes(term)) return true;
          if (c.keywords && c.keywords.some(k => k.toLowerCase().includes(term))) return true;
          return false;
        });
      });
      renderSearchResults();
    });

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        App.closeSearch();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        searchIndex = Math.min(searchIndex + 1, filteredCommands.length - 1);
        updateSearchSelection();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        searchIndex = Math.max(searchIndex - 1, 0);
        updateSearchSelection();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (searchIndex >= 0 && searchIndex < filteredCommands.length) {
          filteredCommands[searchIndex].action();
          App.closeSearch();
        }
      }
    });
  }

  function renderSearchResults() {
    const resultsContainer = document.getElementById('cmdResults');
    if (filteredCommands.length === 0) {
      resultsContainer.innerHTML = '<div style="padding: 12px; color: var(--text-muted); text-align: center;">No results found.</div>';
      return;
    }
    
    searchIndex = 0;
    resultsContainer.innerHTML = filteredCommands.map((c, i) => 
      `<div class="cmd-item ${i === 0 ? 'active' : ''}" style="padding: 12px; cursor: pointer; border-radius: 6px; margin-bottom: 4px; background: ${i === 0 ? 'var(--surface)' : 'transparent'};" data-index="${i}" onclick="App.executeCommand(${i})">
        ${c.title}
      </div>`
    ).join('');
  }

  function updateSearchSelection() {
    const items = document.querySelectorAll('#cmdResults .cmd-item');
    items.forEach((item, i) => {
      if (i === searchIndex) {
        item.style.background = 'var(--surface)';
        item.classList.add('active');
      } else {
        item.style.background = 'transparent';
        item.classList.remove('active');
      }
    });
  }

  function executeCommand(index) {
    if (index >= 0 && index < filteredCommands.length) {
      filteredCommands[index].action();
      App.closeSearch();
    }
  }

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      App.openSearch();
    }
    if (e.key === 'Escape') {
      const modal = document.getElementById('cmdPalette');
      if (modal && modal.classList.contains('open')) {
        e.preventDefault();
        App.closeSearch();
      }
    }
  });

  // Call initSearch immediately
  initSearch();

  function openResource(id) {
    const menu = document.getElementById('resMenuContainer');
    const content = document.getElementById('resContentContainer');
    const titleEl = document.getElementById('resContentTitle');
    const bodyEl = document.getElementById('resContentBody');
    
    if(!menu || !content || !bodyEl) return;
    
    let title = '';
    let htmlContent = '';
    
    if (id === 'res-breathing') {
      title = 'Tactical Box Breathing';
      htmlContent = '<div style="position: relative; padding-bottom: 56.25%; height: 0;"><iframe src="https://www.youtube.com/embed/tEmt1Znux58" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 12px;"></iframe></div><p style="margin-top:20px; color:var(--text-muted); line-height:1.6;">Box breathing is a powerful technique to hack your nervous system and instantly lower cortisol. Breathe in for 4 seconds, hold for 4, exhale for 4, and hold for 4.</p>';
    } else if (id === 'res-movement') {
      title = 'Desk Mobility Reset';
      htmlContent = '<div style="position: relative; padding-bottom: 56.25%; height: 0;"><iframe src="https://www.youtube.com/embed/tAUf7aajBWE" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 12px;"></iframe></div><p style="margin-top:20px; color:var(--text-muted); line-height:1.6;">Release tension in your neck, shoulders, and lower back caused by prolonged sitting. Follow along with this quick 5-minute routine.</p>';
    } else if (id === 'res-boundaries') {
      title = 'Async Communication Toolkit';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <h3 style="margin-top:0; color: var(--accent); font-size: 1.25rem;">Micro-Boundaries for Deep Work</h3>
          <p>Protecting your focus is essential for reducing cognitive fatigue. Use these polite, professional templates to establish boundaries.</p>
          
          <div style="background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-top: 20px;">
            <div style="font-weight:600; margin-bottom: 8px;">Template 1: Declining a Non-Essential Meeting</div>
            <code style="display:block; font-family: monospace; font-size: 0.9rem; color: var(--text-muted); background: #f4f5f7; padding: 12px; border-radius: 6px;">
              "Hi [Name], thanks for including me. I'm currently heads-down on [Project] this week and trying to protect my focus blocks. Could we resolve this asynchronously via a quick document or Slack thread instead?"
            </code>
          </div>
          
          <div style="background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-top: 16px;">
            <div style="font-weight:600; margin-bottom: 8px;">Template 2: Pushing Back on Timelines</div>
            <code style="display:block; font-family: monospace; font-size: 0.9rem; color: var(--text-muted); background: #f4f5f7; padding: 12px; border-radius: 6px;">
              "I understand this is a priority. Given my current bandwidth with [Current Task], I can deliver this by [Date]. Let me know if we need to deprioritize [Current Task] to accommodate this sooner."
            </code>
          </div>
        </div>
      `;
    } else if (id === 'res-worksheets') {
      title = '2-Minute Brain-Dump Matrix';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <p style="margin-top:0; color: var(--text-muted);">List what is overwhelming you right now, separated by commas. We will sort them to restore clarity.</p>
          <textarea id="braindumpInput" placeholder="e.g. Server crash, upcoming presentation, rent due, client email..." style="width: 100%; height: 100px; padding: 12px; border: 1px solid var(--border); border-radius: 8px; resize: none; font-family: inherit; font-size: 1rem; margin-bottom: 16px; box-sizing: border-box;"></textarea>
          <button onclick="App.sortBrainDump()" style="width: 100%; padding: 12px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Sort My Thoughts</button>
          <div id="braindumpResults" style="margin-top: 24px;"></div>
        </div>
      `;
    
    } else if (id === 'res-binaural') {
      title = 'Binaural Beats & Soundscapes';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <p style="margin-top:0; color: var(--text-muted);">Target Hazard: <strong>Workload / Environment</strong></p>
          <div style="background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <div style="font-weight:600; margin-bottom: 8px;">40 Hz Focus Waves</div>
            <p style="font-size: 0.9rem; margin-bottom: 12px; color: var(--text-muted);">Clinically shown to aid cognitive processing, deep-work focus, and memory retention during complex debugging or writing sessions.</p>
            <iframe width="100%" height="150" src="https://www.youtube.com/embed/nJwA05N_w5E" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:6px;"></iframe>
          </div>
          <div style="background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 8px;">
            <div style="font-weight:600; margin-bottom: 8px;">Brown Noise for ADHD / Overwhelm</div>
            <p style="font-size: 0.9rem; margin-bottom: 12px; color: var(--text-muted);">Mimics the roar of a distant waterfall or heavy rain, which helps quiet internal chatter and soothe an overstimulated nervous system.</p>
            <iframe width="100%" height="150" src="https://www.youtube.com/embed/hXrtQcWEptI" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="border-radius:6px;"></iframe>
          </div>
        </div>
      `;
    } else if (id === 'res-deescalation') {
      title = 'De-Escalation Chat Scripts';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <p style="margin-top:0; color: var(--text-muted);">Target Hazard: <strong>RoleClarity / SocialSupport</strong></p>
          <p>A major source of workplace anxiety stems from interpersonal communication—specifically, setting boundaries without sounding aggressive or missing context.</p>
          
          <div style="background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-top: 16px;">
            <div style="font-weight:600; margin-bottom: 8px;">The "Scope Creep" Interception Script</div>
            <p style="font-size: 0.9rem; margin-bottom: 8px; color: var(--text-muted);">Use when text message channels fill up with unassigned work.</p>
            <code style="display:block; font-family: monospace; font-size: 0.9rem; color: var(--text-muted); background: #f4f5f7; padding: 12px; border-radius: 6px;">
              "I would love to help tackle this bug. Given my current priority queue on [Project A], should we swap this item out, or hold it for the next milestone sprint?"
            </code>
          </div>

          <div style="background: var(--surface); border: 1px solid var(--border); padding: 16px; border-radius: 8px; margin-top: 16px;">
            <div style="font-weight:600; margin-bottom: 8px;">The Psychological Safety Feedback Guide</div>
            <p style="font-size: 0.9rem; margin-bottom: 8px; color: var(--text-muted);">A clean, 3-step script for 1-on-1s.</p>
            <ol style="padding-left: 16px; margin: 0; font-size: 0.9rem;">
              <li style="margin-bottom:8px;"><strong>Context:</strong> "I've noticed lately that expectations for [Role/Task] have been shifting."</li>
              <li style="margin-bottom:8px;"><strong>Impact:</strong> "This has caused some friction and anxiety around my actual deliverables."</li>
              <li><strong>Solution:</strong> "Could we spend 10 minutes clarifying the exact boundary of my role for the next quarter?"</li>
            </ol>
          </div>
        </div>
      `;
    } else if (id === 'res-chronobiology') {
      title = 'Chronobiology & Biomarker Syncs';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <p style="margin-top:0; color: var(--text-muted);">Target Hazard: <strong>WorkLifeBalance / Environment</strong></p>
          <p>Biological health directly drives psychological resistance. These resources focus on optimizing the physical systems that dictate your mood.</p>
          
          <h3 style="margin-top: 24px;">☕ The Caffeine Timing Curve</h3>
          <p>Drinking caffeine during the first 90 minutes of waking up can crash your adenosine system later in the afternoon. This causes anxiety spikes that feel exactly like a workload panic attack.</p>
          <div style="background: #f4f5f7; padding: 12px; border-radius: 8px; border-left: 4px solid var(--accent); margin: 16px 0;">
            <strong>Actionable Tip:</strong> Wait 90-120 minutes after waking before your first cup of coffee to allow natural cortisol to clear adenosine naturally.
          </div>

          <h3 style="margin-top: 24px;">🌙 The Blue-Light Sleep Anchor</h3>
          <p>Monitor color temperatures heavily suppress melatonin, leading to fragmented sleep patterns and direct morning exhaustion.</p>
          <div style="background: #f4f5f7; padding: 12px; border-radius: 8px; border-left: 4px solid var(--blue); margin: 16px 0;">
            <strong>Actionable Tip:</strong> Enable "Night Shift" or "f.lux" on all devices exactly 2 hours before bed. Keep bedroom temperature between 65-68°F (18-20°C).
          </div>
        </div>
      `;
    } else if (id === 'res-peerwalls') {
      title = 'Asynchronous Social Peer-Walls';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <p style="margin-top:0; color: var(--text-muted);">Target Hazard: <strong>SocialSupport</strong></p>
          <p>Isolation is a quiet driver of high turn-over and low workplace mood, particularly in distributed or highly independent environments.</p>
          
          <h3 style="margin-top: 24px;">🏆 The "Wins" Log Template</h3>
          <p>A lightweight framework that guides a user through cataloging small victories or peer accomplishments from the week. This shifts focus away from what went wrong and reminds them of shared team milestones.</p>
          <ul style="margin: 16px 0; padding-left: 16px;">
            <li style="margin-bottom:8px;"><strong>Setup a #weekly-wins channel:</strong> Dedicate a Slack/Teams channel solely for wins.</li>
            <li style="margin-bottom:8px;"><strong>Format:</strong> [Teammate Name] crushed it this week by [Action].</li>
            <li><strong>Cadence:</strong> Every Friday at 2PM, schedule an automated prompt.</li>
          </ul>

          <h3 style="margin-top: 24px;">🗣️ The Clear Communication Ritual</h3>
          <p>A guide for setting up brief, informal, non-work-related virtual check-ins with peers to encourage conversational connection without adding meeting fatigue.</p>
          <ul style="margin: 16px 0; padding-left: 16px;">
            <li style="margin-bottom:8px;"><strong>The "Donut" Match:</strong> Randomly pair team members for a 15-minute chat once every two weeks.</li>
            <li style="margin-bottom:8px;"><strong>Rule:</strong> No project updates allowed.</li>
          </ul>
        </div>
      `;
    } else if (id === 'res-mindfulness') {
      title = 'Cognitive Reframing Matrix';
      htmlContent = `
        <div style="line-height: 1.6; color: var(--text-dark);">
          <p style="margin-top:0; color: var(--text-muted);">Identify a negative thought and reframe it into a constructive perspective.</p>
          <label style="font-weight:600; display:block; margin-bottom:6px;">1. The Automatic Thought</label>
          <input type="text" placeholder="e.g. I totally ruined that presentation..." style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 1rem; margin-bottom: 16px; box-sizing: border-box;">
          
          <label style="font-weight:600; display:block; margin-bottom:6px;">2. The Evidence Against It</label>
          <input type="text" placeholder="e.g. Only one slide had a typo, the client still smiled..." style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 1rem; margin-bottom: 16px; box-sizing: border-box;">
          
          <label style="font-weight:600; display:block; margin-bottom:6px;">3. The Reframe</label>
          <input type="text" placeholder="e.g. I made a small mistake but delivered the core message well." style="width: 100%; padding: 12px; border: 1px solid var(--border); border-radius: 8px; font-family: inherit; font-size: 1rem; margin-bottom: 24px; box-sizing: border-box;">
          
          <button onclick="alert('Reframe saved! Great work protecting your baseline.'); App.backToResources();" style="width: 100%; padding: 12px; background: var(--purple); color: white; border: none; border-radius: 8px; font-weight: 600; cursor: pointer;">Complete Reframe</button>
        </div>
      `;
    }
    
    titleEl.innerText = title;
    bodyEl.innerHTML = htmlContent;
    
    menu.style.display = 'none';
    content.style.display = 'flex';
  }
  
  
  function sortBrainDump() {
    const val = document.getElementById('braindumpInput').value;
    if(!val.trim()) return;
    const items = val.split(',').map(s => s.trim()).filter(s => s);
    document.getElementById('braindumpResults').innerHTML = items.map(item => 
      '<div style="margin-bottom:12px; padding:12px; background:var(--surface); border:1px solid var(--border); border-radius:8px;">' + 
      '<div style="font-weight:500; margin-bottom:8px;">' + item + '</div>' + 
      '<div style="display:flex; gap:8px;">' + 
        '<button onclick="App.markBrainDumpItem(this, true)" style="padding:6px 12px; background:#e2f0e8; color:var(--accent); border:none; border-radius:4px; cursor:pointer; font-size:0.85rem;">In my control</button>' + 
        '<button onclick="App.markBrainDumpItem(this, false)" style="padding:6px 12px; background:#f4f5f7; color:var(--text-muted); border:none; border-radius:4px; cursor:pointer; font-size:0.85rem;">Out of my control</button>' + 
      '</div></div>'
    ).join('');
    document.getElementById('braindumpInput').value = '';
  }

  function markBrainDumpItem(btn, isControl) {
    const wrapper = btn.parentElement.parentElement;
    wrapper.style.opacity = 0.5;
    const actions = btn.parentElement;
    if (isControl) {
      actions.innerHTML = '<span style="color:var(--accent); font-weight:600;">In my control</span>';
    } else {
      actions.innerHTML = '<span style="color:var(--text-muted); font-weight:600;">Out of my control</span>';
    }
  }

  function backToResources() {
    const menu = document.getElementById('resMenuContainer');
    const content = document.getElementById('resContentContainer');
    const bodyEl = document.getElementById('resContentBody');
    
    if(!menu || !content) return;
    
    // Clear iframe/video content so audio stops playing
    if(bodyEl) bodyEl.innerHTML = '';
    
    content.style.display = 'none';
    menu.style.display = 'block';
  }

  const showToast = (title, desc, type = 'info') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
    } else if (type === 'warning' || type === 'error') {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>';
    } else {
      iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>';
    }

    toast.innerHTML = `
      <div class="toast-icon">${iconSvg}</div>
      <div style="flex: 1; min-width: 0;">
        <div class="toast-title">${title}</div>
        <div class="toast-desc">${desc}</div>
      </div>
      <button class="toast-close" onclick="this.parentElement.remove()" aria-label="Close">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
      if (toast.parentElement) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(120%)';
        setTimeout(() => toast.remove(), 400);
      }
    }, 4000);
  };
  
  return {
    navigate,
    openSurvey,
    closeSurvey,
    surveyNext,
    surveyBack,
    toggleContextDrawer,
    filterChartTimeframe,
    filterChartTimeframe,
    openResources: () => { openModal('resBackdrop'); document.getElementById('resPanel').classList.add('open'); },
    closeResources: () => { closeModal('resBackdrop'); document.getElementById('resPanel').classList.remove('open'); },
    openProfileSettings: () => { showToast('Profile Settings', 'Profile configuration will be available in a future update.', 'info'); },
    openSettings: () => { showToast('Settings', 'Platform preferences will be available in a future update.', 'info'); },
    openHelp: () => { showToast('Help Centre', 'Help centre is currently being integrated.', 'info'); },
    openContact: () => { showToast('Contact Support', 'Support ticketing is currently being integrated.', 'info'); },
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
        const input = document.getElementById('cmdInput');
        input.value = '';
        filteredCommands = commands;
        renderSearchResults();
        setTimeout(() => input.focus(), 100);
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
    
    openLegal: (type) => {
      const titleEl = document.getElementById('genericPanelTitle');
      const bodyEl = document.getElementById('genericPanelBody');
      let title = '';
      let content = '';

      if (type === 'privacy') {
        title = 'Privacy Policy';
        content = `
          <h3>Data Minimization & Collection</h3>
          <p>We explicitly collect only essential data: encrypted email hashes, role designations, and survey questionnaire answers.</p>
          <h3>The Anonymity Guarantee</h3>
          <p>Individual survey scores are cryptographically aggregated. HR managers or administrators can only see group-level distributions (e.g., department averages) once a specific threshold of respondents is met, making individual re-identification structurally impossible.</p>
          <h3>Data Retention</h3>
          <p>Records are maintained securely in our database. Organizations can request a complete data wipe upon contract termination, with a 30-day processing window.</p>
        `;
      } else if (type === 'terms') {
        title = 'Terms of Service';
        content = `
          <h3>Acceptable Use Policy</h3>
          <p>This platform is explicitly a preventative wellness and compliance benchmarking tool—not a clinical medical diagnostic suite or an emergency crisis response system.</p>
          <h3>Subscription & Multi-Tenancy Rules</h3>
          <p>Defines tenant isolation parameters, seat licensing limitations, payment terms, and platform uptime SLA guidelines.</p>
          <h3>Limitation of Liability</h3>
          <p>Wellframe is protected from legal exposure if an organization misinterprets aggregate workplace stress trends or implements flawed internal policies based on system dashboards.</p>
        `;
      } else if (type === 'hipaa') {
        title = 'HIPAA Compliance';
        content = `
          <h3>PHI Protected Status Statement</h3>
          <p>Anonymous survey answers generally do not constitute Protected Health Information (PHI) under HIPAA, but our system treats all psychometric data with PHI-level security.</p>
          <h3>Business Associate Agreement (BAA)</h3>
          <p>Our platform acts as a secure data processor (Business Associate) and implements mandatory technical safeguards (like zero-knowledge cryptographic hashes and at-rest storage encryption) to prevent unauthorized healthcare exposure.</p>
        `;
      } else if (type === 'gdpr') {
        title = 'GDPR Compliance';
        content = `
          <h3>Legal Basis for Processing</h3>
          <p>Data is processed under the "Consent" of the employee taking the survey, or the "Legitimate Interest" of an employer monitoring workplace occupational health hazards (ISO 45003 compliance).</p>
          <h3>Data Subject Rights (DSR)</h3>
          <p>Employees can exercise their Right to Be Forgotten (data deletion), Right to Access, or Right to Portability. Our system fulfills these requests while keeping anonymous aggregate records intact to preserve historical benchmarking.</p>
          <h3>Data Protection Officer (DPO)</h3>
          <p>Contact our designated data security authority at privacy@wellframe.io for complex compliance inquiries.</p>
        `;
      }

      titleEl.innerText = title;
      bodyEl.innerHTML = content;
      openModal('genericBackdrop');
      document.getElementById('genericPanel').classList.add('open');
    },
    openContact: () => {
      const titleEl = document.getElementById('genericPanelTitle');
      const bodyEl = document.getElementById('genericPanelBody');
      titleEl.innerText = 'Contact & Support';
      bodyEl.innerHTML = `
        <h3>Support Triage Lines</h3>
        <p>Dedicated contact emails divided by urgency:</p>
        <ul>
          <li><strong>nanakwamedickson@outlook.com</strong>: Platform crashes & urgent technical support.</li>
          <li><strong>bnanakwamedickson@outlook.com</strong>: Enterprise accounts & billing.</li>
        </ul>
        <h3>Response Window Assurances</h3>
        <p>Our support engineering team typically responds to enterprise dashboard tickets within 24 operational business hours.</p>
      `;
      openModal('genericBackdrop');
      document.getElementById('genericPanel').classList.add('open');
    },
    closeGeneric: () => {
      closeModal('genericBackdrop');
      document.getElementById('genericPanel').classList.remove('open');
    },
    openResource,
    backToResources,
    sortBrainDump,
    markBrainDumpItem,
    executeCommand
  };
})();
