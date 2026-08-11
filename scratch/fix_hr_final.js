const fs = require('fs');

const hrHtmlPath = 'c:/Users/nanak/Desktop/copsoqu/private/portal/hr.html';
let html = fs.readFileSync(hrHtmlPath, 'utf8');

// 1. Add COPSOQ and others if missing
if (!html.includes('data-metric="copsoq"')) {
  html = html.replace(
    '<button class="filter-pill" data-metric="gad7" onclick="App.setMetric(this, \'gad7\')">GAD-7</button>',
    '<button class="filter-pill" data-metric="gad7" onclick="App.setMetric(this, \'gad7\')">GAD-7</button>\n    <button class="filter-pill" data-metric="pss10" onclick="App.setMetric(this, \'pss10\')">PSS-10</button>\n    <button class="filter-pill" data-metric="fas10" onclick="App.setMetric(this, \'fas10\')">FAS-10</button>\n    <button class="filter-pill" data-metric="copsoq" onclick="App.setMetric(this, \'copsoq\')">COPSOQ-II</button>'
  );
}

// 2. Add Access Management Hub
if (!html.includes('Access Management Hub')) {
  const hubHtml = `
  <!-- Access Management Hub -->
  <div class="section-bar" style="margin-top: 48px;">
    <div>
      <h2 style="font-size: 1.25rem; font-weight: 600; letter-spacing: -0.01em;">Access Management Hub</h2>
      <p style="color: var(--text-2); font-size: 0.875rem;">Generate secure activation codes to onboard new employees or departments.</p>
    </div>
  </div>
  
  <div class="bottom-grid" style="grid-template-columns: 1fr 1.5fr;">
    <div class="chart-card">
      <div class="chart-head">
        <div class="chart-title">Generate Activation Code</div>
        <div class="chart-subtitle">Codes are tied to a specific department and expire in 15 days.</div>
      </div>
      <form id="hrGenerateInviteForm" style="display: flex; flex-direction: column; gap: 16px;">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Target Department</label>
          <div style="position: relative;">
            <input type="text" id="hrDeptInput" class="form-input" placeholder="Type to search or create new..." autocomplete="off">
            <div id="hrDeptDropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: var(--bg-elev); border: 1px solid var(--border); border-radius: var(--radius); max-height: 200px; overflow-y: auto; z-index: 100; display: none; box-shadow: var(--shadow-md);"></div>
          </div>
          <div class="form-hint">Selecting a new name will provision a new department.</div>
        </div>
        <button type="submit" class="btn btn-primary" id="hrGenerateBtn" style="width: 100%; justify-content: center;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
          Generate Code
        </button>
      </form>
      <div id="hrInviteResult" style="margin-top: 20px; padding: 16px; background: var(--accent-soft); border: 1px solid rgba(0, 183, 195, 0.2); border-radius: 12px; display: none;">
        <div style="font-size: 0.75rem; color: var(--accent-deep); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 4px;">Success! Activation Code</div>
        <div id="hrResultCode" style="font-size: 1.5rem; font-weight: 700; color: var(--text-1); letter-spacing: 0.1em; font-family: monospace; margin-bottom: 8px;"></div>
        <div style="font-size: 0.8125rem; color: var(--text-2); margin-bottom: 12px;">Provisioned for <strong id="hrResultDept" style="color: var(--text-1);"></strong></div>
        <button class="btn btn-ghost btn-sm" onclick="window.copyHrInviteLink()" style="width: 100%; justify-content: center;">Copy Registration Link</button>
      </div>
    </div>
    
    <div class="chart-card">
      <div class="chart-head">
        <div class="chart-title">Active Codes & Provisioning History</div>
      </div>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; text-align: left;">
          <thead>
            <tr style="border-bottom: 1px solid var(--border-strong); background: var(--bg-base);">
              <th style="padding: 10px 16px; font-size: 0.75rem; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Code</th>
              <th style="padding: 10px 16px; font-size: 0.75rem; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Department</th>
              <th style="padding: 10px 16px; font-size: 0.75rem; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Status</th>
              <th style="padding: 10px 16px; font-size: 0.75rem; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Expires</th>
              <th style="padding: 10px 16px; font-size: 0.75rem; font-weight: 600; color: var(--text-3); text-transform: uppercase;">Action</th>
            </tr>
          </thead>
          <tbody id="hrInvitesTableBody">
            <tr><td colspan="5" style="padding: 20px; text-align: center; color: var(--text-3); font-size: 0.875rem;">Loading history...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
  `;
  
  // Find </main> and insert before it
  const mainEndIdx = html.indexOf('</main>');
  if (mainEndIdx !== -1) {
    html = html.substring(0, mainEndIdx) + hubHtml + '\n' + html.substring(mainEndIdx);
  }
}

fs.writeFileSync(hrHtmlPath, html, 'utf8');
console.log('Fixed hr.html');
