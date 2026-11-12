const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../public/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. Update CSS for Hero, Summary Strip, Capabilities, and Typography
// Replace hero section styling and add story-row & video-link styles
const cssTargetOld = `    .hero-title {
      font-size: clamp(28px, 4vw, 44px);
      font-weight: var(--weight-semibold);
      letter-spacing: -0.025em;
      line-height: 1.15;
      color: var(--text);
      margin-bottom: var(--space-4);
    }

    .hero-subtitle {
      font-size: clamp(15px, 1.8vw, 17px);
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: var(--space-6);
    }

    .hero-cta-group {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    @media (max-width: 639px) {
      .hero-cta-group {
        flex-direction: column;
        align-items: stretch;
      }
      .hero-cta-group .btn {
        width: 100%;
      }
    }

    /* Hero Anonymity Animation Card (Background: --surface) */
    .hero-anim-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-modal);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .hero-canvas-wrap {
      position: relative;
      width: 100%;
      height: 320px;
      min-height: 280px;
      background-color: var(--surface);
    }

    @media (min-width: 1024px) {
      .hero-canvas-wrap {
        height: 360px;
      }
    }

    #heroAnonymityCanvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .hero-legend-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-6);
      padding: var(--space-3) var(--space-4);
      background-color: var(--surface);
      border-top: 1px solid var(--border);
      font-size: var(--text-xs);
      color: var(--text-muted);
      flex-wrap: wrap;
    }

    .hero-legend-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .legend-dot-grey {
      background-color: var(--text-subtle);
    }

    .legend-dot-teal {
      background-color: var(--brand);
    }

    /* Summary Row (Background: --surface) */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    @media (min-width: 768px) {
      .summary-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .summary-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: var(--space-4);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
    }

    .summary-card-title {
      font-size: var(--text-base);
      font-weight: var(--weight-semibold);
      color: var(--text);
    }

    .summary-card-desc {
      font-size: var(--text-sm);
      color: var(--text-muted);
      line-height: 1.5;
    }

    /* Features Grid (Background: --surface) */
    .features-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    @media (min-width: 768px) {
      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (min-width: 1024px) {
      .features-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-6);
      }
    }

    .feature-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: var(--space-4);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      transition: border-color 0.15s ease;
    }

    .feature-card:hover {
      border-color: var(--text-subtle);
    }

    .feature-icon-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--brand);
    }

    .feature-icon-row svg {
      width: 20px;
      height: 20px;
      stroke: currentColor;
    }

    .feature-title {
      font-size: var(--text-md);
      font-weight: var(--weight-semibold);
      color: var(--text);
    }

    .feature-desc {
      font-size: var(--text-sm);
      color: var(--text-muted);
      line-height: 1.5;
    }`;

