const fs = require('fs');
const path = require('path');

const modalHtml = `
<!-- Glassmorphic Privacy & Anonymity Modal -->
<div id="privacy-modal" class="fixed inset-0 bg-slate-950/80 backdrop-blur-md hidden items-center justify-center z-50 p-4" style="display:none; position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(2,6,23,0.85); backdrop-filter:blur(8px); justify-content:center; align-items:center; z-index:9999;">
  <div style="background:rgba(15,23,42,0.95); border:1px solid rgba(45,212,191,0.3); border-radius:16px; padding:24px; max-width:500px; width:100%; color:#e2e8f0; box-shadow:0 25px 50px -12px rgba(0,0,0,0.5);">
    <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #1e293b; padding-bottom:12px; margin-bottom:16px;">
      <h3 style="color:#2dd4bf; margin:0; font-size:1.25rem; font-weight:700;">🔒 Data Retention & Anonymity Guarantee</h3>
      <button onclick="document.getElementById('privacy-modal').style.display='none'" style="background:none; border:none; color:#94a3b8; font-size:1.5rem; cursor:pointer;">&times;</button>
    </div>
    <div style="font-size:0.875rem; line-height:1.6;">
      <p style="font-weight:600; color:#f8fafc; margin-top:8px;">🔒 Hardcoded Anonymity Threshold (N ≥ 5)</p>
      <p style="margin-bottom:12px;">Department risk scores are displayed ONLY when at least 5 responses (N ≥ 5) have been submitted. Smaller team metrics are automatically suppressed or rolled up.</p>
      <p style="font-weight:600; color:#f8fafc; margin-top:8px;">🛡️ Zero Raw Data Exposure to HR</p>
      <p style="margin-bottom:12px;">HR Administrators view aggregate statistical trends only. Individual PHQ-9, GAD-7, and COPSOQ III responses are cryptographically detached from employee accounts and never accessible.</p>
      <p style="font-weight:600; color:#f8fafc; margin-top:8px;">⏳ Data Retention Policy</p>
      <p style="margin-bottom:0;">Aggregated logs are retained for ISO 45003 compliance audit reporting according to company policies and automatically purged thereafter.</p>
    </div>
    <div style="margin-top:20px; display:flex; justify-content:flex-end;">
      <button onclick="document.getElementById('privacy-modal').style.display='none'" style="background:rgba(45,212,191,0.2); border:1px solid rgba(45,212,191,0.4); color:#5eead4; font-weight:600; padding:8px 16px; border-radius:8px; cursor:pointer;">Got it</button>
    </div>
  </div>
</div>
`;

['private/portal/hr.html', 'private/app/superadmin.html'].forEach(filePath => {
  const fullPath = path.join(__dirname, '..', filePath);
  if (fs.existsSync(fullPath)) {
    let content = fs.readFileSync(fullPath, 'utf8');
    if (!content.includes('id="privacy-modal"')) {
      content = content.replace('</body>', modalHtml + '\n</body>');
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log('Successfully injected glassmorphic privacy modal into', filePath);
    }
  }
});
