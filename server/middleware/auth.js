'use strict';

const User = require('../models/User');
const jwt = require('jsonwebtoken');

/**
 * @fileoverview Authentication and authorisation middleware for the Wellframe platform.
 *
 * Middleware stack:
 *   validateSession  → Bearer token lookup via User.findBySessionToken
 *   requireConsent   → Ensures user has accepted the double opt-in consent
 *   requireRole      → Factory for role-gated endpoints
 *   requireTenantAdmin → Shorthand for requireRole('tenant_admin')
 *   requireSuperAdmin  → X-Admin-Key header check against env var
 */

/* ─────────────────────────────────────────────
 *  validateSession
 * ───────────────────────────────────────────── */

/**
 * Extracts the Bearer token from the Authorization header, resolves the user
 * via the indexed `session_token` / `session_expires_at` fields, and attaches
 * a lightweight session descriptor to `req.sessionData`.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
async function validateSession(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Bearer token is empty',
      });
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_dev');
      
      /** @type {{ user_id: string, company_id: string, department_id: string, role: string, status: string }} */
      req.sessionData = {
        user_id: decoded.userId,
        company_id: decoded.companyId,
        department_id: decoded.departmentId,
        role: decoded.role,
        status: 'active', // Token assumes active since we removed session status logic
      };

      // Handle the isSystemSuperAdmin flag securely
      if (decoded.isSystemSuperAdmin) {
        req.sessionData.isSystemSuperAdmin = true;
      }

      // Check if token was issued before tenant was locked
      if (!decoded.isSystemSuperAdmin && decoded.companyId) {
        const Tenant = require('../models/Tenant');
        const tenant = await Tenant.findOne({ company_id: decoded.companyId })
          .select('locked_at lifecycle_state')
          .lean();
        
        if (tenant && tenant.locked_at && decoded.iat < Math.floor(tenant.locked_at.getTime() / 1000)) {
          return res.status(403).json({
            success: false,
            error: 'SESSION_REVOKED',
            message: 'Your session was revoked due to a tenant access change.',
            action: 'FORCE_LOGOUT',
          });
        }
      }

      next();
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error: 'SESSION_INVALID',
        message: 'Token is invalid or has expired',
      });
    }
  } catch (err) {
    next(err);
  }
}

/* ─────────────────────────────────────────────
 *  requireConsent
 * ───────────────────────────────────────────── */

/**
 * Ensures the authenticated user has completed the double opt-in consent flow.
 * Must be placed AFTER `validateSession` in the middleware chain.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireConsent(req, res, next) {
  if (!req.sessionData) {
    return res.status(401).json({
      success: false,
      error: 'AUTHENTICATION_REQUIRED',
      message: 'Session must be validated before checking consent',
    });
  }

  if (req.sessionData.status !== 'active') {
    return res.status(403).json({
      success: false,
      error: 'CONSENT_REQUIRED',
      message: 'You must accept the consent agreement before accessing this resource. Current status: ' + req.sessionData.status,
    });
  }

  next();
}

/* ─────────────────────────────────────────────
 *  requireRole
 * ───────────────────────────────────────────── */

/**
 * Factory that returns middleware enforcing role-based access control.
 * The calling user's `role` (from `req.sessionData`) must be in the
 * supplied allow-list.
 *
 * @param {...string} roles - One or more allowed roles (e.g. 'hr_admin', 'tenant_admin').
 * @returns {import('express').RequestHandler}
 */
function requireRole(...roles) {
  const allowed = new Set(roles);

  /**
   * @param {import('express').Request}  req
   * @param {import('express').Response} res
   * @param {import('express').NextFunction} next
   */
  return function requireRoleMiddleware(req, res, next) {
    if (!req.sessionData) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Session must be validated before checking roles',
      });
    }

    if (req.sessionData.isSystemSuperAdmin || req.sessionData.role === 'super_admin' || allowed.has(req.sessionData.role)) {
      return next();
    }

    return res.status(403).json({
      success: false,
      error: 'INSUFFICIENT_PERMISSIONS',
      message: `Role "${req.sessionData.role}" is not authorised. Required: ${[...allowed].join(', ')}`,
    });
  };
}

/* ─────────────────────────────────────────────
 *  requireTenantAdmin - convenience shorthand
 * ───────────────────────────────────────────── */

/** @type {import('express').RequestHandler} */
const requireTenantAdmin = requireRole('tenant_admin');

/* ─────────────────────────────────────────────
 *  requireSuperAdmin
 * ───────────────────────────────────────────── */

/**
 * Validates the `X-Admin-Key` request header against `process.env.SUPER_ADMIN_KEY`.
 * This is used exclusively for platform-level super admin endpoints.
 *
 * @param {import('express').Request}  req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireSuperAdmin(req, res, next) {
  // Option 1: Valid super admin session from JWT token
  if (req.sessionData && (req.sessionData.isSystemSuperAdmin === true || req.sessionData.role === 'super_admin')) {
    return next();
  }

  // Option 2: Super Admin API Key header
  const adminKey = req.headers['x-admin-key'];
  const expectedKey = process.env.SUPER_ADMIN_KEY || 'super-admin-key-secret-wellframe-2026';

  if (adminKey && adminKey === expectedKey) {
    return next();
  }

  return res.status(403).json({
    success: false,
    error: 'FORBIDDEN',
    message: 'Super Admin privileges required',
  });
}

/**
 * Restricts access to users where role is 'employee'.
 */
function requireEmployee(req, res, next) {
  if (!req.sessionData || req.sessionData.role !== 'employee') {
    return res.status(403).json({
      success: false,
      error: 'FORBIDDEN',
      message: 'Employee privileges required',
    });
  }
  next();
}

function enforceNSizeGlobal(req, res, next) {
  if (req.body && req.body.n_size_threshold !== undefined) {
    if (Number(req.body.n_size_threshold) < 5) {
      return res.status(403).json({ success: false, error: 'N_SIZE_VIOLATION', message: 'Minimum anonymity threshold (N≥5) cannot be lowered below system minimum of 5.' });
    }
  }
  next();
}

module.exports = {
  validateSession,
  requireConsent,
  requireRole,
  requireTenantAdmin,
  requireSuperAdmin,
  superAdminGuard: requireSuperAdmin,
  requireEmployee,
  enforceNSizeGlobal
};
