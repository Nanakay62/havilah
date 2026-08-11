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

// Mock EventSource in virtual window
window.EventSource = class MockEventSource {
  constructor(url) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
  }
  close() {}
};

// Mock user session
window.localStorage.setItem('token', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJ1c3ItMTIzIiwiY29tcGFueUlkIjoidGVuLTk5OSIsImRlcGFydG1lbnRJZCI6IkRFTV8wMSIsInJvbGUiOiJlbXBsb3llZSJ9.signature');
window.localStorage.setItem('wf_user_name', 'Realtime Worker');

setTimeout(() => {
  console.log("=== RUNNING REAL-TIME SSE AVAILABILITY PIPELINE CHECK ===");

  if (!window.App || !window.updateAssessmentCardStates) {
    console.error("FAILED: updateAssessmentCardStates function not found on window!");
    process.exit(1);
  }

  // 1. Initial state: Only DAILY_PULSE unlocked, all formal assessments locked
  window.App.state.assessmentLocks = {
    phq9: { status: 'locked' },
    gad7: { status: 'locked' },
    pss10: { status: 'locked' },
    fas10: { status: 'locked' },
    copsoq3: { status: 'locked' }
  };
  window.App.renderSurveyCards();

  const grid = document.getElementById('surveysGrid');
  let phqCard = grid.querySelector('[data-instrument-code="PHQ-9"]');
  console.log(`Initial PHQ-9 Card State: [Unlocked: ${phqCard.dataset.isUnlocked}]`);

  if (phqCard.dataset.isUnlocked !== 'false') {
    console.error("FAILED: Initial PHQ-9 card is not locked.");
    process.exit(1);
  }
  console.log("✓ Initial baseline: PHQ-9 is locked.");

  // 2. Simulate SSE message payload received from backend: HR Admin unlocked PHQ-9 and GAD-7
  console.log("\nSimulating SSE 'availability_update' event from HR Admin (Unlocking PHQ-9 and GAD-7)...");
  const sseUnlockedList = ['DAILY_PULSE', 'PHQ-9', 'GAD-7'];
  const sseStatusMap = {
    phq9: { status: 'unlocked', deadline: '2026-08-25T00:00:00.000Z' },
    gad7: { status: 'unlocked', deadline: '2026-08-25T00:00:00.000Z' }
  };

  window.updateAssessmentCardStates(sseUnlockedList, sseStatusMap);

  phqCard = grid.querySelector('[data-instrument-code="PHQ-9"]');
  let gadCard = grid.querySelector('[data-instrument-code="GAD-7"]');
  let pssCard = grid.querySelector('[data-instrument-code="PSS-10"]');

  console.log(`Updated PHQ-9 State: [Unlocked: ${phqCard.dataset.isUnlocked}]`);
  console.log(`Updated GAD-7 State: [Unlocked: ${gadCard.dataset.isUnlocked}]`);
  console.log(`Updated PSS-10 State: [Unlocked: ${pssCard.dataset.isUnlocked}]`);

  let testPassed = true;

  if (phqCard.dataset.isUnlocked === 'true' && gadCard.dataset.isUnlocked === 'true' && pssCard.dataset.isUnlocked === 'false') {
    console.log("✓ SUCCESS: Card states updated in real-time without page refresh!");
  } else {
    console.error("FAILED: Card states failed to update correctly after SSE broadcast.");
    testPassed = false;
  }

  // 3. Simulate SSE message payload received: HR Admin locked GAD-7
  console.log("\nSimulating SSE 'availability_update' event (HR Admin locking GAD-7)...");
  window.updateAssessmentCardStates(['DAILY_PULSE', 'PHQ-9']);

  gadCard = grid.querySelector('[data-instrument-code="GAD-7"]');
  console.log(`After Lock GAD-7 State: [Unlocked: ${gadCard.dataset.isUnlocked}]`);

  if (gadCard.dataset.isUnlocked === 'false') {
    console.log("✓ SUCCESS: GAD-7 card locked instantly in real-time!");
  } else {
    console.error("FAILED: GAD-7 card failed to lock upon SSE update.");
    testPassed = false;
  }

  console.log("\n==========================================");
  if (testPassed) {
    console.log("REAL-TIME SSE AVAILABILITY CHECKS PASSED!");
    process.exit(0);
  } else {
    console.error("REAL-TIME SSE AVAILABILITY CHECKS FAILED.");
    process.exit(1);
  }
}, 500);
