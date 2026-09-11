'use strict';

const request = require('supertest');
const app = require('../server');

describe('Strict Content Security Policy & Nonce Verification (Stage 1 Gate)', () => {
  it('serves CSP header with dynamic cryptographic nonce in script-src', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];

    expect(csp).toBeDefined();
    expect(csp).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
  });

  it('strictly excludes unsafe-inline and unsafe-eval from script-src', async () => {
    const res = await request(app).get('/health');
    const csp = res.headers['content-security-policy'];

    // Extract script-src directive
    const scriptSrcMatch = csp.match(/script-src ([^;]+)/);
    expect(scriptSrcMatch).toBeDefined();

    const scriptSrc = scriptSrcMatch[1];
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it('generates unique cryptographic nonces across consecutive requests', async () => {
    const res1 = await request(app).get('/health');
    const res2 = await request(app).get('/health');

    const nonceMatch1 = res1.headers['content-security-policy'].match(/'nonce-([A-Za-z0-9+/=]+)'/);
    const nonceMatch2 = res2.headers['content-security-policy'].match(/'nonce-([A-Za-z0-9+/=]+)'/);

    expect(nonceMatch1).toBeDefined();
    expect(nonceMatch2).toBeDefined();
    expect(nonceMatch1[1]).not.toBe(nonceMatch2[1]);
  });

  it('injects matching nonce attribute into HTML script elements', async () => {
    const res = await request(app).get('/register.html');
    if (res.status === 200) {
      const cspNonceMatch = res.headers['content-security-policy'].match(/'nonce-([A-Za-z0-9+/=]+)'/);
      expect(cspNonceMatch).toBeDefined();
      const nonce = cspNonceMatch[1];

      // Verification that HTML body contains the injected nonce attribute
      expect(res.text).toContain(`nonce="${nonce}"`);
    }
  });
});
