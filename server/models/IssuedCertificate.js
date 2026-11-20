'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const IssuedCertificateSchema = new mongoose.Schema({
  certificateId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  integrityHash: {
    type: String,
    required: true,
  },
  referralId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Referral',
    required: true,
    index: true,
  },
  assessorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessor',
    required: true,
    index: true,
  },
  doctorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Doctor',
    default: null,
  },
  certificateType: {
    type: String,
    enum: ['excuse_duty', 'light_duty', 'fit_to_return', 'attendance'],
    default: 'excuse_duty',
  },
  clinicName: {
    type: String,
    required: true,
    trim: true,
  },
  issuedAt: {
    type: Date,
    required: true,
    default: Date.now,
  },
  revoked: {
    type: Boolean,
    default: false,
  },
  revokedAt: {
    type: Date,
    default: null,
  },
}, { timestamps: true });

function getSigningSecret() {
  return process.env.CERTIFICATE_SIGNING_SECRET || process.env.JWT_SECRET || 'havilah-dev-cert-key';
}

/**
 * Compute tamper-evident HMAC-SHA256 integrity hash for an issued certificate.
 */
IssuedCertificateSchema.statics.computeIntegrityHash = function computeIntegrityHash({
  certificateId,
  referralId,
  assessorId,
  issuedAt,
}) {
  const payload = [
    String(certificateId),
    String(referralId),
    String(assessorId),
    new Date(issuedAt).toISOString(),
  ].join('|');
  return crypto.createHmac('sha256', getSigningSecret()).update(payload).digest('hex');
};

/**
 * Generate a tamper-evident human-readable certificate ID (HVL-XXXX-XXXX-CC).
 */
IssuedCertificateSchema.statics.generateCertificateId = function generateCertificateId() {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  const body = `HVL-${rand.slice(0, 4)}-${rand.slice(4, 8)}`;
  const check = crypto
    .createHmac('sha256', getSigningSecret())
    .update(body)
    .digest('hex')
    .slice(0, 4)
    .toUpperCase();
  return `${body}-${check}`;
};

/**
 * Verify that a stored certificate record has not been altered.
 */
IssuedCertificateSchema.methods.verifyIntegrity = function verifyIntegrity() {
  const expected = this.constructor.computeIntegrityHash({
    certificateId: this.certificateId,
    referralId: this.referralId,
    assessorId: this.assessorId,
    issuedAt: this.issuedAt,
  });
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(this.integrityHash || ''), 'hex'),
      Buffer.from(expected, 'hex')
    );
  } catch (e) {
    return false;
  }
};

module.exports = mongoose.model('IssuedCertificate', IssuedCertificateSchema);
