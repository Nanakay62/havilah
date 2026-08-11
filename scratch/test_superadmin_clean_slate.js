const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'private', 'app', 'superadmin.html');
const jsPath = path.join(__dirname, '..', 'public', 'js', 'superadmin.js');
const routePath = path.join(__dirname, '..', 'server', 'routes', 'superAdmin.js');

console.log("=== RUNNING SUPER ADMIN MOCK DATA PURGE & CLEAN SLATE AUDIT ===");
let testPassed = true;

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');
const route = fs.readFileSync(routePath, 'utf8');

// Check 1: Hardcoded mock numbers purged from HTML template
const hardcodedItems = [
  '48 Magic Links Sent Today',
  '+1,240 allocated',
  '74.2%',
  '<div class="stat-card-value">4.2</div>',
  '<div class="stat-card-value">3.8</div>',
  '<div class="stat-card-value">12.5</div>',
  '<div class="stat-card-value">18.1</div>',
  '<div class="stat-card-value">62.4</div>'
];

hardcodedItems.forEach(item => {
  if (html.includes(item)) {
    console.error(`FAILED: Hardcoded mock string "${item}" still present in superadmin.html!`);
    testPassed = false;
  } else {
    console.log(`✓ SUCCESS: Purged hardcoded item "${item}" from superadmin.html!`);
  }
});

// Check 2: Element IDs present for all metrics
const requiredIds = [
  'statTotalTenants',
  'statTenantsTrend',
  'statTotalUsers',
  'statUsersTrend',
  'statEngagementRate',
  'statEngagementTrend',
  'benchPhq9Value',
  'benchPhq9Trend',
  'benchGad7Value',
  'benchGad7Trend',
  'benchPss10Value',
  'benchPss10Trend',
  'benchFas10Value',
  'benchFas10Trend',
  'benchCopsoqValue',
  'benchCopsoqTrend',
  'telemEmailSub',
  'telemAnonSub',
  'statSuppressedCount'
];

requiredIds.forEach(id => {
  if (html.includes(`id="${id}"`)) {
    console.log(`✓ SUCCESS: Element ID "${id}" present in superadmin.html!`);
  } else {
    console.error(`FAILED: Missing element ID "${id}" in superadmin.html.`);
    testPassed = false;
  }
});

// Check 3: Backend route calculates real metrics & handles zero-data state
if (route.includes('Assessment.aggregate') && route.includes('totalAllocatedSeats') && route.includes('engagementRate')) {
  console.log("✓ SUCCESS: GET /api/v1/superadmin/stats calculates real engagement, benchmarks, and seat allocations!");
} else {
  console.error("FAILED: superAdmin.js route missing dynamic benchmark/engagement aggregation.");
  testPassed = false;
}

// Check 4: JS populates all metrics dynamically
if (js.includes('updateBench(\'benchPhq9Value\'') && js.includes('telemEmailSub')) {
  console.log("✓ SUCCESS: superadmin.js dynamically updates benchmark cards and telemetry on dashboard mount!");
} else {
  console.error("FAILED: superadmin.js missing dynamic card update handlers.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("SUPER ADMIN MOCK DATA PURGE & CLEAN SLATE AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("SUPER ADMIN MOCK DATA PURGE & CLEAN SLATE AUDIT FAILED.");
  process.exit(1);
}
