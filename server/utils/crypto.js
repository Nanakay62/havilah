'use strict';

const crypto = require('crypto');

/**
 * AES-256-GCM encryption algorithm identifier.
 * @type {string}
 */
const AES_ALGORITHM = 'aes-256-gcm';

/**
 * IV byte length for AES-256-GCM (96-bit / 12 bytes is the NIST recommendation).
 * @type {number}
 */
const IV_LENGTH = 12;

/**
 * Auth-tag byte length for AES-256-GCM.
 * @type {number}
 */
const AUTH_TAG_LENGTH = 16;

/**
 * Returns the 32-byte encryption key derived from the ENCRYPTION_KEY env var.
 * The env var MUST be a 64-character hex string (= 32 bytes).
 *
 * @returns {Buffer}
 * @throws {Error} If ENCRYPTION_KEY is missing or malformed.
 */
function getEncryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length !== 64) {
    throw new Error(
      'ENCRYPTION_KEY env var must be a 64-character hex string (32 bytes). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
    );
  }
  return Buffer.from(raw, 'hex');
}

/**
 * Returns the HMAC key used for consent-token signing.
 * Falls back to ENCRYPTION_KEY if HMAC_SECRET is not set.
 *
 * @returns {string}
 */
function getHmacSecret() {
  return process.env.HMAC_SECRET || process.env.ENCRYPTION_KEY || '';
}

/* ─────────────────────────────────────────────
 *  AES-256-GCM field encryption / decryption
 * ───────────────────────────────────────────── */

/**
 * Encrypts a plaintext string with AES-256-GCM.
 *
 * @param {string} plaintext - The value to encrypt.
 * @returns {{ iv: string, encrypted: string, authTag: string }} Hex-encoded components.
 */
function encryptField(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('encryptField: plaintext must be a non-empty string');
  }

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv, { authTagLength: AUTH_TAG_LENGTH });

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag().toString('hex');

  return {
    iv: iv.toString('hex'),
    encrypted,
    authTag,
  };
}

/**
 * Decrypts a value previously encrypted with {@link encryptField}.
 *
 * @param {{ iv: string, encrypted: string, authTag: string }} components - Hex-encoded.
 * @returns {string} The original plaintext.
 */
function decryptField({ iv, encrypted, authTag }) {
  if (!iv || !encrypted || !authTag) {
    throw new Error('decryptField: iv, encrypted, and authTag are all required');
  }

  const key = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    AES_ALGORITHM,
    key,
    Buffer.from(iv, 'hex'),
    { authTagLength: AUTH_TAG_LENGTH }
  );
  decipher.setAuthTag(Buffer.from(authTag, 'hex'));

  let plaintext = decipher.update(encrypted, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}

/* ─────────────────────────────────────────────
 *  SHA-256 hashing
 * ───────────────────────────────────────────── */

/**
 * Returns the SHA-256 hex digest of a plaintext string.
 * Used for deterministic email lookup without decryption.
 *
 * @param {string} plaintext
 * @returns {string} 64-character lowercase hex string.
 */
function hashField(plaintext) {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('hashField: plaintext must be a non-empty string');
  }
  return crypto.createHash('sha256').update(plaintext, 'utf8').digest('hex');
}

/* ─────────────────────────────────────────────
 *  Consent token generation & validation
 * ───────────────────────────────────────────── */

/**
 * Generates a consent token composed of a UUID and an HMAC signature
 * separated by a dot: `<uuid>.<hmac>`.
 *
 * @returns {string}
 */
function generateConsentToken() {
  const nonce = crypto.randomUUID();
  const hmac = crypto
    .createHmac('sha256', getHmacSecret())
    .update(nonce)
    .digest('hex');
  return `${nonce}.${hmac}`;
}

/**
 * Validates that a consent token's HMAC signature is authentic.
 *
 * @param {string} token - The full `<uuid>.<hmac>` string.
 * @returns {boolean}
 */
function validateConsentToken(token) {
  if (typeof token !== 'string') return false;

  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const nonce = token.slice(0, dotIndex);
  const providedHmac = token.slice(dotIndex + 1);

  const expectedHmac = crypto
    .createHmac('sha256', getHmacSecret())
    .update(nonce)
    .digest('hex');

  // Constant-time comparison to prevent timing attacks
  if (providedHmac.length !== expectedHmac.length) return false;
  return crypto.timingSafeEqual(
    Buffer.from(providedHmac, 'hex'),
    Buffer.from(expectedHmac, 'hex')
  );
}

/* ─────────────────────────────────────────────
 *  Audit hash-chain
 * ───────────────────────────────────────────── */

/**
 * Computes the SHA-256 hash for an audit log entry, chaining it to the
 * previous entry's hash for tamper-evident immutability.
 *
 * @param {string} previousHash - The sha256_hash of the preceding audit entry, or 'GENESIS'.
 * @param {object} eventPayload - The event_payload object to include in the hash.
 * @returns {string} 64-character lowercase hex digest.
 */
function computeAuditHash(previousHash, eventPayload) {
  const data = previousHash + JSON.stringify(eventPayload);
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

/* ─────────────────────────────────────────────
 *  Timestamp coarsening
 * ───────────────────────────────────────────── */

/**
 * Coarsens a Date to hour-level precision by zeroing minutes, seconds,
 * and milliseconds.  Prevents timing-based re-identification of survey
 * submissions.
 *
 * @param {Date} date
 * @returns {Date} A new Date with sub-hour components zeroed.
 */
function coarsenTimestamp(date) {
  const d = new Date(date);
  d.setMinutes(0, 0, 0);
  return d;
}

module.exports = {
  encryptField,
  decryptField,
  hashField,
  generateConsentToken,
  validateConsentToken,
  computeAuditHash,
  coarsenTimestamp,
};
