'use strict';

const request = require('supertest');
const app = require('../server');
const User = require('../models/User');
const { hashField } = require('../utils/crypto');

describe('Remediation & Production Hardening Suite', () => {
  const testEmail = 'reset.test.user@fzsafety.com';
  const testEmailHash = hashField(testEmail);

  // Mock user state
  let mockUser = {
    user_id: 'ba4040b3-d7d5-4c23-8a53-5d440ec3c999',
    company_id: 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
    email_hash: testEmailHash,
    passwordHash: '$2a$10$abcdefghijklmnopqrstuvw',
    role: 'employee',
    status: 'active',
    password_reset_token_hash: null,
    password_reset_expires_at: null,
    refresh_token_hash: 'initial-refresh-hash',
    refresh_token_expires_at: new Date(Date.now() + 86400000),
    save: async function() { return this; }
  };

  beforeEach(() => {
    mockUser.password_reset_token_hash = null;
    mockUser.password_reset_expires_at = null;
    mockUser.save = async function() { return this; };

    const Tenant = require('../models/Tenant');
    Tenant.find = () => ({
      select: () => ({
        sort: () => ({
          lean: () => Promise.resolve([])
        })
      }),
      lean: () => Promise.resolve([])
    });

    User.findOne = async (query) => {
      if (query.email_hash === testEmailHash) {
        return mockUser;
      }
      if (query.password_reset_token_hash && query.password_reset_token_hash === mockUser.password_reset_token_hash) {
        if (query.password_reset_expires_at && query.password_reset_expires_at.$gt) {
          if (mockUser.password_reset_expires_at > query.password_reset_expires_at.$gt) {
            return mockUser;
          }
        }
      }
      return null;
    };
  });

  describe('1. CORS Origin Locking', () => {
    it('allows requests from the primary Cloudflare production domain', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://havilah.dic20016.workers.dev')
        .set('Access-Control-Request-Method', 'POST');

      expect(res.headers['access-control-allow-origin']).toBe('https://havilah.dic20016.workers.dev');
      expect(res.headers['access-control-allow-credentials']).toBe('true');
    });

    it('rejects cross-origin credentials for arbitrary untrusted .workers.dev domains', async () => {
      const res = await request(app)
        .options('/api/v1/auth/login')
        .set('Origin', 'https://malicious-attacker.workers.dev')
        .set('Access-Control-Request-Method', 'POST');

      // Unauthorized origins should not be returned in access-control-allow-origin
      expect(res.headers['access-control-allow-origin']).not.toBe('https://malicious-attacker.workers.dev');
    });
  });

  describe('2. Password Reset & Account Recovery Cycle', () => {
    let capturedResetToken = null;

    it('POST /api/v1/auth/forgot-password dispatches token for existing user without leaking enumeration', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: testEmail });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('password reset link has been dispatched');

      capturedResetToken = res.body.resetToken;
      expect(capturedResetToken).toBeDefined();

      // Verify token hash and expiry set on user
      expect(mockUser.password_reset_token_hash).toBe(hashField(capturedResetToken));
      expect(mockUser.password_reset_expires_at).toBeDefined();
    });

    it('POST /api/v1/auth/forgot-password responds generically for non-existent email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nonexistent.user.999@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('password reset link has been dispatched');
    });

    it('POST /api/v1/auth/reset-password rejects invalid or forged tokens', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: 'invalid-fake-token-00000000000000000000',
          newPassword: 'BrandNewPassword123!',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('INVALID_OR_EXPIRED_TOKEN');
    });

    it('POST /api/v1/auth/reset-password rejects weak new passwords', async () => {
      // Setup active reset token on mock user
      const rawToken = 'valid-test-token-1234567890abcdef';
      mockUser.password_reset_token_hash = hashField(rawToken);
      mockUser.password_reset_expires_at = new Date(Date.now() + 3600000);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'weak',
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('WEAK_PASSWORD');
    });

    it('POST /api/v1/auth/reset-password successfully updates password and invalidates reset token', async () => {
      const rawToken = 'valid-test-token-1234567890abcdef';
      mockUser.password_reset_token_hash = hashField(rawToken);
      mockUser.password_reset_expires_at = new Date(Date.now() + 3600000);

      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({
          token: rawToken,
          newPassword: 'BrandNewSecurePassword123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('password has been reset successfully');

      // Verify reset token cleared
      expect(mockUser.password_reset_token_hash).toBeNull();
      expect(mockUser.password_reset_expires_at).toBeNull();
      // Verify refresh token cleared
      expect(mockUser.refresh_token_hash).toBeNull();
      expect(mockUser.refresh_token_expires_at).toBeNull();
      // Verify password was updated with a bcrypt hash
      expect(mockUser.passwordHash).toMatch(/^\$2[aby]\$/);
    });
  });

  describe('3. Super Admin Key Validation (Timing Safe)', () => {
    it('accepts correct X-Admin-Key', async () => {
      const adminKey = process.env.SUPER_ADMIN_KEY || 'test-super-admin-key-2026';
      const res = await request(app)
        .get('/api/v1/superadmin/tenants')
        .set('x-admin-key', adminKey);

      // Should not be forbidden
      expect(res.status).not.toBe(403);
    });

    it('rejects incorrect X-Admin-Key with 403', async () => {
      const res = await request(app)
        .get('/api/v1/superadmin/tenants')
        .set('x-admin-key', 'wrong-invalid-superadmin-key-xyz');

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('FORBIDDEN');
    });
  });

  describe('4. WebRTC Single-Port Signaling Config', () => {
    it('GET /api/v1/calls/ice-config returns valid STUN/TURN servers and signalPort', async () => {
      const res = await request(app)
        .get('/api/v1/calls/ice-config');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.iceServers)).toBe(true);
      expect(res.body.iceServers.length).toBeGreaterThanOrEqual(2);
      expect(res.body.signalPort).toBeDefined();
    });
  });
});
