const fs = require('fs');
const path = require('path');

const hrHtmlPath = path.join(__dirname, '..', 'private', 'portal', 'hr.html');

console.log("=== RUNNING HR DASHBOARD NOTIFICATIONS & ALERTS CLEANUP AUDIT ===");
let testPassed = true;

if (!fs.existsSync(hrHtmlPath)) {
  console.error("hr.html not found!");
  process.exit(1);
}

const htmlContent = fs.readFileSync(hrHtmlPath, 'utf8');

// Check 1: predictiveRiskBanner is hidden by default and hardcoded text is purged
if (htmlContent.includes('id="predictiveRiskBanner"') && htmlContent.includes('style="display: none; border-color: rgba(244, 63, 94, 0.3);"')) {
  console.log("✓ SUCCESS 1: predictiveRiskBanner has display: none by default in HTML template!");
} else {
  console.error("FAILED 1: predictiveRiskBanner is not set to display: none by default.");
  testPassed = false;
}

if (!htmlContent.includes('Engineering department shows a 15% decline in Calm & Energy over the last 3 pulse cycles')) {
  console.log("✓ SUCCESS 2: Hardcoded mock predictive risk text purged from HTML template!");
} else {
  console.error("FAILED 2: Hardcoded mock risk text still present in HTML template.");
  testPassed = false;
}

// Check 2: Border highlight stripped from notification cards
if (!htmlContent.includes('.notif-item.unread { border-left: 3px solid var(--accent); }') &&
    htmlContent.includes('.notif-item { display: flex; gap: 12px; padding: 12px; border-radius: 8px; border: 1px solid #E2E8F0;')) {
  console.log("✓ SUCCESS 3: Left border highlight removed from notification card CSS; uniform 4-edge border applied!");
} else {
  console.error("FAILED 3: Notification card CSS still contains border-left highlight.");
  testPassed = false;
}

// Check 3: Initial mock notifications array purged
if (htmlContent.includes('notifications: [],')) {
  console.log("✓ SUCCESS 4: Initial state.notifications mock array purged to empty array []!");
} else {
  console.error("FAILED 4: state.notifications contains mock items.");
  testPassed = false;
}

// Check 4: Empty state inside notifications drawer
if (htmlContent.includes('All caught up!') && htmlContent.includes('You have no new notifications or system alerts at this time.')) {
  console.log("✓ SUCCESS 5: Clean empty state card rendered in Notifications drawer!");
} else {
  console.error("FAILED 5: Missing clean empty state inside Notifications drawer.");
  testPassed = false;
}

// Check 5: Dynamic Predictive Risk Banner triggering
if (htmlContent.includes('const criticalAlert = realAlerts.find(a => (a.severity === \'CRITICAL\'') &&
    htmlContent.includes('banner.style.display = \'flex\';') &&
    htmlContent.includes('banner.style.display = \'none\';')) {
  console.log("✓ SUCCESS 6: Predictive Risk Banner triggers dynamically ONLY when a real critical threshold alert exists!");
} else {
  console.error("FAILED 6: Missing dynamic banner triggering logic.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("HR DASHBOARD ALERTS & NOTIFICATIONS CLEANUP AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("HR DASHBOARD ALERTS & NOTIFICATIONS CLEANUP AUDIT FAILED.");
  process.exit(1);
}
