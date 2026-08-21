'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Assessor = require('../models/Assessor');
const Referral = require('../models/Referral');
const { requireAssessorAuth } = require('../middleware/assessorAuth');

const router = express.Router();

/**
 * @route   POST /api/v1/assessor/login
 * @desc    Assessor Portal Login (Separate structurally distinct JWT)
 * @access  Public
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Email and password are required.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();
    const assessor = await Assessor.findOne({ email: cleanEmail });

    if (!assessor) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    if (!assessor.active) {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DEACTIVATED',
        message: 'Your assessor account is inactive. Please contact support.',
      });
    }

    const isMatch = await bcrypt.compare(password, assessor.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }

    // Issue JWT with assessor-specific payload (structurally distinct from employee/tenant tokens)
    const token = jwt.sign(
      {
        assessorId: assessor._id.toString(),
        email: assessor.email,
        name: assessor.name,
        role: 'assessor',
      },
      process.env.JWT_SECRET || 'fallback_secret_for_dev',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      token,
      assessor: {
        id: assessor._id,
        name: assessor.name,
        email: assessor.email,
        organization: assessor.organization,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/assessor/me
 * @desc    Get logged in assessor profile summary
 * @access  Assessor Authenticated
 */
router.get('/me', requireAssessorAuth, async (req, res) => {
  res.json({
    success: true,
    assessor: {
      id: req.assessor._id,
      name: req.assessor.name,
      email: req.assessor.email,
      organization: req.assessor.organization,
      phone: req.assessor.phone,
      notificationEmail: req.assessor.notificationEmail,
      address: req.assessor.address,
      billingSettings: req.assessor.billingSettings || {
        defaultRate: 450,
        defaultCurrency: 'GHS',
        taxId: '',
        taxRate: 0,
        paymentInstructions: '',
      },
    },
  });
});

/**
 * @route   GET /api/v1/assessor/profile
 * @desc    Get full assessor clinic profile and billing settings
 * @access  Assessor Authenticated
 */
