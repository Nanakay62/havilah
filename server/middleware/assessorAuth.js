'use strict';

const jwt = require('jsonwebtoken');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');

/**
 * Validates JWT tokens issued specifically for Assessor and Doctor accounts.
 * Attaches verified assessor document to req.assessor, and Doctor document (if present) to req.doctor.
 */
async function requireAssessorAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Missing or malformed Authorization header. Expected: Bearer <token>',
      });
    }

    const token = authHeader.slice(7).trim();
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'AUTHENTICATION_REQUIRED',
        message: 'Bearer token is empty',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_dev');
    } catch (jwtErr) {
      return res.status(401).json({
        success: false,
        error: 'SESSION_INVALID',
        message: 'Token is invalid or has expired',
      });
    }

    // Must have assessorId and a recognized assessor/clinical role
    const validRoles = ['assessor', 'clinic_admin', 'doctor'];
    if (!decoded.assessorId || !validRoles.includes(decoded.role)) {
      return res.status(403).json({
        success: false,
        error: 'INSUFFICIENT_PERMISSIONS',
        message: 'Assessor privileges required.',
      });
    }

    const assessor = await Assessor.findById(decoded.assessorId);
    if (!assessor || !assessor.active) {
      return res.status(403).json({
        success: false,
        error: 'ASSESSOR_INACTIVE',
        message: 'Assessor account is inactive or not found.',
      });
    }

    req.assessor = assessor;

    if (decoded.doctorId) {
      const doctor = await Doctor.findById(decoded.doctorId);
      if (!doctor || !doctor.active) {
        return res.status(403).json({
          success: false,
          error: 'DOCTOR_INACTIVE',
          message: 'Clinician account is inactive or not found.',
        });
      }
      req.doctor = doctor;
      req.assessorUser = {
        _id: doctor._id,
        fullName: doctor.fullName,
        email: doctor.email,
        role: doctor.role || 'doctor',
        specialty: doctor.specialty,
      };
    } else {
      req.doctor = null;
      req.assessorUser = {
        _id: assessor._id,
        fullName: assessor.name,
        email: assessor.email,
        role: 'clinic_admin',
        specialty: 'Lead Assessor',
      };
    }

    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Ensures the authenticated user has Clinic Administrator / Lead privileges.
 */
function requireClinicAdmin(req, res, next) {
  const role = req.assessorUser?.role || (req.doctor ? req.doctor.role : 'clinic_admin');
  if (role !== 'clinic_admin' && req.doctor) {
    return res.status(403).json({
      success: false,
      error: 'CLINIC_ADMIN_REQUIRED',
      message: 'Clinic Administrator privileges required for this action.',
    });
  }
  next();
}

module.exports = { requireAssessorAuth, requireClinicAdmin };

