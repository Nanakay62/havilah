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
});
