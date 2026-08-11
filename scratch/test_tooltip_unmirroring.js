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
  console.log("=== RUNNING TOOLTIP DIMENSION UNMIRRORING & CLINICAL HIDE CHECK ===");
  let testPassed = true;

  if (!window.App) {
    console.error("App object not found!");
    process.exit(1);
  }

  // 1. Daily Pulse entry with DISTINCT dimensions (Mood 68, Calm 62, Stress 75, Energy 60, Work-Fit 64)
  // 2. Formal Clinical Assessment entry (PHQ-9 with dimensions: null, clinical_score: 12, max_score: 27)
  window.App.state.employeeHistoryPayload = [
    {
      date: "2026-08-11",
      score: 66,
      overallIndex: 66,
      source: "checkin_slider",
      dimensions: { mood: 68, calm: 62, stress: 75, energy: 60, workFit: 64, work_fit: 64 }
    },
    {
      date: "2026-08-11",
      score: 55,
      overallIndex: 55,
      source: "phq9",
      dimensions: null,
      is_clinical: true,
      clinical_score: 12,
      max_score: 27,
      severity_label: "Moderate Depression"
    }
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

  // Test 1: Daily Pulse Data Point (Distinct values: 68, 62, 75, 60, 64)
  tooltipCallback({
    tooltip: {
      opacity: 1,
      caretX: 100,
      caretY: 100,
      dataPoints: [{ dataIndex: 0 }]
    }
  });

  const dailyPulseHtml = tooltipEl.innerHTML;
  console.log("Daily Pulse Tooltip HTML Output:\n", dailyPulseHtml);

  if (dailyPulseHtml.includes(">68</span>") &&
      dailyPulseHtml.includes(">62</span>") &&
      dailyPulseHtml.includes(">75</span>") &&
      dailyPulseHtml.includes(">60</span>") &&
      dailyPulseHtml.includes(">64</span>")) {
    console.log("✓ SUCCESS: Daily Pulse renders DISTINCT dimension scores (68, 62, 75, 60, 64) with NO mirroring!");
  } else {
    console.error("FAILED: Daily Pulse failed to render distinct dimension scores.");
    testPassed = false;
  }

  // Check that values are NOT all 66 (mirrored)
  const count66 = (dailyPulseHtml.match(/>66<\/span>/g) || []).length;
  if (count66 === 0) {
    console.log("✓ SUCCESS: No dimension mirroring detected!");
  } else {
    console.error("FAILED: Dimension scores are still mirroring the overall index!");
    testPassed = false;
  }

  // Test 2: Formal Clinical Assessment Data Point (PHQ-9)
  tooltipCallback({
    tooltip: {
      opacity: 1,
      caretX: 200,
      caretY: 100,
      dataPoints: [{ dataIndex: 1 }]
    }
  });

  const clinicalHtml = tooltipEl.innerHTML;
  console.log("\nFormal Clinical Assessment (PHQ-9) Tooltip HTML Output:\n", clinicalHtml);

  if (clinicalHtml.includes("Clinical Score: 12/27 — Moderate Depression") &&
      !clinicalHtml.includes("tooltip-bar-row")) {
    console.log("✓ SUCCESS: Formal Clinical Assessment HIDES 5-dimension breakdown rows and renders clinical score scale (12/27 — Moderate Depression)!");
  } else {
    console.error("FAILED: Clinical assessment tooltip did not hide dimension bars or render clinical scale properly.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("TOOLTIP DIMENSION UNMIRRORING & CLINICAL HIDE CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("TOOLTIP DIMENSION UNMIRRORING & CLINICAL HIDE CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
