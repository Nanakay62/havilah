'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { hashField } = require('../utils/crypto');
const logger = require('../utils/logger');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');

/**
 * GET /api/v1/sso/authorize
 * Initiates enterprise SAML 2.0 / OIDC SSO authentication flow.
 */
router.get('/authorize', sensitiveRateLimiter(10), async (req, res, next) => {
  try {
    const { company_id, domain } = req.query;

    if (!company_id && !domain) {
      return res.status(400).json({
        success: false,
        error: 'SSO_TARGET_REQUIRED',
        message: 'Either company_id or enterprise corporate domain must be provided.',
      });
    }

    const query = company_id ? { company_id } : { domain: domain.toLowerCase().trim() };
    const tenant = await Tenant.findOne(query);

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Enterprise organization was not found.',
      });
    }

    const ssoConfig = tenant.sso_config || {};
    if (!ssoConfig.enabled) {
      return res.status(403).json({
        success: false,
        error: 'SSO_NOT_ENABLED',
        message: 'Single Sign-On is not enabled for this organization.',
      });
    }

    const idpUrl = ssoConfig.idp_login_url || ssoConfig.metadata_url;
    if (!idpUrl) {
      return res.status(501).json({
        success: false,
        error: 'SSO_IDP_UNCONFIGURED',
        message: 'Enterprise Identity Provider URL is not yet configured by the administrator.',
      });
    }

    return res.json({
      success: true,
      auth_type: 'saml2',
      idp_redirect_url: idpUrl,
      relay_state: tenant.company_id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/sso/metadata
 * Exposes Service Provider (SP) metadata XML for Okta / Azure AD configuration.
 */
router.get('/metadata', (req, res) => {
  const entityId = `${process.env.CLIENT_ORIGIN || 'https://havilah.app'}/api/v1/sso/metadata`;
  const acsUrl = `${process.env.CLIENT_ORIGIN || 'https://havilah.app'}/api/v1/sso/callback`;

  const xml = `<?xml version="1.0"?>
<EntityDescriptor entityID="${entityId}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;

  res.set('Content-Type', 'application/xml');
  return res.send(xml);
});

module.exports = router;
