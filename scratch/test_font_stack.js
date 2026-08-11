const fs = require('fs');
const path = require('path');

const filesToTest = [
  path.join(__dirname, '..', 'private', 'app', 'dashboard.html'),
  path.join(__dirname, '..', 'private', 'portal', 'hr.html'),
  path.join(__dirname, '..', 'private', 'app', 'superadmin.html'),
  path.join(__dirname, '..', 'public', 'login.html'),
  path.join(__dirname, '..', 'public', 'index.html')
];

console.log("=== RUNNING GEOMETRIC SANS (INTER) FONT STACK AUDIT ===");
let testPassed = true;

filesToTest.forEach(filePath => {
  const relPath = path.relative(path.join(__dirname, '..'), filePath);
  if (!fs.existsSync(filePath)) {
    console.error(`File missing: ${relPath}`);
    testPassed = false;
    return;
  }

  const content = fs.readFileSync(filePath, 'utf8');

  // Check 1: Google Font Inter import link
  const hasInterLink = content.includes('fonts.googleapis.com/css2?family=Inter');
  const hasPreconnect = content.includes('fonts.gstatic.com');

  if (hasInterLink && hasPreconnect) {
    console.log(`✓ SUCCESS [${relPath}]: Includes Google Fonts Inter stylesheet link & preconnect!`);
  } else {
    console.error(`FAILED [${relPath}]: Missing Inter Google Font import or preconnect.`);
    testPassed = false;
  }

  // Check 2: Inter font-family stack
  const hasInterFontStack = content.includes("'Inter'") || content.includes('"Inter"');
  if (hasInterFontStack) {
    console.log(`✓ SUCCESS [${relPath}]: Specifies 'Inter' as primary geometric sans-serif font family!`);
  } else {
    console.error(`FAILED [${relPath}]: Missing 'Inter' font-family declaration.`);
    testPassed = false;
  }
});

// Check 3: CSS Tabular Figures Rule
const styleCssPath = path.join(__dirname, '..', 'public', 'css', 'styles.css');
if (fs.existsSync(styleCssPath)) {
  const styleContent = fs.readFileSync(styleCssPath, 'utf8');
  if (styleContent.includes('tabular-nums') && styleContent.includes('font-feature-settings: "tnum"')) {
    console.log(`✓ SUCCESS [public/css/styles.css]: Enforces tabular figures ('tnum') for aligned metrics!`);
  } else {
    console.error(`FAILED [public/css/styles.css]: Missing tabular-nums rule.`);
    testPassed = false;
  }
}

console.log("\n==========================================");
if (testPassed) {
  console.log("GEOMETRIC SANS (INTER) FONT STACK AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("GEOMETRIC SANS (INTER) FONT STACK AUDIT FAILED.");
  process.exit(1);
}
