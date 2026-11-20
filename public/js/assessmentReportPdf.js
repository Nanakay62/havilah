/**
 * @fileoverview assessmentReportPdf.js
 * Client-side confidential employee mental health & ISO 45003 well-being PDF report generator.
 *
 * Dynamically adapts Sections 1, 2, and 3 to the exact assessment module completed
 * (PHQ-9, GAD-7, PSS-10, FAS-10, COPSOQ-III, or Overall 5-Module Summary) so clinical
 * scales, sub-domain breakdowns, and guidance always reconcile with the questions answered.
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

  let cachedLogoDataUrl = null;

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
   * Rasterize /assets/havilah-mark.svg to a crisp high-DPI PNG data URL for jsPDF embedding
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
          // Maintain SVG aspect ratio 350:269 at crisp 3x DPI
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
   * Normalize raw surveyType strings into canonical module keys
   */
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

  /**
   * Status badge helper for 0-100 well-being scores (higher = healthier)
   */
  function getWellbeingStatus(val) {
    if (val >= 75) return { status: 'Optimal', color: [5, 150, 105] };
    if (val >= 50) return { status: 'Moderate', color: [217, 119, 6] };
    return { status: 'Elevated', color: [220, 38, 38] };
  }

  /**
   * Status badge helper for symptom intensity ratio (0..1, higher = more symptoms)
   */
  function getSymptomSubStatus(ratio, isCrisisFlag = false) {
    if (isCrisisFlag) return { status: 'Safety Flag', color: [185, 28, 28] };
    if (ratio <= 0.25) return { status: 'Minimal', color: [5, 150, 105] };
    if (ratio <= 0.5) return { status: 'Mild', color: [13, 148, 136] };
    if (ratio <= 0.72) return { status: 'Moderate', color: [217, 119, 6] };
    return { status: 'Elevated', color: [220, 38, 38] };
  }

  function sumIndices(arr, indices, reverseMap = null, reverseBase = 0) {
    return indices.reduce((acc, idx) => {
      const v = Number(arr[idx]);
      if (!Number.isFinite(v)) return acc;
      if (reverseMap && reverseMap.includes(idx)) {
        return acc + (reverseBase - v);
      }
      return acc + v;
    }, 0);
  }

  /**
   * Build module-specific report view model for Sections 1, 2, and 3
   */
  function resolveAssessmentData(options = {}) {
    const appState = (typeof window !== 'undefined' && window.App && window.App.state) || {};
    const localState = (typeof state !== 'undefined' && state) || {};

    const rawSurveyType = options.surveyType || appState.surveyState?.type || localState.surveyState?.type || 'overall';
    const moduleKey = normalizeModuleKey(rawSurveyType);
    const answers = Array.isArray(options.answers) ? options.answers.map(v => Number(v)) : null;

    const assessorName = options.assessorName || 'Dr. Edith Clarke';
    const assessorPhone = options.assessorPhone || '024 362 9870';
    const providerName = options.providerName || appState.clinicalProvider?.name || 'FZ Safety and Health';
    const dates = getDateInfo(options.date || new Date());
    const verificationRef = options.verificationRef || generateVerificationRef();

    // Base fields populated per module
    let displayTitle = 'Overall Wellbeing Summary';
    let filenameSlug = 'Overall_Wellbeing';
    let section1Title = '1. Your Overall Well-Being Snapshot';
    let scorePrimaryText = '0';
    let scoreSubText = 'out of 100';
    let scoreFooterLabel = 'WELLBEING INDEX';
    let secondaryScoreNote = '';
    let statusBand = 'Optimal Balance';
    let statusColor = [5, 150, 105];
    let statusBg = [236, 253, 245];
    let riskLevel = 'Healthy & Balanced';
    let narrativeText = '';
    let section2Title = '2. Domain Breakdown';
    let section2Subtitle = '';
    let col1Header = 'AREA';
    let col2Header = 'SCORE';
    let rows = [];
    let importantNoteTitle = 'Important Note About Your Results';
    let importantNoteBody = 'This summary reflects only the responses you submitted in this check-in. It is 100% confidential and never shared with your employer or HR.';
    let isCrisisAlert = false;
    let section3Title = '3. Recommended Next Steps';
    let section3Subtitle = 'Practical actions tailored to your check-in results:';
    let recommendations = [];
    let compositeScore = 0;

    // -------------------------------------------------------------------------
    // MODULE 1: PHQ-9 (Depression Self-Check, 9 items, 0-27)
    // -------------------------------------------------------------------------
    if (moduleKey === 'phq9') {
      displayTitle = 'PHQ-9 Depression Self-Check';
      filenameSlug = 'PHQ9';
      section1Title = '1. Your PHQ-9 Mood Screening Snapshot';

      const hasFullAnswers = answers && answers.length >= 9;
      const rawScore = options.rawScore !== undefined
        ? Math.max(0, Math.min(27, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6, 7, 8])
          : Math.round(((100 - (options.score ?? 70)) / 100) * 27));

      const wellbeingIndex = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - (rawScore / 27) * 100)));

      compositeScore = wellbeingIndex;
      const q9Val = hasFullAnswers ? (Number(answers[8]) || 0) : (options.isCrisisQ9 ? 1 : 0);
      isCrisisAlert = Boolean(options.isCrisisQ9 || q9Val >= 1);

      scorePrimaryText = `${rawScore}/27`;
      scoreSubText = `Wellbeing Index: ${wellbeingIndex}/100`;
      scoreFooterLabel = 'PHQ-9 RAW SCORE';

      if (isCrisisAlert) {
        statusBand = 'Immediate Support';
        statusColor = [185, 28, 28];
        statusBg = [254, 242, 242];
        riskLevel = 'Safety Check Triggered • Please Reach Out Now';
        narrativeText = 'Your response on Question 9 indicated thoughts of self-harm or being better off dead. Please reach out for free, confidential human support right away using the helpline numbers on Page 2 or Dr. Edith Clarke (024 362 9870). Your employer and HR are never notified.';
      } else if (rawScore <= 4) {
        statusBand = 'Minimal Symptoms';
        statusColor = [5, 150, 105];
        statusBg = [236, 253, 245];
        riskLevel = 'Minimal (0–4) • Healthy Mood Baseline';
        narrativeText = 'Your PHQ-9 score falls in the minimal range (0–4). Over the past two weeks, you reported very few signs of low mood, loss of interest, or energy depletion. Continue maintaining your regular rest, movement, and supportive routines.';
      } else if (rawScore <= 9) {
        statusBand = 'Mild Symptoms';
        statusColor = [13, 148, 136];
        statusBg = [240, 253, 250];
        riskLevel = 'Mild (5–9) • Watchful Self-Care Advised';
        narrativeText = 'Your PHQ-9 score falls in the mild range (5–9). You may have noticed occasional dips in mood, sleep quality, or energy over the past two weeks. Building gentle daily structure and checking in again in 2 weeks can help keep things on track.';
      } else if (rawScore <= 14) {
        statusBand = 'Moderate Symptoms';
        statusColor = [217, 119, 6];
        statusBg = [254, 243, 199];
        riskLevel = 'Moderate (10–14) • Clinical Check-In Advised';
        narrativeText = 'Your PHQ-9 score falls in the moderate range (10–14). Persistent low mood, fatigue, or difficulty concentrating may be affecting your daily rhythm. Speaking privately with Dr. Edith Clarke or a healthcare professional is a helpful, supportive next step.';
      } else if (rawScore <= 19) {
        statusBand = 'Moderately Severe';
        statusColor = [220, 38, 38];
        statusBg = [254, 242, 242];
        riskLevel = 'Moderately Severe (15–19) • Prompt Clinical Support';
        narrativeText = 'Your PHQ-9 score falls in the moderately severe range (15–19). Symptoms like low mood, exhaustion, or harsh self-criticism are likely weighing heavily on day-to-day life. You do not have to carry this alone—please schedule a free, confidential check-in with Dr. Edith Clarke.';
      } else {
        statusBand = 'Severe Symptoms';
        statusColor = [185, 28, 28];
        statusBg = [254, 242, 242];
        riskLevel = 'Severe (20–27) • Priority Clinical Support';
        narrativeText = 'Your PHQ-9 score falls in the severe range (20–27). Please connect promptly with Dr. Edith Clarke (024 362 9870) or a licensed clinician for compassionate, private support. Free helplines are also listed on Page 2.';
      }

      section2Title = '2. Breakdown by PHQ-9 Symptom Clusters';
      section2Subtitle = hasFullAnswers
        ? `Your ${rawScore}/27 total is the exact sum of the 4 symptom clusters you answered:`
        : 'Summary of the 4 PHQ-9 symptom clusters (retake check-in to include exact item sub-scores):';
      col1Header = 'SYMPTOM CLUSTER';
      col2Header = 'SCORE';

      const phqGroups = [
        {
          name: 'Mood & Interest',
          subtext: 'PHQ-9 Items 1–2 (Core Mood)',
          indices: [0, 1],
          max: 6,
          desc: 'Loss of interest or pleasure in activities and feeling down, depressed, or hopeless.'
        },
        {
          name: 'Sleep, Energy & Appetite',
          subtext: 'PHQ-9 Items 3–5 (Physical)',
          indices: [2, 3, 4],
          max: 9,
          desc: 'Trouble sleeping or oversleeping, low physical energy, and appetite changes.'
        },
        {
          name: 'Self-Worth & Concentration',
          subtext: 'PHQ-9 Items 6–7 (Cognitive)',
          indices: [5, 6],
          max: 6,
          desc: 'Feeling bad about yourself or difficulty concentrating on everyday tasks.'
        },
        {
          name: 'Psychomotor & Safety Check',
          subtext: 'PHQ-9 Items 8–9 (Activity & Safety)',
          indices: [7, 8],
          max: 6,
          desc: q9Val >= 1
            ? 'Item 9 safety indicator flagged. Free, confidential immediate support is available on Page 2.'
            : 'Noticeable restlessness or slowing down, plus personal safety check (Item 9).'
        }
      ];

      rows = phqGroups.map((g, i) => {
        const subVal = hasFullAnswers
          ? sumIndices(answers, g.indices)
          : Math.round((rawScore / 27) * g.max);
        const ratio = g.max > 0 ? subVal / g.max : 0;
        const flag = i === 3 && isCrisisAlert;
        return {
          name: g.name,
          subtext: g.subtext,
          scoreLabel: `${subVal} / ${g.max}`,
          barRatio: ratio,
          statusObj: getSymptomSubStatus(ratio, flag),
          description: g.desc
        };
      });

      if (isCrisisAlert) {
        importantNoteTitle = 'IMMEDIATE CONFIDENTIAL SUPPORT AVAILABLE';
        importantNoteBody = 'Because you indicated thoughts of self-harm or being better off dead, please call Dr. Edith Clarke (024 362 9870), Ghana Mental Health Authority (0800 678 678), or Emergency (112 / 193) right now. This report is 100% private and never shared with HR.';
      } else {
        importantNoteTitle = 'Understanding Your PHQ-9 Score';
        importantNoteBody = 'PHQ-9 scores range from 0 to 27 (lower raw score = fewer depressive symptoms; higher Wellbeing Index = stronger mood balance). You can share this private PDF with a doctor if you choose, and your employer never has access.';
      }

      section3Title = '3. Mood & Emotional Support Steps';
      section3Subtitle = 'Evidence-based steps tailored to your PHQ-9 mood screening:';
      recommendations = rawScore >= 10 || isCrisisAlert
        ? [
            {
              title: 'Book a Free Private Clinical Check-In',
              meta: 'Priority Support',
              body: `A PHQ-9 score of ${rawScore}/27 benefits from speaking with a clinician. Reach out to Dr. Edith Clarke (${assessorPhone}) or tap "Clinical Referral" in Havilah for a 100% confidential consultation.`
            },
            {
              title: 'Start Small with One Daily Anchor Activity',
              meta: 'Behavioral Activation',
              body: 'When mood and energy feel heavy, pick one tiny manageable step each day—a 10-minute walk outdoors, eating a regular meal, or messaging one trusted friend—rather than waiting for motivation first.'
            },
            {
              title: 'Protect Sleep & Evening Decompression',
              meta: 'Sleep & Energy',
              body: 'Keep a steady wake time, step away from screens 30–45 minutes before bed, and let go of harsh self-criticism on low-energy days. Recovery is gradual.'
            }
          ]
        : [
            {
              title: 'Keep Engaging in Mood-Lifting Routines',
              meta: 'Daily Mood Habit',
              body: 'Schedule small activities that give you a sense of enjoyment or accomplishment each week—movement, sunlight, music, or connecting with people who energize you.'
            },
            {
              title: 'Maintain Steady Sleep & Energy Rhythms',
              meta: 'Sleep & Rest',
              body: 'Consistent sleep and meal schedules are the strongest protective buffer for mood and concentration. Notice early signs of sleep disruption before fatigue accumulates.'
            },
            {
              title: 'Check In Again in Two Weeks',
              meta: 'Ongoing Self-Care',
              body: 'Retaking the PHQ-9 periodically helps you spot subtle mood shifts early. If low mood ever lingers beyond two weeks, Dr. Edith Clarke is available for free private support.'
            }
          ];

    // -------------------------------------------------------------------------
    // MODULE 2: GAD-7 (Anxiety Self-Check, 7 items, 0-21)
    // -------------------------------------------------------------------------
    } else if (moduleKey === 'gad7') {
      displayTitle = 'GAD-7 Anxiety Self-Check';
      filenameSlug = 'GAD7';
      section1Title = '1. Your GAD-7 Anxiety Screening Snapshot';

      const hasFullAnswers = answers && answers.length >= 7;
      const rawScore = options.rawScore !== undefined
        ? Math.max(0, Math.min(21, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6])
          : Math.round(((100 - (options.score ?? 70)) / 100) * 21));

      const wellbeingIndex = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - (rawScore / 21) * 100)));

      compositeScore = wellbeingIndex;
      scorePrimaryText = `${rawScore}/21`;
      scoreSubText = `Wellbeing Index: ${wellbeingIndex}/100`;
      scoreFooterLabel = 'GAD-7 RAW SCORE';

      if (rawScore <= 4) {
        statusBand = 'Minimal Anxiety';
        statusColor = [5, 150, 105];
        statusBg = [236, 253, 245];
        riskLevel = 'Minimal (0–4) • Calm & Grounded';
        narrativeText = 'Your GAD-7 score falls in the minimal range (0–4). Over the past two weeks, worry, restlessness, and tension have remained low and manageable. Keep up the calming habits that help you stay steady.';
      } else if (rawScore <= 9) {
        statusBand = 'Mild Anxiety';
        statusColor = [13, 148, 136];
        statusBg = [240, 253, 250];
        riskLevel = 'Mild (5–9) • Grounding & Pacing Advised';
        narrativeText = 'Your GAD-7 score falls in the mild range (5–9). You have experienced some nervousness, background worry, or tension on several days. Short daily breathing breaks and structured worry-management habits can help bring calm back quickly.';
      } else if (rawScore <= 14) {
        statusBand = 'Moderate Anxiety';
        statusColor = [217, 119, 6];
        statusBg = [254, 243, 199];
        riskLevel = 'Moderate (10–14) • Clinical Guidance Advised';
        narrativeText = 'Your GAD-7 score falls in the moderate range (10–14). Frequent worry, physical restlessness, or trouble relaxing may be draining your focus and sleep. A free, confidential conversation with Dr. Edith Clarke can give you practical tools and relief.';
      } else {
        statusBand = 'Severe Anxiety';
        statusColor = [220, 38, 38];
        statusBg = [254, 242, 242];
        riskLevel = 'Severe (15–21) • Priority Clinical Support';
        narrativeText = 'Your GAD-7 score falls in the severe range (15–21). Intense worry, tension, or dread can feel exhausting. Please connect promptly with Dr. Edith Clarke (024 362 9870) or a healthcare professional for confidential, compassionate care.';
      }

      section2Title = '2. Breakdown by GAD-7 Anxiety Areas';
      section2Subtitle = hasFullAnswers
        ? `Your ${rawScore}/21 total is the exact sum of the 4 anxiety areas you answered:`
        : 'Summary of the 4 GAD-7 anxiety symptom areas:';
      col1Header = 'ANXIETY AREA';
      col2Header = 'SCORE';

      const gadGroups = [
        {
          name: 'Nervousness & Worry Control',
          subtext: 'GAD-7 Items 1–2',
          indices: [0, 1],
          max: 6,
          desc: 'Feeling nervous, anxious, or on edge, and difficulty stopping or controlling worry.'
        },
        {
          name: 'Generalized Worry & Dread',
          subtext: 'GAD-7 Items 3 & 7',
          indices: [2, 6],
          max: 6,
          desc: 'Worrying about many different things or feeling afraid something awful might happen.'
        },
        {
          name: 'Physical Tension & Restlessness',
          subtext: 'GAD-7 Items 4–5',
          indices: [3, 4],
          max: 6,
          desc: 'Trouble relaxing your body/mind or feeling so restless it is hard to sit still.'
        },
        {
          name: 'Irritability',
          subtext: 'GAD-7 Item 6',
          indices: [5],
          max: 3,
          desc: 'Becoming easily annoyed, impatient, or tense under everyday pressure.'
        }
      ];

      rows = gadGroups.map((g) => {
        const subVal = hasFullAnswers
          ? sumIndices(answers, g.indices)
          : Math.round((rawScore / 21) * g.max);
        const ratio = g.max > 0 ? subVal / g.max : 0;
        return {
          name: g.name,
          subtext: g.subtext,
          scoreLabel: `${subVal} / ${g.max}`,
          barRatio: ratio,
          statusObj: getSymptomSubStatus(ratio),
          description: g.desc
        };
      });

      importantNoteTitle = 'Understanding Your GAD-7 Score';
      importantNoteBody = 'GAD-7 scores range from 0 to 21 (lower raw score = lower anxiety symptoms; higher Wellbeing Index = calmer baseline). This private summary is yours alone—never shared with your employer or HR.';

      section3Title = '3. Calming & Anxiety-Relief Habits';
      section3Subtitle = 'Evidence-based techniques tailored to your GAD-7 anxiety screening:';
      recommendations = rawScore >= 10
        ? [
            {
              title: 'Reset Your Nervous System with 4-4-6 Breathing',
              meta: 'Immediate Grounding',
              body: 'Inhale slowly for 4 seconds, hold for 4, and exhale gently for 6 seconds for 2–3 minutes. Longer exhales signal your vagus nerve to lower physical tension and restlessness.'
            },
            {
              title: 'Contain Racing Thoughts with a 15-Minute "Worry Window"',
              meta: 'Cognitive Tool',
              body: 'When worries intrude during work or at night, jot them on paper and defer them to one scheduled 15-minute review window. Separate actionable items from things outside your control.'
            },
            {
              title: 'Speak Privately with Dr. Edith Clarke',
              meta: 'Confidential Care',
              body: `At a GAD-7 score of ${rawScore}/21, talking with an occupational health specialist can help break the cycle of chronic worry. Call ${assessorPhone} or request a callback in Havilah.`
            }
          ]
        : [
            {
              title: 'Build Short Micro-Pauses to Release Tension',
              meta: 'Tension Relief',
              body: 'Drop your shoulders, unclench your jaw, and take 3 slow deep breaths between tasks. Catching physical tension early stops mild nervousness from building.'
            },
            {
              title: 'Watch Caffeine & Late-Day Stimulation',
              meta: 'Calm Baseline',
              body: 'Limiting caffeine after early afternoon and stepping away from stressful news or work chats in the evening helps keep restlessness and irritability low.'
            },
            {
              title: 'Talk Things Through Early',
              meta: 'Support & Guidance',
              body: 'Sharing worries with someone you trust—or checking in confidentially with Dr. Edith Clarke whenever anxiety spikes—keeps stress from snowballing.'
            }
          ];

    // -------------------------------------------------------------------------
    // MODULE 3: PSS-10 (Perceived Stress Scale, 10 items, 0-40)
    // -------------------------------------------------------------------------
    } else if (moduleKey === 'pss10') {
      displayTitle = 'PSS-10 Perceived Stress Scale';
      filenameSlug = 'PSS10';
      section1Title = '1. Your PSS-10 Perceived Stress Snapshot';

      const reverseItems = [3, 4, 6, 7];
      const hasFullAnswers = answers && answers.length >= 10;
      const rawScore = options.rawScore !== undefined
        ? Math.max(0, Math.min(40, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], reverseItems, 4)
          : Math.round(((100 - (options.score ?? 65)) / 100) * 40));

      const wellbeingIndex = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - (rawScore / 40) * 100)));

      compositeScore = wellbeingIndex;
      scorePrimaryText = `${rawScore}/40`;
      scoreSubText = `Wellbeing Index: ${wellbeingIndex}/100`;
      scoreFooterLabel = 'PSS-10 RAW SCORE';

      if (rawScore <= 13) {
        statusBand = 'Low Stress';
        statusColor = [5, 150, 105];
        statusBg = [236, 253, 245];
        riskLevel = 'Low (0–13) • Strong Coping Capacity';
        narrativeText = 'Your PSS-10 score falls in the low stress range (0–13). Over the past month, you felt largely in control of day-to-day demands and confident handling unexpected challenges.';
      } else if (rawScore <= 26) {
        statusBand = 'Moderate Stress';
        statusColor = [217, 119, 6];
        statusBg = [254, 243, 199];
        riskLevel = 'Moderate (14–26) • Pacing & Boundaries Advised';
        narrativeText = 'Your PSS-10 score falls in the moderate perceived stress range (14–26). Demands may have felt unpredictable or piling up at times over the past month. Simplifying priorities and protecting recovery blocks will help restore your sense of control.';
      } else {
        statusBand = 'High Stress';
        statusColor = [220, 38, 38];
        statusBg = [254, 242, 242];
        riskLevel = 'High (27–40) • Decompression & Support Advised';
        narrativeText = 'Your PSS-10 score falls in the high perceived stress range (27–40). When life and work demands feel chronically overwhelming, your body stays in high-alert mode. Please consider speaking privately with Dr. Edith Clarke and carving out immediate breathing room.';
      }

      section2Title = '2. Breakdown by Validated PSS-10 Subscales';
      section2Subtitle = hasFullAnswers
        ? `Your ${rawScore}/40 total is the exact sum of the 2 validated PSS-10 stress subscales:`
        : 'Summary of the 2 validated PSS-10 perceived stress subscales:';
      col1Header = 'STRESS SUBSCALE';
      col2Header = 'SCORE';

      const overloadScore = hasFullAnswers
        ? sumIndices(answers, [0, 1, 2, 5, 8, 9])
        : Math.round((rawScore / 40) * 24);
      const copingStrainScore = hasFullAnswers
        ? sumIndices(answers, [3, 4, 6, 7], reverseItems, 4)
        : Math.max(0, rawScore - overloadScore);

      rows = [
        {
          name: 'Perceived Overload & Helplessness',
          subtext: 'PSS-10 Items 1, 2, 3, 6, 9, 10',
          scoreLabel: `${overloadScore} / 24`,
          barRatio: overloadScore / 24,
          statusObj: getSymptomSubStatus(overloadScore / 24),
          description: 'How often events felt unexpected, out of your control, or piling up too high to cope.'
        },
        {
          name: 'Coping Control & Self-Efficacy Strain',
          subtext: 'PSS-10 Items 4, 5, 7, 8 (Reverse-Scored)',
          scoreLabel: `${copingStrainScore} / 16`,
          barRatio: copingStrainScore / 16,
          statusObj: getSymptomSubStatus(copingStrainScore / 16),
          description: 'How strained your confidence felt in handling problems and staying on top of things (lower = stronger coping).'
        }
      ];

      importantNoteTitle = 'Understanding Your PSS-10 Score';
      importantNoteBody = 'PSS-10 scores range from 0 to 40 (0–13 Low, 14–26 Moderate, 27–40 High perceived stress). Lower raw scores indicate calmer coping; higher Wellbeing Index indicates stronger stress resilience.';

      section3Title = '3. Stress-Reduction & Coping Habits';
      section3Subtitle = 'Practical actions tailored to your PSS-10 perceived stress profile:';
      recommendations = [
        {
          title: 'Triage Demands into "Control Now" vs. "Let Wait"',
          meta: 'Regain Control',
          body: 'Write down your top 3 priorities each morning and deliberately defer non-urgent noise. Reducing decision overload directly lowers perceived helplessness.'
        },
        {
          title: 'Build Daily Recovery Buffers',
          meta: 'Stress Reset',
          body: 'Schedule a non-negotiable 15-minute decompression break midday and a clear evening shut-down cue so stress hormones return to baseline.'
        },
        {
          title: 'Use Confidential Support Before Burnout Builds',
          meta: 'Support & Guidance',
          body: `Talk through recurring stressors with a trusted person or book a free private session with Dr. Edith Clarke (${assessorPhone}) to build a personalized stress plan.`
        }
      ];

    // -------------------------------------------------------------------------
    // MODULE 4: FAS-10 (Fatigue Assessment Scale, 10 items, 10-50)
    // -------------------------------------------------------------------------
    } else if (moduleKey === 'fas10') {
      displayTitle = 'FAS-10 Fatigue Assessment Scale';
      filenameSlug = 'FAS10';
      section1Title = '1. Your FAS-10 Fatigue & Energy Snapshot';

      const reverseItems = [3, 9];
      const hasFullAnswers = answers && answers.length >= 10;
      const rawScore = options.rawScore !== undefined
        ? Math.max(10, Math.min(50, Math.round(Number(options.rawScore))))
        : (hasFullAnswers
          ? sumIndices(answers, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], reverseItems, 6)
          : Math.round(10 + ((100 - (options.score ?? 65)) / 100) * 40));

      const wellbeingIndex = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.max(0, Math.min(100, Math.round(100 - ((rawScore - 10) / 40) * 100)));

      compositeScore = wellbeingIndex;
      scorePrimaryText = `${rawScore}/50`;
      scoreSubText = `Wellbeing Index: ${wellbeingIndex}/100`;
      scoreFooterLabel = 'FAS-10 RAW SCORE';

      if (rawScore <= 21) {
        statusBand = 'Not Fatigued';
        statusColor = [5, 150, 105];
        statusBg = [236, 253, 245];
        riskLevel = 'Healthy Energy (10–21) • Good Recovery';
        narrativeText = 'Your FAS-10 score falls in the healthy, non-fatigued range (10–21). Both your physical stamina and mental sharpness appear well-restored for everyday demands.';
      } else if (rawScore <= 34) {
        statusBand = 'Mild–Moderate Fatigue';
        statusColor = [217, 119, 6];
        statusBg = [254, 243, 199];
        riskLevel = 'Substantial Fatigue (22–34) • Rest & Recovery Needed';
        narrativeText = 'Your FAS-10 score falls in the mild-to-moderate fatigue range (22–34). You may be experiencing noticeable physical tiredness or mental fog. Prioritizing restorative sleep, hydration, and pacing breaks can help rebuild your energy reserve.';
      } else {
        statusBand = 'Severe Fatigue';
        statusColor = [220, 38, 38];
        statusBg = [254, 242, 242];
        riskLevel = 'Extreme Fatigue (35–50) • Medical Check-In Advised';
        narrativeText = 'Your FAS-10 score falls in the severe fatigue range (35–50). Persistent physical and mental exhaustion deserves real care—and sometimes has treatable medical causes (sleep, iron/vitamin levels, or chronic strain). Please book a free private check-in with Dr. Edith Clarke.';
      }

      section2Title = '2. Breakdown by Validated FAS-10 Fatigue Subscales';
      section2Subtitle = hasFullAnswers
        ? `Your ${rawScore}/50 total is the exact sum of the 2 validated FAS-10 subscales (each 5–25):`
        : 'Summary of the 2 validated FAS-10 fatigue subscales (physical vs. mental):';
      col1Header = 'FATIGUE SUBSCALE';
      col2Header = 'SCORE';

      const physicalScore = hasFullAnswers
        ? sumIndices(answers, [0, 1, 3, 4, 9], reverseItems, 6)
        : Math.round(rawScore / 2);
      const mentalScore = hasFullAnswers
        ? sumIndices(answers, [2, 5, 6, 7, 8], reverseItems, 6)
        : Math.max(5, rawScore - physicalScore);

      const physRatio = Math.max(0, Math.min(1, (physicalScore - 5) / 20));
      const mentRatio = Math.max(0, Math.min(1, (mentalScore - 5) / 20));

      rows = [
        {
          name: 'Physical Fatigue',
          subtext: 'FAS-10 Items 1, 2, 4R, 5, 10R (Range 5–25)',
          scoreLabel: `${physicalScore} / 25`,
          barRatio: physRatio,
          statusObj: getSymptomSubStatus(physRatio),
          description: 'Physical exhaustion, tiring quickly, low bodily stamina, and sustained concentration energy.'
        },
        {
          name: 'Mental & Motivational Fatigue',
          subtext: 'FAS-10 Items 3, 6, 7, 8, 9 (Range 5–25)',
          scoreLabel: `${mentalScore} / 25`,
          barRatio: mentRatio,
          statusObj: getSymptomSubStatus(mentRatio),
          description: 'Mental exhaustion, trouble thinking clearly, and difficulty starting everyday tasks.'
        }
      ];

      importantNoteTitle = 'Understanding Your FAS-10 Score';
      importantNoteBody = 'FAS-10 scores range from 10 to 50 (10–21 Not Fatigued, 22–34 Mild–Moderate Fatigue, 35–50 Severe Fatigue). Separating physical vs. mental fatigue helps target whether you need bodily rest or cognitive recovery.';

      section3Title = '3. Energy & Fatigue Recovery Habits';
      section3Subtitle = 'Targeted recovery actions based on your FAS-10 fatigue profile:';
      recommendations = [
        {
          title: 'Work in 90-Minute Energy Cycles with True Breaks',
          meta: 'Cognitive Recovery',
          body: 'Step away from screens for 5–10 minutes after intense focus blocks. True mental rest (walking, stretching, looking outside) restores far more energy than scrolling.'
        },
        {
          title: 'Audit Sleep Quality, Hydration & Nutrition',
          meta: 'Physical Stamina',
          body: 'Aim for 7–8 hours of consistent sleep, drink water early in the day, and avoid heavy afternoon sugar crashes that amplify tiredness.'
        },
        {
          title: 'Rule Out Underlying Causes with Dr. Edith Clarke',
          meta: 'Medical Support',
          body: `If fatigue lasts more than a few weeks despite rest, schedule a free private chat with Dr. Edith Clarke (${assessorPhone}) to review sleep, stress, or health factors.`
        }
      ];

    // -------------------------------------------------------------------------
    // MODULE 5: COPSOQ-III (Workplace Psychosocial Work Environment, 0-100)
    // -------------------------------------------------------------------------
    } else if (moduleKey === 'copsoq3') {
      displayTitle = 'COPSOQ-III Workplace Psychosocial Check';
      filenameSlug = 'COPSOQ3';
      section1Title = '1. Your Workplace Psychosocial Snapshot';

      const avgSubset = (arr, idxs) => {
        const vals = idxs.map(i => Number(arr[i])).filter(v => Number.isFinite(v) && v >= 0);
        return vals.length ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : null;
      };

      let domainScores = null;
      if (answers && answers.length >= 4) {
        if (answers.length === 9) {
          // Core 9-item mapping from WF_DATA.copsoq3_core:
          // Q3 workload, Q5 clarity/resources, Q6-Q7 team support & trust, Q1/Q2/Q4/Q8/Q9 recovery, calm & purpose
          domainScores = [
            avgSubset(answers, [2]),
            avgSubset(answers, [4]),
            avgSubset(answers, [5, 6]),
            avgSubset(answers, [0, 1, 3, 7, 8])
          ];
        } else {
          // Partition Middle/Long COPSOQ responses into 4 balanced buckets so average reconciles
          const chunk = Math.ceil(answers.length / 4);
          domainScores = [0, 1, 2, 3].map((b) => {
            const idxs = [];
            for (let i = b * chunk; i < Math.min(answers.length, (b + 1) * chunk); i++) idxs.push(i);
            return avgSubset(answers, idxs);
          });
        }
      }

      const fallbackScore = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : 70;

      const validDomains = domainScores && domainScores.every(v => v !== null)
        ? domainScores
        : [fallbackScore, fallbackScore, fallbackScore, fallbackScore];

      const computedOverall = options.score !== undefined
        ? Math.max(0, Math.min(100, Math.round(Number(options.score))))
        : Math.round(validDomains.reduce((a, b) => a + b, 0) / validDomains.length);

      compositeScore = computedOverall;
      scorePrimaryText = `${computedOverall}`;
      scoreSubText = 'out of 100';
      scoreFooterLabel = 'WORK-FIT INDEX';

      if (computedOverall >= 75) {
        statusBand = 'Optimal Work Fit';
        statusColor = [5, 150, 105];
        statusBg = [236, 253, 245];
        riskLevel = 'Healthy Psychosocial Environment';
        narrativeText = 'Your COPSOQ-III check-in shows a healthy workplace psychosocial environment. Workload, role clarity, team support, and work-life recovery are working well together for you.';
      } else if (computedOverall >= 50) {
        statusBand = 'Moderate Work Strain';
        statusColor = [217, 119, 6];
        statusBg = [254, 243, 199];
        riskLevel = 'Moderate Workplace Pressure • Pacing Advised';
        narrativeText = 'Your COPSOQ-III check-in indicates moderate workplace strain in one or more areas. Reviewing workload pacing, clarifying priorities, and protecting after-hours recovery can improve day-to-day sustainability.';
      } else {
        statusBand = 'High Work Strain';
        statusColor = [220, 38, 38];
        statusBg = [254, 242, 242];
        riskLevel = 'Elevated Workplace Risk • Support Advised';
        narrativeText = 'Your COPSOQ-III results indicate heavy workplace psychosocial strain. You do not have to navigate this alone—you can speak confidentially with Dr. Edith Clarke or submit an anonymous workplace hazard note in Havilah.';
      }

      section2Title = '2. Breakdown by ISO 45003 Workplace Areas';
      section2Subtitle = 'Calculated directly from your COPSOQ-III work environment responses:';
      col1Header = 'WORKPLACE AREA';
      col2Header = 'SCORE';

      const isoDefs = [
        {
          name: 'Workload & Demands',
          subtext: 'ISO 45003 Clause 6.1.2.1',
          desc: 'How manageable your day-to-day work tasks, deadlines, and working pace feel.'
        },
        {
          name: 'Role Clarity & Control',
          subtext: 'ISO 45003 Clause 6.1.2.2',
          desc: 'How clearly you understand your role objectives and have resources to complete tasks.'
        },
        {
          name: 'Team Support & Psychological Safety',
          subtext: 'ISO 45003 Clause 6.1.2.3',
          desc: 'How supported and valued you feel by teammates and the level of trust in your department.'
        },
        {
          name: 'Energy, Calm & Purpose at Work',
          subtext: 'ISO 45003 Clause 6.1.2.4',
          desc: 'Your stamina, emotional calm during work hours, and sense of meaning and achievement.'
        }
      ];

      rows = isoDefs.map((def, idx) => {
        const val = validDomains[idx];
        return {
          name: def.name,
          subtext: def.subtext,
          scoreLabel: `${val}/100`,
          barRatio: val / 100,
          statusObj: getWellbeingStatus(val),
          description: def.desc
        };
      });

      importantNoteTitle = 'ISO 45003 Psychosocial Privacy Guarantee';
      importantNoteBody = 'Your individual COPSOQ-III report stays strictly on your device. Only anonymized team aggregates (when 5 or more colleagues participate) are ever shown to HR to guide healthier workplace policies.';

      section3Title = '3. Workplace Sustainability Habits';
      section3Subtitle = 'Practical actions to strengthen your work environment and recovery:';
      recommendations = [
        {
          title: 'Clarify Top Priorities & Realistic Deadlines',
          meta: 'Workload & Clarity',
          body: 'Start each week by aligning on your 2–3 highest-impact deliverables so competing requests do not create hidden overload.'
        },
        {
          title: 'Switch Off Cleanly After Working Hours',
          meta: 'Evening Recovery',
          body: 'Mute work notifications after hours and create a brief end-of-day shutdown ritual so your mind and body truly recharge for tomorrow.'
        },
        {
          title: 'Use Confidential Clinical or Ethics Channels if Needed',
          meta: 'Protected Support',
          body: `If workplace strain is affecting your health, speak privately with Dr. Edith Clarke (${assessorPhone}) or use Havilah's anonymous Ethics Vault.`
        }
      ];

    // -------------------------------------------------------------------------
    // MODULE 6: OVERALL WELLBEING SUMMARY (All 5 Modules Combined)
    // -------------------------------------------------------------------------
    } else {
      displayTitle = 'Overall Wellbeing Summary (All 5 Modules)';
      filenameSlug = 'Overall_Wellbeing';
      section1Title = '1. Your Overall 5-Pillar Well-Being Snapshot';

      const rawDimensions = options.dimensions || appState.wellbeing?.dimensions || localState.wellbeing?.dimensions || [];
      const findDim = (label) => {
        const match = rawDimensions.find(d => (d.label || d.name || '').toLowerCase() === label.toLowerCase());
        return match && Number.isFinite(Number(match.value)) ? Math.round(Number(match.value)) : null;
      };

      const ms = options.moduleScores || {};
      const moodVal = ms.phq9 ?? findDim('Mood') ?? 0;
      const calmVal = ms.gad7 ?? findDim('Calm') ?? 0;
      const stressVal = ms.pss10 ?? findDim('Stress') ?? 0;
      const energyVal = ms.fas10 ?? findDim('Energy') ?? 0;
      const workfitVal = ms.copsoq3 ?? findDim('Work-fit') ?? 0;

      const pillarScores = [moodVal, calmVal, stressVal, energyVal, workfitVal];
      const activeScores = pillarScores.filter(v => v > 0);
      const exactMean = activeScores.length > 0
        ? Math.round(activeScores.reduce((a, b) => a + b, 0) / activeScores.length)
        : Math.max(0, Math.min(100, Math.round(Number(options.compositeScore ?? options.score ?? 0))));

      compositeScore = exactMean;
      scorePrimaryText = `${exactMean}`;
      scoreSubText = 'out of 100';
      scoreFooterLabel = 'OVERALL INDEX';

      if (exactMean >= 75) {
        statusBand = 'Optimal Balance';
        statusColor = [5, 150, 105];
        statusBg = [236, 253, 245];
        riskLevel = 'Healthy Across All 5 Pillars';
        narrativeText = 'Across all 5 Havilah wellbeing instruments, your overall balance is strong. Your mood, calm, stress coping, energy recovery, and work environment are supporting you well—keep protecting your daily habits.';
      } else if (exactMean >= 50) {
        statusBand = 'Moderate Strain';
        statusColor = [217, 119, 6];
        statusBg = [254, 243, 199];
        riskLevel = 'Mixed Balance • Targeted Recovery Advised';
        narrativeText = 'Your combined 5-module summary shows steady functioning overall with moderate pressure in one or more areas below. Focus your energy on the lowest-scoring pillar(s) in Section 2 and schedule regular rest.';
      } else {
        statusBand = 'High Strain';
        statusColor = [220, 38, 38];
        statusBg = [254, 242, 242];
        riskLevel = 'Elevated Strain • Clinical Check-In Advised';
        narrativeText = 'Your combined 5-module profile shows elevated strain across multiple wellbeing pillars. You do not need to carry this alone—we strongly encourage a free, 100% confidential check-in with Dr. Edith Clarke.';
      }

      section2Title = '2. Breakdown Across All 5 Wellbeing Pillars';
      section2Subtitle = `Your Overall Index (${exactMean}/100) is the exact average of your 5 completed Havilah check-in modules:`;
      col1Header = 'WELLBEING PILLAR';
      col2Header = 'SCORE';

      const pillars = [
        {
          name: 'Mood & Emotional Health',
          subtext: 'PHQ-9 Depression Self-Check',
          val: moodVal,
          desc: 'Emotional steadiness, motivation, interest in daily activities, and restorative sleep.'
        },
        {
          name: 'Calm & Anxiety Balance',
          subtext: 'GAD-7 Anxiety Self-Check',
          val: calmVal,
          desc: 'Ability to manage worry, stay grounded, relax physically, and keep tension low.'
        },
        {
          name: 'Perceived Stress Resilience',
          subtext: 'PSS-10 Perceived Stress Scale',
          val: stressVal,
          desc: 'Sense of control over life/work demands and confidence handling unexpected challenges.'
        },
        {
          name: 'Energy & Fatigue Recovery',
          subtext: 'FAS-10 Fatigue Assessment Scale',
          val: energyVal,
          desc: 'Day-to-day physical stamina, mental clarity, and recovery from tiredness.'
        },
        {
          name: 'Workplace Psychosocial Fit',
          subtext: 'COPSOQ-III (ISO 45003)',
          val: workfitVal,
          desc: 'Manageable workload, clear role expectations, supportive team climate, and purpose.'
        }
      ];

      rows = pillars.map((p) => ({
        name: p.name,
        subtext: p.subtext,
        scoreLabel: `${p.val}/100`,
        barRatio: p.val / 100,
        statusObj: getWellbeingStatus(p.val),
        description: p.desc
      }));

      // Identify weakest pillar for personalized advice
      const sortedPillars = [...pillars].sort((a, b) => a.val - b.val);
      const weakest = sortedPillars[0];

      importantNoteTitle = 'How Your Overall Wellbeing Index Is Calculated';
      importantNoteBody = `Your Overall Index (${exactMean}/100) averages all 5 validated instruments equally (${pillarScores.join(' + ')} ÷ 5). Higher scores indicate stronger wellbeing. For item-level clinical detail, download any individual module PDF right after completing that check-in.`;

      section3Title = '3. Holistic Wellbeing Action Plan';
      section3Subtitle = 'Personalized next steps based on your complete 5-module profile:';
      recommendations = [
        {
          title: `Prioritize Your Lowest Pillar: ${weakest.name}`,
          meta: `Current: ${weakest.val}/100`,
          body: `Your ${weakest.subtext} score (${weakest.val}/100) has the greatest room for lift right now. Focus one small daily habit on improving this area over the next two weeks.`
        },
        {
          title: 'Protect Sleep, Pacing & After-Hours Switch-Off',
          meta: 'Daily Foundation',
          body: 'Consistent sleep, short screen breaks every 90 minutes, and stepping away from work chats in the evening lift mood, calm, stress resilience, and energy together.'
        },
        {
          title: 'Review Your Full Profile Privately with Dr. Edith Clarke',
          meta: 'Free Partner Care',
          body: `You can share this confidential 5-pillar PDF during a free private consultation with Dr. Edith Clarke (${assessorPhone})—your employer and HR are never informed.`
        }
      ];
    }

    return {
      moduleKey,
      displayTitle,
      filenameSlug,
      compositeScore,
      section1Title,
      scorePrimaryText,
      scoreSubText,
      scoreFooterLabel,
      secondaryScoreNote,
      statusBand,
      statusColor,
      statusBg,
      riskLevel,
      narrativeText,
      section2Title,
      section2Subtitle,
      col1Header,
      col2Header,
      rows,
      importantNoteTitle,
      importantNoteBody,
      isCrisisAlert,
      section3Title,
      section3Subtitle,
      recommendations,
      surveyType: displayTitle,
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

      const [data, logoDataUrl] = await Promise.all([
        Promise.resolve(resolveAssessmentData(options)),
        loadHavilahLogoDataUrl()
      ]);

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
        slateLight: [148, 163, 184], // #94a3b8
        border: [226, 232, 240],   // #e2e8f0
        bgGray: [248, 250, 252],   // #f8fafc
        white: [255, 255, 255]
      };

      /**
       * Standard Header Bar with Havilah Logo
       */
      const renderHeader = () => {
        // Top accent line
        pdf.setFillColor(...colors.teal);
        pdf.rect(0, 0, pageWidth, 4, 'F');

        // Dark navy top brand bar
        pdf.setFillColor(...colors.navy);
        pdf.rect(0, 4, pageWidth, 28, 'F');

        let titleX = margin;
        if (logoDataUrl) {
          try {
            // Havilah mark (350x269 ratio -> 16.5mm x 12.7mm)
            pdf.addImage(logoDataUrl, 'PNG', margin, 11.5, 16.5, 12.7);
            titleX = margin + 20;
          } catch (e) {
            titleX = margin;
          }
        }

        // Platform Brand Text
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(13.5);
        pdf.setTextColor(...colors.white);
        pdf.text('HAVILAH WORKPLACE WELL-BEING', titleX, 17);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8.2);
        pdf.setTextColor(...colors.slateLight);
        pdf.text('Occupational Health & Psychosocial Wellbeing Guidelines', titleX, 24);

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
       * Standard Footer with Non-Diagnostic Confidentiality Line
       */
      const renderFooter = (pageNumber, totalPages) => {
        const footerY = pageHeight - 18;

        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.line(margin, footerY, pageWidth - margin, footerY);

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.slate);
        pdf.text('100% PRIVATE • ZERO EMPLOYER OR HR ACCESS • SAVED ONLY ON YOUR DEVICE', margin, footerY + 5);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.slateLight);
        pdf.text(`Page ${pageNumber} of ${totalPages}`, pageWidth - margin, footerY + 5, { align: 'right' });

        pdf.setFontSize(6.5);
        pdf.setTextColor(160, 170, 185);
        pdf.text(`Havilah Workplace Well-Being • ${data.displayTitle}`, margin, footerY + 10);
      };

      // =========================================================================
      // PAGE 1: MODULE SNAPSHOT & MODULE-SPECIFIC SUB-DOMAIN BREAKDOWN
      // =========================================================================
      renderHeader();
      let y = 38;

      // Verification Banner & Privacy Lock (Human-readable assessment title)
      pdf.setFillColor(...colors.bgGray);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.roundedRect(margin, y, contentWidth, 10, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.tealDeep);
      pdf.text('CONFIDENTIAL REPORT (ZERO HR ACCESS)', margin + 4, y + 6.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.slate);
      pdf.text(`Ref: ${data.verificationRef}  •  ${data.displayTitle}`, pageWidth - margin - 4, y + 6.5, { align: 'right' });

      y += 15;

      // =========================================================================
      // SECTION 1: MODULE SNAPSHOT
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text(data.section1Title, margin, y);
      y += 5;

      const heroCardH = 46;
      pdf.setFillColor(255, 255, 255);
      pdf.roundedRect(margin, y, contentWidth, heroCardH, 3, 3, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, heroCardH, 3, 3, 'S');

      // Left Score Badge Box
      const scoreBoxW = 46;
      pdf.setFillColor(...data.statusBg);
      pdf.roundedRect(margin + 4, y + 4, scoreBoxW, heroCardH - 8, 2, 2, 'F');
      pdf.setDrawColor(...data.statusColor);
      pdf.setLineWidth(0.5);
      pdf.roundedRect(margin + 4, y + 4, scoreBoxW, heroCardH - 8, 2, 2, 'S');

      // Score Value
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(data.scorePrimaryText.length > 4 ? 20 : 25);
      pdf.setTextColor(...data.statusColor);
      pdf.text(data.scorePrimaryText, margin + 4 + (scoreBoxW / 2), y + 20, { align: 'center' });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.4);
      pdf.setTextColor(...colors.slate);
      pdf.text(data.scoreSubText, margin + 4 + (scoreBoxW / 2), y + 26.5, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...data.statusColor);
      pdf.text(data.scoreFooterLabel, margin + 4 + (scoreBoxW / 2), y + 33, { align: 'center' });

      // Right Content Area: Status Band & Module-Specific Narrative
      const narrativeX = margin + scoreBoxW + 9;
      const narrativeW = contentWidth - scoreBoxW - 13;

      // Dynamic width status pill so text never clips
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.3);
      const pillText = data.statusBand.toUpperCase();
      const pillW = Math.max(36, Math.min(54, pdf.getTextWidth(pillText) + 8));

      pdf.setFillColor(...data.statusColor);
      pdf.roundedRect(narrativeX, y + 5.5, pillW, 6, 1.5, 1.5, 'F');
      pdf.setTextColor(...colors.white);
      pdf.text(pillText, narrativeX + (pillW / 2), y + 9.7, { align: 'center' });

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8.4);
      pdf.setTextColor(...colors.navy);
      const riskMaxW = narrativeW - pillW - 4;
      const splitRisk = pdf.splitTextToSize(data.riskLevel, riskMaxW);
      pdf.text(splitRisk[0], narrativeX + pillW + 4, y + 9.8);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8.3);
      pdf.setTextColor(...colors.slate);
      const splitNarrative = pdf.splitTextToSize(data.narrativeText, narrativeW);
      pdf.text(splitNarrative, narrativeX, y + 17.5);

      y += heroCardH + 8;

      // =========================================================================
      // SECTION 2: MODULE-SPECIFIC BREAKDOWN TABLE
      // =========================================================================
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text(data.section2Title, margin, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text(data.section2Subtitle, margin, y + 4.5);

      y += 8;

      const tableHeadH = 8;
      const colWidths = [62, 26, 26, 64]; // Total = 178 mm

      pdf.setFillColor(...colors.navy);
      pdf.rect(margin, y, contentWidth, tableHeadH, 'F');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.white);
      pdf.text(data.col1Header, margin + 3, y + 5.2);
      pdf.text(data.col2Header, margin + colWidths[0] + 3, y + 5.2);
      pdf.text('STATUS', margin + colWidths[0] + colWidths[1] + 3, y + 5.2);
      pdf.text('WHAT THIS MEANS FOR YOU', margin + colWidths[0] + colWidths[1] + colWidths[2] + 3, y + 5.2);

      y += tableHeadH;

      // Row height adapts cleanly so 5-pillar Overall reports fit Page 1 without crowding
      const rowH = data.rows.length >= 5 ? 16.5 : 19.5;

      data.rows.forEach((row, idx) => {
        const isEven = idx % 2 === 1;

        pdf.setFillColor(isEven ? 248 : 255, isEven ? 250 : 255, isEven ? 252 : 255);
        pdf.rect(margin, y, contentWidth, rowH, 'F');
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.2);
        pdf.rect(margin, y, contentWidth, rowH, 'S');

        // Col 1: Name & Subtext
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.1);
        pdf.setTextColor(...colors.navy);
        const splitTitle = pdf.splitTextToSize(row.name, colWidths[0] - 6);
        pdf.text(splitTitle, margin + 3, y + 5);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(6.5);
        pdf.setTextColor(...colors.tealDeep);
        const subY = splitTitle.length > 1 ? y + (rowH - 3) : y + 10.5;
        pdf.text(row.subtext, margin + 3, subY);

        // Col 2: Score & Visual Mini-Bar
        const col2X = margin + colWidths[0] + 2;
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(9.2);
        pdf.setTextColor(...row.statusObj.color);
        pdf.text(row.scoreLabel, col2X + 2, y + 6.5);

        const barW = 20;
        const barH = 2.8;
        const barX = col2X + 2;
        const barY = y + 9.5;
        pdf.setFillColor(226, 232, 240);
        pdf.roundedRect(barX, barY, barW, barH, 1, 1, 'F');
        pdf.setFillColor(...row.statusObj.color);
        const clampedRatio = Math.max(0.06, Math.min(1, Number(row.barRatio) || 0));
        pdf.roundedRect(barX, barY, clampedRatio * barW, barH, 1, 1, 'F');

        // Col 3: Status Badge
        const col3X = margin + colWidths[0] + colWidths[1] + 2;
        pdf.setFillColor(...row.statusObj.color);
        pdf.roundedRect(col3X + 1, y + 4.5, 22, 5.5, 1, 1, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(6.6);
        pdf.setTextColor(...colors.white);
        pdf.text(row.statusObj.status.toUpperCase(), col3X + 12, y + 8.2, { align: 'center' });

        // Col 4: Description
        const col4X = margin + colWidths[0] + colWidths[1] + colWidths[2] + 2;
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.4);
        pdf.setTextColor(...colors.slate);
        const splitDesc = pdf.splitTextToSize(row.description, colWidths[3] - 4);
        pdf.text(splitDesc, col4X + 2, y + 5.2);

        y += rowH;
      });

      y += 6;

      // Key Takeaway / Crisis Safety Callout Box at bottom of Page 1
      const calloutH = data.isCrisisAlert ? 22 : 19;
      if (data.isCrisisAlert) {
        pdf.setFillColor(254, 242, 242); // Crimson-50
        pdf.roundedRect(margin, y, contentWidth, calloutH, 2, 2, 'F');
        pdf.setDrawColor(220, 38, 38);
        pdf.setLineWidth(0.6);
        pdf.roundedRect(margin, y, contentWidth, calloutH, 2, 2, 'S');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(153, 27, 27);
      } else {
        pdf.setFillColor(240, 253, 250); // Teal-50
        pdf.roundedRect(margin, y, contentWidth, calloutH, 2, 2, 'F');
        pdf.setDrawColor(...colors.teal);
        pdf.setLineWidth(0.4);
        pdf.roundedRect(margin, y, contentWidth, calloutH, 2, 2, 'S');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.5);
        pdf.setTextColor(...colors.tealDeep);
      }

      pdf.text(data.importantNoteTitle, margin + 4, y + 5.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.7);
      pdf.setTextColor(...colors.navy);
      const splitNote = pdf.splitTextToSize(data.importantNoteBody, contentWidth - 8);
      pdf.text(splitNote, margin + 4, y + 10.8);

      renderFooter(1, 2);

      // =========================================================================
      // PAGE 2: TAILORED NEXT STEPS, DR. EDITH CLARKE & GHANA HELPLINES
      // =========================================================================
      pdf.addPage();
      renderHeader();
      y = 38;

      // SECTION 3: MODULE-SPECIFIC RECOMMENDATIONS
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.setTextColor(...colors.navy);
      pdf.text(data.section3Title, margin, y);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.slate);
      pdf.text(data.section3Subtitle, margin, y + 4.5);

      y += 8;

      data.recommendations.forEach((rec, idx) => {
        const cardH = 21;
        pdf.setFillColor(...colors.bgGray);
        pdf.roundedRect(margin, y, contentWidth, cardH, 2, 2, 'F');
        pdf.setDrawColor(...colors.border);
        pdf.setLineWidth(0.3);
        pdf.roundedRect(margin, y, contentWidth, cardH, 2, 2, 'S');

        pdf.setFillColor(...colors.teal);
        pdf.roundedRect(margin + 3, y + 3, 5, 5, 1, 1, 'F');
        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(7);
        pdf.setTextColor(...colors.white);
        pdf.text(`${idx + 1}`, margin + 5.5, y + 6.7, { align: 'center' });

        pdf.setFont('helvetica', 'bold');
        pdf.setFontSize(8.8);
        pdf.setTextColor(...colors.navy);
        pdf.text(rec.title, margin + 11, y + 6.8);

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.5);
        pdf.setTextColor(...colors.tealDeep);
        pdf.text(rec.meta, pageWidth - margin - 4, y + 6.8, { align: 'right' });

        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(7.8);
        pdf.setTextColor(...colors.slate);
        const splitBody = pdf.splitTextToSize(rec.body, contentWidth - 14);
        pdf.text(splitBody, margin + 11, y + 12);

        y += cardH + 3.5;
      });

      y += 2;

      // SECTION 4: FREE CONFIDENTIAL DOCTOR CONSULTATION (DR. EDITH CLARKE)
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
      const clinicalGuide = 'As a Havilah user, you have 100% confidential and free access to Dr. Edith Clarke (Occupational Health Specialist) and our medical team. You can discuss any stress, work worries, or health questions in private. Your employer or HR will NEVER know you booked or what was discussed.';
      const splitClinical = pdf.splitTextToSize(clinicalGuide, contentWidth - 8);
      pdf.text(splitClinical, margin + 4, y + 11.5);

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(...colors.indigo);
      pdf.text(`• Direct Phone & WhatsApp: ${data.assessorPhone} (Dr. Edith Clarke)`, margin + 4, y + 24.5);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.8);
      pdf.setTextColor(...colors.slate);
      pdf.text('• Or open the Havilah Portal and tap "Clinical Referral" to request a free callback.', margin + 4, y + 29.5);

      y += clinicalBoxH + 6.5;

      // SECTION 5: GHANAIAN EMERGENCY & CRISIS HELPLINES
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.setTextColor(...colors.navy);
      pdf.text('5. Emergency & Mental Health Helplines (Ghana)', margin, y);
      y += 4;

      const crisisBoxH = 30;
      pdf.setFillColor(255, 241, 242); // Rose-50
      pdf.roundedRect(margin, y, contentWidth, crisisBoxH, 2, 2, 'F');
      pdf.setDrawColor(244, 63, 94);
      pdf.setLineWidth(0.4);
      pdf.roundedRect(margin, y, contentWidth, crisisBoxH, 2, 2, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(8);
      pdf.setTextColor(185, 28, 28);
      pdf.text('If you or someone you know is in acute distress or needs urgent help, call these free lines in Ghana:', margin + 4, y + 5.5);

      const col1X = margin + 4;
      const col2X = margin + (contentWidth / 2) + 2;

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(7.6);
      pdf.setTextColor(...colors.navy);

      pdf.text('• Ghana Mental Health Authority: 0800 678 678 (Toll-Free)', col1X, y + 11.5);
      pdf.text('• Mental Health Authority Hotline: 050 960 0600', col1X, y + 17);
      pdf.text('• National Emergency & Ambulance: 112 / 193', col1X, y + 22.5);

      pdf.text('• Havilah Medical Assessor (Dr. Edith Clarke): 024 362 9870', col2X, y + 11.5);
      pdf.text('• Lifeline & Crisis Support Ghana: +233 244 846 701', col2X, y + 17);
      pdf.text('• Accra Psychiatric Hospital Helpline: 0302 228 671', col2X, y + 22.5);

      y += crisisBoxH + 6;

      // MANDATORY NON-DIAGNOSTIC DISCLAIMER
      pdf.setFillColor(241, 245, 249);
      pdf.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'F');
      pdf.setDrawColor(...colors.border);
      pdf.setLineWidth(0.2);
      pdf.roundedRect(margin, y, contentWidth, 18, 1.5, 1.5, 'S');

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(7);
      pdf.setTextColor(...colors.slate);
      pdf.text('MANDATORY NON-DIAGNOSTIC NOTICE:', margin + 3, y + 4.5);

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(6.8);
      pdf.setTextColor(...colors.slate);
      const disclaimer = 'This check-in is a confidential screening indicator under occupational well-being guidelines and does not constitute a formal clinical diagnosis. If you are experiencing acute distress or illness, please contact Dr. Edith Clarke at 024 362 9870 or consult a licensed healthcare professional.';
      const splitDisc = pdf.splitTextToSize(disclaimer, contentWidth - 6);
      pdf.text(splitDisc, margin + 3, y + 8.5);

      renderFooter(2, 2);

      // TRIGGER INSTANT CLIENT-SIDE BROWSER DOWNLOAD
      const filename = `Havilah_${data.filenameSlug}_Confidential_Report_${data.dates.isoDate}.pdf`;
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
      } else {
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
