'use strict';

const Tenant = require('../models/Tenant');

const TIER_LEVELS = {
  free: 1,
  starter: 2,
  pro: 3,
  enterprise: 4,
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

module.exports = {
  requireTier,
  TIER_LEVELS,
};
