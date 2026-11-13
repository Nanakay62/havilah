'use strict';

const request = require('supertest');
const app = require('../server');

describe('Authentication & Registration Hardening', () => {
  it('rejects employee registration with weak password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({
        email: 'test.user@example.com',
        fullName: 'Test Employee',
        password: 'weak',
        invite: 'INVITE123'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('WEAK_PASSWORD');
    expect(res.body.message).toMatch(/at least 12 characters/);
  });

  it('rejects employee activation with missing uppercase/symbol in password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/activate')
      .send({
        email: 'test.user@example.com',
        fullName: 'Test Employee',
        password: 'alllowercasepassword123',
        invite: 'INVITE123'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('WEAK_PASSWORD');
  });

  it('rejects tenant registration with weak admin password', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-tenant')
      .send({
        companyName: 'Acme Health Corp',
        fullName: 'HR Director',
        email: 'hr@acmehealth.com',
        password: 'short'
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('WEAK_PASSWORD');
  });

  it('rejects refresh token request when no token is supplied', async () => {
    const res = await request(app)
      .post('/api/v1/auth/refresh')
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('REFRESH_TOKEN_MISSING');
  });

  it('rejects account erasure when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/v1/auth/erase-account')
      .send({ password: 'SomePassword!123' });

    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('AUTHENTICATION_REQUIRED');
  });

  it('rejects verify-invite when code and email are empty or invalid', async () => {
    const res = await request(app)
      .post('/api/v1/auth/verify-invite')
      .send({ email: 'invalid-email-format' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Associated company not found');
  });

  describe('Password Reset Flow (/forgot-password & /reset-password)', () => {
    const User = require('../models/User');
    const bcrypt = require('bcryptjs');
    const { hashField } = require('../utils/crypto');

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('rejects forgot-password when email is missing', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toBe('EMAIL_REQUIRED');
    });

    it('returns non-enumerating success for unknown email on forgot-password', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValueOnce(null);

      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nobody@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });

    it('generates reset token, hashes it on user, and resets password end-to-end', async () => {
      const fakeUser = {
        user_id: '11111111-1111-4111-8111-111111111111',
        status: 'active',
        passwordHash: await bcrypt.hash('OldPassword!123', 10),
        password_reset_token_hash: null,
        password_reset_expires_at: null,
        refresh_token_hash: 'old-refresh-hash',
        refresh_token_expires_at: new Date(Date.now() + 10000),
        save: vi.fn().mockResolvedValue(true),
      };

      vi.spyOn(User, 'findOne').mockResolvedValueOnce(fakeUser);

      const forgotRes = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'pilot@example.com' });

      expect(forgotRes.status).toBe(200);
      expect(forgotRes.body.success).toBe(true);
      expect(forgotRes.body.resetToken).toBeTruthy();
      expect(fakeUser.save).toHaveBeenCalledTimes(1);
      expect(fakeUser.password_reset_token_hash).toBe(hashField(forgotRes.body.resetToken));
      expect(fakeUser.password_reset_expires_at).toBeInstanceOf(Date);

      // Now test reset-password with weak password first
      vi.spyOn(User, 'findOne').mockResolvedValueOnce(fakeUser);
      const weakRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgotRes.body.resetToken, newPassword: 'short' });
      expect(weakRes.status).toBe(400);
      expect(weakRes.body.error).toBe('WEAK_PASSWORD');

      // Now test reset-password with valid strong password
      vi.spyOn(User, 'findOne').mockResolvedValueOnce(fakeUser);
      const newPassword = 'NewStrongPassword!2026';
      const resetRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: forgotRes.body.resetToken, newPassword });

      expect(resetRes.status).toBe(200);
      expect(resetRes.body.success).toBe(true);
      expect(fakeUser.password_reset_token_hash).toBeNull();
      expect(fakeUser.password_reset_expires_at).toBeNull();
      expect(fakeUser.refresh_token_hash).toBeNull();
      expect(fakeUser.refresh_token_expires_at).toBeNull();
      expect(await bcrypt.compare(newPassword, fakeUser.passwordHash)).toBe(true);
    });

    it('rejects invalid or deactivated account tokens on reset-password', async () => {
      vi.spyOn(User, 'findOne').mockResolvedValueOnce(null);
      const missingRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid-token', newPassword: 'NewStrongPassword!2026' });
      expect(missingRes.status).toBe(400);
      expect(missingRes.body.error).toBe('INVALID_OR_EXPIRED_TOKEN');

      vi.spyOn(User, 'findOne').mockResolvedValueOnce({ status: 'deactivated' });
      const deactivatedRes = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'deactivated-token', newPassword: 'NewStrongPassword!2026' });
      expect(deactivatedRes.status).toBe(400);
      expect(deactivatedRes.body.error).toBe('INVALID_OR_EXPIRED_TOKEN');
    });
  });
});
