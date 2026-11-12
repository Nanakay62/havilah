/**
 * portalMorph.js - Real-UI Particle Morph & Portal Showcase
 * Havilah Landing Page
 *
 * Samples real WebP screenshots into ~4,200 colored particles (1,800 on mobile <=640px).
 * Sequences: Hold 4.2s (with progress bar) -> Morph 2.0s with curved paths -> Crossfade sharp WebP.
 * Handles: prefers-reduced-motion, IntersectionObserver (>=40%), visibilitychange, keyboard tablist.
 */

(function () {
  'use strict';

  const ROLES = [
    {
      id: 'hr',
      title: 'HR',
      src: '/assets/showcase/hr.webp',
      alt: 'Havilah HR Analytics portal showing aggregated wellbeing KPIs, risk trends, and department benchmarks',
      caption: 'HR sees anonymous group insight, never individual answers.',
    },
    {
      id: 'employee',
      title: 'Employee',
      src: '/assets/showcase/employee.webp',
      alt: 'Havilah Employee portal showing private check-in, wellbeing balance ring, and health library',
      caption: 'Employees check in privately and can reach help in one tap.',
    },
    {
      id: 'assessor',
      title: 'Medical assessor',
      src: '/assets/showcase/assessor.webp',
      alt: 'Havilah Medical Assessor portal showing clinical referral queue with anonymous reference codes',
      caption: 'Medical assessors receive referrals with the details the employee chooses to share, and reply by secure chat. HR never sees them.',
    },
  ];

  const HOLD_DURATION = 4200;
  const MORPH_DURATION = 2000;
  const LOGICAL_WIDTH = 880;
  const LOGICAL_HEIGHT = 500;

  let currentIndex = 0;
  let targetIndex = 1;
  let state = 'HOLD'; // 'HOLD' | 'MORPH'
  let stateStartTime = 0;
  let isPaused = false;
  let inView = false;
  let animFrameId = null;
  let lowPerformance = false;
  let frameTimes = [];

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // DOM elements
  let sectionEl, stageEl, canvasEl, ctx, captionEl, pauseBtnEl;
  let tabButtons = [];
  let screenshotImgs = [];
  let progressBarEls = [];

  // Particle data: array of arrays of points for each role [pointsRole0, pointsRole1, pointsRole2]
  let rolePoints = [];
  let isLoaded = false;
  let isInitialized = false;

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function getParticleCount() {
    return window.innerWidth <= 640 ? 1800 : 4200;
  }

  async function preloadAndSample() {
    const isMobile = window.innerWidth <= 640;
    const targetCount = isMobile ? 1800 : 4200;

    const offscreen = document.createElement('canvas');
    offscreen.width = LOGICAL_WIDTH;
    offscreen.height = LOGICAL_HEIGHT;
    const offCtx = offscreen.getContext('2d', { willReadFrequently: true });

    rolePoints = [];

    for (let i = 0; i < ROLES.length; i++) {
      const img = screenshotImgs[i];
      if (!img.complete) {
        await new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }
      if (img.decode) {
        try { await img.decode(); } catch (e) {}
      }

      offCtx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
      offCtx.drawImage(img, 0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

      const imgData = offCtx.getImageData(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT).data;
      const points = [];

      // Grid sampling stride
      const stride = isMobile ? 15 : 10;
      for (let y = 8; y < LOGICAL_HEIGHT - 8; y += stride) {
        for (let x = 8; x < LOGICAL_WIDTH - 8; x += stride) {
          // Add slight jitter
          const jx = Math.min(LOGICAL_WIDTH - 1, Math.max(0, x + ((points.length * 7) % 5) - 2));
          const jy = Math.min(LOGICAL_HEIGHT - 1, Math.max(0, y + ((points.length * 11) % 5) - 2));

          const idx = (jy * LOGICAL_WIDTH + jx) * 4;
          const r = imgData[idx];
          const g = imgData[idx + 1];
          const b = imgData[idx + 2];
          const a = imgData[idx + 3];

          // Skip near-white background
          if (a > 30 && !(r > 246 && g > 246 && b > 246)) {
            points.push({ x: jx, y: jy, r, g, b });
          }
        }
      }

      // If we need more points to meet targetCount, add random contrast points
      while (points.length < targetCount) {
        const rx = 10 + Math.floor(Math.random() * (LOGICAL_WIDTH - 20));
        const ry = 10 + Math.floor(Math.random() * (LOGICAL_HEIGHT - 20));
        const idx = (ry * LOGICAL_WIDTH + rx) * 4;
        points.push({
          x: rx,
          y: ry,
          r: imgData[idx] || 140,
          g: imgData[idx + 1] || 150,
          b: imgData[idx + 2] || 160,
        });
      }

      // Trim to targetCount
      rolePoints.push(points.slice(0, targetCount));
    }

    isLoaded = true;
  }

  function resizeCanvas() {
    if (!canvasEl || !stageEl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = stageEl.getBoundingClientRect();
    const w = rect.width || LOGICAL_WIDTH;
    const h = rect.height || LOGICAL_HEIGHT;

    canvasEl.width = w * dpr;
    canvasEl.height = h * dpr;
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale((w / LOGICAL_WIDTH) * dpr, (h / LOGICAL_HEIGHT) * dpr);
    }
  }

  function setVisibleRole(index, updateCaption = true) {
    currentIndex = index;
    screenshotImgs.forEach((img, i) => {
      img.classList.toggle('active', i === index);
    });

    tabButtons.forEach((tab, i) => {
      const active = i === index;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
    });

    progressBarEls.forEach((pb, i) => {
      pb.style.width = i === index && state === 'HOLD' && !isPaused ? '0%' : (i < index ? '100%' : '0%');
    });

    if (updateCaption && captionEl) {
      captionEl.textContent = ROLES[index].caption;
    }
  }

  function jumpToRole(index) {
    if (index === currentIndex && state === 'HOLD') return;

    state = 'HOLD';
    stateStartTime = performance.now();
    isPaused = true;
    updatePauseButtonUI();

    if (canvasEl) {
      canvasEl.style.opacity = '0';
      if (ctx) ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
    }

    setVisibleRole(index, true);
  }

  function updatePauseButtonUI() {
    if (!pauseBtnEl) return;
    const iconPause = pauseBtnEl.querySelector('.icon-pause');
    const iconPlay = pauseBtnEl.querySelector('.icon-play');
    const srText = pauseBtnEl.querySelector('.sr-only');

    if (isPaused) {
      if (iconPause) iconPause.style.display = 'none';
      if (iconPlay) iconPlay.style.display = 'block';
      if (srText) srText.textContent = 'Play';
      pauseBtnEl.setAttribute('aria-label', 'Play portal preview autoplay');
      pauseBtnEl.setAttribute('title', 'Play autoplay');
    } else {
      if (iconPause) iconPause.style.display = 'block';
      if (iconPlay) iconPlay.style.display = 'none';
      if (srText) srText.textContent = 'Pause';
      pauseBtnEl.setAttribute('aria-label', 'Pause portal preview autoplay');
      pauseBtnEl.setAttribute('title', 'Pause autoplay');
    }
  }

  function togglePause() {
    isPaused = !isPaused;
    updatePauseButtonUI();
    if (!isPaused) {
      stateStartTime = performance.now();
      if (!animFrameId) {
        animFrameId = requestAnimationFrame(loop);
      }
    }
  }

  function loop(now) {
    if (!isInitialized || prefersReduced) return;

    if (!inView || isPaused) {
      animFrameId = null;
      return;
    }

    // Benchmark frame delta for low-spec fallback
    if (frameTimes.length < 60) {
      if (loop.lastNow) {
        frameTimes.push(now - loop.lastNow);
      }
      loop.lastNow = now;
      if (frameTimes.length === 60) {
        const avg = frameTimes.reduce((a, b) => a + b, 0) / 60;
        if (avg > 32) {
          lowPerformance = true;
          console.log('[portalMorph] Switching to CSS crossfade fallback (avg frame time: ' + avg.toFixed(1) + 'ms)');
          if (canvasEl) canvasEl.style.display = 'none';
        }
      }
    }

    const elapsed = now - stateStartTime;

    if (state === 'HOLD') {
      // Progress bar fill
      const pct = Math.min(100, (elapsed / HOLD_DURATION) * 100);
      if (progressBarEls[currentIndex]) {
        progressBarEls[currentIndex].style.width = pct + '%';
      }

      if (elapsed >= HOLD_DURATION) {
        // Start morph to next role
        targetIndex = (currentIndex + 1) % ROLES.length;

        if (lowPerformance) {
          setVisibleRole(targetIndex, true);
          stateStartTime = now;
        } else if (isLoaded && rolePoints[currentIndex] && rolePoints[targetIndex]) {
          state = 'MORPH';
          stateStartTime = now;
          if (canvasEl) canvasEl.style.opacity = '1';
          screenshotImgs[currentIndex].classList.remove('active');
          if (progressBarEls[currentIndex]) progressBarEls[currentIndex].style.width = '0%';
          setTabActiveVisual(targetIndex);
        } else {
          setVisibleRole(targetIndex, true);
          stateStartTime = now;
        }
      }
    } else if (state === 'MORPH') {
      const morphProgress = Math.min(1, elapsed / MORPH_DURATION);
      renderMorphFrame(morphProgress);

      // Near completion, reveal target image underneath
      if (morphProgress >= 0.85) {
        screenshotImgs[targetIndex].classList.add('active');
      }

      if (morphProgress >= 1) {
        // Complete morph
        state = 'HOLD';
        stateStartTime = now;
        setVisibleRole(targetIndex, true);
        if (canvasEl) {
          canvasEl.style.opacity = '0';
          if (ctx) ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        }
      }
    }

    animFrameId = requestAnimationFrame(loop);
  }

  function setTabActiveVisual(idx) {
    tabButtons.forEach((tab, i) => {
      const active = i === idx;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    if (captionEl) {
      captionEl.textContent = ROLES[idx].caption;
    }
  }

  function renderMorphFrame(progress) {
    if (!ctx) return;
    ctx.clearRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

    const fromPts = rolePoints[currentIndex] || [];
    const toPts = rolePoints[targetIndex] || [];
    const count = Math.min(fromPts.length, toPts.length);

    for (let i = 0; i < count; i++) {
      const p0 = fromPts[i];
      const p1 = toPts[i];

      // Staggered arrival: normalized delay based on x position
      const stagger = (p0.x / LOGICAL_WIDTH) * 0.25 + (((i * 13) % 100) / 1000);
      let localT = (progress - stagger) / (1 - 0.25);
      if (localT < 0) localT = 0;
      if (localT > 1) localT = 1;

      const easeT = easeInOutCubic(localT);

      // Curved trajectory offset
      const arc = Math.sin(easeT * Math.PI) * (((i * 29) % 36) - 18);
      const x = (1 - easeT) * p0.x + easeT * p1.x;
      const y = (1 - easeT) * p0.y + easeT * p1.y + arc;

      // Color interpolation
      const r = Math.round((1 - easeT) * p0.r + easeT * p1.r);
      const g = Math.round((1 - easeT) * p0.g + easeT * p1.g);
      const b = Math.round((1 - easeT) * p0.b + easeT * p1.b);

      const rad = 1.35 + 0.45 * Math.sin(easeT * Math.PI);

      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }

  function init() {
    sectionEl = document.getElementById('product-showcase');
    stageEl = document.getElementById('portalStage');
    canvasEl = document.getElementById('portalMorphCanvas');
    captionEl = document.getElementById('portalCaption');
    pauseBtnEl = document.getElementById('portalPauseBtn');

    if (!sectionEl || !stageEl) return;

    ctx = canvasEl ? canvasEl.getContext('2d', { alpha: true }) : null;
    screenshotImgs = Array.from(stageEl.querySelectorAll('.portal-screenshot'));
    tabButtons = Array.from(document.querySelectorAll('.portal-tab'));
    progressBarEls = Array.from(document.querySelectorAll('.portal-tab-progress-bar'));

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas, { passive: true });

    // Tabs setup
    tabButtons.forEach((tab, idx) => {
      tab.addEventListener('click', () => jumpToRole(idx));
      tab.addEventListener('keydown', (e) => {
        let newIdx = idx;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          newIdx = (idx + 1) % tabButtons.length;
          e.preventDefault();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          newIdx = (idx - 1 + tabButtons.length) % tabButtons.length;
          e.preventDefault();
        }
        if (newIdx !== idx) {
          tabButtons[newIdx].focus();
          jumpToRole(newIdx);
        }
      });
    });

    if (pauseBtnEl) {
      pauseBtnEl.addEventListener('click', togglePause);
      updatePauseButtonUI();
    }

    // Reduced motion behavior
    if (prefersReduced) {
      isPaused = true;
      if (canvasEl) canvasEl.style.display = 'none';
      setVisibleRole(0, true);
      return;
    }

    // Lazy load & IntersectionObserver (>=40% view to autoplay)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          inView = true;
          if (!isLoaded) {
            preloadAndSample().then(() => {
              if (inView && !isPaused && !animFrameId) {
                stateStartTime = performance.now();
                animFrameId = requestAnimationFrame(loop);
              }
            });
          } else if (!isPaused && !animFrameId) {
            stateStartTime = performance.now();
            animFrameId = requestAnimationFrame(loop);
          }
        } else {
          inView = false;
        }
      });
    }, { threshold: 0.4 });

    observer.observe(stageEl);

    // Tab visibility handling
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        inView = false;
      } else {
        const rect = stageEl.getBoundingClientRect();
        const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
        inView = visibleHeight / rect.height >= 0.4;
        if (inView && !isPaused && !animFrameId) {
          stateStartTime = performance.now();
          animFrameId = requestAnimationFrame(loop);
        }
      }
    });

    setVisibleRole(0, true);
    isInitialized = true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.HavilahPortalMorph = {
    jumpToRole,
    togglePause,
    ROLES,
  };
})();
