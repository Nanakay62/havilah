'use strict';

require('./testConfig');
const express = require('express');
const request = require('supertest');
const {
  getClientIp,
  isCloudflareProxyIp,
  sensitiveRateLimiter,
  apiRateLimiter,
} = require('../middleware/rateLimiter');

describe('Rate Limiter & Cloudflare Proxy IP Resolution', () => {
  describe('isCloudflareProxyIp & getClientIp', () => {
    it('identifies Cloudflare Workers IPv6 and Cloudflare IPv4 proxy ranges', () => {
      expect(isCloudflareProxyIp('2a06:98c0:3600::103')).toBe(true);
      expect(isCloudflareProxyIp('172.71.10.2')).toBe(true);
      expect(isCloudflareProxyIp('104.24.10.5')).toBe(true);
      expect(isCloudflareProxyIp('197.251.10.20')).toBe(false);
      expect(isCloudflareProxyIp('8.8.8.8')).toBe(false);
    });

    it('unwraps X-Real-Client-IP and X-Forwarded-For when CF-Connecting-IP is a Cloudflare Worker egress IP', () => {
      const reqWithRealHeader = {
        headers: {
          'cf-connecting-ip': '2a06:98c0:3600::103',
          'x-real-client-ip': '197.251.10.20',
          'x-forwarded-for': '197.251.10.20, 2a06:98c0:3600::103',
        },
      };
      expect(getClientIp(reqWithRealHeader)).toBe('197.251.10.20');

      const reqWithXffOnly = {
        headers: {
          'cf-connecting-ip': '172.71.10.2',
          'x-forwarded-for': '102.176.50.30, 172.71.10.2',
        },
      };
      expect(getClientIp(reqWithXffOnly)).toBe('102.176.50.30');
    });

    it('ignores spoofed X-Real-Client-IP and X-Forwarded-For on direct non-Worker requests', () => {
      const directReq = {
        headers: {
          'cf-connecting-ip': '198.51.100.42',
          'x-real-client-ip': '1.2.3.4',
          'x-forwarded-for': '1.2.3.4',
        },
      };
      expect(getClientIp(directReq)).toBe('198.51.100.42');
    });
  });

  describe('Middleware rate limit behavior', () => {
    it('isolates rate-limit buckets per real client IP behind Cloudflare Worker', async () => {
      const app = express();
      app.set('trust proxy', 1);
      app.post('/login', sensitiveRateLimiter(5, { skipSuccessfulRequests: true }), (req, res) => {
        res.status(401).json({ success: false });
      });

      // Exhaust User A's 15-attempt bucket through the same Cloudflare Worker egress IP
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/login')
          .set('CF-Connecting-IP', '2a06:98c0:3600::103')
          .set('X-Real-Client-IP', '197.251.10.20')
          .set('X-Forwarded-For', '197.251.10.20, 2a06:98c0:3600::103');
        expect(res.status).toBe(401);
      }

      const blockedUserA = await request(app)
        .post('/login')
        .set('CF-Connecting-IP', '2a06:98c0:3600::103')
        .set('X-Real-Client-IP', '197.251.10.20')
        .set('X-Forwarded-For', '197.251.10.20, 2a06:98c0:3600::103');
      expect(blockedUserA.status).toBe(429);

      // User B through the same Worker egress IP must NOT be blocked
      const userB = await request(app)
        .post('/login')
        .set('CF-Connecting-IP', '2a06:98c0:3600::103')
        .set('X-Real-Client-IP', '102.176.50.30')
        .set('X-Forwarded-For', '102.176.50.30, 2a06:98c0:3600::103');
      expect(userB.status).toBe(401);
      expect(userB.headers['ratelimit-remaining']).toBe('14');
    });

    it('does not count successful logins against the failed-attempt budget', async () => {
      const app = express();
      app.set('trust proxy', 1);
      app.post('/login', sensitiveRateLimiter(5, { skipSuccessfulRequests: true }), (req, res) => {
        res.status(200).json({ success: true });
      });

      for (let i = 0; i < 20; i++) {
        const res = await request(app)
          .post('/login')
          .set('CF-Connecting-IP', '198.51.100.77');
        expect(res.status).toBe(200);
      }
    });

    it('skips /api/v1/auth/me in apiRateLimiter so session checks never return 429', async () => {
      const app = express();
      app.set('trust proxy', 1);
      app.use('/api/v1', apiRateLimiter(2));
      app.get('/api/v1/auth/me', (req, res) => res.json({ success: true }));
      app.get('/api/v1/other', (req, res) => res.json({ success: true }));

      for (let i = 0; i < 5; i++) {
        const meRes = await request(app)
          .get('/api/v1/auth/me')
          .set('CF-Connecting-IP', '198.51.100.88');
        expect(meRes.status).toBe(200);
        expect(meRes.headers['ratelimit-limit']).toBeUndefined();
      }
    });
  });
});
