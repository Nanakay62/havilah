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

// Mock session for a NEWLY ONBOARDED worker (fresh user, 0 completed assessments)
window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3ItTkVXLTAwMSIsImNvbXBhbnlJZCI6InRlbi1ORVciLCJkZXBhcnRtZW50SWQiOiJFTkciLCJyb2xlIjoiZW1wbG95ZWUifQ.signature');
window.localStorage.setItem('wf_user_name', 'New Employee');

setTimeout(() => {
  console.log("=== RUNNING NEW EMPLOYEE COMPLETION STATE CHECK ===");

  if (!window.App) {
    console.error("App object not found!");
    process.exit(1);
  }

  // Set mock assessment locks where PHQ-9, GAD-7, PSS-10, FAS-10, COPSOQ III are UNLOCKED for testing
  window.App.state.assessmentLocks = {
    phq9: { status: 'unlocked', deadline: '2026-08-25T00:00:00.000Z' },
    gad7: { status: 'unlocked', deadline: '2026-08-25T00:00:00.000Z' },
    pss10: { status: 'unlocked', deadline: '2026-08-25T00:00:00.000Z' },
    fas10: { status: 'unlocked', deadline: '2026-08-25T00:00:00.000Z' },
    copsoq3: { status: 'unlocked', depth: 'core', deadline: '2026-08-25T00:00:00.000Z' }
  };

  // Simulate NEW employee state: empty userCompletedList
  window.App.state.userCompletedList = [];

  // Re-render cards
  window.App.renderSurveyCards();

  const grid = document.getElementById('surveysGrid');
  const cards = grid.querySelectorAll('.survey-card');

  console.log(`Checking ${cards.length} cards for New Employee (0 completed assessments)...`);

  let testPassed = true;

  cards.forEach(card => {
    const surveyType = card.dataset.surveyType;
    const instrumentCode = card.dataset.instrumentCode;
    const isCompleted = card.dataset.isCompleted;
    const statusText = card.querySelector('.survey-head span:last-child')?.textContent;

    if (surveyType === 'daily_pulse') return;

    console.log(`Card: [Instrument: ${instrumentCode}] [isCompleted: ${isCompleted}] [Badge Text: "${statusText}"]`);

    if (isCompleted === 'true') {
      console.error(`FAILED: ${instrumentCode} rendered as completed for a NEW employee!`);
      testPassed = false;
    } else {
      console.log(`✓ SUCCESS: ${instrumentCode} starts in INCOMPLETE state (No completed badge).`);
    }

    if (statusText && statusText.includes('Completed')) {
      console.error(`FAILED: ${instrumentCode} displayed a Completed badge!`);
      testPassed = false;
    }
  });

  console.log("\nSimulating user completing PHQ-9...");
  window.App.state.userCompletedList = ['PHQ-9'];
  window.App.renderSurveyCards();

  const phqCard = grid.querySelector('[data-instrument-code="PHQ-9"]');
  const phqStatus = phqCard.querySelector('.survey-head span:last-child')?.textContent;
  const phqIsCompleted = phqCard.dataset.isCompleted;

  console.log(`PHQ-9 After Completion: [isCompleted: ${phqIsCompleted}] [Badge Text: "${phqStatus}"]`);

  if (phqIsCompleted === 'true' && phqStatus && phqStatus.includes('Completed')) {
    console.log("✓ SUCCESS: PHQ-9 correctly rendered as Completed after submission!");
  } else {
    console.error("FAILED: PHQ-9 failed to render Completed state after submission.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("NEW EMPLOYEE COMPLETION STATE CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("NEW EMPLOYEE COMPLETION STATE CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
