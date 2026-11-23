'use strict';

const express = require('express');
const crypto = require('crypto');
const IssuedCertificate = require('../models/IssuedCertificate');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');

const router = express.Router();

const CERT_ID_PATTERN = /^HVL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/i;

/**
 * @route   GET /api/v1/certificates/verify/:certificateId
 * @desc    Public employer verification endpoint for issued Medical Excuse Duty Certificates.
 *          Rate-limited. Returns ONLY validity, regulatory credentials, and metadata.
 *          Never returns patient names, staff IDs, diagnoses, dates of leave, or any medical details.
 * @access  Public (Rate-limited)
 */
router.get('/verify/:certificateId', sensitiveRateLimiter(30), async (req, res, next) => {
  try {
    const rawId = String(req.params.certificateId || '').trim().toUpperCase();

    if (!rawId || !CERT_ID_PATTERN.test(rawId)) {
      return res.status(404).json({
        valid: false,
        status: 'invalid',
        certificateId: rawId || null,
      });
    }

    const record = await IssuedCertificate.findOne({ certificateId: rawId });
    if (!record) {
      return res.status(404).json({
        valid: false,
        status: 'invalid',
        certificateId: rawId,
      });
    }

    const intact = record.verifyIntegrity();
    if (!intact) {
      return res.status(404).json({
        valid: false,
        status: 'invalid',
        certificateId: rawId,
      });
    }

    if (record.revoked) {
      return res.status(404).json({
        valid: false,
        status: 'revoked',
        revoked: true,
        revokedAt: record.revokedAt ? record.revokedAt.toISOString() : null,
        certificateId: record.certificateId,
        clinicName: record.clinicName,
      });
    }

    return res.json({
      valid: true,
      status: 'valid',
      certificateId: record.certificateId,
      issuedAt: record.issuedAt.toISOString(),
      clinicName: record.clinicName,
      practiceRegNumber: record.practiceRegNumber || null,
      clinicianName: record.clinicianName || null,
      mdcNumber: record.mdcNumber || null,
      certificateType: record.certificateType || 'excuse_duty',
      durationDays: record.durationDays != null ? record.durationDays : null,
      consultationMode: record.consultationMode || null,
      fitnessStatus: record.fitnessStatus || null,
      reassessmentRequired: Number(record.schemaVersion) >= 3 ? Boolean(record.reassessmentRequired) : null,
      fileHashProtected: Boolean(record.pdfSha256),
      pdfSha256Prefix: record.pdfSha256 ? record.pdfSha256.slice(0, 12) : null,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   POST /api/v1/certificates/verify/:certificateId/hash
 * @desc    Public SHA-256 PDF file tamper verification. Accepts client-computed 64-hex SHA-256
 *          digest (no file bytes uploaded) and confirms byte-for-byte authenticity.
 * @access  Public (Rate-limited)
 */
router.post('/verify/:certificateId/hash', sensitiveRateLimiter(30), async (req, res, next) => {
  try {
    const rawId = String(req.params.certificateId || '').trim().toUpperCase();
    const rawHash = String(req.body?.sha256 || '').trim().toLowerCase();

    if (!rawId || !CERT_ID_PATTERN.test(rawId)) {
      return res.status(404).json({
        valid: false,
        status: 'invalid',
        hashMatches: false,
        certificateId: rawId || null,
      });
    }

    if (!rawHash || !SHA256_PATTERN.test(rawHash)) {
      return res.status(400).json({
        valid: false,
        error: 'INVALID_HASH',
        hashMatches: false,
        message: 'A valid 64-character SHA-256 hex digest is required.',
      });
    }

    const record = await IssuedCertificate.findOne({ certificateId: rawId });
    if (!record || !record.verifyIntegrity()) {
      return res.status(404).json({
        valid: false,
        status: 'invalid',
        hashMatches: false,
        certificateId: rawId,
      });
    }

    if (record.revoked) {
      return res.status(404).json({
        valid: false,
        status: 'revoked',
        revoked: true,
        hashMatches: false,
        certificateId: record.certificateId,
      });
    }

    if (!record.pdfSha256) {
      return res.json({
        valid: true,
        status: 'valid',
        hashProtected: false,
        hashMatches: null,
        message: 'This legacy certificate predates SHA-256 PDF file sealing.',
      });
    }

    let hashMatches = false;
    try {
      hashMatches = crypto.timingSafeEqual(
        Buffer.from(rawHash, 'hex'),
        Buffer.from(String(record.pdfSha256).toLowerCase(), 'hex')
      );
    } catch (e) {
      hashMatches = false;
    }

    return res.json({
      valid: true,
      status: 'valid',
      hashProtected: true,
      hashMatches,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
