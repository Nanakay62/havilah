'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');
const Referral = require('../models/Referral');
const IssuedCertificate = require('../models/IssuedCertificate');
const AuditLog = require('../models/AuditLog');
const { requireAssessorAuth, requireClinicAdmin } = require('../middleware/assessorAuth');
const { generateTotpSecret, verifyTotpCode, getOtpAuthUrl, generateRecoveryCodes, verifyAndConsumeRecoveryCode } = require('../utils/totp');

const router = express.Router();

/**
 * @route   POST /api/v1/assessor/login
 * @desc    Clinical Portal Login (Supports Lead Assessor / Clinic Admin and Staff Doctors)
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

    // 1. Try Lead Assessor (Practice Account)
    const assessor = await Assessor.findOne({ email: cleanEmail });
    if (assessor) {
      if (!assessor.active) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_DEACTIVATED',
          message: 'Your assessor practice account is inactive. Please contact support.',
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

      // Issue JWT with clinic_admin / lead assessor payload
      if (assessor.totp_enabled && assessor.totp_secret) {
        const challengeToken = jwt.sign(
          {
            purpose: '2fa_login',
            entityType: 'assessor',
            assessorId: assessor._id.toString(),
            email: assessor.email,
            name: assessor.name,
            role: 'clinic_admin',
          },
          process.env.JWT_SECRET,
          { expiresIn: '5m' }
        );
        return res.json({
          success: true,
          requires_2fa: true,
          temp_token: challengeToken,
          assessor: {
            id: assessor._id,
            name: assessor.name,
            email: assessor.email,
            role: 'clinic_admin',
          },
          message: 'Two-factor authentication code required.',
        });
      }
      const token = jwt.sign(
        {
          assessorId: assessor._id.toString(),
          email: assessor.email,
          name: assessor.name,
          role: 'clinic_admin',
          isLeadAssessor: true,
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      return res.json({
        success: true,
        token,
        assessor: {
          id: assessor._id,
          name: assessor.name,
          email: assessor.email,
          organization: assessor.organization,
          role: 'clinic_admin',
          specialty: 'Lead Medical Assessor',
          isLeadAssessor: true,
        },
      });
    }

    // 2. Try Staff Doctor Account
    const doctor = await Doctor.findOne({ email: cleanEmail });
    if (doctor) {
      if (!doctor.active) {
        return res.status(403).json({
          success: false,
          error: 'ACCOUNT_DEACTIVATED',
          message: 'Your clinician account is inactive. Please contact your clinic administrator.',
        });
      }

      const isMatch = await bcrypt.compare(password, doctor.passwordHash);
      if (!isMatch) {
        return res.status(401).json({
          success: false,
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        });
      }

      const practice = await Assessor.findById(doctor.practiceId);
      if (!practice || !practice.active) {
        return res.status(403).json({
          success: false,
          error: 'PRACTICE_INACTIVE',
          message: 'Your associated clinic practice account is inactive.',
        });
      }

      if (doctor.totp_enabled && doctor.totp_secret) {
        const challengeToken = jwt.sign(
          {
            purpose: '2fa_login',
            entityType: 'doctor',
            assessorId: practice._id.toString(),
            doctorId: doctor._id.toString(),
            email: doctor.email,
            name: doctor.fullName,
            role: doctor.role || 'doctor',
          },
          process.env.JWT_SECRET,
          { expiresIn: '5m' }
        );
        return res.json({
          success: true,
          requires_2fa: true,
          temp_token: challengeToken,
          assessor: {
            id: practice._id,
            doctorId: doctor._id,
            name: doctor.fullName,
            email: doctor.email,
            role: doctor.role || 'doctor',
          },
          message: 'Two-factor authentication code required.',
        });
      }

      const token = jwt.sign(
        {
          assessorId: practice._id.toString(),
          doctorId: doctor._id.toString(),
          email: doctor.email,
          name: doctor.fullName,
          role: doctor.role || 'doctor',
          specialty: doctor.specialty,
          isLeadAssessor: false,
        },
        process.env.JWT_SECRET,
        { expiresIn: '8h' }
      );

      return res.json({
        success: true,
        token,
        assessor: {
          id: practice._id,
          doctorId: doctor._id,
          name: doctor.fullName,
          email: doctor.email,
          organization: practice.organization,
          role: doctor.role || 'doctor',
          specialty: doctor.specialty,
          phone: doctor.phone,
          isLeadAssessor: false,
        },
      });
    }

    // 3. No matching account found
    return res.status(401).json({
      success: false,
      error: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password.',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/assessor/me
 * @desc    Get logged in assessor/doctor profile summary and privileges
 * @access  Assessor Authenticated
 */
