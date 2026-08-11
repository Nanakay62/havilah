const fs = require('fs');
let html = fs.readFileSync('private/portal/hr.html', 'utf8');
const startIdx = html.indexOf('  function generateSeverityData(datasetIdx, days) {');
const endIdx = html.indexOf('  async function initSeverityChart() {');
const replacement = `  function generateSeverityData(datasetIdx, days) {
    const base = [
      [62, 64, 63, 65, 66, 67, 68, 70],
      [24, 22, 24, 22, 21, 20, 19, 18],
      [10, 10, 9, 9, 9, 9, 9, 8],
      [4, 4, 4, 4, 4, 4, 4, 4]
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
    const base = [74, 66, 48, 55, 62];
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
      card.innerHTML = \`<div class="kpi-top"><span class="kpi-label">\${k.label}</span><div class="kpi-icon \${k.icon}">\${k.svg}</div></div><div class="kpi-value">\${k.value}</div><span class="kpi-trend \${k.dir}">\${trendIcon}\${k.trend}</span>\`;
      grid.appendChild(card);
    });
  }

`;
html = html.substring(0, startIdx) + replacement + html.substring(endIdx);
fs.writeFileSync('private/portal/hr.html', html);
console.log('Fixed hr.html');
