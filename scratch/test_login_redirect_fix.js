const path = require('path');
const jwt = require(path.join(__dirname, '..', 'server', 'node_modules', 'jsonwebtoken'));
const requireViewRole = require(path.join(__dirname, '..', 'server', 'middleware', 'requireViewRole'));

const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev';

console.log("=== RUNNING LOGIN INSTANT-LOGOUT FIX AUDIT ===");
let testPassed = true;

// 1. Create tokens for HR Admin, Employee, Super Admin
const hrToken = jwt.sign({ userId: 'usr-hr', role: 'hr_admin', companyId: 'ten-1' }, secret, { expiresIn: '24h' });
const empToken = jwt.sign({ userId: 'usr-emp', role: 'employee', companyId: 'ten-1' }, secret, { expiresIn: '24h' });
const superToken = jwt.sign({ userId: 'usr-super', role: 'super_admin', isSystemSuperAdmin: true }, secret, { expiresIn: '24h' });

// 2. Test requireViewRole('hr_admin', 'tenant_admin') with Cookie token
let req1 = { cookies: { token: hrToken }, headers: {} };
let res1 = { redirect: (url) => { throw new Error(`Unexpected redirect to ${url}`); } };
let next1Called = false;

try {
  requireViewRole('hr_admin', 'tenant_admin')(req1, res1, () => { next1Called = true; });
  if (next1Called) console.log("✓ SUCCESS 1: requireViewRole allows HR Admin access via cookie token!");
} catch (e) {
  console.error("FAILED 1: requireViewRole blocked HR Admin cookie:", e.message);
  testPassed = false;
}

// 3. Test requireViewRole('hr_admin', 'tenant_admin') with Authorization Header Bearer token
let req2 = { cookies: {}, headers: { authorization: `Bearer ${hrToken}` } };
let next2Called = false;

try {
  requireViewRole('hr_admin', 'tenant_admin')(req2, res1, () => { next2Called = true; });
  if (next2Called) console.log("✓ SUCCESS 2: requireViewRole allows HR Admin access via Bearer header token!");
} catch (e) {
  console.error("FAILED 2: requireViewRole blocked HR Admin header token:", e.message);
  testPassed = false;
}

// 4. Test requireViewRole('employee') with Employee token
let req3 = { cookies: { token: empToken }, headers: {} };
let next3Called = false;

try {
  requireViewRole('employee')(req3, res1, () => { next3Called = true; });
  if (next3Called) console.log("✓ SUCCESS 3: requireViewRole allows Employee access via token!");
} catch (e) {
  console.error("FAILED 3: requireViewRole blocked Employee token:", e.message);
  testPassed = false;
}

// 5. Test requireViewRole for Super Admin on both HR and Employee portals
let req4 = { cookies: { token: superToken }, headers: {} };
let next4Called = false;

try {
  requireViewRole('hr_admin')(req4, res1, () => { next4Called = true; });
  if (next4Called) console.log("✓ SUCCESS 4: requireViewRole allows Super Admin access to all portals!");
} catch (e) {
  console.error("FAILED 4: requireViewRole blocked Super Admin:", e.message);
  testPassed = false;
}

console.log("\n==========================================");
if (testPassed) {
  console.log("LOGIN INSTANT-LOGOUT FIX AUDIT PASSED!");
  process.exit(0);
} else {
  console.error("LOGIN INSTANT-LOGOUT FIX AUDIT FAILED.");
  process.exit(1);
}
