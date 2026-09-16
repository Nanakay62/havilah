'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const samlUtil = require('../utils/saml');

describe('Enterprise SAML 2.0 SSO & ACS Pipeline', () => {
  const TEST_SECRET = process.env.JWT_SECRET || 'wellframe-super-secret-jwt-key-2026';
  const COMPANY_ID = 'e2e-saml-test-corp';
  const DOMAIN = 'acmecorp.com';

  const mockSsoTenant = {
    _id: '66e1f0a00000000000000099',
    company_id: COMPANY_ID,
    company_name: 'Acme Global Corp',
    domain: DOMAIN,
    slug: 'acme-global',
    lifecycle_state: 'active',
    used_seats: 10,
    max_allowed_seats: 100,
    billing_tier: 'enterprise',
    sso_config: {
      enabled: true,
      provider: 'Okta',
      entity_id: 'https://havilah.app/api/v1/sso/metadata',
      acs_url: 'https://havilah.app/api/v1/sso/callback',
      idp_login_url: 'https://acme.okta.com/app/wellframe/sso/saml',
      metadata_url: 'https://acme.okta.com/app/wellframe/sso/saml/metadata',
      idp_certificate: 'MIIC8DCCAdigAwIBAgIQ...',
    },
  };

  const createMockQuery = (data) => ({
    select: () => createMockQuery(data),
    sort: () => createMockQuery(data),
    lean: () => Promise.resolve(data),
    then: (resolve, reject) => Promise.resolve(data).then(resolve, reject),
  });

  describe('1. GET /api/v1/sso/metadata', () => {
    it('returns compliant Service Provider XML metadata', async () => {
      const res = await request(app).get('/api/v1/sso/metadata');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/xml/);
      expect(res.text).toContain('EntityDescriptor');
      expect(res.text).toContain('SPSSODescriptor');
      expect(res.text).toContain('/api/v1/sso/callback');
    });
  });

  describe('2. GET /api/v1/sso/authorize', () => {
    it('rejects authorization when neither company_id nor domain is provided', async () => {
      const res = await request(app).get('/api/v1/sso/authorize');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('SSO_TARGET_REQUIRED');
    });

    it('rejects when tenant organization is not found', async () => {
      const originalFindOne = Tenant.findOne;
      try {
        Tenant.findOne = () => createMockQuery(null);
        const res = await request(app).get('/api/v1/sso/authorize?domain=unknown-corp.com');
        expect(res.status).toBe(404);
        expect(res.body.error).toBe('TENANT_NOT_FOUND');
      } finally {
        Tenant.findOne = originalFindOne;
      }
    });

    it('rejects when SSO is not enabled for the organization', async () => {
      const originalFindOne = Tenant.findOne;
      try {
        Tenant.findOne = () =>
          createMockQuery({
            ...mockSsoTenant,
            sso_config: { enabled: false },
          });
        const res = await request(app).get(`/api/v1/sso/authorize?company_id=${COMPANY_ID}`);
        expect(res.status).toBe(403);
        expect(res.body.error).toBe('SSO_NOT_ENABLED');
      } finally {
        Tenant.findOne = originalFindOne;
      }
    });

    it('returns SAML AuthnRequest URL when configured properly', async () => {
      const originalFindOne = Tenant.findOne;
      try {
        Tenant.findOne = () => createMockQuery(mockSsoTenant);
        const res = await request(app).get(`/api/v1/sso/authorize?company_id=${COMPANY_ID}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.auth_type).toBe('saml2');
        expect(res.body.idp_redirect_url).toContain('acme.okta.com');
        expect(res.body.relay_state).toBe(COMPANY_ID);
      } finally {
        Tenant.findOne = originalFindOne;
      }
    });
  });

  describe('3. POST /api/v1/sso/callback (ACS Assertion Consumer Service)', () => {
    it('rejects when SAMLResponse payload is missing', async () => {
      const res = await request(app)
        .post('/api/v1/sso/callback')
        .send({ RelayState: COMPANY_ID });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_SAML_RESPONSE');
    });

    it('rejects when tenant is suspended', async () => {
      const originalFindOne = Tenant.findOne;
      try {
        Tenant.findOne = () =>
          createMockQuery({
            ...mockSsoTenant,
            lifecycle_state: 'suspended',
          });

        const res = await request(app)
          .post('/api/v1/sso/callback')
          .send({
            SAMLResponse: 'PHNhbWxwOlJlc3BvbnNlPjwvc2FtbHA6UmVzcG9uc2U+',
            RelayState: COMPANY_ID,
          });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('TENANT_SUSPENDED');
      } finally {
        Tenant.findOne = originalFindOne;
      }
    });

    it('rejects when SAML signature verification fails', async () => {
      const originalFindOne = Tenant.findOne;
      const originalValidate = samlUtil.validateSamlResponse;

      try {
        Tenant.findOne = () => createMockQuery(mockSsoTenant);
        samlUtil.validateSamlResponse = async () => {
          throw new Error('Invalid signature on SAML response');
        };

        const res = await request(app)
          .post('/api/v1/sso/callback')
          .send({
            SAMLResponse: 'tampered-saml-response-data',
            RelayState: COMPANY_ID,
          });

        expect(res.status).toBe(401);
        expect(res.body.error).toBe('SAML_VERIFICATION_FAILED');
      } finally {
        Tenant.findOne = originalFindOne;
        samlUtil.validateSamlResponse = originalValidate;
      }
    });

    it('successfully validates assertion, JIT auto-provisions user, and sets auth cookie', async () => {
      const originalTenantFindOne = Tenant.findOne;
      const originalTenantUpdateOne = Tenant.updateOne;
      const originalUserFindOne = User.findOne;
      const originalUserCreate = User.create;
      const originalValidate = samlUtil.validateSamlResponse;

      try {
        Tenant.findOne = () => createMockQuery(mockSsoTenant);
        Tenant.updateOne = async () => ({ modifiedCount: 1 });

        // User does not exist yet (triggers JIT provisioning)
        User.findOne = () => createMockQuery(null);
        User.create = async (doc) => ({
          ...doc,
          user_id: 'usr-jit-auto-provisioned-01',
          save: async () => doc,
        });

        // Mock valid SAML assertion
        samlUtil.validateSamlResponse = async () => ({
          profile: {
            nameID: 'jane.doe@acmecorp.com',
            displayName: 'Jane Doe',
            firstName: 'Jane',
            lastName: 'Doe',
            email: 'jane.doe@acmecorp.com',
          },
          loggedOut: false,
        });

        const res = await request(app)
          .post('/api/v1/sso/callback')
          .set('Accept', 'application/json')
          .send({
            SAMLResponse: 'valid-signed-saml-response',
            RelayState: COMPANY_ID,
          });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
        expect(res.body.user.email).toBe('jane.doe@acmecorp.com');
        expect(res.body.user.role).toBe('employee');

        // Check JWT payload contains correct status and company
        const decoded = jwt.verify(res.body.token, TEST_SECRET);
        expect(decoded.companyId).toBe(COMPANY_ID);
        expect(decoded.status).toBe('active');
        expect(decoded.auth_type).toBe('saml_sso');

        // Check cookie
        const cookies = res.headers['set-cookie'] || [];
        expect(cookies.some((c) => c.startsWith('token='))).toBe(true);
      } finally {
        Tenant.findOne = originalTenantFindOne;
        Tenant.updateOne = originalTenantUpdateOne;
        User.findOne = originalUserFindOne;
        User.create = originalUserCreate;
        samlUtil.validateSamlResponse = originalValidate;
      }
    });

    it('rejects JIT provisioning when tenant has reached maximum seat limit', async () => {
      const originalTenantFindOne = Tenant.findOne;
      const originalUserFindOne = User.findOne;
      const originalValidate = samlUtil.validateSamlResponse;

      try {
        Tenant.findOne = () =>
          createMockQuery({
            ...mockSsoTenant,
            used_seats: 100,
            max_allowed_seats: 100,
          });

        User.findOne = () => createMockQuery(null);

        samlUtil.validateSamlResponse = async () => ({
          profile: {
            nameID: 'new.hire@acmecorp.com',
            email: 'new.hire@acmecorp.com',
          },
        });

        const res = await request(app)
          .post('/api/v1/sso/callback')
          .set('Accept', 'application/json')
          .send({
            SAMLResponse: 'valid-saml-response',
            RelayState: COMPANY_ID,
          });

        expect(res.status).toBe(403);
        expect(res.body.error).toBe('SEAT_LIMIT_REACHED');
      } finally {
        Tenant.findOne = originalTenantFindOne;
        User.findOne = originalUserFindOne;
        samlUtil.validateSamlResponse = originalValidate;
      }
    });
  });
});
