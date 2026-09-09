'use strict';

import { describe, it, expect } from 'vitest';
const crypto = require('../utils/crypto');

describe('Cryptography Utilities (AES-256-GCM & SHA-256)', () => {
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
});
