'use strict';

/**
 * @fileoverview Distributed & resilient rate limiter middleware for Wellframe / Havilah SaaS.
 * Uses Redis when REDIS_URL is provided, with seamless in-memory fallback for standalone or local environments.
 */

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const Redis = require('ioredis');

let redisClient = null;
let limiterCounter = 0;

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
  } catch (err) {
    console.warn('[RateLimiter] Failed to initialize Redis client, using in-memory store:', err.message);
  }
}

/**
 * Creates a dedicated RedisStore with a unique prefix per limiter instance
 * (required by express-rate-limit v8 to avoid ERR_ERL_STORE_REUSE and key collisions).
 */
function createRedisStore(prefix) {
  if (!redisClient) return undefined;
  return new RedisStore({
    prefix,
    sendCommand: (...args) => redisClient.call(...args),
  });
}

// Cloudflare IPv4 CIDRs and IPv6 prefixes (including Workers egress 2a06:98c0::/29)
const CLOUDFLARE_IPV4_CIDRS = [
  ['173.245.48.0', 20],
  ['103.21.244.0', 22],
  ['103.22.200.0', 22],
  ['103.31.4.0', 22],
  ['141.101.64.0', 18],
  ['108.162.192.0', 18],
  ['190.93.240.0', 20],
  ['188.114.96.0', 20],
  ['197.234.240.0', 22],
  ['198.41.128.0', 17],
  ['162.158.0.0', 15],
  ['104.16.0.0', 13],
  ['104.24.0.0', 14],
  ['172.64.0.0', 13],
  ['131.0.72.0', 22],
];

const CLOUDFLARE_IPV6_PREFIXES = [
  '2a06:98c0:',
  '2606:4700:',
  '2803:f800:',
  '2405:b500:',
  '2405:8100:',
  '2c0f:f248:',
  '2400:cb00:',
];

function normalizeIp(rawIp) {
  if (!rawIp || typeof rawIp !== 'string') return '';
  let ip = rawIp.trim();
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  return ip;
}

function ipv4ToInt(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let num = 0;
  for (const part of parts) {
    if (!/^\d+$/.test(part)) return null;
    const oct = Number(part);
    if (oct < 0 || oct > 255) return null;
    num = (num << 8) | oct;
  }
  return num >>> 0;
}

/**
 * Checks whether an IP belongs to Cloudflare's proxy / Workers egress ranges.
 * When our Cloudflare Worker proxies to Render (also behind Cloudflare), Cloudflare
 * overwrites CF-Connecting-IP with the Worker's egress IP rather than the visitor's IP.
 */
function isCloudflareProxyIp(rawIp) {
  const ip = normalizeIp(rawIp).toLowerCase();
  if (!ip) return false;

  if (ip.includes(':')) {
    return CLOUDFLARE_IPV6_PREFIXES.some((prefix) => ip.startsWith(prefix));
  }

  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;

  return CLOUDFLARE_IPV4_CIDRS.some(([base, bits]) => {
    const baseInt = ipv4ToInt(base);
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (baseInt & mask);
  });
}

function firstNonCloudflareIp(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') return '';
  const candidates = headerValue.split(',').map(normalizeIp).filter(Boolean);
  return candidates.find((ip) => !isCloudflareProxyIp(ip)) || candidates[0] || '';
}

/**
 * Extracts the genuine client IP address from proxy and Cloudflare headers.
 */
function getClientIp(req) {
  const headers = (req && req.headers) || {};

  // 1. Trusted Worker secret (when configured in both Worker and Render env)
  const workerSecret = process.env.WORKER_PROXY_SECRET;
  if (workerSecret && headers['x-worker-secret'] === workerSecret) {
    const realIp = normalizeIp(headers['x-real-client-ip']);
    if (realIp) return realIp;
    const xffIp = firstNonCloudflareIp(headers['x-forwarded-for']);
    if (xffIp) return xffIp;
  }

  // 2. CF-Connecting-IP: authoritative for direct requests, but overwritten with Worker
  // egress IP on Worker -> Cloudflare-proxied Render hops. Unwrap forwarded visitor IP then.
  const cfIp = normalizeIp(headers['cf-connecting-ip']);
  if (cfIp) {
    if (!isCloudflareProxyIp(cfIp)) {
      return cfIp;
    }
    const realIp = normalizeIp(headers['x-real-client-ip']);
    if (realIp && !isCloudflareProxyIp(realIp)) {
      return realIp;
    }
    const xffIp = firstNonCloudflareIp(headers['x-forwarded-for']);
    if (xffIp && !isCloudflareProxyIp(xffIp)) {
      return xffIp;
    }
    return cfIp;
  }

  const trueClientIp = normalizeIp(headers['true-client-ip']);
  if (trueClientIp) return trueClientIp;

  const realIp = normalizeIp(headers['x-real-client-ip']);
  if (realIp) return realIp;

  const xffIp = firstNonCloudflareIp(headers['x-forwarded-for']);
  if (xffIp) return xffIp;

  return normalizeIp(req?.ip || req?.socket?.remoteAddress) || '127.0.0.1';
}

/**
 * Sensitive endpoints rate limiter (e.g. auth routes, demo requests)
 * Limit: max attempts per window (15 mins) per unique client IP.
 */
function sensitiveRateLimiter(maxAttempts = 5, options = {}) {
  const windowMs = 15 * 60 * 1000;
  const prefix = options.prefix || `rl:sensitive:${++limiterCounter}:`;
  return rateLimit({
    windowMs,
    keyGenerator: (req) => getClientIp(req),
    max: (req) => {
      const ip = getClientIp(req);
      const isLocalhost = (ip === '127.0.0.1' || ip === '::1') && process.env.NODE_ENV !== 'production';
      return isLocalhost ? Math.max(maxAttempts * 6, 30) : Math.max(maxAttempts, 15);
    },
    skipSuccessfulRequests: Boolean(options.skipSuccessfulRequests),
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
    skip: (req) => {
      const p = req.path || '';
      return p.includes('/telemetry') || p.includes('/health');
    },
    store: createRedisStore(prefix),
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
  const prefix = `rl:api:${++limiterCounter}:`;
  return rateLimit({
    windowMs,
    keyGenerator: (req) => getClientIp(req),
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    passOnStoreError: true,
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
      return (ip === '127.0.0.1' || ip === '::1') && process.env.NODE_ENV !== 'production';
    },
    store: createRedisStore(prefix),
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
  getClientIp,
  isCloudflareProxyIp,
};
