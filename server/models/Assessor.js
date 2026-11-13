'use strict';

const mongoose = require('mongoose');

const AssessorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  organization: { type: String, default: '' }, // clinic/practice name
  phone: { type: String, default: '' },
  notificationEmail: { type: String, default: '' },
  address: { type: String, default: '' },
  billingSettings: {
    defaultRate: { type: Number, default: 450, min: 0 },
    defaultCurrency: { type: String, default: 'GHS' },
    taxId: { type: String, default: '' },
    taxRate: { type: Number, default: 0, min: 0 },
    paymentInstructions: { type: String, default: '' },
  },
  authorizedTenants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }],
  active: { type: Boolean, default: true },
  totp_enabled: { type: Boolean, default: false },
  totp_secret: { type: String, default: null },
  totp_pending_secret: { type: String, default: null },
  totp_recovery_codes_hashes: { type: [String], default: [] },
  password_reset_token_hash: { type: String, default: null, index: true },
  password_reset_expires_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model('Assessor', AssessorSchema);
