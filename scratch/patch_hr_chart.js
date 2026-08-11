const fs = require('fs');
const path = require('path');

// 1. Update private/portal/hr.html
const hrPath = path.join(__dirname, '../private/portal/hr.html');
let hrContent = fs.readFileSync(hrPath, 'utf8');

// Replace generateSeverityData
const oldGenFuncStart = '  function generateSeverityData(datasetIdx, days) {';
const oldGenFuncEnd = '    });\n  }';

const newGenFunc = `  function generateSeverityData(datasetIdx, days) {
    const cacheKey = \`\${state.hrFilters.metric}_\${state.hrFilters.department}_\${days}\`;
    if (!state._severityCache || state._severityCacheKey !== cacheKey) {
      const base = [
        [62, 64, 63, 65, 66, 67, 68, 70], // healthy
        [24, 22, 24, 22, 21, 20, 19, 18], // mild
        [10, 10, 9, 9, 9, 9, 9, 8],       // moderate
        [4, 4, 4, 4, 4, 4, 4, 4]           // severe
      ];
      const factor = parseInt(days || 30) / 30;
      const matrix = [[], [], [], []];

      for (let w = 0; w < 8; w++) {
        let h = base[0][w] + (Math.random() - 0.5) * 4 * factor;
        let mi = base[1][w] + (Math.random() - 0.5) * 3 * factor;
        let mo = base[2][w] + (Math.random() - 0.5) * 2 * factor;
        let s = base[3][w] + (Math.random() - 0.5) * 1 * factor;

        if (state.hrFilters.metric === 'gad7') { h -= 2; mi += 1; mo += 1; }
        if (state.hrFilters.metric === 'pss10') { mo += 2; s += 1; h -= 3; }
        if (state.hrFilters.metric === 'fas10') { mi += 2; h -= 2; }
        if (state.hrFilters.department !== 'all') { h += (Math.random() - 0.5) * 4; }

        h = Math.max(5, h);
        mi = Math.max(3, mi);
        mo = Math.max(2, mo);
        s = Math.max(1, s);

        const total = h + mi + mo + s;
        const hPct = Math.round((h / total) * 100);
        const miPct = Math.round((mi / total) * 100);
        const moPct = Math.round((mo / total) * 100);
        const sPct = Math.max(0, 100 - (hPct + miPct + moPct));

        matrix[0].push(hPct);
        matrix[1].push(miPct);
        matrix[2].push(moPct);
        matrix[3].push(sPct);
      }
      state._severityCache = matrix;
      state._severityCacheKey = cacheKey;
    }
    return state._severityCache[datasetIdx];
  }`;

if (hrContent.includes(oldGenFuncStart)) {
  const startIdx = hrContent.indexOf(oldGenFuncStart);
  const endIdx = hrContent.indexOf('  function generateRadarData', startIdx);
  if (startIdx !== -1 && endIdx !== -1) {
    hrContent = hrContent.substring(0, startIdx) + newGenFunc + '\n\n' + hrContent.substring(endIdx);
  }
}

// Update initSeverityChart datasets & scales
hrContent = hrContent.replace(
  `{ label: 'Healthy', data: generateSeverityData(0, 30), backgroundColor: '#4FB286', borderRadius: 4, borderSkipped: false, stack: 's' },
          { label: 'Mild', data: generateSeverityData(1, 30), backgroundColor: '#E8A33D', borderRadius: 4, borderSkipped: false, stack: 's' },
          { label: 'Moderate', data: generateSeverityData(2, 30), backgroundColor: '#E5646E', borderRadius: 4, borderSkipped: false, stack: 's' },
          { label: 'Severe', data: generateSeverityData(3, 30), backgroundColor: '#B23A48', borderRadius: 4, borderSkipped: false, stack: 's' }`,
  `{ label: 'Healthy', data: generateSeverityData(0, 30), backgroundColor: '#4FB286', borderRadius: 0, borderSkipped: false, stack: 's' },
          { label: 'Mild', data: generateSeverityData(1, 30), backgroundColor: '#E8A33D', borderRadius: 0, borderSkipped: false, stack: 's' },
          { label: 'Moderate', data: generateSeverityData(2, 30), backgroundColor: '#E5646E', borderRadius: 0, borderSkipped: false, stack: 's' },
          { label: 'Severe', data: generateSeverityData(3, 30), backgroundColor: '#B23A48', borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, stack: 's' }`
);

hrContent = hrContent.replace(
  `y: { stacked: true, max: 100, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { color: '#8A8D94', font: { family: 'Segoe UI', size: 11 }, callback: (v) => v + '%' } },`,
  `y: { stacked: true, min: 0, max: 100, grid: { color: 'rgba(0,0,0,0.04)', drawBorder: false }, ticks: { color: '#8A8D94', font: { family: 'Segoe UI', size: 11 }, callback: (v) => v + '%' } },`
);

// In applyFilters and setMetric, reset _severityCacheKey
hrContent = hrContent.replace(
  `if (state.charts.severity) {\n        state.charts.severity.data.datasets.forEach((ds, i) => {\n         ds.data = generateSeverityData(i, days);\n       });`,
  `state._severityCacheKey = null;\n    if (state.charts.severity) {\n        state.charts.severity.data.datasets.forEach((ds, i) => {\n         ds.data = generateSeverityData(i, days);\n       });`
);

hrContent = hrContent.replace(
  `if (state.charts.severity) {\n      state.charts.severity.data.datasets.forEach((ds, i) => {\n        ds.data = generateSeverityData(i, state.hrFilters.time);\n      });`,
  `state._severityCacheKey = null;\n    if (state.charts.severity) {\n      state.charts.severity.data.datasets.forEach((ds, i) => {\n        ds.data = generateSeverityData(i, state.hrFilters.time);\n      });`
);

fs.writeFileSync(hrPath, hrContent, 'utf8');
console.log('Successfully updated hr.html severity chart normalization, scale options, and borderRadius!');

// 2. Update server/routes/hrAdmin.js backend severity-trends endpoint
const hrAdminPath = path.join(__dirname, '../server/routes/hrAdmin.js');
let hrAdminContent = fs.readFileSync(hrAdminPath, 'utf8');

hrAdminContent = hrAdminContent.replace(
  `    labels.forEach(w => {\n       datasets.healthy.push(Math.round((weeks[w].healthy / weeks[w].total) * 100));\n       datasets.mild.push(Math.round((weeks[w].mild / weeks[w].total) * 100));\n       datasets.moderate.push(Math.round((weeks[w].moderate / weeks[w].total) * 100));\n       datasets.severe.push(Math.round((weeks[w].severe / weeks[w].total) * 100));\n    });`,
  `    labels.forEach(w => {\n       const tot = weeks[w].total || 1;\n       const h = Math.round((weeks[w].healthy / tot) * 100);\n       const mi = Math.round((weeks[w].mild / tot) * 100);\n       const mo = Math.round((weeks[w].moderate / tot) * 100);\n       const s = Math.max(0, 100 - (h + mi + mo));\n       datasets.healthy.push(h);\n       datasets.mild.push(mi);\n       datasets.moderate.push(mo);\n       datasets.severe.push(s);\n    });`
);

fs.writeFileSync(hrAdminPath, hrAdminContent, 'utf8');
console.log('Successfully updated hrAdmin.js severity-trends normalization!');
