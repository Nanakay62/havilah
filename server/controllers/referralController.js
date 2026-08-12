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
 * Helper to check if a string is a raw UUID or objectId hex string
 */
function isRawUuid(str) {
  if (typeof str !== 'string') return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str) || /^[0-9a-f]{24}$/i.test(str);
}

/**
 * Resolves a human-readable department name from UUID / code or session fallback
 */
async function resolveReadableDepartment(rawDept, companyId, sessionData) {
  let candidate = rawDept || sessionData?.department_name || sessionData?.department_id || 'General Staff';
  
  if (isRawUuid(candidate) || (typeof candidate === 'string' && candidate.length > 20)) {
    if (companyId) {
      try {
        const deptDoc = await Department.findOne({
          $or: [
            { department_id: candidate },
            { _id: candidate },
            { department_code: candidate },
            { company_id: companyId, department_id: candidate },
            { company_id: companyId, department_code: candidate }
          ]
        }).select('name').lean();
        if (deptDoc && deptDoc.name) {
          return deptDoc.name;
        }
      } catch (e) {}
    }
    return 'General Staff';
  }
  
  return candidate;
}

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

      // Fetch the authenticated user's full record for reliable name/email/department fallbacks
      let dbUser = null;
      try {
        const User = require('../models/User');
        dbUser = await User.findOne({ user_id: req.sessionData.user_id })
          .select('full_name email department_id')
          .lean();
      } catch (e) {
        console.warn('[Referral] Could not fetch user record:', e.message);
      }

      // Explicitly read all parameter aliases from req.body or fallback to authenticated session / DB user
      const patientName =
        req.body.patientName ||
        req.body.name ||
        dbUser?.full_name ||
        req.sessionData?.name ||
        req.user?.name ||
        'Not provided';

      const patientContact =
        req.body.patientContact ||
        req.body.patientEmail ||
        req.body.contact_info ||
        dbUser?.email ||
        req.sessionData?.email ||
        req.user?.email ||
        'Not provided';

      const rawDept =
        req.body.departmentName ||
        req.body.department ||
        req.sessionData?.department_name ||
        dbUser?.department_id ||
        req.sessionData?.department_id;

      const departmentName = await resolveReadableDepartment(rawDept, companyId, req.sessionData);
      const preferredTime = req.body.preferredTime || req.body.preferred_time || 'As soon as available';
      const notes = req.body.notes || 'General Clinical Consultation Intake Request';

      if (patientName === 'Not provided' && patientContact === 'Not provided') {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Patient name and contact information are required.',
        });
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
        patientName,
        patientContact,
        contactInfo: patientContact,
        departmentName,
        department: departmentName,
        notes,
        preferredTime,
        to: targetEmail,
      });

      if (!result.success) {
        console.warn('[Referral] Email dispatch failed:', result.error);
      }

      console.log('[Occupational Health Referral] Dispatched for patient:', patientName, 'Contact:', patientContact, 'Dept:', departmentName, 'Reference:', referenceCode);

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
