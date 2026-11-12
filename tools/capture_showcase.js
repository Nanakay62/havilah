'use strict';

/**
 * capture_showcase.js
 *
 * Automated Playwright capture of real UI screenshots for the Havilah landing page showcase.
 * Spins up an in-memory MongoDB on 127.0.0.1, seeds fictional demo data via seedDemoTenant.js,
 * starts the local server on port 3456, logs into each portal, and captures pixel-perfect
 * 1760x1000 screenshots (880x500 @ 2x deviceScaleFactor).
 *
 * Outputs:
 * - public/assets/showcase/hr.webp (< 150 KB)
 * - public/assets/showcase/employee.webp (< 150 KB)
 * - public/assets/showcase/assessor.webp (< 150 KB)
 * - tools/out/*.png
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

// 1. Dependencies from tools/node_modules and global playwright
const { MongoMemoryServer } = require(path.join(__dirname, 'node_modules/mongodb-memory-server'));
const { chromium } = require('C:/Users/nanak/node_modules/playwright');
const { seedDemoTenant } = require('../server/scripts/seedDemoTenant');

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const ARTIFACT_DIR = 'C:/Users/nanak/.gemini/antigravity/brain/2a66a026-8d95-4264-ba90-8e9b30e51901';

const SHOWCASE_DIR = path.join(__dirname, '../public/assets/showcase');
const OUT_DIR = path.join(__dirname, 'out');

fs.mkdirSync(SHOWCASE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

async function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(url, (res) => {
          if (res.statusCode < 500) resolve();
          else reject(new Error(`Status ${res.statusCode}`));
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('Timeout'));
        });
      });
      return true;
    } catch (e) {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  throw new Error(`Server failed to respond at ${url} within ${timeoutMs}ms`);
}

async function convertPngToWebp(page, pngBuffer, quality = 0.85) {
  const base64Png = pngBuffer.toString('base64');
  const webpDataUrl = await page.evaluate(async ({ base64, q }) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/webp', q));
      };
      img.onerror = () => reject(new Error('Failed to load image in canvas'));
      img.src = 'data:image/png;base64,' + base64;
    });
  }, { base64: base64Png, q: quality });

  const rawBase64 = webpDataUrl.replace(/^data:image\/webp;base64,/, '');
  return Buffer.from(rawBase64, 'base64');
}

async function run() {
  console.log('================================================================');
  console.log('HAVILAH SHOWCASE CAPTURE: Real UI In-Memory Automated Capture');
  console.log('================================================================');

  let mongod = null;
  let serverProcess = null;
  let browser = null;

  try {
    // A. Start in-memory MongoDB
    console.log('[1/6] Starting in-memory MongoDB instance on 127.0.0.1...');
    mongod = await MongoMemoryServer.create({
      instance: { ip: '127.0.0.1' },
    });
    const mongoUri = mongod.getUri();
    console.log(`✓ InMemory Mongo running at: ${mongoUri}`);

    // B. Seed demo tenant
    console.log('[2/6] Seeding fictional demo company data...');
    process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.JWT_SECRET = 'demo-jwt-secret-local-showcase-2026';
    await seedDemoTenant(mongoUri);

    // Read credentials from .env.demo
    const envDemoPath = path.join(__dirname, '../.env.demo');
    const envDemoContent = fs.readFileSync(envDemoPath, 'utf8');
    const getVal = (key) => {
      const m = envDemoContent.match(new RegExp(`^${key}=(.*)$`, 'm'));
      return m ? m[1].trim() : '';
    };

    const hrEmail = getVal('HR_EMAIL') || 'hr.demo@havilah.local';
    const hrPass = getVal('HR_PASSWORD') || 'DemoAdmin123!';
    const empEmail = getVal('EMPLOYEE_EMAIL') || 'employee.demo@havilah.local';
    const empPass = getVal('EMPLOYEE_PASSWORD') || 'DemoEmployee123!';
    const assessorEmail = getVal('ASSESSOR_EMAIL') || 'assessor.demo@havilah.local';
    const assessorPass = getVal('ASSESSOR_PASSWORD') || 'DemoAssessor123!';

    // C. Start local server child process
    console.log(`[3/6] Starting local Express server on port ${PORT}...`);
    const serverEnv = {
      ...process.env,
      PORT: String(PORT),
      MONGO_URI: mongoUri,
      MONGODB_URI: mongoUri,
      NODE_ENV: 'development',
      ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      JWT_SECRET: 'demo-jwt-secret-local-showcase-2026',
    };

    const serverScript = path.join(__dirname, '../server/server.js');
    serverProcess = spawn(process.execPath, [serverScript], {
      env: serverEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (d) => {
      const line = d.toString().trim();
      if (line.includes('running on port') || line.includes('error')) {
        console.log(`  [server stdout] ${line}`);
      }
    });

    serverProcess.stderr.on('data', (d) => {
      console.warn(`  [server stderr] ${d.toString().trim()}`);
    });

    await waitForServer(`${BASE_URL}/health`);
    console.log(`✓ Local server ready at ${BASE_URL}`);

    // D. Launch Playwright
    console.log('[4/6] Launching Chromium browser (880x500 @ 2x scale = 1760x1000 physical)...');
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--font-render-hinting=none'],
    });

    const context = await browser.newContext({
      viewport: { width: 880, height: 500 },
      deviceScaleFactor: 2,
    });

    // Suppress auto tours in localStorage
    await context.addInitScript(() => {
      try {
        localStorage.setItem('havilah_tour_hr-analytics-portal_seen', 'true');
        localStorage.setItem('havilah_tour_employee-portal_seen', 'true');
        localStorage.setItem('havilah_tour_clinical-portal_seen', 'true');
        localStorage.setItem('havilah_tour_login-page_seen', 'true');
      } catch (e) {}
    });

    const capturedResults = [];

    // -------------------------------------------------------------
    // CAPTURE 1: HR Admin Portal
    // -------------------------------------------------------------
    console.log('[5/6 - 1/3] Capturing HR Admin Portal...');
    const pageHr = await context.newPage();
    await pageHr.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

    await pageHr.fill('#email', hrEmail);
    await pageHr.fill('#password', hrPass);
    await Promise.all([
      pageHr.waitForURL('**/portal/hr.html', { timeout: 15000 }),
      pageHr.click('#submitBtn'),
    ]);

    // Wait for HR data and charts
    await pageHr.waitForSelector('#risk-trends-container', { state: 'visible', timeout: 15000 });
    await pageHr.waitForTimeout(2500);

    // Close any modal if present
    await pageHr.evaluate(() => {
      const modals = document.querySelectorAll('.modal-backdrop, #privacy-modal');
      modals.forEach(m => { m.style.display = 'none'; });
      const tour = document.getElementById('havilahTourModal');
      if (tour) tour.remove();
    });

    const hrPng = await pageHr.screenshot({ type: 'png' });
    const hrWebp = await convertPngToWebp(pageHr, hrPng, 0.85);

    fs.writeFileSync(path.join(OUT_DIR, 'hr.png'), hrPng);
    fs.writeFileSync(path.join(SHOWCASE_DIR, 'hr.webp'), hrWebp);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'hr.png'), hrPng);
    console.log(`✓ HR screenshot captured: ${hrWebp.length} bytes WebP (${(hrWebp.length / 1024).toFixed(1)} KB)`);
    capturedResults.push({ role: 'hr', webpBytes: hrWebp.length, pngBytes: hrPng.length });
    await pageHr.close();

    // -------------------------------------------------------------
    // CAPTURE 2: Employee Portal
    // -------------------------------------------------------------
    console.log('[5/6 - 2/3] Capturing Employee Portal...');
    const pageEmp = await context.newPage();
    // Clear cookies/storage for clean employee login
    await pageEmp.context().clearCookies();
    await pageEmp.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

    await pageEmp.fill('#email', empEmail);
    await pageEmp.fill('#password', empPass);
    await Promise.all([
      pageEmp.waitForURL('**/app/dashboard.html', { timeout: 15000 }),
      pageEmp.click('#submitBtn'),
    ]);

    // Wait for employee dashboard
    await pageEmp.waitForSelector('#wellbeing-hero-card, #view-employee', { state: 'visible', timeout: 15000 });
    await pageEmp.waitForTimeout(2500);

    // Close any modal or overlay
    await pageEmp.evaluate(() => {
      const overlays = document.querySelectorAll('.modal-backdrop, #helpCenterModalBackdrop');
      overlays.forEach(o => { o.style.display = 'none'; o.classList.remove('open'); });
      const tour = document.getElementById('havilahTourModal');
      if (tour) tour.remove();
    });

    const empPng = await pageEmp.screenshot({ type: 'png' });
    const empWebp = await convertPngToWebp(pageEmp, empPng, 0.85);

    fs.writeFileSync(path.join(OUT_DIR, 'employee.png'), empPng);
    fs.writeFileSync(path.join(SHOWCASE_DIR, 'employee.webp'), empWebp);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'employee.png'), empPng);
    console.log(`✓ Employee screenshot captured: ${empWebp.length} bytes WebP (${(empWebp.length / 1024).toFixed(1)} KB)`);
    capturedResults.push({ role: 'employee', webpBytes: empWebp.length, pngBytes: empPng.length });
    await pageEmp.close();

    // -------------------------------------------------------------
    // CAPTURE 3: Medical Assessor Portal
    // -------------------------------------------------------------
    console.log('[5/6 - 3/3] Capturing Medical Assessor Portal...');
    const pageAssessor = await context.newPage();
    await pageAssessor.goto(`${BASE_URL}/clinical-portal.html`, { waitUntil: 'networkidle' });

    await pageAssessor.fill('#assessorEmailInput', assessorEmail);
    await pageAssessor.fill('#assessorPasswordInput', assessorPass);
    await pageAssessor.click('#assessorLoginBtn');

    // Wait for dashboard section to appear
    await pageAssessor.waitForFunction(() => {
      const sec = document.getElementById('assessorDashboardSection');
      return sec && window.getComputedStyle(sec).display !== 'none';
    }, { timeout: 10000 });

    // Wait for cases to render in table
    await pageAssessor.waitForSelector('#assessorQueueTableBody tr', { state: 'visible', timeout: 15000 });
    await pageAssessor.waitForTimeout(2500);

    // Confirm case detail modal is closed per instructions
    await pageAssessor.evaluate(() => {
      const modals = document.querySelectorAll('.modal-backdrop, #caseDetailModal, #autoLockWarningModal');
      modals.forEach(m => { m.style.display = 'none'; m.classList.remove('open'); });
      const tour = document.getElementById('havilahTourModal');
      if (tour) tour.remove();
    });

    const assessorPng = await pageAssessor.screenshot({ type: 'png' });
    const assessorWebp = await convertPngToWebp(pageAssessor, assessorPng, 0.85);

    fs.writeFileSync(path.join(OUT_DIR, 'assessor.png'), assessorPng);
    fs.writeFileSync(path.join(SHOWCASE_DIR, 'assessor.webp'), assessorWebp);
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'assessor.png'), assessorPng);
    console.log(`✓ Medical Assessor screenshot captured: ${assessorWebp.length} bytes WebP (${(assessorWebp.length / 1024).toFixed(1)} KB)`);
    capturedResults.push({ role: 'assessor', webpBytes: assessorWebp.length, pngBytes: assessorPng.length });
    await pageAssessor.close();

    // F. Verification & Privacy Check
    console.log('[6/6] Validating output assets...');
    console.log('----------------------------------------------------------------');
    for (const r of capturedResults) {
      const kb = (r.webpBytes / 1024).toFixed(1);
      const isUnder150 = r.webpBytes < 150 * 1024;
      console.log(`Role: ${r.role.toUpperCase().padEnd(10)} | WebP: ${kb.padStart(6)} KB | < 150KB: ${isUnder150 ? 'PASS' : 'WARN'}`);
    }
    console.log('----------------------------------------------------------------');
    console.log('All real UI screenshots generated successfully!');

  } finally {
    // Teardown
    if (browser) {
      await browser.close().catch(() => {});
    }
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await new Promise(r => setTimeout(r, 500));
    }
    if (mongod) {
      await mongod.stop().catch(() => {});
    }
  }
}

run()
  .then(() => {
    console.log('Showcase capture execution completed.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Showcase capture execution failed:', err);
    process.exit(1);
  });
