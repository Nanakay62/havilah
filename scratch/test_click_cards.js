const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '..', 'private', 'app', 'dashboard.html');
const html = fs.readFileSync(htmlPath, 'utf8');

const virtualConsole = new jsdom.VirtualConsole();

const dom = new JSDOM(html, {
  runScripts: "dangerously",
  virtualConsole,
  url: "http://localhost/private/app/dashboard.html"
});

const window = dom.window;
const document = window.document;

// Mock localStorage
window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3ItMTIzIiwiY29tcGFueUlkIjoidGVuLTk5OSIsImRlcGFydG1lbnRJZCI6IkRFTV8wMSIsInJvbGUiOiJlbXBsb3llZSJ9.signature');
window.localStorage.setItem('wf_user_name', 'Test Worker');

// Wait for DOM content to load and App to be ready
setTimeout(() => {
  console.log("=== RUNNING CLICK CHECK ACROSS CARDS ===");

  if (!window.App) {
    console.error("App object not found!");
    process.exit(1);
  }

  // Set mock assessment locks: PHQ-9 unlocked, GAD-7 locked, COPSOQ III core unlocked
  window.App.state.assessmentLocks = {
    phq9: { status: 'unlocked' },
    gad7: { status: 'locked' },
    pss10: { status: 'locked' },
    fas10: { status: 'locked' },
    copsoq3: { status: 'unlocked', depth: 'core' }
  };

  // Re-render survey cards
  window.App.renderSurveyCards();

  const grid = document.getElementById('surveysGrid');
  if (!grid) {
    console.error("surveysGrid element not found!");
    process.exit(1);
  }

  const cards = grid.querySelectorAll('.survey-card');
  console.log(`Total survey cards rendered: ${cards.length}`);

  let testPassed = true;

  cards.forEach((card) => {
    const surveyType = card.dataset.surveyType;
    const instrumentCode = card.dataset.instrumentCode;
    const isUnlocked = card.dataset.isUnlocked;

    console.log(`\nChecking card: [Type: ${surveyType}] [Instrument: ${instrumentCode}] [Unlocked: ${isUnlocked}]`);

    if (isUnlocked === 'true') {
      // Test clicking UNLOCKED card
      const actionBtn = card.querySelector('.take-checkin-btn');
      if (!actionBtn) {
        console.error(`FAILED: Action button missing on unlocked card ${instrumentCode}`);
        testPassed = false;
      } else {
        console.log(`✓ Action button 'Take Check-in' found on unlocked card ${instrumentCode}`);
      }

      // Simulate click on card / button
      card.click();

      if (instrumentCode === 'DAILY_PULSE') {
        const modal = document.getElementById('dailyPulseModalBackdrop');
        const modalTenant = modal?.getAttribute('data-tenant-id');
        const modalDept = modal?.getAttribute('data-department-code');
        const modalInst = modal?.getAttribute('data-instrument-code');

        if (modal && modal.style.display === 'flex' && modalInst === 'DAILY_PULSE') {
          console.log(`✓ SUCCESS: Daily Pulse modal opened! [Tenant: ${modalTenant}, Dept: ${modalDept}, Instrument: ${modalInst}]`);
          window.closeDailyPulseModal();
        } else {
          console.error(`FAILED: Daily Pulse modal failed to open properly.`);
          testPassed = false;
        }
      } else {
        const backdrop = document.getElementById('surveyBackdrop');
        const modalCode = document.getElementById('modalCode')?.innerText;
        const backdropTenant = backdrop?.getAttribute('data-tenant-id');
        const backdropDept = backdrop?.getAttribute('data-department-code');
        const backdropInst = backdrop?.getAttribute('data-instrument-code');

        if (backdrop && backdrop.classList.contains('show') && modalCode === instrumentCode) {
          console.log(`✓ SUCCESS: ${instrumentCode} assessment modal opened! [Tenant: ${backdropTenant}, Dept: ${backdropDept}, Instrument: ${backdropInst}]`);
          window.App.closeSurvey();
        } else {
          console.error(`FAILED: Assessment modal for ${instrumentCode} failed to open.`);
          testPassed = false;
        }
      }

    } else {
      // Test locked card
      console.log(`Verifying locked card ${instrumentCode} (${surveyType}) pointer-events & click prevention...`);
      if (card.style.pointerEvents !== 'none' && !card.classList.contains('locked')) {
        console.error(`FAILED: Locked card ${instrumentCode} does not have pointer-events: none`);
        testPassed = false;
      } else {
        console.log(`✓ Locked card ${instrumentCode} correctly configured with pointer-events: none`);
      }

      // Simulate click on locked card while saving orig method
      let clicked = false;
      const origOpenSurvey = window.App.openSurvey;
      window.App.openSurvey = function() { clicked = true; };
      card.click();
      window.App.openSurvey = origOpenSurvey;

      if (clicked) {
        console.error(`FAILED: Locked card ${instrumentCode} fired a click event!`);
        testPassed = false;
      } else {
        console.log(`✓ SUCCESS: Locked card ${instrumentCode} did NOT fire any click event.`);
      }
    }
  });

  // Test openSurveyFromBanner
  console.log("\nTesting window.openSurveyFromBanner('PHQ-9')...");
  window.openSurveyFromBanner('PHQ-9');
  const backdrop = document.getElementById('surveyBackdrop');
  const modalCode = document.getElementById('modalCode')?.innerText;
  if (backdrop && backdrop.classList.contains('show') && modalCode === 'PHQ-9') {
    console.log("✓ SUCCESS: Banner click successfully opened PHQ-9 assessment modal!");
    window.App.closeSurvey();
  } else {
    console.error("FAILED: openSurveyFromBanner('PHQ-9') failed.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("ALL CLICK CHECKS PASSED SUCCESSFULLY!");
    process.exit(0);
  } else {
    console.error("SOME CLICK CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
