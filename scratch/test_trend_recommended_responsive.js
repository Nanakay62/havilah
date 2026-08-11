const fs = require('fs');
const path = require('path');

const dashboardHtmlPath = path.join(__dirname, '..', 'private', 'app', 'dashboard.html');

console.log("=== RUNNING TREND & RECOMMENDED MOBILE RESPONSIVENESS AUDIT ===");
let testPassed = true;

if (!fs.existsSync(dashboardHtmlPath)) {
  console.error("dashboard.html not found!");
  process.exit(1);
}

const htmlContent = fs.readFileSync(dashboardHtmlPath, 'utf8');

// Check 1: 1-column layout for .insights-row on mobile screens (<= 768px)
if (htmlContent.includes('.insights-row { grid-template-columns: 1fr !important;') ||
    htmlContent.includes('.insights-row { grid-template-columns: 1fr;')) {
  console.log("✓ SUCCESS 1: .insights-row stacks into a single column on mobile viewports!");
} else {
  console.error("FAILED 1: .insights-row does not switch to 1 column on mobile.");
  testPassed = false;
}

// Check 2: Responsive padding & box-sizing for .insight-card
if (htmlContent.includes('.insight-card { padding: 16px 14px !important; width: 100% !important; max-width: 100% !important;')) {
  console.log("✓ SUCCESS 2: .insight-card uses responsive padding & 100% max-width!");
} else {
  console.error("FAILED 2: .insight-card missing responsive mobile padding.");
  testPassed = false;
}

// Check 3: Trend Controls column stacking & touch-scroll tabs
if (htmlContent.includes('.trend-controls { flex-direction: column !important;') &&
    htmlContent.includes('overflow-x: auto !important;') &&
    htmlContent.includes('flex-wrap: nowrap !important;')) {
  console.log("✓ SUCCESS 3: .trend-controls stacks vertically and .trend-framework-tabs enables touch-scroll!");
} else {
  console.error("FAILED 3: .trend-controls or tabs missing mobile touch-scroll rules.");
  testPassed = false;
}

// Check 4: Canvas and trend-chart width constraints
if (htmlContent.includes('.trend-chart { position: relative; width: 100%; max-width: 100%;') &&
    htmlContent.includes('.trend-chart canvas { width: 100% !important; max-width: 100% !important;')) {
  console.log("✓ SUCCESS 4: .trend-chart and canvas constrained to 100% max-width!");
} else {
  console.error("FAILED 4: .trend-chart or canvas missing width constraints.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("TREND & RECOMMENDED MOBILE RESPONSIVENESS AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("TREND & RECOMMENDED MOBILE RESPONSIVENESS AUDIT FAILED.");
  process.exit(1);
}
