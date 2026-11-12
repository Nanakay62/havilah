const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../public/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. CSS Replacement
const cssStartMarker = '    .privacy-layout-grid {\n      display: grid;';
const cssEndMarker = '    /* Pricing Section (Background: --bg) */';

const newCss = `    .privacy-layout-grid {
      max-width: 760px;
      margin: 0 auto;
    }

    .privacy-content-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: var(--space-6);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .privacy-point {
      display: flex;
      align-items: flex-start;
      gap: var(--space-3);
    }

    .privacy-point-icon {
      width: 20px;
      height: 20px;
      color: var(--brand);
      flex-shrink: 0;
      margin-top: 2px;
    }

    .privacy-point-text {
      font-size: 16px;
      color: var(--text);
      line-height: 1.55;
    }

    .privacy-point-text strong {
      display: block;
      color: var(--text);
      font-weight: var(--weight-semibold);
      margin-bottom: 2px;
    }

`;

const cssStartIndex = html.indexOf(cssStartMarker);
const cssEndIndex = html.indexOf(cssEndMarker);

if (cssStartIndex === -1 || cssEndIndex === -1) {
  throw new Error(`CSS markers not found: startIndex=${cssStartIndex}, endIndex=${cssEndIndex}`);
}

html = html.slice(0, cssStartIndex) + newCss + html.slice(cssEndIndex);

// Remove .breathing-circle-shell from prefers-reduced-motion
html = html.replace(
  `      .breathing-circle-shell {
        animation: none !important;
        transform: scale(1.0) !important;
      }\n`,
  ''
);

// 2. HTML Section Replacement
const sectionStartMarker = '    <!-- Privacy and Data Protection Section (#privacy';
const sectionEndMarker = '    <!-- Pricing Section (#pricing';

const newSection = `    <!-- Privacy and Data Protection Section (#privacy - Background: --brand-subtle #F0FDFA) -->
    <section class="privacy-section-wrapper" id="privacy" aria-labelledby="privacy-heading">
      <div class="page-container">
        <div class="section-header reveal-on-scroll">
          <h2 id="privacy-heading" class="section-title">Privacy and data protection</h2>
          <p class="section-subtitle">Built around employee confidentiality and clear role boundaries.</p>
        </div>

        <div class="privacy-layout-grid reveal-on-scroll">
          <div class="privacy-content-card">
            <div class="privacy-point">
              <svg class="privacy-point-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <div class="privacy-point-text">
                <strong>Designed with the Ghana Data Protection Act, 2012 (Act 843) in mind.</strong>
                Built with the principles of the Act in mind: data minimisation, purpose limitation and security.
              </div>
            </div>

            <div class="privacy-point">
              <svg class="privacy-point-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <div class="privacy-point-text">
                <strong>Anonymous by design: HR sees results only for groups of 5 or more.</strong>
                Individual check-in responses are never visible to HR, preventing identification in small teams.
              </div>
            </div>

            <div class="privacy-point">
              <svg class="privacy-point-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <polyline points="20 6 9 17 4 12"></polyline>
              </svg>
              <div class="privacy-point-text">
                <strong>Confidential clinical partition.</strong>
                Medical assessor consultations are confidential and not shared with HR or the employer.
              </div>
            </div>

            <div style="padding-top: var(--space-2); text-align: left;">
              <button type="button" class="btn btn-secondary" onclick="App.openPrivacyModal()">Read our Privacy Policy</button>
            </div>
          </div>
        </div>
      </div>
    </section>

`;

const secStartIndex = html.indexOf(sectionStartMarker);
const secEndIndex = html.indexOf(sectionEndMarker);

if (secStartIndex === -1 || secEndIndex === -1) {
  throw new Error(`Section markers not found: secStartIndex=${secStartIndex}, secEndIndex=${secEndIndex}`);
}

html = html.slice(0, secStartIndex) + newSection + html.slice(secEndIndex);

// 3. Update #privacyModal wording
html = html.replace(
  '<h4 style="color: var(--text); font-size: var(--text-base); margin-bottom: var(--space-2);">1. Statutory Alignment</h4>\n        <p style="margin-bottom: var(--space-3);">\n          Havilah is designed with the Ghana Data Protection Act, 2012 (Act 843) in mind. We operate under strict principles of lawfulness, data minimization, purpose specification, and security safeguards.\n        </p>',
  '<h4 style="color: var(--text); font-size: var(--text-base); margin-bottom: var(--space-2);">1. Data Protection Principles</h4>\n        <p style="margin-bottom: var(--space-3);">\n          Havilah is designed with the Ghana Data Protection Act, 2012 (Act 843) in mind. Built with the principles of the Act in mind: data minimisation, purpose limitation and security.\n        </p>'
);

html = html.replace(
  'Upon account termination or contract expiry, data is archived or deleted in accordance with statutory requirements.',
  'Upon account termination or contract expiry, data is archived or deleted upon request when a subscription ends.'
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Successfully updated public/index.html with Option 1 privacy fix!');
