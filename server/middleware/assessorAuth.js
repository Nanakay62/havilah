'use strict';

const jwt = require('jsonwebtoken');
const Assessor = require('../models/Assessor');

/**
 * Validates JWT tokens issued specifically for Assessor accounts.
 * Attaches verified assessor document to req.assessor.
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

    // Structurally distinct: must have role === 'assessor' and assessorId
    if (decoded.role !== 'assessor' || !decoded.assessorId) {
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
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAssessorAuth };
