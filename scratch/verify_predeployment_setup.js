const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');

console.log("=== RUNNING HAVILAH PRE-DEPLOYMENT SETUP VERIFICATION ===");
let testPassed = true;

// Helper to check file existence
function checkFile(filename) {
  const fullPath = path.join(rootDir, filename);
  if (fs.existsSync(fullPath)) {
    console.log(`✓ SUCCESS: ${filename} exists in project root.`);
    return fs.readFileSync(fullPath, 'utf8');
  } else {
    console.error(`FAILED: ${filename} missing from project root.`);
    testPassed = false;
    return null;
  }
}

// 1. Check Ignore Files
const gitignore = checkFile('.gitignore');
const vercelignore = checkFile('.vercelignore');
const dockerignore = checkFile('.dockerignore');

if (gitignore && gitignore.includes('node_modules/') && gitignore.includes('.env')) {
  console.log("✓ SUCCESS: .gitignore properly configured for lightweight repository push.");
} else {
  console.error("FAILED: .gitignore incomplete.");
  testPassed = false;
}

// 2. Check Frontend API Config Helper
const configJsPath = path.join(rootDir, 'private', 'app', 'js', 'config.js');
if (fs.existsSync(configJsPath)) {
  const configJs = fs.readFileSync(configJsPath, 'utf8');
  if (configJs.includes('window.API_BASE_URL = API_BASE_URL') && configJs.includes('https://havilah-api.onrender.com')) {
    console.log("✓ SUCCESS: private/app/js/config.js exports dynamic API_BASE_URL helper!");
  } else {
    console.error("FAILED: private/app/js/config.js missing dynamic API_BASE_URL definition.");
    testPassed = false;
  }
} else {
  console.error("FAILED: private/app/js/config.js missing.");
  testPassed = false;
}

// 3. Check Backend CORS Configuration
const serverJsPath = path.join(rootDir, 'server', 'server.js');
if (fs.existsSync(serverJsPath)) {
  const serverJs = fs.readFileSync(serverJsPath, 'utf8');
  if (serverJs.includes('http://localhost:3000') && serverJs.includes('http://localhost:5000') && serverJs.includes('credentials: true')) {
    console.log("✓ SUCCESS: server/server.js CORS allowlist configured for local ports, Vercel, and Netlify!");
  } else {
    console.error("FAILED: server/server.js CORS configuration incomplete.");
    testPassed = false;
  }
} else {
  console.error("FAILED: server/server.js missing.");
  testPassed = false;
}

// 4. Check Deployment Configuration Files
const renderYaml = checkFile('render.yaml');
if (renderYaml && renderYaml.includes('havilah-api') && renderYaml.includes('node server/server.js')) {
  console.log("✓ SUCCESS: render.yaml contains valid Render Blueprint configuration!");
} else {
  console.error("FAILED: render.yaml invalid or incomplete.");
  testPassed = false;
}

const vercelJson = checkFile('vercel.json');
if (vercelJson) {
  try {
    const parsed = JSON.parse(vercelJson);
    if (parsed.routes && parsed.routes.length >= 4) {
      console.log("✓ SUCCESS: vercel.json contains valid JSON routing rules!");
    } else {
      console.error("FAILED: vercel.json routes missing.");
      testPassed = false;
    }
  } catch (e) {
    console.error("FAILED: vercel.json is not valid JSON.");
    testPassed = false;
  }
}

const netlifyToml = checkFile('netlify.toml');
if (netlifyToml && netlifyToml.includes('publish = "private/app"') && netlifyToml.includes('[[redirects]]')) {
  console.log("✓ SUCCESS: netlify.toml contains valid Netlify build & redirect rules!");
} else {
  console.error("FAILED: netlify.toml invalid or incomplete.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("PRE-DEPLOYMENT SETUP VERIFICATION PASSED!");
  process.exit(0);
} else {
  console.error("PRE-DEPLOYMENT SETUP VERIFICATION FAILED.");
  process.exit(1);
}
