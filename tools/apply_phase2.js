const fs = require('fs');
const path = require('path');

const indexPath = path.resolve(__dirname, '../public/index.html');
let html = fs.readFileSync(indexPath, 'utf8');

// 1. CSS Replacement
const cssStartMarker = '    /* Three-Portal Showcase Section (Background: --surface) */';
const cssEndMarker = '    /* How It Works Steps (Background: --bg) */';

const newCss = `    /* Portal Morph Showcase Section (Real UI + Particle Morph) */
    .portal-showcase-section {
      padding: var(--space-8) 0;
      background-color: var(--surface);
      border-top: 1px solid var(--border);
      border-bottom: 1px solid var(--border);
      position: relative;
    }

    @media (min-width: 1024px) {
      .portal-showcase-section {
        padding: 64px 0;
      }
    }

    .portal-stage {
      position: relative;
      max-width: 960px;
      margin: 0 auto;
      aspect-ratio: 880 / 500;
      background-color: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-card);
      box-shadow: var(--shadow-card);
      overflow: hidden;
    }

    .portal-screenshot {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.35s ease;
      display: block;
    }

    .portal-screenshot.active {
      opacity: 1;
      pointer-events: auto;
    }

    .portal-morph-canvas {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 2;
    }

    .portal-stage-badge {
      position: absolute;
      top: 12px;
      right: 12px;
      z-index: 3;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      padding: 3px 8px;
      border-radius: 9999px;
      background: rgba(15, 23, 42, 0.75);
      color: #ffffff;
      backdrop-filter: blur(4px);
      pointer-events: none;
    }

    .portal-controls-wrap {
      max-width: 960px;
      margin: var(--space-4) auto 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--space-3);
    }

    .portal-tabs-row {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: var(--space-3);
      width: 100%;
      max-width: 600px;
    }

    .portal-tabs {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      background: var(--bg);
      padding: 4px;
      border-radius: 9999px;
      border: 1px solid var(--border);
    }

    .portal-tab {
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
      min-height: 44px;
      padding: 8px 18px;
      border: none;
      background: transparent;
      color: var(--text-muted);
      font-family: inherit;
      font-size: 14px;
      font-weight: 500;
      border-radius: 9999px;
      cursor: pointer;
      transition: color 0.2s ease, background 0.2s ease;
      touch-action: manipulation;
    }

    .portal-tab:hover {
      color: var(--text-primary);
    }

    .portal-tab:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }

    .portal-tab.active {
      color: var(--brand);
      font-weight: 600;
      background: var(--surface);
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
    }

    .portal-tab-progress {
      position: absolute;
      bottom: 4px;
      left: 14px;
      right: 14px;
      height: 2px;
      background: rgba(0, 0, 0, 0.06);
      border-radius: 2px;
      overflow: hidden;
    }

    .portal-tab-progress-bar {
      display: block;
      width: 0%;
      height: 100%;
      background: var(--brand);
      border-radius: 2px;
    }

    .portal-tab:not(.active) .portal-tab-progress {
      display: none;
    }

    .portal-pause-btn {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      border: 1px solid var(--border);
      background: var(--surface);
      color: var(--text-muted);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;
    }

    .portal-pause-btn:hover {
      color: var(--text-primary);
      border-color: var(--brand);
    }

    .portal-pause-btn:focus-visible {
      outline: 2px solid var(--brand);
      outline-offset: 2px;
    }

    .portal-caption {
      font-size: 15px;
      color: var(--text-muted);
      text-align: center;
      min-height: 24px;
      margin: 0;
      max-width: 680px;
      line-height: 1.5;
    }

    @media (max-width: 640px) {
      .portal-tab {
        padding: 6px 12px;
        font-size: 13px;
      }
      .portal-caption {
        font-size: 14px;
        padding: 0 var(--space-2);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .portal-screenshot {
        transition: none !important;
      }
      .portal-tab-progress {
        display: none !important;
      }
      .portal-morph-canvas {
        display: none !important;
      }
    }

`;

const cssStartIndex = html.indexOf(cssStartMarker);
const cssEndIndex = html.indexOf(cssEndMarker);
if (cssStartIndex === -1 || cssEndIndex === -1) {
  throw new Error('CSS markers not found');
}
html = html.slice(0, cssStartIndex) + newCss + html.slice(cssEndIndex);

// 2. HTML Showcase Replacement
const htmlStartMarker = '    <!-- Three-Portal Showcase Section (#product-preview - Background: --surface) -->';
const htmlEndMarker = '    <!-- How It Works Section (#how-it-works - Background: --bg) -->';

