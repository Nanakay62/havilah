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

      const tenantData = tenant.toObject();
      tenantData.effectiveTier = tenant.getEffectiveTier();

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

module.exports = router;
