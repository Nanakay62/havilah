const fs = require('fs');

const hrHtmlPath = 'c:/Users/nanak/Desktop/copsoqu/private/portal/hr.html';
let html = fs.readFileSync(hrHtmlPath, 'utf8');

// The new visually stunning heatmap logic
const heatmapReplacement = `
  async function renderHeatmap() {
    const container = $('#heatmap');
    if (!container) return;
    
    // Create the exact visual style from the user's mockup
    const mockData = [
      { name: 'Engineering', scores: [22, 28, 35, 40, 32, 18, 25] },
      { name: 'Sales', scores: [45, 52, 68, 58, 48, 38, 55] },
      { name: 'Operations', scores: [38, 42, 48, 44, 50, 32, 41] },
      { name: 'Human Resources', scores: [28, 30, 32, 35, 28, 22, 26] },
      { name: 'Finance', scores: [32, 36, 40, 42, 38, 28, 34] },
      { name: 'Marketing', scores: [25, 30, 38, 36, 30, 24, 29] },
      { name: 'Customer Success', scores: [42, 48, 55, 50, 46, 35, 44] }
    ];
    
    const dimensions = ['MOOD', 'CALM', 'STRESS', 'ENERGY', 'SLEEP', 'WORK-FIT', 'SOCIAL'];
    
    let htmlContent = '<div style="display: flex; flex-direction: column; gap: 8px; width: 100%; overflow-x: auto;">';
    
    // Header row
    htmlContent += '<div style="display: flex; gap: 6px; padding-left: 140px; margin-bottom: 8px;">';
    dimensions.forEach(dim => {
      htmlContent += \`<div style="flex: 1; text-align: center; font-size: 0.75rem; font-weight: 700; color: #8A8D93; letter-spacing: 0.05em;">\${dim}</div>\`;
    });
    htmlContent += '</div>';
    
    // Data rows
    mockData.forEach(row => {
      htmlContent += '<div style="display: flex; align-items: center; gap: 6px;">';
      // Department name
      htmlContent += \`<div style="width: 140px; min-width: 140px; font-size: 0.875rem; font-weight: 600; color: var(--text-1); padding-right: 12px;">\${row.name}</div>\`;
      
      // Blocks
      row.scores.forEach(score => {
        let bg = '#52b788'; // green
        let color = '#ffffff';
        if (score >= 50) {
          bg = '#d9534f'; // red
        } else if (score >= 40) {
          bg = '#f0ad4e'; // orange/yellow
        }
        
        htmlContent += \`<div style="flex: 1; min-width: 60px; height: 64px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1rem; color: \${color}; background-color: \${bg}; box-shadow: 0 1px 3px rgba(0,0,0,0.1); transition: transform 0.2s; cursor: pointer;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">\${score}</div>\`;
      });
      htmlContent += '</div>';
    });
    
    htmlContent += '</div>';
    container.innerHTML = htmlContent;
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

html = replaceFunction(html, 'renderHeatmap', heatmapReplacement);

fs.writeFileSync(hrHtmlPath, html, 'utf8');
console.log('Restored block-style heatmap');
