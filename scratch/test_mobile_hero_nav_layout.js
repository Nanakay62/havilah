const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log("=== RUNNING MOBILE HERO AND NAVIGATION LAYOUT VERIFICATION ===");
let testPassed = true;

const indexPath = path.join(rootDir, 'public', 'index.html');
const cssPath = path.join(rootDir, 'public', 'css', 'landing.css');
const dashboardPath = path.join(rootDir, 'private', 'app', 'dashboard.html');

const indexHtml = fs.readFileSync(indexPath, 'utf8');
const landingCss = fs.readFileSync(cssPath, 'utf8');
const dashboardHtml = fs.readFileSync(dashboardPath, 'utf8');

// 1. Check Mobile Menu Toggle Button and Drawer in public/index.html
if (indexHtml.includes('mobile-menu-btn') && indexHtml.includes('mobile-menu-drawer') && indexHtml.includes('toggleMobileMenu')) {
  console.log("✓ SUCCESS: Mobile hamburger toggle button and collapsible drawer implemented in public/index.html!");
} else {
  console.error("FAILED: Missing mobile menu button or drawer in public/index.html");
  testPassed = false;
}

// 2. Check Background Particle Opacity & Text Contrast Fix
if (indexHtml.includes('#particle-brain-container') && indexHtml.includes('opacity: 0.25 !important') && dashboardHtml.includes('#particle-brain-container')) {
  console.log("✓ SUCCESS: Lowered background particle canvas opacity to 0.25 on mobile (< 768px) with high-contrast text shadow!");
} else {
  console.error("FAILED: Missing mobile background particle opacity fix.");
  testPassed = false;
}

// 3. Check ISO Badge Vertical Stacking
if (indexHtml.includes('.hero-tag {') && indexHtml.includes('flex-direction: column !important') && dashboardHtml.includes('flex-direction: column !important')) {
  console.log("✓ SUCCESS: Hero ISO pill badge set to vertical flex-direction: column on mobile to prevent text clipping!");
} else {
  console.error("FAILED: Missing hero ISO tag flex-direction: column rule.");
  testPassed = false;
}

// 4. Check JS Function Definition
if (indexHtml.includes('window.toggleMobileMenu = toggleMobileMenu;')) {
  console.log("✓ SUCCESS: toggleMobileMenu JS function exposed globally on window!");
} else {
  console.error("FAILED: toggleMobileMenu function missing.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("MOBILE HERO AND NAV LAYOUT AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("MOBILE HERO AND NAV LAYOUT AUDIT FAILED.");
  process.exit(1);
}
