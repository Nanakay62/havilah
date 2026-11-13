'use strict';

const crypto = require('crypto');

/**
 * RFC 6238 / RFC 4226 Time-Based One-Time Password (TOTP) implementation
 * Built using Node.js native crypto for enterprise 2FA without external dependencies.
 */

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input) {
  const cleanInput = input.toUpperCase().replace(/=+$/, '');
  let bits = 0;
  let value = 0;
  const bytes = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const idx = BASE32_CHARS.indexOf(cleanInput[i]);
    if (idx === -1) continue;

    value = (value << 5) | idx;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

/**
 * Generates a new cryptographically random Base32 secret for TOTP setup.
 * @param {number} [byteLength=20]
 * @returns {string} Base32 secret
 */
function generateTotpSecret(byteLength = 20) {
  const randomBytes = crypto.randomBytes(byteLength);
  return base32Encode(randomBytes);
}

/**
 * Computes the 6-digit TOTP code for a given secret at a specific counter step.
 * @param {string} secret - Base32 encoded secret
 * @param {number} [timeStepWindow=0] - Offset window (-1, 0, +1) for clock drift
 * @returns {string} 6-digit code
 */
function generateTotpCode(secret, timeStepWindow = 0) {
  const key = base32Decode(secret);
  const timeStep = 30; // 30 seconds
  const counter = Math.floor(Date.now() / 1000 / timeStep) + timeStepWindow;

  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter), 0);

  const hmac = crypto.createHmac('sha1', key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const codeInt =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const code = (codeInt % 1000000).toString().padStart(6, '0');
  return code;
}

/**
 * Validates a user-supplied 6-digit TOTP code against a secret, allowing +-1 step clock drift.
 * @param {string} token - 6-digit code
 * @param {string} secret - Base32 secret
 * @returns {boolean}
 */
function verifyTotpCode(token, secret) {
  if (!token || typeof token !== 'string' || !secret) return false;
  const cleanToken = token.trim();
  if (!/^\d{6}$/.test(cleanToken)) return false;

  // Check window -1, 0, +1 (prevents clock skew failures)
  for (const window of [-1, 0, 1]) {
    const expected = generateTotpCode(secret, window);
    if (crypto.timingSafeEqual(Buffer.from(cleanToken), Buffer.from(expected))) {
      return true;
    }
  }

  return false;
}

/**
 * Returns an otpauth:// URI for QR code generation in authenticator apps.
 */
function getOtpAuthUrl({ issuer = 'Havilah', accountName, secret }) {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

function hashRecoveryCode(code) {
  const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function generateRecoveryCodes(count = 8) {
  const plainCodes = [];
  const hashedCodes = [];
  for (let i = 0; i < count; i++) {
    const raw = crypto.randomBytes(4).toString('hex').toUpperCase();
    const formatted = `${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashRecoveryCode(formatted));
  }
  return { plainCodes, hashedCodes };
}

function verifyAndConsumeRecoveryCode(candidateCode, storedHashes = []) {
  if (!candidateCode || !Array.isArray(storedHashes) || storedHashes.length === 0) {
    return { valid: false, remainingHashes: storedHashes || [] };
  }
  const normalized = String(candidateCode).toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (normalized.length < 6) {
    return { valid: false, remainingHashes: storedHashes };
  }
  const candidateHash = crypto.createHash('sha256').update(normalized).digest('hex');
  const idx = storedHashes.findIndex(h => {
    if (!h || h.length !== candidateHash.length) return false;
    return crypto.timingSafeEqual(Buffer.from(h, 'utf8'), Buffer.from(candidateHash, 'utf8'));
  });
  if (idx === -1) {
    return { valid: false, remainingHashes: storedHashes };
  }
  const remainingHashes = storedHashes.filter((_, i) => i !== idx);
  return { valid: true, remainingHashes };
}

module.exports = {
  generateTotpSecret,
  generateTotpCode,
  verifyTotpCode,
  getOtpAuthUrl,
  generateRecoveryCodes,
  hashRecoveryCode,
  verifyAndConsumeRecoveryCode,
};
