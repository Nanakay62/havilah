'use strict';

const crypto = require('../utils/crypto');

describe('Cryptography Utilities (AES-256-GCM & SHA-256)', () => {
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    process.env.HMAC_SECRET = process.env.HMAC_SECRET || 'test_hmac_secret_key_for_testing_purposes_123';
  });

  it('encrypts and decrypts text correctly using AES-256-GCM', () => {
    const secret = 'employee.sensitive.record@havilah.io';
    const encrypted = crypto.encryptField(secret);

    expect(encrypted).toHaveProperty('iv');
    expect(encrypted).toHaveProperty('encrypted');
    expect(encrypted).toHaveProperty('authTag');
    expect(encrypted.encrypted).not.toBe(secret);

    const decrypted = crypto.decryptField(encrypted);
    expect(decrypted).toBe(secret);
  });

  it('generates deterministic SHA-256 hashes for lookup', () => {
    const email = 'user@example.com';
    const hash1 = crypto.hashField(email);
    const hash2 = crypto.hashField(email);

    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generates and validates HMAC consent tokens with timing-safe comparison', () => {
    const token = crypto.generateConsentToken();
    expect(crypto.validateConsentToken(token)).toBe(true);

    // Tampered token must fail
    const tampered = token.slice(0, -4) + 'abcd';
    expect(crypto.validateConsentToken(tampered)).toBe(false);
  });

  it('coarsens timestamps to hour-level precision for privacy', () => {
    const date = new Date('2026-09-09T14:47:35.123Z');
    const coarsened = crypto.coarsenTimestamp(date);

    expect(coarsened.getMinutes()).toBe(0);
    expect(coarsened.getSeconds()).toBe(0);
    expect(coarsened.getMilliseconds()).toBe(0);
  });

  it('computes tamper-evident SHA-256 audit hash chaining', () => {
    const prevHash = 'GENESIS';
    const payload = { event: 'USER_REGISTERED', user_id: 'usr-123' };
    const hash1 = crypto.computeAuditHash(prevHash, payload);

    expect(hash1).toHaveLength(64);

    // Tampering with payload must change hash
    const tamperedPayload = { event: 'USER_REGISTERED', user_id: 'usr-999' };
    const hash2 = crypto.computeAuditHash(prevHash, tamperedPayload);
    expect(hash1).not.toBe(hash2);
  });

  it('strictly throws when ENCRYPTION_KEY is missing, malformed, or wrong length', () => {
    const originalKey = process.env.ENCRYPTION_KEY;
    try {
      delete process.env.ENCRYPTION_KEY;
      expect(() => crypto.getEncryptionKey()).toThrow(/ENCRYPTION_KEY must be configured/);

      process.env.ENCRYPTION_KEY = 'short_key';
      expect(() => crypto.getEncryptionKey()).toThrow(/ENCRYPTION_KEY must be configured/);

      process.env.ENCRYPTION_KEY = 'z'.repeat(64); // invalid hex characters
      expect(() => crypto.getEncryptionKey()).toThrow(/ENCRYPTION_KEY must be configured/);
    } finally {
      process.env.ENCRYPTION_KEY = originalKey;
    }
  });

  it('successfully returns 32-byte buffer when ENCRYPTION_KEY is valid 64-hex string', () => {
    const validKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const originalKey = process.env.ENCRYPTION_KEY;
    try {
      process.env.ENCRYPTION_KEY = validKey;
      const buf = crypto.getEncryptionKey();
      expect(buf).toBeInstanceOf(Buffer);
      expect(buf.length).toBe(32);
    } finally {
      process.env.ENCRYPTION_KEY = originalKey;
    }
  });

  it('validates password strength against security criteria', () => {
    // Too short
    expect(crypto.validatePasswordStrength('Short1!').valid).toBe(false);
    expect(crypto.validatePasswordStrength('Short1!').error).toMatch(/at least 12 characters/);

    // Missing uppercase
    expect(crypto.validatePasswordStrength('alllowercase123!').valid).toBe(false);
    expect(crypto.validatePasswordStrength('alllowercase123!').error).toMatch(/uppercase/);

    // Missing lowercase
    expect(crypto.validatePasswordStrength('ALLLUPPERCASE123!').valid).toBe(false);
    expect(crypto.validatePasswordStrength('ALLLUPPERCASE123!').error).toMatch(/lowercase/);

    // Missing digit
    expect(crypto.validatePasswordStrength('NoNumbersHere!@#').valid).toBe(false);
    expect(crypto.validatePasswordStrength('NoNumbersHere!@#').error).toMatch(/number/);

    // Missing special character
    expect(crypto.validatePasswordStrength('NoSpecialChars123').valid).toBe(false);
    expect(crypto.validatePasswordStrength('NoSpecialChars123').error).toMatch(/special character/);

    // Valid strong password
    expect(crypto.validatePasswordStrength('StrongP@ssw0rd!2026').valid).toBe(true);
    expect(crypto.validatePasswordStrength('StrongP@ssw0rd!2026').error).toBeUndefined();
  });
});

