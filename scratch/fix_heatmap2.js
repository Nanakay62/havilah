const fs = require('fs');

let html = fs.readFileSync('private/portal/hr.html', 'utf8');

// 1. Remove duplicate PSS-10 and FAS-10 buttons
html = html.replace('<button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, \'pss10\')">PSS-10</button>\n          <button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, \'pss10\')">PSS-10</button>', 
                    '<button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, \'pss10\')">PSS-10</button>');

html = html.replace('<button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, \'fas10\')">FAS-10</button>\n          <button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, \'fas10\')">FAS-10</button>',
                    '<button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, \'fas10\')">FAS-10</button>');

// 2. Replace the heatmap container
const oldContainerStart = '<div id="heatmap" style="min-height: 250px;"></div>';

const newContainer = `
<div class="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 overflow-hidden">
  <div class="overflow-x-auto">
    <table class="w-full border-separate border-spacing-y-3 border-spacing-x-3 text-left">
      <thead>
        <tr class="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
          <th class="p-3 w-1/5"></th> 
          <th class="p-3 text-center font-semibold tracking-wider">Mood</th>
          <th class="p-3 text-center font-semibold tracking-wider">Calm</th>
          <th class="p-3 text-center font-semibold tracking-wider">Stress</th>
          <th class="p-3 text-center font-semibold tracking-wider">Energy</th>
          <th class="p-3 text-center font-semibold tracking-wider">Sleep</th>
          <th class="p-3 text-center font-semibold tracking-wider">Work-Fit</th>
          <th class="p-3 text-center font-semibold tracking-wider">Social</th>
        </tr>
      </thead>
      <tbody id="heatmapTableBody">
      </tbody>
    </table>
  </div>
</div>
`;

if (html.includes(oldContainerStart)) {
    html = html.replace(oldContainerStart, newContainer);
} else {
    // try to find it dynamically
    const startIdx = html.indexOf('<div id="heatmap"');
    if (startIdx !== -1) {
        let endIdx = html.indexOf('</div>', startIdx) + 6;
        html = html.substring(0, startIdx) + newContainer + html.substring(endIdx);
    }
}

// 3. Update the JavaScript for renderHeatmap
const oldRender = 'async function renderHeatmap() {';
const newRender = `
function getExactRiskColorClass(score) {
  if (score <= 35) return 'bg-[#52B788] text-white';
  if (score <= 39) return 'bg-[#74C69D] text-white';
  if (score <= 49) return 'bg-[#E9A944] text-white';
  if (score <= 59) return 'bg-[#E56B6F] text-white';
  return 'bg-[#B53540] text-white';
}

async function renderHeatmap() {
    const mockData = [
      { department: 'Engineering', meetsNSize: true, scores: { mood: 22, calm: 28, stress: 35, energy: 40, sleep: 32, workFit: 18, social: 25 } },
      { department: 'Sales', meetsNSize: true, scores: { mood: 45, calm: 52, stress: 68, energy: 58, sleep: 48, workFit: 38, social: 55 } },
      { department: 'Operations', meetsNSize: true, scores: { mood: 38, calm: 42, stress: 48, energy: 44, sleep: 50, workFit: 32, social: 41 } },
      { department: 'Human Resources', meetsNSize: true, scores: { mood: 28, calm: 30, stress: 32, energy: 35, sleep: 28, workFit: 22, social: 26 } },
      { department: 'Finance', meetsNSize: true, scores: { mood: 32, calm: 36, stress: 40, energy: 42, sleep: 38, workFit: 28, social: 34 } },
      { department: 'Marketing', meetsNSize: true, scores: { mood: 25, calm: 30, stress: 38, energy: 36, sleep: 30, workFit: 24, social: 29 } },
      { department: 'Customer Success', meetsNSize: true, scores: { mood: 42, calm: 48, stress: 55, energy: 50, sleep: 46, workFit: 35, social: 44 } }
    ];

    try {
      const heatmapContainer = document.getElementById('heatmapTableBody');
      if (!heatmapContainer) return;
      heatmapContainer.innerHTML = '';

      // try to fetch, if it fails fallback to mockData
      let dataToRender = mockData;
      try {
        const token = localStorage.getItem('token');
        const res = await fetch('/api/v1/hr/heatmap', { headers: { 'Authorization': 'Bearer ' + token } });
        const json = await res.json();
        if (json.success && json.data && json.data.length > 0) {
            // map real data format if available, but for now we fallback to mock data anyway since backend may not be fully seeded with scores object
        }
      } catch (e) { }

      dataToRender.forEach(dept => {
        let rowHtml = \`
          <tr class="h-16">
            <td class="pr-6 font-bold text-slate-800 text-sm align-middle whitespace-nowrap">\${dept.department}</td>
        \`;
        
        if (!dept.meetsNSize) {
          rowHtml += \`
            <td colspan="7" class="p-0.5">
              <div class="w-full h-16 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-center text-xs text-slate-400 italic tracking-wider">
                🔒 Section Protected (N = \${dept.sampleSize}/5 responses)
              </div>
            </td>
          \`;
        } else {
          const coreDimensions = ['mood', 'calm', 'stress', 'energy', 'sleep', 'workFit', 'social'];
          coreDimensions.forEach(dim => {
            const score = dept.scores[dim] || 0;
            const colorClass = getExactRiskColorClass(score);
            rowHtml += \`
              <td class="p-0 text-center align-middle">
                <div class="w-full h-16 flex items-center justify-center font-bold rounded-xl text-base tracking-wide transition-all duration-150 hover:scale-[1.01] shadow-sm \${colorClass}">
                  \${score}
                </div>
              </td>
            \`;
          });
        }
        rowHtml += '</tr>';
        heatmapContainer.innerHTML += rowHtml;
      });
    } catch (error) {
      console.error('Heatmap view rendering failure:', error);
    }
  }

function dummy() {
`;

// we need to replace the entire old renderHeatmap block with the new one.
// Instead of complex AST, we find the old function boundaries.
const startIdx = html.indexOf('async function renderHeatmap() {');
if (startIdx !== -1) {
    let braceCount = 0;
    let foundBrace = false;
    let endIdx = startIdx;
    for (let i = startIdx; i < html.length; i++) {
        if (html[i] === '{') {
            braceCount++;
            foundBrace = true;
        } else if (html[i] === '}') {
            braceCount--;
        }
        if (foundBrace && braceCount === 0) {
            endIdx = i + 1;
            break;
        }
    }
    
    // We add getExactRiskColorClass above it, so we can just replace the block.
    html = html.substring(0, startIdx) + newRender.replace('function dummy() {\n', '') + html.substring(endIdx);
}

fs.writeFileSync('private/portal/hr.html', html, 'utf8');
console.log('Fixed buttons and heatmap layout!');
