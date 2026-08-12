'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { computeAuditHash } = require('../utils/crypto');

/**
 * AuditLog schema - SHA-256 hash-chained, immutable audit trail.
 *
 * Every entry chains its hash to the previous entry's hash, forming a
 * tamper-evident linked list.  All update and delete operations are
 * disabled at the Mongoose middleware and static level.
 */

const EVENT_TYPES = [
  'control_activated',
  'control_deactivated',
  'onboarding_completed',
  'department_restructured',
  'seat_limit_changed',
  'tenant_state_changed',
  'survey_dispatched',
  'consent_accepted',
  'consent_rejected',
  'bulk_import_executed',
  'global_defaults_updated',
  'invite_generated',
  'invite_revoked'
];

const AuditLogSchema = new mongoose.Schema(
  {
    audit_id: {
      type: String,
      required: [true, 'audit_id is required'],
      unique: true,
      default: uuidv4,
      immutable: true,
    },
    company_id: {
      type: String,
      required: [true, 'company_id is required'],
      index: true,
      immutable: true,
    },
    actor_user_id: {
      type: String,
      required: [true, 'actor_user_id is required'],
      immutable: true,
    },
    actor_role: {
      type: String,
      required: [true, 'actor_role is required'],
      immutable: true,
    },
    event_type: {
      type: String,
      required: [true, 'event_type is required'],
      enum: {
        values: EVENT_TYPES,
        message: 'event_type must be one of: ' + EVENT_TYPES.join(', '),
      },
      immutable: true,
    },
    event_payload: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'event_payload is required'],
      immutable: true,
    },
    previous_hash: {
      type: String,
      default: 'GENESIS',
      immutable: true,
    },
    sha256_hash: {
      type: String,
      required: [true, 'sha256_hash is required'],
      immutable: true,
    },
    created_at: {
      type: Date,
      default: Date.now,
      immutable: true,
    },
  },
  {
    timestamps: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ───── compound indexes ───── */
AuditLogSchema.index(
  { company_id: 1, created_at: -1 },
  { name: 'idx_company_created' }
);
AuditLogSchema.index(
  { company_id: 1, event_type: 1 },
  { name: 'idx_company_event_type' }
);

/* ───── DISABLE all update operations ───── */
const BLOCK_MSG = 'AuditLog is immutable - update and delete operations are forbidden';

AuditLogSchema.pre('updateOne', function blockUpdateOne(next) {
  return next(new Error(BLOCK_MSG));
});

AuditLogSchema.pre('updateMany', function blockUpdateMany(next) {
  return next(new Error(BLOCK_MSG));
});

AuditLogSchema.pre('findOneAndUpdate', function blockFindOneAndUpdate(next) {
  return next(new Error(BLOCK_MSG));
});

AuditLogSchema.pre('findOneAndReplace', function blockFindOneAndReplace(next) {
  return next(new Error(BLOCK_MSG));
});

AuditLogSchema.pre('findOneAndDelete', function blockFindOneAndDelete(next) {
  return next(new Error(BLOCK_MSG));
});

AuditLogSchema.pre('deleteOne', function blockDeleteOne(next) {
  return next(new Error(BLOCK_MSG));
});

AuditLogSchema.pre('deleteMany', function blockDeleteMany(next) {
  return next(new Error(BLOCK_MSG));
});

/* ───── pre-save: freeze payload, compute hash chain ───── */
AuditLogSchema.pre('save', async function preSaveAuditHash(next) {
  if (!this.isNew) {
    return next(new Error(BLOCK_MSG));
  }

  // Deep-freeze the event payload to prevent mutation after persistence
  if (this.event_payload && typeof this.event_payload === 'object') {
    this.event_payload = JSON.parse(JSON.stringify(this.event_payload));
    Object.freeze(this.event_payload);
  }

  // Retrieve the most recent audit entry for this company to chain the hash
  if (!this.sha256_hash) {
    try {
      const AuditLogModel = mongoose.model('AuditLog');
      const lastEntry = await AuditLogModel
        .findOne({ company_id: this.company_id })
        .sort({ created_at: -1 })
        .select('sha256_hash')
        .lean();

      this.previous_hash = lastEntry ? lastEntry.sha256_hash : 'GENESIS';
      this.sha256_hash = computeAuditHash(this.previous_hash, this.event_payload);
    } catch (err) {
      return next(err);
    }
  }

  next();
});

/* ───── statics ───── */

/**
 * Appends a new, hash-chained audit entry.
 *
 * @param {object} params
 * @param {string} params.company_id
 * @param {string} params.actor_user_id
 * @param {string} params.actor_role
 * @param {string} params.event_type
 * @param {object} params.event_payload
 * @returns {Promise<mongoose.Document>}
 */
AuditLogSchema.statics.append = async function append({
  company_id,
  actor_user_id,
  actor_role,
  event_type,
  event_payload,
}) {
  const entry = new this({
    company_id,
    actor_user_id,
    actor_role,
    event_type,
    event_payload,
  });

  return entry.save();
};

/**
 * Verifies the full hash chain for a tenant's audit log.
 *
 * @param {string} companyId
 * @returns {Promise<{ valid: boolean, entries_checked: number, broken_at: string|null }>}
 */
AuditLogSchema.statics.verifyChain = async function verifyChain(companyId) {
  const entries = await this
    .find({ company_id: companyId })
    .sort({ created_at: 1 })
    .select('audit_id previous_hash sha256_hash event_payload')
    .lean();

  if (entries.length === 0) {
    return { valid: true, entries_checked: 0, broken_at: null };
  }

  let previousHash = 'GENESIS';

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];

    // Verify the chain link
    if (entry.previous_hash !== previousHash) {
      return {
        valid: false,
        entries_checked: i + 1,
        broken_at: entry.audit_id,
        error: `Entry ${entry.audit_id} previous_hash mismatch: expected "${previousHash}", got "${entry.previous_hash}"`,
      };
    }

    // Recompute and verify the hash
    const expectedHash = computeAuditHash(entry.previous_hash, entry.event_payload);
    if (entry.sha256_hash !== expectedHash) {
      return {
        valid: false,
        entries_checked: i + 1,
        broken_at: entry.audit_id,
        error: `Entry ${entry.audit_id} sha256_hash mismatch: hash has been tampered with`,
      };
    }

    previousHash = entry.sha256_hash;
  }

  return { valid: true, entries_checked: entries.length, broken_at: null };
};

module.exports = mongoose.model('AuditLog', AuditLogSchema);
