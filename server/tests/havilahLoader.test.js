'use strict';

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '../..');

function readRel(relPath) {
  return fs.readFileSync(path.join(ROOT_DIR, relPath), 'utf8');
}

describe('Custom Havilah Loader (Idea B - Concentric Breathing Ripple)', () => {
  it('defines pure CSS keyframes, variant sizing, dark mode support, and reduced motion in public/css/loader.css', () => {
    const css = readRel('public/css/loader.css');

    expect(css).not.toContain('\u2014');
    expect(css).toContain('@keyframes havilahRipplePrimary');
    expect(css).toContain('@keyframes havilahRippleSecondary');
    expect(css).toContain('@keyframes havilahMarkBreathe');
    expect(css).toContain('scale(0.58)');
    expect(css).toContain('scale(1.62)');
    expect(css).toContain('scale(0.97)');
    expect(css).toContain('scale(1.04)');
    expect(css).toContain('3.2s');
    expect(css).toContain('1.6s');
    expect(css).toContain('#0F766E');
    expect(css).toContain('#0cb6d6');
    expect(css).toContain('.havilah-loader--fullscreen');
    expect(css).toContain('.havilah-loader--section');
    expect(css).toContain('.havilah-loader--button');
    expect(css).toContain('.havilah-loader--dark');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('registers <havilah-loader> and window.HavilahLoader using the original brand mark with zero JS animation loops', () => {
    const js = readRel('public/js/havilahLoader.js');

    expect(js).not.toContain('\u2014');
    expect(js).toContain('/assets/havilah-mark.svg');
    expect(js).toContain('role="status"');
    expect(js).toContain('aria-live="polite"');
    expect(js).toContain('Loading...');
    expect(js).toContain("customElements.define('havilah-loader'");
    expect(js).toContain('global.HavilahLoader');
    expect(js).toContain('setButtonLoading');
    expect(js).toContain('showFullscreen');
    expect(js).toContain('hideFullscreen');
    expect(js).toContain('hl-btn-is-loading');
    expect(js).not.toContain("'is-loading'");
    expect(js).not.toContain('Math.ceil(rect.width)');
    expect(js).not.toContain('requestAnimationFrame');
    expect(js).not.toContain('setInterval');
  });

  it('integrates HavilahLoader across all 10 platform pages and removes generic animate-spin SVG spinners', () => {
    const pages = [
      'public/index.html',
      'public/login.html',
      'public/register.html',
      'public/activate.html',
      'public/reset-password.html',
      'public/verify.html',
      'public/clinical-portal.html',
      'private/app/dashboard.html',
      'private/portal/hr.html',
      'private/app/superadmin.html',
    ];

    for (const relPath of pages) {
      const html = readRel(relPath);
      expect(html).toContain('/js/havilahLoader.js');
      expect(html).toContain('/css/loader.css');
      expect(html).not.toContain('animate-spin');
    }
  });
});
