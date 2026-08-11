'use strict';

const Tenant = require('../models/Tenant');

/**
 * @fileoverview Multi-tenant row-level data isolation middleware.
 *
 * Every tenant-scoped query MUST include `company_id` — these middleware
 * functions guarantee that the value is always derived from the authenticated
 * session and can never be spoofed by the client.
 *
 * Middleware:
 *   enforceTenantScope   → Extracts company_id from req.sessionData
 *   validateTenantAccess → Factory that cross-checks an extracted company_id
 */

/* ─────────────────────────────────────────────
 *  enforceTenantScope
 * ───────────────────────────────────────────── */

/**
 * Extracts `company_id` from `req.sessionData` (set by `validateSession`)
 * and attaches it to `req.tenantScope`.
 *
 * Every downstream query/aggregation MUST use `req.tenantScope.company_id`
 * to ensure strict tenant isolation.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function enforceTenantScope(req, res, next) {
  if (!req.sessionData || !req.sessionData.company_id) {
    return res.status(401).json({
      success: false,
      error: 'TENANT_SCOPE_MISSING',
      message: 'Authenticated session with company_id is required for tenant-scoped operations',
    });
  }

  /** @type {{ company_id: string }} */
  req.tenantScope = {
    company_id: req.sessionData.company_id,
  };

  next();
}

/* ─────────────────────────────────────────────
 *  validateTenantAccess
 * ───────────────────────────────────────────── */

/**
 * Factory that returns middleware verifying a request-derived company_id
 * matches the authenticated user's tenant scope.
 *
 * This prevents horizontal privilege escalation where an authenticated user
 * attempts to access another tenant's data by injecting a foreign company_id
 * into the URL, query string, or request body.
 *
 * @param {(req: import('express').Request) => string} extractCompanyId
 *   A function that extracts the company_id to validate from the request
 *   (e.g. `req => req.params.company_id` or `req => req.body.company_id`).
 * @returns {import('express').RequestHandler}
 *
 * @example
 *   router.get(
 *     '/departments/:company_id',
 *     validateSession,
 *     enforceTenantScope,
 *     validateTenantAccess(req => req.params.company_id),
 *     departmentController.list
 *   );
 */
function validateTenantAccess(extractCompanyId) {
  if (typeof extractCompanyId !== 'function') {
    throw new TypeError('validateTenantAccess requires a function that extracts company_id from the request');
  }

  /**
   * @param {import('express').Request}  req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return function validateTenantAccessMiddleware(req, res, next) {
    if (!req.tenantScope || !req.tenantScope.company_id) {
      return res.status(401).json({
        success: false,
        error: 'TENANT_SCOPE_MISSING',
        message: 'enforceTenantScope must be applied before validateTenantAccess',
      });
    }

    const requestedCompanyId = extractCompanyId(req);

    if (!requestedCompanyId) {
      return res.status(400).json({
        success: false,
        error: 'COMPANY_ID_MISSING',
        message: 'company_id could not be extracted from the request',
      });
    }

    if (requestedCompanyId !== req.tenantScope.company_id) {
      console.warn(
        `[tenantIsolation] Cross-tenant access BLOCKED — ` +
        `user company_id="${req.tenantScope.company_id}" attempted to access company_id="${requestedCompanyId}"`
      );
      return res.status(403).json({
        success: false,
        error: 'CROSS_TENANT_ACCESS_DENIED',
        message: 'You do not have permission to access resources belonging to another tenant',
      });
    }

    next();
  };
}

/* ─────────────────────────────────────────────
 *  checkTenantStatus
 * ───────────────────────────────────────────── */

/**
 * Checks the tenant's lifecycle state and access expiration.
 * Blocks API requests for suspended or expired tenants.
 * Super admins bypass this check.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function checkTenantStatus(req, res, next) {
  const company_id = req.sessionData?.company_id;
  if (!company_id) return next();

  // Super admins bypass tenant status checks
  if (req.sessionData?.isSystemSuperAdmin || req.sessionData?.role === 'super_admin') {
    return next();
  }

  try {
    const tenant = await Tenant.findOne({ company_id })
      .select('lifecycle_state locked_at access_expires_at')
      .lean();

    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Tenant not found.',
      });
    }

    // Check if tenant is suspended (locked)
    if (tenant.lifecycle_state === 'suspended') {
      return res.status(403).json({
        success: false,
        error: 'Tenant access has been suspended by Super Admin.',
        code: 'TENANT_SUSPENDED',
        action: 'FORCE_LOGOUT',
      });
    }

    // Check if tenant lifecycle is churned
    if (tenant.lifecycle_state === 'churned') {
      return res.status(403).json({
        success: false,
        error: 'This tenant account has been deactivated.',
        code: 'TENANT_CHURNED',
        action: 'FORCE_LOGOUT',
      });
    }

    // Check if access has expired
    if (tenant.access_expires_at && new Date() > new Date(tenant.access_expires_at)) {
      await Tenant.updateOne({ company_id }, { lifecycle_state: 'expired' });
      return res.status(403).json({
        success: false,
        error: 'Access expired. Please contact administrator.',
        code: 'TENANT_EXPIRED',
        action: 'FORCE_LOGOUT',
      });
    }

    // Check for expired lifecycle state
    if (tenant.lifecycle_state === 'expired') {
      return res.status(403).json({
        success: false,
        error: 'Access expired. Please contact administrator.',
        code: 'TENANT_EXPIRED',
        action: 'FORCE_LOGOUT',
      });
    }

    next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  enforceTenantScope,
  validateTenantAccess,
  checkTenantStatus,
};
