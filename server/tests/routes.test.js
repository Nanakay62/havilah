'use strict';

import { describe, it, expect } from 'vitest';
const request = require('supertest');
const app = require('../server');

describe('HTTP Routes & Middleware Integration', () => {
  it('GET /health returns platform telemetry JSON', async () => {
    const res = await request(app).get('/health');
    expect([200, 503]).toContain(res.status);
    expect(res.body).toHaveProperty('status');
    expect(res.body).toHaveProperty('version');
    expect(res.body).toHaveProperty('timestamp');
  });

  it('GET /api/docs serves the OpenAPI specification', async () => {
    const res = await request(app).get('/api/docs/');
    expect([200, 301, 302]).toContain(res.status);
  });

  it('GET /api/v1/clinical-provider responds with configured clinical provider details', async () => {
    const res = await request(app).get('/api/v1/clinical-provider');
    expect([200, 501]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('active_provider');
      expect(res.body).toHaveProperty('occupational_health_contact');
    }
  });

  it('POST /api/v1/auth/login validates required fields', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('GET /api/v1/hr/trends rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/hr/trends');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/billing/status rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/billing/status');
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/billing/webhook accepts incoming webhook payloads', async () => {
    const res = await request(app)
      .post('/api/v1/billing/webhook')
      .send({ type: 'test.ping', data: { object: {} } });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
