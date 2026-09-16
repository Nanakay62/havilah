'use strict';

/**
 * @fileoverview SAML 2.0 Service Provider Utility for Enterprise Multi-Tenant SSO.
 * Powered by @node-saml/node-saml.
 */

const { SAML } = require('@node-saml/node-saml');
const logger = require('./logger');

/**
 * Formats a raw base64 or single-line certificate into standard PEM format.
 * @param {string} cert
 * @returns {string}
 */
function formatPemCertificate(cert) {
  if (!cert || typeof cert !== 'string') return '';
  const trimmed = cert.trim();
  if (trimmed.includes('-----BEGIN CERTIFICATE-----')) {
    return trimmed;
  }
  // Strip out spaces, tabs, and newlines
  const clean = trimmed.replace(/\s+/g, '');
  const lines = clean.match(/.{1,64}/g) || [clean];
  return `-----BEGIN CERTIFICATE-----\n${lines.join('\n')}\n-----END CERTIFICATE-----`;
}

/**
 * Creates an instance of SAML Service Provider configured for the given tenant.
 * @param {Object} tenant - Tenant mongoose document or lean object
 * @param {import('express').Request} [req]
 * @returns {SAML}
 */
function createSamlClient(tenant, req) {
  const ssoConfig = (tenant && tenant.sso_config) || {};
  const origin = process.env.CLIENT_ORIGIN || (req ? `${req.protocol}://${req.get('host')}` : 'https://havilah.app');

  const entityId = ssoConfig.entity_id || `${origin}/api/v1/sso/metadata`;
  const callbackUrl = ssoConfig.acs_url || `${origin}/api/v1/sso/callback`;
  const entryPoint = ssoConfig.idp_login_url || ssoConfig.metadata_url;
  const dummyCert =
    '-----BEGIN CERTIFICATE-----\n' +
    'MIIC8DCCAdigAwIBAgIQBAAAAAABAAAAAEAAAAAwDQYJKoZIhvcNAQELBQAwEzERMA8G\n' +
    'A1UEAwwId2VsbGZyYW1lMB4XDTI2MDEwMTAwMDAwMFoXDTM2MDEwMTAwMDAwMFowEzER\n' +
    'MA8GA1UEAwwId2VsbGZyYW1lMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA\n' +
    '-----END CERTIFICATE-----';

  const cert = formatPemCertificate(ssoConfig.idp_certificate) || dummyCert;

  const samlConfig = {
    issuer: entityId,
    callbackUrl,
    entryPoint: entryPoint || 'https://idp.placeholder.com/sso',
    idpCert: cert,
    cert: cert,
    validateInResponseTo: false, // Supports both IdP-initiated and SP-initiated SSO
    wantAssertionsSigned: Boolean(ssoConfig.idp_certificate),
    disableRequestedAuthnContext: true, // Maximizes compatibility with Okta, Azure AD, Ping
    acceptedClockSkewMs: 60000, // 60s tolerance for clock drift between server and IdP
  };

  return new SAML(samlConfig);
}

/**
 * Generates the redirect AuthnRequest URL to the identity provider.
 * @param {Object} tenant
 * @param {string} [relayState]
 * @param {import('express').Request} [req]
 * @returns {Promise<string>}
 */
async function getAuthorizeUrl(tenant, relayState, req) {
  const saml = createSamlClient(tenant, req);
  return saml.getAuthorizeUrlAsync(relayState || tenant.company_id, req ? req.get('host') : undefined, req);
}

/**
 * Validates a SAMLResponse POST payload received from an IdP.
 * @param {Object} tenant
 * @param {string} samlResponse
 * @param {import('express').Request} [req]
 * @returns {Promise<{ profile: Object, loggedOut: boolean }>}
 */
async function validateSamlResponse(tenant, samlResponse, req) {
  const saml = createSamlClient(tenant, req);
  return saml.validatePostResponseAsync({ SAMLResponse: samlResponse });
}

/**
 * Extracts normalized email, name, and attributes from a validated SAML profile.
 * @param {Object} profile
 * @returns {{ email: string, fullName: string, nameID: string, attributes: Object }}
 */
function extractUserProfile(profile = {}) {
  const email = (
    profile.nameID ||
    profile.email ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn'] ||
    profile['urn:oid:0.9.2342.19200300.100.1.3'] || // mail OID
    ''
  ).trim().toLowerCase();

  const givenName = (
    profile.firstName ||
    profile.givenName ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
    ''
  ).trim();

  const surname = (
    profile.lastName ||
    profile.sn ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] ||
    ''
  ).trim();

  let fullName = (
    profile.displayName ||
    profile.name ||
    profile.cn ||
    profile['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name'] ||
    `${givenName} ${surname}`.trim() ||
    email.split('@')[0] ||
    'Enterprise Employee'
  ).trim();

  return {
    email,
    fullName,
    nameID: profile.nameID || email,
    attributes: profile.attributes || profile,
  };
}

/**
 * Generates XML Service Provider metadata for sharing with enterprise IdP admins.
 * @param {Object} [tenant]
 * @param {import('express').Request} [req]
 * @returns {string} XML string
 */
function generateSpMetadata(tenant, req) {
  const origin = process.env.CLIENT_ORIGIN || (req ? `${req.protocol}://${req.get('host')}` : 'https://havilah.app');
  const entityId = (tenant?.sso_config?.entity_id) || `${origin}/api/v1/sso/metadata`;
  const acsUrl = (tenant?.sso_config?.acs_url) || `${origin}/api/v1/sso/callback`;

  return `<?xml version="1.0"?>
<EntityDescriptor entityID="${entityId}" xmlns="urn:oasis:names:tc:SAML:2.0:metadata">
  <SPSSODescriptor protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST" Location="${acsUrl}" index="0" isDefault="true"/>
  </SPSSODescriptor>
</EntityDescriptor>`;
}

module.exports = {
  formatPemCertificate,
  createSamlClient,
  getAuthorizeUrl,
  validateSamlResponse,
  extractUserProfile,
  generateSpMetadata,
};
