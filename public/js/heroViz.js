/**
 * heroViz.js - Anonymity & Aggregation Hero Simulation
 * Havilah Landing Page
 *
 * Demonstrates the core privacy promise:
 * - Individual answers stay strictly private (permanent grey "You" dot, labeled "Your answer: never shown").
 * - Results only become visible to HR when a group reaches ANONYMITY_THRESHOLD (5 or more).
 * - Floating aggregate card: "HR sees: 6 responses · Wellbeing 72 · Sample".
 * - 3-step story caption advances every ~2.5s.
 * - Reads colors strictly from design tokens via getComputedStyle.
 * - Pauses on IntersectionObserver & visibilitychange; handles prefers-reduced-motion.
 */

(function () {
  'use strict';

  const ANONYMITY_THRESHOLD = 5;
  const GROUPS = 7;
  const MIGRATION_INTERVAL = 2600;
  const FADE_DURATION = 400;
  const STORY_INTERVAL = 2500;

  const STORY_STEPS = [
    'Your answer stays private.',
    'Together with 4 or more colleagues…',
    'HR sees only the group.',
  ];

  const parseRgb = (s, fallback) => {
    if (!s) return fallback;
    const m = s.match(/\d+/g);
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : fallback;
  };

  function init() {
    const canvas = document.getElementById('heroAnonymityCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const captionEl = document.getElementById('heroStoryCaption');
    const stepIndicators = [
      document.getElementById('heroStep1'),
      document.getElementById('heroStep2'),
      document.getElementById('heroStep3'),
    ].filter(Boolean);

    // Read colors from CSS tokens
    const cs = getComputedStyle(document.documentElement);
    const brand = parseRgb(cs.getPropertyValue('--brand'), [15, 118, 110]);
    const grey = parseRgb(cs.getPropertyValue('--text-subtle') || cs.getPropertyValue('--text-muted'), [100, 116, 139]);
    const textPrimary = parseRgb(cs.getPropertyValue('--text'), [15, 23, 42]);
    const textMuted = parseRgb(cs.getPropertyValue('--text-muted'), [71, 85, 105]);
    const surface = cs.getPropertyValue('--surface').trim() || '#FFFFFF';
    const border = cs.getPropertyValue('--border').trim() || '#E2E8F0';

    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    let w = 0, h = 0, dpr = 1;
    let dots = [], groups = [];
    let running = false, rafId = null, lastT = 0, migrationTimer = 0;
    let storyIndex = 0, storyTimer = 0;
    let frames = 0, fTime = 0, throttled = false;

    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function reset() {
      groups = [];
      const m = 48, cols = 3, rows = 2.4;
      for (let i = 0; i < GROUPS; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        groups.push({
          x: m + ((w - m * 2) / cols) * (c + 0.5) + (Math.random() - 0.5) * 16,
          y: m + ((h - m * 2) / rows) * (r + 0.5) + (Math.random() - 0.5) * 14,
          vx: (Math.random() - 0.5) * 0.08,
          vy: (Math.random() - 0.5) * 0.08,
          tealAlpha: 0,
          dots: [],
        });
      }

      dots = [];
      const total = window.innerWidth < 640 ? 24 : 30;
      // Pre-distribute so at least one group meets threshold >= 5
      const counts = total === 24 ? [6, 3, 2, 5, 3, 3, 2] : [6, 4, 3, 5, 4, 4, 4];
      let gIdx = 0, inG = 0;

      for (let i = 0; i < total; i++) {
        if (inG >= counts[gIdx] && gIdx < GROUPS - 1) {
          gIdx++;
          inG = 0;
        }
        const grp = groups[gIdx];
        const a = Math.random() * 6.28;
        const d = 14 + Math.random() * 24;
        const tx = grp.x + Math.cos(a) * d;
        const ty = grp.y + Math.sin(a) * d;

        const isYou = i === 0; // Dot 0 is the permanent "You" dot
        const dot = {
          x: tx,
          y: ty,
          tx,
          ty,
          sx: tx,
          sy: ty,
          g: gIdx,
          isYou,
          jOff: Math.random() * 6.28,
          jSpd: 0.6 + Math.random() * 0.4,
          m: false,
          p: 1,
        };
        grp.dots.push(dot);
        dots.push(dot);
        inG++;
      }

      groups.forEach((g) => {
        g.tealAlpha = g.dots.length >= ANONYMITY_THRESHOLD ? 1 : 0;
      });
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width;
      h = r.height;
      if (w === 0 || h === 0) return;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      reset();
      if (prefersReduced || throttled) {
        render();
      }
    }

    function migrate() {
      if (dots.length < 2) return;
      const d = dots[Math.floor(Math.random() * dots.length)];
      const oldG = d.g;
      let newG = Math.floor(Math.random() * (GROUPS - 1));
      if (newG >= oldG) newG++;

      const oldDots = groups[oldG].dots;
      const idx = oldDots.indexOf(d);
      if (idx !== -1) oldDots.splice(idx, 1);
      groups[newG].dots.push(d);

      d.g = newG;
      d.sx = d.x;
      d.sy = d.y;
      const a = Math.random() * 6.28;
      d.tx = groups[newG].x + Math.cos(a) * (14 + Math.random() * 22);
      d.ty = groups[newG].y + Math.sin(a) * (14 + Math.random() * 22);
      d.m = true;
      d.p = 0;
    }

    function updateStory(dt) {
      storyTimer += dt;
      if (storyTimer >= STORY_INTERVAL) {
        storyTimer = 0;
        storyIndex = (storyIndex + 1) % STORY_STEPS.length;
        if (captionEl) {
          captionEl.textContent = STORY_STEPS[storyIndex];
        }
        stepIndicators.forEach((pill, idx) => {
          pill.classList.toggle('active', idx === storyIndex);
        });
      }
    }

    function update(dt) {
      migrationTimer += dt;
      if (migrationTimer >= MIGRATION_INTERVAL) {
        migrationTimer = 0;
        migrate();
      }

      updateStory(dt);

      const m = 38;
      for (let i = 0; i < GROUPS; i++) {
        const g = groups[i];
        g.x += g.vx;
        g.y += g.vy;
        if (g.x < m || g.x > w - m) g.vx *= -1;
        if (g.y < m || g.y > h - m) g.vy *= -1;

        const target = g.dots.length >= ANONYMITY_THRESHOLD ? 1 : 0;
        const step = dt / FADE_DURATION;
        if (g.tealAlpha < target) g.tealAlpha = Math.min(target, g.tealAlpha + step);
        else if (g.tealAlpha > target) g.tealAlpha = Math.max(target, g.tealAlpha - step);
      }

      const now = performance.now() * 0.001;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const grp = groups[d.g];
        if (d.m) {
          d.p += dt / 600;
          if (d.p >= 1) {
            d.p = 1;
            d.m = false;
          }
          const t = d.p;
          const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          d.x = d.sx + (d.tx - d.sx) * ease;
          d.y = d.sy + (d.ty - d.sy) * ease;
        } else {
          const a = d.jOff + now * d.jSpd;
          const dist = 14 + (i % 5) * 3;
          d.x += (grp.x + Math.cos(a) * dist - d.x) * 0.08;
          d.y += (grp.y + Math.sin(a) * dist - d.y) * 0.08;
        }
      }
    }

    function drawRoundedRect(ctx, x, y, width, height, radius) {
      if (ctx.roundRect) {
        ctx.roundRect(x, y, width, height, radius);
      } else {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
      }
    }

    function render() {
      ctx.clearRect(0, 0, w, h);

      let primaryAggregateGroup = null;
      let primaryGroupMaxDots = 0;

      // 1. Draw Groups (Circles, connecting lines, and group labels)
      for (let i = 0; i < GROUPS; i++) {
        const g = groups[i];
        const al = g.tealAlpha;
        if (al > 0.01 && g.dots.length) {
          let maxD = 26;
          for (let j = 0; j < g.dots.length; j++) {
            maxD = Math.max(maxD, Math.hypot(g.dots[j].x - g.x, g.dots[j].y - g.y));
          }
          const r = maxD + 10;

          if (g.dots.length >= ANONYMITY_THRESHOLD && g.dots.length > primaryGroupMaxDots) {
            primaryGroupMaxDots = g.dots.length;
            primaryAggregateGroup = { group: g, r, al };
          }

          // Faint teal background circle
          ctx.beginPath();
          ctx.arc(g.x, g.y, r, 0, 6.28);
          ctx.fillStyle = rgba(brand, 0.04 * al);
          ctx.fill();

          // 1.5px teal outline
          ctx.strokeStyle = rgba(brand, 0.28 * al);
          ctx.lineWidth = 1.5;
          ctx.stroke();

          // Light connecting lines between group members
          ctx.strokeStyle = rgba(brand, 0.16 * al);
          ctx.lineWidth = 1;
          for (let j = 0; j < g.dots.length; j++) {
            for (let k = j + 1; k < g.dots.length; k++) {
              if (Math.hypot(g.dots[j].x - g.dots[k].x, g.dots[j].y - g.dots[k].y) < 72) {
                ctx.beginPath();
                ctx.moveTo(g.dots[j].x, g.dots[j].y);
                ctx.lineTo(g.dots[k].x, g.dots[k].y);
                ctx.stroke();
              }
            }
          }

          // Group of N label
          ctx.font = '600 11px system-ui, -apple-system, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillStyle = rgba(brand, al * 0.95);
          ctx.fillText(`Group of ${g.dots.length}`, g.x, g.y - r - 3);
        }
      }

      // 2. Draw Dots
      const isMobile = w < 640;
      const dotRadius = isMobile ? 3 : 4; // 6px diameter on mobile, 8px on desktop

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        const g = groups[d.g];

        // "You" dot is PERMANENTLY GREY. Others fade to teal when group >= 5.
        const isYou = d.isYou;
        const al = isYou ? 0 : g.tealAlpha;

        const cr = Math.round(grey[0] + (brand[0] - grey[0]) * al);
        const cg = Math.round(grey[1] + (brand[1] - grey[1]) * al);
        const cb = Math.round(grey[2] + (brand[2] - grey[2]) * al);

        ctx.beginPath();
        ctx.arc(d.x, d.y, dotRadius, 0, 6.28);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        ctx.fill();

        ctx.strokeStyle = al > 0.5 ? rgba(brand, 0.4) : 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // If this is the "You" dot, draw callout badge ("Your answer: never shown" with lock)
        if (isYou) {
          const pulse = (Math.sin(performance.now() * 0.003) + 1) * 0.5;
          ctx.beginPath();
          ctx.arc(d.x, d.y, dotRadius + 3 + pulse * 2, 0, 6.28);
          ctx.strokeStyle = rgba(grey, 0.35 - pulse * 0.15);
          ctx.lineWidth = 1;
          ctx.stroke();

          const labelText = 'Your answer: never shown';
          ctx.font = '500 10.5px system-ui, -apple-system, sans-serif';
          const textMetrics = ctx.measureText(labelText);
          const badgeW = textMetrics.width + 24;
          const badgeH = 20;

          let bx = d.x + 8;
          let by = d.y - 10;
          if (bx + badgeW > w - 10) bx = d.x - badgeW - 8;
          if (by < 10) by = d.y + 12;

          ctx.save();
          ctx.shadowColor = 'rgba(0, 0, 0, 0.06)';
          ctx.shadowBlur = 4;
          ctx.shadowOffsetY = 2;

          ctx.beginPath();
          drawRoundedRect(ctx, bx, by, badgeW, badgeH, 4);
          ctx.fillStyle = surface;
          ctx.fill();
          ctx.shadowColor = 'transparent';

          ctx.strokeStyle = border;
          ctx.lineWidth = 1;
          ctx.stroke();

          // Procedural lock icon
          const lockX = bx + 7;
          const lockY = by + 6;
          ctx.strokeStyle = rgba(textMuted, 0.9);
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(lockX + 3.5, lockY + 2.5, 2.5, Math.PI, 0);
          ctx.stroke();
          ctx.fillStyle = rgba(textMuted, 0.85);
          ctx.fillRect(lockX + 1, lockY + 2.5, 5, 4.5);

          // Text
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillStyle = rgba(textMuted, 0.95);
          ctx.fillText(labelText, bx + 16, by + badgeH / 2);
          ctx.restore();
        }
      }

      // 3. Floating Aggregate Card for group >= 5 ("HR sees: 6 responses · Wellbeing 72 · Sample")
      if (primaryAggregateGroup && primaryAggregateGroup.al > 0.3) {
        const { group: g, r, al } = primaryAggregateGroup;
        const cardText = `HR sees: ${g.dots.length} responses · Wellbeing 72 · Sample`;
        ctx.font = '500 11px system-ui, -apple-system, sans-serif';
        const cardMetrics = ctx.measureText(cardText);
        const cardW = cardMetrics.width + 28;
        const cardH = 26;

        let cx = g.x - cardW / 2;
        let cy = g.y + r + 6;
        if (cy + cardH > h - 8) cy = g.y - r - cardH - 14;
        if (cx < 10) cx = 10;
        if (cx + cardW > w - 10) cx = w - cardW - 10;

        ctx.save();
        ctx.globalAlpha = Math.min(1, al);
        ctx.shadowColor = 'rgba(0, 0, 0, 0.08)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetY = 3;

        ctx.beginPath();
        drawRoundedRect(ctx, cx, cy, cardW, cardH, 6);
        ctx.fillStyle = surface;
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = rgba(brand, 0.35);
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx + 12, cy + cardH / 2, 3.5, 0, 6.28);
        ctx.fillStyle = rgba(brand, 1);
        ctx.fill();

        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = rgba(textPrimary, 0.95);
        ctx.fillText(cardText, cx + 20, cy + cardH / 2);
        ctx.restore();
      }
    }

    function animate(t) {
      if (!running) return;
      if (!lastT) lastT = t;
      const dt = Math.min(t - lastT, 100);
      lastT = t;

      if (frames < 60) {
        frames++;
        fTime += dt;
        if (frames === 60 && fTime / 60 > 32) {
          throttled = true;
          stop();
          render();
          return;
        }
      }

      update(dt);
      render();
      rafId = requestAnimationFrame(animate);
    }

    function start() {
      if (running || throttled) return;
      if (prefersReduced) {
        render();
        return;
      }
      running = true;
      lastT = 0;
      rafId = requestAnimationFrame(animate);
    }

    function stop() {
      if (!running) return;
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && !document.hidden) start();
          else if (!e.isIntersecting) stop();
        });
      },
      { threshold: 0.1 }
    ).observe(canvas);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        stop();
      } else {
        const rect = canvas.getBoundingClientRect();
        if (rect.top < window.innerHeight && rect.bottom > 0) {
          start();
        }
      }
    });

    let resizeTimer = null;
    window.addEventListener(
      'resize',
      () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
      },
      { passive: true }
    );

    resize();
    start();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
