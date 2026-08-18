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
 * @desc    Get logged in assessor profile
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
    },
  });
});

/**
 * @route   GET /api/v1/assessor/queue
 * @desc    Get clinical referral queue for this assessor
 * @access  Assessor Authenticated
 */
router.get('/queue', requireAssessorAuth, async (req, res, next) => {
  try {
    // Query directly by assignedAssessorId - not scoped by authorizedTenants
    // so assessor retains access to past cases even if a tenant switches active assessor
    const query = { assignedAssessorId: req.assessor._id };

    if (req.query.tenantId) {
      query.tenantId = req.query.tenantId;
    }

    if (req.query.status) {
      query.status = req.query.status;
    }

    const referrals = await Referral.find(query)
      .populate('tenantId', 'company_name company_id slug domain')
      .sort({ createdAt: -1 })
      .lean();

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
      data,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/complete
 * @desc    Complete a referral case, apply billing amount and clinical notes
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
    referral.billing.amount = amount;
    referral.billing.isBilled = true;
    referral.billing.billedAt = new Date();

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

    await referral.save();

    console.log(`[Assessor] Referral ${referral.referenceCode} completed by assessor ${req.assessor.email} with amount GHS ${amount}`);

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
