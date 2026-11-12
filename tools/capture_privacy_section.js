const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/nanak/node_modules/playwright');

const OUT_DIR = path.resolve(__dirname, 'out');
const ARTIFACTS_DIR = 'C:/Users/nanak/.gemini/antigravity/brain/2a66a026-8d95-4264-ba90-8e9b30e51901';

async function capture() {
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Desktop 1440px
    console.log('Capturing Privacy Desktop 1440px...');
    const desktopPage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    await desktopPage.goto('http://localhost:3000/#privacy', { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(600);

    await desktopPage.evaluate(() => {
      document.querySelectorAll('.reveal-on-scroll').forEach((el) => el.classList.add('is-visible'));
    });
    await desktopPage.waitForTimeout(300);

    const privacyEl = desktopPage.locator('#privacy');
    await privacyEl.scrollIntoViewIfNeeded();
    await desktopPage.waitForTimeout(300);

    const dPath = path.join(OUT_DIR, 'privacy_fixed_desktop_1440px.png');
    await privacyEl.screenshot({ path: dPath });
    fs.copyFileSync(dPath, path.join(ARTIFACTS_DIR, 'privacy_fixed_desktop_1440px.png'));
    console.log('Saved privacy_fixed_desktop_1440px.png');

    await desktopPage.close();

    // 2. Mobile 390px
    console.log('Capturing Privacy Mobile 390px...');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    await mobilePage.goto('http://localhost:3000/#privacy', { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(600);

    await mobilePage.evaluate(() => {
      document.querySelectorAll('.reveal-on-scroll').forEach((el) => el.classList.add('is-visible'));
    });
    await mobilePage.waitForTimeout(300);

    const mPrivacyEl = mobilePage.locator('#privacy');
    await mPrivacyEl.scrollIntoViewIfNeeded();
    await mobilePage.waitForTimeout(300);

    const mPath = path.join(OUT_DIR, 'privacy_fixed_mobile_390px.png');
    await mPrivacyEl.screenshot({ path: mPath });
    fs.copyFileSync(mPath, path.join(ARTIFACTS_DIR, 'privacy_fixed_mobile_390px.png'));
    console.log('Saved privacy_fixed_mobile_390px.png');

    await mobilePage.close();
    console.log('Privacy section captures completed!');
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
