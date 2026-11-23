(function (global) {
  'use strict';

  var LOADER_CSS_HREF = '/css/loader.css';
  var BRAND_MARK_SRC = '/assets/havilah-mark.svg';
  var VALID_VARIANTS = { fullscreen: true, section: true, button: true };

  var fullscreenEl = null;
  var fullscreenHideTimer = null;
  var fullscreenMaxTimer = null;

  function escapeHtml(val) {
    return String(val == null ? '' : val)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function ensureStylesheet() {
    if (typeof document === 'undefined' || !document.head) return;
    var links = document.querySelectorAll('link[rel="stylesheet"]');
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      if (href.indexOf('loader.css') !== -1) return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = LOADER_CSS_HREF;
    document.head.appendChild(link);
  }

  function normalizeVariant(variant) {
    var v = String(variant || 'section').toLowerCase();
    return VALID_VARIANTS[v] ? v : 'section';
  }

  function normalizeSurface(surface) {
    return String(surface || 'light').toLowerCase() === 'dark' ? 'dark' : 'light';
  }

  function render(options) {
    ensureStylesheet();
    var opts = options || {};
    var v = normalizeVariant(opts.variant);
    var surface = normalizeSurface(opts.surface);
    var label = opts.label ? String(opts.label) : '';
    var sublabel = opts.sublabel ? String(opts.sublabel) : '';
    var srText = opts.srText ? String(opts.srText) : (label || 'Loading...');
    var inlinePreview = Boolean(opts.inlinePreview);

    var classes = [
      'havilah-loader',
      'havilah-loader--' + v
    ];
    if (surface === 'dark') classes.push('havilah-loader--dark');
    if (inlinePreview) classes.push('havilah-loader--inline-preview');

    var busyAttr = v === 'fullscreen' ? ' aria-busy="true"' : '';
    var ring2Html = v !== 'button'
      ? '<span class="havilah-loader__ring havilah-loader__ring--2"></span>'
      : '';

    var copyHtml = '';
    if (v !== 'button' && (label || sublabel)) {
      copyHtml =
        '<div class="havilah-loader__copy">' +
        (label ? '<p class="havilah-loader__label">' + escapeHtml(label) + '</p>' : '') +
        (sublabel ? '<p class="havilah-loader__sublabel">' + escapeHtml(sublabel) + '</p>' : '') +
        '</div>';
    }

    return (
      '<div class="' + classes.join(' ') + '" role="status" aria-live="polite"' + busyAttr + '>' +
        '<span class="havilah-loader__stage" aria-hidden="true">' +
          '<span class="havilah-loader__ring havilah-loader__ring--1"></span>' +
          ring2Html +
          '<span class="havilah-loader__halo">' +
            '<img class="havilah-loader__mark" src="' + BRAND_MARK_SRC + '" alt="" decoding="async">' +
          '</span>' +
        '</span>' +
        copyHtml +
        '<span class="havilah-sr-only">' + escapeHtml(srText) + '</span>' +
      '</div>'
    );
  }

  function create(options) {
    ensureStylesheet();
    var opts = options || {};
    var el = document.createElement('havilah-loader');
    if (opts.variant) el.setAttribute('variant', normalizeVariant(opts.variant));
    if (opts.label) el.setAttribute('label', String(opts.label));
    if (opts.sublabel) el.setAttribute('sublabel', String(opts.sublabel));
    if (opts.surface) el.setAttribute('surface', normalizeSurface(opts.surface));
    if (opts.srText) el.setAttribute('sr-text', String(opts.srText));
    if (opts.inlinePreview) el.setAttribute('inline-preview', 'true');
    return el;
  }

  function clearFullscreenTimers() {
    if (fullscreenHideTimer) {
      clearTimeout(fullscreenHideTimer);
      fullscreenHideTimer = null;
    }
    if (fullscreenMaxTimer) {
      clearTimeout(fullscreenMaxTimer);
      fullscreenMaxTimer = null;
    }
  }

  function showFullscreen(options) {
    ensureStylesheet();
    if (typeof document === 'undefined' || !document.body) return null;
    clearFullscreenTimers();

    var opts = options || {};
    var surface = opts.surface;
    if (!surface && document.documentElement) {
      surface = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    }

    var markup = render({
      variant: 'fullscreen',
      label: opts.label || 'Preparing your workspace',
      sublabel: opts.sublabel || '',
      surface: surface || 'light',
      srText: opts.srText || opts.label || 'Loading...'
    });

    if (!fullscreenEl) {
      fullscreenEl = document.createElement('div');
      fullscreenEl.id = 'havilahFullscreenOverlay';
      document.body.appendChild(fullscreenEl);
    } else if (!fullscreenEl.parentNode) {
      document.body.appendChild(fullscreenEl);
    }

    fullscreenEl.innerHTML = markup;
    var inner = fullscreenEl.firstElementChild;
    if (inner) {
      inner.classList.remove('havilah-loader--leaving');
    }

    var maxMs = Number(opts.maxMs);
    if (isFinite(maxMs) && maxMs > 0) {
      fullscreenMaxTimer = setTimeout(function () {
        hideFullscreen();
      }, maxMs);
    }

    return fullscreenEl;
  }

  function hideFullscreen() {
    clearFullscreenTimers();
    if (!fullscreenEl) return;
    var overlay = fullscreenEl;
    var inner = overlay.firstElementChild;
    if (inner) {
      inner.classList.add('havilah-loader--leaving');
    }
    fullscreenHideTimer = setTimeout(function () {
      fullscreenHideTimer = null;
      if (overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
      if (fullscreenEl === overlay) {
        fullscreenEl = null;
      }
    }, 240);
  }

  function setButtonLoading(btn, isLoading, loadingText, options) {
    if (!btn) return;
    ensureStylesheet();

    if (isLoading) {
      var textStr = typeof loadingText === 'string' ? loadingText : '';
      if (btn.dataset.hlLoading === '1') {
        var existingTextEl = btn.querySelector('.hl-btn-active-text');
        if (existingTextEl && textStr) {
          existingTextEl.textContent = textStr;
        }
        var existingSr = btn.querySelector('.havilah-sr-only');
        if (existingSr && textStr) {
          existingSr.textContent = textStr;
        }
        return;
      }

      var rect = typeof btn.getBoundingClientRect === 'function'
        ? btn.getBoundingClientRect()
        : { width: 0, height: 0 };

      btn.dataset.hlOrigHtml = btn.innerHTML;
      btn.dataset.hlOrigMinW = btn.style.minWidth || '';
      btn.dataset.hlOrigMinH = btn.style.minHeight || '';
      btn.dataset.hlLoading = '1';

      if (rect.width > 0) {
        btn.style.minWidth = rect.width.toFixed(2) + 'px';
      }
      if (rect.height > 0) {
        btn.style.minHeight = rect.height.toFixed(2) + 'px';
      }

      var explicitSurface = options && options.surface ? normalizeSurface(options.surface) : '';
      var isDark = explicitSurface === 'dark' ||
        (!explicitSurface && (
          btn.classList.contains('btn-primary') ||
          btn.classList.contains('btn-destructive-solid') ||
          Boolean(btn.closest('[data-surface="dark"], [data-theme="dark"], .hl-dark'))
        ));

      var canShowText = Boolean(textStr) && (rect.width === 0 || rect.width >= (textStr.length * 7.6 + 52));
      var loaderHtml = render({
        variant: 'button',
        surface: isDark ? 'dark' : 'light',
        srText: textStr || 'Loading...'
      });

      btn.disabled = true;
      btn.setAttribute('aria-busy', 'true');
      btn.classList.add('hl-btn-is-loading');

      btn.innerHTML =
        '<span class="hl-btn-idle-measure" aria-hidden="true">' + btn.dataset.hlOrigHtml + '</span>' +
        '<span class="hl-btn-active-indicator">' +
          loaderHtml +
          (canShowText ? '<span class="hl-btn-active-text">' + escapeHtml(textStr) + '</span>' : '') +
        '</span>';
      return;
    }

    var replacementIdleHtml = typeof loadingText === 'string' && loadingText.length > 0
      ? loadingText
      : (btn.dataset.hlOrigHtml !== undefined ? btn.dataset.hlOrigHtml : null);

    if (replacementIdleHtml !== null) {
      btn.innerHTML = replacementIdleHtml;
    }

    if (btn.dataset.hlOrigMinW !== undefined) {
      btn.style.minWidth = btn.dataset.hlOrigMinW;
    }
    if (btn.dataset.hlOrigMinH !== undefined) {
      btn.style.minHeight = btn.dataset.hlOrigMinH;
    }

    delete btn.dataset.hlLoading;
    delete btn.dataset.hlOrigHtml;
    delete btn.dataset.hlOrigMinW;
    delete btn.dataset.hlOrigMinH;

    btn.classList.remove('hl-btn-is-loading');
    btn.disabled = false;
    btn.removeAttribute('aria-busy');
  }

  if (typeof HTMLElement !== 'undefined' && typeof customElements !== 'undefined') {
    if (!customElements.get('havilah-loader')) {
      var HavilahLoaderElement = function () {
        return Reflect.construct(HTMLElement, [], HavilahLoaderElement);
      };
      HavilahLoaderElement.prototype = Object.create(HTMLElement.prototype);
      HavilahLoaderElement.prototype.constructor = HavilahLoaderElement;
      HavilahLoaderElement.observedAttributes = [
        'variant',
        'label',
        'sublabel',
        'surface',
        'sr-text',
        'inline-preview'
      ];

      HavilahLoaderElement.prototype.connectedCallback = function () {
        ensureStylesheet();
        this._renderLoader();
      };

      HavilahLoaderElement.prototype.attributeChangedCallback = function () {
        if (this.isConnected) {
          this._renderLoader();
        }
      };

      HavilahLoaderElement.prototype._renderLoader = function () {
        var inlineAttr = this.getAttribute('inline-preview');
        var isInlinePreview = inlineAttr !== null && inlineAttr !== 'false' && inlineAttr !== '0';
        this.innerHTML = render({
          variant: this.getAttribute('variant') || 'section',
          label: this.getAttribute('label') || '',
          sublabel: this.getAttribute('sublabel') || '',
          surface: this.getAttribute('surface') || 'light',
          srText: this.getAttribute('sr-text') || '',
          inlinePreview: isInlinePreview
        });
      };

      customElements.define('havilah-loader', HavilahLoaderElement);
    }
  }

  ensureStylesheet();

  global.HavilahLoader = {
    BRAND_MARK_SRC: BRAND_MARK_SRC,
    ensureStylesheet: ensureStylesheet,
    render: render,
    create: create,
    showFullscreen: showFullscreen,
    hideFullscreen: hideFullscreen,
    setButtonLoading: setButtonLoading
  };
})(typeof window !== 'undefined' ? window : globalThis);
