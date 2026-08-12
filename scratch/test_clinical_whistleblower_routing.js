const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log("=== RUNNING CLINICAL HELP & WHISTLEBLOWER ROUTING AUDIT ===");
let testPassed = true;

const dashboardPath = path.join(rootDir, 'private', 'app', 'dashboard.html');
const serverJsPath = path.join(rootDir, 'server', 'server.js');
const referralControllerPath = path.join(rootDir, 'server', 'controllers', 'referralController.js');
const whistleblowerRoutesPath = path.join(rootDir, 'server', 'routes', 'whistleblowerRoutes.js');
const emailServicePath = path.join(rootDir, 'server', 'utils', 'emailService.js');
const envPath = path.join(rootDir, 'server', '.env');

const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');
const serverJs = fs.readFileSync(serverJsPath, 'utf8');
const referralController = fs.readFileSync(referralControllerPath, 'utf8');
const whistleblowerRoutes = fs.readFileSync(whistleblowerRoutesPath, 'utf8');
const emailService = fs.readFileSync(emailServicePath, 'utf8');
const envFile = fs.readFileSync(envPath, 'utf8');

// Check 1: Helpline number & email display in private/app/dashboard.html
if (
  dashboardHtml.includes('+233 24 362 9870') &&
  dashboardHtml.includes('href="tel:+233243629870"') &&
  dashboardHtml.includes('clarke.edith@gmail.com')
) {
  console.log("✓ SUCCESS: private/app/dashboard.html helpline updated to +233 24 362 9870, href tel:+233243629870, and email clarke.edith@gmail.com!");
} else {
  console.error("FAILED: private/app/dashboard.html helpline displays or tel links missing.");
  testPassed = false;
}

// Check 2: Server API endpoint clinical provider defaults
if (
  serverJs.includes('+233 24 362 9870') &&
  serverJs.includes('clarke.edith@gmail.com')
) {
  console.log("✓ SUCCESS: server/server.js GET /api/v1/clinical-provider returns +233 24 362 9870 & clarke.edith@gmail.com!");
} else {
  console.error("FAILED: server/server.js clinical-provider defaults incomplete.");
  testPassed = false;
}

// Check 3: Clinical Intake (Submit Request) email routing
if (
  referralController.includes('nanakwamedickson62@gmail.com') ||
  referralController.includes('CLINICAL_INTAKE_EMAIL')
) {
  console.log("✓ SUCCESS: Submit Request (Clinical Intake) configured to route Nodemailer dispatches to nanakwamedickson62@gmail.com!");
} else {
  console.error("FAILED: referralController.js clinical intake recipient configuration missing.");
  testPassed = false;
}

// Check 4: Whistleblower Vault email routing
if (
  whistleblowerRoutes.includes('nanakwamedickson553@gmail.com') ||
  whistleblowerRoutes.includes('WHISTLEBLOWER_NOTIFICATION_EMAIL')
) {
  console.log("✓ SUCCESS: Report Workplace Hazard (Whistleblower Vault) configured to route Nodemailer alerts to nanakwamedickson553@gmail.com!");
} else {
  console.error("FAILED: whistleblowerRoutes.js whistleblower recipient configuration missing.");
  testPassed = false;
}

// Check 5: Environment Variables
if (
  envFile.includes('DEFAULT_CLINICAL_HOTLINE=+233 24 362 9870') &&
  envFile.includes('DEFAULT_CLINICAL_PARTNER_EMAIL=clarke.edith@gmail.com') &&
  envFile.includes('CLINICAL_INTAKE_EMAIL=nanakwamedickson62@gmail.com') &&
  envFile.includes('WHISTLEBLOWER_NOTIFICATION_EMAIL=nanakwamedickson553@gmail.com')
) {
  console.log("✓ SUCCESS: server/.env populated with clinical contact and email routing keys!");
} else {
  console.error("FAILED: server/.env configuration missing required keys.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("CLINICAL HELP & WHISTLEBLOWER ROUTING AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("CLINICAL HELP & WHISTLEBLOWER ROUTING AUDIT FAILED.");
  process.exit(1);
}
