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
  console.log("=== RUNNING TREND TOOLTIP SCORE RENDERING CHECK ===");

  if (!window.App) {
    console.error("App object not found!");
    process.exit(1);
  }

  // 1. Mock trend data with explicit dimensions and unsegmented fallback points
  window.App.state.employeeHistoryPayload = [
    {
      date: "2026-08-08",
      score: 64,
      overallIndex: 64,
      source: "checkin_slider",
      dimensions: { mood: 65, calm: 60, stress: 70, energy: 62, workFit: 63, work_fit: 63 }
    },
    {
      date: "2026-08-09",
      score: 78,
      overallIndex: 78,
      source: "phq9",
      dimensions: { mood: 80, calm: 75, stress: 78, energy: 76, workFit: 81, work_fit: 81 }
    },
    {
      date: "2026-08-10",
      score: 55,
      overallIndex: 55,
      source: "checkin_slider",
      dimensions: {} // unsegmented fallback test
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
  
  let testPassed = true;

  // Test Data Point 1 (2026-08-08): Mood 65, Calm 60, Stress 70, Energy 62, Work-Fit 63
  tooltipCallback({
    tooltip: {
      opacity: 1,
      caretX: 100,
      caretY: 100,
      dataPoints: [{ dataIndex: 0 }]
    }
  });

  const htmlDataPoint1 = tooltipEl.innerHTML;
  console.log("Point 1 Tooltip HTML Output:\n", htmlDataPoint1);

  if (htmlDataPoint1.includes("Overall Index: 64") &&
      htmlDataPoint1.includes(">65</span>") &&
      htmlDataPoint1.includes(">60</span>") &&
      htmlDataPoint1.includes(">70</span>") &&
      htmlDataPoint1.includes(">62</span>") &&
      htmlDataPoint1.includes(">63</span>")) {
    console.log("✓ SUCCESS: Point 1 exact non-zero dimension scores (65, 60, 70, 62, 63) rendered correctly!");
  } else {
    console.error("FAILED: Point 1 tooltip failed to render exact dimension scores.");
    testPassed = false;
  }

  // Test Data Point 3 (2026-08-10): Unsegmented dimensions fallback to Overall Index 55
  tooltipCallback({
    tooltip: {
      opacity: 1,
      caretX: 200,
      caretY: 100,
      dataPoints: [{ dataIndex: 2 }]
    }
  });

  const htmlDataPoint3 = tooltipEl.innerHTML;
  console.log("\nPoint 3 Unsegmented Tooltip HTML Output:\n", htmlDataPoint3);

  if (htmlDataPoint3.includes("Overall Index: 55") &&
      htmlDataPoint3.includes(">55</span>") &&
      !htmlDataPoint3.includes(">0</span>")) {
    console.log("✓ SUCCESS: Point 3 unsegmented dimensions fell back to Overall Index 55 (NO zeroes)!");
  } else {
    console.error("FAILED: Point 3 tooltip rendered 0 strings for unsegmented data.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("TREND TOOLTIP SCORE RENDERING CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("TREND TOOLTIP SCORE RENDERING CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
