'use strict';

const express = require('express');
const Tenant = require('../models/Tenant');
const { validateSession, requireRole } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantIsolation');

const router = express.Router();

/**
 * @route   GET /api/v1/tenant/config
 * @desc    Retrieve the active tenant's configurations (hotlines, resources)
 * @access  Authenticated
 */
router.get(
  '/config',
  validateSession,
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;
      
      const tenant = await Tenant.findOne({ company_id: companyId });

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'The active tenant configuration could not be found.',
        });
      }

      const rawTenant = typeof tenant.toObject === 'function' ? tenant.toObject() : tenant;
      const effectiveTier = typeof tenant.getEffectiveTier === 'function'
        ? tenant.getEffectiveTier()
        : (rawTenant.billing_tier || 'free');

      // Project only safe, non-sensitive tenant settings (redact Paystack tokens, invoices, IdP certs, admin emails)
      const sub = rawTenant.subscription || {};
      const tenantData = {
        company_id: rawTenant.company_id,
        company_name: rawTenant.company_name,
        slug: rawTenant.slug,
        domain: rawTenant.domain,
        billing_tier: rawTenant.billing_tier,
        lifecycle_state: rawTenant.lifecycle_state,
        hotline_config: rawTenant.hotline_config || {},
        employer_support_contacts: rawTenant.employer_support_contacts || [],
        resource_links: rawTenant.resource_links || [],
        settings: rawTenant.settings || {},
        allowed_modules: rawTenant.allowed_modules || [],
        active_modules: rawTenant.active_modules || rawTenant.allowed_modules || [],
        effectiveTier,
        subscription: {
          tier: sub.tier || rawTenant.billing_tier || 'free',
          status: sub.status || 'active',
          trialEndsAt: sub.trialEndsAt || null,
          currentPeriodEnd: sub.currentPeriodEnd || rawTenant.access_expires_at || null,
          cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
          maxEmployees: sub.maxEmployees || rawTenant.max_allowed_seats || null,
        },
        sso_config: {
          enabled: Boolean(rawTenant.sso_config?.enabled),
          provider: rawTenant.sso_config?.provider || null,
        },
      };

      return res.status(200).json({
        success: true,
        data: tenantData,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   PATCH /api/v1/tenant/support-settings
 * @desc    Update the active tenant's hotline configuration
 * @access  Authenticated (hr_admin, tenant_admin)
 */
router.patch(
  '/support-settings',
  validateSession,
  enforceTenantScope,
  requireRole('hr_admin', 'tenant_admin'),
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;
      const { eap_number, crisis_number, occupational_health_contact } = req.body;

      const tenant = await Tenant.findOne({ company_id: companyId });
      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'The active tenant could not be found.',
        });
      }

      // Update hotline config
      if (eap_number !== undefined) tenant.hotline_config.eap_number = eap_number;
      if (crisis_number !== undefined) tenant.hotline_config.crisis_number = crisis_number;
      if (occupational_health_contact !== undefined) {
        tenant.hotline_config.occupational_health_contact = occupational_health_contact;
      }

      await tenant.save();

      return res.status(200).json({
        success: true,
        message: 'Support settings updated successfully.',
        data: tenant.hotline_config,
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   GET /api/v1/tenant/support-contacts
 * @desc    Retrieve the active tenant's employer-provided workplace support contacts
 * @access  Authenticated
 */
router.get(
  '/support-contacts',
  validateSession,
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;
      const tenant = await Tenant.findOne({ company_id: companyId })
        .select('company_id company_name employer_support_contacts')
        .lean();

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'The active tenant could not be found.',
        });
      }

      return res.status(200).json({
        success: true,
        employer_support_contacts: Array.isArray(tenant.employer_support_contacts)
          ? tenant.employer_support_contacts
          : [],
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
