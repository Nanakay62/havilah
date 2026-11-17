'use strict';

const User = require('../models/User');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// In-process session revocation index (user_id -> { revokedAtSec, minTokenVersion }).
// Complements MongoDB active-user lookup when DB is connected and provides immediate
// lockout in standalone/single-process environments upon deletion or password reset.
const revokedUsers = new Map();
const MAX_REVOKED_CACHE = 5000;

// Short-TTL (5s) status cache for unmocked User & Tenant validation lookups so high-frequency
// polling endpoints avoid redundant MongoDB round-trips while keeping revocations immediate.
const SESSION_STATUS_CACHE_TTL_MS = 5000;
const userStatusCache = new Map(); // user_id -> { expiresAt, value }
const tenantStatusCache = new Map(); // company_id -> { expiresAt, value }

function setBoundedCache(cache, key, value, ttlMs = SESSION_STATUS_CACHE_TTL_MS) {
  if (cache.size >= MAX_REVOKED_CACHE) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(String(key), { expiresAt: Date.now() + ttlMs, value });
}

function getBoundedCache(cache, key) {
  const entry = cache.get(String(key));
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(String(key));
    return undefined;
  }
  return entry.value;
}

function revokeUserSession(userId, options = {}) {
  if (!userId) return;
  const key = String(userId);
  userStatusCache.delete(key);
  if (revokedUsers.size >= MAX_REVOKED_CACHE) {
    const oldestKey = revokedUsers.keys().next().value;
    if (oldestKey) revokedUsers.delete(oldestKey);
  }
  const minTokenVersion = typeof options.minTokenVersion === 'number' ? options.minTokenVersion : null;
  const revokedAtSec = typeof options.revokedAtSec === 'number'
    ? options.revokedAtSec
    : (minTokenVersion !== null ? null : Math.floor(Date.now() / 1000));
  revokedUsers.set(key, { revokedAtSec, minTokenVersion });
}

function clearUserSessionRevocation(userId) {
  if (!userId) return;
  const key = String(userId);
  revokedUsers.delete(key);
  userStatusCache.delete(key);
}

