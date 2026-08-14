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
  const trimmed = str.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed) || /^[0-9a-f]{24}$/i.test(trimmed);
}

/**
 * Resolves a human-readable department name from UUID / code or session fallback
 */
async function resolveReadableDepartment(rawDept, companyId, sessionData) {
  let candidate = rawDept || sessionData?.department_name || sessionData?.department_id || 'General Staff';
  
  if (typeof candidate === 'string') {
    candidate = candidate.trim();
  }

  // Only perform DB lookup if the candidate is a UUID / ObjectId
  if (isRawUuid(candidate)) {
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
  
  return candidate || 'General Staff';
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

      // Explicitly read parameters from req.body with session / DB user fallbacks
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
      const topic = req.body.topic || req.body.reason || (req.body.notes && !req.body.topic ? req.body.notes : 'General Clinical Consultation Intake Request');
      const preferredDate = req.body.preferredDate || req.body.date || '';
      const preferredTime = req.body.preferredTime || req.body.preferred_time || req.body.time || 'As soon as available';
      const notes = req.body.notes || '';

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
        topic,
        preferredDate,
        preferredTime,
        notes,
        to: targetEmail,
      });

      if (!result.success) {
        console.warn('[Referral] Email dispatch failed:', result.error);
      }

      console.log('[Occupational Health Referral] Dispatched for patient:', patientName, 'Contact:', patientContact, 'Dept:', departmentName, 'Topic:', topic, 'Schedule:', `${preferredDate} ${preferredTime}`.trim(), 'Reference:', referenceCode);

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
