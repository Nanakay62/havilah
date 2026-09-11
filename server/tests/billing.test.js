'use strict';

const request = require('supertest');
const app = require('../server');

describe('Billing & Stripe Security Controls', () => {
  it('rejects unauthenticated access to /api/v1/billing/status', async () => {
    const res = await request(app).get('/api/v1/billing/status');
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects unauthenticated access to /api/v1/billing/create-checkout-session', async () => {
    const res = await request(app)
      .post('/api/v1/billing/create-checkout-session')
      .send({ tier: 'pro' });
    expect(res.status).toBe(401);
  });

  it('rejects unauthenticated access to /api/v1/billing/customer-portal', async () => {
    const res = await request(app)
      .post('/api/v1/billing/customer-portal')
      .send({});
    expect(res.status).toBe(401);
  });

  it('handles billing webhook ping cleanly', async () => {
    const res = await request(app)
      .post('/api/v1/billing/webhook')
      .send({ type: 'test.event', data: { object: {} } });

    expect([200, 400, 503]).toContain(res.status);
    if (res.status === 200) {
      expect(res.body).toEqual({ received: true });
    }
  });
});
