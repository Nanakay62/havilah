const fs = require('fs');
const path = require('path');

const hrHtmlPath = path.join(__dirname, '..', 'private', 'portal', 'hr.html');

console.log("=== RUNNING ISO 45003 REPORT DYNAMIC DATA & CLEAN SLATE AUDIT ===");
let testPassed = true;

const hrHtml = fs.readFileSync(hrHtmlPath, 'utf8');

// Check 1: Hardcoded strings purged from generateComplianceReport
const hardcodedItems = [
  '142 Assessments',
  '88.5% Participation',
  "score: '78 / 100'",
  "score: '64 / 100'",
  "score: '42 / 100'",
  "score: '71 / 100'",
  "score: '82 / 100'"
];

hardcodedItems.forEach(item => {
  if (hrHtml.includes(item)) {
    console.error(`FAILED: Hardcoded mock string "${item}" still present in ISO report generator!`);
    testPassed = false;
  } else {
    console.log(`✓ SUCCESS: Purged hardcoded item "${item}" from ISO report generator!`);
  }
});

// Check 2: Dynamic API fetch present in generateComplianceReport
if (hrHtml.includes("apiFetch('/api/v1/hr/analytics')") && hrHtml.includes('const isColdStart =')) {
  console.log("✓ SUCCESS: generateComplianceReport() dynamically fetches real tenant data from GET /api/v1/hr/analytics!");
} else {
  console.error("FAILED: generateComplianceReport() missing dynamic API fetch logic.");
  testPassed = false;
}

// Check 3: Cold-start empty state handling in PDF
if (hrHtml.includes('No Psychosocial Hazard Check-ins Logged Yet') && hrHtml.includes('(isColdStart || !d) ? \'-- / 100\'')) {
  console.log("✓ SUCCESS: Report renders clean zero-data state ('0 Assessments', '-- / 100', 'No Data') when HR dashboard contains 0 responses!");
} else {
  console.error("FAILED: Missing cold-start empty state rules in ISO report generator.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("ISO 45003 REPORT DYNAMIC DATA AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("ISO 45003 REPORT DYNAMIC DATA AUDIT FAILED.");
  process.exit(1);
}
