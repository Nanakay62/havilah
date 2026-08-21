'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

const Report = require('../models/Report');
const Tenant = require('../models/Tenant');
const { validateSession, requireRole, superAdminGuard } = require('../middleware/auth');
const { sendWhistleblowerAlert } = require('../utils/emailService');

const jwt = require('jsonwebtoken');

/**
 * Helper: Resolve Tenant ObjectId from company_id, ObjectId string, slug, or JWT session
 */
async function resolveTenantId(req) {
  let tenantIdInput = req.body?.tenantId || req.body?.companyId || req.body?.company_id || req.query?.tenantId || req.sessionData?.company_id;

  // Extract from Bearer token if not explicitly provided in body
  if (!tenantIdInput && req.headers && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
    try {
      const token = req.headers.authorization.slice(7).trim();
      const decoded = jwt.decode(token);
      if (decoded && (decoded.companyId || decoded.company_id || decoded.tenantId || decoded.tenant_id)) {
        tenantIdInput = decoded.companyId || decoded.company_id || decoded.tenantId || decoded.tenant_id;
      }
    } catch (e) {}
  }

  if (tenantIdInput) {
    if (mongoose.Types.ObjectId.isValid(tenantIdInput)) {
      const t = await Tenant.findById(tenantIdInput).select('_id company_name company_id slug').lean();
      if (t) return t;
    }
    const tByCompanyId = await Tenant.findOne({
      $or: [
        { company_id: tenantIdInput },
        { slug: String(tenantIdInput).toLowerCase() },
        { company_name: new RegExp(`^${tenantIdInput}$`, 'i') }
      ],
    })
      .select('_id company_name company_id slug')
      .lean();
    if (tByCompanyId) return tByCompanyId;
  }

  // Fallback: Default first tenant if present
  const firstTenant = await Tenant.findOne().select('_id company_name company_id slug').lean();
  return firstTenant;
}

/**
 * @route   POST /api/v1/whistleblower/submit
 * @desc    Submit an anonymous whistleblower report with conflict-of-interest routing
 * @access  Public / Authenticated (user ID & IP are stripped for zero identity trace)
 */
router.post('/submit', async (req, res, next) => {
  try {
    const { category, description, urgency, involvesLeadershipOrHR, companyId, tenantId } = req.body;

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

    // Resolve tenant without logging employee identity
    const tenant = await resolveTenantId(req);
    if (!tenant) {
      return res.status(404).json({
        success: false,
        error: 'TENANT_NOT_FOUND',
        message: 'Unable to route report: Client organization not found.',
      });
    }

    // Generate unique Tracking Code: WBL-XXXXXX
    const randomHex = crypto.randomBytes(3).toString('hex').toUpperCase();
    const trackingCode = `WBL-${randomHex}`;

    // Generate 4-digit numeric PIN
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    const pinHash = await bcrypt.hash(pin, 10);

    const isConflict = Boolean(involvesLeadershipOrHR);

    // Create Report
    const report = await Report.create({
      trackingCode,
      pinHash,
      tenantId: tenant._id,
      category: category.trim(),
      description: description.trim(),
      urgency: ['Standard', 'Urgent', 'Critical'].includes(urgency) ? urgency : 'Standard',
      involvesLeadershipOrHR: isConflict,
      status: 'submitted',
      thread: [
        {
          sender: 'whistleblower',
          message: description.trim(),
          timestamp: new Date(),
        },
      ],
    });

    console.log(`[Whistleblower] Anonymous report filed: ${report.trackingCode} (Conflict: ${isConflict})`);

    // Respond immediately to client with tracking code & PIN
    res.status(201).json({
      success: true,
      trackingCode: report.trackingCode,
      pin,
      involvesLeadershipOrHR: isConflict,
      message: 'Your report has been submitted anonymously. Please save your Tracking Code and PIN to access updates.',
    });

    // Dispatch background email alert
    const recipientEmail = process.env.WHISTLEBLOWER_NOTIFICATION_EMAIL || 'nanakwamedickson62@gmail.com';
    if (sendWhistleblowerAlert) {
      setImmediate(async () => {
        try {
          await sendWhistleblowerAlert({
            reportId: report.trackingCode,
            to: recipientEmail,
          });
          console.log(`[Whistleblower] Zero-knowledge alert dispatched for ${report.trackingCode}`);
        } catch (mailErr) {
          console.warn('[Whistleblower] Background mail dispatch error:', mailErr.message);
        }
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/whistleblower/track
 * @desc    Anonymous Case Lookup & Thread Retrieval using Tracking Code + PIN
 * @access  Public
 */
router.post('/track', async (req, res, next) => {
  try {
    const { trackingCode, pin } = req.body;

    if (!trackingCode || !pin) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Tracking Code and PIN are required.',
      });
    }

    const cleanCode = String(trackingCode).replace(/\s+/g, '').toUpperCase();
    const cleanPin = String(pin).replace(/\s+/g, '');

    const report = await Report.findOne({ trackingCode: cleanCode });
    if (!report) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid Tracking Code or PIN.',
      });
    }

    const isPinMatch = await bcrypt.compare(cleanPin, report.pinHash);
    if (!isPinMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid Tracking Code or PIN.',
      });
    }

    res.json({
      success: true,
      data: {
        trackingCode: report.trackingCode,
        category: report.category,
        urgency: report.urgency,
        status: report.status,
        description: report.description,
        involvesLeadershipOrHR: report.involvesLeadershipOrHR,
        createdAt: report.createdAt,
        updatedAt: report.updatedAt,
        thread: report.thread || [],
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/whistleblower/reply
 * @desc    Anonymous Whistleblower Two-Way Message Reply
 * @access  Public
 */
router.post('/reply', async (req, res, next) => {
  try {
    const { trackingCode, pin, message } = req.body;

    if (!trackingCode || !pin || !message || !String(message).trim()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Tracking Code, PIN, and a non-empty message are required.',
      });
    }

    const cleanCode = String(trackingCode).replace(/\s+/g, '').toUpperCase();
    const cleanPin = String(pin).replace(/\s+/g, '');

    const report = await Report.findOne({ trackingCode: cleanCode });
    if (!report) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid Tracking Code or PIN.',
      });
    }

    const isPinMatch = await bcrypt.compare(cleanPin, report.pinHash);
    if (!isPinMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid Tracking Code or PIN.',
      });
    }

    report.thread = report.thread || [];
    report.thread.push({
      sender: 'whistleblower',
      message: String(message).trim(),
      timestamp: new Date(),
    });

    await report.save();
    console.log(`[Whistleblower] New message appended to thread: ${report.trackingCode}`);

    res.json({
      success: true,
      message: 'Anonymous message sent successfully.',
      thread: report.thread,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
