const fs = require('fs');

let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

// Find where to cut off the broken stuff
const cutoffText = 'fas10: { completed: false },';
const cutoffIdx = html.indexOf(cutoffText);

if (cutoffIdx === -1) {
    console.log("Could not find cutoff!");
    process.exit(1);
}

let newHtml = html.substring(0, cutoffIdx + cutoffText.length) + "\n";
newHtml += `      copsoq3_core: { completed: false },
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
    
    document.getElementById('modalQNum').innerText = \`Question \${currentIndex + 1} of \${survey.questions.length}\`;
    
    const qObj = survey.questions[currentIndex];
    document.getElementById('modalQText').innerText = typeof qObj === 'string' ? qObj : qObj.text;
    
    document.getElementById('modalProgress').style.width = \`\${(currentIndex / survey.questions.length) * 100}%\`;
    
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
      btn.innerHTML = \`
        <div class="option-radio"></div>
        <div class="option-text">\${opt.text}</div>
      \`;
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
    document.getElementById('modalQText').innerHTML = \`<div style="text-align:center; padding: 40px 0;">
      <svg viewBox="0 0 24 24" fill="none" stroke="#4FB286" stroke-width="2" style="width: 64px; height: 64px; margin-bottom: 20px;"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"></path></svg>
      <h3 style="font-size: 1.5rem; margin-bottom: 10px;">Check-in Complete</h3>
      <p style="color: var(--text-2);">Your secure response has been recorded.</p>
      <button class="btn btn-primary" style="margin-top: 24px;" onclick="App.closeSurvey()">Done</button>
    </div>\`;
    document.getElementById('modalOptions').innerHTML = '';
    document.getElementById('modalBack').style.display = 'none';
    document.getElementById('modalNext').style.display = 'none';
    document.getElementById('modalQNum').style.display = 'none';
    
    // Simulate updating backend and dashboard score
    state.surveyProgress[state.surveyState.type].completed = true;
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
        div.innerHTML = \`
          <div style="font-size: 1.25rem; font-weight: 700; color: \${dim.status === 'healthy' ? 'var(--healthy)' : 'var(--moderate)'}">\${dim.value}</div>
          <div style="font-size: 0.75rem; color: var(--text-3); font-weight: 500; text-transform: uppercase;">\${dim.label}</div>
        \`;
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
        card.className = \`survey-card \${prog.completed ? 'completed' : ''}\`;
        card.onclick = () => App.openSurvey(code);
        card.innerHTML = \`
          <div class="survey-head">
            <span class="survey-code">\${s.code}</span>
            <span class="survey-status \${prog.completed ? 'done' : 'progress'}">\${prog.completed ? 'Completed' : 'Available'}</span>
          </div>
          <h3>\${s.name || s.title}</h3>
          <p class="desc">\${s.description || 'Check-in on your wellbeing.'}</p>
          <div class="survey-meta">
            <span class="survey-time">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              \${s.estimatedMinutes || 5} min
            </span>
            <div class="survey-arrow">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>
          </div>
        \`;
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
    closeNotifications: () => {},
    markAllRead: () => {},
    closeGeneric: () => {}
  };
})();
</script>
</body>
</html>
`;

fs.writeFileSync('private/app/dashboard.html', newHtml);
console.log("Successfully rebuilt dashboard.html inline script!");
