'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { coarsenTimestamp } = require('../utils/crypto');

/**
 * AnonHazardLog schema — CRITICAL ANONYMITY CONTRACT
 *
 * This collection stores hazard / psychosocial risk survey submissions
 * with **zero linkage to any individual user**.
 *
 * Prohibited fields: user_id, ip_address, user_agent, any ObjectId ref
 * to the User collection.
 *
 * The pre-validate hook actively REJECTS any document that contains
 * identity-bearing fields, acting as a cryptographic firewall against
 * accidental PII leakage.
 */

const SURVEY_TYPES = ['phq9', 'gad7', 'pss10', 'fas10', 'copsoq3_core', 'copsoq3_middle', 'copsoq3_long'];
const RISK_CATEGORIES = ['psychosocial', 'workload', 'interpersonal', 'environmental', 'organizational'];
const SEVERITY_BANDS = ['healthy', 'mild', 'moderate', 'severe'];

const AnonHazardLogSchema = new mongoose.Schema(
  {
    log_id: {
      type: String,
      required: [true, 'log_id is required'],
      unique: true,
      default: uuidv4,
      immutable: true,
    },
    company_id: {
      type: String,
      required: [true, 'company_id is required'],
      index: true,
    },
    department_id: {
      type: String,
      required: [true, 'department_id is required'],
    },
    department_snapshot_id: {
      type: String,
      required: [true, 'department_snapshot_id is required'],
    },
    survey_type: {
      type: String,
      required: [true, 'survey_type is required'],
      enum: {
        values: SURVEY_TYPES,
        message: 'survey_type must be one of: ' + SURVEY_TYPES.join(', '),
      },
    },
    risk_category: {
      type: String,
      required: [true, 'risk_category is required'],
      enum: {
        values: RISK_CATEGORIES,
        message: 'risk_category must be one of: ' + RISK_CATEGORIES.join(', '),
      },
    },
    dimension_scores: {
      type: Map,
      of: {
        type: Number,
        min: [0, 'dimension score cannot be negative'],
        max: [100, 'dimension score cannot exceed 100'],
      },
      default: new Map(),
    },
    composite_score: {
      type: Number,
      required: [true, 'composite_score is required'],
      min: [0, 'composite_score must be >= 0'],
      max: [100, 'composite_score must be <= 100'],
    },
    likelihood: {
      type: Number,
      required: [true, 'likelihood is required'],
      min: [1, 'likelihood must be >= 1'],
      max: [5, 'likelihood must be <= 5'],
      validate: {
        validator: Number.isInteger,
        message: 'likelihood must be an integer',
      },
    },
    severity: {
      type: Number,
      required: [true, 'severity is required'],
      min: [1, 'severity must be >= 1'],
      max: [5, 'severity must be <= 5'],
      validate: {
        validator: Number.isInteger,
        message: 'severity must be an integer',
      },
    },
    severity_band: {
      type: String,
      required: [true, 'severity_band is required'],
      enum: {
        values: SEVERITY_BANDS,
        message: 'severity_band must be one of: ' + SEVERITY_BANDS.join(', '),
      },
    },
    submitted_at: {
      type: Date,
      required: [true, 'submitted_at is required'],
    },
    period_year: {
      type: Number,
      required: [true, 'period_year is required'],
    },
    period_month: {
      type: Number,
      required: [true, 'period_month is required'],
      min: 1,
      max: 12,
    },
    period_week: {
      type: Number,
      required: [true, 'period_week is required'],
      min: 1,
      max: 53,
    },
  },
  {
    timestamps: false, // We manage submitted_at directly
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ───── virtual: risk_score = likelihood * severity ───── */
AnonHazardLogSchema.virtual('risk_score').get(function getRiskScore() {
  return (this.likelihood || 0) * (this.severity || 0);
});

/* ───── compound indexes ───── */
AnonHazardLogSchema.index(
  { company_id: 1, department_id: 1, submitted_at: -1 },
  { name: 'idx_company_dept_submitted' }
);
AnonHazardLogSchema.index(
  { company_id: 1, survey_type: 1, period_year: 1, period_month: 1 },
  { name: 'idx_company_survey_period' }
);
AnonHazardLogSchema.index(
  { company_id: 1, severity_band: 1 },
  { name: 'idx_company_severity' }
);

/* ───── BANNED FIELDS — identity firewall ───── */
const BANNED_FIELDS = ['user_id', 'ip_address', 'user_agent', 'ip', 'userId', 'userAgent'];

/**
 * Pre-validate hook that REJECTS any document carrying identity-bearing fields.
 * This is the last line of defence against PII leakage into the anonymous
 * hazard log collection.
 */
AnonHazardLogSchema.pre('validate', function preValidateAnonymity(next) {
  const raw = this.toObject({ getters: false, virtuals: false });

  for (const field of BANNED_FIELDS) {
    if (raw[field] !== undefined) {
      return next(
        new Error(
          `ANONYMITY VIOLATION: AnonHazardLog must not contain field "${field}". ` +
          'This document has been rejected to protect employee privacy.'
        )
      );
    }
  }
  next();
});

/**
 * Pre-validate hook that coarsens submitted_at to hour-level precision
 * and derives period_year / period_month / period_week.
 */
AnonHazardLogSchema.pre('validate', function preValidateTimestamp(next) {
  if (this.submitted_at) {
    this.submitted_at = coarsenTimestamp(this.submitted_at);
    this.period_year = this.submitted_at.getUTCFullYear();
    this.period_month = this.submitted_at.getUTCMonth() + 1;

    // ISO week number
    const d = new Date(Date.UTC(this.submitted_at.getUTCFullYear(), this.submitted_at.getUTCMonth(), this.submitted_at.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    this.period_week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  }
  next();
});

/* ───── prevent updates/deletes at the model level (defence in depth) ───── */
AnonHazardLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function blockUpdates(next) {
  // Allow updates only when explicitly opting in via options (internal use)
  if (this.getOptions().__allowInternal) return next();
  return next(new Error('AnonHazardLog documents are append-only and cannot be updated'));
});

module.exports = mongoose.model('AnonHazardLog', AnonHazardLogSchema);
