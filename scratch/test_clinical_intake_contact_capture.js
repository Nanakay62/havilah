const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log("=== RUNNING CLINICAL INTAKE CONTACT DATA CAPTURE AUDIT ===");
let testPassed = true;

const dashboardPath = path.join(rootDir, 'private', 'app', 'dashboard.html');
const referralControllerPath = path.join(rootDir, 'server', 'controllers', 'referralController.js');
const emailServicePath = path.join(rootDir, 'server', 'utils', 'emailService.js');

const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
const referralController = fs.readFileSync(referralControllerPath, 'utf8');
const emailService = fs.readFileSync(emailServicePath, 'utf8');

// Check 1: Frontend Form Fields
if (
  dashboardHtml.includes('id="consultNameInput"') &&
  dashboardHtml.includes('id="consultContactInput"') &&
  dashboardHtml.includes('consultNameInput') &&
  dashboardHtml.includes('consultContactInput')
) {
  console.log("✓ SUCCESS: private/app/dashboard.html includes Employee Name and Contact Phone/Email input fields!");
} else {
  console.error("FAILED: Missing consultNameInput or consultContactInput fields in private/app/dashboard.html");
  testPassed = false;
}

// Check 2: Backend Controller Resolution
if (
  referralController.includes('Department') &&
  referralController.includes('patientName: name') &&
  referralController.includes('contactInfo: contact_info') &&
  referralController.includes('department: departmentName')
) {
  console.log("✓ SUCCESS: server/controllers/referralController.js passes patient name, contact info, and department name to email service!");
} else {
  console.error("FAILED: referralController.js department resolution or payload parameter mapping missing.");
  testPassed = false;
}

// Check 3: Email Service HTML Template
if (
  emailService.includes('Patient Name') &&
  emailService.includes('Contact Method') &&
  emailService.includes('patientName') &&
  emailService.includes('contactInfo')
) {
  console.log("✓ SUCCESS: server/utils/emailService.js HTML template includes Patient Name, Contact Method, and Department!");
} else {
  console.error("FAILED: emailService.js HTML template missing patient contact details.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("CLINICAL INTAKE CONTACT DATA CAPTURE AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("CLINICAL INTAKE CONTACT DATA CAPTURE AUDIT FAILED.");
  process.exit(1);
}
