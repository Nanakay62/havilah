'use strict';

/**
 * @fileoverview Middleware to sanitize request parameters and body to mitigate OWASP NoSQL Injection & XSS vulnerabilities.
 */

function sanitizeValue(value) {
  if (typeof value === 'string') {
    // Strip script tags and potential script injections
    return value
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '');
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const cleanObj = {};
    for (const key of Object.keys(value)) {
      // Prevent NoSQL operator injection (e.g. $gt, $ne, $where)
      if (key.startsWith('$')) {
        continue;
      }
      cleanObj[key] = sanitizeValue(value[key]);
    }
    return cleanObj;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  return value;
}

/**
 * Express middleware that recursively sanitizes req.body, req.query, and req.params.
 */
function inputSanitizer(req, res, next) {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeValue(req.body);
  }
  if (req.query && typeof req.query === 'object') {
    req.query = sanitizeValue(req.query);
  }
  if (req.params && typeof req.params === 'object') {
    req.params = sanitizeValue(req.params);
  }
  next();
}

module.exports = inputSanitizer;
