/**
 * @fileoverview assessmentReportPdf.js
 * Client-side confidential employee well-being & ISO 45003 PDF report generator.
 *
 * Generates clinical-grade, offline-first A4 PDFs via jsPDF for:
 * - Overall Wellbeing Summary (5-pillar composite)
 * - Individual Modules: PHQ-9, GAD-7, PSS-10, FAS-10, COPSOQ-III (ISO 45003)
 *
 * Uses shared design tokens, embedded Inter typography, unified 3-band scale
 * (0-39 Needs attention, 40-69 Moderate, 70-100 Healthy), and reusable components.
 * Generated 100% on-device; no assessment answers or PDFs are ever transmitted to HR.
 */

(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define(['./pdf/pdfConfig', './pdf/pdfFonts', './pdf/pdfComponents'], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./pdf/pdfConfig'),
      require('./pdf/pdfFonts'),
      require('./pdf/pdfComponents')
    );
  } else {
    root.AssessmentReportPdf = factory(
      root.HavilahPdfConfig,
      root.HavilahPdfFonts,
      root.HavilahPdfComponents
    );
    root.generateAssessmentReportPdf = root.AssessmentReportPdf.generate;
  }
}(typeof self !== 'undefined' ? self : this, function (Config, Fonts, Components) {
  'use strict';

  const { PAGE, COLORS, TYPE, COPY, getScoreBand, r, resolveClinicProfile } = Config;

  function loadScript(src) {
    return new Promise((resolve) => {
      if (typeof document === 'undefined') return resolve();
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

  async function getJsPDFClass() {
    let jsPDFClass = (typeof window !== 'undefined' && ((window.jspdf && window.jspdf.jsPDF) || window.jsPDF))
      || (typeof global !== 'undefined' && global.window && global.window.jspdf && global.window.jspdf.jsPDF)
      || null;
    if (!jsPDFClass && typeof document !== 'undefined') {
      await loadScript('/js/vendor/jspdf.umd.min.js');
      jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    }
    return jsPDFClass;
  }

  function getDateInfo(d = new Date()) {
    const dateObj = (d instanceof Date) ? d : new Date(d);
    const day = String(dateObj.getDate()).padStart(2, '0');
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const year = dateObj.getFullYear();
    const formatted = dateObj.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
    const isoDate = `${year}-${month}-${day}`;
    return { formatted, isoDate };
  }

  function generateVerificationRef() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c1 = '';
    let c2 = '';
    for (let i = 0; i < 4; i++) {
      c1 += chars.charAt(Math.floor(Math.random() * chars.length));
      c2 += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `HAV-WB-${c1}-${c2}`;
  }

  function normalizeModuleKey(rawType) {
    const s = String(rawType || '').trim().toLowerCase();
    if (s === 'overall' || s === 'composite' || s === 'all' || s === 'summary') return 'overall';
    if (s.includes('phq')) return 'phq9';
    if (s.includes('gad')) return 'gad7';
    if (s.includes('pss')) return 'pss10';
    if (s.includes('fas')) return 'fas10';
    if (s.includes('copsoq')) return 'copsoq3';
    return 'overall';
  }

  function getClinicalPdfBand(moduleKey, rawScore, isCrisisFlag) {
    if (moduleKey === 'phq9') {
      if (isCrisisFlag) return Object.assign({}, Config.SCORE_BANDS[0], { label: 'Immediate support' });
      if (rawScore >= 20) return Object.assign({}, Config.SCORE_BANDS[0], { label: 'Severe' });
      if (rawScore >= 15) return Object.assign({}, Config.SCORE_BANDS[0], { label: 'Moderately severe' });
      if (rawScore >= 10) return Object.assign({}, Config.SCORE_BANDS[1], { label: 'Moderate' });
      if (rawScore >= 5) return Object.assign({}, Config.SCORE_BANDS[1], { label: 'Mild' });
      return Object.assign({}, Config.SCORE_BANDS[2], { label: 'Minimal' });
    }
    if (moduleKey === 'gad7') {
      if (rawScore >= 15) return Object.assign({}, Config.SCORE_BANDS[0], { label: 'Severe' });
      if (rawScore >= 10) return Object.assign({}, Config.SCORE_BANDS[1], { label: 'Moderate' });
      if (rawScore >= 5) return Object.assign({}, Config.SCORE_BANDS[1], { label: 'Mild' });
      return Object.assign({}, Config.SCORE_BANDS[2], { label: 'Minimal' });
    }
    if (moduleKey === 'pss10') {
      if (rawScore >= 27) return Object.assign({}, Config.SCORE_BANDS[0], { label: 'High stress' });
      if (rawScore >= 14) return Object.assign({}, Config.SCORE_BANDS[1], { label: 'Moderate stress' });
      return Object.assign({}, Config.SCORE_BANDS[2], { label: 'Low stress' });
    }
    if (moduleKey === 'fas10') {
      if (rawScore >= 35) return Object.assign({}, Config.SCORE_BANDS[0], { label: 'Substantial fatigue' });
      if (rawScore >= 22) return Object.assign({}, Config.SCORE_BANDS[1], { label: 'Moderate fatigue' });
      return Object.assign({}, Config.SCORE_BANDS[2], { label: 'No fatigue' });
    }
    return getScoreBand(rawScore);
  }

  function sumIndices(arr, indices, reverseIndices = null, reverseBase = 0) {
    return indices.reduce((acc, idx) => {
      const v = Number(arr[idx]);
      if (!Number.isFinite(v)) return acc;
      if (reverseIndices && reverseIndices.includes(idx)) {
        return acc + (reverseBase - v);
      }
      return acc + v;
    }, 0);
  }

  /**
   * Resolve clinical provider contact from options or active runtime app state.
   * Pilot-launch rule: never invent fake phone numbers or clinician names.
   */
  function resolveSupportClinic(options, appState) {
    const provider = (appState && appState.clinicalProvider) || {};
    return resolveClinicProfile({
      clinicName: options.providerName || options.clinicName || provider.provider_name || provider.name || '',
      clinicianName: options.assessorName || options.clinicianName || provider.clinician_name || '',
      phone: options.assessorPhone || options.clinicPhone || provider.hotline || provider.phone || '',
      email: options.clinicEmail || provider.intake_email || provider.email || ''
    });
  }

  /**
   * Build structured view model for Wellbeing Summary or any Individual Module.
   */
  function resolveAssessmentData(options = {}) {
    const appState = (typeof window !== 'undefined' && window.App && window.App.state) || {};
    const localState = (typeof state !== 'undefined' && state) || {};

    const rawSurveyType = options.surveyType || appState.surveyState?.type || localState.surveyState?.type || 'overall';
    const moduleKey = normalizeModuleKey(rawSurveyType);
    const answers = Array.isArray(options.answers) ? options.answers.map((v) => Number(v)) : null;

    const dates = getDateInfo(options.date || new Date());
    const verificationRef = options.verificationRef || generateVerificationRef();
    const clinic = resolveSupportClinic(options, appState);

    // -------------------------------------------------------------------------
    // MODULE 1: PHQ-9 (Depression Self-Check, 9 items, 0-27)
    // -------------------------------------------------------------------------
    if (moduleKey === 'phq9') {
      const hasFullAnswers = answers && answers.length >= 9;
      const rawScore = options.rawScore !== undefined
        ? Math.max(0, Math.min(27, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6, 7, 8])
          : Math.round(((100 - (options.score ?? 70)) / 100) * 27));

      const wellbeingScore = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - (rawScore / 27) * 100)));

      const q9Val = hasFullAnswers ? (Number(answers[8]) || 0) : (options.isCrisisQ9 ? 1 : 0);
      const isCrisisFlag = Boolean(options.isCrisisQ9 || q9Val >= 1);
      const band = getClinicalPdfBand('phq9', rawScore, isCrisisFlag);

      let interpretation = '';
      if (isCrisisFlag) {
        interpretation = 'Your response on Question 9 indicates thoughts of self-harm or distress; please connect with confidential clinical support or a helpline today.';
      } else if (band.key === 'healthy') {
        interpretation = 'Your PHQ-9 check-in indicates minimal depressive symptoms over the past two weeks and a steady mood baseline.';
      } else if (band.key === 'moderate') {
        interpretation = 'Your PHQ-9 check-in indicates mild-to-moderate low mood or energy strain that would benefit from structured recovery and a private clinical check-in.';
      } else {
        interpretation = 'Your PHQ-9 check-in indicates elevated depressive symptoms affecting daily functioning; prompt, confidential clinical support is recommended.';
      }

      const phqClusters = [
        { name: 'Mood & interest', subtext: 'Items 1–2 (Core mood)', indices: [0, 1], max: 6, desc: 'Interest or pleasure in activities and low mood.' },
        { name: 'Sleep, energy & appetite', subtext: 'Items 3–5 (Physical)', indices: [2, 3, 4], max: 9, desc: 'Sleep quality, fatigue, and appetite shifts.' },
        { name: 'Self-worth & concentration', subtext: 'Items 6–7 (Cognitive)', indices: [5, 6], max: 6, desc: 'Self-criticism and day-to-day focus.' },
        { name: 'Psychomotor & safety', subtext: 'Items 8–9 (Movement & safety)', indices: [7, 8], max: 6, desc: 'Restlessness/slowing and safety check (Item 9).' }
      ];

      const rows = phqClusters.map((g) => {
        const subRaw = hasFullAnswers ? sumIndices(answers, g.indices) : null;
        const clusterIndex = subRaw !== null ? Math.round(100 - (subRaw / g.max) * 100) : wellbeingScore;
        const rowBand = (g.indices.includes(8) && isCrisisFlag) ? Config.SCORE_BANDS[0] : getScoreBand(clusterIndex);
        return {
          name: g.name,
          subtext: g.subtext,
          scoreText: subRaw !== null ? `${subRaw} / ${g.max}` : 'Included',
          barPct: clusterIndex,
          barScore: clusterIndex,
          band: rowBand,
          bandLabel: (g.indices.includes(8) && isCrisisFlag) ? 'Needs attention' : rowBand.label,
          description: g.desc
        };
      });

      const actions = isCrisisFlag || band.key === 'needs_attention'
        ? [
            { title: 'Speak with an occupational health clinician today', timeframe: 'Immediate', body: 'Use the confidential clinic contact or helplines below for private, non-judgmental support.' },
            { title: 'Reduce non-essential commitments this week', timeframe: 'This week', body: 'Protect basic sleep, meals, and short recovery breaks while you connect with care.' },
            { title: 'Share this summary only with your clinician', timeframe: 'Optional', body: 'Bringing this 1-page record to your appointment helps your doctor tailor support.' }
          ]
        : band.key === 'moderate'
          ? [
              { title: 'Schedule a confidential clinical check-in', timeframe: 'Within 1–2 weeks', body: 'A brief private conversation can help address persistent low energy before it builds.' },
              { title: 'Anchor sleep and light daily movement', timeframe: 'Daily', body: 'Consistent wake times and a 15-minute walk support mood regulation and concentration.' },
              { title: 'Re-check PHQ-9 in two weeks', timeframe: 'In 14 days', body: 'Repeat this check-in to track whether symptoms are easing or need follow-up.' }
            ]
          : [
              { title: 'Maintain your current restorative routines', timeframe: 'Ongoing', body: 'Keep protecting the sleep, movement, and social habits supporting your baseline.' },
              { title: 'Note early signs of overload', timeframe: 'Weekly', body: 'Watch for consecutive nights of poor sleep or persistent afternoon exhaustion.' },
              { title: 'Repeat check-in next cycle', timeframe: 'Monthly', body: 'Periodic check-ins help confirm your mood baseline stays steady.' }
            ];

      return {
        moduleKey,
        displayTitle: 'PHQ-9 mood screening',
        filenameSlug: 'PHQ9',
        dates,
        verificationRef,
        clinic,
        wellbeingScore,
        band,
        prominentHelplines: band.key === 'needs_attention' || isCrisisFlag,
        hero: {
          metricLabel: 'PHQ-9 SCORE',
          primaryValue: `${rawScore}/27`,
          secondaryValue: `Wellbeing index: ${wellbeingScore}/100`,
          clinicalSubLabel: isCrisisFlag ? 'Item 9 safety check flagged' : `Raw PHQ-9 total ${rawScore} of 27 (lower raw score = fewer symptoms)`,
          interpretation
        },
        actions,
        tableTitle: 'Symptom cluster breakdown',
        tableSubtitle: hasFullAnswers
          ? `Your ${rawScore}/27 raw total reconciled across the four PHQ-9 symptom clusters (bars reflect 0–100 wellbeing index).`
          : 'Overview of the four PHQ-9 symptom clusters.',
        tableHeaders: ['SYMPTOM CLUSTER', 'RAW SCORE', 'BAND', 'FOCUS AREA'],
        rows,
        indexFootnote: 'Wellbeing index conversion: 100 - (PHQ-9 raw score / 27 x 100). Badge uses published PHQ-9 cutoffs; gauge shows 0-100 wellbeing index.'
      };
    }

    // -------------------------------------------------------------------------
    // MODULE 2: GAD-7 (Anxiety Self-Check, 7 items, 0-21)
    // -------------------------------------------------------------------------
    if (moduleKey === 'gad7') {
      const hasFullAnswers = answers && answers.length >= 7;
      const rawScore = options.rawScore !== undefined
        ? Math.max(0, Math.min(21, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6])
          : Math.round(((100 - (options.score ?? 70)) / 100) * 21));

      const wellbeingScore = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - (rawScore / 21) * 100)));

      const band = getClinicalPdfBand('gad7', rawScore, false);
      const interpretation = band.key === 'healthy'
        ? 'Your GAD-7 check-in indicates minimal anxiety symptoms over the past two weeks and good day-to-day composure.'
        : band.key === 'moderate'
          ? 'Your GAD-7 check-in indicates mild-to-moderate worry or tension that can be eased with structured decompression and optional clinical guidance.'
          : 'Your GAD-7 check-in indicates elevated anxiety symptoms likely affecting rest or focus; confidential clinical support is recommended.';

      const gadClusters = [
        { name: 'Nervousness & worry control', subtext: 'Items 1–3 (Cognitive worry)', indices: [0, 1, 2], max: 9, desc: 'Feeling on edge and difficulty setting worry aside.' },
        { name: 'Tension & restlessness', subtext: 'Items 4–5 (Physical activation)', indices: [3, 4], max: 6, desc: 'Trouble relaxing physically or sitting still.' },
        { name: 'Irritability & apprehension', subtext: 'Items 6–7 (Emotional strain)', indices: [5, 6], max: 6, desc: 'Becoming easily annoyed or anticipating something going wrong.' }
      ];

      const rows = gadClusters.map((g) => {
        const subRaw = hasFullAnswers ? sumIndices(answers, g.indices) : null;
        const clusterIndex = subRaw !== null ? Math.round(100 - (subRaw / g.max) * 100) : wellbeingScore;
        const rowBand = getScoreBand(clusterIndex);
        return {
          name: g.name,
          subtext: g.subtext,
          scoreText: subRaw !== null ? `${subRaw} / ${g.max}` : 'Included',
          barPct: clusterIndex,
          barScore: clusterIndex,
          band: rowBand,
          description: g.desc
        };
      });

      const actions = band.key === 'needs_attention'
        ? [
            { title: 'Book a confidential occupational health check-in', timeframe: 'This week', body: 'Private clinical support can help reduce persistent physical tension and worry cycles.' },
            { title: 'Use a 4-minute paced breathing reset twice daily', timeframe: 'Daily', body: 'Slow exhales (4s inhale, 6s exhale) down-regulate autonomic stress arousal.' },
            { title: 'Limit late-evening work messages and caffeine', timeframe: 'Evenings', body: 'Creating a 60-minute wind-down buffer protects overnight recovery.' }
          ]
        : band.key === 'moderate'
          ? [
              { title: 'Contain worry into one 10-minute planning window', timeframe: 'Daily', body: 'Write down open work concerns once per afternoon rather than carrying them into the evening.' },
              { title: 'Take two 3-minute breathing pauses during work', timeframe: 'Workdays', body: 'Short physiological resets prevent shoulder tension and cognitive fatigue from accumulating.' },
              { title: 'Re-check GAD-7 in two weeks', timeframe: 'In 14 days', body: 'Track whether tension settles or if a brief clinical conversation would help.' }
            ]
          : [
              { title: 'Keep your current recovery boundaries', timeframe: 'Ongoing', body: 'Your routines are keeping anxiety low; maintain clear end-of-day transitions.' },
              { title: 'Protect deep-focus blocks', timeframe: 'Workdays', body: 'Batching notifications prevents unnecessary low-grade alertness.' },
              { title: 'Repeat check-in next cycle', timeframe: 'Monthly', body: 'Re-check periodically during high-demand work periods.' }
            ];

      return {
        moduleKey,
        displayTitle: 'GAD-7 anxiety screening',
        filenameSlug: 'GAD7',
        dates,
        verificationRef,
        clinic,
        wellbeingScore,
        band,
        prominentHelplines: band.key === 'needs_attention',
        hero: {
          metricLabel: 'GAD-7 SCORE',
          primaryValue: `${rawScore}/21`,
          secondaryValue: `Wellbeing index: ${wellbeingScore}/100`,
          clinicalSubLabel: `Raw GAD-7 total ${rawScore} of 21 (lower raw score = fewer symptoms)`,
          interpretation
        },
        actions,
        tableTitle: 'Anxiety cluster breakdown',
        tableSubtitle: hasFullAnswers
          ? `Your ${rawScore}/21 raw total reconciled across the three GAD-7 clusters (bars reflect 0–100 wellbeing index).`
          : 'Overview of the three GAD-7 anxiety clusters.',
        tableHeaders: ['ANXIETY CLUSTER', 'RAW SCORE', 'BAND', 'FOCUS AREA'],
        rows,
        indexFootnote: 'Wellbeing index conversion: 100 - (GAD-7 raw score / 21 x 100). Badge uses published GAD-7 cutoffs; gauge shows 0-100 wellbeing index.'
      };
    }

    // -------------------------------------------------------------------------
    // MODULE 3: PSS-10 (Perceived Stress Scale, 10 items, 0-40)
    // -------------------------------------------------------------------------
    if (moduleKey === 'pss10') {
      const hasFullAnswers = answers && answers.length >= 10;
      const reverseIdx = [3, 4, 6, 7];
      const rawScore = options.rawScore !== undefined
        ? Math.max(0, Math.min(40, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], reverseIdx, 4)
          : Math.round(((100 - (options.score ?? 65)) / 100) * 40));

      const wellbeingScore = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - (rawScore / 40) * 100)));

      const band = getClinicalPdfBand('pss10', rawScore, false);
      const interpretation = band.key === 'healthy'
        ? 'Your PSS-10 check-in reflects manageable day-to-day stress and solid confidence handling unexpected demands.'
        : band.key === 'moderate'
          ? 'Your PSS-10 check-in reflects moderate perceived stress; tightening workload boundaries and recovery time is advised.'
          : 'Your PSS-10 check-in reflects high perceived stress and feeling stretched thin; active workload decompression and clinical support are advised.';

      const pssClusters = [
        { name: 'Perceived helplessness & overload', subtext: 'Items 1, 2, 3, 6, 9, 10', indices: [0, 1, 2, 5, 8, 9], rev: null, max: 24, desc: 'Feeling overwhelmed by unexpected events or piling demands.' },
        { name: 'Coping confidence & self-efficacy', subtext: 'Items 4, 5, 7, 8 (Reverse-scored)', indices: [3, 4, 6, 7], rev: [3, 4, 6, 7], max: 16, desc: 'Confidence in handling personal and workplace pressures.' }
      ];

      const rows = pssClusters.map((g) => {
        const subRaw = hasFullAnswers ? sumIndices(answers, g.indices, g.rev, 4) : null;
        const clusterIndex = subRaw !== null ? Math.round(100 - (subRaw / g.max) * 100) : wellbeingScore;
        const rowBand = getScoreBand(clusterIndex);
        return {
          name: g.name,
          subtext: g.subtext,
          scoreText: subRaw !== null ? `${subRaw} / ${g.max}` : 'Included',
          barPct: clusterIndex,
          barScore: clusterIndex,
          band: rowBand,
          description: g.desc
        };
      });

      const actions = band.key === 'needs_attention'
        ? [
            { title: 'Discuss stress load with a clinician', timeframe: 'This week', body: 'A confidential occupational health consult can help identify practical recovery adjustments.' },
            { title: 'Audit your top three daily stressors', timeframe: 'Today', body: 'Identify one recurring task you can defer, delegate, or simplify this week.' },
            { title: 'Protect one uninterrupted off-screen hour each evening', timeframe: 'Daily', body: 'Consistent mental detachment is essential for lowering baseline stress reactivity.' }
          ]
        : [
            { title: 'Prioritize the top three deliverables each morning', timeframe: 'Workdays', body: 'Explicitly capping daily priorities restores perceived control over workload.' },
            { title: 'Take a full away-from-desk lunch break', timeframe: 'Daily', body: 'Brief mid-day detachment lowers afternoon cortisol and preserves decision quality.' },
            { title: 'Re-check PSS-10 next month', timeframe: 'In 30 days', body: 'Track whether stress resilience improves after adjusting your routine.' }
          ];

      return {
        moduleKey,
        displayTitle: 'PSS-10 perceived stress screening',
        filenameSlug: 'PSS10',
        dates,
        verificationRef,
        clinic,
        wellbeingScore,
        band,
        prominentHelplines: band.key === 'needs_attention',
        hero: {
          metricLabel: 'PSS-10 SCORE',
          primaryValue: `${rawScore}/40`,
          secondaryValue: `Wellbeing index: ${wellbeingScore}/100`,
          clinicalSubLabel: `Raw PSS-10 total ${rawScore} of 40 (lower raw score = lower perceived stress)`,
          interpretation
        },
        actions,
        tableTitle: 'Stress resilience subscales',
        tableSubtitle: hasFullAnswers
          ? `Your ${rawScore}/40 total reconciled across helplessness and coping subscales.`
          : 'Overview of the two PSS-10 subscales.',
        tableHeaders: ['SUBSCALE', 'RAW SCORE', 'BAND', 'FOCUS AREA'],
        rows,
        indexFootnote: 'Wellbeing index conversion: 100 - (PSS-10 raw score / 40 x 100). Items 4, 5, 7, and 8 are reverse-scored; badge reflects Cohen et al. cutoffs.'
      };
    }

    // -------------------------------------------------------------------------
    // MODULE 4: FAS-10 (Fatigue Assessment Scale, 10 items, 10-50)
    // -------------------------------------------------------------------------
    if (moduleKey === 'fas10') {
      const hasFullAnswers = answers && answers.length >= 10;
      const reverseIdx = [3, 9];
      const rawScore = options.rawScore !== undefined
        ? Math.max(10, Math.min(50, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], reverseIdx, 6)
          : Math.round(10 + ((100 - (options.score ?? 65)) / 100) * 40));

      const wellbeingScore = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - ((rawScore - 10) / 40) * 100)));

      const band = getClinicalPdfBand('fas10', rawScore, false);
      const interpretation = band.key === 'healthy'
        ? 'Your FAS-10 check-in indicates healthy physical stamina and clear mental energy with minimal fatigue.'
        : band.key === 'moderate'
          ? 'Your FAS-10 check-in indicates moderate physical or mental fatigue; prioritizing sleep recovery and pacing is recommended.'
          : 'Your FAS-10 check-in indicates substantial persistent fatigue; a confidential medical review is advised to rule out underlying causes.';

      const fasClusters = [
        { name: 'Physical fatigue & stamina', subtext: 'Items 1, 2, 4, 5, 10 (Physical)', indices: [0, 1, 3, 4, 9], rev: [3, 9], min: 5, max: 25, desc: 'Physical exhaustion, quick tiring, and baseline daily energy.' },
        { name: 'Mental fatigue & concentration', subtext: 'Items 3, 6, 7, 8, 9 (Cognitive)', indices: [2, 5, 6, 7, 8], rev: null, min: 5, max: 25, desc: 'Mental exhaustion, motivation to start tasks, and clear thinking.' }
      ];

      const rows = fasClusters.map((g) => {
        const subRaw = hasFullAnswers ? sumIndices(answers, g.indices, g.rev, 6) : null;
        const clusterIndex = subRaw !== null ? Math.round(100 - ((subRaw - g.min) / (g.max - g.min)) * 100) : wellbeingScore;
        const rowBand = getScoreBand(clusterIndex);
        return {
          name: g.name,
          subtext: g.subtext,
          scoreText: subRaw !== null ? `${subRaw} / ${g.max}` : 'Included',
          barPct: clusterIndex,
          barScore: clusterIndex,
          band: rowBand,
          description: g.desc
        };
      });

      const actions = band.key === 'needs_attention'
        ? [
            { title: 'Arrange a confidential medical review', timeframe: 'This week', body: 'Persistent exhaustion warrants a private check-in to evaluate sleep, stress, or nutritional factors.' },
            { title: 'Protect 7–8 hours of regular sleep', timeframe: 'Nightly', body: 'Keep a steady bedtime and dim screens 45 minutes before sleep.' },
            { title: 'Schedule demanding tasks in your highest-energy window', timeframe: 'Workdays', body: 'Pair 60–90 minute focus blocks with 10-minute physical movement breaks.' }
          ]
        : [
            { title: 'Keep a consistent sleep-wake schedule', timeframe: 'Daily', body: 'Regular sleep timing is the strongest driver of daytime stamina and clarity.' },
            { title: 'Hydrate and take brief daylight breaks', timeframe: 'Workdays', body: 'Short outdoor walks and hydration counteract mid-afternoon fatigue dips.' },
            { title: 'Re-check FAS-10 in one month', timeframe: 'In 30 days', body: 'Monitor whether physical and cognitive energy remain steady.' }
          ];

      return {
        moduleKey,
        displayTitle: 'FAS-10 fatigue assessment',
        filenameSlug: 'FAS10',
        dates,
        verificationRef,
        clinic,
        wellbeingScore,
        band,
        prominentHelplines: band.key === 'needs_attention',
        hero: {
          metricLabel: 'FAS-10 SCORE',
          primaryValue: `${rawScore}/50`,
          secondaryValue: `Wellbeing index: ${wellbeingScore}/100`,
          clinicalSubLabel: `Raw FAS-10 total ${rawScore} of 50 (10–21 normal, 22–34 fatigued, 35–50 extreme)`,
          interpretation
        },
        actions,
        tableTitle: 'Fatigue subscale breakdown',
        tableSubtitle: hasFullAnswers
          ? `Your ${rawScore}/50 total reconciled across physical and mental fatigue subscales.`
          : 'Overview of the two FAS-10 fatigue subscales.',
        tableHeaders: ['FATIGUE SUBSCALE', 'RAW SCORE', 'BAND', 'FOCUS AREA'],
        rows,
        indexFootnote: 'Wellbeing index conversion: 100 - ((FAS-10 raw score - 10) / 40 x 100). Items 4 and 10 are reverse-scored; badge reflects Michielsen & De Vries cutoffs.'
      };
    }

    // -------------------------------------------------------------------------
    // MODULE 5: COPSOQ-III (ISO 45003 Workplace Psychosocial Risk Assessment)
    // -------------------------------------------------------------------------
    if (moduleKey === 'copsoq3') {
      const g = (typeof window !== 'undefined' && window.COPSOQ3_DIM_META)
        ? window
        : ((typeof global !== 'undefined' && global.COPSOQ3_DIM_META) ? global : {});
      const rawVer = String(options.surveyVersion || options.surveyType || '').trim().toLowerCase();
      let versionKey = (rawVer === 'copsoq3_middle' || rawVer === 'copsoq3_long' || rawVer === 'copsoq3_core')
        ? rawVer
        : null;
      if (!versionKey && Array.isArray(answers)) {
        if (answers.length > 60 && g.copsoq3_long) versionKey = 'copsoq3_long';
        else if (answers.length > 32 && g.copsoq3_middle) versionKey = 'copsoq3_middle';
        else versionKey = 'copsoq3_core';
      }
      if (!versionKey) versionKey = 'copsoq3_core';

      const surveyObj = g[versionKey] || g.copsoq3_core || null;
      const dimMeta = g.COPSOQ3_DIM_META || null;

      const copsoqAreas = [
        {
          isoArea: 0,
          name: 'Work organization & job demands',
          clause: 'ISO 45003 Cl. 6.1.2.2',
          desc: 'Workload sustainability, work pace, emotional demands, and recovery time between tasks.'
        },
        {
          isoArea: 1,
          name: 'Influence, clarity & development',
          clause: 'ISO 45003 Cl. 6.1.2.3',
          desc: 'Role clarity, autonomy over work methods, possibilities for development, and meaningful work.'
        },
        {
          isoArea: 2,
          name: 'Social support & leadership quality',
          clause: 'ISO 45003 Cl. 6.1.2.4',
          desc: 'Peer support, supervisor responsiveness, recognition, and predictability.'
        },
        {
          isoArea: 3,
          name: 'Workplace safety & respect',
          clause: 'ISO 45003 Cl. 7.3 / 8.1',
          desc: 'Psychological safety, mutual trust, fairness, and respect across the team.'
        },
        {
          isoArea: 4,
          name: 'Personal health & strain indicators',
          clause: 'COPSOQ-III Health & Well-being',
          desc: 'Self-rated general health, sleep quality, exhaustion, and stress symptoms (separate from workplace safety).'
        }
      ];

      let domainScores = [null, null, null, null, null];
      let alignedDimScores = [];
      if (surveyObj && Array.isArray(surveyObj.questions) && dimMeta) {
        const dimTotalCounts = {};
        const dimValues = {};
        const qById = {};
        const mappings = g.COPSOQ3_CORE_MAPPINGS || {};

        surveyObj.questions.forEach((q) => {
          if (!q || typeof q !== 'object') return;
          if (q.dim && q.responseType !== '5M') {
            dimTotalCounts[q.dim] = (dimTotalCounts[q.dim] || 0) + 1;
          }
          if (q.id) qById[q.id] = q;
        });

        const longById = {};
        if (g.copsoq3_long && Array.isArray(g.copsoq3_long.questions)) {
          g.copsoq3_long.questions.forEach((q) => {
            if (q && q.id) longById[q.id] = q;
          });
        }

        if (Array.isArray(options.responses) && options.responses.length > 0) {
          options.responses.forEach((resp) => {
            if (!resp) return;
            const q = (resp.item_code && (qById[resp.item_code] || longById[resp.item_code]))
              || (Number.isInteger(resp.question_index) ? surveyObj.questions[resp.question_index] : null);
            if (!q || !q.dim || q.responseType === '5M') return;

            let sc = null;
            if (resp.score !== undefined && resp.score !== null && Number.isFinite(Number(resp.score))) {
              sc = Number(resp.score);
            } else if (resp.value !== undefined && resp.value !== null && Number.isFinite(Number(resp.value))) {
              const rawVal = Number(resp.value);
              if (q.responseType === 8) {
                sc = rawVal <= 10 ? rawVal * 10 : rawVal;
              } else if (q.responseType && mappings[q.responseType]) {
                const vals = Object.values(mappings[q.responseType]);
                sc = (rawVal >= 0 && rawVal < vals.length) ? vals[rawVal] : null;
              } else {
                sc = rawVal <= 4 ? rawVal * 25 : rawVal;
              }
            }
            if (sc === null || !Number.isFinite(sc) || sc < 0) return;
            if (!dimValues[q.dim]) dimValues[q.dim] = [];
            dimValues[q.dim].push(sc);
          });
        } else if (answers && answers.length > 0) {
          surveyObj.questions.forEach((q, idx) => {
            if (idx >= answers.length || !q || !q.dim || q.responseType === '5M') return;
            const sc = Number(answers[idx]);
            if (!Number.isFinite(sc) || sc < 0) return;
            if (!dimValues[q.dim]) dimValues[q.dim] = [];
            dimValues[q.dim].push(sc);
          });
        }

        const areaBuckets = { 0: [], 1: [], 2: [], 3: [], 4: [] };
        Object.keys(dimValues).forEach((dim) => {
          const vals = dimValues[dim];
          const totalInVer = dimTotalCounts[dim] || vals.length;
          if (vals.length < totalInVer * 0.5) return;
          const meta = dimMeta[dim];
          if (!meta) return;
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const aligned = meta.valence === 'hazard' ? (100 - avg) : avg;
          alignedDimScores.push(aligned);
          if (areaBuckets[meta.isoArea]) {
            areaBuckets[meta.isoArea].push(aligned);
          }
        });

        domainScores = copsoqAreas.map((area) => {
          const vals = areaBuckets[area.isoArea];
          if (!vals || vals.length === 0) return null;
          return Math.max(0, Math.min(100, Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)));
        });
      }

      const hasMeasuredAreas = domainScores.some((s) => s !== null);
      if (!hasMeasuredAreas) {
        const fallback = Math.max(0, Math.min(100, Math.round(Number(options.score ?? 65))));
        domainScores = [fallback, fallback, fallback, fallback, fallback];
      }

      const validAreaScores = domainScores.filter((s) => s !== null && Number.isFinite(s));
      const wellbeingScore = (options.score !== undefined && options.score !== null && Number.isFinite(Number(options.score)))
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : (alignedDimScores.length > 0
          ? Math.max(0, Math.min(100, Math.round(alignedDimScores.reduce((a, b) => a + b, 0) / alignedDimScores.length)))
          : (validAreaScores.length
            ? Math.round(validAreaScores.reduce((a, b) => a + b, 0) / validAreaScores.length)
            : 0));

      const band = getScoreBand(wellbeingScore);
      const interpretation = band.key === 'healthy'
        ? 'Your COPSOQ-III responses indicate a supportive psychosocial work environment with sustainable demands and clear roles.'
        : band.key === 'moderate'
          ? 'Your COPSOQ-III responses indicate mixed psychosocial conditions; addressing the lowest-scoring ISO 45003 area below will improve day-to-day sustainability.'
          : 'Your COPSOQ-III responses indicate significant workplace psychosocial strain; confidential occupational health guidance is recommended.';

      const rows = copsoqAreas.map((area, idx) => {
        const sc = domainScores[idx];
        const isMissing = sc === null || !Number.isFinite(sc);
        const rowBand = isMissing ? { key: 'moderate', label: 'No data', color: COLORS.muted } : getScoreBand(sc);
        return {
          name: area.name,
          subtext: area.clause,
          scoreText: isMissing ? '--/100' : `${sc}/100`,
          barPct: isMissing ? 0 : sc,
          barScore: isMissing ? 0 : sc,
          band: rowBand,
          description: area.desc
        };
      });

      let lowestIdx = 0;
      let lowestAreaScore = Infinity;
      domainScores.forEach((sc, idx) => {
        if (sc !== null && sc < lowestAreaScore) {
          lowestAreaScore = sc;
          lowestIdx = idx;
        }
      });
      if (!Number.isFinite(lowestAreaScore)) lowestAreaScore = wellbeingScore;
      const lowestArea = copsoqAreas[lowestIdx];

      const actions = band.key === 'needs_attention'
        ? [
            { title: `Address ${lowestArea.name.toLowerCase()}`, timeframe: 'Priority', body: `This was your lowest-scoring ISO 45003 area (${lowestAreaScore}/100). Document concrete friction points before any manager or clinical discussion.` },
            { title: 'Request a confidential occupational health consult', timeframe: 'This week', body: 'A clinician can advise on workload pacing or workplace accommodation options privately.' },
            { title: 'Use anonymous workplace feedback channels if unsafe', timeframe: 'As needed', body: 'You can log systemic workplace hazards anonymously inside the Havilah portal.' }
          ]
        : [
            { title: `Strengthen ${lowestArea.name.toLowerCase()}`, timeframe: 'This month', body: `Focus small adjustments on your lowest-scoring area (${lowestAreaScore}/100) to improve weekly sustainability.` },
            { title: 'Clarify priorities and boundaries with your lead', timeframe: 'Next 1:1', body: 'Aligning on realistic deadlines reduces hidden role ambiguity and after-hours spillover.' },
            { title: 'Re-check COPSOQ-III next assessment cycle', timeframe: 'Quarterly', body: 'Track how changes in workload or team support affect your psychosocial fit.' }
          ];

      return {
        moduleKey,
        displayTitle: 'COPSOQ-III workplace psychosocial report',
        filenameSlug: 'COPSOQ3',
        dates,
        verificationRef,
        clinic,
        wellbeingScore,
        band,
        prominentHelplines: band.key === 'needs_attention',
        hero: {
          metricLabel: 'PSYCHOSOCIAL FIT',
          primaryValue: `${wellbeingScore}/100`,
          secondaryValue: 'ISO 45003 aligned',
          clinicalSubLabel: 'Four workplace domains + personal health indicators evaluated',
          interpretation
        },
        actions,
        tableTitle: 'ISO 45003 & health domains',
        tableSubtitle: 'Domain scores (0-100, higher indicates healthier conditions) with ISO 45003 workplace clauses separate from personal health.',
        tableHeaders: ['DOMAIN AREA', 'SCORE', 'BAND', 'SCOPE'],
        rows,
        indexFootnote: 'Composite COPSOQ-III score averages all evaluated dimensions equally (50% minimum item response rule per dimension); category rows summarize grouped domain averages.'
      };
    }

    // -------------------------------------------------------------------------
    // DEFAULT: OVERALL WELLBEING SUMMARY (5 MODULES)
    // -------------------------------------------------------------------------
    const rawScores = options.moduleScores || options.pillarScores || {};
    const history = appState.employeeHistoryPayload || localState.employeeHistoryPayload || [];

    const lookupScore = (keys, fallback) => {
      for (const k of keys) {
        if (rawScores[k] !== undefined && rawScores[k] !== null && Number.isFinite(Number(rawScores[k]))) {
          return Math.max(0, Math.min(100, Math.round(Number(rawScores[k]))));
        }
      }
      // Fallback to latest matching entry in history if present
      if (Array.isArray(history) && history.length) {
        for (let i = history.length - 1; i >= 0; i--) {
          const h = history[i];
          if (!h) continue;
          const t = normalizeModuleKey(h.surveyType || h.type || h.module || h.source || h.survey_type);
          if (keys.includes(t)) {
            const rawVal = h.score ?? h.wellbeingIndex ?? h.overallIndex;
            if (rawVal !== undefined && rawVal !== null && Number.isFinite(Number(rawVal))) {
              return Math.max(0, Math.min(100, Math.round(Number(rawVal))));
            }
          }
        }
      }
      return fallback;
    };

    const pillars = [
      { key: 'phq9', label: 'Mood & emotional health', sublabel: 'PHQ-9 Depression Self-Check', score: lookupScore(['phq9', 'phq-9'], null) },
      { key: 'gad7', label: 'Calm & anxiety balance', sublabel: 'GAD-7 Anxiety Scale', score: lookupScore(['gad7', 'gad-7'], null) },
      { key: 'pss10', label: 'Perceived stress resilience', sublabel: 'PSS-10 Perceived Stress Scale', score: lookupScore(['pss10', 'pss-10'], null) },
      { key: 'fas10', label: 'Energy & fatigue recovery', sublabel: 'FAS-10 Fatigue Assessment', score: lookupScore(['fas10', 'fas-10'], null) },
      { key: 'copsoq3', label: 'Workplace psychosocial fit', sublabel: 'COPSOQ-III (ISO 45003)', score: lookupScore(['copsoq3', 'copsoq-iii'], null) }
    ];

    // Sort completed pillars lowest to highest, followed by uncompleted pillars
    const completedPillars = pillars.filter((p) => p.score !== null && p.score !== undefined && Number.isFinite(p.score));
    const uncompletedPillars = pillars.filter((p) => p.score === null || p.score === undefined || !Number.isFinite(p.score));
    const sortedCompleted = [...completedPillars].sort((a, b) => a.score - b.score);
    const sortedPillars = [...sortedCompleted, ...uncompletedPillars];

    const sum = completedPillars.reduce((acc, p) => acc + p.score, 0);
    const wellbeingScore = completedPillars.length > 0
      ? Math.round(sum / completedPillars.length)
      : (options.score !== undefined && options.score !== null && Number.isFinite(Number(options.score))
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : 0);

    const band = getScoreBand(wellbeingScore);
    const lowestPillar = sortedCompleted.length > 0 ? sortedCompleted[0] : null;
    const hasNeedsAttention = (completedPillars.length > 0 && band.key === 'needs_attention')
      || sortedCompleted.some((p) => p.score <= 49);

    let interpretation = '';
    if (!lowestPillar) {
      interpretation = 'No formal check-in modules have been completed yet. Complete at least one module to establish your personalized five-pillar wellbeing baseline.';
    } else if (band.key === 'healthy') {
      interpretation = `Your overall wellbeing index across ${completedPillars.length} completed module${completedPillars.length === 1 ? '' : 's'} is healthy, with ${lowestPillar.label.toLowerCase()} (${lowestPillar.score}/100) as the main area to keep watching.`;
    } else if (band.key === 'moderate') {
      interpretation = `Your overall wellbeing across ${completedPillars.length} completed module${completedPillars.length === 1 ? '' : 's'} is moderate, with pressure concentrated in ${lowestPillar.label.toLowerCase()} (${lowestPillar.score}/100).`;
    } else {
      interpretation = `Your overall wellbeing across ${completedPillars.length} completed module${completedPillars.length === 1 ? '' : 's'} needs attention, particularly in ${lowestPillar.label.toLowerCase()} (${lowestPillar.score}/100); confidential clinical support is advised.`;
    }

    const actions = !lowestPillar
      ? [
          {
            title: 'Complete your initial wellbeing screening modules',
            timeframe: 'This week',
            body: 'Finish the short validated check-ins (PHQ-9, GAD-7, PSS-10, FAS-10, and COPSOQ-III) to populate all five pillars.'
          },
          {
            title: 'Log a brief Daily Pulse check-in',
            timeframe: 'Today',
            body: 'Track day-to-day shifts in mood, calm, stress resilience, energy, and work fit.'
          },
          {
            title: 'Reach out if you need private clinical support',
            timeframe: 'Anytime',
            body: 'Confidential occupational health support is available through your clinic contact below regardless of completion status.'
          }
        ]
      : hasNeedsAttention
        ? [
            {
              title: `Start with ${lowestPillar.label.toLowerCase()} (${lowestPillar.score}/100)`,
              timeframe: 'Priority',
              body: 'Focus your first recovery step on your lowest-scoring pillar rather than trying to change everything at once.'
            },
            {
              title: 'Book a confidential occupational health check-in',
              timeframe: 'This week',
              body: 'One or more scores fall in the Needs attention band (0-49). Speak with a clinician for tailored recovery guidance.'
            },
            {
              title: 'Re-check your lowest pillar in 14 days',
              timeframe: 'In 2 weeks',
              body: 'Download the individual module PDF after your next check-in to review item-level progress.'
            }
          ]
        : [
            {
              title: `Focus recovery on ${lowestPillar.label.toLowerCase()} (${lowestPillar.score}/100)`,
              timeframe: 'This week',
              body: 'Small, steady adjustments in your lowest-scoring pillar deliver the largest lift to overall balance.'
            },
            {
              title: 'Protect daily sleep and decompression windows',
              timeframe: 'Daily',
              body: 'Keep consistent rest boundaries between work demands and personal recovery time.'
            },
            {
              title: 'Review trends at your next check-in cycle',
              timeframe: 'In 30 days',
              body: 'Periodic check-ins help spot early shifts in energy, mood, or workplace strain.'
            }
          ];

    const formulaNums = completedPillars.map((p) => p.score).join(' + ');

    return {
      moduleKey: 'overall',
      displayTitle: 'Wellbeing summary',
      filenameSlug: 'Overall_Wellbeing',
      dates,
      verificationRef,
      clinic,
      wellbeingScore,
      band,
      prominentHelplines: hasNeedsAttention,
      hero: {
        metricLabel: 'OVERALL WELLBEING',
        primaryValue: completedPillars.length > 0 ? `${wellbeingScore}/100` : '--/100',
        secondaryValue: `${completedPillars.length} of 5 modules completed`,
        clinicalSubLabel: '',
        interpretation
      },
      sortedPillars,
      actions,
      indexFootnote: completedPillars.length > 0
        ? `Index calculation: equal average of ${completedPillars.length} completed module${completedPillars.length === 1 ? '' : 's'} (${formulaNums}) / ${completedPillars.length} = ${wellbeingScore}/100.`
        : 'Index calculation: complete at least one wellbeing module to calculate your overall score.'
    };
  }

  /**
   * Main Client-Side PDF Generation Function (100% on-device).
   */
  async function generate(options = {}) {
    try {
      const jsPDFClass = await getJsPDFClass();
      if (!jsPDFClass) {
        throw new Error('Unable to initialize client-side PDF engine (jsPDF). Please refresh and try again.');
      }

      if (typeof showToast === 'function') {
        showToast('Generating PDF', 'Compiling your confidential well-being report...', 'info');
      }

      const data = resolveAssessmentData(options);

      const pdf = new jsPDFClass({
        orientation: PAGE.orientation,
        unit: 'mm',
        format: PAGE.format,
        compress: true
      });

      // Accessible PDF metadata
      pdf.setProperties({
        title: `Havilah ${data.displayTitle} (${data.dates.isoDate})`,
        subject: 'Confidential Occupational Wellbeing Screening Summary',
        author: COPY.brandName,
        creator: 'Havilah Workplace Well-being PWA'
      });

      const [fonts, logoDataUrl] = await Promise.all([
        Fonts.registerFonts(pdf, { includeSerif: false }),
        Components.loadHavilahLogoDataUrl()
      ]);

      const m = PAGE.margin;
      const footerReserve = 18;
      const maxContentY = PAGE.height - m - footerReserve;

      const renderPageHeader = () => Components.drawHeader(pdf, fonts, {
        logoDataUrl,
        brandTitle: COPY.brandName,
        brandSubtitle: COPY.brandSubtitle,
        documentTitle: data.displayTitle,
        referenceText: `Ref: ${data.verificationRef}`,
        dateText: `Date: ${data.dates.formatted}`
      });

      let y = renderPageHeader();

      // Band legend directly beneath letterhead
      y = Components.drawBandLegend(pdf, fonts, y);
      y += r(1.5);

      // Score Hero: large score + band + one-sentence "What this means"
      y = Components.drawScoreHero(pdf, fonts, {
        y,
        wellbeingScore: data.wellbeingScore,
        band: data.band,
        metricLabel: data.hero.metricLabel,
        primaryValue: data.hero.primaryValue,
        secondaryValue: data.hero.secondaryValue,
        clinicalSubLabel: data.hero.clinicalSubLabel,
        interpretation: data.hero.interpretation
      });

      y += r(2);

      // Lead with "What to do next" (max 3 actions), numbers second
      y = Components.drawSectionHeading(pdf, fonts, 'What to do next', y, {
        size: TYPE.subheading
      });
      y = Components.drawActionList(pdf, fonts, data.actions, y);

      y += r(1.5);

      // Numbers second: 5-pillar horizontal bar chart (Overall) OR breakdown table (Modules)
      if (data.moduleKey === 'overall') {
        y = Components.drawSectionHeading(pdf, fonts, 'Five-pillar breakdown', y, {
          size: TYPE.subheading,
          subtitle: 'Sorted from lowest to highest score so priority areas appear first.'
        });
        y = Components.drawHorizontalBarChart(pdf, fonts, data.sortedPillars, y);
      } else {
        y = Components.drawSectionHeading(pdf, fonts, data.tableTitle, y, {
          size: TYPE.subheading,
          subtitle: data.tableSubtitle
        });
        y = Components.drawRuleTable(pdf, fonts, {
          headers: data.tableHeaders,
          rows: data.rows,
          startY: y,
          maxY: maxContentY - 12,
          onNewPage: () => {
            pdf.addPage();
            return renderPageHeader();
          }
        });
      }

      // One small footnote line showing how the index is calculated
      if (data.indexFootnote) {
        pdf.setFont(fonts.sans, 'normal');
        pdf.setFontSize(TYPE.label);
        pdf.setTextColor(...COLORS.muted);
        const fnLines = pdf.splitTextToSize(data.indexFootnote, PAGE.contentWidth);
        if (y + (fnLines.length * 3.8) > maxContentY) {
          pdf.addPage();
          y = renderPageHeader();
        }
        pdf.text(fnLines, m, y);
        y += (fnLines.length * 3.8) + r(3);
      }

      // Support block (ONE compact block) + quiet non-diagnostic footnote
      const estimatedSupportH = data.prominentHelplines ? 32 : 22;
      if (y + estimatedSupportH > maxContentY) {
        pdf.addPage();
        y = renderPageHeader();
      } else {
        // Anchor support neatly toward the lower section so there is no empty bottom third
        const targetSupportY = maxContentY - estimatedSupportH - 2;
        if (targetSupportY > y && (targetSupportY - y) < 42) {
          y = targetSupportY;
        }
      }

      y = Components.drawSupportBlock(pdf, fonts, {
        y,
        prominentHelplines: data.prominentHelplines,
        clinic: data.clinic
      });

      // Quiet non-diagnostic footnote
      pdf.setFont(fonts.sans, 'normal');
      pdf.setFontSize(TYPE.label);
      pdf.setTextColor(...COLORS.muted);
      const discLines = pdf.splitTextToSize(COPY.nonDiagnosticFootnote, PAGE.contentWidth);
      pdf.text(discLines, m, y);

      // Stamp footers on all pages; state the single calm privacy sentence ONCE (Page 1 footer only)
      const totalPages = pdf.getNumberOfPages();
      for (let p = 1; p <= totalPages; p++) {
        pdf.setPage(p);
        Components.drawFooter(pdf, fonts, {
          leftText: `Ref: ${data.verificationRef}  ·  ${data.displayTitle}`,
          pageNumber: p,
          totalPages,
          includePrivacyLine: p === 1,
          privacyLine: COPY.wellbeingPrivacyLine
        });
      }

      const filename = `Havilah_${data.filenameSlug}_Report_${data.dates.isoDate}.pdf`;
      pdf.save(filename);

      if (typeof showToast === 'function') {
        showToast('Report Downloaded', `Your confidential ${data.displayTitle} PDF has been saved.`, 'success');
      }

      return {
        success: true,
        filename,
        verificationRef: data.verificationRef,
        moduleKey: data.moduleKey
      };
    } catch (error) {
      console.error('[AssessmentReportPdf] Failed to generate PDF:', error);
      if (typeof showToast === 'function') {
        showToast('Download Error', error.message || 'Failed to generate PDF report.', 'critical');
      } else if (typeof alert === 'function') {
        alert('Could not generate PDF: ' + (error.message || 'Unknown error.'));
      }
      return { success: false, error };
    }
  }

  return {
    generate,
    resolveAssessmentData,
    normalizeModuleKey,
    getJsPDFClass
  };
}));
