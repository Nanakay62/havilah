(function() {
  'use strict';
  const K = 5, GROUPS = 7, INTERVAL = 2600, FADE = 400;
  const parseRgb = (s, fb) => {
    const m = s && s.match(/\d+/g);
    return m && m.length >= 3 ? [+m[0], +m[1], +m[2]] : fb;
  };

  function init() {
    const canvas = document.getElementById('heroAnonymityCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cs = getComputedStyle(document.documentElement);
    const brand = parseRgb(cs.getPropertyValue('--brand'), [15, 118, 110]);
    const grey = parseRgb(cs.getPropertyValue('--text-subtle') || cs.getPropertyValue('--text-muted'), [100, 116, 139]);
    const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

    let w = 0, h = 0, dpr = 1, dots = [], groups = [];
    let running = false, rafId = null, lastT = 0, timer = 0, frames = 0, fTime = 0, throttled = false;

    function reset() {
      groups = [];
      const m = 44, cols = 3, rows = 2.4;
      for (let i = 0; i < GROUPS; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        groups.push({
          x: m + ((w - m * 2) / cols) * (c + 0.5) + (Math.random() - 0.5) * 20,
          y: m + ((h - m * 2) / rows) * (r + 0.5) + (Math.random() - 0.5) * 16,
          vx: (Math.random() - 0.5) * 0.1, vy: (Math.random() - 0.5) * 0.1,
          tealAlpha: 0, dots: []
        });
      }

      dots = [];
      const total = innerWidth < 640 ? 24 : 30;
      const counts = total === 24 ? [5, 3, 2, 5, 3, 3, 3] : [6, 4, 3, 5, 4, 4, 4];
      let gIdx = 0, inG = 0;

      for (let i = 0; i < total; i++) {
        if (inG >= counts[gIdx] && gIdx < GROUPS - 1) { gIdx++; inG = 0; }
        const grp = groups[gIdx];
        const a = Math.random() * 6.28, d = 12 + Math.random() * 22;
        const tx = grp.x + Math.cos(a) * d, ty = grp.y + Math.sin(a) * d;
        const dot = { x: tx, y: ty, tx, ty, sx: tx, sy: ty, g: gIdx, jOff: Math.random() * 6.28, jSpd: 0.8 + Math.random() * 0.5, m: false, p: 1 };
        grp.dots.push(dot); dots.push(dot); inG++;
      }
      groups.forEach(g => { g.tealAlpha = g.dots.length >= K ? 1 : 0; });
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      reset();
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || throttled) render();
    }

    function migrate() {
      if (!dots.length) return;
      const d = dots[Math.floor(Math.random() * dots.length)], oldG = d.g;
      let newG = Math.floor(Math.random() * (GROUPS - 1));
      if (newG >= oldG) newG++;
      const oldDots = groups[oldG].dots;
      oldDots.splice(oldDots.indexOf(d), 1);
      groups[newG].dots.push(d);
      d.g = newG; d.sx = d.x; d.sy = d.y;
      const a = Math.random() * 6.28;
      d.tx = groups[newG].x + Math.cos(a) * (12 + Math.random() * 20);
      d.ty = groups[newG].y + Math.sin(a) * (12 + Math.random() * 20);
      d.m = true; d.p = 0;
    }

    function update(dt) {
      timer += dt;
      if (timer >= INTERVAL) { timer = 0; migrate(); }

      const m = 36;
      for (let i = 0; i < GROUPS; i++) {
        const g = groups[i];
        g.x += g.vx; g.y += g.vy;
        if (g.x < m || g.x > w - m) g.vx *= -1;
        if (g.y < m || g.y > h - m) g.vy *= -1;
        const target = g.dots.length >= K ? 1 : 0, step = dt / FADE;
        if (g.tealAlpha < target) g.tealAlpha = Math.min(target, g.tealAlpha + step);
        else if (g.tealAlpha > target) g.tealAlpha = Math.max(target, g.tealAlpha - step);
      }

      const now = performance.now() * 0.001;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i], grp = groups[d.g];
        if (d.m) {
          d.p += dt / 600;
          if (d.p >= 1) { d.p = 1; d.m = false; }
          const t = d.p, ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
          d.x = d.sx + (d.tx - d.sx) * ease;
          d.y = d.sy + (d.ty - d.sy) * ease;
        } else {
          const a = d.jOff + now * d.jSpd, dist = 14 + (i % 5) * 3;
          d.x += (grp.x + Math.cos(a) * dist - d.x) * 0.08;
          d.y += (grp.y + Math.sin(a) * dist - d.y) * 0.08;
        }
      }
    }

    function render() {
      ctx.clearRect(0, 0, w, h);
      for (let i = 0; i < GROUPS; i++) {
        const g = groups[i], al = g.tealAlpha;
        if (al > 0.01 && g.dots.length) {
          let maxD = 24;
          for (let j = 0; j < g.dots.length; j++) {
            maxD = Math.max(maxD, Math.hypot(g.dots[j].x - g.x, g.dots[j].y - g.dots[j].y));
          }
          const r = maxD + 10;
          ctx.beginPath();
          ctx.arc(g.x, g.y, r, 0, 6.28);
          ctx.fillStyle = rgba(brand, 0.05 * al);
          ctx.fill();
          ctx.strokeStyle = rgba(brand, 0.22 * al);
          ctx.lineWidth = 1; ctx.stroke();

          ctx.strokeStyle = rgba(brand, 0.16 * al);
          for (let j = 0; j < g.dots.length; j++) {
            for (let k = j + 1; k < g.dots.length; k++) {
              if (Math.hypot(g.dots[j].x - g.dots[k].x, g.dots[j].y - g.dots[k].y) < 70) {
                ctx.beginPath(); ctx.moveTo(g.dots[j].x, g.dots[j].y); ctx.lineTo(g.dots[k].x, g.dots[k].y); ctx.stroke();
              }
            }
          }
          ctx.fillStyle = rgba(brand, al * 0.95);
          ctx.fillText(`Group of ${g.dots.length}`, g.x, g.y - r - 3);
        }
      }

      for (let i = 0; i < dots.length; i++) {
        const d = dots[i], al = groups[d.g].tealAlpha;
        const cr = Math.round(grey[0] + (brand[0] - grey[0]) * al);
        const cg = Math.round(grey[1] + (brand[1] - grey[1]) * al);
        const cb = Math.round(grey[2] + (brand[2] - grey[2]) * al);
        ctx.beginPath(); ctx.arc(d.x, d.y, 4, 0, 6.28);
        ctx.fillStyle = `rgb(${cr},${cg},${cb})`; ctx.fill();
        ctx.strokeStyle = al > 0.5 ? rgba(brand, 0.4) : 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1; ctx.stroke();
      }
    }

    function animate(t) {
      if (!running) return;
      if (!lastT) lastT = t;
      const dt = Math.min(t - lastT, 100); lastT = t;
      if (frames < 60) {
        frames++; fTime += dt;
        if (frames === 60 && fTime / 60 > 32) { throttled = true; stop(); render(); return; }
      }
      update(dt); render(); rafId = requestAnimationFrame(animate);
    }

    function start() {
      if (running || throttled) return;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) { render(); return; }
      running = true; lastT = 0; rafId = requestAnimationFrame(animate);
    }

    function stop() {
      if (!running) return;
      running = false;
      if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    }

    new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting && !document.hidden) start();
        else if (!e.isIntersecting) stop();
      });
    }, { threshold: 0.1 }).observe(canvas);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop();
      else {
        const r = canvas.getBoundingClientRect();
        if (r.top < innerHeight && r.bottom > 0) start();
      }
    });

    let rt = null;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 150); });
    resize(); start();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
