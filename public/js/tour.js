/**
 * Havilah Interactive Tour System
 * A lightweight, zero-dependency guided-tour library
 * 
 * Usage:
 *   HavilahTour.init({
 *     tourId: 'landing-page',
 *     welcomeTitle: 'Welcome to Havilah!',
 *     welcomeDesc: 'Take a quick tour to learn how the platform works.',
 *     steps: [
 *       { target: '#hero', title: 'Hero Section', description: '...', placement: 'bottom' },
 *       ...
 *     ]
 *   });
 */

(function(root) {
  'use strict';

  const STORAGE_PREFIX = 'havilah_tour_';

  // ──── State ─────────────────────────────────────
  let currentConfig = null;
  let currentStep = 0;
  let isActive = false;
  let elements = {};

  function markTourSeen(tourId) {
    const id = tourId || currentConfig?.tourId;
    if (id) {
      try {
        localStorage.setItem(STORAGE_PREFIX + id + '_seen', 'true');
      } catch(e) {}
    }
  }

  // ──── DOM Builders ──────────────────────────────
  function createOverlay() {
    // Remove any existing tour elements
    cleanup();

    // Overlay container
    const overlay = document.createElement('div');
    overlay.className = 'tour-overlay';
    overlay.id = 'tourOverlay';

    // Spotlight (box-shadow cutout)
    const spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    spotlight.id = 'tourSpotlight';
    spotlight.style.display = 'none';

    // Click on overlay (outside spotlight) → skip
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) {
        // Don't close, just ignore
      }
    });

    // Tooltip
    const tooltip = document.createElement('div');
    tooltip.className = 'tour-tooltip';
    tooltip.id = 'tourTooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'false');

    tooltip.innerHTML = `
      <div class="tour-tooltip-arrow" id="tourArrow"></div>
      <div class="tour-tooltip-header">
        <div class="tour-tooltip-step">
          <span class="tour-tooltip-step-icon" id="tourStepNum">1</span>
          <span id="tourStepLabel">Step 1 of 5</span>
        </div>
        <button class="tour-tooltip-close" id="tourCloseBtn" aria-label="Close tour">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="tour-tooltip-body">
        <div class="tour-tooltip-title" id="tourTitle"></div>
        <div class="tour-tooltip-desc" id="tourDesc"></div>
      </div>
      <div class="tour-tooltip-footer">
        <div class="tour-progress" id="tourProgress"></div>
        <div class="tour-tooltip-actions" id="tourActions"></div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(spotlight);
    document.body.appendChild(tooltip);

    elements = {
      overlay,
      spotlight,
      tooltip,
      stepNum: tooltip.querySelector('#tourStepNum'),
      stepLabel: tooltip.querySelector('#tourStepLabel'),
      closeBtn: tooltip.querySelector('#tourCloseBtn'),
      title: tooltip.querySelector('#tourTitle'),
      desc: tooltip.querySelector('#tourDesc'),
      progress: tooltip.querySelector('#tourProgress'),
      actions: tooltip.querySelector('#tourActions'),
      arrow: tooltip.querySelector('#tourArrow')
    };

    elements.closeBtn.addEventListener('click', endTour);
  }

  function createFAB() {
    // Remove existing FAB
    const existing = document.getElementById('tourFAB');
    if (existing) existing.remove();

    const fab = document.createElement('button');
    fab.className = 'tour-fab';
    fab.id = 'tourFAB';
    fab.setAttribute('aria-label', 'Start guided tour');
    fab.innerHTML = `
      <span class="tour-fab-label">Take a Tour</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    `;
    fab.addEventListener('click', function() {
      showWelcome();
    });
    document.body.appendChild(fab);
    elements.fab = fab;
  }

  // ──── Welcome Modal ─────────────────────────────
  function showWelcome() {
    // Remove existing welcome
    const existing = document.getElementById('tourWelcomeBackdrop');
    if (existing) existing.remove();

    const config = currentConfig;
    const backdrop = document.createElement('div');
    backdrop.className = 'tour-welcome-backdrop';
    backdrop.id = 'tourWelcomeBackdrop';

    const stepCount = config.steps.length;
    const estimatedTime = Math.max(1, Math.ceil(stepCount * 0.4));

    backdrop.innerHTML = `
      <div class="tour-welcome-card">
        <div class="tour-welcome-hero">
          <div class="tour-welcome-hero-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
            </svg>
          </div>
          <h2>${config.welcomeTitle || 'Welcome to Havilah!'}</h2>
          <p>${config.welcomeDesc || 'Take a quick guided tour to learn how everything works.'}</p>
        </div>
        <div class="tour-welcome-body">
          <ul class="tour-welcome-features">
            <li><span class="tw-icon">📍</span> <span>${stepCount} interactive stops to explore</span></li>
            <li><span class="tw-icon">⏱️</span> <span>Takes about ${estimatedTime} minute${estimatedTime > 1 ? 's' : ''} to complete</span></li>
            <li><span class="tw-icon">🔄</span> <span>Restart anytime from the ? button</span></li>
          </ul>
          <div class="tour-welcome-actions">
            <button class="tour-welcome-start" id="tourWelcomeStart">
              Start Tour
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button class="tour-welcome-skip" id="tourWelcomeSkip">Maybe later</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    // Animate in
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        backdrop.classList.add('visible');
      });
    });

    // Event listeners
    backdrop.querySelector('#tourWelcomeStart').addEventListener('click', function() {
      markTourSeen();
      backdrop.classList.remove('visible');
      setTimeout(() => {
        backdrop.remove();
        startTour();
      }, 300);
    });

    backdrop.querySelector('#tourWelcomeSkip').addEventListener('click', function() {
      markTourSeen();
      backdrop.classList.remove('visible');
      setTimeout(() => backdrop.remove(), 300);
    });

    // Click outside to dismiss
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) {
        markTourSeen();
        backdrop.classList.remove('visible');
        setTimeout(() => backdrop.remove(), 300);
      }
    });
  }

  // ──── Tour Control ──────────────────────────────
  function startTour() {
    if (!currentConfig || !currentConfig.steps.length) return;

    markTourSeen();
    currentStep = 0;
    isActive = true;

    createOverlay();

    elements.overlay.classList.add('active');

    // Hide FAB during tour
    if (elements.fab) elements.fab.style.display = 'none';

    showStep(0);

    // Keyboard navigation
    document.addEventListener('keydown', handleKeyboard);
  }

  function endTour() {
    isActive = false;
    currentStep = 0;

    if (elements.overlay) elements.overlay.classList.remove('active');
    if (elements.spotlight) elements.spotlight.style.display = 'none';
    if (elements.tooltip) {
      elements.tooltip.classList.remove('visible');
    }

    // Mark tour as seen
    markTourSeen();

    // Show FAB again
    if (elements.fab) elements.fab.style.display = '';

    document.removeEventListener('keydown', handleKeyboard);

    // Cleanup after animation
    setTimeout(cleanup, 400);
  }

  function cleanup() {
    ['tourOverlay', 'tourSpotlight', 'tourTooltip'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function nextStep() {
    if (currentStep < currentConfig.steps.length - 1) {
      currentStep++;
      showStep(currentStep);
    } else {
      endTour();
    }
  }

  function prevStep() {
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  }

  function handleKeyboard(e) {
    if (!isActive) return;
    if (e.key === 'Escape') { endTour(); e.preventDefault(); }
    if (e.key === 'ArrowRight' || e.key === 'Enter') { nextStep(); e.preventDefault(); }
    if (e.key === 'ArrowLeft') { prevStep(); e.preventDefault(); }
  }

  // ──── Step Rendering ────────────────────────────
  function showStep(index) {
    const step = currentConfig.steps[index];
    if (!step) return;

    const total = currentConfig.steps.length;

    // Try to find the target element
    let targetEl = null;
    if (step.target) {
      targetEl = document.querySelector(step.target);
    }

    // Update tooltip content
    elements.stepNum.textContent = index + 1;
    elements.stepLabel.textContent = `Step ${index + 1} of ${total}`;
    elements.title.textContent = step.title;
    elements.desc.textContent = step.description;

    // Build progress dots
    let dotsHtml = '';
    for (let i = 0; i < total; i++) {
      const cls = i === index ? 'active' : (i < index ? 'completed' : '');
      dotsHtml += `<div class="tour-progress-dot ${cls}"></div>`;
    }
    elements.progress.innerHTML = dotsHtml;

    // Build action buttons
    let actionsHtml = '';
    if (index > 0) {
      actionsHtml += `<button class="tour-btn tour-btn-prev" id="tourPrevBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        Back
      </button>`;
    }
    if (index < total - 1) {
      actionsHtml += `<button class="tour-btn tour-btn-next" id="tourNextBtn">
        Next
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>`;
    } else {
      actionsHtml += `<button class="tour-btn tour-btn-finish" id="tourNextBtn">
        Finish Tour ✨
      </button>`;
    }
    elements.actions.innerHTML = actionsHtml;

    // Attach button listeners
    const prevBtn = elements.actions.querySelector('#tourPrevBtn');
    const nextBtn = elements.actions.querySelector('#tourNextBtn');
    if (prevBtn) prevBtn.addEventListener('click', prevStep);
    if (nextBtn) nextBtn.addEventListener('click', nextStep);

    // Position spotlight and tooltip
    if (targetEl) {
      positionSpotlight(targetEl);
      positionTooltip(targetEl, step.placement || 'bottom');

      // Scroll target into view if needed
      const rect = targetEl.getBoundingClientRect();
      if (rect.top < 80 || rect.bottom > window.innerHeight - 80) {
        targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Re-position after scroll
        setTimeout(() => {
          positionSpotlight(targetEl);
          positionTooltip(targetEl, step.placement || 'bottom');
        }, 500);
      }
    } else {
      // No target — center tooltip on screen
      elements.spotlight.style.display = 'none';
      centerTooltip();
    }

    // Animate tooltip in
    elements.tooltip.classList.remove('visible');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        elements.tooltip.classList.add('visible');
      });
    });
  }

  function positionSpotlight(el) {
    const rect = el.getBoundingClientRect();
    const pad = 8;

    elements.spotlight.style.display = 'block';
    elements.spotlight.style.top = (rect.top - pad) + 'px';
    elements.spotlight.style.left = (rect.left - pad) + 'px';
    elements.spotlight.style.width = (rect.width + pad * 2) + 'px';
    elements.spotlight.style.height = (rect.height + pad * 2) + 'px';
  }

  function positionTooltip(el, placement) {
    const rect = el.getBoundingClientRect();
    const tooltip = elements.tooltip;
    const arrow = elements.arrow;
    const gap = 16;

    tooltip.setAttribute('data-placement', placement);
    tooltip.style.transition = 'none';
    tooltip.style.left = '-9999px';
    tooltip.style.top = '-9999px';
    tooltip.classList.add('visible');

    // Force layout
    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    let top, left;

    switch(placement) {
      case 'bottom':
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (tw / 2);
        break;
      case 'top':
        top = rect.top - th - gap;
        left = rect.left + (rect.width / 2) - (tw / 2);
        break;
      case 'left':
        top = rect.top + (rect.height / 2) - (th / 2);
        left = rect.left - tw - gap;
        break;
      case 'right':
        top = rect.top + (rect.height / 2) - (th / 2);
        left = rect.right + gap;
        break;
      default:
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (tw / 2);
    }

    // Clamp to viewport
    const margin = 12;
    if (left < margin) left = margin;
    if (left + tw > window.innerWidth - margin) left = window.innerWidth - tw - margin;
    if (top < margin) top = margin;
    if (top + th > window.innerHeight - margin) {
      // If tooltip goes off bottom, try placing it above
      if (placement === 'bottom') {
        top = rect.top - th - gap;
        tooltip.setAttribute('data-placement', 'top');
      }
    }
    if (top < margin) top = margin;

    tooltip.style.transition = '';
    tooltip.style.top = top + 'px';
    tooltip.style.left = left + 'px';
  }

  function centerTooltip() {
    const tooltip = elements.tooltip;
    tooltip.setAttribute('data-placement', 'center');
    elements.arrow.style.display = 'none';

    const tw = tooltip.offsetWidth;
    const th = tooltip.offsetHeight;

    tooltip.style.top = (window.innerHeight / 2 - th / 2) + 'px';
    tooltip.style.left = (window.innerWidth / 2 - tw / 2) + 'px';
  }

  // ──── Reposition on scroll/resize ───────────────
  function handleReposition() {
    if (!isActive || !currentConfig) return;
    const step = currentConfig.steps[currentStep];
    if (!step || !step.target) return;
    const targetEl = document.querySelector(step.target);
    if (!targetEl) return;
    positionSpotlight(targetEl);
    positionTooltip(targetEl, step.placement || 'bottom');
  }

  // Debounced reposition
  let repositionTimer = null;
  function debouncedReposition() {
    if (repositionTimer) clearTimeout(repositionTimer);
    repositionTimer = setTimeout(handleReposition, 100);
  }

  window.addEventListener('scroll', debouncedReposition, { passive: true });
  window.addEventListener('resize', debouncedReposition, { passive: true });

  // ──── Public API ────────────────────────────────
  root.HavilahTour = {
    /**
     * Initialize a tour configuration. Optionally auto-show for first-time visitors.
     * @param {Object} config
     * @param {string} config.tourId - Unique ID for this tour
     * @param {string} config.welcomeTitle - Title for the welcome modal
     * @param {string} config.welcomeDesc - Description for the welcome modal
     * @param {boolean} config.autoStart - Auto-show welcome on first visit (default: true)
     * @param {Array} config.steps - Array of step objects
     * @param {string} config.steps[].target - CSS selector for the target element
     * @param {string} config.steps[].title - Step title
     * @param {string} config.steps[].description - Step description
     * @param {string} config.steps[].placement - Tooltip placement: top|bottom|left|right
     */
    init: function(config) {
      currentConfig = config;

      // Create the FAB button
      createFAB();

      // Auto-start for first-time visitors only
      const autoStart = config.autoStart !== false;
      if (autoStart) {
        try {
          const seenKey = STORAGE_PREFIX + config.tourId + '_seen';
          const seen = localStorage.getItem(seenKey);
          if (!seen) {
            // Immediately mark as seen so refreshing or reloading will NEVER re-trigger the auto-popup
            localStorage.setItem(seenKey, 'true');
            // Delay to let page settle
            setTimeout(() => showWelcome(), 1200);
          }
        } catch(e) {
          // localStorage not available
        }
      }
    },

    /** Manually start the tour */
    start: function() {
      if (currentConfig) showWelcome();
    },

    /** Force start without welcome */
    startDirect: function() {
      if (currentConfig) startTour();
    },

    /** End the tour */
    end: endTour,

    /** Jump to specific step */
    goTo: function(index) {
      if (currentConfig && index >= 0 && index < currentConfig.steps.length) {
        if (!isActive) startTour();
        currentStep = index;
        showStep(index);
      }
    },

    /** Check if tour has been seen */
    isSeen: function(tourId) {
      try {
        return localStorage.getItem(STORAGE_PREFIX + (tourId || currentConfig?.tourId) + '_seen') === 'true';
      } catch(e) {
        return false;
      }
    },

    /** Reset tour seen status */
    reset: function(tourId) {
      try {
        localStorage.removeItem(STORAGE_PREFIX + (tourId || currentConfig?.tourId) + '_seen');
      } catch(e) {}
    }
  };

})(window);
