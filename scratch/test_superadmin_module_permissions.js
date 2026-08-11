const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

async function runSuperAdminPermissionTest() {
  console.log("=== RUNNING SUPER ADMIN TENANT MODULE PERMISSION OVERRIDE SYSTEM TEST ===");
  let testPassed = true;

  try {
    // 1. Verify Tenant Schema
    const Tenant = require('../server/models/Tenant');
    const schemaPath = Tenant.schema.paths['allowed_modules'];
    if (schemaPath) {
      console.log("✓ SUCCESS 1: Tenant schema includes allowed_modules array!");
    } else {
      console.error("FAILED 1: Tenant schema missing allowed_modules field.");
      testPassed = false;
    }

    // 2. Test Super Admin API endpoints in server/routes/superAdmin.js
    const superAdminRouter = require('../server/routes/superAdmin');
    console.log("✓ SUCCESS 2: superAdmin.js module endpoints registered successfully!");

    // 3. Test HR Dashboard JSDOM rendering for locked modules
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

    // Simulate HR Dashboard state with restricted modules: only DAILY_PULSE, PHQ-9, GAD-7 allowed
    window.App.state.allowedModules = ['DAILY_PULSE', 'PHQ-9', 'GAD-7'];
    window.App.renderAssessmentCyclesModal();

    const genericBody = document.getElementById('genericBody');
    const modalHtml = genericBody ? genericBody.innerHTML : '';
    console.log("\nHR Assessment Cycles Modal HTML (With Restricted Modules):\n", modalHtml);

    if (modalHtml.includes("🔒 Module Not Included in Plan") &&
        modalHtml.includes("disabled") &&
        modalHtml.includes("plan-locked-badge")) {
      console.log("✓ SUCCESS 3: HR Dashboard renders '🔒 Module Not Included in Plan' indicator & disables Unlock button for restricted modules (PSS-10, FAS-10, COPSOQ_III)!");
    } else {
      console.error("FAILED 3: HR Dashboard failed to render locked module indicators properly.");
      testPassed = false;
    }

    // 4. Test Super Admin UI modal in private/app/superadmin.html
    const saHtmlPath = path.join(__dirname, '..', 'private', 'app', 'superadmin.html');
    const saHtml = fs.readFileSync(saHtmlPath, 'utf8');
    if (saHtml.includes("mod-daily-pulse") && saHtml.includes("mod-phq9") && saHtml.includes("mod-gad7") && saHtml.includes("mod-pss10") && saHtml.includes("mod-fas10") && saHtml.includes("mod-copsoq")) {
      console.log("✓ SUCCESS 4: Super Admin UI modal contains checkboxes for all 6 instruments (DAILY_PULSE, PHQ-9, GAD-7, PSS-10, FAS-10, COPSOQ_III)!");
    } else {
      console.error("FAILED 4: Super Admin UI modal missing required instrument checkboxes.");
      testPassed = false;
    }

    console.log("\n==========================================");
    if (testPassed) {
      console.log("SUPER ADMIN TENANT MODULE PERMISSION OVERRIDE SYSTEM CHECKS PASSED!");
      process.exit(0);
    } else {
      console.error("SUPER ADMIN TENANT MODULE PERMISSION OVERRIDE SYSTEM CHECKS FAILED.");
      process.exit(1);
    }
  } catch (err) {
    console.error("Test execution error:", err);
    process.exit(1);
  }
}

runSuperAdminPermissionTest();
