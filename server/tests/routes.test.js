'use strict';

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

  it('POST /api/v1/whistleblower/submit rejects report without tenant identifier', async () => {
    const res = await request(app)
      .post('/api/v1/whistleblower/submit')
      .send({
        category: 'Safety Hazard',
        description: 'Dangerous work conditions on floor 3',
        urgency: 'Standard'
      });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('TENANT_REQUIRED');
  });

  it('propagates or generates X-Request-ID on all HTTP responses', async () => {
    const customId = 'trace-test-uuid-9999';
    const res = await request(app)
      .get('/health')
      .set('X-Request-ID', customId);

    expect(res.headers['x-request-id']).toBe(customId);
  });

  it('GET /api/v1/vault/reports rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/vault/reports');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/hr/benchmarks rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/api/v1/hr/benchmarks');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/sso/metadata serves SAML 2.0 XML metadata', async () => {
    const res = await request(app).get('/api/v1/sso/metadata');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text).toContain('EntityDescriptor');
  });

  it('GET /api/v1/sso/authorize validates required target identifier', async () => {
    const res = await request(app).get('/api/v1/sso/authorize');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('SSO_TARGET_REQUIRED');
  });
});
