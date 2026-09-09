'use strict';

import { describe, it, expect } from 'vitest';
const { enforceTenantScope } = require('../middleware/tenantIsolation');
const { enforceNSizeGlobal } = require('../middleware/auth');

describe('Multi-Tenant Isolation & Privacy Safeguards', () => {
  it('enforceTenantScope rejects requests without authenticated sessionData', () => {
    const req = { query: { company_id: 'malicious-injected-id' } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (code) => {
        statusSent = code;
        return {
          json: (data) => { jsonSent = data; },
        };
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    enforceTenantScope(req, res, next);

    expect(nextCalled).toBe(false);
    expect(statusSent).toBe(401);
    expect(jsonSent.error).toBe('TENANT_SCOPE_MISSING');
  });

  it('enforceTenantScope binds tenantScope strictly to sessionData.company_id and ignores query/body params', () => {
    const req = {
      sessionData: { company_id: 'real-tenant-uuid-123' },
      query: { company_id: 'attacker-uuid-999' },
      body: { company_id: 'attacker-uuid-999' },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const res = {};

    enforceTenantScope(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.tenantScope).toBeDefined();
    expect(req.tenantScope.company_id).toBe('real-tenant-uuid-123');
    expect(req.tenantScope.company_id).not.toBe('attacker-uuid-999');
  });

  it('enforceNSizeGlobal blocks attempts to lower anonymity threshold below 5', () => {
    const req = { body: { n_size_threshold: 2 } };
    let statusSent = null;
    let jsonSent = null;
    const res = {
      status: (code) => {
        statusSent = code;
        return {
          json: (data) => { jsonSent = data; },
        };
      },
    };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    enforceNSizeGlobal(req, res, next);

    expect(nextCalled).toBe(false);
    expect(statusSent).toBe(403);
    expect(jsonSent.error).toBe('N_SIZE_VIOLATION');
  });

  it('enforceNSizeGlobal allows requests with threshold >= 5', () => {
    const req = { body: { n_size_threshold: 10 } };
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    enforceNSizeGlobal(req, {}, next);

    expect(nextCalled).toBe(true);
  });
});
