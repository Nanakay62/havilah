/**
 * spacetimeBg.js - Concentric Gravity Contours (Topographic Spacetime)
 * Lightweight 60fps HTML5 2D Canvas ambient background for the Havilah landing page.
 *
 * Features:
 * - 3 slow-drifting gravitational wells on gentle Lissajous orbits
 * - Soft atmospheric radial auras (#CCFBF1 teal-100 & #E0F2FE sky-100)
 * - 8 organic nested topographic contour rings per well using trigonometric harmonics
 * - Relativistic cross-well Gaussian spacetime curvature + smoothly damped pointer/touch warp
 * - Ultra-low contrast strokes (0.055 to 0.135 alpha) to guarantee foreground text legibility
 * - Full DPR capping (max 2), visibility pause, and prefers-reduced-motion support
 */

(function () {
  'use strict';

  function initSpacetimeBackground() {
    const canvas = document.getElementById('spacetimeBgCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let width = 0;
    let height = 0;
    let dpr = 1;
    let rafId = null;
    let running = false;
    let elapsed = 0;
    let lastTime = 0;

    // 3 gravitational wells drifting along gentle Lissajous paths
    const wells = [
      {
        cxRatio: 0.2,
        cyRatio: 0.26,
        axRatio: 0.085,
        ayRatio: 0.065,
        fx: 0.00018,
        fy: 0.00024,
        phaseX: 0.4,
        phaseY: 1.2,
        auraRgb: '204, 251, 241', // #CCFBF1 (Teal 100)
        auraAlpha: 0.34,
        radiusScale: 0.42,
        mass: 0.24,
        x: 0,
        y: 0,
      },
      {
        cxRatio: 0.78,
        cyRatio: 0.32,
        axRatio: 0.075,
        ayRatio: 0.075,
        fx: 0.00021,
        fy: 0.00015,
        phaseX: 2.3,
        phaseY: 0.5,
        auraRgb: '224, 242, 254', // #E0F2FE (Sky 100)
        auraAlpha: 0.36,
        radiusScale: 0.46,
        mass: 0.26,
        x: 0,
        y: 0,
      },
      {
        cxRatio: 0.48,
        cyRatio: 0.8,
        axRatio: 0.11,
        ayRatio: 0.06,
        fx: 0.00014,
        fy: 0.00022,
        phaseX: 4.1,
        phaseY: 3.1,
        auraRgb: '204, 251, 241', // #CCFBF1 (Teal 100)
        auraAlpha: 0.26,
        radiusScale: 0.4,
        mass: 0.2,
        x: 0,
        y: 0,
      },
    ];

    // Smoothly damped pointer/touch curvature field
    const pointer = {
      x: 0,
      y: 0,
      tx: 0,
      ty: 0,
      strength: 0,
      active: false,
      lastMoveTime: 0,
    };

    const RING_COUNT = 8;
    const TWO_PI = Math.PI * 2;

    function updateWellPositions(t) {
      for (let i = 0; i < wells.length; i++) {
        const well = wells[i];
        well.x =
          well.cxRatio * width +
          Math.cos(t * well.fx + well.phaseX) * (well.axRatio * width);
        well.y =
          well.cyRatio * height +
          Math.sin(t * well.fy + well.phaseY) * (well.ayRatio * height);
      }
    }

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth || document.documentElement.clientWidth || 1280;
      height = window.innerHeight || document.documentElement.clientHeight || 800;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (!pointer.active) {
        pointer.x = width * 0.5;
        pointer.y = height * 0.45;
        pointer.tx = pointer.x;
        pointer.ty = pointer.y;
      }

      updateWellPositions(elapsed);
      render(elapsed);
    }

    function onPointerMove(e) {
      if (prefersReduced) return;
      let clientX;
      let clientY;
      if (e.touches && e.touches.length > 0) {
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      if (typeof clientX !== 'number' || typeof clientY !== 'number') return;
      pointer.tx = clientX;
      pointer.ty = clientY;
      pointer.active = true;
      pointer.lastMoveTime = performance.now();
    }

    function onPointerLeave() {
      pointer.active = false;
    }

    function render(t) {
      ctx.clearRect(0, 0, width, height);

      const minDim = Math.min(width, height);
      const maxDim = Math.max(width, height);
      const isCompact = width < 640;
      const segments = isCompact ? 40 : 56;
      const crossSigma = Math.max(190, minDim * 0.34);
      const crossSigmaSq2 = 2 * crossSigma * crossSigma;
      const pointerSigma = isCompact ? 135 : 190;
      const pointerSigmaSq2 = 2 * pointerSigma * pointerSigma;

      // 1. Soft radial gradient auras behind each gravitational well
      for (let i = 0; i < wells.length; i++) {
        const well = wells[i];
        const auraR = Math.max(220, maxDim * well.radiusScale * 0.88);
        const grad = ctx.createRadialGradient(well.x, well.y, 0, well.x, well.y, auraR);
        grad.addColorStop(0, `rgba(${well.auraRgb}, ${well.auraAlpha})`);
        grad.addColorStop(0.52, `rgba(${well.auraRgb}, ${(well.auraAlpha * 0.42).toFixed(3)})`);
        grad.addColorStop(1, `rgba(${well.auraRgb}, 0)`);
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(well.x, well.y, auraR, 0, TWO_PI);
        ctx.fill();
      }

      // 2. Nested organic topographic contour rings around each well
      const phaseBase = t * 0.00038;
      const ptsX = new Float32Array(segments);
      const ptsY = new Float32Array(segments);

      for (let wIdx = 0; wIdx < wells.length; wIdx++) {
        const well = wells[wIdx];
        const maxRingR = Math.max(190, Math.min(maxDim * well.radiusScale, 460));
        const minRingR = Math.max(38, maxRingR * 0.14);

        for (let rIdx = 0; rIdx < RING_COUNT; rIdx++) {
          const frac = rIdx / (RING_COUNT - 1);
          // Slightly denser inner spacing like a gravitational potential contour map
          const baseR = minRingR + (maxRingR - minRingR) * Math.pow(frac, 1.15);
          const ringPhase = phaseBase * (wIdx % 2 === 0 ? 1 : -0.9) + rIdx * 0.36 + wIdx * 1.7;

          for (let s = 0; s < segments; s++) {
            const angle = (s / segments) * TWO_PI;
            const harmonic =
              1 +
              0.055 * Math.sin(angle * 2 + ringPhase) +
              0.036 * Math.cos(angle * 3 - ringPhase * 0.85 + rIdx * 0.2);
            const r = baseR * harmonic;

            let px = well.x + Math.cos(angle) * r;
            let py = well.y + Math.sin(angle) * r;

            // Cross-well relativistic curvature via Gaussian falloff
            for (let oIdx = 0; oIdx < wells.length; oIdx++) {
              if (oIdx === wIdx) continue;
              const other = wells[oIdx];
              const dx = other.x - px;
              const dy = other.y - py;
              const distSq = dx * dx + dy * dy;
              const falloff = Math.exp(-distSq / crossSigmaSq2);
              const warp = other.mass * falloff;
              px += dx * warp;
              py += dy * warp;
            }

            // Smoothly damped pointer/touch curvature warp
            if (pointer.strength > 0.005) {
              const pdx = pointer.x - px;
              const pdy = pointer.y - py;
              const pDistSq = pdx * pdx + pdy * pdy;
              const pFalloff = Math.exp(-pDistSq / pointerSigmaSq2);
              const pWarp = 0.16 * pointer.strength * pFalloff;
              px += pdx * pWarp;
              py += pdy * pWarp;
            }

            ptsX[s] = px;
            ptsY[s] = py;
          }

          // Smooth closed quadratic curve through midpoints
          ctx.beginPath();
          const lastX = ptsX[segments - 1];
          const lastY = ptsY[segments - 1];
          const firstMidX = (lastX + ptsX[0]) * 0.5;
          const firstMidY = (lastY + ptsY[0]) * 0.5;
          ctx.moveTo(firstMidX, firstMidY);

          for (let s = 0; s < segments; s++) {
            const next = (s + 1) % segments;
            const midX = (ptsX[s] + ptsX[next]) * 0.5;
            const midY = (ptsY[s] + ptsY[next]) * 0.5;
            ctx.quadraticCurveTo(ptsX[s], ptsY[s], midX, midY);
          }
          ctx.closePath();

          // Legibility guardrail: thin, ultra-low contrast teal strokes (0.135 inner -> 0.058 outer)
          const strokeAlpha = (0.135 - frac * 0.077).toFixed(3);
          ctx.strokeStyle = `rgba(15, 118, 110, ${strokeAlpha})`;
          ctx.lineWidth = rIdx < 3 ? 1.15 : 1.0;
          ctx.stroke();
        }
      }
    }

    function tick(now) {
      if (!running) return;
      if (!lastTime) lastTime = now;
      const dt = Math.min(now - lastTime, 50);
      lastTime = now;
      elapsed += dt;

      // Damped pointer tracking and relaxation to equilibrium when idle
      const idleMs = now - pointer.lastMoveTime;
      const targetStrength = pointer.active && idleMs < 2000 ? 1 : 0;
      const damp = Math.min(1, dt * 0.0065);
      pointer.x += (pointer.tx - pointer.x) * damp;
      pointer.y += (pointer.ty - pointer.y) * damp;
      pointer.strength += (targetStrength - pointer.strength) * Math.min(1, dt * 0.0045);

      updateWellPositions(elapsed);
      render(elapsed);
      rafId = requestAnimationFrame(tick);
    }

    function start() {
      if (running || prefersReduced) return;
      running = true;
      lastTime = 0;
      rafId = requestAnimationFrame(tick);
    }

    function stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerMove, { passive: true });
    window.addEventListener('touchmove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else start();
    });

    resize();
    if (!prefersReduced) {
      start();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initSpacetimeBackground);
  } else {
    initSpacetimeBackground();
  }
})();
