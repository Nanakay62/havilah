const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/nanak/node_modules/playwright');

const OUT_DIR = path.resolve(__dirname, 'out');
const ARTIFACTS_DIR = 'C:/Users/nanak/.gemini/antigravity/brain/2a66a026-8d95-4264-ba90-8e9b30e51901';

if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

async function capture() {
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Desktop 1440x900
    console.log('Capturing Desktop 1440px...');
    const desktopPage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    await desktopPage.goto('http://localhost:3000/#product-showcase', { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(1000);

    const showcaseEl = desktopPage.locator('#product-showcase');
    await showcaseEl.scrollIntoViewIfNeeded();
    await desktopPage.waitForTimeout(500);

    // Capture HR Tab
    const dHrPath = path.join(OUT_DIR, 'portal_morph_desktop_hr.png');
    await showcaseEl.screenshot({ path: dHrPath });
    fs.copyFileSync(dHrPath, path.join(ARTIFACTS_DIR, 'portal_morph_desktop_hr.png'));
    console.log('Saved portal_morph_desktop_hr.png');

    // Click Employee Tab
    await desktopPage.click('#tab-portal-employee');
    await desktopPage.waitForTimeout(600); // Allow crossfade
    const dEmpPath = path.join(OUT_DIR, 'portal_morph_desktop_employee.png');
    await showcaseEl.screenshot({ path: dEmpPath });
    fs.copyFileSync(dEmpPath, path.join(ARTIFACTS_DIR, 'portal_morph_desktop_employee.png'));
    console.log('Saved portal_morph_desktop_employee.png');

    // Click Assessor Tab
    await desktopPage.click('#tab-portal-assessor');
    await desktopPage.waitForTimeout(600);
    const dAssessorPath = path.join(OUT_DIR, 'portal_morph_desktop_assessor.png');
    await showcaseEl.screenshot({ path: dAssessorPath });
    fs.copyFileSync(dAssessorPath, path.join(ARTIFACTS_DIR, 'portal_morph_desktop_assessor.png'));
    console.log('Saved portal_morph_desktop_assessor.png');

    await desktopPage.close();

    // 2. Mobile 390x844 (iPhone 12 / 13 / 14 size)
    console.log('Capturing Mobile 390px...');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    await mobilePage.goto('http://localhost:3000/#product-showcase', { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);

    const mobileShowcaseEl = mobilePage.locator('#product-showcase');
    await mobileShowcaseEl.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(500);

    const mHrPath = path.join(OUT_DIR, 'portal_morph_mobile_390px.png');
    await mobileShowcaseEl.screenshot({ path: mHrPath });
    fs.copyFileSync(mHrPath, path.join(ARTIFACTS_DIR, 'portal_morph_mobile_390px.png'));
    console.log('Saved portal_morph_mobile_390px.png');

    await mobilePage.close();
    console.log('All portal morph screenshots captured successfully!');
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
