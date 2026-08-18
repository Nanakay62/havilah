'use strict';

const express = require('express');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const Referral = require('../models/Referral');
const Assessor = require('../models/Assessor');
const { validateSession, requireRole } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantIsolation');
const { sendClinicalDispatch } = require('../utils/emailService');

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
  let candidate = rawDept || sessionData?.department_name || sessionData?.department_id || 'General';
  
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
    return 'General';
  }
  
  return candidate || 'General';
}

/**
 * @route   POST /api/v1/referrals/occupational-health
 * @desc    Submit a confidential occupational health referral
 * @access  Authenticated (Employee / Tenant User)
 */
router.post(
  '/occupational-health',
  validateSession,
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;

      // Validate required fields
      const rawPatientName = req.body.patientName || req.body.name;
      const rawPatientContact = req.body.patientContact || req.body.patientEmail || req.body.contact_info;

      if (!rawPatientName || typeof rawPatientName !== 'string' || !rawPatientName.trim() ||
          !rawPatientContact || typeof rawPatientContact !== 'string' || !rawPatientContact.trim()) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Patient name and contact information are required.',
        });
      }

      const patientName = rawPatientName.trim();
      const patientContact = rawPatientContact.trim();

      // Look up the employee's tenant and active assessor
      const tenant = await Tenant.findOne({
        $or: [
          { company_id: companyId },
          ...(mongoose.isValidObjectId(companyId) ? [{ _id: companyId }] : [])
        ]
      });

      if (!tenant) {
        return res.status(404).json({
          success: false,
          error: 'TENANT_NOT_FOUND',
          message: 'Tenant organization not found.',
        });
      }

      if (!tenant.activeAssessorId) {
        return res.status(409).json({
          success: false,
          error: 'NO_ACTIVE_ASSESSOR',
          message: 'No medical assessor is currently assigned to this company.',
        });
      }

      // Generate collision-resistant reference code
      const referenceCode = `REF-${randomUUID().slice(0, 8).toUpperCase()}`;

      const rawDept =
        req.body.departmentName ||
        req.body.department ||
        req.sessionData?.department_name ||
        req.sessionData?.department_id;

      const departmentName = await resolveReadableDepartment(rawDept, companyId, req.sessionData);
      const topic = req.body.topic || req.body.reason || (req.body.notes && !req.body.topic ? req.body.notes : 'General Clinical Consultation Intake Request');
      const preferredDate = req.body.preferredDate || req.body.date || '';
      const preferredTime = req.body.preferredTime || req.body.preferred_time || req.body.time || 'As soon as available';
      const notes = req.body.notes || '';

      const intakeNotes = notes ? (topic ? `${topic} - ${notes}` : notes) : (topic || '');

      // Save referral with assignedAssessorId stamped from tenant active assessor
      const referral = await Referral.create({
        referenceCode,
        tenantId: tenant._id,
        assignedAssessorId: tenant.activeAssessorId,
        departmentName,
        preferredTime,
        status: 'pending',
        clinicalDetails: {
          patientName,
          patientContact,
          intakeNotes,
        },
      });

      console.log('[Occupational Health Referral] Saved referral', referenceCode, 'for tenant', tenant.company_name, 'assigned to assessor', tenant.activeAssessorId);

      // Respond immediately to client after successful DB save
      res.status(200).json({
        success: true,
        message: 'Referral submitted securely to the designated medical assessor.',
        reference_code: referenceCode,
        data: {
          referenceCode,
          status: referral.status,
        },
      });

      // Background email dispatch via setImmediate()
      setImmediate(async () => {
        try {
          const assessor = await Assessor.findById(tenant.activeAssessorId).lean();
          const targetEmail = assessor?.email || process.env.CLINICAL_INTAKE_EMAIL || 'nanakwamedickson62@gmail.com';

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
            console.warn('[Referral] Background email dispatch failed:', result.error);
          } else {
            console.log('[Occupational Health Referral] Email dispatched to assessor:', targetEmail, 'for reference:', referenceCode);
          }
        } catch (dispatchErr) {
          console.warn('[Referral] Background email dispatch error:', dispatchErr.message);
        }
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   GET /api/v1/referrals/employer-billing
 * @desc    Get anonymized referral billing list for Employer / HR
 * @access  Authenticated (HR Admin / Tenant Admin / Super Admin)
 */
router.get(
  '/employer-billing',
  validateSession,
  requireRole('hr_admin', 'tenant_admin', 'super_admin'),
  async (req, res, next) => {
    try {
      const companyId = req.sessionData?.company_id;

      let query = {};
      if (companyId) {
        const tenant = await Tenant.findOne({
          $or: [
            { company_id: companyId },
            ...(mongoose.isValidObjectId(companyId) ? [{ _id: companyId }] : [])
          ]
        }).select('_id').lean();

        if (!tenant) {
          return res.status(404).json({
            success: false,
            error: 'TENANT_NOT_FOUND',
            message: 'Tenant not found.',
          });
        }
        query.tenantId = tenant._id;
      }

      // Explicitly exclude clinicalDetails and assignedAssessorId via .select()
      // HR must never receive patient-identifying fields in the response payload
      const referrals = await Referral.find(query)
        .select('referenceCode departmentName preferredTime status billing createdAt')
        .sort({ createdAt: -1 })
        .lean();

      const now = Date.now();
      const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

      const data = referrals.map((r) => {
        const createdAtMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        const isStale = r.status === 'pending' && (now - createdAtMs) > FORTY_EIGHT_HOURS_MS;
        return {
          _id: r._id,
          referenceCode: r.referenceCode,
          departmentName: r.departmentName,
          preferredTime: r.preferredTime,
          status: r.status,
          billing: {
            amount: r.billing?.amount || 0,
            currency: r.billing?.currency || 'GHS',
            isBilled: !!r.billing?.isBilled,
            billedAt: r.billing?.billedAt || null,
          },
          createdAt: r.createdAt,
          isStale: !!isStale,
        };
      });

      res.json({
        success: true,
        count: data.length,
        data,
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
