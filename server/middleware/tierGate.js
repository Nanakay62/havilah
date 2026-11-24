'use strict';

const Tenant = require('../models/Tenant');

const TIER_LEVELS = {
  free: 1,
  personal: 2,
  personal_annual: 2,
  starter: 2,
  pro: 3,
  enterprise: 4,
};

const INDIVIDUAL_FEATURES = {
  free: new Set(['daily_pulse', 'history', 'articles']),
  personal: new Set(['daily_pulse', 'history', 'articles', 'copsoq', 'clinical_scales', 'trends', 'pdf_export']),
};

/**
 * Middleware factory to enforce minimum subscription tier for route access.
 * 
 * Hierarchy:
 *   free: 1, starter: 2, pro: 3, enterprise: 4
 *
 * @param {'free'|'starter'|'pro'|'enterprise'} minimumTier
 * @returns {import('express').RequestHandler}
 */
function requireTier(minimumTier) {
  const requiredLevel = TIER_LEVELS[minimumTier.toLowerCase()] || 1;

  return async function tierGateMiddleware(req, res, next) {
    try {
      // SuperAdmin bypass
      if (req.sessionData && req.sessionData.isSystemSuperAdmin) {
        return next();
      }

      // Resolve company_id from session or tenantScope
      const companyId = req.sessionData?.company_id || req.tenantScope?.company_id || req.query?.company_id;

      if (!companyId) {
        return res.status(401).json({
          success: false,
          error: 'TENANT_REQUIRED',
          message: 'Tenant context is required to evaluate subscription tier.',
        });
      }

      // Find tenant
      const tenant = await Tenant.findOne({ company_id: companyId });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'Tenant organization not found.',
        });
      }

      // Resolve effective tier
      const effectiveTier = typeof tenant.getEffectiveTier === 'function' 
        ? tenant.getEffectiveTier() 
        : (tenant.effectiveTier || tenant.subscription?.tier || 'free');

      const currentLevel = TIER_LEVELS[effectiveTier.toLowerCase()] || 1;

      if (currentLevel < requiredLevel) {
        const tierName = minimumTier.charAt(0).toUpperCase() + minimumTier.slice(1);
        return res.status(403).json({
          success: false,
          error: 'TIER_UPGRADE_REQUIRED',
          message: `This feature requires a ${tierName} or higher subscription tier.`,
          currentTier: effectiveTier,
          requiredTier: minimumTier,
          upgradeUrl: '/#pricing',
        });
      }

      // Attach tenant and effectiveTier to request for downstream handlers
      req.tenant = tenant;
      req.effectiveTier = effectiveTier;

      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Enforces feature capabilities for individual accounts while leaving company routes
 * governed by their existing tier gates.
 *
 * @param {'daily_pulse'|'history'|'articles'|'copsoq'|'clinical_scales'|'trends'|'pdf_export'} featureName
 * @returns {import('express').RequestHandler}
 */
function requireFeature(featureName) {
  return async function featureGateMiddleware(req, res, next) {
    try {
      if (req.sessionData && req.sessionData.isSystemSuperAdmin) {
        return next();
      }

      const companyId = req.sessionData?.company_id || req.tenantScope?.company_id || req.query?.company_id;
      if (!companyId) {
        return res.status(401).json({
          success: false,
          error: 'TENANT_REQUIRED',
          message: 'Tenant context is required.',
        });
      }

      const tenant = await Tenant.findOne({ company_id: companyId });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'Workspace not found.',
        });
      }

      req.tenant = tenant;
      if (tenant.account_type !== 'individual') {
        return next();
      }

      const effectiveTier = typeof tenant.getEffectiveTier === 'function'
        ? tenant.getEffectiveTier()
        : (tenant.effectiveTier || tenant.subscription?.tier || 'free');
      const allowed = INDIVIDUAL_FEATURES[effectiveTier] || INDIVIDUAL_FEATURES.free;

      if (!allowed.has(featureName)) {
        return res.status(402).json({
          success: false,
          error: 'UPGRADE_REQUIRED',
          feature: featureName,
          currentTier: effectiveTier,
          requiredTier: 'personal',
          upgradeUrl: '/app/dashboard.html?open=billing',
          message: 'Upgrade to Havilah Personal (GHS 150/month or GHS 1,500/year) to access validated screening tools and exports.',
        });
      }

      req.effectiveTier = effectiveTier;
      return next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Blocks individual personal workspaces from accessing organization-only endpoints.
 *
 * @type {import('express').RequestHandler}
 */
async function requireCompanyTenant(req, res, next) {
  try {
    if (req.sessionData && (req.sessionData.isSystemSuperAdmin || req.sessionData.role === 'super_admin')) {
      return next();
    }
    if (req.sessionData?.role === 'individual') {
      return res.status(403).json({
        success: false,
        error: 'NOT_AVAILABLE_FOR_INDIVIDUALS',
        message: 'This feature is only available to organization accounts.',
      });
    }
    const companyId = req.sessionData?.company_id || req.tenantScope?.company_id;
    if (companyId) {
      const q = Tenant.findOne({ company_id: companyId });
      const tenant = (q && typeof q.select === 'function')
        ? await q.select('account_type').lean()
        : (q && typeof q.lean === 'function' ? await q.lean() : await q);
      if (tenant && tenant.account_type === 'individual') {
        return res.status(403).json({
          success: false,
          error: 'NOT_AVAILABLE_FOR_INDIVIDUALS',
          message: 'This feature is only available to organization accounts.',
        });
      }
    }
    return next();
  } catch (err) {
    next(err);
  }
}

module.exports = {
  requireTier,
  requireFeature,
  requireCompanyTenant,
  TIER_LEVELS,
  INDIVIDUAL_FEATURES,
};