const cssTargetNew = `    .hero-title {
      font-size: clamp(36px, 5.2vw, 58px);
      font-weight: 600;
      letter-spacing: -0.025em;
      line-height: 1.12;
      color: var(--text);
      margin-bottom: var(--space-4);
      max-width: 680px;
    }

    .hero-subtitle {
      font-size: 18px;
      color: var(--text-muted);
      line-height: 1.6;
      margin-bottom: var(--space-6);
      max-width: 580px;
    }

    .hero-cta-group {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      flex-wrap: wrap;
    }

    .hero-video-link {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: 1px solid transparent;
      padding: 8px 14px;
      color: var(--brand);
      font-family: inherit;
      font-size: 15px;
      font-weight: var(--weight-medium);
      cursor: pointer;
      border-radius: var(--radius-control);
      transition: all 0.15s ease;
      touch-action: manipulation;
    }

    .hero-video-link:hover {
      background-color: var(--brand-subtle);
      color: var(--brand-hover);
    }

    .hero-video-link:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }

    @media (max-width: 639px) {
      .hero-cta-group {
        flex-direction: column;
        align-items: stretch;
      }
      .hero-cta-group .btn {
        width: 100%;
      }
      .hero-video-link {
        justify-content: center;
        width: 100%;
        padding: 10px;
      }
    }

    /* Hero Anonymity Animation Card (Background: --surface) */
    .hero-anim-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-modal);
      box-shadow: var(--shadow-card);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .hero-canvas-wrap {
      position: relative;
      width: 100%;
      height: 320px;
      min-height: 280px;
      background-color: var(--surface);
    }

    @media (min-width: 1024px) {
      .hero-canvas-wrap {
        height: 360px;
      }
    }

    #heroAnonymityCanvas {
      display: block;
      width: 100%;
      height: 100%;
    }

    .hero-story-strip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      padding: 10px var(--space-4);
      background-color: var(--bg);
      border-top: 1px solid var(--border);
    }

    .hero-story-step-pills {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .hero-step-pill {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background-color: var(--border);
      transition: background-color 0.3s ease, transform 0.3s ease;
    }

    .hero-step-pill.active {
      background-color: var(--brand);
      transform: scale(1.25);
    }

    .hero-story-caption {
      font-size: 14px;
      font-weight: 500;
      color: var(--text);
      margin: 0;
      line-height: 1.4;
    }

    .hero-legend-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-6);
      padding: var(--space-3) var(--space-4);
      background-color: var(--surface);
      border-top: 1px solid var(--border);
      font-size: var(--text-sm);
      color: var(--text-muted);
      flex-wrap: wrap;
    }

    .hero-legend-item {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }

    .legend-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .legend-dot-grey {
      background-color: var(--text-subtle);
    }

    .legend-dot-teal {
      background-color: var(--brand);
    }

    /* Summary Row (3 Larger Items with Icons, 24px padding, 18px title, 16px body) */
    .summary-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-6);
    }

    @media (min-width: 768px) {
      .summary-grid {
        grid-template-columns: repeat(3, 1fr);
      }
    }

    .summary-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: var(--space-6);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    .summary-icon-wrap {
      width: 40px;
      height: 40px;
      border-radius: var(--radius-control);
      background-color: var(--brand-subtle);
      color: var(--brand);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .summary-icon-wrap svg {
      width: 22px;
      height: 22px;
    }

    .summary-card-title {
      font-size: 18px;
      font-weight: var(--weight-semibold);
      color: var(--text);
      letter-spacing: -0.01em;
      margin: 0;
    }

    .summary-card-desc {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.55;
      margin: 0;
    }

    /* Features Grid (6 Capabilities, Uniform, 24px padding, 18px title, 16px body) */
    .features-grid {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-4);
    }

    @media (min-width: 768px) {
      .features-grid {
        grid-template-columns: repeat(2, 1fr);
      }
    }

    @media (min-width: 1024px) {
      .features-grid {
        grid-template-columns: repeat(3, 1fr);
        gap: var(--space-6);
      }
    }

    .feature-card {
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      padding: var(--space-6);
      box-shadow: var(--shadow-card);
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .feature-card:hover {
      border-color: var(--text-subtle);
      box-shadow: 0 4px 12px rgba(16, 24, 40, 0.08);
    }

    .feature-icon-row {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      color: var(--brand);
    }

    .feature-icon-row svg {
      width: 24px;
      height: 24px;
      stroke: currentColor;
    }

    .feature-title {
      font-size: 18px;
      font-weight: var(--weight-semibold);
      color: var(--text);
      letter-spacing: -0.01em;
      margin: 0;
    }

    .feature-desc {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.55;
      margin: 0;
    }`;

if (!html.includes(cssTargetOld)) {
  throw new Error('cssTargetOld not found in index.html');
}
html = html.replace(cssTargetOld, cssTargetNew);

// 2. Adjust section padding from 48px to 40px on mobile
html = html.replace(
  `.landing-section {
      padding: 48px 0;
      border-bottom: 1px solid var(--border);
      scroll-margin-top: 64px;
    }`,
  `.landing-section {
      padding: 40px 0;
      border-bottom: 1px solid var(--border);
      scroll-margin-top: 64px;
    }`
);
html = html.replace(
  `.hero-section {
      background-color: var(--bg);
      padding: 48px 0;
      border-bottom: 1px solid var(--border);
    }`,
  `.hero-section {
      background-color: var(--bg);
      padding: 40px 0;
      border-bottom: 1px solid var(--border);
    }`
);

