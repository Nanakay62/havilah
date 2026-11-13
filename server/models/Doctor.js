'use strict';

const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  practiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessor',
    required: true,
    index: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    default: '',
    trim: true,
  },
  specialty: {
    type: String,
    default: 'Occupational Health Specialist',
    trim: true,
  },
  role: {
    type: String,
    enum: ['clinic_admin', 'doctor'],
    default: 'doctor',
  },
  active: {
    type: Boolean,
    default: true,
  },
  totp_enabled: { type: Boolean, default: false },
  totp_secret: { type: String, default: null },
  totp_pending_secret: { type: String, default: null },
  totp_recovery_codes_hashes: { type: [String], default: [] },
  password_reset_token_hash: { type: String, default: null, index: true },
  password_reset_expires_at: { type: Date, default: null },
}, { timestamps: true });

DoctorSchema.index({ practiceId: 1, active: 1 });

module.exports = mongoose.model('Doctor', DoctorSchema);
