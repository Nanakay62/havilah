'use strict';

/**
 * Shared Test Configuration & Environment Bootstrap
 * Ensures consistent secrets and keys across local execution and GitHub Actions CI.
 */
const TEST_JWT_SECRET = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';
const TEST_ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const TEST_SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY || 'test-super-admin-key-2026';
const TEST_HMAC_SECRET = process.env.HMAC_SECRET || 'test-hmac-secret-2026';

// Guarantee process.env defaults are populated
process.env.JWT_SECRET = TEST_JWT_SECRET;
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || TEST_JWT_SECRET;
process.env.ENCRYPTION_KEY = TEST_ENCRYPTION_KEY;
process.env.SUPER_ADMIN_KEY = TEST_SUPER_ADMIN_KEY;
process.env.HMAC_SECRET = TEST_HMAC_SECRET;
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'test';
}

module.exports = {
  TEST_JWT_SECRET,
  TEST_ENCRYPTION_KEY,
  TEST_SUPER_ADMIN_KEY,
  TEST_HMAC_SECRET,
};
