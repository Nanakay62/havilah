const fs = require('fs');

const jsPath = 'c:/Users/nanak/Desktop/copsoqu/public/js/hrDashboard.js';
let js = fs.readFileSync(jsPath, 'utf8');

const updatedRenderDept = `
  function renderDepartmentDropdown() {
    const dropdown = document.getElementById('hrDeptDropdown');
    const input = document.getElementById('hrDeptInput');
    const deptFilter = document.getElementById('deptFilter');
    
    // Update the main top filter if it exists
    if (deptFilter) {
      // Preserve current selection
      const currentSelection = deptFilter.value;
      deptFilter.innerHTML = '<option value="all">All departments</option>';
      state.departments.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept.name;
        opt.innerText = dept.name;
        deptFilter.appendChild(opt);
      });
      if (Array.from(deptFilter.options).some(o => o.value === currentSelection)) {
        deptFilter.value = currentSelection;
      }
    }
    
    if (!dropdown || !input) return;
    
    dropdown.innerHTML = '';
    
    state.departments.forEach(dept => {
      const item = document.createElement('div');
      item.style.padding = '8px 12px';
      item.style.cursor = 'pointer';
      item.style.borderBottom = '1px solid var(--border)';
      item.innerText = dept.name;
      item.onmousedown = () => {
          input.value = dept.name;
          dropdown.style.display = 'none';
      };
      item.onmouseover = () => item.style.backgroundColor = '#f3f4f6';
      item.onmouseout = () => item.style.backgroundColor = '#fff';
      dropdown.appendChild(item);
    });
  }
`;

function replaceFunction(sourceText, funcName, replacementText) {
  const startStr = 'function ' + funcName + '() {';
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

js = replaceFunction(js, 'renderDepartmentDropdown', updatedRenderDept);

fs.writeFileSync(jsPath, js, 'utf8');
console.log('Fixed hrDashboard.js');
