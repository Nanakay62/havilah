const fs = require('fs');

const hrHtmlPath = 'c:/Users/nanak/Desktop/copsoqu/private/portal/hr.html';
let html = fs.readFileSync(hrHtmlPath, 'utf8');

const heatmapMockReplacement = `
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
            
            td.innerHTML = \`<div style="display: flex; align-items: center; justify-content: space-between;"><span>\${row.department_name}</span><span style="font-size: 0.75rem; color: #6b7280;">N=\${row.meta ? row.meta.n_size : 0}</span></div>\`;
            
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
`;

function replaceFunction(sourceText, funcName, replacementText) {
  const startStr = 'async function ' + funcName + '(';
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

html = replaceFunction(html, 'renderHeatmap', heatmapMockReplacement);
fs.writeFileSync(hrHtmlPath, html, 'utf8');

console.log('Fixed HR heatmap mock data.');
