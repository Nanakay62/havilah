'use strict';

/**
 * @fileoverview Distributed & resilient rate limiter middleware for Wellframe / Havilah SaaS.
 * Uses Redis when REDIS_URL is provided, with seamless in-memory fallback for standalone or local environments.
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

let redisClient = null;
let redisStore = null;

if (process.env.REDIS_URL) {
  try {
    redisClient = new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 2,
      lazyConnect: true,
      enableOfflineQueue: false,
    });
    redisClient.on('error', (err) => {
      console.warn('[RateLimiter] Redis connection issue, in-memory fallback active:', err.message);
    });
    redisClient.connect().catch((err) => {
      console.warn('[RateLimiter] Redis connect note:', err.message);
    });
    redisStore = new RedisStore({
      sendCommand: (...args) => redisClient.call(...args),
    });
  } catch (err) {
    console.warn('[RateLimiter] Failed to initialize Redis store, using in-memory store:', err.message);
  }
}

/**
 * Extracts the genuine client IP address from proxy and Cloudflare headers.
 */
function getClientIp(req) {
  const cfIp = req.headers && req.headers['cf-connecting-ip'];
  if (cfIp) return cfIp.trim();

  const trueClientIp = req.headers && req.headers['true-client-ip'];
  if (trueClientIp) return trueClientIp.trim();

  const xForwarded = req.headers && req.headers['x-forwarded-for'];
  if (xForwarded && typeof xForwarded === 'string') {
    const firstIp = xForwarded.split(',')[0].trim();
    if (firstIp) return firstIp;
  }

  return req.ip || req.socket?.remoteAddress || '127.0.0.1';
}

/**
 * Sensitive endpoints rate limiter (e.g. auth routes, demo requests)
 * Limit: max attempts per window (15 mins) per unique client IP.
 */
function sensitiveRateLimiter(maxAttempts = 5) {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
    keyGenerator: (req) => getClientIp(req),
    max: (req) => {
      const ip = getClientIp(req);
      const isLocalhost = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') && process.env.NODE_ENV !== 'production';
      return isLocalhost ? Math.max(maxAttempts * 6, 30) : Math.max(maxAttempts, 15);
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const p = req.path || '';
      return p.includes('/telemetry') || p.includes('/health');
    },
    store: redisStore || undefined,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'Too many failed or repeated attempts. Please try again in 15 minutes.',
      });
    },
  });
}

/**
 * General API rate limiter across all /api/v1/ routes.
 * Limit: max 3000 requests per 15 minutes per unique client IP.
 */
function apiRateLimiter(maxRequests = 3000) {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
    keyGenerator: (req) => getClientIp(req),
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const p = req.path || '';
      if (
        p.includes('/telemetry') ||
        p.includes('/health') ||
        p.includes('/status') ||
        p.includes('/queue') ||
        p.includes('/message') ||
        p.includes('/reply') ||
        p.includes('/track') ||
        p.includes('/live') ||
        p.includes('/auth/me') ||
        p.endsWith('/me')
      ) {
        return true;
      }
      const ip = getClientIp(req);
      return (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') && process.env.NODE_ENV !== 'production';
    },
    store: redisStore || undefined,
    handler: (req, res) => {
      res.status(429).json({
        success: false,
        error: 'TOO_MANY_REQUESTS',
        message: 'API rate limit exceeded. Please slow down your requests.',
      });
    },
  });
}

module.exports = {
  sensitiveRateLimiter,
  apiRateLimiter,
};
