'use strict';

const express = require('express');
const router = express.Router();
const WhistleblowerReport = require('../models/WhistleblowerReport');
const Tenant = require('../models/Tenant');
const { validateSession, requireRole } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantIsolation');
const { sendWhistleblowerAlert } = require('../utils/emailService');
const { encryptField, decryptField } = require('../utils/crypto');

/**
 * Coarsen timestamp to nearest hour (strip minutes/seconds/ms)
 */
function coarsenTimestamp(date) {
  const coarsened = new Date(date);
  coarsened.setMinutes(0, 0, 0);
  return coarsened;
}

/**
 * @route   POST /api/v1/vault/submit
 * @desc    Submit an anonymous whistleblower hazard report
 * @access  Authenticated (user_id is immediately discarded)
 */
router.post('/submit', validateSession, async (req, res, next) => {
  try {
    const { category, description, urgency } = req.body;

    if (!category || !description) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Category and description are required.',
      });
    }

    if (description.length > 5000) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Description must not exceed 5000 characters.',
      });
    }

    // Extract company_id ONLY - user_id is deliberately NOT stored
    const company_id = req.sessionData.company_id;

    // Encrypt the description for at-rest privacy
    const { encrypted, iv, authTag: tag } = encryptField(description);

    // Coarsen timestamp to nearest hour
    const submitted_at = coarsenTimestamp(new Date());

    // Get company name for the alert email (non-identifying)
    const tenant = await Tenant.findOne({ company_id }).select('company_name').lean();

    const report = await WhistleblowerReport.create({
      company_id,
      category,
      description_encrypted: encrypted,
      description_iv: iv,
      description_tag: tag,
      urgency: urgency || 'standard',
      submitted_at,
    });

    // Dispatch anonymized alert to designated whistleblower email (nanakwamedickson553@gmail.com)
    const whistleblowerTargetEmail = process.env.WHISTLEBLOWER_NOTIFICATION_EMAIL || 'nanakwamedickson553@gmail.com';
    if (sendWhistleblowerAlert) {
      await sendWhistleblowerAlert({
        reportId: report.report_id,
        category,
        description,
        urgency: urgency || 'standard',
        companyName: tenant?.company_name || 'Confidential',
        to: whistleblowerTargetEmail,
      }).catch(err => console.warn('[Vault] Alert email dispatch failed:', err.message));
    } else {
      console.warn('[Vault] Alert email dispatch skipped: sendWhistleblowerAlert not available');
    }

    console.log('[Vault] Anonymous report submitted:', report.report_id);

    return res.status(201).json({
      success: true,
      report_id: report.report_id,
      message: 'Your report has been submitted anonymously. No identifying information has been stored.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/vault/reports
 * @desc    List whistleblower reports for the tenant (HR/Admin only)
 * @access  HR Admin, Tenant Admin
 */
router.get(
  '/reports',
  validateSession,
  requireRole('hr_admin', 'tenant_admin'),
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const company_id = req.tenantScope.company_id;
      const reports = await WhistleblowerReport.find({ company_id })
        .sort({ submitted_at: -1 })
        .lean();

      // Decrypt descriptions for HR view
      const decryptedReports = reports.map(report => {
        let description = '[Decryption unavailable]';
        try {
          description = decryptField({
            encrypted: report.description_encrypted,
            iv: report.description_iv,
            authTag: report.description_tag
          });
        } catch (e) {
          console.warn('[Vault] Failed to decrypt report:', report.report_id);
        }
        return {
          report_id: report.report_id,
          category: report.category,
          description,
          urgency: report.urgency,
          status: report.status,
          submitted_at: report.submitted_at,
        };
      });

      res.json({ success: true, reports: decryptedReports });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * @route   PATCH /api/v1/vault/reports/:reportId/status
 * @desc    Update a whistleblower report status
 * @access  HR Admin, Tenant Admin
 */
router.patch(
  '/reports/:reportId/status',
  validateSession,
  requireRole('hr_admin', 'tenant_admin'),
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const { status } = req.body;
      const validStatuses = ['acknowledged', 'investigating', 'resolved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        });
      }

      const report = await WhistleblowerReport.findOneAndUpdate(
        { report_id: req.params.reportId, company_id: req.tenantScope.company_id },
        { status },
        { new: true }
      );

      if (!report) {
        return res.status(404).json({ success: false, error: 'Report not found' });
      }

      res.json({ success: true, report_id: report.report_id, status: report.status });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