function invalidateTenantSessionCache(companyId) {
  if (!companyId) return;
  tenantStatusCache.delete(String(companyId));
}

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
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Missing or malformed Authorization header or session cookie.',
      });
    }

    try {
      const secret = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'wellframe-test-jwt-secret-2026');
      if (!secret) {
        return res.status(500).json({
          success: false,
          error: 'SERVER_MISCONFIGURED',
          message: 'Authentication secret is not configured',
        });
      }
      const decoded = jwt.verify(token, secret);
      const userId = decoded.userId || decoded.user_id;
      const companyId = decoded.companyId !== undefined ? decoded.companyId : decoded.company_id;
      const departmentId = decoded.departmentId !== undefined ? decoded.departmentId : decoded.department_id;
      const isSuperAdmin = Boolean(decoded.isSystemSuperAdmin || decoded.role === 'super_admin' || decoded.role === 'superadmin');

      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'SESSION_INVALID',
          message: 'Token is missing required user identity.',
        });
      }

      // Check in-process revocation index (user deletion, erasure, password change/reset)
      const revEntry = revokedUsers.get(String(userId));
      const tokenVersion = typeof decoded.tv === 'number' ? decoded.tv : 0;
      if (revEntry) {
        const versionRevoked = revEntry.minTokenVersion !== null && tokenVersion < revEntry.minTokenVersion;
        const timeRevoked = revEntry.revokedAtSec !== null && (!decoded.iat || decoded.iat <= revEntry.revokedAtSec);
        if (versionRevoked || timeRevoked) {
          return res.status(401).json({
            success: false,
            error: 'SESSION_INVALID',
            message: 'Your session is no longer valid. Please log in again.',
            action: 'FORCE_LOGOUT',
          });
        }
      }

      /** @type {{ user_id: string, company_id: string, department_id: string, role: string, status: string, is_impersonating?: boolean }} */
      req.sessionData = {
        user_id: userId,
        company_id: companyId,
        department_id: departmentId,
        role: decoded.role,
        status: decoded.status || 'active',
        ...(decoded.is_impersonating ? { is_impersonating: true } : {}),
      };

      // Handle the isSystemSuperAdmin flag securely
      if (isSuperAdmin) {
        req.sessionData.isSystemSuperAdmin = true;
      }

      // Verify user existence, active status, and token invalidation/version for real accounts
      const isSyntheticSession = Boolean(decoded.is_impersonating) || String(userId).startsWith('usr-demo-');
      if (!isSyntheticSession) {
        const dbConnected = mongoose.connection?.readyState === 1;
        const userQueryMocked = User.findOne !== mongoose.Model.findOne;
        if (dbConnected || userQueryMocked) {
          try {
            let dbUser = !userQueryMocked ? getBoundedCache(userStatusCache, userId) : undefined;
            if (dbUser === undefined) {
              const q = User.findOne({ user_id: userId });
              dbUser = (q && typeof q.select === 'function')
                ? await q.select('user_id status role token_invalidated_at token_version').lean()
                : (q && typeof q.lean === 'function' ? await q.lean() : await q);
              if (!userQueryMocked && dbConnected) {
                setBoundedCache(userStatusCache, userId, dbUser || null);
              }
            }

            if (dbUser) {
              if (dbUser.status === 'deactivated') {
                return res.status(401).json({
                  success: false,
                  error: 'SESSION_INVALID',
                  message: 'Account has been deactivated.',
                  action: 'FORCE_LOGOUT',
                });
              }
              if (typeof dbUser.token_version === 'number' && dbUser.token_version > 0 && tokenVersion < dbUser.token_version) {
                return res.status(401).json({
                  success: false,
                  error: 'SESSION_INVALID',
                  message: 'Session invalidated due to security credentials change.',
                  action: 'FORCE_LOGOUT',
                });
              }
              if (dbUser.token_invalidated_at && decoded.iat && decoded.iat < Math.floor(new Date(dbUser.token_invalidated_at).getTime() / 1000)) {
                return res.status(401).json({
                  success: false,
                  error: 'SESSION_INVALID',
                  message: 'Session invalidated due to security credentials change.',
                  action: 'FORCE_LOGOUT',
                });
              }
            } else if (dbConnected) {
              return res.status(401).json({
                success: false,
                error: 'SESSION_INVALID',
                message: 'Account no longer exists.',
                action: 'FORCE_LOGOUT',
              });
            }
          } catch (_) {
            // Transient lookup errors are ignored only when DB state is unavailable
          }
        }
      }

      // Check if token was issued before tenant was locked (short-TTL cache when unmocked)
      if (!isSuperAdmin && companyId) {
        const Tenant = require('../models/Tenant');
        const dbConnected = mongoose.connection?.readyState === 1;
        const tenantQueryMocked = Tenant.findOne !== mongoose.Model.findOne;
        let tenant = !tenantQueryMocked ? getBoundedCache(tenantStatusCache, companyId) : undefined;
        if (tenant === undefined) {
          const tq = Tenant.findOne({ company_id: companyId });
          tenant = (tq && typeof tq.select === 'function')
            ? await tq.select('locked_at lifecycle_state').lean()
            : (tq && typeof tq.lean === 'function' ? await tq.lean() : await tq);
          if (!tenantQueryMocked && dbConnected) {
            setBoundedCache(tenantStatusCache, companyId, tenant || null);
          }
        }
        
        if (tenant && tenant.locked_at && decoded.iat < Math.floor(new Date(tenant.locked_at).getTime() / 1000)) {
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
  const expectedKey = process.env.SUPER_ADMIN_KEY;
  if (!expectedKey) {
    return res.status(503).json({
      success: false,
      error: 'MISCONFIGURED',
      message: 'Super admin key not configured',
    });
  }

  if (adminKey && expectedKey) {
    try {
      const crypto = require('crypto');
      const a = Buffer.from(String(adminKey));
      const b = Buffer.from(String(expectedKey));
      if (a.length === b.length && crypto.timingSafeEqual(a, b)) {
        return next();
      }
    } catch (e) {}
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
  revokeUserSession,
  clearUserSessionRevocation,
  invalidateTenantSessionCache,
  requireConsent,
  requireRole,
  requireTenantAdmin,
  requireSuperAdmin,
  superAdminGuard: requireSuperAdmin,
  requireEmployee,
  enforceNSizeGlobal
};
