const fs = require('fs');
const path = require('path');

const stylesCssPath = path.join(__dirname, '..', 'public', 'css', 'styles.css');
const appStyleCssPath = path.join(__dirname, '..', 'private', 'app', 'css', 'style.css');

console.log("=== RUNNING MICROSOFT FLUENT / ACRYLIC CARD STYLING AUDIT ===");
let testPassed = true;

const files = [stylesCssPath, appStyleCssPath];

files.forEach(filePath => {
  const relPath = path.relative(path.join(__dirname, '..'), filePath);
  if (!fs.existsSync(filePath)) {
    console.error(`File missing: ${relPath}`);
    testPassed = false;
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Check 1: Target Card Selectors
  const hasSelectors = content.includes('.acrylic-card') &&
                       content.includes('.card') &&
                       content.includes('.assessment-card') &&
                       content.includes('.dashboard-card') &&
                       content.includes('.cosmic-card') &&
                       content.includes('.stat-card');

  if (hasSelectors) {
    console.log(`✓ SUCCESS [${relPath}]: Targets all card containers (.acrylic-card, .card, .assessment-card, .dashboard-card, .cosmic-card, .stat-card)!`);
  } else {
    console.error(`FAILED [${relPath}]: Missing one or more required card selectors.`);
    testPassed = false;
  }

  // Check 2: Backdrop Filter & Translucency
  const hasAcrylicBlur = content.includes('backdrop-filter: blur(20px) saturate(125%)') &&
                         content.includes('-webkit-backdrop-filter: blur(20px) saturate(125%)') &&
                         content.includes('rgba(255, 255, 255, 0.85)');

  if (hasAcrylicBlur) {
    console.log(`✓ SUCCESS [${relPath}]: Includes hardware-accelerated 20px blur, 125% saturation, and 85% translucency!`);
  } else {
    console.error(`FAILED [${relPath}]: Missing backdrop-filter or translucent background properties.`);
    testPassed = false;
  }

  // Check 3: Geometry & 1px Stroke Border
  const hasBorderAndRadius = content.includes('border-radius: 12px !important') &&
                             content.includes('border: 1px solid rgba(229, 231, 235, 0.8) !important');

  if (hasBorderAndRadius) {
    console.log(`✓ SUCCESS [${relPath}]: Applies 12px Fluent geometry and 1px subtle stroke border!`);
  } else {
    console.error(`FAILED [${relPath}]: Missing 12px radius or subtle stroke border.`);
    testPassed = false;
  }

  // Check 4: Multi-layered Depth Shadow & Hover Lift
  const hasShadowAndHover = content.includes('0 2px 4px rgba(0, 0, 0, 0.02)') &&
                            content.includes('0 8px 16px -4px rgba(0, 0, 0, 0.06)') &&
                            content.includes('cubic-bezier(0.16, 1, 0.3, 1)') &&
                            content.includes('transform: translateY(-2px)');

  if (hasShadowAndHover) {
    console.log(`✓ SUCCESS [${relPath}]: Includes multi-layered ambient depth shadow and smooth hover lift!`);
  } else {
    console.error(`FAILED [${relPath}]: Missing depth shadow or hover lift animation.`);
    testPassed = false;
  }
});

console.log("\n==========================================");
if (testPassed) {
  console.log("MICROSOFT FLUENT / ACRYLIC CARD STYLING AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("MICROSOFT FLUENT / ACRYLIC CARD STYLING AUDIT FAILED.");
  process.exit(1);
}
