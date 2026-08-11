'use strict';

/**
 * @fileoverview Custom in-memory rate limiter middleware for Wellframe SaaS Platform.
 * Supports sensitive endpoint rate limiting (e.g. login/register max 5 attempts/15min)
 * and general API rate limiting while excluding internal telemetry/health pings and static assets.
 */

const windowMs = 15 * 60 * 1000; // 15 minutes
const sensitiveStore = new Map();
const generalStore = new Map();

// Periodic cleanup of expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of sensitiveStore.entries()) {
    if (now > record.resetTime) sensitiveStore.delete(key);
  }
  for (const [key, record] of generalStore.entries()) {
    if (now > record.resetTime) generalStore.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Sensitive endpoints rate limiter (e.g. auth routes, demo requests)
 * Limit: max 5 requests per window (15 mins) per IP.
 */
function sensitiveRateLimiter(maxAttempts = 5) {
  return (req, res, next) => {
    // Skip health/telemetry checks
    if (req.path.includes('/telemetry') || req.path.includes('/health')) {
      return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();

    let record = sensitiveStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      sensitiveStore.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > maxAttempts) {
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many failed or repeated attempts. Please try again in 15 minutes.',
        retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

/**
 * General API rate limiter across all /api/v1/ routes.
 * Limit: max 200 requests per 15 minutes per IP.
 * Excludes health pings and telemetry.
 */
function apiRateLimiter(maxRequests = 200) {
  return (req, res, next) => {
    // Exclude telemetry and health endpoints
    if (req.path.includes('/telemetry') || req.path.includes('/health')) {
      return next();
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const key = `${ip}:general`;
    const now = Date.now();

    let record = generalStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      generalStore.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > maxRequests) {
      return res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'API rate limit exceeded. Please slow down your requests.',
        retryAfterSeconds: Math.ceil((record.resetTime - now) / 1000)
      });
    }

    next();
  };
}

module.exports = {
  sensitiveRateLimiter,
  apiRateLimiter
};
