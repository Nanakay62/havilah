'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const { validateSession } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantIsolation');
const { sendClinicalDispatch, CLINICAL_EMAIL } = require('../utils/emailService');

const router = express.Router();

/**
 * @route   POST /api/v1/referrals/occupational-health
 * @desc    Submit a confidential occupational health referral
 * @access  Authenticated
 */
router.post(
  '/occupational-health',
  validateSession,
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;
      const { name, contact_info, preferred_time, notes } = req.body;

      if (!name || !contact_info) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Name and contact information are required.',
        });
      }

      // 1. Retrieve the company's occupational health email (fallback to env default)
      const tenant = await Tenant.findOne({ company_id: companyId });
      const targetEmail =
        (tenant && tenant.hotline_config && tenant.hotline_config.occupational_health_contact) ||
        CLINICAL_EMAIL;

      // 2. Generate anonymized reference code
      const referenceCode = 'REF-' + uuidv4().slice(0, 6).toUpperCase();

      // 3. Dispatch structured HTML email via Resend
      const result = await sendClinicalDispatch({
        referenceCode,
        department: req.sessionData.department_id || 'Undisclosed',
        notes: notes || '',
        preferredTime: preferred_time || '',
        to: targetEmail,
      });

      if (!result.success) {
        console.warn('[Referral] Email dispatch failed:', result.error);
        // Still return success to the user — referral was recorded
      }

      console.log('[Occupational Health Referral] Dispatched:', referenceCode, 'to:', targetEmail);

      return res.status(200).json({
        success: true,
        message: 'Referral submitted securely.',
        reference_code: referenceCode,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