router.get('/me', requireAssessorAuth, async (req, res) => {
  res.json({
    success: true,
    assessor: {
      id: req.assessor._id,
      doctorId: req.doctor ? req.doctor._id : null,
      name: req.doctor ? req.doctor.fullName : req.assessor.name,
      email: req.doctor ? req.doctor.email : req.assessor.email,
      totp_enabled: Boolean(req.doctor ? req.doctor.totp_enabled : req.assessor.totp_enabled),
      role: req.assessorUser?.role || (req.doctor ? req.doctor.role : 'clinic_admin'),
      specialty: req.doctor ? req.doctor.specialty : 'Lead Medical Assessor',
      isLeadAssessor: !req.doctor,
      organization: req.assessor.organization,
      practiceRegistrationNumber: req.assessor.practiceRegistrationNumber || '',
      hefraLicenseExpiry: req.assessor.hefraLicenseExpiry || null,
      mdcNumber: (req.doctor ? req.doctor.mdcNumber : req.assessor.mdcNumber) || '',
      mdcLicenseExpiry: (req.doctor ? req.doctor.mdcLicenseExpiry : req.assessor.mdcLicenseExpiry) || null,
      signatureDataUrl: (req.doctor ? req.doctor.signatureDataUrl : req.assessor.signatureDataUrl) || '',
      signatureApprovedAt: (req.doctor ? req.doctor.signatureApprovedAt : req.assessor.signatureApprovedAt) || null,
      stampDataUrl: req.assessor.stampDataUrl || '',
      stampApprovedAt: req.assessor.stampApprovedAt || null,
      phone: req.doctor?.phone || req.assessor.phone,
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
    const {
      name,
      organization,
      practiceRegistrationNumber,
      hefraLicenseExpiry,
      mdcNumber,
      mdcLicenseExpiry,
      signatureDataUrl,
      signatureApproved,
      stampDataUrl,
      stampApproved,
      phone,
      notificationEmail,
      address,
      billingSettings,
    } = req.body;
    const assessor = await Assessor.findById(req.assessor._id);
    if (!assessor) {
      return res.status(404).json({ success: false, error: 'Assessor not found' });
    }

    const parseOptionalDate = (val) => {
      if (val === '' || val === null || val === undefined) return null;
      const d = new Date(val);
      return isNaN(d.getTime()) ? undefined : d;
    };

    if (name && typeof name === 'string') assessor.name = name.trim();
    if (organization !== undefined) assessor.organization = String(organization).trim();
    if (practiceRegistrationNumber !== undefined) {
      assessor.practiceRegistrationNumber = String(practiceRegistrationNumber).trim().slice(0, 80);
    }
    if (hefraLicenseExpiry !== undefined) {
      const parsedHefra = parseOptionalDate(hefraLicenseExpiry);
      if (parsedHefra === undefined) {
        return res.status(400).json({ success: false, error: 'INVALID_DATE', message: 'Invalid HeFRA licence expiry date.' });
      }
      assessor.hefraLicenseExpiry = parsedHefra;
    }
    if (phone !== undefined) assessor.phone = String(phone).trim();
    if (notificationEmail !== undefined) assessor.notificationEmail = String(notificationEmail).trim().toLowerCase();
    if (address !== undefined) assessor.address = String(address).trim();

    // Clinician credentials & signature (applied to staff Doctor if logged in as staff, else lead Assessor)
    const sigTarget = req.doctor ? await Doctor.findById(req.doctor._id) : assessor;
    if (sigTarget) {
      if (mdcNumber !== undefined) {
        sigTarget.mdcNumber = String(mdcNumber).trim().slice(0, 60);
      }
      if (mdcLicenseExpiry !== undefined) {
        const parsedMdc = parseOptionalDate(mdcLicenseExpiry);
        if (parsedMdc === undefined) {
          return res.status(400).json({ success: false, error: 'INVALID_DATE', message: 'Invalid MDC licence expiry date.' });
        }
        sigTarget.mdcLicenseExpiry = parsedMdc;
      }
      if (signatureDataUrl !== undefined) {
        const cleanSig = String(signatureDataUrl || '').trim();
        if (!cleanSig) {
          sigTarget.signatureDataUrl = '';
          sigTarget.signatureApprovedAt = null;
        } else if (
          (cleanSig.startsWith('data:image/png;base64,') ||
            cleanSig.startsWith('data:image/jpeg;base64,') ||
            /^\/assets\/signatures\/[a-z0-9._-]+\.(png|jpe?g)$/i.test(cleanSig)) &&
          cleanSig.length <= 350000
        ) {
          sigTarget.signatureDataUrl = cleanSig;
          sigTarget.signatureApprovedAt = signatureApproved ? new Date() : null;
        } else {
          return res.status(400).json({
            success: false,
            error: 'INVALID_SIGNATURE',
            message: 'Signature must be a PNG or JPEG image under 250 KB.',
          });
        }
      } else if (signatureApproved !== undefined) {
        sigTarget.signatureApprovedAt = (signatureApproved && sigTarget.signatureDataUrl) ? new Date() : null;
      }
      if (req.doctor) {
        await sigTarget.save();
      }
    }

    // Practice stamp (stored at clinic/practice level on Assessor)
    if (stampDataUrl !== undefined) {
      const cleanStamp = String(stampDataUrl || '').trim();
      if (!cleanStamp) {
        assessor.stampDataUrl = '';
        assessor.stampApprovedAt = null;
      } else if (
        (cleanStamp.startsWith('data:image/png;base64,') ||
          cleanStamp.startsWith('data:image/jpeg;base64,') ||
          /^\/assets\/stamps\/[a-z0-9._-]+\.(png|jpe?g)$/i.test(cleanStamp)) &&
        cleanStamp.length <= 350000
      ) {
        assessor.stampDataUrl = cleanStamp;
        assessor.stampApprovedAt = stampApproved ? new Date() : null;
      } else {
        return res.status(400).json({
          success: false,
          error: 'INVALID_STAMP',
          message: 'Clinic stamp must be a PNG or JPEG image under 250 KB.',
        });
      }
    } else if (stampApproved !== undefined) {
      assessor.stampApprovedAt = (stampApproved && assessor.stampDataUrl) ? new Date() : null;
    }

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
        practiceRegistrationNumber: assessor.practiceRegistrationNumber || '',
        hefraLicenseExpiry: assessor.hefraLicenseExpiry || null,
        mdcNumber: (sigTarget && sigTarget.mdcNumber) || '',
        mdcLicenseExpiry: (sigTarget && sigTarget.mdcLicenseExpiry) || null,
        signatureDataUrl: (sigTarget && sigTarget.signatureDataUrl) || '',
        signatureApprovedAt: (sigTarget && sigTarget.signatureApprovedAt) || null,
        stampDataUrl: assessor.stampDataUrl || '',
        stampApprovedAt: assessor.stampApprovedAt || null,
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
 * @route   GET /api/v1/assessor/doctors
 * @desc    Get all staff clinicians in this practice with active caseloads
 * @access  Assessor Authenticated (Clinic Admin / Staff)
 */
router.get('/doctors', requireAssessorAuth, async (req, res, next) => {
  try {
    const doctors = await Doctor.find({ practiceId: req.assessor._id })
      .select('-passwordHash')
      .sort({ role: 1, createdAt: -1 })
      .lean();

    // Compute active case counts for each doctor
    const doctorIds = doctors.map(d => d._id);
    const activeCases = await Referral.aggregate([
      {
        $match: {
          assignedDoctorId: { $in: doctorIds },
          status: { $in: ['pending', 'scheduled'] },
        },
      },
      {
        $group: {
          _id: '$assignedDoctorId',
          count: { $sum: 1 },
        },
      },
    ]);

    const countMap = new Map(activeCases.map(c => [c._id.toString(), c.count]));

    const data = doctors.map(d => ({
      ...d,
      activeCaseCount: countMap.get(d._id.toString()) || 0,
    }));

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
 * @route   POST /api/v1/assessor/doctors
 * @desc    Create a new staff clinician under the current practice
 * @access  Clinic Admin Only
 */
router.post('/doctors', requireAssessorAuth, requireClinicAdmin, async (req, res, next) => {
  try {
    const { fullName, email, password, specialty, phone, role, mdcNumber, mdcLicenseExpiry } = req.body;

    if (!fullName || !email || !password || typeof fullName !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Full name, valid email, and password are required.',
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Password must be at least 6 characters.',
      });
    }

    const cleanEmail = email.trim().toLowerCase();

    // Check uniqueness across Doctor and Assessor
    const [existingDoc, existingAssessor] = await Promise.all([
      Doctor.findOne({ email: cleanEmail }),
      Assessor.findOne({ email: cleanEmail }),
    ]);

    if (existingDoc || existingAssessor) {
      return res.status(409).json({
        success: false,
        error: 'EMAIL_EXISTS',
        message: 'A clinical user with this email address already exists.',
      });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let parsedDocMdcExpiry = null;
    if (mdcLicenseExpiry) {
      const d = new Date(mdcLicenseExpiry);
      if (!isNaN(d.getTime())) parsedDocMdcExpiry = d;
    }

    const doctor = await Doctor.create({
      practiceId: req.assessor._id,
      fullName: fullName.trim(),
      email: cleanEmail,
      passwordHash,
      phone: phone ? String(phone).trim() : '',
      specialty: specialty ? String(specialty).trim() : 'Occupational Health Specialist',
      mdcNumber: mdcNumber ? String(mdcNumber).trim().slice(0, 60) : '',
      mdcLicenseExpiry: parsedDocMdcExpiry,
      role: role === 'clinic_admin' ? 'clinic_admin' : 'doctor',
      active: true,
    });

    const doctorData = doctor.toObject();
    delete doctorData.passwordHash;

    console.log(`[Assessor] New clinician created: ${doctor.fullName} (${doctor.email}) under practice ${req.assessor.organization || req.assessor.name}`);

    res.status(201).json({
      success: true,
      message: 'Clinician staff account created successfully.',
      data: doctorData,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/doctors/:id/toggle-status
 * @desc    Toggle active status of a staff clinician
 * @access  Clinic Admin Only
 */
router.patch('/doctors/:id/toggle-status', requireAssessorAuth, requireClinicAdmin, async (req, res, next) => {
  try {
    const doctor = await Doctor.findOne({ _id: req.params.id, practiceId: req.assessor._id });
    if (!doctor) {
      return res.status(404).json({
        success: false,
        error: 'DOCTOR_NOT_FOUND',
        message: 'Clinician not found in this practice.',
      });
    }

    doctor.active = !doctor.active;
    await doctor.save();

    res.json({
      success: true,
      message: `Clinician account is now ${doctor.active ? 'active' : 'deactivated'}.`,
      data: {
        id: doctor._id,
        active: doctor.active,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/assign-doctor
 * @desc    Triage & delegate referral to a staff clinician (or unassign)
 * @access  Clinic Admin Only
 */
router.patch('/referrals/:id/assign-doctor', requireAssessorAuth, requireClinicAdmin, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const { doctorId } = req.body;

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({
        success: false,
        error: 'REFERRAL_NOT_FOUND',
        message: 'Referral case not found.',
      });
    }

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Unauthorized access to this case.',
      });
    }

    if (doctorId) {
      const doctor = await Doctor.findOne({
        _id: doctorId,
        practiceId: req.assessor._id,
        active: true,
      });

      if (!doctor) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DOCTOR',
          message: 'Specified clinician does not exist, is inactive, or does not belong to this practice.',
        });
      }

      referral.assignedDoctorId = doctor._id;
      referral.delegatedAt = new Date();
      referral.delegatedBy = req.assessorUser?._id || req.assessor._id;
    } else {
      referral.assignedDoctorId = null;
      referral.delegatedAt = null;
      referral.delegatedBy = null;
    }

    await referral.save();
    await referral.populate('assignedDoctorId', 'fullName email specialty role active');
    await referral.populate('tenantId', 'company_name company_id slug domain');

    console.log(`[Assessor] Referral ${referral.referenceCode} delegation updated to doctor: ${referral.assignedDoctorId ? referral.assignedDoctorId.fullName : 'Unassigned'}`);

    res.json({
      success: true,
      message: referral.assignedDoctorId
        ? `Referral successfully delegated to ${referral.assignedDoctorId.fullName}.`
        : 'Referral unassigned and returned to general triage queue.',
      data: referral,
    });
  } catch (err) {
    next(err);
  }
});

function isClinicAdminRequest(req) {
  return !req.doctor || req.assessorUser?.role === 'clinic_admin' || req.doctor?.role === 'clinic_admin';
}

function canAccessReferral(req, referral) {
  if (!referral || !req.assessor) return false;
  if (String(referral.assignedAssessorId) !== String(req.assessor._id)) return false;
  if (!isClinicAdminRequest(req) && req.doctor) {
    if (!referral.assignedDoctorId || String(referral.assignedDoctorId) !== String(req.doctor._id)) {
      return false;
    }
  }
  return true;
}

/**
 * @route   GET /api/v1/assessor/queue
 * @desc    Get clinical referral queue with triage filtering, search, date range, settlement, and pagination
 * @access  Assessor Authenticated
 */
router.get('/queue', requireAssessorAuth, async (req, res, next) => {
  try {
    const query = { assignedAssessorId: req.assessor._id };

    // Role-based triage visibility:
    const isClinicAdmin = !req.doctor || req.assessorUser?.role === 'clinic_admin' || req.doctor?.role === 'clinic_admin';

    if (!isClinicAdmin && req.doctor) {
      // Individual clinician: restricted to assigned referrals
      query.assignedDoctorId = req.doctor._id;
    } else {
      // Clinic Admin: check doctorId filter
      if (req.query.doctorId) {
        if (req.query.doctorId === 'unassigned') {
          query.assignedDoctorId = null;
        } else if (req.query.doctorId !== 'all') {
          query.assignedDoctorId = req.query.doctorId;
        }
      }
    }

    if (req.query.tenantId && req.query.tenantId !== 'all') {
      query.tenantId = req.query.tenantId;
    }

    if (req.query.status && req.query.status !== 'all' && req.query.status !== 'all_including_archived') {
      if (req.query.status === 'awaiting_payment') {
        query.status = '__never_match_awaiting_payment__';
      } else {
        query.status = req.query.status;
      }
    } else if (req.query.status === 'all_including_archived') {
      query.status = { $ne: 'awaiting_payment' };
    } else {
      // By default, hide archived and awaiting_payment cases from regular triage queue
      query.status = { $nin: ['archived', 'awaiting_payment'] };
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
      const s = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
      .populate('tenantId', 'company_name company_id slug domain account_type')
      .populate('assignedDoctorId', 'fullName email specialty role active')
      .sort({ createdAt: -1 });

    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10);
    if (limit && limit > 0) {
      queryExec = queryExec.skip((page - 1) * limit).limit(limit);
    }

    const referrals = await queryExec.lean();

    const now = Date.now();
    const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
    const priorityRank = { crisis: 0, urgent: 1, standard: 2 };
    const payerLabelMap = {
      guest_pay: 'Guest (Paid)',
      welcome_credit: 'Individual (Welcome Credit)',
      welcome_discount: 'Individual (Welcome Credit)',
      self_pay: 'Private Self-Pay',
      company_covered: 'Company Covered',
    };

    const data = referrals
      .map((r) => {
        const createdAtMs = r.createdAt ? new Date(r.createdAt).getTime() : 0;
        const isStale = r.status === 'pending' && (now - createdAtMs) > FORTY_EIGHT_HOURS_MS;
        const pType = r.billing?.payerType || 'company_covered';
        const isInd = r.tenantId?.account_type === 'individual';
        const payerLabel = (pType === 'self_pay' && isInd) ? 'Individual (Self-Pay)' : (payerLabelMap[pType] || 'Company Covered');
        return {
          ...r,
          priority: r.priority || 'standard',
          isStale: !!isStale,
          payerType: pType,
          payerLabel,
          patientProvidedEmployer: r.patientProvidedEmployer || { name: '', staffId: '' },
        };
      })
      .sort((a, b) => {
        const aPending = a.status === 'pending' || a.status === 'scheduled';
        const bPending = b.status === 'pending' || b.status === 'scheduled';
        if (aPending && bPending) {
          const pa = priorityRank[a.priority] ?? 2;
          const pb = priorityRank[b.priority] ?? 2;
          if (pa !== pb) return pa - pb;
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
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

    if (!canAccessReferral(req, referral)) {
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

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    let senderName = 'Medical Assessor';
    if (req.doctor) {
      senderName = `${req.doctor.fullName}${req.doctor.specialty ? ` (${req.doctor.specialty})` : ''}`;
    } else if (req.assessor?.name) {
      senderName = `${req.assessor.name} (Lead Clinician)`;
    }

    const newMsg = {
      sender: 'assessor',
      senderName,
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

    if (!canAccessReferral(req, referral)) {
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

function parseIsoDateOnly(val) {
  if (!val || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  const utcMs = Date.UTC(y, m - 1, d);
  const check = new Date(utcMs);
  if (
    isNaN(utcMs) ||
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() + 1 !== m ||
    check.getUTCDate() !== d
  ) {
    return null;
  }
  return { iso: trimmed, utcMs };
}

function normalizeAttachmentDataUri(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:(application\/pdf|image\/(?:png|jpeg|jpg|gif|webp)|text\/plain)(?:;[^;,=]+=[^;,]*)*;base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!match) return trimmed;
  return `data:${match[1].toLowerCase()};base64,${match[2].replace(/\s+/g, '')}`;
}

/**
 * @route   POST /api/v1/assessor/referrals/:id/certificates
 * @desc    Issue and log a tamper-evident Medical Excuse Duty Certificate for an approved consultation record.
 *          Strictly clinician-authenticated; validates HeFRA, MDC, dates, and clinician attestation under Act 857 / Act 772.
 * @access  Assessor Authenticated
 */
router.post('/referrals/:id/certificates', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const allowedTypes = ['excuse_duty', 'light_duty', 'fit_to_return', 'attendance'];
    const certificateType = allowedTypes.includes(req.body?.certificateType)
      ? req.body.certificateType
      : 'excuse_duty';

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Consultation record not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this consultation record.' });
    }

    if (referral.status === 'cancelled') {
      return res.status(400).json({ success: false, error: 'INVALID_STATUS', message: 'Cannot issue a certificate for a cancelled consultation.' });
    }

    const clinicName = (req.assessor.organization || req.assessor.name || '').trim();
    if (!clinicName) {
      return res.status(400).json({
        success: false,
        error: 'CLINIC_PROFILE_INCOMPLETE',
        message: 'Configure your clinic/practice name in Clinic Settings before issuing certificates.',
      });
    }

    const practiceRegNumber = String(req.assessor.practiceRegistrationNumber || '').trim().slice(0, 80);
    if (!practiceRegNumber) {
      return res.status(400).json({
        success: false,
        error: 'HEFRA_LICENSE_REQUIRED',
        message: 'Add your clinic HeFRA / practice registration number in Clinic Settings before issuing official medical certificates.',
      });
    }

    const mdcNumber = String(
      req.body?.mdcNumber ||
      (req.doctor ? req.doctor.mdcNumber : req.assessor.mdcNumber) ||
      ''
    ).trim().slice(0, 60);
    if (!mdcNumber || mdcNumber.length < 3) {
      return res.status(400).json({
        success: false,
        error: 'MDC_NUMBER_REQUIRED',
        message: 'Enter your valid MDC registration number before issuing a medical certificate.',
      });
    }

    if (req.body?.attestationConfirmed !== true) {
      return res.status(400).json({
        success: false,
        error: 'ATTESTATION_REQUIRED',
        message: 'Clinician attestation confirmation is required under Ghana Act 857 and Act 772 before issuing a certificate.',
      });
    }

    const todayIso = new Date().toISOString().split('T')[0];
    const consultDateRaw = req.body?.consultationDate ? String(req.body.consultationDate) : todayIso;
    const consultParsed = parseIsoDateOnly(consultDateRaw);
    if (!consultParsed) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE',
        message: 'Date of examination must be a valid YYYY-MM-DD date.',
      });
    }
    const consultationDate = consultParsed.iso;

    const consultationMode = req.body?.consultationMode === 'telehealth' ? 'telehealth' : 'in_person';

    const startParsed = parseIsoDateOnly(req.body?.startDate ? String(req.body.startDate) : consultationDate);
    if (!startParsed) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE',
        message: 'Start date must be a valid YYYY-MM-DD date.',
      });
    }
    const startDate = startParsed.iso;

    const needsRange = certificateType === 'excuse_duty' || certificateType === 'light_duty';
    const endRaw = needsRange ? (req.body?.endDate ? String(req.body.endDate) : startDate) : startDate;
    const endParsed = parseIsoDateOnly(endRaw);
    if (!endParsed) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE',
        message: 'End date must be a valid YYYY-MM-DD date.',
      });
    }
    if (endParsed.utcMs < startParsed.utcMs) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_DATE_RANGE',
        message: 'End date must be on or after the start date.',
      });
    }
    const endDate = endParsed.iso;

    let durationDays = null;
    let returnDate = '';
    if (needsRange) {
      durationDays = Math.round((endParsed.utcMs - startParsed.utcMs) / 86400000) + 1;
      const nextDay = new Date(endParsed.utcMs + 86400000);
      returnDate = nextDay.toISOString().split('T')[0];
    } else if (certificateType === 'fit_to_return') {
      durationDays = null;
      returnDate = startDate;
    } else {
      durationDays = 1;
      returnDate = '';
    }

    const isBackdated = Boolean(needsRange && startDate < consultationDate);
    const hrSafePrivacy = req.body?.hrSafePrivacy !== false;
    const clinicianName = String((req.doctor ? req.doctor.fullName : req.assessor.name) || '').trim();
    const clinicianSpecialty = String((req.doctor ? req.doctor.specialty : 'Lead Medical Assessor') || '').trim();
    const twoFactorVerified = Boolean(req.doctor ? req.doctor.totp_enabled : req.assessor.totp_enabled);

    // Optional Occupational Safety and Health (OSH) fitness disposition & duty restrictions
    const allowedFitness = ['temporarily_unfit', 'fit_with_restrictions', 'fit_full_duty', 'pending_review'];
    const defaultFitnessMap = {
      excuse_duty: 'temporarily_unfit',
      light_duty: 'fit_with_restrictions',
      fit_to_return: 'fit_full_duty',
      attendance: '',
    };
    let fitnessStatus = '';
    if (certificateType !== 'attendance') {
      const requestedFitness = typeof req.body?.fitnessStatus === 'string' ? req.body.fitnessStatus.trim() : '';
      fitnessStatus = allowedFitness.includes(requestedFitness)
        ? requestedFitness
        : (defaultFitnessMap[certificateType] || '');
    }

    const workRestrictions = [];
    if (certificateType !== 'attendance' && Array.isArray(req.body?.workRestrictions)) {
      const seen = new Set();
      for (const rawItem of req.body.workRestrictions) {
        const cleaned = String(rawItem || '').trim().slice(0, 120);
        if (cleaned && !seen.has(cleaned.toLowerCase())) {
          seen.add(cleaned.toLowerCase());
          workRestrictions.push(cleaned);
          if (workRestrictions.length >= 8) break;
        }
      }
    }

    let reassessmentDate = '';
    if (certificateType !== 'attendance' && req.body?.reassessmentDate && String(req.body.reassessmentDate).trim()) {
      const parsedReview = parseIsoDateOnly(String(req.body.reassessmentDate));
      if (!parsedReview) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_DATE',
          message: 'Next clinical review date must be a valid YYYY-MM-DD date.',
        });
      }
      reassessmentDate = parsedReview.iso;
    }
    const reassessmentRequired = certificateType !== 'attendance'
      ? Boolean(req.body?.reassessmentRequired || reassessmentDate)
      : false;

    const certificateId = IssuedCertificate.generateCertificateId();
    const issuedAt = new Date();
    const integrityHash = IssuedCertificate.computeIntegrityHash({
      schemaVersion: 3,
      certificateId,
      referralId: referral._id,
      assessorId: req.assessor._id,
      doctorId: req.doctor ? req.doctor._id : null,
      certificateType,
      clinicName,
      practiceRegNumber,
      clinicianName,
      mdcNumber,
      consultationDate,
      consultationMode,
      startDate,
      endDate,
      durationDays,
      returnDate,
      issuedAt,
      pdfSha256: '',
      fitnessStatus,
      reassessmentRequired,
      reassessmentDate,
      workRestrictions,
    });

    const record = await IssuedCertificate.create({
      schemaVersion: 3,
      certificateId,
      integrityHash,
      referralId: referral._id,
      assessorId: req.assessor._id,
      doctorId: req.doctor ? req.doctor._id : null,
      certificateType,
      clinicName,
      practiceRegNumber,
      clinicianName,
      clinicianSpecialty,
      mdcNumber,
      consultationDate,
      consultationMode,
      startDate,
      endDate,
      durationDays,
      returnDate,
      fitnessStatus,
      workRestrictions,
      reassessmentRequired,
      reassessmentDate,
      isBackdated,
      hrSafePrivacy,
      attestationConfirmed: true,
      attestationIp: String(req.ip || ''),
      twoFactorVerified,
      issuedAt,
    });

    // Log issuance in immutable AuditLog (best-effort, non-blocking)
    try {
      await AuditLog.append({
        company_id: String(referral.company_id || referral.tenantId || 'clinical'),
        actor_user_id: String(req.doctor ? req.doctor._id : req.assessor._id),
        actor_role: req.doctor ? (req.doctor.role || 'doctor') : 'clinic_admin',
        event_type: 'CERTIFICATE_ISSUED',
        event_payload: {
          certificateId: record.certificateId,
          certificateType: record.certificateType,
          referralReference: referral.referenceCode,
          clinicianName,
          mdcNumber,
          practiceRegNumber,
          consultationDate,
          consultationMode,
          startDate,
          endDate,
          durationDays,
          fitnessStatus,
          reassessmentRequired,
          reassessmentDate,
          workRestrictionsCount: workRestrictions.length,
          isBackdated,
          twoFactorVerified,
          ip: req.ip || '',
          issuedAt: record.issuedAt.toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('[Certificate] Audit log skipped:', auditErr.message);
    }

    const baseOrigin = (
      process.env.APP_BASE_URL ||
      process.env.CLIENT_ORIGIN ||
      `${req.protocol}://${req.get('host')}`
    ).replace(/\/$/, '');
    const verifyUrl = `${baseOrigin}/verify/${encodeURIComponent(record.certificateId)}`;

    return res.status(201).json({
      success: true,
      data: {
        certificateId: record.certificateId,
        issuedAt: record.issuedAt.toISOString(),
        clinicName: record.clinicName,
        practiceRegNumber: record.practiceRegNumber,
        clinicianName: record.clinicianName,
        clinicianSpecialty: record.clinicianSpecialty,
        mdcNumber: record.mdcNumber,
        certificateType: record.certificateType,
        consultationDate: record.consultationDate,
        consultationMode: record.consultationMode,
        startDate: record.startDate,
        endDate: record.endDate,
        durationDays: record.durationDays,
        returnDate: record.returnDate,
        fitnessStatus: record.fitnessStatus || '',
        workRestrictions: record.workRestrictions || [],
        reassessmentRequired: Boolean(record.reassessmentRequired),
        reassessmentDate: record.reassessmentDate || '',
        isBackdated: record.isBackdated,
        payerType: referral.billing?.payerType || 'company_covered',
        patientProvidedEmployer: referral.patientProvidedEmployer || { name: '', staffId: '' },
        verifyUrl,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/certificates/:certificateId/seal
 * @desc    Lock the SHA-256 hash of the generated PDF onto an issued certificate record (immutable once sealed)
 * @access  Assessor Authenticated
 */
router.patch('/referrals/:id/certificates/:certificateId/seal', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const rawCertId = String(req.params.certificateId || '').trim().toUpperCase();
    const rawHash = String(req.body?.pdfSha256 || '').trim().toLowerCase();

    if (!rawHash || !/^[a-f0-9]{64}$/.test(rawHash)) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_HASH',
        message: 'A valid 64-character SHA-256 hex digest is required to seal the certificate PDF.',
      });
    }

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Consultation record not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this consultation record.' });
    }

    const record = await IssuedCertificate.findOne({
      certificateId: rawCertId,
      referralId: referral._id,
      assessorId: req.assessor._id,
    });
    if (!record) {
      return res.status(404).json({ success: false, error: 'CERTIFICATE_NOT_FOUND', message: 'Issued certificate not found.' });
    }

    if (record.revoked) {
      return res.status(400).json({ success: false, error: 'CERTIFICATE_REVOKED', message: 'Cannot seal a revoked certificate.' });
    }

    if (record.pdfSha256) {
      if (String(record.pdfSha256).toLowerCase() === rawHash) {
        return res.json({
          success: true,
          data: {
            certificateId: record.certificateId,
            pdfSha256: record.pdfSha256,
            pdfSealedAt: record.pdfSealedAt ? record.pdfSealedAt.toISOString() : null,
          },
        });
      }
      return res.status(409).json({
        success: false,
        error: 'ALREADY_SEALED',
        message: 'Certificate PDF hash is already sealed and cannot be overwritten.',
      });
    }

    record.pdfSha256 = rawHash;
    record.pdfSealedAt = new Date();
    const baseObj = typeof record.toObject === 'function' ? record.toObject() : record;
    record.integrityHash = IssuedCertificate.computeIntegrityHash({
      ...baseObj,
      schemaVersion: record.schemaVersion || 2,
      pdfSha256: rawHash,
    });
    await record.save();

    try {
      await AuditLog.append({
        company_id: String(referral.company_id || referral.tenantId || 'clinical'),
        actor_user_id: String(req.doctor ? req.doctor._id : req.assessor._id),
        actor_role: req.doctor ? (req.doctor.role || 'doctor') : 'clinic_admin',
        event_type: 'CERTIFICATE_SEALED',
        event_payload: {
          certificateId: record.certificateId,
          referralReference: referral.referenceCode,
          pdfSha256: rawHash,
          pdfSealedAt: record.pdfSealedAt.toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('[Certificate] Audit log skipped:', auditErr.message);
    }

    return res.json({
      success: true,
      data: {
        certificateId: record.certificateId,
        pdfSha256: record.pdfSha256,
        pdfSealedAt: record.pdfSealedAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/assessor/referrals/:id/certificates
 * @desc    List issued certificates for a consultation case (for status tracking & revocation)
 * @access  Assessor Authenticated
 */
router.get('/referrals/:id/certificates', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Consultation record not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this consultation record.' });
    }

    const records = await IssuedCertificate.find({
      referralId: referral._id,
      assessorId: req.assessor._id,
    })
      .sort({ issuedAt: -1 })
      .lean();

    const safeList = records.map((rec) => ({
      certificateId: rec.certificateId,
      certificateType: rec.certificateType || 'excuse_duty',
      clinicName: rec.clinicName,
      practiceRegNumber: rec.practiceRegNumber || '',
      clinicianName: rec.clinicianName || '',
      mdcNumber: rec.mdcNumber || '',
      consultationDate: rec.consultationDate || '',
      consultationMode: rec.consultationMode || 'in_person',
      startDate: rec.startDate || '',
      endDate: rec.endDate || '',
      durationDays: rec.durationDays != null ? rec.durationDays : null,
      returnDate: rec.returnDate || '',
      fitnessStatus: rec.fitnessStatus || '',
      workRestrictions: Array.isArray(rec.workRestrictions) ? rec.workRestrictions : [],
      reassessmentRequired: Boolean(rec.reassessmentRequired),
      reassessmentDate: rec.reassessmentDate || '',
      isBackdated: Boolean(rec.isBackdated),
      fileHashProtected: Boolean(rec.pdfSha256),
      pdfSha256Prefix: rec.pdfSha256 ? String(rec.pdfSha256).slice(0, 12) : '',
      issuedAt: rec.issuedAt,
      revoked: Boolean(rec.revoked),
      revokedAt: rec.revokedAt || null,
      revokedReason: rec.revokedReason || '',
      revokedBy: rec.revokedBy || '',
    }));

    return res.json({
      success: true,
      data: safeList,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   PATCH /api/v1/assessor/certificates/:certificateId/revoke
 * @desc    Revoke a previously issued medical certificate with a documented reason
 * @access  Assessor Authenticated
 */
router.patch('/certificates/:certificateId/revoke', requireAssessorAuth, async (req, res, next) => {
  try {
    const rawCertId = String(req.params.certificateId || '').trim().toUpperCase();
    const reason = String(req.body?.reason || '').trim().slice(0, 300);

    if (!reason || reason.length < 5) {
      return res.status(400).json({
        success: false,
        error: 'REASON_REQUIRED',
        message: 'Provide a clear revocation reason (at least 5 characters).',
      });
    }

    const record = await IssuedCertificate.findOne({
      certificateId: rawCertId,
      assessorId: req.assessor._id,
    });
    if (!record) {
      return res.status(404).json({ success: false, error: 'CERTIFICATE_NOT_FOUND', message: 'Issued certificate not found.' });
    }

    const referral = await Referral.findById(record.referralId);
    if (!referral || !canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized to revoke this certificate.' });
    }

    if (record.revoked) {
      return res.json({
        success: true,
        message: 'Certificate already revoked.',
        data: {
          certificateId: record.certificateId,
          revoked: true,
          revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
          revokedReason: record.revokedReason || '',
        },
      });
    }

    record.revoked = true;
    record.revokedAt = new Date();
    record.revokedReason = reason;
    record.revokedBy = String((req.doctor ? req.doctor.fullName : req.assessor.name) || 'Clinician').trim();
    await record.save();

    try {
      await AuditLog.append({
        company_id: String(referral.company_id || referral.tenantId || 'clinical'),
        actor_user_id: String(req.doctor ? req.doctor._id : req.assessor._id),
        actor_role: req.doctor ? (req.doctor.role || 'doctor') : 'clinic_admin',
        event_type: 'CERTIFICATE_REVOKED',
        event_payload: {
          certificateId: record.certificateId,
          referralReference: referral.referenceCode,
          revokedBy: record.revokedBy,
          revokedReason: reason,
          revokedAt: record.revokedAt.toISOString(),
        },
      });
    } catch (auditErr) {
      console.warn('[Certificate] Audit log skipped:', auditErr.message);
    }

    return res.json({
      success: true,
      message: 'Certificate revoked successfully.',
      data: {
        certificateId: record.certificateId,
        revoked: true,
        revokedAt: record.revokedAt.toISOString(),
        revokedReason: record.revokedReason,
      },
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
    const { fileName, fileData, fileType, fileSize, certificateId, pdfSha256 } = req.body;

    if (!fileName || !fileData) {
      return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'File name and file data are required.' });
    }

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral case not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    referral.clinicalDetails = referral.clinicalDetails || {};
    referral.clinicalDetails.attachments = referral.clinicalDetails.attachments || [];

    const normalizedFileData = normalizeAttachmentDataUri(fileData);

    const attachmentObj = {
      fileName: fileName.trim(),
      fileData: normalizedFileData,
      fileType: fileType || 'application/octet-stream',
      fileSize: fileSize || 0,
      certificateId: certificateId ? String(certificateId).trim().toUpperCase() : '',
      pdfSha256: pdfSha256 ? String(pdfSha256).trim().toLowerCase() : '',
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
 * @route   DELETE /api/v1/assessor/referrals/:id/attachments/:attachmentIndex
 * @desc    Delete a clinical document attachment from a referral case
 * @access  Assessor Authenticated
 */
router.delete('/referrals/:id/attachments/:attachmentIndex', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const index = parseInt(req.params.attachmentIndex, 10);

    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral case not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Unauthorized access to this case.' });
    }

    referral.clinicalDetails = referral.clinicalDetails || {};
    referral.clinicalDetails.attachments = referral.clinicalDetails.attachments || [];

    if (isNaN(index) || index < 0 || index >= referral.clinicalDetails.attachments.length) {
      return res.status(400).json({ success: false, error: 'INVALID_INDEX', message: 'Invalid attachment index.' });
    }

    const removed = referral.clinicalDetails.attachments.splice(index, 1);
    await referral.save();

    console.log(`[Assessor] Removed document "${removed[0]?.fileName}" from referral ${referral.referenceCode}`);

    res.json({
      success: true,
      message: 'Attachment removed successfully.',
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

    // Verify this case belongs to the authenticated assessor and assigned clinician
    if (!canAccessReferral(req, referral)) {
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

/**
 * @route   PATCH /api/v1/assessor/referrals/:id/archive
 * @desc    Toggle archive status for a referral case (hide/unhide from active queue)
 * @access  Assessor Authenticated
 */
router.patch('/referrals/:id/archive', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_ACCESS', message: 'Unauthorized to modify this referral.' });
    }

    const shouldArchive = req.body.archive !== undefined ? Boolean(req.body.archive) : referral.status !== 'archived';
    if (shouldArchive) {
      referral.previousStatus = referral.status !== 'archived' ? referral.status : 'pending';
      referral.status = 'archived';
    } else {
      referral.status = referral.previousStatus || 'pending';
    }

    await referral.save();
    console.log(`[Assessor] Referral ${referral.referenceCode} archive status toggled: ${referral.status}`);

    res.json({
      success: true,
      message: shouldArchive ? 'Referral archived and hidden from active queue.' : 'Referral restored to active queue.',
      data: referral,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   DELETE /api/v1/assessor/referrals/:id
 * @desc    Permanently delete / clear a referral case (for testing or clinical cleanup)
 * @access  Assessor Authenticated
 */
router.delete('/referrals/:id', requireAssessorAuth, requireClinicAdmin, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral not found.' });
    }

    if (!canAccessReferral(req, referral)) {
      return res.status(403).json({ success: false, error: 'UNAUTHORIZED_ACCESS', message: 'Unauthorized to delete this referral.' });
    }

    const refCode = referral.referenceCode;
    await Referral.findByIdAndDelete(referralId);
    console.log(`[Assessor] Referral ${refCode} permanently deleted by assessor ${req.assessor.email}`);

    res.json({
      success: true,
      message: `Referral ${refCode} has been permanently deleted.`,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/assessor/login/verify-2fa
router.post('/login/verify-2fa', async (req, res, next) => {
  try {
    const { temp_token, code, recovery_code } = req.body;
    if (!temp_token || (!code && !recovery_code)) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Challenge token and 6-digit authenticator code or recovery code are required.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CHALLENGE',
        message: 'Two-factor session expired. Please log in again.',
      });
    }

    if (!decoded || decoded.purpose !== '2fa_login' || !['assessor', 'doctor'].includes(decoded.entityType)) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CHALLENGE',
        message: 'Invalid two-factor challenge token.',
      });
    }

    const totpCandidate = String(code || '').trim();
    const backupCandidate = String(recovery_code || totpCandidate).trim();

    if (decoded.entityType === 'doctor') {
      const doctor = await Doctor.findById(decoded.doctorId);
      const practice = doctor ? await Assessor.findById(doctor.practiceId) : null;
      if (!doctor || !doctor.active || !practice || !practice.active || !doctor.totp_enabled || !doctor.totp_secret) {
        return res.status(401).json({ success: false, error: 'ACCOUNT_UNAVAILABLE', message: 'Doctor account unavailable for 2FA.' });
      }

      let ok = false;
      if (/^\d{6}$/.test(totpCandidate) && verifyTotpCode(totpCandidate, doctor.totp_secret)) {
        ok = true;
      } else if (backupCandidate) {
        const check = verifyAndConsumeRecoveryCode(backupCandidate, doctor.totp_recovery_codes_hashes || []);
        if (check.valid) {
          doctor.totp_recovery_codes_hashes = check.remainingHashes;
          await doctor.save();
          ok = true;
        }
      }
      if (!ok) {
        return res.status(401).json({ success: false, error: 'INVALID_2FA_CODE', message: 'Invalid authenticator or recovery code.' });
      }

      const token = jwt.sign(
        {
          assessorId: practice._id.toString(),
          doctorId: doctor._id.toString(),
          email: doctor.email,
          name: doctor.fullName,
          role: doctor.role || 'doctor',
          specialty: doctor.specialty,
          isLeadAssessor: false,
        },
        process.env.JWT_SECRET,
        { expiresIn: '12h' }
      );
      return res.json({
        success: true,
        token,
        assessor: {
          id: practice._id,
          doctorId: doctor._id,
          name: doctor.fullName,
          email: doctor.email,
          role: doctor.role || 'doctor',
          specialty: doctor.specialty,
          organization: practice.organization,
          billingSettings: practice.billingSettings || { defaultRate: 450, defaultCurrency: 'GHS' },
          totp_enabled: true,
        },
      });
    }

    const assessor = await Assessor.findById(decoded.assessorId);
    if (!assessor || !assessor.active || !assessor.totp_enabled || !assessor.totp_secret) {
      return res.status(401).json({ success: false, error: 'ACCOUNT_UNAVAILABLE', message: 'Assessor account unavailable for 2FA.' });
    }

    let ok = false;
    if (/^\d{6}$/.test(totpCandidate) && verifyTotpCode(totpCandidate, assessor.totp_secret)) {
      ok = true;
    } else if (backupCandidate) {
      const check = verifyAndConsumeRecoveryCode(backupCandidate, assessor.totp_recovery_codes_hashes || []);
      if (check.valid) {
        assessor.totp_recovery_codes_hashes = check.remainingHashes;
        await assessor.save();
        ok = true;
      }
    }
    if (!ok) {
      return res.status(401).json({ success: false, error: 'INVALID_2FA_CODE', message: 'Invalid authenticator or recovery code.' });
    }

    const token = jwt.sign(
      {
        assessorId: assessor._id.toString(),
        email: assessor.email,
        name: assessor.name,
        role: 'clinic_admin',
        isLeadAssessor: true,
      },
      process.env.JWT_SECRET,
      { expiresIn: '12h' }
    );
    return res.json({
      success: true,
      token,
      assessor: {
        id: assessor._id,
        name: assessor.name,
        email: assessor.email,
        role: 'clinic_admin',
        organization: assessor.organization,
        billingSettings: assessor.billingSettings || { defaultRate: 450, defaultCurrency: 'GHS' },
        totp_enabled: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

async function resolveAssessorOrDoctorAccount(req) {
  if (req.doctor) {
    return Doctor.findById(req.doctor._id);
  }
  return Assessor.findById(req.assessor._id);
}

router.get('/2fa/status', requireAssessorAuth, async (req, res, next) => {
  try {
    const acct = await resolveAssessorOrDoctorAccount(req);
    if (!acct) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    return res.json({
      success: true,
      enabled: Boolean(acct.totp_enabled),
      recovery_codes_remaining: (acct.totp_recovery_codes_hashes || []).length,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/setup', requireAssessorAuth, async (req, res, next) => {
  try {
    const acct = await resolveAssessorOrDoctorAccount(req);
    if (!acct) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    const secret = generateTotpSecret();
    acct.totp_pending_secret = secret;
    await acct.save();
    return res.json({
      success: true,
      secret,
      otpauth_url: getOtpAuthUrl({
        issuer: 'Havilah Clinical',
        accountName: acct.email || acct.name || acct.fullName || 'Assessor',
        secret,
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/enable', requireAssessorAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    const acct = await resolveAssessorOrDoctorAccount(req);
    if (!acct) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    if (!acct.totp_pending_secret) {
      return res.status(400).json({ success: false, error: 'NO_PENDING_SETUP', message: 'Run 2FA setup first.' });
    }
    if (!verifyTotpCode(String(code || ''), acct.totp_pending_secret)) {
      return res.status(400).json({ success: false, error: 'INVALID_CODE', message: 'Invalid 6-digit verification code.' });
    }
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    acct.totp_secret = acct.totp_pending_secret;
    acct.totp_pending_secret = null;
    acct.totp_enabled = true;
    acct.totp_recovery_codes_hashes = hashedCodes;
    await acct.save();
    return res.json({
      success: true,
      enabled: true,
      recovery_codes: plainCodes,
      message: 'Two-factor authentication enabled for Clinical Portal access.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/disable', requireAssessorAuth, async (req, res, next) => {
  try {
    const { code, password } = req.body;
    const acct = await resolveAssessorOrDoctorAccount(req);
    if (!acct) return res.status(404).json({ success: false, error: 'NOT_FOUND' });
    let verified = false;
    if (password && acct.passwordHash && await bcrypt.compare(String(password), acct.passwordHash)) {
      verified = true;
    } else if (code && acct.totp_secret && verifyTotpCode(String(code), acct.totp_secret)) {
      verified = true;
    }
    if (!verified) {
      return res.status(401).json({ success: false, error: 'VERIFICATION_FAILED', message: 'Provide valid password or 6-digit code to disable 2FA.' });
    }
    acct.totp_enabled = false;
    acct.totp_secret = null;
    acct.totp_pending_secret = null;
    acct.totp_recovery_codes_hashes = [];
    await acct.save();
    return res.json({ success: true, enabled: false });
  } catch (err) {
    next(err);
  }
});

router.post('/2fa/regenerate-recovery-codes', requireAssessorAuth, async (req, res, next) => {
  try {
    const { code } = req.body;
    const acct = await resolveAssessorOrDoctorAccount(req);
    if (!acct || !acct.totp_enabled || !acct.totp_secret) {
      return res.status(400).json({ success: false, error: '2FA_NOT_ENABLED' });
    }
    if (!verifyTotpCode(String(code || ''), acct.totp_secret)) {
      return res.status(401).json({ success: false, error: 'INVALID_CODE', message: 'Valid 6-digit code required.' });
    }
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    acct.totp_recovery_codes_hashes = hashedCodes;
    await acct.save();
    return res.json({ success: true, recovery_codes: plainCodes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
