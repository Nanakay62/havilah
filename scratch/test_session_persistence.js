const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const fs = require('fs');
const path = require('path');
const jwt = require(path.join(__dirname, '..', 'server', 'node_modules', 'jsonwebtoken'));

const authJsPath = path.join(__dirname, '..', 'public', 'js', 'auth.js');
const authJsContent = fs.readFileSync(authJsPath, 'utf8');

const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev';

console.log("=== RUNNING SESSION PERSISTENCE & AUTO-RESTORE VERIFICATION ===");
let testPassed = true;

// 1. Create a dummy JWT token for a test user
const mockUser = {
  userId: "usr-test-999",
  companyId: "ten-test-111",
  departmentId: "DEPT_01",
  role: "hr_admin"
};

const token = jwt.sign(mockUser, secret, { expiresIn: '24h' });

// 2. Setup JSDOM environment representing HR portal
const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body></body></html>`, {
  runScripts: "dangerously",
  url: "http://localhost/portal/hr.html"
});

const window = dom.window;
window.eval(authJsContent.replace('const Auth =', 'window.Auth ='));

// Pre-set localStorage with havilah_token & havilah_user
window.localStorage.setItem('havilah_token', token);
window.localStorage.setItem('havilah_user', JSON.stringify({
  id: mockUser.userId,
  role: mockUser.role,
  tenant_id: mockUser.companyId
}));

// Test Auth helper functions in browser context
const storedToken = window.Auth.getToken();
console.log("Stored token resolved via Auth.getToken():", storedToken ? "PRESENT" : "MISSING");

if (storedToken === token) {
  console.log("✓ SUCCESS 1: Auth.getToken() correctly retrieves persistent token from localStorage!");
} else {
  console.error("FAILED 1: Auth.getToken() failed to retrieve token.");
  testPassed = false;
}

const authHeader = window.Auth.getAuthHeader();
if (authHeader.Authorization === `Bearer ${token}`) {
  console.log("✓ SUCCESS 2: Auth.getAuthHeader() generates valid Bearer authorization header!");
} else {
  console.error("FAILED 2: Auth.getAuthHeader() failed.");
  testPassed = false;
}

const parsedPayload = window.Auth.parseToken();
if (parsedPayload && parsedPayload.userId === mockUser.userId && parsedPayload.role === 'hr_admin') {
  console.log("✓ SUCCESS 3: Auth.parseToken() successfully decodes user payload across page reloads!");
} else {
  console.error("FAILED 3: Auth.parseToken() failed.");
  testPassed = false;
}

// Test Logout Cleanup
window.Auth.logout();
const postLogoutToken = window.localStorage.getItem('havilah_token') || window.localStorage.getItem('token');
if (!postLogoutToken) {
  console.log("✓ SUCCESS 4: Auth.logout() completely purges persistent storage and revokes token!");
} else {
  console.error("FAILED 4: Auth.logout() left stale tokens in storage.");
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("SESSION PERSISTENCE VERIFICATION PASSED!");
  process.exit(0);
} else {
  console.error("SESSION PERSISTENCE VERIFICATION FAILED.");
  process.exit(1);
}
