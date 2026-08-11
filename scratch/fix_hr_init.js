const fs = require('fs');

let html = fs.readFileSync('private/portal/hr.html', 'utf8');

// 1. Rewrite App.init to correctly initialize everything for the HR dashboard
const newInit = `
  function init() {
    console.log('App.init() started!');
    // Set greeting
    const _eg = document.getElementById('empGreeting'); 
    if (_eg) { _eg.textContent = \`\${greeting()}, \${state.user.name.split(' ')[0]}.\`; }
    
    updateNotifBadge();
    
    // Header buttons
    const searchBtn = $('#searchBtn'); if (searchBtn) searchBtn.addEventListener('click', openCmdPalette);
    const notifBtn = $('#notifBtn'); if (notifBtn) notifBtn.addEventListener('click', openNotifications);
    const profileBtn = $('#profileBtn'); if (profileBtn) profileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown(); });
    
    // Click outside dropdown
    document.addEventListener('click', (e) => {
      const dd = $('#profileDropdown');
      const pb = $('#profileBtn');
      if (dd && pb && !dd.contains(e.target) && !pb.contains(e.target)) {
        closeAllDropdowns();
      }
    });
    
    // Command palette
    const cb = $('#cmdBackdrop'); if (cb) cb.addEventListener('click', closeCmdPalette);
    const ci = $('#cmdInput'); if (ci) ci.addEventListener('input', (e) => {
      state.cmdSelectedIndex = 0;
      renderCmdResults(e.target.value);
    });
    
    // Panels
    const nb = $('#notifBackdrop'); if (nb) nb.addEventListener('click', closeNotifications);
    const rb = $('#resBackdrop'); if (rb) rb.addEventListener('click', closeResources);
    
    // Modal backdrops
    const sb = $('#surveyBackdrop'); if (sb) sb.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSurvey(); });
    const gb = $('#genericBackdrop'); if (gb) gb.addEventListener('click', (e) => { if (e.target === e.currentTarget) closeGeneric(); });
    
    // Keyboard
    document.addEventListener('keydown', handleKey);
    
    // HR Dashboard Explicit Render Sequence
    console.log('Rendering HR components...');
    renderKPIs();
    renderDeptList();
    renderAlerts();
    
    // Visualizations
    setTimeout(() => { 
        console.log('Initializing charts...');
        initSeverityChart(); 
        initRadarChart(); 
        renderHeatmap();
    }, 200);
  }
`;

const startIdx = html.indexOf('function init() {');
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
    
    html = html.substring(0, startIdx) + newInit.trim() + html.substring(endIdx);
}

fs.writeFileSync('private/portal/hr.html', html, 'utf8');
console.log('Updated init() logic successfully!');
