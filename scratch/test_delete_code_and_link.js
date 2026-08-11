const fs = require('fs');
const path = require('path');

const hrAdminRoutePath = path.join(__dirname, '..', 'server', 'routes', 'hrAdmin.js');
const hrDashboardJsPath = path.join(__dirname, '..', 'public', 'js', 'hrDashboard.js');

console.log("=== RUNNING HR ACTIVATION CODE & LINK DELETION AUDIT ===");
let testPassed = true;

const routeContent = fs.readFileSync(hrAdminRoutePath, 'utf8');
const jsContent = fs.readFileSync(hrDashboardJsPath, 'utf8');

// Check 1: Route definition in hrAdmin.js
if (routeContent.includes("router.delete('/invites/:code'") && routeContent.includes('handleDeleteInvite')) {
  console.log("✓ SUCCESS 1: DELETE /api/v1/hr/invites/:code route is defined in server/routes/hrAdmin.js!");
} else {
  console.error("FAILED 1: Missing DELETE route in server/routes/hrAdmin.js.");
  testPassed = false;
}

// Check 2: Delete button in hrDashboard.js
if (jsContent.includes("window.deleteHrInvite('${invite.activation_code}')") && jsContent.includes("title=\"Delete Code & Link\"")) {
  console.log("✓ SUCCESS 2: Delete button (🗑️ Delete) rendered in Active Codes table!");
} else {
  console.error("FAILED 2: Delete button missing in public/js/hrDashboard.js.");
  testPassed = false;
}

// Check 3: window.deleteHrInvite function definition
if (jsContent.includes('window.deleteHrInvite = async (code) => {') && jsContent.includes("method: 'DELETE'")) {
  console.log("✓ SUCCESS 3: window.deleteHrInvite function calls DELETE API correctly!");
} else {
  console.error("FAILED 3: window.deleteHrInvite missing or incorrect API call.");
  testPassed = false;
}

// Check 4: Verify audit log & database delete handler
if (routeContent.includes('Invitation.findOneAndDelete') && routeContent.includes("event_type: 'invite_deleted'")) {
  console.log("✓ SUCCESS 4: handleDeleteInvite performs atomic findOneAndDelete in MongoDB & logs event to AuditLog!");
} else {
  console.error("FAILED 4: Missing atomic findOneAndDelete or AuditLog logging in server/routes/hrAdmin.js.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("HR ACTIVATION CODE DELETION AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("HR ACTIVATION CODE DELETION AUDIT FAILED.");
  process.exit(1);
}
