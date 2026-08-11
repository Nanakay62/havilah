const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'private', 'portal', 'hr.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const virtualConsole = new jsdom.VirtualConsole();

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  virtualConsole,
  url: "http://localhost/private/portal/hr.html"
});

const window = dom.window;
const document = window.document;

// Mock session
window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3ItMTIzIiwiY29tcGFueUlkIjoidGVuLTk5OSIsImRlcGFydG1lbnRJZCI6IkRFTV8wMSIsInJvbGUiOiJocl9hZG1pbiJ9.signature');
window.localStorage.setItem('wf_user_name', 'HR Admin');

setTimeout(() => {
  console.log("=== RUNNING DYNAMIC ALERTS DB & EMPTY STATE CHECK ===");

  if (!window.App) {
    console.error("App object not found!");
    process.exit(1);
  }

  const container = document.getElementById('alertsList');
  if (!container) {
    console.error("alertsList container not found!");
    process.exit(1);
  }

  let testPassed = true;

  // 1. Test Clean Tenant (0 alerts returned)
  console.log("Testing Clean Tenant with 0 alerts...");
  window.App.state.alertsList = [];
  window.App.renderAlerts();

  const emptyStateHtml = container.innerHTML;
  console.log("Clean Tenant Output:\n", emptyStateHtml);

  if (emptyStateHtml.includes("No Active Risk Alerts") &&
      emptyStateHtml.includes("🛡️") &&
      emptyStateHtml.includes("Automated threshold alerts will trigger here")) {
    console.log("✓ SUCCESS: Clean tenant renders Privacy Shield style empty state card!");
  } else {
    console.error("FAILED: Clean tenant did not render empty state card properly.");
    testPassed = false;
  }

  if (emptyStateHtml.includes("Sales team") || emptyStateHtml.includes("Engineering • Fatigue")) {
    console.error("FAILED: Hardcoded mock items ('Sales team', 'Engineering') are still present!");
    testPassed = false;
  } else {
    console.log("✓ SUCCESS: Hardcoded mock items ('Sales team', 'Engineering') are COMPLETELY GONE!");
  }

  // 2. Test Tenant with Real Database Alerts
  console.log("\nTesting Tenant with Real DB Alerts...");
  window.App.state.alertsList = [
    {
      id: "alt-001",
      severity: "CRITICAL",
      icon: "critical",
      title: "Logistics • High Stress Threshold Exceeded",
      desc: "ISO 45003 stress index exceeded 75 limit in 7 days.",
      time: "1 hour ago"
    },
    {
      id: "alt-002",
      severity: "WARNING",
      icon: "moderate",
      title: "Finance • Fatigue Warning",
      desc: "Fatigue indicators shifted to moderate risk.",
      time: "3 hours ago"
    }
  ];
  window.App.renderAlerts();

  const realAlertsHtml = container.innerHTML;
  console.log("Real Alerts Output:\n", realAlertsHtml);

  if (realAlertsHtml.includes("Logistics • High Stress Threshold Exceeded") &&
      realAlertsHtml.includes("Finance • Fatigue Warning") &&
      realAlertsHtml.includes("Dispatch Intervention")) {
    console.log("✓ SUCCESS: Real alerts rendered dynamically with severity icons & action buttons!");
  } else {
    console.error("FAILED: Real alerts failed to render properly.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("DYNAMIC ALERTS DB & EMPTY STATE CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("DYNAMIC ALERTS DB & EMPTY STATE CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
