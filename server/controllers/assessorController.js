'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');
const Referral = require('../models/Referral');
const { requireAssessorAuth, requireClinicAdmin } = require('../middleware/assessorAuth');

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
      const token = jwt.sign(
        {
          assessorId: assessor._id.toString(),
          email: assessor.email,
          name: assessor.name,
          role: 'clinic_admin',
          isLeadAssessor: true,
        },
        process.env.JWT_SECRET || 'fallback_secret_for_dev',
        { expiresIn: '7d' }
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
        process.env.JWT_SECRET || 'fallback_secret_for_dev',
        { expiresIn: '7d' }
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
      role: req.assessorUser?.role || (req.doctor ? req.doctor.role : 'clinic_admin'),
      specialty: req.doctor ? req.doctor.specialty : 'Lead Medical Assessor',
      isLeadAssessor: !req.doctor,
      organization: req.assessor.organization,
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
    const { fullName, email, password, specialty, phone, role } = req.body;

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

    const doctor = await Doctor.create({
      practiceId: req.assessor._id,
      fullName: fullName.trim(),
      email: cleanEmail,
      passwordHash,
      phone: phone ? String(phone).trim() : '',
      specialty: specialty ? String(specialty).trim() : 'Occupational Health Specialist',
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
      query.status = req.query.status;
    } else if (req.query.status !== 'all_including_archived' && req.query.status !== 'archived') {
      // By default, hide archived cases from regular triage queue
      query.status = { $ne: 'archived' };
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

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
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

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
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
router.delete('/referrals/:id', requireAssessorAuth, async (req, res, next) => {
  try {
    const referralId = req.params.id;
    const referral = await Referral.findById(referralId);
    if (!referral) {
      return res.status(404).json({ success: false, error: 'REFERRAL_NOT_FOUND', message: 'Referral not found.' });
    }

    if (referral.assignedAssessorId.toString() !== req.assessor._id.toString()) {
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

module.exports = router;
