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
 * Sensitive endpoints rate limiter (e.g. auth routes, demo requests)
 * Limit: max 5 requests per window (15 mins) per IP.
 */
function sensitiveRateLimiter(maxAttempts = 5) {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
    max: (req) => {
      const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
      const isLocalhost = (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') && process.env.NODE_ENV !== 'production';
      return isLocalhost ? Math.max(maxAttempts * 6, 30) : maxAttempts;
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
 * Limit: max 3000 requests per 15 minutes per IP.
 */
function apiRateLimiter(maxRequests = 3000) {
  const windowMs = 15 * 60 * 1000;
  return rateLimit({
    windowMs,
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
        p.includes('/live')
      ) {
        return true;
      }
      const ip = req.ip || req.socket?.remoteAddress || '127.0.0.1';
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
