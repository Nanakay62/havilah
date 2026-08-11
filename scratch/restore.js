const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

const replacement = `    <div class="footer-compliance">
      <span class="compliance-badge">SOC 2</span>
      <span class="compliance-badge">ISO 45003</span>
      <span class="compliance-badge">HIPAA</span>
    </div>
  </div>
</footer>

<!-- ============ COMMAND PALETTE ============ -->
<div class="modal-backdrop" id="cmdBackdrop" onclick="App.closeSearch()"></div>
<div class="cmd-palette" id="cmdPalette" role="dialog" aria-label="Search" aria-modal="true">
  <div class="cmd-input-wrap">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
    <input type="text" class="cmd-input" id="cmdInput" placeholder="Search surveys, views, resources, actions..." autocomplete="off" />
    <span class="cmd-kbd">ESC</span>
  </div>
  <div class="cmd-results" id="cmdResults"></div>
  <div class="cmd-foot">
    <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
    <span><kbd>↵</kbd> select</span>
    <span><kbd>esc</kbd> close</span>
  </div>
</div>

<!-- ============ NOTIFICATIONS PANEL ============ -->`;

html = html.replace(/<aside class="panel" id="notifPanel"/, replacement + '\n<aside class="panel" id="notifPanel"');

fs.writeFileSync('private/app/dashboard.html', html);
console.log('Restored');
