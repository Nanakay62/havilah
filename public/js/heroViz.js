/**
 * heroViz.js - Autonomous N >= 5 Team Cohort Aggregation Simulation
 * Havilah Landing Page Privacy Shield Hero Card
 *
 * Demonstrates zero-click organic privacy threshold aggregation:
 * - 15 floating employee response dots (#64748B slate by default).
 * - Dot 0 carries a subtle protective outer ring representing "Your answer".
 * - Autonomous Director cycles target attracted group size across [3, 6, 2, 7, 4, 5, 8, 3],
 *   holding unlocked states (~4.5s) longer than locked states (~3.5s).
 * - Nearest particles drift organically into the central gravity well with soft repulsion.
 * - Updates dedicated non-overlapping DOM status row, bottom HR readout pill, and story caption.
 * - 60fps HTML5 2D Canvas with DPR capping (max 2), visibility pause, and reduced-motion support.
 */

(function () {
  'use strict';

  const THRESHOLD = 5;
  const DOT_COUNT = 15;
  const DIRECTOR_SEQUENCE = [3, 6, 2, 7, 4, 5, 8, 3];
  const LOCKED_HOLD_MS = 3500;
  const UNLOCKED_HOLD_MS = 4500;

  // Deterministic calm sample wellbeing scores per group size (70 to 76)
  const SAMPLE_WELLBEING_BY_N = {
    5: 71,
    6: 73,
    7: 74,
    8: 76,
    9: 75,
  };

  const SLATE = [100, 116, 139]; // #64748B
  const TEAL = [15, 118, 110];   // #0F766E

  function initCohortSimulation() {
    const canvas = document.getElementById('heroAnonymityCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const statusLabelEl = document.getElementById('cohortStatusLabel');
    const hrPillEl = document.getElementById('cohortHrOutputPill');
    const hrTextEl = document.getElementById('cohortHrOutputText');
    const hrLockIconEl = document.getElementById('cohortHrLockIcon');
    const hrDotEl = document.getElementById('cohortHrDot');
    const captionEl = document.getElementById('heroStoryCaption');
    const stepPills = [
      document.getElementById('heroStep1'),
      document.getElementById('heroStep2'),
      document.getElementById('heroStep3'),
    ].filter(Boolean);

    const prefersReduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    let cx = 0;
    let cy = 0;
    let wellRadius = 64;

    let particles = [];
    let seqIdx = 0;
    let targetGroupSize = prefersReduced ? 6 : DIRECTOR_SEQUENCE[0];
    let phaseTimer = 0;
    let unlockAlpha = prefersReduced ? 1 : 0;
    let lastReportedCount = -1;
    let lastReportedUnlocked = null;

    let running = false;
    let inView = true;
    let rafId = null;
    let lastT = 0;
    let clock = 0;

    function createParticles() {
      particles = [];
      const outerMinR = wellRadius + 28;
      const outerMaxR = Math.max(outerMinR + 24, Math.min(w * 0.44, h * 0.43));

      for (let i = 0; i < DOT_COUNT; i++) {
        const angle = (i / DOT_COUNT) * Math.PI * 2 + (i % 2 === 0 ? 0.18 : -0.14);
        const startInWell = prefersReduced ? i < 6 : i < targetGroupSize;
        const dist = startInWell
          ? 16 + (i % 4) * 9
          : outerMinR + ((i * 37) % 100) / 100 * (outerMaxR - outerMinR);

        const px = cx + Math.cos(angle) * dist;
        const py = cy + Math.sin(angle) * dist;

        particles.push({
          id: i,
          isYou: i === 0,
          x: px,
          y: py,
          vx: 0,
          vy: 0,
          attracted: startInWell,
          orbitAngle: angle,
          orbitSpeed: (i % 2 === 0 ? 1 : -1) * (0.22 + (i % 5) * 0.045),
          orbitRadiusRatio: 0.24 + ((i * 29) % 58) / 100,
          outerDistRatio: 0.2 + ((i * 41) % 75) / 100,
          tealBlend: startInWell && prefersReduced ? 1 : 0,
          wobblePhase: i * 1.17,
        });
      }
      assignNearestAttracted(targetGroupSize);
    }

    function assignNearestAttracted(count) {
      // Sort particles by current distance to the central gravity well so nearest dots drift in organically
      const ordered = particles
        .map((p) => ({
          p,
          dist: Math.hypot(p.x - cx, p.y - cy) - (p.isYou ? 6 : 0),
        }))
        .sort((a, b) => a.dist - b.dist);

      for (let i = 0; i < ordered.length; i++) {
        ordered[i].p.attracted = i < count;
      }
    }

    function resize() {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      cx = w * 0.5;
      cy = h * 0.5;
      wellRadius = Math.max(54, Math.min(w, h) * 0.245);

      if (particles.length === 0) {
        createParticles();
      } else {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x = Math.max(18, Math.min(w - 18, p.x));
          p.y = Math.max(18, Math.min(h - 18, p.y));
        }
      }

      const initialInside = countInsideWell();
      syncDomReadout(initialInside, initialInside >= THRESHOLD);
      render();
    }

    function countInsideWell() {
      let inside = 0;
      const thresholdR = wellRadius + 7;
      for (let i = 0; i < particles.length; i++) {
        if (Math.hypot(particles[i].x - cx, particles[i].y - cy) <= thresholdR) {
          inside++;
        }
      }
      return inside;
    }

    function syncDomReadout(insideCount, unlocked) {
      if (insideCount === lastReportedCount && unlocked === lastReportedUnlocked) return;
      lastReportedCount = insideCount;
      lastReportedUnlocked = unlocked;

      if (statusLabelEl) {
        if (unlocked) {
          statusLabelEl.textContent = `Group of ${insideCount}`;
          statusLabelEl.classList.add('is-unlocked');
        } else {
          statusLabelEl.textContent = `${insideCount} ${insideCount === 1 ? 'response' : 'responses'} nearby`;
          statusLabelEl.classList.remove('is-unlocked');
        }
      }

      if (hrPillEl && hrTextEl) {
        hrPillEl.classList.toggle('is-unlocked', unlocked);
        if (hrLockIconEl) hrLockIconEl.style.display = unlocked ? 'none' : 'inline-flex';
        if (hrDotEl) hrDotEl.style.display = unlocked ? 'inline-block' : 'none';

        if (unlocked) {
          const sampleScore = SAMPLE_WELLBEING_BY_N[insideCount] || (70 + (insideCount % 7));
          hrTextEl.textContent = `HR sees: ${insideCount} responses · Wellbeing ${sampleScore} · Sample`;
        } else {
          hrTextEl.textContent = 'HR sees: Privacy locked (fewer than 5 responses)';
        }
      }

      // Sync story step pills and footer caption cleanly with current privacy state
      let stepIdx = 0;
      let caption = 'Your answer stays private.';
      if (unlocked) {
        stepIdx = 2;
        caption = 'HR sees only the group.';
      } else if (targetGroupSize >= THRESHOLD || insideCount >= 3) {
        stepIdx = 1;
        caption = 'Together with 4 or more colleagues...';
      }

      if (captionEl) captionEl.textContent = caption;
      stepPills.forEach((pill, idx) => {
        pill.classList.toggle('active', idx === stepIdx);
      });
    }

    function update(dt) {
      const sec = dt * 0.001;
      clock += sec;

      // Autonomous Director cycle (no manual clicks required)
      const holdDuration = targetGroupSize >= THRESHOLD ? UNLOCKED_HOLD_MS : LOCKED_HOLD_MS;
      phaseTimer += dt;
      if (phaseTimer >= holdDuration) {
        phaseTimer = 0;
        seqIdx = (seqIdx + 1) % DIRECTOR_SEQUENCE.length;
        targetGroupSize = DIRECTOR_SEQUENCE[seqIdx];
        assignNearestAttracted(targetGroupSize);
      }

      const outerPad = 24;
      const rxOuter = Math.max(wellRadius + 34, w * 0.5 - outerPad);
      const ryOuter = Math.max(wellRadius + 28, h * 0.5 - outerPad);

      // Update particle target steering + soft particle-to-particle repulsion
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.orbitAngle += p.orbitSpeed * sec;

        let tx;
        let ty;
        if (p.attracted) {
          const innerR = Math.max(14, wellRadius * (0.24 + p.orbitRadiusRatio * 0.62));
          tx = cx + Math.cos(p.orbitAngle) * innerR;
          ty = cy + Math.sin(p.orbitAngle) * innerR;
        } else {
          const band = 0.72 + p.outerDistRatio * 0.28;
          const ox = Math.max(wellRadius + 32, rxOuter * band);
          const oy = Math.max(wellRadius + 26, ryOuter * band);
          tx = cx + Math.cos(p.orbitAngle) * ox + Math.sin(clock * 0.7 + p.wobblePhase) * 6;
          ty = cy + Math.sin(p.orbitAngle) * oy + Math.cos(clock * 0.65 + p.wobblePhase) * 6;
        }

        // Smooth critically damped spring toward orbital target
        const stiffness = p.attracted ? 7.8 : 4.6;
        p.vx += (tx - p.x) * stiffness * sec;
        p.vy += (ty - p.y) * stiffness * sec;
      }

      // Pairwise soft repulsion so dots never stack
      const minSep = w < 420 ? 22 : 26;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const a = particles[i];
          const b = particles[j];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.hypot(dx, dy) || 0.001;
          if (dist < minSep) {
            const push = ((minSep - dist) / minSep) * 260 * sec;
            const nx = dx / dist;
            const ny = dy / dist;
            a.vx -= nx * push;
            a.vy -= ny * push;
            b.vx += nx * push;
            b.vy += ny * push;
          }
        }
      }

      const damping = Math.exp(-4.4 * sec);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        p.vx *= damping;
        p.vy *= damping;
        p.x += p.vx * sec;
        p.y += p.vy * sec;

        // Keep strictly inside canvas bounds
        p.x = Math.max(16, Math.min(w - 16, p.x));
        p.y = Math.max(16, Math.min(h - 16, p.y));
      }

      const insideCount = countInsideWell();
      const unlocked = insideCount >= THRESHOLD;

      const targetAlpha = unlocked ? 1 : 0;
      const blendSpeed = Math.min(1, sec * 3.8);
      unlockAlpha += (targetAlpha - unlockAlpha) * blendSpeed;

      const thresholdR = wellRadius + 7;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const isIn = Math.hypot(p.x - cx, p.y - cy) <= thresholdR;
        const targetTeal = unlocked && isIn ? 1 : 0;
        p.tealBlend += (targetTeal - p.tealBlend) * Math.min(1, sec * 4.5);
      }

      syncDomReadout(insideCount, unlocked);
    }

    function render() {
      ctx.clearRect(0, 0, w, h);

      const thresholdR = wellRadius + 7;

      // 1. Central Privacy Well Glow (#CCFBF1 when N >= 5)
      if (unlockAlpha > 0.01) {
        const glowR = wellRadius * 1.65;
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, glowR);
        grad.addColorStop(0, `rgba(204, 251, 241, ${(0.72 * unlockAlpha).toFixed(3)})`);
        grad.addColorStop(0.58, `rgba(204, 251, 241, ${(0.28 * unlockAlpha).toFixed(3)})`);
        grad.addColorStop(1, 'rgba(204, 251, 241, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Concentric pulsing teal privacy-shield rings (#0F766E / #0D9488)
        const pulse1 = (Math.sin(clock * 2.1) + 1) * 0.5;
        const pulse2 = (Math.sin(clock * 2.1 - 1.4) + 1) * 0.5;

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, wellRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(15, 118, 110, ${(0.36 * unlockAlpha).toFixed(3)})`;
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, wellRadius + 10 + pulse1 * 7, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(13, 148, 136, ${((0.22 - pulse1 * 0.12) * unlockAlpha).toFixed(3)})`;
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx, cy, wellRadius + 22 + pulse2 * 10, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(20, 184, 166, ${((0.14 - pulse2 * 0.08) * unlockAlpha).toFixed(3)})`;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // 2. Dashed Slate Perimeter Ring when Locked (N < 5)
      if (unlockAlpha < 0.99) {
        const lockedAlpha = 1 - unlockAlpha;
        ctx.save();
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.arc(cx, cy, wellRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(241, 245, 249, ${(0.45 * lockedAlpha).toFixed(3)})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(100, 116, 139, ${(0.36 * lockedAlpha).toFixed(3)})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Faint connecting lines between grouped dots when N >= 5
      if (unlockAlpha > 0.05) {
        const grouped = [];
        for (let i = 0; i < particles.length; i++) {
          if (Math.hypot(particles[i].x - cx, particles[i].y - cy) <= thresholdR) {
            grouped.push(particles[i]);
          }
        }
        ctx.save();
        ctx.lineWidth = 1;
        for (let i = 0; i < grouped.length; i++) {
          for (let j = i + 1; j < grouped.length; j++) {
            const d = Math.hypot(grouped[i].x - grouped[j].x, grouped[i].y - grouped[j].y);
            if (d < wellRadius * 1.45) {
              const lineAlpha = (1 - d / (wellRadius * 1.45)) * 0.24 * unlockAlpha;
              ctx.strokeStyle = `rgba(15, 118, 110, ${lineAlpha.toFixed(3)})`;
              ctx.beginPath();
              ctx.moveTo(grouped[i].x, grouped[i].y);
              ctx.lineTo(grouped[j].x, grouped[j].y);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 4. Draw 15 employee response dots
      const dotRadius = w < 420 ? 4.5 : 5.2;
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        // Smoothly interpolate from slate (#64748B) to teal (#0F766E); keep "You" dot protected in slate
        const t = p.isYou ? 0 : p.tealBlend;
        const r = Math.round(SLATE[0] + (TEAL[0] - SLATE[0]) * t);
        const g = Math.round(SLATE[1] + (TEAL[1] - SLATE[1]) * t);
        const b = Math.round(SLATE[2] + (TEAL[2] - SLATE[2]) * t);

        // Subtle outer ring on "Your answer" dot (always personal & protected)
        if (p.isYou) {
          const haloPulse = (Math.sin(clock * 2.8) + 1) * 0.5;
          ctx.beginPath();
          ctx.arc(p.x, p.y, dotRadius + 4.5 + haloPulse * 2, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(100, 116, 139, ${(0.45 - haloPulse * 0.16).toFixed(3)})`;
          ctx.lineWidth = 1.4;
          ctx.stroke();
        } else if (t > 0.2) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, dotRadius + 2.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(20, 184, 166, ${(0.18 * t).toFixed(3)})`;
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, dotRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
        ctx.fill();

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }
    }

    function animate(t) {
      if (!running) return;
      if (!lastT) lastT = t;
      const dt = Math.min(t - lastT, 64);
      lastT = t;

      update(dt);
      render();
      rafId = requestAnimationFrame(animate);
    }

    function start() {
      if (running || !inView || document.hidden || prefersReduced) return;
      running = true;
      lastT = 0;
      rafId = requestAnimationFrame(animate);
    }

    function stop() {
      running = false;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    if ('IntersectionObserver' in window) {
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            inView = entry.isIntersecting;
            if (inView) start();
            else stop();
          });
        },
        { threshold: 0.05 }
      );
      obs.observe(canvas);
    }

    window.addEventListener('resize', resize, { passive: true });
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
    document.addEventListener('DOMContentLoaded', initCohortSimulation);
  } else {
    initCohortSimulation();
  }
})();
