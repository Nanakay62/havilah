const path = require('path');
const fs = require('fs');
const { chromium } = require('C:/Users/nanak/node_modules/playwright');

const OUT_DIR = path.resolve(__dirname, 'out');
const ARTIFACTS_DIR = 'C:/Users/nanak/.gemini/antigravity/brain/2a66a026-8d95-4264-ba90-8e9b30e51901';

async function capture() {
  const browser = await chromium.launch({ headless: true });

  try {
    // 1. Desktop 1440px
    console.log('Capturing Desktop 1440px...');
    const desktopPage = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
    });

    await desktopPage.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await desktopPage.waitForTimeout(1000);

    // Ensure all reveal-on-scroll elements are visible for capturing
    await desktopPage.evaluate(() => {
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('is-visible'));
    });
    await desktopPage.waitForTimeout(300);

    // Hero Section
    const heroEl = desktopPage.locator('#hero');
    const heroPath = path.join(OUT_DIR, 'hero_desktop_1440px.png');
    await heroEl.screenshot({ path: heroPath });
    fs.copyFileSync(heroPath, path.join(ARTIFACTS_DIR, 'hero_desktop_1440px.png'));
    console.log('Saved hero_desktop_1440px.png');

    // Summary Strip
    const summaryEl = desktopPage.locator('section[aria-label="Product Highlights"]');
    const summaryPath = path.join(OUT_DIR, 'summary_strip_desktop_1440px.png');
    await summaryEl.screenshot({ path: summaryPath });
    fs.copyFileSync(summaryPath, path.join(ARTIFACTS_DIR, 'summary_strip_desktop_1440px.png'));
    console.log('Saved summary_strip_desktop_1440px.png');

    // Core Capabilities
    const productEl = desktopPage.locator('#product');
    const prodPath = path.join(OUT_DIR, 'capabilities_desktop_1440px.png');
    await productEl.screenshot({ path: prodPath });
    fs.copyFileSync(prodPath, path.join(ARTIFACTS_DIR, 'capabilities_desktop_1440px.png'));
    console.log('Saved capabilities_desktop_1440px.png');

    // Portal Morph Section
    const portalEl = desktopPage.locator('#product-showcase');
    const portalPath = path.join(OUT_DIR, 'portal_showcase_desktop_1440px.png');
    await portalEl.screenshot({ path: portalPath });
    fs.copyFileSync(portalPath, path.join(ARTIFACTS_DIR, 'portal_showcase_desktop_1440px.png'));
    console.log('Saved portal_showcase_desktop_1440px.png');

    // Full page desktop
    const fullDesktopPath = path.join(OUT_DIR, 'full_landing_desktop_1440px.png');
    await desktopPage.screenshot({ path: fullDesktopPath, fullPage: true });
    fs.copyFileSync(fullDesktopPath, path.join(ARTIFACTS_DIR, 'full_landing_desktop_1440px.png'));
    console.log('Saved full_landing_desktop_1440px.png');

    await desktopPage.close();

    // 2. Mobile 390px (iPhone size)
    console.log('Capturing Mobile 390px...');
    const mobilePage = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    await mobilePage.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
    await mobilePage.waitForTimeout(1000);

    // Make all reveal-on-scroll elements visible
    await mobilePage.evaluate(() => {
      document.querySelectorAll('.reveal-on-scroll').forEach(el => el.classList.add('is-visible'));
    });
    await mobilePage.waitForTimeout(300);

    // Hero Mobile
    const mobileHeroEl = mobilePage.locator('#hero');
    const mHeroPath = path.join(OUT_DIR, 'hero_mobile_390px.png');
    await mobileHeroEl.screenshot({ path: mHeroPath });
    fs.copyFileSync(mHeroPath, path.join(ARTIFACTS_DIR, 'hero_mobile_390px.png'));
    console.log('Saved hero_mobile_390px.png');

    // Summary Strip Mobile
    const mSummaryEl = mobilePage.locator('section[aria-label="Product Highlights"]');
    const mSummaryPath = path.join(OUT_DIR, 'summary_strip_mobile_390px.png');
    await mSummaryEl.screenshot({ path: mSummaryPath });
    fs.copyFileSync(mSummaryPath, path.join(ARTIFACTS_DIR, 'summary_strip_mobile_390px.png'));
    console.log('Saved summary_strip_mobile_390px.png');

    // Capabilities Mobile
    const mCapEl = mobilePage.locator('#product');
    const mCapPath = path.join(OUT_DIR, 'capabilities_mobile_390px.png');
    await mCapEl.screenshot({ path: mCapPath });
    fs.copyFileSync(mCapPath, path.join(ARTIFACTS_DIR, 'capabilities_mobile_390px.png'));
    console.log('Saved capabilities_mobile_390px.png');

    // Portal Morph Mobile
    const mobilePortalEl = mobilePage.locator('#product-showcase');
    const mPortalPath = path.join(OUT_DIR, 'portal_showcase_mobile_390px.png');
    await mobilePortalEl.screenshot({ path: mPortalPath });
    fs.copyFileSync(mPortalPath, path.join(ARTIFACTS_DIR, 'portal_showcase_mobile_390px.png'));
    console.log('Saved portal_showcase_mobile_390px.png');

    // Full page mobile
    const fullMobilePath = path.join(OUT_DIR, 'full_landing_mobile_390px.png');
    await mobilePage.screenshot({ path: fullMobilePath, fullPage: true });
    fs.copyFileSync(fullMobilePath, path.join(ARTIFACTS_DIR, 'full_landing_mobile_390px.png'));
    console.log('Saved full_landing_mobile_390px.png');

    await mobilePage.close();
    console.log('All verification captures completed successfully!');
  } finally {
    await browser.close();
  }
}

capture().catch((err) => {
  console.error('Capture failed:', err);
  process.exit(1);
});
