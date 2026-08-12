'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const { encryptField, hashField } = require('../utils/crypto');

/**
 * User schema - represents an employee or admin within a tenant.
 *
 * Email is stored twice:
 *   1. `email_encrypted` - AES-256-GCM ciphertext for retrieval
 *   2. `email_hash` - SHA-256 digest for deterministic lookup without decryption
 *
 * The pre-save hook automatically encrypts and hashes the email when a
 * transient `_plaintext_email` property is set on the document.
 */
const UserSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: [true, 'user_id is required'],
      unique: true,
      default: uuidv4,
      immutable: true,
      validate: {
        validator(v) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'user_id must be a valid UUID v4',
      },
    },
    company_id: {
      type: String,
      required: function() { return this.role !== 'super_admin'; },
      index: true,
    },
    department_id: {
      type: String,
      default: 'unassigned',
    },
    email_encrypted: {
      type: String,
      required: [true, 'email_encrypted is required'],
    },
    email_hash: {
      type: String,
      required: [true, 'email_hash is required'],
      index: true,
    },
    full_name: {
      type: String,
      required: [true, 'full_name is required'],
      trim: true,
      minlength: [1, 'full_name must not be empty'],
      maxlength: [512, 'full_name must be at most 512 characters'],
    },
    role: {
      type: String,
      required: true,
      enum: {
        values: ['employee', 'hr_admin', 'tenant_admin', 'super_admin'],
        message: 'role must be one of: employee, hr_admin, tenant_admin, super_admin',
      },
      default: 'employee',
    },
    supportConfiguration: {
      eapPhoneNumber: { type: String, default: null },
      eapCustomLabel: { type: String, default: 'Talk to our company EAP Counselor' },
      localEmergencyNumber: { type: String, default: '988' },
      occupationalHealthEmail: { type: String, default: null }
    },
    status: {
      type: String,
      required: true,
      enum: {
        values: ['pending_consent', 'active', 'deactivated'],
        message: 'status must be one of: pending_consent, active, deactivated',
      },
      default: 'pending_consent',
    },
    passwordHash: {
      type: String,
      required: [true, 'passwordHash is required'],
    },
    timezone: {
      type: String,
      default: 'UTC',
      trim: true,
      validate: {
        validator(v) {
          try {
            Intl.DateTimeFormat(undefined, { timeZone: v });
            return true;
          } catch {
            return false;
          }
        },
        message: (props) => `${props.value} is not a valid IANA timezone`,
      },
    },
    baseline_profile: {
      mood: { type: Number, min: 0, max: 100, default: null },
      calm: { type: Number, min: 0, max: 100, default: null },
      stress: { type: Number, min: 0, max: 100, default: null },
      energy: { type: Number, min: 0, max: 100, default: null },
      work_fit: { type: Number, min: 0, max: 100, default: null },
      last_updated: { type: Date, default: null },
    },
    last_login_at: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        // Never leak encrypted email or hash or password in JSON responses
        delete ret.email_encrypted;
        delete ret.email_hash;
        delete ret.passwordHash;
        delete ret.__v;
        return ret;
      },
    },
    toObject: { virtuals: true },
  }
);

/* ───── compound indexes ───── */
UserSchema.index(
  { company_id: 1, user_id: 1 },
  { unique: true, name: 'idx_company_user_unique' }
);
UserSchema.index(
  { company_id: 1, department_id: 1 },
  { name: 'idx_company_department' }
);
UserSchema.index(
  { email_hash: 1 },
  { unique: true, name: 'idx_email_hash_unique' }
);

/* ───── pre-save hook: auto-encrypt email & hash password ───── */
UserSchema.pre('save', async function preSaveEncryptEmail(next) {
  /**
   * To trigger encryption, callers set `doc._plaintext_email = 'user@example.com'`
   * before calling `doc.save()`.  This avoids requiring the plaintext as a
   * schema field (which would persist it).
   */
  const plaintext = this._plaintext_email;
  if (plaintext) {
    try {
      const normalised = plaintext.trim().toLowerCase();
      const { iv, encrypted, authTag } = encryptField(normalised);
      this.email_encrypted = JSON.stringify({ iv, encrypted, authTag });
      this.email_hash = hashField(normalised);
      // Clear transient property so it is never persisted
      this._plaintext_email = undefined;
    } catch (err) {
      return next(err);
    }
  }
  
  const plainPassword = this._plaintext_password;
  if (plainPassword) {
    try {
      const salt = await bcrypt.genSalt(10);
      this.passwordHash = await bcrypt.hash(plainPassword, salt);
      this._plaintext_password = undefined;
    } catch (err) {
      return next(err);
    }
  }

  next();
});

/* ───── statics ───── */

/**
 * Find a user by their email without requiring the plaintext to be stored.
 *
 * @param {string} email - plaintext email to look up
 * @returns {Promise<mongoose.Document|null>}
 */
UserSchema.statics.findByEmail = function findByEmail(email) {
  const hash = hashField(email.trim().toLowerCase());
  return this.findOne({ email_hash: hash });
};

module.exports = mongoose.model('User', UserSchema);
