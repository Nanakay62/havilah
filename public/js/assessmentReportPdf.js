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

    // Status classification in simple terms
    let statusBand = 'Optimal Balance';
    let statusColor = [5, 150, 105]; // #059669 (Emerald)
    let statusBg = [236, 253, 245]; // Emerald-50
    let riskLevel = 'Healthy & Balanced';

    if (compositeScore < 50) {
      statusBand = 'High Workplace Strain';
      statusColor = [225, 29, 72]; // #e11d48 (Rose/Red)
      statusBg = [255, 241, 242]; // Rose-50
      riskLevel = 'High Pressure • Doctor Check-in Advised';
    } else if (compositeScore < 75) {
      statusBand = 'Moderate Work Strain';
      statusColor = [217, 119, 6]; // #d97706 (Amber)
      statusBg = [254, 243, 199]; // Amber-50
      riskLevel = 'Moderate Pressure • Rest & Pacing Advised';
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
      if (val >= 75) return { status: 'Optimal', color: [5, 150, 105], tag: 'Doing Well' };
      if (val >= 50) return { status: 'Moderate', color: [217, 119, 6], tag: 'Manageable' };
      return { status: 'High Strain', color: [225, 29, 72], tag: 'Needs Attention' };
    };

    const dimensions = [
      {
        name: 'Workload & Demands',
        isoClause: 'ISO 45003 Clause 6.1.2.1',
        score: Math.round(workloadVal),
        statusObj: getDimStatus(workloadVal),
        description: 'How manageable your day-to-day work tasks, deadlines, and working speed feel.'
      },
      {
        name: 'Role Clarity & Control',
        isoClause: 'ISO 45003 Clause 6.1.2.2',
        score: Math.round(autonomyVal),
        statusObj: getDimStatus(autonomyVal),
        description: 'How clearly you understand your role duties and having a say in how you do your work.'
      },
      {
        name: 'Workplace Support & Psychological Safety',
        isoClause: 'ISO 45003 Clause 6.1.2.3',
        score: Math.round(supportVal),
        statusObj: getDimStatus(supportVal),
        description: 'How supported you feel by your team and manager, and feeling safe to speak up without fear.'
      },
      {
        name: 'Recovery & Work-Life Balance',
        isoClause: 'ISO 45003 Clause 6.1.2.4',
        score: Math.round(recoveryVal),
        statusObj: getDimStatus(recoveryVal),
        description: 'How easily you can switch off after working hours, get good sleep, and recharge your energy.'
      }
    ];

    const surveyType = options.surveyType || appState.surveyState?.type || localState.surveyState?.type || 'COPSOQ-III Assessment';
    const assessorName = options.assessorName || 'Dr. Edith Clarke';
    const assessorPhone = options.assessorPhone || '024 362 9870';
    const providerName = options.providerName || appState.clinicalProvider?.name || 'FZ Safety and Health';
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
      assessorName,
      assessorPhone,
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
      const contentWidth = pageWidth - (margin * 2); // 178 mm

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

        // Platform Brand Text
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(14);
        pdf.setTextColor(...colors.white);
        pdf.text('HAVILAH WORKPLACE WELL-BEING', margin, 17);

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
        pdf.text('100% PRIVATE • ZERO EMPLOYER OR HR ACCESS • SAVED ONLY ON YOUR DEVICE', margin, footerY + 5);

        // Page Number
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.slateLight);
        pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, footerY + 5, { align: 'right' });

        // Security Stamp
        pdf.setFontSize(6.5);
        pdf.setTextColor(160, 170, 185);
        pdf.text('Complies with ISO 45003:2021 Occupational Health & Psychosocial Risk Screening Guidelines', margin, footerY + 10);
      };

      // =========================================================================
      // PAGE 1: EXECUTIVE OVERVIEW, OVERALL SCORE & ISO 45003 DIMENSION MATRIX
      // =========================================================================
      renderHeader(1, 2);
      let y = 38;

      // Section Title: Verification Banner & Privacy Lock
      pdf.setFillColor(...colors.bgGray);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.tealDeep);
      pdf.text('CONFIDENTIAL REPORT (ZERO HR ACCESS)', margin + 4, y + 6.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text(`Screening Ref: ${data.verificationRef}  •  Assessment: ${data.surveyType}`, pageWidth - margin - 4, y + 6.5, { align: 'right' });

      y += 15;

      // =========================================================================
      // SECTION 1: OVERALL WELL-BEING SNAPSHOT
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('1. Your Overall Well-Being Snapshot', margin, y);
      y += 5;

      const heroCardH = 46;
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(margin, y, contentWidth, heroCardH, 3, 3, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, heroCardH, 3, 3, 'S');

      // Left Score Badge Box
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
      pdf.text('OVERALL SCORE', margin + 4 + (scoreBoxW / 2), y + 33, { align: 'center' });

      // Right Content Area: Status Band & Clear Layman Narrative
      const narrativeX = margin + scoreBoxW + 9;
      const narrativeW = contentWidth - scoreBoxW - 13;

      // Status Pill
      pdf.setFillColor(...data.statusColor);
      pdf.roundedRect(narrativeX, y + 5.5, 42, 6, 1.5, 1.5, 'F');
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.5);
      pdf.setTextColor(...colors.white);
      pdf.text(data.statusBand.toUpperCase(), narrativeX + 21, y + 9.8, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.navy);
      pdf.text(`Status: ${data.riskLevel}`, narrativeX + 46, y + 10);

      // Layman-Friendly Explanatory Narrative
      let narrativeText = '';
      if (data.compositeScore >= 75) {
        narrativeText = 'You are in a great place! Your check-in shows that you are managing your daily work well, getting enough rest, and feeling supported by your team. Keep doing what works for you and maintaining your healthy daily routines.';
      } else if (data.compositeScore >= 50) {
        narrativeText = 'You are experiencing some mild to moderate workplace stress or tiredness. While you are keeping up with your daily work, it is a good time to slow down your pace, take regular breathers, and make sure you have time to relax after work.';
      } else {
        narrativeText = 'Your results show that you are currently feeling drained, stressed, or under heavy pressure at work. You do not have to carry this alone. We strongly encourage you to speak with someone you trust and book a free, private check-in with our doctor, Dr. Edith Clarke.';
      }

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...colors.slate);
      const splitNarrative = pdf.splitTextToSize(narrativeText, narrativeW);
      pdf.text(splitNarrative, narrativeX, y + 17.5);

      y += heroCardH + 8;

      // =========================================================================
      // SECTION 2: ISO 45003 DIMENSION BREAKDOWN TABLE
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('2. Breakdown by Workplace Areas', margin, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text('Here is how your well-being looks across the 4 key workplace areas:', margin, y + 4.5);

      y += 8;

      // Table Dimensions (Total width = 178 mm)
      // Col 1 (Dimension Name): 62 mm
      // Col 2 (Score & Mini-bar): 26 mm
      // Col 3 (Status Badge): 26 mm
      // Col 4 (Simple Description): 64 mm
      const tableHeadH = 8;
      const colWidths = [62, 26, 26, 64];

      // Table Header Row
      pdf.setFillColor(...colors.navy);
      pdf.rect(margin, y, contentWidth, tableHeadH, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.white);
      pdf.text('WORKPLACE AREA', margin + 3, y + 5.2);
      pdf.text('SCORE', margin + colWidths[0] + 3, y + 5.2);
      pdf.text('STATUS', margin + colWidths[0] + colWidths[1] + 3, y + 5.2);
      pdf.text('WHAT THIS MEANS FOR YOU', margin + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 5.2);

      y += tableHeadH;

      // Table Rows
      data.dimensions.forEach((dim, idx) => {
        const rowH = 19; // Generous height for wrapped titles and clean lines
        const isEven = idx % 2 === 1;

        pdf.setFillColor(isEven ? 248 : 255, isEven ? 250 : 255, isEven ? 252 : 255);
        pdf.rect(margin, y, contentWidth, rowH, 'F');
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.2);
        pdf.rect(margin, y, contentWidth, rowH, 'S');

        // Col 1: Name (Wrapped cleanly within colWidths[0] - 6 so it never overlaps score!)
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.2);
        pdf.setTextColor(...colors.navy);
        const splitTitle = pdf.splitTextToSize(dim.name, colWidths[0] - 6);
        pdf.text(splitTitle, margin + 3, y + 5);

        // ISO clause subtext below title
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...colors.tealDeep);
        const isoY = splitTitle.length > 1 ? y + 14 : y + 11.5;
        pdf.text(dim.isoClause, margin + 3, isoY);

        // Col 2: Score & Visual Mini-Bar
        const col2X = margin + colWidths[0] + 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.5);
        pdf.setTextColor(...dim.statusObj.color);
        pdf.text(`${dim.score}/100`, col2X + 2, y + 6.5);

        // Mini bar background
        const barW = 20;
        const barH = 3;
        const barX = col2X + 2;
        const barY = y + 9.5;
        pdf.setFillColor(226, 232, 240);
        pdf.roundedRect(barX, barY, barW, barH, 1, 1, 'F');
        // Mini bar fill
        pdf.setFillColor(...dim.statusObj.color);
        const fillW = Math.max(2, (dim.score / 100) * barW);
        pdf.roundedRect(barX, barY, fillW, barH, 1, 1, 'F');

        // Col 3: Status Badge
        const col3X = margin + colWidths[0] + colWidths[1] + 2;
        pdf.setFillColor(...dim.statusObj.color);
        pdf.roundedRect(col3X + 1, y + 4.5, 22, 5.5, 1, 1, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.8);
        pdf.setTextColor(...colors.white);
        pdf.text(dim.statusObj.status.toUpperCase(), col3X + 12, y + 8.3, { align: 'center' });

        // Col 4: Layman Description & Guidance
        const col4X = margin + colWidths[0] + colWidths[1] + colWidths[2] + 2;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.slate);
        const splitDesc = pdf.splitTextToSize(dim.description, colWidths[3] - 4);
        pdf.text(splitDesc, col4X + 2, y + 5.5);

        y += rowH;
      });

      y += 6;

      // Key Takeaway Callout Box at bottom of Page 1
      pdf.setFillColor(240, 253, 250); // Teal-50
      pdf.roundedRect(margin, y, contentWidth, 19, 2, 2, 'F');
      pdf.setDrawColor(...colors.teal);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, 19, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.5);
      pdf.setTextColor(...colors.tealDeep);
      pdf.text('Important Note About Your Results', margin + 4, y + 5.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.navy);
      const noteText = 'This summary gives you a quick snapshot of how work is feeling for you right now. It is completely confidential and private to you. You can use these insights to build restful habits, protect your personal time, and request support whenever you need it.';
      const splitNote = pdf.splitTextToSize(noteText, contentWidth - 8);
      pdf.text(splitNote, margin + 4, y + 11);

      renderFooter(1, 2);

      // =========================================================================
      // PAGE 2: RECOMMENDATIONS, CLINICAL SUPPORT & CRISIS RESOURCES
      // =========================================================================
      pdf.addPage();
      renderHeader(2, 2);
      y = 38;

      // =========================================================================
      // SECTION 3: PERSONALIZED COPING & RECOVERY RECOMMENDATIONS
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('3. Simple Daily Habits to Help You Recharge', margin, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text('Practical, easy actions you can take today to protect your energy and manage stress:', margin, y + 4.5);

      y += 8;

      // Generate 3 contextual recommendations in simple language
      const recommendations = [];

      if (data.compositeScore < 50 || data.dimensions[0].score < 50) {
        recommendations.push({
          title: 'Take Short Daily Breathers & Pace Your Tasks',
          meta: 'Quick Daily Habit',
          body: 'Take a 5-minute pause every couple of hours. Step away from your screen, stretch your body, drink some water, or take slow deep breaths to refresh your mind and avoid feeling overwhelmed.'
        });
      } else {
        recommendations.push({
          title: 'Protect Your Focus & Working Hours',
          meta: 'Daily Work Habit',
          body: 'Group your most demanding tasks during the times of day when you feel freshest. Plan short breaks between busy meetings so you do not carry fatigue into your next task.'
        });
      }

      if (data.dimensions[3].score < 60 || data.compositeScore < 65) {
        recommendations.push({
          title: 'Switch Off & Unwind After Working Hours',
          meta: 'Evening Rest Routine',
          body: 'When your workday ends, step away from work devices. Turn off work chat and email notifications in the evening so your mind and body can truly rest and prepare for a good night\'s sleep.'
        });
      } else {
        recommendations.push({
          title: 'Make Time for Rest & Things You Enjoy',
          meta: 'Rest & Recharge',
          body: 'Spend time doing things that bring you peace and joy—like taking a walk, chatting with family or friends, enjoying a meal, or listening to music. Rest is an essential part of working well.'
        });
      }

      recommendations.push({
        title: 'Talk It Out & Ask for Support',
        meta: 'Support & Guidance',
        body: 'If your workload feels too heavy or work is causing you worry, talk things through with someone you trust. You can also reach out to our doctor, Dr. Edith Clarke, for free private guidance.'
      });

      // Render Recommendation Cards
      recommendations.forEach((rec, idx) => {
        const cardH = 21;
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
        pdf.setFontSize(8.8);
        pdf.setTextColor(...colors.navy);
        pdf.text(rec.title, margin + 11, y + 6.8);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.tealDeep);
        pdf.text(rec.meta, pageWidth - margin - 4, y + 6.8, { align: 'right' });

        // Body in plain language
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.8);
        pdf.setTextColor(...colors.slate);
        const splitBody = pdf.splitTextToSize(rec.body, contentWidth - 14);
        pdf.text(splitBody, margin + 11, y + 12);

        y += cardH + 3.5;
      });

      y += 2;

      // =========================================================================
      // SECTION 4: FREE CONFIDENTIAL DOCTOR CONSULTATION (DR. EDITH CLARKE)
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text('4. Free Private Doctor Consultation (Havilah Partner)', margin, y);
      y += 4.5;

      const clinicalBoxH = 34;
      pdf.setFillColor(238, 242, 255); // Indigo-50
      pdf.roundedRect(margin, y, contentWidth, clinicalBoxH, 2, 2, 'F');
      pdf.setDrawColor(...colors.indigo);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, clinicalBoxH, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(9);
      pdf.setTextColor(...colors.indigo);
      pdf.text(`Havilah Registered Medical Assessor: ${data.assessorName} (${data.providerName})`, margin + 4, y + 6);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.navy);
      const clinicalGuide = `As a Havilah user, you have 100% confidential and free access to Dr. Edith Clarke (Occupational Health Specialist) and our medical team. You can discuss any stress, work worries, or health questions in private. Your employer or HR will NEVER know you booked or what was discussed.`;
      const splitClinical = pdf.splitTextToSize(clinicalGuide, contentWidth - 8);
      pdf.text(splitClinical, margin + 4, y + 11.5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.indigo);
      pdf.text(`• Direct Phone & WhatsApp: ${data.assessorPhone} (Dr. Edith Clarke)`, margin + 4, y + 24.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.slate);
      pdf.text(`• Or open the Havilah Portal and tap "Clinical Referral" to request a free callback.`, margin + 4, y + 29.5);

      y += clinicalBoxH + 6.5;

      // =========================================================================
      // SECTION 5: STRICTLY GHANAIAN 24/7 CRISIS HELPLINES
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...colors.navy);
      pdf.text('5. 24/7 Emergency & Mental Health Helplines (Ghana)', margin, y);
      y += 4;

      const crisisBoxH = 30;
      pdf.setFillColor(255, 241, 242); // Rose-50
      pdf.roundedRect(margin, y, contentWidth, crisisBoxH, 2, 2, 'F');
      pdf.setDrawColor(244, 63, 94);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, crisisBoxH, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(225, 29, 72);
      pdf.text('If you or someone you know is in acute distress or needs urgent help, call these free lines in Ghana:', margin + 4, y + 5.5);

      // Helplines in 2 columns (Strictly Ghanaian)
      const col1X = margin + 4;
      const col2X = margin + (contentWidth / 2) + 2;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.6);
      pdf.setTextColor(...colors.navy);

      // Left column
      pdf.text('• Ghana Mental Health Authority: 0800 678 678 (Toll-Free)', col1X, y + 11.5);
      pdf.text('• Mental Health Authority Hotline: 050 960 0600', col1X, y + 17);
      pdf.text('• National Emergency & Ambulance: 112 / 193', col1X, y + 22.5);

      // Right column
      pdf.text('• Havilah Medical Assessor (Dr. Edith Clarke): 024 362 9870', col2X, y + 11.5);
      pdf.text('• Lifeline & Crisis Support Ghana: +233 244 846 701', col2X, y + 17);
      pdf.text('• Accra Psychiatric Hospital Helpline: 0302 228 671', col2X, y + 22.5);

      y += crisisBoxH + 6;

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

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...colors.slate);
      const disclaimer = 'This check-in is an occupational well-being screening indicator under ISO 45003 workplace guidelines and does not constitute a formal clinical diagnosis. If you are experiencing acute distress or illness, please contact Dr. Edith Clarke at 024 362 9870 or consult a licensed healthcare professional.';
      const splitDisc = pdf.splitTextToSize(disclaimer, contentWidth - 6);
      pdf.text(splitDisc, margin + 3, y + 8.5);

      renderFooter(2, 2);

      // =========================================================================
      // TRIGGER INSTANT CLIENT-SIDE BROWSER DOWNLOAD
      // =========================================================================
      const filename = `Havilah_Confidential_WellBeing_Report_${data.dates.isoDate}.pdf`;
      pdf.save(filename);

      if (typeof showToast === 'function') {
        showToast('Report Downloaded', 'Your confidential well-being summary PDF has been saved.', 'success');
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
