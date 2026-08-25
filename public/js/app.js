/**
 * @fileoverview Workspace application logic for Havilah.
 * Handles employee and HR views, local data persistence, Survey Engine, and UI state.
 */
(function() {
    'use strict';

    /** 
     * Constants & Configuration
     */
    const N_SIZE_THRESHOLD = 5;
    
    // Safety Keywords for Crisis Detection (Local Only)
    const CRISIS_KEYWORDS = [
        'suicide', 'kill myself', 'end it all', 'die', 'worthless', 
        'hurt myself', 'can\'t go on', 'no point living'
    ];

    /**
     * Mock Survey Definitions
     */
    const SURVEY_DEF = {
        'PHQ-9': [
            "Little interest or pleasure in doing things?",
            "Feeling down, depressed, or hopeless?",
            "Trouble falling or staying asleep, or sleeping too much?",
            "Feeling tired or having little energy?"
        ],
        'GAD-7': [
            "Feeling nervous, anxious or on edge?",
            "Not being able to stop or control worrying?",
            "Worrying too much about different things?",
            "Trouble relaxing?"
        ],
        'PSS-10': [
            "In the last month, how often have you been upset because of something that happened unexpectedly?",
            "In the last month, how often have you felt that you were unable to control the important things in your life?"
        ],
        'FAS-10': [
            "I am bothered by fatigue.",
            "I get tired very quickly."
        ],
        'COPSOQ-II': [
            "Do you have to work very fast?",
            "Is your work emotionally demanding?",
            "Do you feel that your work is meaningful?"
        ]
    };

    /** 
     * @type {Object} Application State 
     */
    let state = {
        view: 'employee',
        tenantInfo: { name: 'Acme Corp', id: 'ten-123' },
        userRole: 'employee',
        userName: 'Alex Doe',
        userInitials: 'AD',
        consented: false,
        notifications: [
            { id: 1, text: "Your weekly Check-in is ready.", read: false },
            { id: 2, text: "Company-wide burnout pulse is active", read: false }
        ],
        surveyState: {
            active: false,
            type: null,
            currentQuestion: 0,
            answers: []
        },
        hotlineConfig: null
    };

    // Initialize Plyr players array to keep track of instances
    let plyrInstances = [];

    /**
     * Session Management
     */
    async function initSession() {
        const stored = localStorage.getItem('wf_consent');
        if (stored === 'true') {
            state.consented = true;
            document.getElementById('consent-gate').classList.add('hidden');
        } else {
            document.getElementById('consent-gate').classList.remove('hidden');
        }

        document.getElementById('userNameDisplay').textContent = state.userName;
        document.getElementById('userRoleDisplay').textContent = state.userRole === 'hr_admin' ? 'HR Administrator' : 'Employee';
        document.getElementById('userInitials').textContent = state.userInitials;
        document.getElementById('tenantName').textContent = state.tenantInfo.name;

        if (state.userRole === 'hr_admin') {
            document.querySelectorAll('.hr-only').forEach(el => el.classList.remove('hidden'));
        }

        renderEmployeeDashboard();
        renderNotifications();
        
        // Fetch Tenant Config
        try {
            const res = await fetch('/api/v1/tenant/config', { 
                headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('token') || '') }
            });
            const contentType = res.headers.get('content-type') || '';
            if (res.ok && contentType.includes('application/json')) {
                const data = await res.json();
                if (data && data.data) {
                    state.hotlineConfig = data.data.hotline_config;
                }
            } else {
                throw new Error("API response not JSON");
            }
        } catch (e) {
            // Fallback to local config if server not running during dev
            state.hotlineConfig = {
                eap_number: "1-800-555-1234",
                crisis_number: "988",
                occupational_health_contact: "occ-health@example.com"
            };
        }

        // Simulate risk anomaly to trigger Contextual Recommendation Engine
        setTimeout(() => triggerAnomalyDetection(), 1000);
    }

    function triggerAnomalyDetection() {
        // Simulate a 35% spike in "Workload/Time Boundary Overrun"
        const isAnomalyDetected = true; 
        
        if (isAnomalyDetected) {
            document.getElementById('contextual-recommendations-section').classList.remove('hidden');
            const container = document.getElementById('contextual-recommendations-container');
            container.innerHTML = `
                <div class="card p-4 rounded-lg border border-indigo-200 bg-indigo-50 hover:shadow-md transition">
                    <div class="flex items-start justify-between">
                        <div>
                            <span class="px-2 py-1 bg-indigo-100 text-indigo-800 text-xs rounded font-medium mb-2 inline-block">High Workload Flag</span>
                            <h3 class="font-bold text-gray-800">Box Breathing - 4-4-4-4</h3>
                            <p class="text-xs text-gray-600 mt-1">Regulate your nervous system between intense tasks.</p>
                        </div>
                        <button class="bg-indigo-600 text-white p-2 rounded-full hover:bg-indigo-700" onclick="window.app.openResourceLibrary('audio')">
                            <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd"></path></svg>
                        </button>
                    </div>
                </div>
                <div class="card p-4 rounded-lg border border-orange-200 bg-orange-50 hover:shadow-md transition">
                    <div class="flex items-start justify-between">
                        <div>
                            <span class="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded font-medium mb-2 inline-block">Recovery Focus</span>
                            <h3 class="font-bold text-gray-800">Setting work-life boundaries</h3>
                            <p class="text-xs text-gray-600 mt-1">Protect your energy to prevent burnout.</p>
                        </div>
                        <button class="bg-orange-600 text-white text-xs px-3 py-1 rounded mt-3 hover:bg-orange-700" onclick="window.app.openResourceLibrary('articles')">Read</button>
                    </div>
                </div>
            `;
        }
    }

    function logout() {
        localStorage.removeItem('wellframe_session_user');
        localStorage.removeItem('wellframe_session_tenant');
        localStorage.removeItem('wellframe_consent');
        window.location.href = 'index.html';
    }

    /**
     * View Switching
     * @param {string} viewName - 'employee' or 'hr'
     */
    function switchView(viewName) {
        state.view = viewName;
        
        // Update Buttons
        document.querySelectorAll('.nav-btn').forEach(btn => {
            if (btn.dataset.view === viewName) {
                btn.classList.add('active', 'text-indigo-700', 'bg-indigo-50');
                btn.classList.remove('text-gray-600', 'hover:bg-gray-100');
                btn.setAttribute('aria-current', 'page');
            } else {
                btn.classList.remove('active', 'text-indigo-700', 'bg-indigo-50');
                btn.classList.add('text-gray-600', 'hover:bg-gray-100');
                btn.removeAttribute('aria-current');
            }
        });

        // Update Views
        document.querySelectorAll('.view').forEach(view => view.classList.add('hidden'));
        document.getElementById(`view-${viewName}`).classList.remove('hidden');

        // Render appropriate data
        if (viewName === 'employee') {
            renderEmployeeDashboard();
        } else if (viewName === 'hr') {
            renderHRDashboard();
        }
    }

    /**
     * Consent Gate
     */
    function acceptConsent() {
        state.consented = true;
        localStorage.setItem('wf_consent', 'true');
        document.getElementById('consent-gate').classList.add('hidden');
        showToast('Consent registered. Welcome to your secure workspace.', 3000);
    }

    function declineConsent() {
        showToast('Confidentiality terms required. Redirecting to home...', 3000, 'warning');
        setTimeout(() => logout(), 1000);
    }

    /**
     * Survey Engine
     */
    function openSurvey(surveyType) {
        state.surveyState = {
            active: true,
            type: surveyType,
            currentQuestion: 0,
            answers: []
        };
        
        document.getElementById('surveyTitle').textContent = surveyType;
        openModal('surveyModal');
        renderQuestion();
    }

    async function closeSurvey() {
        if (state.surveyState.answers.length > 0 && state.surveyState.currentQuestion < SURVEY_DEF[state.surveyState.type].length) {
            let confirmed = true;
            if (typeof showCustomConfirm === 'function') {
              confirmed = await showCustomConfirm({
                title: 'Exit Survey?',
                message: 'Are you sure you want to exit? Your progress will be lost.',
                confirmText: 'Exit Survey',
                danger: true
              });
            }
            if (!confirmed) return;
        }
        state.surveyState.active = false;
        closeModal('surveyModal');
    }

    function renderQuestion() {
        const type = state.surveyState.type;
        const questions = SURVEY_DEF[type];
        const currentIndex = state.surveyState.currentQuestion;
        
        if (currentIndex >= questions.length) {
            completeSurvey();
            return;
        }

        // Update UI
        document.getElementById('surveyQuestionText').textContent = questions[currentIndex];
        document.getElementById('surveyStepText').textContent = `${currentIndex + 1} of ${questions.length}`;
        document.getElementById('surveyProgress').style.width = `${((currentIndex) / questions.length) * 100}%`;
        
        // Buttons
        document.getElementById('surveyBtnPrev').disabled = currentIndex === 0;
        
        // Options rendering
        const container = document.getElementById('surveyOptionsContainer');
        container.innerHTML = '';
        
        const options = ['Not at all', 'Several days', 'More than half the days', 'Nearly every day'];
        
        options.forEach((opt, idx) => {
            const btn = document.createElement('button');
            btn.className = 'w-full py-3 px-4 border rounded-lg text-sm font-medium text-gray-700 hover:bg-indigo-50 hover:border-indigo-300 transition focus:ring-2 focus:ring-indigo-500';
            btn.textContent = opt;
            btn.onclick = () => {
                state.surveyState.answers[currentIndex] = idx;
                surveyNext();
            };
            container.appendChild(btn);
        });
    }

    function surveyBack() {
        if (state.surveyState.currentQuestion > 0) {
            state.surveyState.currentQuestion--;
            renderQuestion();
        }
    }

    function surveyNext() {
        const type = state.surveyState.type;
        if (state.surveyState.currentQuestion < SURVEY_DEF[type].length) {
            state.surveyState.currentQuestion++;
            renderQuestion();
        }
    }

    function completeSurvey() {
        document.getElementById('surveyProgress').style.width = `100%`;
        document.getElementById('surveyQuestionContainer').innerHTML = `
            <svg class="w-16 h-16 text-green-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
            <h4 class="text-xl font-bold text-gray-800 mb-2">Check-in Complete</h4>
            <p class="text-sm text-gray-500 mb-6">Your secure response has been recorded.</p>
            <div class="flex flex-wrap items-center justify-center gap-3">
                <button class="inline-flex items-center gap-2 px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white font-medium text-sm rounded-lg shadow-sm transition" onclick="if (window.generateAssessmentReportPdf) { window.generateAssessmentReportPdf({ surveyType: state.surveyState.type }); }">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
                    <span>Download Confidential Report (PDF)</span>
                </button>
                <button class="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium text-sm rounded-lg transition" onclick="window.app.closeSurvey()">Done</button>
            </div>
        `;
        document.getElementById('surveyBtnPrev').classList.add('hidden');
        document.getElementById('surveyBtnNext').classList.add('hidden');
        document.getElementById('surveyStepText').classList.add('hidden');
        
        showToast(`Successfully completed ${state.surveyState.type}`, 3000);
    }

    /**
     * Employee Dashboard Rendering
     */
    function renderEmployeeDashboard() {
        // Render rings
        const container = document.getElementById('balanceRingsContainer');
        container.innerHTML = '';
        const metrics = [
            { name: 'Mood', val: 75, color: '#6366f1' },
            { name: 'Calm', val: 60, color: '#10b981' },
            { name: 'Stress', val: 40, color: '#f59e0b' },
            { name: 'Energy', val: 80, color: '#3b82f6' },
            { name: 'WorkFit', val: 85, color: '#8b5cf6' }
        ];

        metrics.forEach(m => {
            const div = document.createElement('div');
            div.className = 'flex flex-col items-center justify-center p-2';
            div.innerHTML = `
                <div class="relative w-16 h-16 mb-2">
                    <svg class="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                        <path class="text-gray-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
                        <path style="color: ${m.color}; stroke-dasharray: ${m.val}, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" stroke-width="3"></path>
                    </svg>
                    <span class="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-700">${m.val}</span>
                </div>
                <span class="text-xs font-medium text-gray-500">${m.name}</span>
            `;
            container.appendChild(div);
        });

        renderTrendChart();
    }

    function renderTrendChart() {
        const ctx = document.getElementById('employeeTrendChart');
        if (!ctx) return;
        
        if (state.charts && state.charts.trend) {
            state.charts.trend.destroy();
        }

        state.charts = state.charts || {};
        state.charts.trend = new Chart(ctx, {
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

    /**
     * HR Analytics Dashboard Rendering
     */
    function renderHRDashboard() {
        applyFilters(); 
    }

    function applyFilters() {
        const dept = document.getElementById('filter-dept').value;
        const role = document.getElementById('filter-role').value;
        
        // MOCK DATA GENERATION BASED ON FILTERS
        // Simulate population sizes
        let mockCount = 120; // total
        if (dept !== 'all') mockCount = Math.floor(mockCount / 3);
        if (role !== 'all') mockCount = Math.floor(mockCount / 2);

        // N-SIZE RULE ENFORCEMENT
        if (mockCount < N_SIZE_THRESHOLD) {
            document.getElementById('hr-privacy-warning').classList.remove('hidden');
            document.getElementById('hr-content-area').classList.add('hidden');
            return;
        } else {
            document.getElementById('hr-privacy-warning').classList.add('hidden');
            document.getElementById('hr-content-area').classList.remove('hidden');
        }

        // Generate perturbed data based on dept to simulate interactivity
        const baseWellbeing = dept === 'engineering' ? 6.8 : (dept === 'sales' ? 7.6 : 7.2);
        
        document.getElementById('kpi-participation').textContent = `${Math.min(98, 70 + (mockCount % 15))}%`;
        document.getElementById('kpi-wellbeing').textContent = `${baseWellbeing}/10`;
        document.getElementById('kpi-risk').textContent = `${10 + (mockCount % 8)}%`;

        renderSeverityChart(dept);
        renderRadarChart();
        buildHeatmap();
        populateLeaderboard();
        generateAlerts();
    }

    function setMetric(metricName) {
        document.querySelectorAll('.metric-pill').forEach(p => {
            p.classList.remove('active', 'bg-indigo-100', 'text-indigo-800');
            p.classList.add('bg-gray-100', 'text-gray-600');
        });
        event.currentTarget.classList.add('active', 'bg-indigo-100', 'text-indigo-800');
        event.currentTarget.classList.remove('bg-gray-100', 'text-gray-600');
        
        // Re-render
        applyFilters();
    }

    function renderSeverityChart(deptModifier) {
        const ctx = document.getElementById('hrSeverityChart');
        if (!ctx) return;
        if (state.charts && state.charts.severity) state.charts.severity.destroy();

        let data = deptModifier === 'engineering' ? [15, 60, 25] : [40, 45, 15]; // low, med, high risk

        state.charts.severity = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Low Risk', 'Moderate Risk', 'High Risk'],
                datasets: [{
                    data: data,
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: {
                    legend: { position: 'bottom' }
                }
            }
        });
    }

    function renderRadarChart() {
        const ctx = document.getElementById('hrRadarChart');
        if (!ctx) return;
        if (state.charts && state.charts.radar) state.charts.radar.destroy();

        state.charts.radar = new Chart(ctx, {
            type: 'radar',
            data: {
                labels: ['Work Pace', 'Emotional Demands', 'Meaning', 'Predictability', 'Rewards'],
                datasets: [{
                    label: 'Current Period',
                    data: [70, 85, 65, 50, 60],
                    backgroundColor: 'rgba(99, 102, 241, 0.2)',
                    borderColor: '#6366f1',
                    pointBackgroundColor: '#6366f1'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    r: { min: 0, max: 100, ticks: { stepSize: 20 } }
                }
            }
        });
    }

    function buildHeatmap() {
        const container = document.getElementById('hrHeatmapContainer');
        const departments = ['Engineering', 'Sales', 'Product', 'Support'];
        const factors = ['Burnout', 'Workload', 'Support', 'Autonomy'];

        let html = `<table class="w-full text-xs text-center border-collapse">`;
        html += `<thead><tr><th class="p-2 text-left text-gray-600">Department</th>`;
        factors.forEach(f => html += `<th class="p-2 text-gray-600">${f}</th>`);
        html += `</tr></thead><tbody>`;

        departments.forEach(d => {
            html += `<tr><td class="p-2 text-left font-medium border-b border-gray-100">${d}</td>`;
            factors.forEach(f => {
                const val = Math.floor(Math.random() * 100);
                let colorClass = 'bg-green-100 text-green-800';
                if (val > 50) colorClass = 'bg-yellow-100 text-yellow-800';
                if (val > 80) colorClass = 'bg-red-100 text-red-800';
                html += `<td class="p-1 border-b border-gray-100"><div class="rounded ${colorClass} py-1 px-2 mx-1">${val}</div></td>`;
            });
            html += `</tr>`;
        });
        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    function populateLeaderboard() {
        const tbody = document.getElementById('leaderboardBody');
        const data = [
            { dept: 'Product', score: 8.2, trend: '+0.4' },
            { dept: 'Support', score: 7.8, trend: '+0.1' },
            { dept: 'Sales', score: 6.9, trend: '-0.3' },
            { dept: 'Engineering', score: 6.4, trend: '-0.8' }
        ];

        tbody.innerHTML = data.map(row => `
            <tr class="bg-white border-b">
                <td class="px-4 py-3 font-medium text-gray-900">${row.dept}</td>
                <td class="px-4 py-3">${row.score}</td>
                <td class="px-4 py-3 ${row.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'}">${row.trend}</td>
                <td class="px-4 py-3"><button class="text-indigo-600 hover:underline">View</button></td>
            </tr>
        `).join('');
    }

    function generateAlerts() {
        const list = document.getElementById('hrAlertsList');
        const alerts = [
            { text: "Burnout risk in Engineering exceeded threshold (20%).", type: "critical" },
            { text: "Sales department participation dropped below 50%.", type: "warning" },
            { text: "15 new anonymous feedback entries logged.", type: "info" }
        ];

        list.innerHTML = alerts.map(a => {
            const iconColor = a.type === 'critical' ? 'text-red-500' : (a.type === 'warning' ? 'text-yellow-500' : 'text-blue-500');
            return `
            <li class="flex items-start gap-3 text-sm p-2 rounded hover:bg-gray-50">
                <svg class="w-5 h-5 flex-shrink-0 mt-0.5 ${iconColor}" fill="currentColor" viewBox="0 0 20 20"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"></path></svg>
                <span class="text-gray-700">${a.text}</span>
            </li>
        `}).join('');
    }

    function exportReport() {
        showToast("Generating CSV Export...", 2000);
        setTimeout(() => {
            showToast("Report download started. Sensitive data filtered out per ISO 45003.", 4000);
        }, 1500);
    }

    function searchInput(val) {
        const res = document.getElementById('searchResults');
        if (!val.trim()) {
            res.innerHTML = '<div class="p-4 text-sm text-gray-500 text-center">Type to begin searching...</div>';
            return;
        }
        
        const lowerVal = val.toLowerCase();
        let html = '';
        if ('phq-9'.includes(lowerVal) || 'survey'.includes(lowerVal)) {
            html += `<a href="#" class="block p-3 hover:bg-indigo-50 border-b text-sm" onclick="window.app.openSurvey('PHQ-9')"><span class="font-bold">PHQ-9</span> - Take Check-in</a>`;
        }
        if ('burnout'.includes(lowerVal) || 'resource'.includes(lowerVal)) {
            html += `<a href="#" class="block p-3 hover:bg-indigo-50 border-b text-sm" onclick="window.app.openResourceLibrary()"><span class="font-bold">Managing Burnout</span> - Read Resource</a>`;
        }
        
        res.innerHTML = html || '<div class="p-4 text-sm text-gray-500 text-center">No results found</div>';
    }

    function toggleProfileMenu() {
        const panel = document.getElementById('profilePanel');
        panel.classList.toggle('hidden');
        document.getElementById('notifPanel').classList.add('hidden');
    }

    function toggleNotifications() {
        const panel = document.getElementById('notifPanel');
        panel.classList.toggle('hidden');
        document.getElementById('profilePanel').classList.add('hidden');
        renderNotifications();
    }

    function renderNotifications() {
        const list = document.getElementById('notifList');
        const badge = document.getElementById('notifBadge');
        
        const unread = state.notifications.filter(n => !n.read).length;
        if (unread > 0) {
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        if (state.notifications.length === 0) {
            list.innerHTML = `<li class="px-4 py-3 text-sm text-gray-500 text-center">No new notifications</li>`;
            return;
        }

        list.innerHTML = state.notifications.map(n => `
            <li class="px-4 py-3 border-b hover:bg-gray-50 ${n.read ? 'opacity-60' : 'bg-indigo-50/30'}">
                <p class="text-sm text-gray-800">${n.text}</p>
                <p class="text-xs text-gray-400 mt-1">Just now</p>
            </li>
        `).join('');
    }

    function markAllRead() {
        state.notifications.forEach(n => n.read = true);
        renderNotifications();
    }

    function submitAnonFeedback() {
        const txtarea = document.getElementById('anonFeedbackText');
        const text = txtarea.value;
        
        if (!text.trim()) {
            showToast("Feedback cannot be empty.", 3000);
            return;
        }

        const lowerText = text.toLowerCase();
        const hasCrisisWord = CRISIS_KEYWORDS.some(kw => lowerText.includes(kw));
        
        if (hasCrisisWord) {
            document.getElementById('crisisBanner').classList.remove('hidden');
            txtarea.value = '';
            showToast("Your safety is our priority. Please read the banner above.", 5000);
            return;
        }

        txtarea.value = '';
        showToast("Feedback submitted anonymously.", 3000);
    }

    function closeCrisisBanner() {
        document.getElementById('crisisBanner').classList.add('hidden');
    }

    function openModal(id) {
        document.getElementById(id).classList.remove('hidden');
    }
    
    function closeModal(id) {
        document.getElementById(id).classList.add('hidden');
    }

    function openLegal() { openModal('legalModal'); }
    function closeLegal() { closeModal('legalModal'); }
    function destroyPlyrInstances() {
        plyrInstances.forEach(p => p.destroy());
        plyrInstances = [];
    }

    function openResourceLibrary(tab = 'audio') { 
        openModal('resourceModal'); 
        switchResourceTab(tab);
    }

    function closeResource() { 
        destroyPlyrInstances();
        closeModal('resourceModal'); 
    }

    function switchResourceTab(tab) {
        destroyPlyrInstances();
        const area = document.getElementById('resourceContentArea');
        document.getElementById('resourceModalTitle').textContent = `Resource Library - ${tab.charAt(0).toUpperCase() + tab.slice(1)}`;
        
        if (tab === 'audio') {
            const config = window.BreathingAudioConfig || { box_breathing: { title: '4-4-4-4 Breathing', description: 'Deep calming breath', youtube_id: '123' } };
            const box = config.box_breathing;
            area.innerHTML = `
                <h4 class="text-xl font-bold mb-4 text-gray-800">Guided Breathing</h4>
                <div class="card p-6 bg-indigo-900 rounded-xl flex flex-col items-center justify-center text-white mb-6 relative overflow-hidden">
                    <div id="breathing-circle" class="w-32 h-32 rounded-full border-4 border-indigo-400 opacity-50 mb-6"></div>
                    <h5 class="font-bold text-lg">${box.title}</h5>
                    <div class="w-full max-w-sm z-10"><div id="plyr-audio-1" data-plyr-provider="youtube" data-plyr-embed-id="${box.youtube_id}"></div></div>
                </div>
            `;
            const player = new Plyr('#plyr-audio-1', { controls: ['play', 'progress', 'current-time', 'mute', 'volume'] });
            plyrInstances.push(player);
            player.on('playing', () => document.getElementById('breathing-circle').style.animation = 'breathe 8s infinite ease-in-out');
            player.on('pause', () => document.getElementById('breathing-circle').style.animation = 'none');
            
            if (!document.getElementById('breathe-anim-style')) {
                const style = document.createElement('style');
                style.id = 'breathe-anim-style';
                style.innerHTML = `
                    @keyframes breathe {
                        0%, 100% { transform: scale(1); opacity: 0.5; }
                        50% { transform: scale(1.5); opacity: 0.8; }
                    }
                `;
                document.head.appendChild(style);
            }
        } 
        else if (tab === 'video') {
            const config = window.VideoResourcesConfig || { sleep: [] };
            area.innerHTML = `<h4 class="text-xl font-bold mb-4 text-gray-800">Video Library</h4>` + config.sleep.map(v => `<div class="plyr-video" data-plyr-provider="${v.provider}" data-plyr-embed-id="${v.video_id}"></div>`).join('');
            document.querySelectorAll('.plyr-video').forEach(el => plyrInstances.push(new Plyr(el)));
        }
        else if (tab === 'cognitive') {
            area.innerHTML = `
                <h4 class="text-xl font-bold mb-4 text-gray-800">Cognitive Tools</h4>
                <div id="reframing-wizard">
                    <div id="rw-step-1"><textarea id="rw-input-1" class="w-full border p-2 mb-3" placeholder="Thought"></textarea><button onclick="window.app.rwNext(1)">Next</button></div>
                    <div id="rw-step-2" class="hidden"><textarea id="rw-input-2" class="w-full border p-2 mb-3" placeholder="Evidence against"></textarea><button onclick="window.app.rwPrev(2)">Back</button><button onclick="window.app.rwNext(2)">Next</button></div>
                    <div id="rw-step-3" class="hidden"><textarea id="rw-input-3" class="w-full border p-2 mb-3" placeholder="Balanced rewrite"></textarea><button onclick="window.app.rwPrev(3)">Back</button><button onclick="window.app.rwFinish()">Complete</button></div>
                </div>
            `;
        }
        else if (tab === 'articles') {
            area.innerHTML = `<h4 class="text-xl font-bold mb-4 text-gray-800">Articles</h4><div class="prose">Setting Healthy Work-Life Boundaries</div>`;
        }
        else if (tab === 'support') {
            const hConfig = state.hotlineConfig || { eap_number: 'N/A', crisis_number: '988' };
            area.innerHTML = `
                <div class="bg-red-50 p-6 rounded-lg mb-4">
                    <h5 class="font-bold">Crisis Support</h5>
                    <a href="tel:${hConfig.crisis_number}">Dial ${hConfig.crisis_number}</a>
                </div>
            `;
        }
    }

    function rwNext(step) {
        document.getElementById(`rw-step-${step}`).classList.add('hidden');
        document.getElementById(`rw-step-${step + 1}`).classList.remove('hidden');
    }
    function rwPrev(step) {
        document.getElementById(`rw-step-${step}`).classList.add('hidden');
        document.getElementById(`rw-step-${step - 1}`).classList.remove('hidden');
    }
    function rwFinish() {
        showToast("Great job reframing!", 4000);
        rwPrev(3); rwPrev(2);
    }

    function submitGratitude() {
        showToast("Gratitude entry saved.", 4000);
    }

    function openPulseModal() { openModal('pulseModal'); }
    function closePulseModal() { closeModal('pulseModal'); }
    function openSearchModal() { openModal('searchModal'); }

    function showToast(message, duration = 3000) {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = 'bg-gray-800 text-white px-4 py-3 rounded shadow-lg';
        toast.textContent = message;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), duration);
    }

    function focusCheckins() {
        document.getElementById('checkins-section').scrollIntoView({behavior: 'smooth'});
    }

    document.addEventListener('DOMContentLoaded', () => {
        initSession();
    });

    window.app = {
        switchView,
        logout,
        acceptConsent,
        declineConsent,
        openSurvey,
        closeSurvey,
        surveyBack,
        surveyNext,
        applyFilters,
        setMetric,
        exportReport,
        searchInput,
        toggleProfileMenu,
        toggleNotifications,
        markAllRead,
        submitAnonFeedback,
        closeCrisisBanner,
        openModal,
        closeModal,
        openLegal,
        openResourceLibrary,
        closeResource,
        switchResourceTab,
        rwNext,
        rwPrev,
        rwFinish,
        submitGratitude,
        openPulseModal,
        closePulseModal,
        openSearchModal,
        showToast,
        focusCheckins
    };

})();
