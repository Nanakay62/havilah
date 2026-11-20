/**
 * @fileoverview pdfFonts.js
 * Offline-first TrueType font loader for jsPDF VFS embedding.
 * Embeds Inter (Regular, SemiBold, Bold) for body/UI and
 * Source Serif 4 (Regular, Italic) for formal clinical certificates.
 * Works identically in browsers (fetch + in-memory cache) and Node (fs).
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HavilahPdfFonts = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FONT_MANIFEST = [
    { file: 'Inter-Regular.ttf', family: 'Inter', style: 'normal', url: '/assets/fonts/pdf/Inter-Regular.ttf' },
    { file: 'Inter-SemiBold.ttf', family: 'Inter', style: 'semibold', url: '/assets/fonts/pdf/Inter-SemiBold.ttf' },
    { file: 'Inter-Bold.ttf', family: 'Inter', style: 'bold', url: '/assets/fonts/pdf/Inter-Bold.ttf' },
    { file: 'SourceSerif4-Regular.ttf', family: 'SourceSerif4', style: 'normal', url: '/assets/fonts/pdf/SourceSerif4-Regular.ttf' },
    { file: 'SourceSerif4-Italic.ttf', family: 'SourceSerif4', style: 'italic', url: '/assets/fonts/pdf/SourceSerif4-Italic.ttf' }
  ];

  const base64Cache = {};

  function arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    const chunkSize = 0x8000;
    let binary = '';
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  }

  async function fetchFontBase64(entry) {
    if (base64Cache[entry.file]) return base64Cache[entry.file];

    // Node.js environment (automated tests & verification scripts)
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function') {
      try {
        const fs = require('fs');
        const path = require('path');
        const localPath = path.resolve(__dirname, '../../assets/fonts/pdf', entry.file);
        if (fs.existsSync(localPath)) {
          const b64 = fs.readFileSync(localPath).toString('base64');
          base64Cache[entry.file] = b64;
          return b64;
        }
      } catch (e) {
        // Fall through
      }
    }

    // Browser environment (offline-first local static asset)
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(entry.url, { cache: 'force-cache' });
        if (!res.ok) return null;
        const buf = await res.arrayBuffer();
        const b64 = arrayBufferToBase64(buf);
        base64Cache[entry.file] = b64;
        return b64;
      } catch (e) {
        return null;
      }
    }

    return null;
  }

  /**
   * Register and embed Inter + Source Serif 4 into a jsPDF instance.
   * Returns resolved family names so callers always have valid font identifiers.
   */
  async function registerFonts(pdf, options = {}) {
    const includeSerif = Boolean(options.includeSerif);
    const targets = includeSerif
      ? FONT_MANIFEST
      : FONT_MANIFEST.filter((f) => f.family === 'Inter');

    const loaded = await Promise.all(targets.map(async (entry) => ({
      entry,
      b64: await fetchFontBase64(entry)
    })));

    let hasInter = false;
    let hasInterSemiBold = false;
    let hasSerif = false;

    for (const item of loaded) {
      if (!item.b64) continue;
      const { entry, b64 } = item;
      try {
        pdf.addFileToVFS(entry.file, b64);
        pdf.addFont(entry.file, entry.family, entry.style);
        if (entry.family === 'Inter' && entry.style === 'normal') hasInter = true;
        if (entry.family === 'Inter' && entry.style === 'semibold') hasInterSemiBold = true;
        if (entry.family === 'SourceSerif4' && entry.style === 'normal') hasSerif = true;
      } catch (err) {
        // Ignore individual registration failure and fall back gracefully
      }
    }

    return {
      sans: hasInter ? 'Inter' : 'helvetica',
      semiboldStyle: hasInter && hasInterSemiBold ? 'semibold' : 'bold',
      serif: hasSerif ? 'SourceSerif4' : 'times',
      embedded: hasInter
    };
  }

  return {
    FONT_MANIFEST,
    registerFonts
  };
}));
