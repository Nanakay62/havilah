const fs = require('fs');

const hrHtmlPath = 'c:/Users/nanak/Desktop/copsoqu/private/portal/hr.html';
let html = fs.readFileSync(hrHtmlPath, 'utf8');

// 1. Fix duplicates in hr.html
const filterPillsBlock = `    <button class="filter-pill active" data-metric="phq9" onclick="App.setMetric(this, 'phq9')">PHQ-9</button>
    <button class="filter-pill" data-metric="gad7" onclick="App.setMetric(this, 'gad7')">GAD-7</button>
    <button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, 'pss10')">PSS-10</button>
    <button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, 'fas10')">FAS-10</button>
    <button class="filter-pill" data-metric="copsoq" onclick="App.setMetric(this, 'copsoq')">COPSOQ-II</button>
    <button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, 'pss10')">PSS-10</button>
    <button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, 'fas10')">FAS-10</button>`;

const correctedFilterPillsBlock = `    <button class="filter-pill active" data-metric="phq9" onclick="App.setMetric(this, 'phq9')">PHQ-9</button>
    <button class="filter-pill" data-metric="gad7" onclick="App.setMetric(this, 'gad7')">GAD-7</button>
    <button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, 'pss10')">PSS-10</button>
    <button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, 'fas10')">FAS-10</button>
    <button class="filter-pill" data-metric="copsoq" onclick="App.setMetric(this, 'copsoq')">COPSOQ-II</button>`;

html = html.replace(filterPillsBlock, correctedFilterPillsBlock);

// 2. Fix initSeverityChart to use mock data if DB datasets are empty
const severityChartReplacement = `
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
`;

function replaceFunction(sourceText, funcName, replacementText) {
  const startStr = 'function ' + funcName + '(';
  const startIdx = sourceText.indexOf(startStr);
  if (startIdx === -1) return sourceText; 
  
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

html = replaceFunction(html, 'initSeverityChart', severityChartReplacement);
fs.writeFileSync(hrHtmlPath, html, 'utf8');

// 3. Fix hrDashboard.js mock departments
const jsPath = 'c:/Users/nanak/Desktop/copsoqu/public/js/hrDashboard.js';
let js = fs.readFileSync(jsPath, 'utf8');

const fetchDepartmentsReplacement = `
  async function fetchDepartments() {
    try {
      const res = await apiFetch('/api/v1/hr/departments');
      if (res.departments && res.departments.length > 0) {
        state.departments = res.departments;
      } else {
        // Mock data if empty for demo purposes
        state.departments = [
          { name: 'Engineering' },
          { name: 'Product' },
          { name: 'Sales' },
          { name: 'Human Resources' },
          { name: 'Marketing' }
        ];
      }
      renderDepartmentDropdown();
    } catch (e) {
      console.error('Departments load error', e);
    }
  }
`;

js = replaceFunction(js, 'fetchDepartments', fetchDepartmentsReplacement);
fs.writeFileSync(jsPath, js, 'utf8');

console.log('Fixed HR UI issues.');