router.get('/profile', requireAssessorAuth, async (req, res, next) => {
  try {
    const assessor = await Assessor.findById(req.assessor._id).select('-passwordHash').lean();
    if (!assessor) {
      return res.status(404).json({ success: false, error: 'Assessor not found' });
    }
    res.json({
      success: true,
      data: assessor,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PUT /api/v1/assessor/profile
 * @desc    Update assessor clinic profile and billing settings
 * @access  Assessor Authenticated
 */
router.put('/profile', requireAssessorAuth, async (req, res, next) => {
  try {
    const { name, organization, phone, notificationEmail, address, billingSettings } = req.body;
    const assessor = await Assessor.findById(req.assessor._id);
    if (!assessor) {
      return res.status(404).json({ success: false, error: 'Assessor not found' });
    }

    if (name && typeof name === 'string') assessor.name = name.trim();
    if (organization !== undefined) assessor.organization = String(organization).trim();
    if (phone !== undefined) assessor.phone = String(phone).trim();
    if (notificationEmail !== undefined) assessor.notificationEmail = String(notificationEmail).trim().toLowerCase();
    if (address !== undefined) assessor.address = String(address).trim();

    if (billingSettings && typeof billingSettings === 'object') {
      assessor.billingSettings = assessor.billingSettings || {};
      if (billingSettings.defaultRate !== undefined && !isNaN(Number(billingSettings.defaultRate))) {
        assessor.billingSettings.defaultRate = Math.max(0, Number(billingSettings.defaultRate));
      }
      if (billingSettings.defaultCurrency) {
        assessor.billingSettings.defaultCurrency = String(billingSettings.defaultCurrency).trim().toUpperCase();
      }
      if (billingSettings.taxId !== undefined) {
        assessor.billingSettings.taxId = String(billingSettings.taxId).trim();
      }
      if (billingSettings.taxRate !== undefined && !isNaN(Number(billingSettings.taxRate))) {
        assessor.billingSettings.taxRate = Math.max(0, Number(billingSettings.taxRate));
      }
      if (billingSettings.paymentInstructions !== undefined) {
        assessor.billingSettings.paymentInstructions = String(billingSettings.paymentInstructions).trim();
      }
    }

    await assessor.save();

    res.json({
      success: true,
      message: 'Clinic profile and billing preferences updated.',
      data: {
        id: assessor._id,
        name: assessor.name,
        email: assessor.email,
        organization: assessor.organization,
        phone: assessor.phone,
        notificationEmail: assessor.notificationEmail,
        address: assessor.address,
        billingSettings: assessor.billingSettings,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/assessor/queue
 * @desc    Get clinical referral queue with search, date range, settlement, and pagination
 * @access  Assessor Authenticated
 */
router.get('/queue', requireAssessorAuth, async (req, res, next) => {
  try {
    const query = { assignedAssessorId: req.assessor._id };

    if (req.query.tenantId && req.query.tenantId !== 'all') {
      query.tenantId = req.query.tenantId;
    }

    if (req.query.status && req.query.status !== 'all') {
      query.status = req.query.status;
    }

    if (req.query.settlementStatus && req.query.settlementStatus !== 'all') {
      query['billing.settlementStatus'] = req.query.settlementStatus;
    }

    // Date range filter (createdAt)
    if (req.query.startDate || req.query.endDate) {
      query.createdAt = {};
      if (req.query.startDate) {
        query.createdAt.$gte = new Date(req.query.startDate);
      }
      if (req.query.endDate) {
        const end = new Date(req.query.endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }

    // Search query filter
    if (req.query.search && req.query.search.trim()) {
      const s = req.query.search.trim();
      const regex = new RegExp(s, 'i');
      query.$or = [
        { referenceCode: regex },
        { departmentName: regex },
        { 'clinicalDetails.patientName': regex },
        { 'clinicalDetails.patientContact': regex },
      ];
    }

    const totalCount = await Referral.countDocuments(query);

    let queryExec = Referral.find(query)
      .populate('tenantId', 'company_name company_id slug domain')
      .sort({ createdAt: -1 });

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10);
    if (limit && limit > 0) {
      queryExec = queryExec.skip((page - 1) * limit).limit(limit);
    }

    const referrals = await queryExec.lean();

    const now = Date.now();
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

    const data = referrals.map((r) => {
      const createdAtMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
      const isStale = r.status === 'pending' && (now - createdAtMs) > FORTY_EIGHT_HOURS_MS;
      return {
        ...r,
        isStale: !!isStale,
      };
    });

    res.json({
      success: true,
      count: data.length,
      totalCount,
      page: limit ? page : 1,
      totalPages: limit ? Math.ceil(totalCount / limit) : 1,
      data,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/schedule
 * @desc    Direct appointment scheduling / stamping with optional Telehealth meeting link
 * @access  Assessor Authenticated
 */
router.patch('/referrals/:id/schedule', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const { scheduledDate, scheduledTime, scheduledAt, appointmentNotes, meetingLink } = req.body;

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral case not found.' });
    }

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    if (!scheduledDate && !scheduledAt) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Scheduled date is required.' });
    }

    let combinedDateTime;
    if (scheduledAt) {
      combinedDateTime = new Date(scheduledAt);
    } else {
      combinedDateTime = scheduledTime ? new Date(`${scheduledDate}T${scheduledTime}`) : new Date(scheduledDate);
    }

    referral.scheduledAt = combinedDateTime;
    if (appointmentNotes !== undefined) {
      referral.appointmentNotes = String(appointmentNotes).trim();
    }
    if (meetingLink !== undefined) {
      referral.clinicalDetails = referral.clinicalDetails || {};
      referral.clinicalDetails.meetingLink = String(meetingLink).trim();
    }
    referral.status = 'scheduled';

    await referral.save();
    console.log(`[Assessor] Referral ${referral.referenceCode} scheduled for ${referral.scheduledAt}, meetingLink: ${referral.clinicalDetails?.meetingLink}`);

    res.json({
      success: true,
      message: 'Consultation appointment scheduled successfully.',
      data: referral,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/assessor/referrals/:id/message
 * @desc    Assessor sends two-way clinical dialogue message to patient/employee
 * @access  Assessor Authenticated
 */
router.post('/referrals/:id/message', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const { message } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Message content is required.',
      });
    }

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral case not found.' });
    }

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    const newMsg = {
      sender: 'assessor',
      senderName: req.assessor.name || 'Medical Assessor',
      message: message.trim(),
      timestamp: new Date(),
    };

    referral.thread = referral.thread || [];
    referral.thread.push(newMsg);
    await referral.save();

    console.log(`[Assessor] Message added to thread for referral ${referral.referenceCode} by ${newMsg.senderName}`);

    res.json({
      success: true,
      message: 'Message dispatched successfully.',
      thread: referral.thread,
      data: {
        thread: referral.thread,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/settlement
 * @desc    Toggle or update settlement status (pending_payment vs settled)
 * @access  Assessor Authenticated
 */
router.patch('/referrals/:id/settlement', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const { settlementStatus } = req.body;

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral case not found.' });
    }

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    if (!['unbilled', 'pending_payment', 'settled'].includes(settlementStatus)) {
      return res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Invalid settlement status.' });
    }

    referral.billing = referral.billing || {};
    referral.billing.settlementStatus = settlementStatus;
    referral.billing.settledAt = settlementStatus === 'settled' ? new Date() : null;

    await referral.save();
    console.log(`[Assessor] Referral ${referral.referenceCode} settlement status updated to: ${settlementStatus}`);

    res.json({
      success: true,
      message: `Settlement status updated to ${settlementStatus}.`,
      data: referral,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/assessor/referrals/:id/attachments
 * @desc    Upload confidential clinical document attachment (certificate, medical report)
 * @access  Assessor Authenticated
 */
router.post('/referrals/:id/attachments', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const { fileName, fileData, fileType, fileSize } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'File name and file data are required.' });
    }

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral case not found.' });
    }

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    referral.clinicalDetails = referral.clinicalDetails || {};
    referral.clinicalDetails.attachments = referral.clinicalDetails.attachments || [];

    const attachmentObj = {
      fileName: fileName.trim(),
      fileData,
      fileType: fileType || 'application/octet-stream',
      fileSize: fileSize || 0,
      uploadedAt: new Date(),
    };

    referral.clinicalDetails.attachments.push(attachmentObj);
    await referral.save();

    console.log(`[Assessor] Attached document "${fileName}" to referral ${referral.referenceCode}`);

    res.json({
      success: true,
      message: 'Document attached successfully.',
      data: referral.clinicalDetails.attachments,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/complete
 * @desc    Complete a referral case, apply billing amount, clinical notes, and optional attachments
 * @access  Assessor Authenticated
 */
router.patch('/referrals/:id/complete', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({
        success: false,
        error: 'REFERRAL_NOT_FOUND',
        message: 'Referral case not found.',
      });
    }

    // Verify this case belongs to the authenticated assessor
    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'You can only complete cases assigned to your assessor account.',
      });
    }

    // Validate billing amount is a non-negative number
    const rawAmount = req.body.amount;
    const amount = Number(rawAmount);

    if (rawAmount === undefined || rawAmount === null || isNaN(amount) || amount < 0) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_AMOUNT',
        message: 'Billing amount must be a non-negative number.',
      });
    }

    // Update referral
    referral.status = 'completed';
    referral.billing = referral.billing || {};
    referral.billing.amount = amount;
    referral.billing.isBilled = true;
    referral.billing.billedAt = new Date();
    referral.billing.settlementStatus = 'pending_payment';

    if (req.body.currency && typeof req.body.currency === 'string') {
      referral.billing.currency = req.body.currency.trim().toUpperCase();
    }

    referral.clinicalDetails = referral.clinicalDetails || {};
    referral.clinicalDetails.completedAt = new Date();

    if (req.body.assessorNotes !== undefined && typeof req.body.assessorNotes === 'string') {
      referral.clinicalDetails.assessorNotes = req.body.assessorNotes.trim();
    } else if (req.body.notes !== undefined && typeof req.body.notes === 'string') {
      referral.clinicalDetails.assessorNotes = req.body.notes.trim();
    }

    // Optional document attachment during completion
    if (req.body.attachment && req.body.attachment.fileName && req.body.attachment.fileData) {
      referral.clinicalDetails.attachments = referral.clinicalDetails.attachments || [];
      referral.clinicalDetails.attachments.push({
        fileName: req.body.attachment.fileName.trim(),
        fileData: req.body.attachment.fileData,
        fileType: req.body.attachment.fileType || 'application/octet-stream',
        fileSize: req.body.attachment.fileSize || 0,
        uploadedAt: new Date(),
      });
    }

    await referral.save();

    console.log(`[Assessor] Referral ${referral.referenceCode} completed by assessor ${req.assessor.email} with amount ${referral.billing.currency} ${amount}`);

    res.json({
      success: true,
      message: 'Referral completed and billed successfully.',
      data: referral,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
