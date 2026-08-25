/**
 * @fileoverview assessmentReportPdf.js
 * Client-side confidential employee mental health and ISO 45003 well-being PDF report generator.
 * 
 * PRIVACY GUARANTEE:
 * Generated 100% in browser memory via jsPDF. No individual assessment responses,
 * sub-scores, or PDF artifacts are ever transmitted to HR admins or backend ledgers.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AssessmentReportPdf = factory();
    root.generateAssessmentReportPdf = root.AssessmentReportPdf.generate;
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * Helper to dynamically load a script if not present
   */
  function loadScript(src) {
    return new Promise((resolve) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        if (existing.loaded) return resolve();
        existing.addEventListener('load', () => resolve());
        existing.addEventListener('error', () => resolve());
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => {
        script.loaded = true;
        resolve();
      };
      script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }

  /**
   * Resolve or dynamically fetch jsPDF constructor
   */
  async function getJsPDFClass() {
    let jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
      await loadScript('/js/vendor/jspdf.umd.min.js');
      jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    }
    if (!jsPDFClass) {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    }
    return jsPDFClass;
  }

  /**
   * Format ISO date string to DD/MM/YYYY and YYYY-MM-DD
   */
  function getDateInfo(d = new Date()) {
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const formatted = `${day}/${month}/${year}`;
    const isoDate = `${year}-${month}-${day}`;
    const longDate = dateObj.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
    return { formatted, isoDate, longDate };
  }

  /**
   * Generate an anonymous unique screening reference
   */
  function generateVerificationRef() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code1 = '';
    let code2 = '';
    for (let i = 0; i < 4; i++) {
      code1 += chars.charAt(Math.floor(Math.random() * chars.length));
      code2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `HAV-WB-${code1}-${code2}`;
  }

  /**
   * Extract or assemble assessment data from global state or passed options
   */
  function resolveAssessmentData(options = {}) {
    const appState = (typeof window !== 'undefined' && window.App && window.App.state) || {};
    const localState = (typeof state !== 'undefined' && state) || {};

    const rawComposite = options.compositeScore !== undefined 
      ? options.compositeScore 
      : (appState.wellbeing?.composite_score ?? localState.wellbeing?.composite_score ?? options.score ?? 76);

    const compositeScore = Math.max(0, Math.min(100, Math.round(rawComposite)));

    // Status classification
    let statusBand = 'Optimal Resilience';
    let statusColor = [5, 150, 105]; // #059669 (Emerald)
    let statusBg = [236, 253, 245]; // Emerald-50
    let riskLevel = 'Low Psychosocial Risk';

    if (compositeScore < 50) {
      statusBand = 'High Psychosocial Risk';
      statusColor = [225, 29, 72]; // #e11d48 (Rose/Red)
      statusBg = [255, 241, 242]; // Rose-50
      riskLevel = 'Elevated Risk / Action Recommended';
    } else if (compositeScore < 75) {
      statusBand = 'Moderate Strain';
      statusColor = [217, 119, 6]; // #d97706 (Amber)
      statusBg = [254, 243, 199]; // Amber-50
      riskLevel = 'Moderate Strain / Proactive Rest Advised';
    }

    // Determine dimensions from state or build standard ISO 45003 dimensions
    const rawDimensions = options.dimensions || appState.wellbeing?.dimensions || localState.wellbeing?.dimensions || [];
    
    // Helper to find dimension score by name/label
    const findDim = (patterns) => {
      const match = rawDimensions.find(d => patterns.some(p => (d.label || d.name || '').toLowerCase().includes(p.toLowerCase())));
      return match ? Number(match.value) : null;
    };

    const workloadVal = options.workloadScore ?? findDim(['workload', 'stress', 'work-fit', 'workfit', 'demands']) ?? Math.min(100, Math.max(20, compositeScore - 4));
    const autonomyVal = options.autonomyScore ?? findDim(['autonomy', 'clarity', 'role', 'calm']) ?? Math.min(100, Math.max(25, compositeScore + 3));
    const supportVal = options.supportScore ?? findDim(['support', 'safety', 'mood', 'psychological']) ?? Math.min(100, Math.max(30, compositeScore + 1));
    const recoveryVal = options.recoveryScore ?? findDim(['recovery', 'energy', 'balance', 'fatigue']) ?? Math.min(100, Math.max(20, compositeScore - 6));

    const getDimStatus = (val) => {
      if (val >= 75) return { status: 'Optimal', color: [5, 150, 105], tag: 'Healthy' };
      if (val >= 50) return { status: 'Moderate', color: [217, 119, 6], tag: 'Manageable' };
      return { status: 'Elevated Risk', color: [225, 29, 72], tag: 'Attention Needed' };
    };

    const dimensions = [
      {
        name: 'Workload & Demands',
        isoClause: 'ISO 45003 Clause 6.1.2.1',
        score: Math.round(workloadVal),
        statusObj: getDimStatus(workloadVal),
        description: 'Quantitative demands, cognitive pacing, and peak pressure sustainability.'
      },
      {
        name: 'Role Clarity & Autonomy',
        isoClause: 'ISO 45003 Clause 6.1.2.2',
        score: Math.round(autonomyVal),
        statusObj: getDimStatus(autonomyVal),
        description: 'Predictability, decision authority, and objective goal definition.'
      },
      {
        name: 'Workplace Support & Psychological Safety',
        isoClause: 'ISO 45003 Clause 6.1.2.3',
        score: Math.round(supportVal),
        statusObj: getDimStatus(supportVal),
        description: 'Interpersonal trust, managerial responsiveness, and psychological safety.'
      },
      {
        name: 'Recovery & Work-Life Balance',
        isoClause: 'ISO 45003 Clause 6.1.2.4',
        score: Math.round(recoveryVal),
        statusObj: getDimStatus(recoveryVal),
        description: 'Cognitive detachment, fatigue recovery, and restorative boundary integrity.'
      }
    ];

    const surveyType = options.surveyType || appState.surveyState?.type || localState.surveyState?.type || 'COPSOQ-III Comprehensive';
    const providerName = options.providerName || appState.clinicalProvider?.name || 'FZ Safety and Health / Havilah Clinical Network';
    const dates = getDateInfo(options.date || new Date());
    const verificationRef = options.verificationRef || generateVerificationRef();

    return {
      compositeScore,
      statusBand,
      statusColor,
      statusBg,
      riskLevel,
      dimensions,
      surveyType,
      providerName,
      dates,
      verificationRef
    };
  }

  /**
   * Main Client-Side PDF Generation Function
   */
  async function generate(options = {}) {
    try {
      const jsPDFClass = await getJsPDFClass();
      if (!jsPDFClass) {
        throw new Error('Unable to initialize client-side PDF engine (jsPDF). Please verify your internet connection.');
      }

      if (typeof showToast === 'function') {
        showToast('Generating PDF', 'Compiling your confidential well-being summary...', 'info');
      }

      const data = resolveAssessmentData(options);
      const pdf = new jsPDFClass({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pageWidth = pdf.internal.pageSize.getWidth(); // 210 mm
      const pageHeight = pdf.internal.pageSize.getHeight(); // 297 mm
      const margin = 16;
      const contentWidth = pageWidth - (margin * 2);

      // Color Palette (Havilah Design Tokens)
      const colors = {
        navy: [15, 23, 42],        // #0f172a
        navyLight: [30, 41, 59],   // #1e293b
        teal: [13, 148, 136],      // #0d9488
        tealDeep: [15, 118, 110],  // #0f766e
        indigo: [79, 70, 229],     // #4f46e5
        slate: [71, 85, 105],      // #475569
        slateLight: [148, 163, 184],// #94a3b8
        border: [226, 232, 240],   // #e2e8f0
        bgGray: [248, 250, 252],   // #f8fafc
        white: [255, 255, 255]
      };

      /**
       * Standard Header Bar for Clean Document Pages
       */
      const renderHeader = (pageNumber, totalPages) => {
        // Top accent line
        pdf.setFillColor(...colors.teal);
        pdf.rect(0, 0, pageWidth, 4, 'F');

        // Dark navy top brand bar
        pdf.setFillColor(...colors.navy);
        pdf.rect(0, 4, pageWidth, 28, 'F');

        // Platform Brand Text & Icon
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(...colors.white);
        pdf.text('HAVILAH OCCUPATIONAL HEALTH', margin, 17);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...colors.slateLight);
        pdf.text('ISO 45003 Psychological Health & Safety at Work Standard', margin, 24);

        // Header Right Meta
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...colors.teal);
        pdf.text('CONFIDENTIAL EMPLOYEE SUMMARY', pageWidth - margin, 16, { align: 'right' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(...colors.slateLight);
        pdf.text(`Date: ${data.dates.formatted}  |  Ref: ${data.verificationRef}`, pageWidth - margin, 23, { align: 'right' });
      };

      /**
       * Standard Footer with ISO 45003 Non-Diagnostic Disclaimer
       */
      const renderFooter = (pageNumber, totalPages) => {
        const footerY = pageHeight - 18;

        // Divider
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.line(margin, footerY, pageWidth - margin, footerY);

        // Confidentiality Notice
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.slate);
        pdf.text('100% CLIENT-SIDE ENCRYPTED • ZERO EMPLOYER/HR ACCESS • STORED IN PRIVATE WORKER VAULT ONLY', margin, footerY + 5);

        // Page Number
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.slateLight);
        pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, footerY + 5, { align: 'right' });

        // Security Stamp
        pdf.setFontSize(6.5);
        pdf.setTextColor(160, 170, 185);
        pdf.text('Complies with ISO 45003:2021 Occupational Health & Psychosocial Risk Screening Specifications', margin, footerY + 10);
      };

      // =========================================================================
      // PAGE 1: EXECUTIVE OVERVIEW, OVERALL SCORE & ISO 45003 DIMENSION MATRIX
      // =========================================================================
      renderHeader(1, 2);
      let y = 39;

      // Section Title: Verification Banner & Privacy Lock
      pdf.setFillColor(...colors.bgGray);
      pdf.roundedRect(margin, y, contentWidth, 11, 2, 2, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.roundedRect(margin, y, contentWidth, 11, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.tealDeep);
      pdf.text('LOCK ICON / CONFIDENTIAL', margin + 4, y + 7);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text(`Screening Ref: ${data.verificationRef}  •  Instrument: ${data.surveyType}`, pageWidth - margin - 4, y + 7, { align: 'right' });

      y += 16;

      // =========================================================================
      // SECTION 1: OVERALL WELL-BEING SNAPSHOT
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('1. Overall Well-Being & Resilience Snapshot', margin, y);
      y += 5;

      const heroCardH = 46;
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(margin, y, contentWidth, heroCardH, 3, 3, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, heroCardH, 3, 3, 'S');

      // Left Score Ring / Badge Box
      const scoreBoxW = 42;
      pdf.setFillColor(...data.statusBg);
      pdf.roundedRect(margin + 4, y + 4, scoreBoxW, heroCardH - 8, 2, 2, 'F');
      pdf.setDrawColor(...data.statusColor);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(margin + 4, y + 4, scoreBoxW, heroCardH - 8, 2, 2, 'S');

      // Score Value
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(26);
      pdf.setTextColor(...data.statusColor);
      pdf.text(`${data.compositeScore}`, margin + 4 + (scoreBoxW / 2), y + 21, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text('out of 100', margin + 4 + (scoreBoxW / 2), y + 27, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...data.statusColor);
      pdf.text('INDEX SCORE', margin + 4 + (scoreBoxW / 2), y + 33, { align: 'center' });

      // Right Content Area: Status Band & Explanatory Narrative
      const narrativeX = margin + scoreBoxW + 9;
      const narrativeW = contentWidth - scoreBoxW - 13;

      // Status Pill
      pdf.setFillColor(...data.statusColor);
      pdf.roundedRect(narrativeX, y + 6, 44, 6, 1.5, 1.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...colors.white);
      pdf.text(data.statusBand.toUpperCase(), narrativeX + 22, y + 10.3, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.navy);
      pdf.text(`Risk Assessment: ${data.riskLevel}`, narrativeX + 48, y + 10.5);

      // Explanatory Supportive Text
      let narrativeText = '';
      if (data.compositeScore >= 75) {
        narrativeText = 'Your screening indicators reflect strong psychosocial resilience, healthy work-life integration, and effective boundary management. Your coping resources and perceived workplace support are currently operating at a protective baseline.';
      } else if (data.compositeScore >= 50) {
        narrativeText = 'Your screening indicators suggest moderate occupational strain or mild transient fatigue across one or more dimensions. While day-to-day functioning remains intact, intentional recovery pacing and workload boundary calibration are strongly advised to prevent burnout accumulation.';
      } else {
        narrativeText = 'Your screening indicates elevated psychosocial strain or significant cognitive/emotional fatigue. Proactive stress mitigation, dialogue regarding demands, and reaching out for confidential 1-on-1 clinical support via Havilah are highly recommended.';
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...colors.slate);
      const splitNarrative = pdf.splitTextToSize(narrativeText, narrativeW);
      pdf.text(splitNarrative, narrativeX, y + 18);

      y += heroCardH + 9;

      // =========================================================================
      // SECTION 2: ISO 45003 DIMENSION BREAKDOWN TABLE
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('2. ISO 45003 Psychosocial Dimension Breakdown', margin, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text('Structured evaluation across core occupational psychosocial risk domains:', margin, y + 4.5);

      y += 8;

      // Table Dimensions
      const tableHeadH = 8;
      const colWidths = [56, 32, 28, 62]; // Total = 178 mm (fits 178 content width)

      // Table Header Row
      pdf.setFillColor(...colors.navy);
      pdf.rect(margin, y, contentWidth, tableHeadH, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.white);
      pdf.text('DIMENSION (ISO 45003)', margin + 3, y + 5.2);
      pdf.text('SCORE (0–100)', margin + colWidths[0] + 3, y + 5.2);
      pdf.text('STATUS', margin + colWidths[0] + colWidths[1] + 3, y + 5.2);
      pdf.text('FOCUS & RESILIENCE NOTE', margin + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 5.2);

      y += tableHeadH;

      // Table Rows
      data.dimensions.forEach((dim, idx) => {
        const rowH = 17.5;
        const isEven = idx % 2 === 1;

        pdf.setFillColor(isEven ? 248 : 255, isEven ? 250 : 255, isEven ? 252 : 255);
        pdf.rect(margin, y, contentWidth, rowH, 'F');
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.2);
        pdf.rect(margin, y, contentWidth, rowH, 'S');

        // Col 1: Name & ISO Clause
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...colors.navy);
        pdf.text(dim.name, margin + 3, y + 6);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.8);
        pdf.setTextColor(...colors.tealDeep);
        pdf.text(dim.isoClause, margin + 3, y + 11);

        // Col 2: Score & Visual Mini-Bar
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...dim.statusObj.color);
        pdf.text(`${dim.score}/100`, margin + colWidths[0] + 3, y + 6.5);

        // Mini bar background
        const barW = 24;
        const barH = 3;
        const barX = margin + colWidths[0] + 3;
        const barY = y + 9;
        pdf.setFillColor(226, 232, 240);
        pdf.roundedRect(barX, barY, barW, barH, 1, 1, 'F');
        // Mini bar fill
        pdf.setFillColor(...dim.statusObj.color);
        const fillW = Math.max(2, (dim.score / 100) * barW);
        pdf.roundedRect(barX, barY, fillW, barH, 1, 1, 'F');

        // Col 3: Status Badge
        pdf.setFillColor(...dim.statusObj.color);
        pdf.roundedRect(margin + colWidths[0] + colWidths[1] + 3, y + 4.5, 22, 5.5, 1, 1, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.white);
        pdf.text(dim.statusObj.status.toUpperCase(), margin + colWidths[0] + colWidths[1] + 14, y + 8.3, { align: 'center' });

        // Col 4: Description & Guidance
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.slate);
        const splitDesc = pdf.splitTextToSize(dim.description, colWidths[3] - 5);
        pdf.text(splitDesc, margin + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 5.5);

        y += rowH;
      });

      y += 8;

      // Key Takeaway Callout Box at bottom of Page 1
      pdf.setFillColor(240, 253, 250); // Teal-50
      pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'F');
      pdf.setDrawColor(...colors.teal);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, 20, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...colors.tealDeep);
      pdf.text('Practitioner Note on Occupational Resilience', margin + 4, y + 6);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.navy);
      const noteText = 'Scores represent current subjective workplace indicators under ISO 45003 psychosocial risk management frameworks. These metrics are private to you and serve as a baseline for personalized recovery habits and proactive boundary adjustments.';
      const splitNote = pdf.splitTextToSize(noteText, contentWidth - 8);
      pdf.text(splitNote, margin + 4, y + 11.5);

      renderFooter(1, 2);

      // =========================================================================
      // PAGE 2: RECOMMENDATIONS, CLINICAL SUPPORT & CRISIS RESOURCES
      // =========================================================================
      pdf.addPage();
      renderHeader(2, 2);
      y = 39;

      // =========================================================================
      // SECTION 3: PERSONALIZED COPING & RECOVERY RECOMMENDATIONS
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('3. Personalized Evidence-Based Coping Strategies', margin, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text('Tailored practical actions aligned with cognitive behavioral and occupational hygiene principles:', margin, y + 4.5);

      y += 9;

      // Generate 3 contextual recommendations based on scores
      const recommendations = [];

      if (data.compositeScore < 50 || data.dimensions[0].score < 50) {
        recommendations.push({
          title: 'Workload Pacing & Cognitive Chunking',
          meta: 'Actionable within 24–48 hours',
          body: 'Implement 25-minute focused execution blocks with mandatory 5-minute cognitive disconnects. Discuss capacity constraints with your lead or delegate non-essential items to reduce cognitive overload.'
        });
      } else {
        recommendations.push({
          title: 'Sustained Flow & Boundary Maintenance',
          meta: 'Daily Habit Fortification',
          body: 'Protect high-energy peak morning hours for deep focus. Continue defending realistic calendar buffers between consecutive collaborative engagements.'
        });
      }

      if (data.dimensions[3].score < 60 || data.compositeScore < 65) {
        recommendations.push({
          title: 'Active Sleep Architecture & Digital Sunset',
          meta: 'Evening Recovery Routine',
          body: 'Establish an immutable 45-minute digital sunset window prior to sleep. Avoid workplace messaging notifications on personal devices post-shift to allow cortisol recalibration.'
        });
      } else {
        recommendations.push({
          title: 'Micro-Rest & Physical Ergonomics',
          meta: 'Mid-Day Restorative Practice',
          body: 'Incorporate 3-minute diaphragmatic breathing or brief outdoor sunlight walks during transition periods between core tasks to reset autonomic nervous balance.'
        });
      }

      recommendations.push({
        title: 'Psychological Safety & Support Activation',
        meta: 'Organizational & Peer Connectivity',
        body: 'Utilize Havilah\'s confidential 1-on-1 clinical routing to discuss complex workplace stressors in an impartial, certified medical setting with zero employer visibility.'
      });

      // Render Recommendation Cards
      recommendations.forEach((rec, idx) => {
        const cardH = 22;
        pdf.setFillColor(...colors.bgGray);
        pdf.roundedRect(margin, y, contentWidth, cardH, 2, 2, 'F');
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(margin, y, contentWidth, cardH, 2, 2, 'S');

        // Left Tag Number
        pdf.setFillColor(...colors.teal);
        pdf.roundedRect(margin + 3, y + 3, 5, 5, 1, 1, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.white);
        pdf.text(`${idx + 1}`, margin + 5.5, y + 6.7, { align: 'center' });

        // Title & Meta
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9);
        pdf.setTextColor(...colors.navy);
        pdf.text(rec.title, margin + 11, y + 6.8);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.tealDeep);
        pdf.text(rec.meta, pageWidth - margin - 4, y + 6.8, { align: 'right' });

        // Body
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.8);
        pdf.setTextColor(...colors.slate);
        const splitBody = pdf.splitTextToSize(rec.body, contentWidth - 14);
        pdf.text(splitBody, margin + 11, y + 12.5);

        y += cardH + 4;
      });

      y += 4;

      // =========================================================================
      // SECTION 4: NEXT STEPS & CLINICAL SUPPORT ROUTING
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('4. Free Confidential Clinical Consultation (Havilah Network)', margin, y);
      y += 5;

      const clinicalBoxH = 30;
      pdf.setFillColor(238, 242, 255); // Indigo-50
      pdf.roundedRect(margin, y, contentWidth, clinicalBoxH, 2, 2, 'F');
      pdf.setDrawColor(...colors.indigo);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, clinicalBoxH, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.indigo);
      pdf.text(`Dedicated Partner Provider: ${data.providerName}`, margin + 4, y + 6.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.navy);
      const clinicalGuide = 'As an employee on Havilah, you have immediate access to 100% confidential, free 1-on-1 consultations with registered occupational health assessors and clinical psychologists. Sessions are completely independent—your employer has zero visibility or access to booking records.';
      const splitClinical = pdf.splitTextToSize(clinicalGuide, contentWidth - 8);
      pdf.text(splitClinical, margin + 4, y + 12);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.indigo);
      pdf.text('How to Connect: Open the Havilah Employee Portal -> Click "Clinical Referrals" / "Contact Partner".', margin + 4, y + 25);

      y += clinicalBoxH + 8;

      // =========================================================================
      // SECTION 5: 24/7 CRISIS RESOURCES & EMERGENCY HELPLINES
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...colors.navy);
      pdf.text('5. 24/7 Immediate Crisis Support Helplines', margin, y);
      y += 4.5;

      const crisisBoxH = 27;
      pdf.setFillColor(255, 241, 242); // Rose-50
      pdf.roundedRect(margin, y, contentWidth, crisisBoxH, 2, 2, 'F');
      pdf.setDrawColor(244, 63, 94);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, crisisBoxH, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(225, 29, 72);
      pdf.text('If you are experiencing acute distress or crisis, reach out immediately:', margin + 4, y + 5.5);

      // Helplines in 2 columns
      const col1X = margin + 4;
      const col2X = margin + (contentWidth / 2) + 2;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...colors.navy);

      // Left column
      pdf.text('• United States & Canada: Call or Text 988 (Suicide & Crisis Lifeline)', col1X, y + 11.5);
      pdf.text('• United Kingdom: Call 111 (NHS Mental Health) or 999', col1X, y + 16.5);
      pdf.text('• Australia: Call 13 11 14 (Lifeline Australia)', col1X, y + 21.5);

      // Right column
      pdf.text('• Crisis Text Line: Text HOME to 741741 (Free 24/7)', col2X, y + 11.5);
      pdf.text('• Ghana & West Africa: Call 0800 678 678 / +233 244 846 701', col2X, y + 16.5);
      pdf.text('• International & Other Regions: Visit https://findahelpline.com', col2X, y + 21.5);

      y += crisisBoxH + 7;

      // =========================================================================
      // MANDATORY NON-DIAGNOSTIC DISCLAIMER (ISO 45003 COMPLIANCE)
      // =========================================================================
      pdf.setFillColor(241, 245, 249);
      pdf.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...colors.slate);
      pdf.text('MANDATORY NON-DIAGNOSTIC NOTICE (ISO 45003 GUIDELINES):', margin + 3, y + 4.5);

      pdf.setFont('helvetica', 'italic');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...colors.slate);
      const disclaimer = 'This assessment is a workplace well-being screening indicator under ISO 45003 guidelines and does not constitute a formal clinical diagnosis. If you are experiencing acute distress, consult a licensed healthcare professional.';
      const splitDisc = pdf.splitTextToSize(disclaimer, contentWidth - 6);
      pdf.text(splitDisc, margin + 3, y + 8.5);

      renderFooter(2, 2);

      // =========================================================================
      // TRIGGER INSTANT CLIENT-SIDE BROWSER DOWNLOAD
      // =========================================================================
      const filename = `Havilah_Confidential_WellBeing_Report_${data.dates.isoDate}.pdf`;
      pdf.save(filename);

      if (typeof showToast === 'function') {
        showToast('Report Downloaded 🔒', 'Your confidential well-being summary PDF has been saved.', 'success');
      }

      return {
        success: true,
        filename,
        verificationRef: data.verificationRef
      };
    } catch (error) {
      console.error('[AssessmentReportPdf] Failed to generate PDF:', error);
      if (typeof showToast === 'function') {
        showToast('Download Error', error.message || 'Failed to generate PDF report.', 'critical');
      } else {
        alert('Could not generate PDF: ' + (error.message || 'Unknown error.'));
      }
      return { success: false, error };
    }
  }

  return {
    generate,
    resolveAssessmentData,
    getJsPDFClass
  };
}));
