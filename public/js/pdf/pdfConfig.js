/**
 * @fileoverview pdfConfig.js
 * Shared design tokens, score bands, typography scale, copy constants,
 * and clinic profile resolution for all Havilah clinical & wellbeing PDFs.
 *
 * Pilot-launch rule: Never hardcode fake clinic registration numbers,
 * addresses, phone numbers, or clinician credentials. Unconfigured clinic
 * fields are omitted cleanly until populated from the clinic profile.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HavilahPdfConfig = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 4 pt baseline rhythm in mm (1 pt = 0.352778 mm)
  const PT = 0.352778;
  const BASELINE = 4 * PT; // 1.4111 mm

  const PAGE = {
    format: 'a4',
    orientation: 'portrait',
    width: 210,
    height: 297,
    margin: 18,
    contentWidth: 174, // 210 - 36
    columns: 12,
    gutter: 4,
    // (174 - 11 * 4) / 12 = 10.8333 mm per column
    colWidth: (174 - (11 * 4)) / 12,
    baseline: BASELINE,
    ruleWidth: 0.5 * PT, // 0.5 pt = 0.176 mm
    accentRuleWidth: 0.75 * PT // 0.75 pt = 0.265 mm
  };

  // Neutral ink + grays + ONE brand accent (deep teal #0F6E6E)
  const COLORS = {
    ink: [26, 31, 43],          // #1A1F2B (contrast > 15:1 on white)
    muted: [91, 100, 114],      // #5B6472 (contrast 5.9:1 on white)
    rule: [227, 230, 234],      // #E3E6EA
    panelBg: [247, 248, 250],   // #F7F8FA (subtle neutral panel, max 1 per page)
    barTrack: [236, 239, 243],  // #ECEFF3
    white: [255, 255, 255],
    accent: [15, 110, 110],     // #0F6E6E (deep teal, contrast 6.1:1 on white)
    accentSoft: [238, 246, 246] // #EEF6F6 (ultra-subtle tint if needed)
  };

  // Unified 3-band score system (higher = healthier, 0-100 scale)
  // Muted hues, each >= 4.5:1 contrast on white
  const SCORE_BANDS = [
    {
      key: 'needs_attention',
      min: 0,
      max: 39,
      rangeLabel: '0–39',
      label: 'Needs attention',
      color: [158, 59, 51],   // Muted terracotta #9E3B33 (6.5:1 on white)
      tint: [250, 242, 241]   // Subtle wash
    },
    {
      key: 'moderate',
      min: 40,
      max: 69,
      rangeLabel: '40–69',
      label: 'Moderate',
      color: [138, 90, 25],   // Muted ochre #8A5A19 (5.8:1 on white)
      tint: [250, 246, 238]   // Subtle wash
    },
    {
      key: 'healthy',
      min: 70,
      max: 100,
      rangeLabel: '70–100',
      label: 'Healthy',
      color: [30, 107, 82],   // Muted sage #1E6B52 (6.3:1 on white)
      tint: [240, 247, 244]   // Subtle wash
    }
  ];

  // Strict typography scale: 20 / 14 / 11 / 9.5 / 8 pt
  const TYPE = {
    hero: 20,
    heading: 14,
    subheading: 11,
    body: 9.5,
    label: 8
  };

  const COPY = {
    brandName: 'Havilah',
    brandSubtitle: 'Workplace Well-being & Occupational Health',
    // Calm privacy sentence stated ONCE per wellbeing/module document
    wellbeingPrivacyLine: 'Confidential personal record generated on your device; your employer and HR do not have access to this report.',
    // Quiet non-diagnostic footnote for wellbeing/module reports
    nonDiagnosticFootnote: 'Screening indicator only; this report is not a clinical diagnosis. Speak with a qualified clinician if symptoms persist or worsen.',
    // Single privacy-basis line for Medical Excuse Duty Certificates (diagnosis omitted)
    certificatePrivacyBasis: 'Clinical diagnosis and medical notes are omitted in accordance with the Ghana Data Protection Act, 2012 (Act 843) and ISO 45003 confidentiality standards. Issued electronically under the Ghana Electronic Transactions Act, 2008 (Act 772).',
    // Explicit consent basis when privacy omission is unchecked by clinician with patient consent
    certificateConsentedBasis: 'Clinical remarks are included with the patient\'s informed consent in accordance with the Ghana Data Protection Act, 2012 (Act 843). Issued electronically under the Ghana Electronic Transactions Act, 2008 (Act 772).',
    // Public national helplines (Ghana)
    publicHelplines: [
      { name: 'Ghana Mental Health Authority (Toll-Free)', contact: '0800 678 678' },
      { name: 'Mental Health Authority Helpline', contact: '050 960 0600' },
      { name: 'National Emergency / Ambulance', contact: '112 / 193' },
      { name: 'Lifeline & Crisis Support Ghana', contact: '+233 244 846 701' }
    ]
  };

  /**
   * Resolve a 0-100 score (higher = healthier) into its canonical band.
   */
  function getScoreBand(score) {
    const n = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    if (n <= 39) return SCORE_BANDS[0];
    if (n <= 69) return SCORE_BANDS[1];
    return SCORE_BANDS[2];
  }

  /**
   * Convert a column span on the 12-column grid to x & width in mm.
   * @param {number} startCol 1-based column index (1..12)
   * @param {number} span number of columns (1..12)
   */
  function gridCol(startCol, span) {
    const s = Math.max(1, Math.min(PAGE.columns, startCol));
    const wCols = Math.max(1, Math.min(PAGE.columns - s + 1, span));
    const x = PAGE.margin + (s - 1) * (PAGE.colWidth + PAGE.gutter);
    const width = wCols * PAGE.colWidth + (wCols - 1) * PAGE.gutter;
    return { x, width };
  }

  /**
   * Multiple of 4 pt baseline rhythm in mm.
   */
  function r(units) {
    return units * PAGE.baseline;
  }

  /**
   * Clean clinic profile object without inventing missing fields.
   */
  function resolveClinicProfile(input = {}) {
    const clean = (v) => (v === undefined || v === null) ? '' : String(v).trim();
    return {
      clinicName: clean(input.clinicName || input.organization),
      practiceRegistrationNumber: clean(input.practiceRegistrationNumber || input.licenseNumber),
      address: clean(input.address || input.clinicAddress),
      phone: clean(input.phone || input.clinicPhone),
      email: clean(input.email || input.clinicEmail),
      clinicianName: clean(input.clinicianName),
      clinicianSpecialty: clean(input.clinicianSpecialty),
      mdcNumber: clean(input.mdcNumber),
      signatureDataUrl: clean(input.signatureDataUrl),
      signatureApproved: Boolean(input.signatureApproved && clean(input.signatureDataUrl)),
      stampDataUrl: clean(input.stampDataUrl),
      stampApproved: Boolean(input.stampApproved && clean(input.stampDataUrl)),
      clinicLogoDataUrl: clean(input.clinicLogoDataUrl),
      clinicWatermarkDataUrl: clean(input.clinicWatermarkDataUrl)
    };
  }

  return {
    PT,
    PAGE,
    COLORS,
    SCORE_BANDS,
    TYPE,
    COPY,
    getScoreBand,
    gridCol,
    r,
    resolveClinicProfile
  };
}));
