const fs = require('fs');
const path = require('path');

const hrHtmlPath = 'c:/Users/nanak/Desktop/copsoqu/private/portal/hr.html';
let html = fs.readFileSync(hrHtmlPath, 'utf8');

// 1. Insert the Access Management Hub HTML
const accessManagementHTML = `
  <!-- ACCESS MANAGEMENT -->
  <div class="charts-grid" style="margin-top: 24px; grid-template-columns: 1fr;">
    <div class="chart-card" style="padding: 24px;">
      <div class="chart-head" style="margin-bottom: 24px;">
        <div>
          <div class="chart-title" style="font-size: 1.25rem;">Access Management Hub</div>
          <div class="chart-subtitle">Generate secure departmental activation codes for employees</div>
        </div>
      </div>
      
      <div style="display: flex; gap: 24px; flex-wrap: wrap;">
        <!-- Code Generation Form -->
        <div style="flex: 1; min-width: 300px; background: var(--bg-body); padding: 20px; border-radius: 12px; border: 1px solid var(--border);">
          <h4 style="font-size: 1rem; font-weight: 600; color: var(--text-1); margin: 0 0 16px 0;">Provision New Code</h4>
          <form id="hrGenerateInviteForm" onsubmit="event.preventDefault(); window.generateHrInvite();">
            <div class="form-group">
              <label class="form-label">Target Department</label>
              <div style="position: relative;">
                <input type="text" id="hrDeptInput" class="form-input" placeholder="e.g. Engineering, Sales, Product..." required autocomplete="off" />
                <div id="hrDeptDropdown" style="display:none; position:absolute; top:100%; left:0; right:0; background:#fff; border:1px solid var(--border); border-radius:6px; box-shadow:0 4px 6px rgba(0,0,0,0.1); z-index:10; max-height:200px; overflow-y:auto;"></div>
              </div>
              <div class="form-hint" style="margin-top: 6px;">Select an existing department or type a new one to provision it dynamically.</div>
            </div>
            <button type="submit" class="btn btn-primary" id="hrGenerateBtn" style="width: 100%; justify-content: center;">
              Generate Activation Code
            </button>
          </form>
          <div id="hrInviteResult" style="display: none; margin-top: 20px; padding: 16px; background: rgba(0, 183, 195, 0.1); border: 1px dashed #00B7C3; border-radius: 8px; text-align: center;">
            <p style="margin: 0 0 8px 0; font-size: 0.875rem; color: var(--text-2);">Activation Code for <strong id="hrResultDept" style="color: var(--text-1);"></strong></p>
            <div style="font-size: 1.5rem; font-weight: 700; color: var(--text-1); letter-spacing: 2px; margin-bottom: 12px;" id="hrResultCode"></div>
            <button type="button" class="btn btn-ghost btn-sm" onclick="window.copyHrInviteLink()" id="hrCopyBtn" style="margin: 0 auto;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 16px; height: 16px; margin-right: 6px;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              Copy Registration Link
            </button>
          </div>
        </div>

        <!-- Active Invitations Table -->
        <div style="flex: 2; min-width: 400px; background: #fff; border: 1px solid var(--border); border-radius: 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead style="background: var(--bg-body); font-size: 0.8125rem; text-transform: uppercase; color: var(--text-2); letter-spacing: 0.05em;">
              <tr>
                <th style="padding: 12px 16px; border-bottom: 1px solid var(--border);">Activation Code</th>
                <th style="padding: 12px 16px; border-bottom: 1px solid var(--border);">Department</th>
                <th style="padding: 12px 16px; border-bottom: 1px solid var(--border);">Status</th>
                <th style="padding: 12px 16px; border-bottom: 1px solid var(--border);">Expires</th>
                <th style="padding: 12px 16px; border-bottom: 1px solid var(--border);">Action</th>
              </tr>
            </thead>
            <tbody id="hrInvitesTableBody" style="font-size: 0.9rem;">
              <!-- Invites populated here -->
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
`;

if (!html.includes('Access Management Hub')) {
    html = html.replace('<div id="alertsList"></div>\n    </div>\n  </div>', '<div id="alertsList"></div>\n    </div>\n  </div>\n' + accessManagementHTML);
}

// Ensure hrDashboard.js is included
if (!html.includes('<script src="/js/hrDashboard.js"></script>')) {
    html = html.replace('</body>', '  <script src="/js/hrDashboard.js"></script>\n</body>');
}

// Modify initRadarChart to fetch from API in hr.html directly
const initRadarChartReplacement = `
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
`;

// Modify initSeverityChart to fetch from API
const initSeverityChartReplacement = `
  async function initSeverityChart() {
    const ctx = $('#severityChart');
    if (!ctx) return;
    if (state.charts.severity) { state.charts.severity.destroy(); }
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/v1/hr/severity-trends', { headers: { 'Authorization': 'Bearer ' + token } });
      const { success, labels, datasets } = await res.json();
      
      let chartLabels = success && labels && labels.length ? labels : ['W1','W2','W3','W4','W5','W6','W7','W8'];
      let healthy = success && datasets ? datasets.healthy : [65, 62, 60, 58, 55, 52, 50, 48];
      let mild = success && datasets ? datasets.mild : [20, 22, 23, 25, 27, 28, 29, 30];
      let moderate = success && datasets ? datasets.moderate : [10, 11, 12, 12, 13, 14, 15, 16];
      let severe = success && datasets ? datasets.severe : [5, 5, 5, 5, 5, 6, 6, 6];
      
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
`;

// Modify renderAlerts to fetch from API
const renderAlertsReplacement = `
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
`;

// Helper string replace for functions
function replaceFunction(sourceText, funcName, replacementText) {
  const startStr = 'function ' + funcName + '(';
  const startIdx = sourceText.indexOf(startStr);
  if (startIdx === -1) return sourceText; // or it might be async already
  
  let endIdx = startIdx;
  let braceCount = 0;
  let foundBrace = false;
  for (let i = startIdx; i < sourceText.length; i++) {
    if (sourceText[i] === '{') {
      braceCount++;
      foundBrace = true;
    } else if (sourceText[i] === '}') {
      braceCount--;
    }
    if (foundBrace && braceCount === 0) {
      endIdx = i + 1;
      break;
    }
  }
  
  return sourceText.substring(0, startIdx) + replacementText.trim() + sourceText.substring(endIdx);
}

html = replaceFunction(html, 'initRadarChart', initRadarChartReplacement);
html = replaceFunction(html, 'initSeverityChart', initSeverityChartReplacement);
html = replaceFunction(html, 'renderAlerts', renderAlertsReplacement);

fs.writeFileSync(hrHtmlPath, html, 'utf8');
console.log('hr.html successfully patched.');
