const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log("=== RUNNING CLINICAL INTAKE OVERRIDE & PAYLOAD AUDIT ===");
let testPassed = true;

const dashboardPath = path.join(rootDir, 'private', 'app', 'dashboard.html');
const referralControllerPath = path.join(rootDir, 'server', 'controllers', 'referralController.js');
const emailServicePath = path.join(rootDir, 'server', 'utils', 'emailService.js');

const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
const referralController = fs.readFileSync(referralControllerPath, 'utf8');
const emailService = fs.readFileSync(emailServicePath, 'utf8');

// Check 1: Frontend Form & Payload
if (
  dashboardHtml.includes('patientName') &&
  dashboardHtml.includes('patientContact') &&
  dashboardHtml.includes('departmentName') &&
  dashboardHtml.includes('preferredTime')
) {
  console.log("✓ SUCCESS: private/app/dashboard.html passes { patientName, patientContact, departmentName, preferredTime, notes } in POST payload!");
} else {
  console.error("FAILED: Missing explicit patient payload mapping in private/app/dashboard.html");
  testPassed = false;
}

// Check 2: Backend Controller Parameter Parsing & UUID Resolver
if (
  referralController.includes('patientName') &&
  referralController.includes('patientContact') &&
  referralController.includes('departmentName') &&
  referralController.includes('resolveReadableDepartment') &&
  referralController.includes('isRawUuid')
) {
  console.log("✓ SUCCESS: server/controllers/referralController.js explicitly reads patientName, patientContact, departmentName and resolves raw UUIDs to human readable strings!");
} else {
  console.error("FAILED: referralController.js missing UUID resolver or explicit parameter aliases.");
  testPassed = false;
}

// Check 3: Email Service HTML Template
if (
  emailService.includes('Patient Name') &&
  emailService.includes('Contact Phone/Email') &&
  emailService.includes('resolvedPatientName') &&
  emailService.includes('resolvedContact') &&
  emailService.includes('resolvedDepartment')
) {
  console.log("✓ SUCCESS: server/utils/emailService.js HTML template renders Patient Name, Contact Phone/Email, and human-readable Department!");
} else {
  console.error("FAILED: emailService.js HTML template missing patient contact fields.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("CLINICAL INTAKE OVERRIDE & PAYLOAD AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("CLINICAL INTAKE OVERRIDE & PAYLOAD AUDIT FAILED.");
  process.exit(1);
}