const newHtmlSection = `    <!-- Three-Portal Showcase Section (#product-showcase - Background: --surface) -->
    <section class="landing-section portal-showcase-section" id="product-showcase" aria-labelledby="showcase-heading" style="background-color: var(--surface);">
      <div class="page-container" style="max-width: 1280px;">
        <div class="section-header reveal-on-scroll" style="margin-bottom: var(--space-4);">
          <h2 id="showcase-heading" class="section-title">One platform, three secure portals.</h2>
          <p class="section-subtitle">Each role sees only what it needs.</p>
        </div>

        <div class="portal-stage" id="portalStage">
          <img src="/assets/showcase/hr.webp" alt="Havilah HR Analytics portal showing aggregated wellbeing KPIs, risk trends, and department benchmarks" class="portal-screenshot active" id="portal-img-hr" decoding="async">
          <img src="/assets/showcase/employee.webp" alt="Havilah Employee portal showing private check-in, wellbeing balance ring, and health library" class="portal-screenshot" id="portal-img-employee" decoding="async">
          <img src="/assets/showcase/assessor.webp" alt="Havilah Medical Assessor portal showing clinical referral queue with anonymous reference codes" class="portal-screenshot" id="portal-img-assessor" decoding="async">
          <canvas id="portalMorphCanvas" class="portal-morph-canvas" aria-hidden="true"></canvas>
          <span class="portal-stage-badge">Sample data</span>
        </div>

        <div class="portal-controls-wrap">
          <div class="portal-tabs-row">
            <div class="portal-tabs" role="tablist" aria-label="Platform role experiences">
              <button type="button" class="portal-tab active" role="tab" id="tab-portal-hr" aria-selected="true" aria-controls="portal-img-hr" data-role="hr">
                <span class="portal-tab-label">HR</span>
                <span class="portal-tab-progress"><span class="portal-tab-progress-bar"></span></span>
              </button>
              <button type="button" class="portal-tab" role="tab" id="tab-portal-employee" aria-selected="false" aria-controls="portal-img-employee" data-role="employee">
                <span class="portal-tab-label">Employee</span>
                <span class="portal-tab-progress"><span class="portal-tab-progress-bar"></span></span>
              </button>
              <button type="button" class="portal-tab" role="tab" id="tab-portal-assessor" aria-selected="false" aria-controls="portal-img-assessor" data-role="assessor">
                <span class="portal-tab-label">Medical assessor</span>
                <span class="portal-tab-progress"><span class="portal-tab-progress-bar"></span></span>
              </button>
            </div>
            <button type="button" class="portal-pause-btn" id="portalPauseBtn" aria-label="Pause portal preview autoplay" title="Pause autoplay">
              <svg class="icon-pause" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
              <svg class="icon-play" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="display:none;"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              <span class="sr-only">Pause</span>
            </button>
          </div>
          <p class="portal-caption" id="portalCaption" aria-live="polite">HR sees anonymous group insight, never individual answers.</p>
        </div>
      </div>
    </section>

`;

const htmlStartIndex = html.indexOf(htmlStartMarker);
const htmlEndIndex = html.indexOf(htmlEndMarker);
if (htmlStartIndex === -1 || htmlEndIndex === -1) {
  throw new Error('HTML markers not found');
}
html = html.slice(0, htmlStartIndex) + newHtmlSection + html.slice(htmlEndIndex);

// 3. Script tag: include /js/portalMorph.js right after /js/heroViz.js
if (!html.includes('/js/portalMorph.js')) {
  html = html.replace('<script src="/js/heroViz.js"></script>', '<script src="/js/heroViz.js"></script>\n  <script src="/js/portalMorph.js"></script>');
}

// 4. JS Showcase Controller cleanup
const jsStartMarker = '/* Three-Portal Showcase Controller (< 2.5 KB, zero dependencies) */';
const jsEndMarker = 'function toggleMobileMenu()';

const newJsSection = `/* Scroll Reveal Controller */
document.addEventListener('DOMContentLoaded', () => {
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries, o) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('is-visible'); o.unobserve(e.target); }
      });
    }, { threshold: 0.1 });
    document.querySelectorAll('.reveal-on-scroll').forEach(el => obs.observe(el));
  } else {
    document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('is-visible'));
  }
});

`;

const jsStartIndex = html.indexOf(jsStartMarker);
const jsEndIndex = html.indexOf(jsEndMarker);
if (jsStartIndex === -1 || jsEndIndex === -1) {
  throw new Error('JS markers not found');
}
html = html.slice(0, jsStartIndex) + newJsSection + html.slice(jsEndIndex);

// Update switchShowcase in window.App
html = html.replace(
  'switchShowcase,',
  "switchShowcase: (role) => window.HavilahPortalMorph && window.HavilahPortalMorph.jumpToRole(['hr', 'employee', 'assessor'].indexOf(role)),"
);

fs.writeFileSync(indexPath, html, 'utf8');
console.log('Successfully updated public/index.html for Phase 2 Portal Morph!');
