'use strict';

/**
 * @fileoverview Identity-stripping middleware for the anonymous hazard log pipeline.
 *
 * CRITICAL PRIVACY CONTRACT
 * ─────────────────────────
 * This middleware is the primary line of defence ensuring ZERO linkage between
 * a survey submission and the individual who submitted it.
 *
 * It operates by:
 *   1. Extracting ONLY the tenant-level identifiers (company_id, department_id)
 *      from the authenticated session and placing them in `req.anonymizedContext`.
 *   2. Explicitly purging ALL user-identifiable fields from the request body,
 *      headers, and transport-layer metadata (IP address).
 *   3. Logging a confirmation that the stripping was performed.
 *
 * This middleware MUST be placed AFTER `validateSession` (so that session data
 * is available) but BEFORE the hazard-log controller handler.
 */

/**
 * Fields that MUST be removed from `req.body` to prevent accidental PII
 * persistence in the anonymous hazard log collection.
 * @type {string[]}
 */
const BODY_PII_FIELDS = [
  'user_id',
  'userId',
  'ip',
  'ip_address',
  'ipAddress',
  'user_agent',
  'userAgent',
  'user-agent',
  'x-forwarded-for',
  'x_forwarded_for',
  'email',
  'email_hash',
  'email_encrypted',
  'full_name',
  'name',
  'session_token',
];

/**
 * Express middleware that strips all identity-bearing data from the request
 * before it reaches the hazard-log controller.
 *
 * After this middleware runs:
 *   - `req.anonymizedContext` contains `{ company_id, department_id }` only
 *   - `req.sessionData` is deleted (no lingering user reference)
 *   - `req.body` has all PII fields removed
 *   - `req.ip` is overwritten with `null`
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function stripIdentity(req, res, next) {
  if (!req.sessionData) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Session must be validated before identity can be stripped',
    });
  }

  // ── Step 1: Extract ONLY tenant-level identifiers ──────────────────
  /** @type {{ company_id: string, department_id: string }} */
  req.anonymizedContext = {
    company_id: req.sessionData.company_id,
    department_id: req.sessionData.department_id,
  };

  // ── Step 2: Purge PII from request body ────────────────────────────
  if (req.body && typeof req.body === 'object') {
    for (const field of BODY_PII_FIELDS) {
      if (field in req.body) {
        delete req.body[field];
      }
    }
  }

  // ── Step 3: Scrub transport-layer identity ─────────────────────────
  // Overwrite req.ip - Express derives this from the socket/proxy headers.
  // We use Object.defineProperty because req.ip is a getter on Express.
  Object.defineProperty(req, 'ip', {
    value: null,
    writable: true,
    configurable: true,
  });

  // Remove identity-bearing headers from the request object
  delete req.headers['x-forwarded-for'];
  delete req.headers['user-agent'];
  delete req.headers['x-real-ip'];
  delete req.headers['x-client-ip'];

  // ── Step 4: Remove session data to sever the identity link ─────────
  delete req.sessionData;

  // ── Step 5: Log confirmation ───────────────────────────────────────
  console.log(
    '[anonymizer] Identity stripped - company_id=%s, department_id=%s - all PII fields purged',
    req.anonymizedContext.company_id,
    req.anonymizedContext.department_id
  );

  next();
}

module.exports = {
  stripIdentity,
};
