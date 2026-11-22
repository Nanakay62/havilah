'use strict';

const mongoose = require('mongoose');
const crypto = require('crypto');

const IssuedCertificateSchema = new mongoose.Schema({
  schemaVersion: {
    type: Number,
    default: 1,
  },
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
  practiceRegNumber: {
    type: String,
    default: '',
    trim: true,
  },
  clinicianName: {
    type: String,
    default: '',
    trim: true,
  },
  clinicianSpecialty: {
    type: String,
    default: '',
    trim: true,
  },
  mdcNumber: {
    type: String,
    default: '',
    trim: true,
  },
  consultationDate: {
    type: String,
    default: '',
    trim: true,
  },
  consultationMode: {
    type: String,
    enum: ['in_person', 'telehealth'],
    default: 'in_person',
  },
  startDate: {
    type: String,
    default: '',
    trim: true,
  },
  endDate: {
    type: String,
    default: '',
    trim: true,
  },
  durationDays: {
    type: Number,
    default: null,
  },
  returnDate: {
    type: String,
    default: '',
    trim: true,
  },
  isBackdated: {
    type: Boolean,
    default: false,
  },
  hrSafePrivacy: {
    type: Boolean,
    default: true,
  },
  attestationConfirmed: {
    type: Boolean,
    default: false,
  },
  attestationIp: {
    type: String,
    default: '',
  },
  twoFactorVerified: {
    type: Boolean,
    default: false,
  },
  pdfSha256: {
    type: String,
    default: '',
    trim: true,
    lowercase: true,
  },
  pdfSealedAt: {
    type: Date,
    default: null,
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
  revokedReason: {
    type: String,
    default: '',
    trim: true,
  },
  revokedBy: {
    type: String,
    default: '',
    trim: true,
  },
}, { timestamps: true });

let warnedMissingCertSecret = false;

function getSigningSecret() {
  if (!process.env.CERTIFICATE_SIGNING_SECRET && process.env.NODE_ENV === 'production' && !warnedMissingCertSecret) {
    warnedMissingCertSecret = true;
    console.warn('[IssuedCertificate] SECURITY WARNING: CERTIFICATE_SIGNING_SECRET is not set in production; falling back to JWT_SECRET.');
  }
  return process.env.CERTIFICATE_SIGNING_SECRET || process.env.JWT_SECRET || 'havilah-dev-cert-key';
}

/**
 * Compute tamper-evident HMAC-SHA256 integrity hash for an issued certificate.
 */
IssuedCertificateSchema.statics.computeIntegrityHash = function computeIntegrityHash(params = {}) {
  const {
    schemaVersion,
    certificateId,
    referralId,
    assessorId,
    doctorId,
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
    pdfSha256,
  } = params;

  let payload;
  if (Number(schemaVersion) === 2) {
    payload = [
      'v2',
      String(certificateId || ''),
      String(referralId || ''),
      String(assessorId || ''),
      String(doctorId || ''),
      String(certificateType || 'excuse_duty'),
      String(clinicName || ''),
      String(practiceRegNumber || ''),
      String(clinicianName || ''),
      String(mdcNumber || ''),
      String(consultationDate || ''),
      String(consultationMode || 'in_person'),
      String(startDate || ''),
      String(endDate || ''),
      durationDays == null ? '' : String(durationDays),
      String(returnDate || ''),
      new Date(issuedAt).toISOString(),
      String(pdfSha256 || '').toLowerCase(),
    ].join('|');
  } else {
    payload = [
      String(certificateId),
      String(referralId),
      String(assessorId),
      new Date(issuedAt).toISOString(),
    ].join('|');
  }
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
  const version = Number(this.schemaVersion) === 2 ? 2 : 1;
  const expected = this.constructor.computeIntegrityHash(
    version === 2
      ? {
          schemaVersion: 2,
          certificateId: this.certificateId,
          referralId: this.referralId,
          assessorId: this.assessorId,
          doctorId: this.doctorId,
          certificateType: this.certificateType,
          clinicName: this.clinicName,
          practiceRegNumber: this.practiceRegNumber,
          clinicianName: this.clinicianName,
          mdcNumber: this.mdcNumber,
          consultationDate: this.consultationDate,
          consultationMode: this.consultationMode,
          startDate: this.startDate,
          endDate: this.endDate,
          durationDays: this.durationDays,
          returnDate: this.returnDate,
          issuedAt: this.issuedAt,
          pdfSha256: this.pdfSha256,
        }
      : {
          certificateId: this.certificateId,
          referralId: this.referralId,
          assessorId: this.assessorId,
          issuedAt: this.issuedAt,
        }
  );
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
