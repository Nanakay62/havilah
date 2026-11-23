/**
 * @fileoverview pdfComponents.js
 * Reusable clinical-grade layout components for all Havilah PDFs.
 * Enforces A4 portrait, 18 mm margins, 12-column grid, 4 pt baseline rhythm,
 * neutral ink + grays + single deep teal accent (#0F6E6E), muted score bands,
 * zebra-free rule-separated tables, and offline vector QR codes.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./pdfConfig'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./pdfConfig'));
  } else {
    root.HavilahPdfComponents = factory(root.HavilahPdfConfig);
  }
}(typeof self !== 'undefined' ? self : this, function (Config) {
  'use strict';

  const { PAGE, COLORS, SCORE_BANDS, TYPE, COPY, getScoreBand, gridCol, r } = Config;

  let cachedLogoDataUrl = null;
  const imageCache = {};

  /**
   * Load /assets/havilah-mark.svg as a crisp transparent PNG data URL (browser only).
   */
  async function loadHavilahLogoDataUrl() {
    if (cachedLogoDataUrl) return cachedLogoDataUrl;
    if (typeof document === 'undefined' || typeof Image === 'undefined') return null;

    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const timeoutId = setTimeout(() => resolve(null), 2500);

      img.onload = () => {
        clearTimeout(timeoutId);
        try {
          const canvas = document.createElement('canvas');
          canvas.width = 280;
          canvas.height = 215;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          cachedLogoDataUrl = canvas.toDataURL('image/png');
          resolve(cachedLogoDataUrl);
        } catch (err) {
          resolve(null);
        }
      };

      img.onerror = () => {
        clearTimeout(timeoutId);
        resolve(null);
      };

      img.src = '/assets/havilah-mark.svg';
    });
  }

  /**
   * Load a PNG/JPEG image URL or data URL into a base64 data URL (browser or Node).
   */
  async function loadImageAsDataUrl(src) {
    if (!src || typeof src !== 'string') return null;
    if (src.startsWith('data:image/')) return src;
    if (imageCache[src]) return imageCache[src];

    // Node.js support for static asset paths under /assets/
    if (typeof process !== 'undefined' && process.versions && process.versions.node && typeof require === 'function') {
      try {
        const fs = require('fs');
        const path = require('path');
        const rel = src.replace(/^\/+/, '');
        const full = path.resolve(__dirname, '../../', rel);
        if (fs.existsSync(full)) {
          const ext = path.extname(full).toLowerCase();
          const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
          const b64 = fs.readFileSync(full).toString('base64');
          const dataUrl = `data:${mime};base64,${b64}`;
          imageCache[src] = dataUrl;
          return dataUrl;
        }
      } catch (e) {
        // Fall through
      }
    }

    // Browser fetch
    if (typeof fetch === 'function') {
      try {
        const res = await fetch(src, { cache: 'force-cache' });
        if (!res.ok) return null;
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result || null);
          reader.onerror = () => resolve(null);
          reader.readAsDataURL(blob);
        });
        if (dataUrl) imageCache[src] = dataUrl;
        return dataUrl;
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Resolve offline qrcode-generator factory in browser or Node.
   */
  function getQrGenerator() {
    if (typeof window !== 'undefined' && typeof window.qrcode === 'function') {
      return window.qrcode;
    }
    if (typeof global !== 'undefined' && typeof global.qrcode === 'function') {
      return global.qrcode;
    }
    if (typeof require === 'function') {
      try {
        return require('../vendor/qrcode-generator.min.js');
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  /**
   * Draw a crisp vector QR code directly into the PDF using filled rectangles.
   * Returns true if rendered, false if QR library unavailable.
   */
  function drawQrCode(pdf, text, x, y, sizeMm) {
    const qrFactory = getQrGenerator();
    if (!qrFactory || !text) return false;
    try {
      const qr = qrFactory(0, 'M');
      qr.addData(String(text));
      qr.make();
      const count = qr.getModuleCount();
      if (!count) return false;

      const quietZone = 2; // modules
      const totalModules = count + quietZone * 2;
      const cell = sizeMm / totalModules;

      // Clean white quiet zone background
      pdf.setFillColor(...COLORS.white);
      pdf.rect(x, y, sizeMm, sizeMm, 'F');

      // Vector dark ink modules
      pdf.setFillColor(...COLORS.ink);
      for (let row = 0; row < count; row++) {
        for (let col = 0; col < count; col++) {
          if (qr.isDark(row, col)) {
            pdf.rect(
              x + (col + quietZone) * cell,
              y + (row + quietZone) * cell,
              cell + 0.02, // tiny overlap eliminates hairline subpixel gaps
              cell + 0.02,
              'F'
            );
          }
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Slim letterhead header: logo left, brand/practice left, document title & ref right,
   * thin deep-teal accent rule beneath. No navy band.
   * Returns bottom y coordinate after header.
   */
  function drawHeader(pdf, fonts, opts = {}) {
    const m = PAGE.margin;
    const rightX = PAGE.width - m;
    const topY = m;
    let brandX = m;

    let logoBottomY = topY;
    if (opts.logoDataUrl) {
      try {
        const maxW = opts.logoMaxWidth || 12;
        const maxH = opts.logoMaxHeight || 9.5;
        let drawW = 9.8;
        let drawH = 7.5;
        if (typeof pdf.getImageProperties === 'function') {
          const props = pdf.getImageProperties(opts.logoDataUrl);
          if (props && props.width > 0 && props.height > 0) {
            const scale = Math.min(maxW / props.width, maxH / props.height);
            drawW = props.width * scale;
            drawH = props.height * scale;
          }
        }
        const imgFmt = /^data:image\/jpe?g/i.test(opts.logoDataUrl) ? 'JPEG' : 'PNG';
        pdf.addImage(opts.logoDataUrl, imgFmt, m, topY - 0.5, drawW, drawH, undefined, 'FAST');
        brandX = m + drawW + 3.2;
        logoBottomY = topY - 0.5 + drawH;
      } catch (e) {
        brandX = m;
      }
    }

    const brandTitle = opts.brandTitle || COPY.brandName;
    const brandSubtitle = opts.brandSubtitle || COPY.brandSubtitle;
    const brandLines = Array.isArray(opts.brandMetaLines) ? opts.brandMetaLines.filter(Boolean) : [];

    // Left: practice / brand name
    pdf.setFont(fonts.sans, 'bold');
    pdf.setFontSize(TYPE.subheading);
    pdf.setTextColor(...COLORS.ink);
    pdf.text(brandTitle, brandX, topY + 3.2);

    let leftY = topY + 7.2;
    if (brandSubtitle) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(brandSubtitle, brandX, leftY);
      leftY += 3.8;
    }
    for (const line of brandLines) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(line, brandX, leftY);
      leftY += 3.6;
    }

    // Right: document title + reference/date
    const docTitle = opts.documentTitle || '';
    const refLine = opts.referenceText || '';
    const dateLine = opts.dateText || '';

    let rightY = topY + 3.2;
    if (docTitle) {
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.accent);
      pdf.text(docTitle, rightX, rightY, { align: 'right' });
      rightY += 4.2;
    }
    if (refLine) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(refLine, rightX, rightY, { align: 'right' });
      rightY += 3.6;
    }
    if (dateLine) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(dateLine, rightX, rightY, { align: 'right' });
      rightY += 3.6;
    }

    const ruleY = Math.max(leftY, rightY, logoBottomY + 1, topY + 10.5) + r(1);
    pdf.setDrawColor(...COLORS.accent);
    pdf.setLineWidth(PAGE.accentRuleWidth);
    pdf.line(m, ruleY, rightX, ruleY);

    return ruleY + r(4);
  }

  /**
   * Standard footer: thin 0.5pt rule, reference ID left, "Page X of Y" right,
   * and an optional single calm privacy line (rendered only when includePrivacyLine is true).
   */
  function drawFooter(pdf, fonts, opts = {}) {
    const m = PAGE.margin;
    const rightX = PAGE.width - m;
    const footerRuleY = PAGE.height - m - (opts.includePrivacyLine ? 7.5 : 4.5);

    pdf.setDrawColor(...COLORS.rule);
    pdf.setLineWidth(PAGE.ruleWidth);
    pdf.line(m, footerRuleY, rightX, footerRuleY);

    const row1Y = footerRuleY + 4.2;
    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);

    if (opts.leftText) {
      pdf.text(String(opts.leftText), m, row1Y);
    }

    const pageNum = opts.pageNumber || 1;
    const totalPages = opts.totalPages || 1;
    pdf.text(`Page ${pageNum} of ${totalPages}`, rightX, row1Y, { align: 'right' });

    if (opts.includePrivacyLine && opts.privacyLine) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(String(opts.privacyLine), m, row1Y + 4.0);
    }
  }

  /**
   * Draw a crisp horizontal 0.5 pt divider rule.
   */
  function drawRule(pdf, y, color = COLORS.rule) {
    pdf.setDrawColor(...color);
    pdf.setLineWidth(PAGE.ruleWidth);
    pdf.line(PAGE.margin, y, PAGE.width - PAGE.margin, y);
    return y;
  }

  /**
   * Draw a sentence-case section heading (11 pt or 14 pt) with optional subtitle.
   */
  function drawSectionHeading(pdf, fonts, title, y, opts = {}) {
    const size = opts.size || TYPE.subheading;
    pdf.setFont(fonts.sans, 'bold');
    pdf.setFontSize(size);
    pdf.setTextColor(...COLORS.ink);
    pdf.text(String(title), PAGE.margin, y);

    let nextY = y + (size >= 14 ? r(3.5) : r(3));
    if (opts.subtitle) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      const subLines = pdf.splitTextToSize(String(opts.subtitle), PAGE.contentWidth);
      pdf.text(subLines, PAGE.margin, nextY);
      nextY += subLines.length * 3.8 + r(1.5);
    }
    return nextY;
  }

  /**
   * Draw the compact 3-band score legend (0-39 Needs attention, 40-69 Moderate, 70-100 Healthy).
   * Returns next y coordinate.
   */
  function drawBandLegend(pdf, fonts, y) {
    const m = PAGE.margin;
    let x = m;

    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    const prefix = 'SCORE BANDS:';
    pdf.text(prefix, x, y);
    x += pdf.getTextWidth(prefix) + 4;

    for (const band of SCORE_BANDS) {
      // Muted color dot
      pdf.setFillColor(...band.color);
      pdf.circle(x + 1.1, y - 0.9, 1.1, 'F');
      x += 3.6;

      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...band.color);
      const labelTxt = band.label;
      pdf.text(labelTxt, x, y);
      x += pdf.getTextWidth(labelTxt) + 1.5;

      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      const rangeTxt = `(${band.rangeLabel})`;
      pdf.text(rangeTxt, x, y);
      x += pdf.getTextWidth(rangeTxt) + 6;
    }

    return y + r(3.5);
  }

  /**
   * Draw the Score Hero block (the ONE subtle neutral panel allowed on Page 1).
   * Shows large 20pt score + band indicator + one-sentence plain-language interpretation.
   */
  function drawScoreHero(pdf, fonts, opts = {}) {
    const m = PAGE.margin;
    const band = opts.band || getScoreBand(opts.wellbeingScore);
    const primaryValue = String(opts.primaryValue ?? '0');
    const secondaryValue = opts.secondaryValue ? String(opts.secondaryValue) : '';
    const metricLabel = opts.metricLabel ? String(opts.metricLabel).toUpperCase() : 'WELLBEING INDEX';
    const interpretation = String(opts.interpretation || '');
    const clinicalSubLabel = opts.clinicalSubLabel ? String(opts.clinicalSubLabel) : '';

    // Left 3.5 columns for score, right 8.5 columns for interpretation
    const leftX = m + 6;
    const textX = m + 52;
    const textW = PAGE.contentWidth - 58;

    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.body);
    const interpLines = pdf.splitTextToSize(interpretation, textW);

    const textBlockH = 6.5 + (clinicalSubLabel ? 4.5 : 0) + (interpLines.length * 4.4);
    const panelH = Math.max(30, textBlockH + 11);

    // Subtle neutral panel (no rounded-card border spam; just a quiet neutral wash + thin left band bar)
    pdf.setFillColor(...COLORS.panelBg);
    pdf.rect(m, opts.y, PAGE.contentWidth, panelH, 'F');

    // Thin left accent indicator in band color (1.2 mm)
    pdf.setFillColor(...band.color);
    pdf.rect(m, opts.y, 1.2, panelH, 'F');

    // Left: 8pt uppercase label + 20pt score + optional secondary text
    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    pdf.text(metricLabel, leftX, opts.y + 7.2);

    pdf.setFont(fonts.sans, 'bold');
    pdf.setFontSize(TYPE.hero);
    pdf.setTextColor(...COLORS.ink);
    pdf.text(primaryValue, leftX, opts.y + 17.5);

    if (secondaryValue) {
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(secondaryValue, leftX, opts.y + 23.2);
    }

    // Vertical hairline divider between score and interpretation
    pdf.setDrawColor(...COLORS.rule);
    pdf.setLineWidth(PAGE.ruleWidth);
    pdf.line(m + 46, opts.y + 5, m + 46, opts.y + panelH - 5);

    // Right: Band dot + Band name (11pt semibold in muted band hue)
    let ry = opts.y + 8.5;
    pdf.setFillColor(...band.color);
    pdf.circle(textX + 1.2, ry - 1.1, 1.2, 'F');

    pdf.setFont(fonts.sans, 'bold');
    pdf.setFontSize(TYPE.subheading);
    pdf.setTextColor(...band.color);
    pdf.text(band.label, textX + 4.2, ry);

    if (clinicalSubLabel) {
      ry += 4.6;
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(clinicalSubLabel, textX, ry);
    }

    ry += 5.2;
    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.body);
    pdf.setTextColor(...COLORS.ink);
    pdf.text(interpLines, textX, ry);

    return opts.y + panelH + r(3.5);
  }

  /**
   * Draw a clean horizontal bar chart of pillars (expected pre-sorted lowest to highest).
   * Each item: { label, sublabel, score (0-100), band? }
   */
  function drawHorizontalBarChart(pdf, fonts, items, startY) {
    const m = PAGE.margin;
    const rightX = PAGE.width - m;
    const labelCol = gridCol(1, 5);   // ~70 mm
    const barCol = gridCol(6, 4);     // ~55 mm
    const scoreCol = gridCol(10, 3);  // ~40 mm

    let y = startY;

    // Column headers (8 pt uppercase muted)
    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    pdf.text('PILLAR', labelCol.x, y);
    pdf.text('SCORE (LOWEST TO HIGHEST)', barCol.x, y);
    pdf.text('BAND', rightX, y, { align: 'right' });

    y += r(1.5);
    drawRule(pdf, y, COLORS.rule);
    y += r(3.2);

    items.forEach((item, idx) => {
      const isMissing = item.score === null || item.score === undefined || !Number.isFinite(Number(item.score));
      const score = isMissing ? null : Math.max(0, Math.min(100, Math.round(Number(item.score))));
      const band = isMissing ? null : (item.band || getScoreBand(score));

      // Pillar title + instrument subtitle
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(String(item.label), labelCol.x, y);

      if (item.sublabel) {
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(String(item.sublabel), labelCol.x, y + 4.0);
      }

      // Horizontal bar track + fill in muted band color
      const barY = y - 2.3;
      const barH = 3.2;
      pdf.setFillColor(...COLORS.barTrack);
      pdf.rect(barCol.x, barY, barCol.width, barH, 'F');

      if (!isMissing) {
        const fillW = Math.max(1.2, (score / 100) * barCol.width);
        pdf.setFillColor(...band.color);
        pdf.rect(barCol.x, barY, fillW, barH, 'F');
      }

      // Numeric score + band label right-aligned
      pdf.setFont(fonts.sans, 'bold');
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...(isMissing ? COLORS.muted : COLORS.ink));
      pdf.text(isMissing ? '--/100' : `${score}/100`, scoreCol.x + 12, y, { align: 'right' });

      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...(isMissing ? COLORS.muted : band.color));
      pdf.text(isMissing ? 'Not yet completed' : band.label, rightX, y, { align: 'right' });

      y += item.sublabel ? 7.2 : 5.6;

      if (idx < items.length - 1) {
        drawRule(pdf, y - 1.2, COLORS.rule);
        y += r(2.0);
      }
    });

    y += r(1.5);
    drawRule(pdf, y, COLORS.rule);
    return y + r(3);
  }

  /**
   * Zebra-free, thin 0.5pt rule-separated breakdown table.
   * Supports optional inline progress bars and gray subtext/ISO clause citations.
   * Handles multi-page overflow gracefully via onNewPage callback.
   */
  function drawRuleTable(pdf, fonts, opts = {}) {
    const {
      headers = ['AREA', 'SCORE', 'BAND', 'SUMMARY'],
      rows = [],
      startY = 60,
      maxY = PAGE.height - PAGE.margin - 20,
      onNewPage = null
    } = opts;

    const m = PAGE.margin;
    const rightX = PAGE.width - m;

    // Column geometry on 12-col grid
    const c1 = gridCol(1, 4);   // Name + subtext (~55.3 mm)
    const c2 = gridCol(5, 3);   // Score + inline bar (~40.5 mm)
    const c3 = gridCol(8, 2);   // Band (~25.7 mm)
    const c4 = gridCol(10, 3);  // Summary (~40.5 mm)

    let y = startY;

    const drawTableHead = () => {
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      pdf.text(String(headers[0] || '').toUpperCase(), c1.x, y);
      pdf.text(String(headers[1] || '').toUpperCase(), c2.x, y);
      pdf.text(String(headers[2] || '').toUpperCase(), c3.x, y);
      if (headers[3]) {
        pdf.text(String(headers[3]).toUpperCase(), c4.x, y);
      }
      y += r(1.5);
      drawRule(pdf, y, COLORS.ink);
      y += r(3.2);
    };

    drawTableHead();

    rows.forEach((row, idx) => {
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.body);
      const nameLines = pdf.splitTextToSize(String(row.name || ''), c1.width);

      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      const subLines = row.subtext ? pdf.splitTextToSize(String(row.subtext), c1.width) : [];
      const descLines = row.description ? pdf.splitTextToSize(String(row.description), c4.width) : [];

      const leftH = (nameLines.length * 4.1) + (subLines.length ? (subLines.length * 3.5 + 1) : 0);
      const rightH = descLines.length * 3.6;
      const rowH = Math.max(leftH, rightH, 9.5);

      if (y + rowH > maxY && typeof onNewPage === 'function') {
        y = onNewPage();
        drawTableHead();
      }

      const band = row.band || getScoreBand(row.barScore ?? 50);

      // Col 1: Area name + small gray subtext (e.g. ISO 45003 clause)
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(nameLines, c1.x, y);

      if (subLines.length) {
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(subLines, c1.x, y + (nameLines.length * 4.1) + 0.5);
      }

      // Col 2: Score text + inline bar
      pdf.setFont(fonts.sans, 'bold');
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(String(row.scoreText || ''), c2.x, y);

      if (typeof row.barPct === 'number') {
        const pct = Math.max(0, Math.min(100, row.barPct));
        const barW = c2.width - 4;
        const barY = y + 2.4;
        pdf.setFillColor(...COLORS.barTrack);
        pdf.rect(c2.x, barY, barW, 2.2, 'F');
        pdf.setFillColor(...band.color);
        pdf.rect(c2.x, barY, Math.max(1, (pct / 100) * barW), 2.2, 'F');
      }

      // Col 3: Band label (muted hue, no saturated pill)
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...band.color);
      pdf.text(String(row.bandLabel || band.label), c3.x, y);

      // Col 4: Summary / interpretation
      if (descLines.length) {
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(descLines, c4.x, y);
      }

      y += rowH + r(1.5);
      drawRule(pdf, y, COLORS.rule);
      if (idx < rows.length - 1) {
        y += r(3.0);
      }
    });

    return y + r(3);
  }

  /**
   * Draw numbered "What to do next" actions (max 3 actions, clean typographic list, no card borders).
   */
  function drawActionList(pdf, fonts, actions, startY, opts = {}) {
    const m = PAGE.margin;
    const maxActions = Math.min(3, Array.isArray(actions) ? actions.length : 0);
    let y = startY;

    for (let i = 0; i < maxActions; i++) {
      const act = actions[i];
      const numX = m;
      const bodyX = m + 7;
      const bodyW = PAGE.contentWidth - 7;

      // Clean accent number
      pdf.setFont(fonts.sans, 'bold');
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.accent);
      pdf.text(`${i + 1}.`, numX, y);

      // Action title
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(String(act.title || ''), bodyX, y);

      if (act.timeframe) {
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(String(act.timeframe), PAGE.width - m, y, { align: 'right' });
      }

      y += 4.3;

      if (act.body) {
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.body);
        pdf.setTextColor(...COLORS.muted);
        const lines = pdf.splitTextToSize(String(act.body), bodyW);
        pdf.text(lines, bodyX, y);
        y += lines.length * 4.0;
      }

      y += r(1.5);
    }

    return y;
  }

  /**
   * ONE compact support block: confidential clinic contact + helplines.
   * When prominentHelplines is true (score in 0-39 band or crisis flag), renders
   * the helplines prominently in a single subtle neutral panel with muted terracotta rule.
   * Otherwise renders a quiet, compact single-block support footer section.
   */
  function drawSupportBlock(pdf, fonts, opts = {}) {
    const m = PAGE.margin;
    const rightX = PAGE.width - m;
    const prominent = Boolean(opts.prominentHelplines);
    const clinic = opts.clinic || {};
    const helplines = Array.isArray(opts.helplines) && opts.helplines.length
      ? opts.helplines
      : COPY.publicHelplines;

    // Build clinic contact line from real configured values only (never invent fake info)
    const clinicParts = [];
    if (clinic.clinicianName) clinicParts.push(clinic.clinicianName);
    if (clinic.clinicName) clinicParts.push(clinic.clinicName);
    if (clinic.phone) clinicParts.push(`Tel: ${clinic.phone}`);
    if (clinic.email) clinicParts.push(clinic.email);
    const clinicLine = clinicParts.length
      ? clinicParts.join('  ·  ')
      : 'Request a free, confidential consultation via the Havilah portal ("Clinical Referral").';

    let y = opts.y;

    if (prominent) {
      // Prominent single support block for Needs Attention (0-39) or Safety Flag.
      // Uses a crisp left accent rule + thin top/bottom rules on white (keeps max 1 shaded panel per page).
      const colW = (PAGE.contentWidth - 14) / 2;
      const rowsNeeded = Math.ceil(helplines.length / 2);
      const blockH = 14 + (rowsNeeded * 4.2) + 3.5;

      drawRule(pdf, y, COLORS.rule);
      pdf.setFillColor(...SCORE_BANDS[0].color);
      pdf.rect(m, y, 1.2, blockH, 'F');

      let py = y + 5.2;
      pdf.setFont(fonts.sans, 'bold');
      pdf.setFontSize(TYPE.body);
      pdf.setTextColor(...SCORE_BANDS[0].color);
      pdf.text('Confidential clinical support & urgent helplines', m + 4.5, py);

      py += 4.2;
      pdf.setFont(fonts.sans, fonts.semiboldStyle);
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.ink);
      pdf.text(`Occupational health clinic: ${clinicLine}`, m + 4.5, py);

      py += 4.6;
      helplines.forEach((h, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const hx = m + 4.5 + col * (colW + 6);
        const hy = py + row * 4.2;
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        pdf.text(`${h.name}: `, hx, hy);
        const w = pdf.getTextWidth(`${h.name}: `);
        pdf.setFont(fonts.sans, fonts.semiboldStyle);
        pdf.setTextColor(...COLORS.ink);
        pdf.text(String(h.contact), hx + w, hy);
      });

      drawRule(pdf, y + blockH, COLORS.rule);
      return y + blockH + r(2.5);
    }

    // Quiet compact support block (when score is Moderate or Healthy)
    drawRule(pdf, y, COLORS.rule);
    y += r(3.2);

    pdf.setFont(fonts.sans, fonts.semiboldStyle);
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.accent);
    pdf.text('CONFIDENTIAL SUPPORT', m, y);

    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.ink);
    pdf.text(clinicLine, m + 36, y);

    y += 4.2;
    const helplineInline = helplines
      .slice(0, 3)
      .map((h) => `${h.name}: ${h.contact}`)
      .join('   |   ');
    pdf.setFont(fonts.sans, 'normal');
    pdf.setFontSize(TYPE.label);
    pdf.setTextColor(...COLORS.muted);
    const hLines = pdf.splitTextToSize(`Helplines (Ghana): ${helplineInline}`, PAGE.contentWidth);
    pdf.text(hLines, m, y);

    return y + (hLines.length * 3.8) + r(2);
  }

  return {
    loadHavilahLogoDataUrl,
    loadImageAsDataUrl,
    drawQrCode,
    drawHeader,
    drawFooter,
    drawRule,
    drawSectionHeading,
    drawBandLegend,
    drawScoreHero,
    drawHorizontalBarChart,
    drawRuleTable,
    drawActionList,
    drawSupportBlock
  };
}));
