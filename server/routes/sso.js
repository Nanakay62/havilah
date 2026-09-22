'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const { hashField, encryptField } = require('../utils/crypto');
const samlUtil = require('../utils/saml');
const logger = require('../utils/logger');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');

/**
 * GET /api/v1/sso/authorize
 * Initiates enterprise SAML 2.0 SSO authentication flow.
 * Redirects the user to the Identity Provider (Okta, Azure AD, Ping) with an AuthnRequest.
 */
router.get('/authorize', sensitiveRateLimiter(10), async (req, res, next) => {
  try {
    const { company_id, domain, redirect } = req.query;

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

    // Check tenant lifecycle state
    if (tenant.lifecycle_state === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_SUSPENDED',
        message: 'Enterprise tenant access is suspended.',
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

    // Generate SAML AuthnRequest URL
    let authUrl;
    try {
      authUrl = await samlUtil.getAuthorizeUrl(tenant, tenant.company_id, req);
    } catch (samlErr) {
      logger.warn({ err: samlErr.message }, '[SSO Authorize] Fallback to raw IdP URL');
      authUrl = idpUrl;
    }

    // Direct redirect if requested or if browser request
    if (redirect === 'true' || redirect === '1' || (req.headers.accept && req.headers.accept.includes('text/html') && !req.headers.accept.includes('application/json'))) {
      return res.redirect(authUrl);
    }

    return res.json({
      success: true,
      auth_type: 'saml2',
      idp_redirect_url: authUrl,
      relay_state: tenant.company_id,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/sso/callback
 * Assertion Consumer Service (ACS) endpoint.
 * Handles the SAMLResponse POST from Okta / Azure AD / Ping Identity.
 */
router.post('/callback', sensitiveRateLimiter(20), async (req, res, next) => {
  try {
    const samlResponse = req.body?.SAMLResponse || req.query?.SAMLResponse;
    const relayState = req.body?.RelayState || req.query?.RelayState;

    if (!samlResponse) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_SAML_RESPONSE',
        message: 'No SAMLResponse payload provided in request.',
      });
    }

    // 1. Resolve Target Tenant
    let tenant = null;
    if (relayState) {
      tenant = await Tenant.findOne({
        $or: [
          { company_id: relayState },
          { slug: relayState.toLowerCase().trim() },
          { domain: relayState.toLowerCase().trim() },
        ],
      });
    }

    // Fallback: If no RelayState provided (e.g. IdP-initiated SSO), check if there is a single active SSO tenant or extract from domain
    if (!tenant) {
      const activeSsoTenants = await Tenant.find({ 'sso_config.enabled': true }).limit(2);
      if (activeSsoTenants.length === 1) {
        tenant = activeSsoTenants[0];
      }
    }

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Unable to resolve enterprise tenant organization from RelayState or SAML assertion.',
      });
    }

    // 2. Enforce Tenant Lifecycle & Access
    if (tenant.lifecycle_state === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_SUSPENDED',
        message: 'Enterprise tenant access has been suspended.',
      });
    }
    if (tenant.lifecycle_state === 'churned') {
      return res.status(403).json({
        success: false,
        error: 'TENANT_CHURNED',
        message: 'This organization account has been deactivated.',
      });
    }
    if (tenant.lifecycle_state === 'expired' || (tenant.access_expires_at && new Date() > new Date(tenant.access_expires_at))) {
      return res.status(403).json({
        success: false,
        error: 'TENANT_EXPIRED',
        message: 'Enterprise subscription access has expired.',
      });
    }

    // 3. Validate SAML Response Signature & Integrity
    let samlResult;
    try {
      samlResult = await samlUtil.validateSamlResponse(tenant, samlResponse, req);
    } catch (valErr) {
      logger.error({ err: valErr.message, tenant: tenant.company_id }, '[SSO ACS] SAML assertion verification failed');
      return res.status(401).json({
        success: false,
        error: 'SAML_VERIFICATION_FAILED',
        message: 'Invalid, untrusted, or expired SAML assertion: ' + valErr.message,
      });
    }

    const { profile } = samlResult || {};
    if (!profile) {
      return res.status(401).json({
        success: false,
        error: 'SAML_EMPTY_PROFILE',
        message: 'SAML assertion did not yield a valid user identity profile.',
      });
    }

    // 4. Extract User Profile (Email & Display Name)
    const { email, fullName } = samlUtil.extractUserProfile(profile);

    if (!email || !email.includes('@')) {
      return res.status(400).json({
        success: false,
        error: 'SAML_EMAIL_MISSING',
        message: 'Valid employee work email address could not be identified from SAML assertion claims.',
      });
    }

    // 5. Look Up Existing User or Just-In-Time (JIT) Auto-Provision
    const emailHash = hashField(email);
    let user = await User.findOne({
      company_id: tenant.company_id,
      email_hash: emailHash,
    });

    if (user) {
      if (user.status === 'deactivated') {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_DEACTIVATED',
          message: 'Your employee account has been deactivated. Please contact your organization administrator.',
        });
      }

      user.last_login_at = new Date();
      await user.save();
    } else {
      // JIT Provisioning: Check seat limit first
      if (tenant.used_seats >= tenant.max_allowed_seats) {
        return res.status(403).json({
          success: false,
          error: 'SEAT_LIMIT_REACHED',
          message: 'Your organization has reached its allocated employee seat capacity. Please contact your HR administrator.',
        });
      }

      // Provision new user
      const { iv, encrypted, authTag } = encryptField(email);
      const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
      const dummyPassword = crypto.randomBytes(32).toString('hex') + 'Aa1!';
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(dummyPassword, salt);

      user = await User.create({
        user_id: uuidv4(),
        company_id: tenant.company_id,
        department_id: 'unassigned',
        full_name: fullName || email.split('@')[0],
        role: 'employee',
        status: 'active', // Corporate IdP authenticated identity is trusted and active
        email_encrypted,
        email_hash: emailHash,
        passwordHash,
        last_login_at: new Date(),
      });

      await Tenant.updateOne({ company_id: tenant.company_id }, { $inc: { used_seats: 1 } });
      logger.info({ userId: user.user_id, company_id: tenant.company_id }, '[SSO] JIT employee auto-provisioned successfully');
    }

    // 6. Issue Wellframe Platform JWT
    const payload = {
      userId: user.user_id,
      companyId: user.company_id || tenant.company_id,
      departmentId: user.department_id || 'unassigned',
      role: user.role || 'employee',
      status: user.status || 'active',
      isSystemSuperAdmin: user.isSystemSuperAdmin || false,
      auth_type: 'saml_sso',
    };

    const secret = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';
    const token = jwt.sign(payload, secret, {
      expiresIn: '24h',
    });

    // 7. Set Secure Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    logger.info({ userId: user.user_id, email, company_id: tenant.company_id }, '[SSO] Successful SAML authentication');

    // 8. Return Response or Redirect to Dashboard
    const wantsJson = req.headers.accept && req.headers.accept.includes('application/json') && !req.headers.accept.includes('text/html');

    if (wantsJson) {
      return res.json({
        success: true,
        token,
        user: {
          user_id: user.user_id,
          role: user.role || 'employee',
          full_name: user.full_name || fullName || email.split('@')[0],
          email: user.email || email,
        },
        redirectUrl: '/dashboard',
      });
    }

    // Default: Browser Form-POST redirect to application dashboard
    return res.redirect('/dashboard');
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/sso/metadata
 * Exposes Service Provider (SP) metadata XML for Okta / Azure AD configuration.
 */
router.get('/metadata', async (req, res, next) => {
  try {
    const { company_id, domain } = req.query;
    let tenant = null;

    if (company_id || domain) {
      const query = company_id ? { company_id } : { domain: domain.toLowerCase().trim() };
      tenant = await Tenant.findOne(query);
    }

    const xml = samlUtil.generateSpMetadata(tenant, req);

    res.set('Content-Type', 'application/xml');
    return res.send(xml);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