// 3. Replace Hero HTML Markup
const heroHtmlOld = `    <!-- Hero Section (Background: --bg, Two Columns on Desktop) -->
    <section class="hero-section" id="hero" aria-labelledby="hero-heading">
      <div class="page-container">
        <div class="hero-grid">
          <!-- Left Column: Copy & Actions -->
          <div class="hero-text-col reveal-on-scroll">
            <h1 id="hero-heading" class="hero-title">Workplace wellbeing, measured with care.</h1>
            <p class="hero-subtitle">Confidential check-ins for your employees. Anonymous, group-level insight for your HR team.</p>
            <div class="hero-cta-group">
              <button type="button" class="btn btn-primary" onclick="App.bookDemo()">Book a demo</button>
              <button type="button" class="btn btn-secondary" id="heroStartTrialBtn" onclick="App.startTrial()">Start 30-day trial</button>
              <button type="button" class="btn btn-secondary" id="heroWatchVideoBtn" onclick="App.openVideoModal()" aria-haspopup="dialog" style="display: inline-flex; align-items: center; gap: 8px;">
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width: 16px; height: 16px;" aria-hidden="true">
                  <polygon points="6 3 20 12 6 21 6 3"></polygon>
                </svg>
                <span>Watch 30-second overview</span>
              </button>
            </div>
          </div>

          <!-- Right Column: Anonymity Animation Card (Background: --surface) -->
          <div class="hero-anim-card reveal-on-scroll">
            <div class="hero-canvas-wrap">
              <canvas id="heroAnonymityCanvas" role="img" aria-label="Simulation of employee check-in anonymity. Individual responses stay private; groups of five or more become visible aggregate insight."></canvas>
              <!-- Visually hidden sentence for screen reader users -->
              <p class="sr-only">Individual responses stay private. Groups of five or more become visible insight.</p>
            </div>
            <div class="hero-legend-row" aria-hidden="true">
              <div class="hero-legend-item">
                <span class="legend-dot legend-dot-grey"></span>
                <span>Individual: always private</span>
              </div>
              <div class="hero-legend-item">
                <span class="legend-dot legend-dot-teal"></span>
                <span>Group of 5 or more: visible to HR</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;

const heroHtmlNew = `    <!-- Hero Section (Background: --bg, Two Columns on Desktop) -->
    <section class="hero-section" id="hero" aria-labelledby="hero-heading">
      <div class="page-container">
        <div class="hero-grid">
          <!-- Left Column: Copy & Actions -->
          <div class="hero-text-col reveal-on-scroll">
            <h1 id="hero-heading" class="hero-title">Know how your people are really doing, without ever seeing who said what.</h1>
            <p class="hero-subtitle">Confidential check-ins for employees. Anonymous group insight for HR.</p>
            <div class="hero-cta-group">
              <button type="button" class="btn btn-primary" onclick="App.bookDemo()">Book a demo</button>
              <button type="button" class="btn btn-secondary" id="heroStartTrialBtn" onclick="App.startTrial()">Start 30-day trial</button>
              <button type="button" class="hero-video-link" id="heroWatchVideoBtn" onclick="App.openVideoModal()" aria-haspopup="dialog">
                <svg viewBox="0 0 24 24" fill="currentColor" stroke="none" style="width: 15px; height: 15px;" aria-hidden="true">
                  <polygon points="6 3 20 12 6 21 6 3"></polygon>
                </svg>
                <span>Watch 30-second overview</span>
              </button>
            </div>
          </div>

          <!-- Right Column: Anonymity Animation Card (Background: --surface) -->
          <div class="hero-anim-card reveal-on-scroll">
            <div class="hero-canvas-wrap">
              <canvas id="heroAnonymityCanvas" role="img" aria-label="Simulation of employee check-in anonymity. Individual responses stay private; groups of five or more become visible aggregate insight."></canvas>
              <!-- Visually hidden sentence for screen reader users -->
              <p class="sr-only">Individual responses stay private. Groups of five or more become visible insight.</p>
            </div>
            <!-- Story Step Advancing Caption -->
            <div class="hero-story-strip">
              <div class="hero-story-step-pills" aria-hidden="true">
                <span class="hero-step-pill active" id="heroStep1"></span>
                <span class="hero-step-pill" id="heroStep2"></span>
                <span class="hero-step-pill" id="heroStep3"></span>
              </div>
              <p class="hero-story-caption" id="heroStoryCaption" aria-live="polite">Your answer stays private.</p>
            </div>
            <div class="hero-legend-row" aria-hidden="true">
              <div class="hero-legend-item">
                <span class="legend-dot legend-dot-grey"></span>
                <span>Individual: always private</span>
              </div>
              <div class="hero-legend-item">
                <span class="legend-dot legend-dot-teal"></span>
                <span>Group of 5 or more: visible to HR</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>`;

if (!html.includes(heroHtmlOld)) {
  throw new Error('heroHtmlOld not found in index.html');
}
html = html.replace(heroHtmlOld, heroHtmlNew);

// 4. Replace 3-Item Summary Strip HTML Markup
const summaryHtmlOld = `    <!-- Product Summary Row (Background: --surface) -->
    <section class="landing-section" style="background-color: var(--surface);" aria-label="Product Highlights">
      <div class="page-container">
        <div class="summary-grid">
          <div class="summary-card reveal-on-scroll">
            <h2 class="summary-card-title">Anonymous by design</h2>
            <p class="summary-card-desc">HR sees results only for groups of 5 or more.</p>
          </div>
          <div class="summary-card reveal-on-scroll">
            <h2 class="summary-card-title">Validated screening tools</h2>
            <p class="summary-card-desc">PHQ-9, GAD-7, PSS-10, FAS-10, and COPSOQ-III check-ins.</p>
          </div>
          <div class="summary-card reveal-on-scroll">
            <h2 class="summary-card-title">Confidential medical assessor access</h2>
            <p class="summary-card-desc">Direct referrals and secure chat with a clinician.</p>
          </div>
        </div>
      </div>
    </section>`;

const summaryHtmlNew = `    <!-- Product Summary Row (Background: --surface) -->
    <section class="landing-section" style="background-color: var(--surface);" aria-label="Product Highlights">
      <div class="page-container">
        <div class="summary-grid">
          <!-- Item 1: Anonymous by design -->
          <div class="summary-card reveal-on-scroll">
            <div class="summary-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                <circle cx="12" cy="11" r="1"></circle>
                <path d="M12 12v3"></path>
              </svg>
            </div>
            <h2 class="summary-card-title">Anonymous by design</h2>
            <p class="summary-card-desc">HR sees results only for groups of 5 or more.</p>
          </div>

          <!-- Item 2: Validated screening tools -->
          <div class="summary-card reveal-on-scroll">
            <div class="summary-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M9 11l3 3L22 4"></path>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path>
              </svg>
            </div>
            <h2 class="summary-card-title">Validated screening tools</h2>
            <p class="summary-card-desc">PHQ-9, GAD-7, PSS-10, FAS-10, and COPSOQ-III check-ins.</p>
          </div>

          <!-- Item 3: Confidential medical assessor access -->
          <div class="summary-card reveal-on-scroll">
            <div class="summary-icon-wrap" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                <line x1="9" y1="9" x2="15" y2="9"></line>
                <line x1="9" y1="13" x2="13" y2="13"></line>
              </svg>
            </div>
            <h2 class="summary-card-title">Confidential medical assessor access</h2>
            <p class="summary-card-desc">Direct referrals and secure chat with a clinician.</p>
          </div>
        </div>
      </div>
    </section>`;

if (!html.includes(summaryHtmlOld)) {
  throw new Error('summaryHtmlOld not found in index.html');
}
html = html.replace(summaryHtmlOld, summaryHtmlNew);

// 5. Update font size < 13px across index.html
// Replace all remaining font-size: var(--text-xs) with var(--text-sm) (13px)
html = html.replace(/font-size:\s*var\(--text-xs\);/g, 'font-size: var(--text-sm);');
html = html.replace(/font-size:\s*11px;/g, 'font-size: 12px;');

// Also ensure step-desc and other text are 16px
html = html.replace(
  `.step-desc {
      font-size: var(--text-sm);
      color: var(--text-muted);
      line-height: 1.5;
    }`,
  `.step-desc {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.55;
    }`
);

html = html.replace(
  `.privacy-point-text {
      font-size: var(--text-sm);
      color: var(--text);
      line-height: 1.5;
    }`,
  `.privacy-point-text {
      font-size: 16px;
      color: var(--text);
      line-height: 1.55;
    }`
);

html = html.replace(
  `.faq-answer {
      font-size: var(--text-sm);
      color: var(--text-muted);
      line-height: 1.6;
      display: none;
      padding-top: var(--space-3);
    }`,
  `.faq-answer {
      font-size: 16px;
      color: var(--text-muted);
      line-height: 1.6;
      display: none;
      padding-top: var(--space-3);
    }`
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Successfully updated index.html for Phase 3 and Phase 4!');
