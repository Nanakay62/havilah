const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'private', 'app', 'dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const virtualConsole = new jsdom.VirtualConsole();

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  virtualConsole,
  url: "http://localhost/private/app/dashboard.html"
});

const window = dom.window;
const document = window.document;

// Mock Chart.js constructor
window.Chart = class MockChart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.options = config.options || {};
    this.data = config.data || {};
  }
  destroy() {}
};

// Mock session
window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3ItMTIzIiwiY29tcGFueUlkIjoidGVuLTk5OSIsImRlcGFydG1lbnRJZCI6IkRFTV8wMSIsInJvbGUiOiJlbXBsb3llZSJ9.signature');
window.localStorage.setItem('wf_user_name', 'Trend Worker');

setTimeout(() => {
  console.log("=== RUNNING TOOLTIP INSTRUMENT LABELS, CLINICAL SCORES & POP OVERFLOW CHECK ===");
  let testPassed = true;

  if (!window.App) {
    console.error("App object not found!");
    process.exit(1);
  }

  // Set test data across all instruments: DAILY_PULSE, PHQ-9, GAD-7, PSS-10, FAS-10, COPSOQ_III
  window.App.state.employeeHistoryPayload = [
    { date: "2026-08-10", score: 72, overallIndex: 72, source: "checkin_slider", dimensions: { mood: 70, calm: 65, stress: 78, energy: 71, workFit: 76 } },
    { date: "2026-08-11", score: 55, overallIndex: 55, source: "phq9", dimensions: null, clinical_score: 12, max_score: 27, severity_label: "Moderate Depression" },
    { date: "2026-08-11", score: 62, overallIndex: 62, source: "gad7", dimensions: null, clinical_score: 8, max_score: 21, severity_label: "Mild Anxiety" },
    { date: "2026-08-11", score: 69, overallIndex: 69, source: "pss10", dimensions: null, clinical_score: 18, max_score: 40, severity_label: "Moderate Stress" },
    { date: "2026-08-11", score: 45, overallIndex: 45, source: "fas10", dimensions: null, clinical_score: 28, max_score: 50, severity_label: "Moderate Fatigue" },
    { date: "2026-08-11", score: 80, overallIndex: 80, source: "copsoq3", dimensions: null, clinical_score: 80, max_score: 100, severity_label: "Favorable Psychosocial Environment" }
  ];

  window.App.updateTrendChart();

  const tooltipEl = document.getElementById('chartTooltip');
  if (!tooltipEl) {
    console.error("chartTooltip element not found!");
    process.exit(1);
  }

  const chartInstance = window.employeeTrendChartInstance;
  if (!chartInstance) {
    console.error("employeeTrendChartInstance not found!");
    process.exit(1);
  }

  const tooltipCallback = chartInstance.options.plugins.tooltip.external;

  // Test 1: PHQ-9 Clinical Score & Dynamic Header Title & Icon
  tooltipCallback({
    tooltip: { opacity: 1, caretX: 100, caretY: 100, dataPoints: [{ dataIndex: 1 }] }
  });
  const phq9Html = tooltipEl.innerHTML;
  console.log("PHQ-9 Tooltip HTML:\n", phq9Html);

  if (phq9Html.includes("PHQ-9 Depression Check") &&
      phq9Html.includes("Score: 12/27 • Overall Index: 55") &&
      !phq9Html.includes("Clinical Assessment")) {
    console.log("✓ SUCCESS 1: PHQ-9 renders exact title ('PHQ-9 Depression Check') and raw clinical score ('Score: 12/27 • Overall Index: 55')!");
  } else {
    console.error("FAILED 1: PHQ-9 title or clinical score formatting failed.");
    testPassed = false;
  }

  // Test 2: PSS-10 Perceived Stress Title & Raw Score
  tooltipCallback({
    tooltip: { opacity: 1, caretX: 200, caretY: 100, dataPoints: [{ dataIndex: 3 }] }
  });
  const pss10Html = tooltipEl.innerHTML;
  console.log("\nPSS-10 Tooltip HTML:\n", pss10Html);

  if (pss10Html.includes("PSS-10 Perceived Stress") &&
      pss10Html.includes("Score: 18/40 • Overall Index: 69")) {
    console.log("✓ SUCCESS 2: PSS-10 renders exact title ('PSS-10 Perceived Stress') and raw score ('Score: 18/40 • Overall Index: 69')!");
  } else {
    console.error("FAILED 2: PSS-10 title or score formatting failed.");
    testPassed = false;
  }

  // Test 3: Overflow / Clipping Prevention when caretY is near top (e.g. caretY = 10)
  tooltipCallback({
    tooltip: { opacity: 1, caretX: 300, caretY: 10, dataPoints: [{ dataIndex: 5 }] }
  });
  const transformStyle = tooltipEl.style.transform;
  const topStyle = tooltipEl.style.top;
  console.log(`\nTop Boundary Collision Test (caretY = 10):\n Top = ${topStyle}, Transform = ${transformStyle}`);

  if (transformStyle.includes("0%") && topStyle === "24px") {
    console.log("✓ SUCCESS 3: Collision positioning flips popover downward below node (top: 24px, transformY: 0%) to PREVENT TOP CLIPPING!");
  } else {
    console.error("FAILED 3: Top boundary collision positioning failed.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("TOOLTIP INSTRUMENT LABELS, CLINICAL SCORES & OVERFLOW CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("TOOLTIP INSTRUMENT LABELS, CLINICAL SCORES & OVERFLOW CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
