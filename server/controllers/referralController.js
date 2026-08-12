'use strict';

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
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

      // Resolve human-readable department name
      let departmentName = req.sessionData.department_name || req.sessionData.department_id || 'Product & Engineering';
      const rawDeptId = req.sessionData.department_id;
      if (rawDeptId && rawDeptId.length > 5) {
        try {
          const deptDoc = await Department.findOne({
            $or: [
              { _id: rawDeptId },
              { department_code: rawDeptId },
              { company_id: companyId, department_code: rawDeptId }
            ]
          }).select('name').lean();
          if (deptDoc && deptDoc.name) {
            departmentName = deptDoc.name;
          }
        } catch (e) {}
      }

      // 1. Retrieve the designated clinical intake email (nanakwamedickson62@gmail.com)
      const targetEmail =
        process.env.CLINICAL_INTAKE_EMAIL ||
        'nanakwamedickson62@gmail.com';

      // 2. Generate anonymized reference code
      const referenceCode = 'REF-' + uuidv4().slice(0, 6).toUpperCase();

      // 3. Dispatch structured HTML email via Nodemailer
      const result = await sendClinicalDispatch({
        referenceCode,
        patientName: name,
        contactInfo: contact_info,
        department: departmentName,
        notes: notes || '',
        preferredTime: preferred_time || '',
        to: targetEmail,
      });

      if (!result.success) {
        console.warn('[Referral] Email dispatch failed:', result.error);
      }

      console.log('[Occupational Health Referral] Dispatched for patient:', name, 'Reference:', referenceCode, 'to:', targetEmail);

      return res.status(200).json({
        success: true,
        message: 'Referral submitted securely to FZ Safety & Health.',
        reference_code: referenceCode,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
