'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * @typedef {Object} SSOConfig
 * @property {boolean}  enabled
 * @property {string}   provider
 * @property {string}   entity_id
 * @property {string}   acs_url
 * @property {string}   certificate_fingerprint
 * @property {string}   metadata_url
 */

/**
 * @typedef {Object} TenantSettings
 * @property {string}   default_timezone
 * @property {number}   work_hours_start
 * @property {number}   work_hours_end
 * @property {boolean}  exclude_weekends
 * @property {number}   n_size_threshold
 */

/**
 * @typedef {Object} HotlineConfig
 * @property {string}   eap_number
 * @property {string}   crisis_number
 * @property {string}   occupational_health_contact
 */

/**
 * @typedef {Object} ResourceLink
 * @property {string}   id
 * @property {string}   title
 * @property {string}   url
 * @property {string}   type
 */

const SSOConfigSchema = new mongoose.Schema(
  {
    enabled: { type: Boolean, default: false },
    provider: {
      type: String,
      trim: true,
      default: '',
    },
    entity_id: { type: String, trim: true, default: '' },
    acs_url: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator(v) {
          if (!v) return true;
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
        message: 'acs_url must be a valid URL',
      },
    },
    certificate_fingerprint: { type: String, trim: true, default: '' },
    metadata_url: {
      type: String,
      trim: true,
      default: '',
      validate: {
        validator(v) {
          if (!v) return true;
          try {
            new URL(v);
            return true;
          } catch {
            return false;
          }
        },
        message: 'metadata_url must be a valid URL',
      },
    },
  },
  { _id: false }
);

const SettingsSchema = new mongoose.Schema(
  {
    default_timezone: {
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
    work_hours_start: {
      type: Number,
      default: 9,
      min: [0, 'work_hours_start must be >= 0'],
      max: [23, 'work_hours_start must be <= 23'],
      validate: {
        validator: Number.isInteger,
        message: 'work_hours_start must be an integer',
      },
    },
    work_hours_end: {
      type: Number,
      default: 17,
      min: [1, 'work_hours_end must be >= 1'],
      max: [24, 'work_hours_end must be <= 24'],
      validate: {
        validator: Number.isInteger,
        message: 'work_hours_end must be an integer',
      },
    },
    exclude_weekends: { type: Boolean, default: true },
    n_size_threshold: {
      type: Number,
      default: 5,
      min: [2, 'n_size_threshold must be >= 2'],
      validate: {
        validator: Number.isInteger,
        message: 'n_size_threshold must be an integer',
      },
    },
    default_lock_policy: {
      phq9: { type: String, enum: ['locked', 'unlocked'], default: 'locked' },
      gad7: { type: String, enum: ['locked', 'unlocked'], default: 'locked' },
      pss10: { type: String, enum: ['locked', 'unlocked'], default: 'locked' },
      fas10: { type: String, enum: ['locked', 'unlocked'], default: 'locked' },
      copsoq3: { type: String, enum: ['locked', 'unlocked'], default: 'locked' },
      copsoq_depth: { type: String, enum: ['core', 'middle', 'long'], default: 'core' }
    }
  },
  { _id: false }
);

const HotlineConfigSchema = new mongoose.Schema(
  {
    eap_number: { type: String, trim: true, default: '' },
    crisis_number: { type: String, trim: true, default: '988' },
    occupational_health_contact: { type: String, trim: true, default: '' },
  },
  { _id: false }
);

const ResourceLinkSchema = new mongoose.Schema(
  {
    id: { type: String, trim: true, required: true },
    title: { type: String, trim: true, required: true },
    url: { type: String, trim: true, required: true },
    type: { type: String, trim: true, default: 'link' },
  },
  { _id: false }
);

const SubscriptionSchema = new mongoose.Schema(
  {
    tier: {
      type: String,
      enum: ['free', 'starter', 'pro', 'enterprise'],
      default: 'pro',
    },
    status: {
      type: String,
      enum: ['trialing', 'active', 'past_due', 'canceled'],
      default: 'trialing',
    },
    trialEndsAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    currentPeriodEnd: { type: Date },
    customerId: { type: String, default: null },
    subscriptionCode: { type: String, default: null },
    maxEmployees: { type: Number, default: 100 },
  },
  { _id: false }
);

/**
 * Tenant / Company schema - root entity of the multi-tenant hierarchy.
 */
const TenantSchema = new mongoose.Schema(
  {
    company_id: {
      type: String,
      required: [true, 'company_id is required'],
      unique: true,
      default: uuidv4,
      immutable: true,
      validate: {
        validator(v) {
          return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        },
        message: 'company_id must be a valid UUID v4',
      },
    },
    company_name: {
      type: String,
      required: [true, 'company_name is required'],
      trim: true,
      minlength: [2, 'company_name must be at least 2 characters'],
      maxlength: [256, 'company_name must be at most 256 characters'],
    },
    slug: {
      type: String,
      required: [true, 'slug is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'slug must be a valid subdomain label'],
    },
    billing_tier: {
      type: String,
      required: true,
      enum: {
        values: ['trial', 'starter', 'professional', 'enterprise'],
        message: 'billing_tier must be one of: trial, starter, professional, enterprise',
      },
      default: 'trial',
    },
    subscription: {
      type: SubscriptionSchema,
      default: () => ({}),
    },
    domain: {
      type: String,
      trim: true,
    },
    active_modules: {
      copsoq: { type: Boolean, default: true },
      pss10: { type: Boolean, default: true },
      phq9: { type: Boolean, default: true },
      fas: { type: Boolean, default: true }
    },
    allowed_modules: {
      type: [String],
      default: ['DAILY_PULSE', 'PHQ-9', 'GAD-7', 'PSS-10', 'FAS-10', 'COPSOQ_III']
    },
    max_allowed_seats: {
      type: Number,
      required: [true, 'max_allowed_seats is required'],
      default: 100,
      min: [1, 'max_allowed_seats must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'max_allowed_seats must be an integer',
      },
    },
    used_seats: {
      type: Number,
      default: 0,
      min: [0, 'used_seats cannot be negative'],
      validate: {
        validator: Number.isInteger,
        message: 'used_seats must be an integer',
      },
    },
    lifecycle_state: {
      type: String,
      required: true,
      enum: {
        values: ['pending_setup', 'active', 'suspended', 'churned', 'expired'],
        message: 'lifecycle_state must be one of: pending_setup, active, suspended, churned, expired',
      },
      default: 'pending_setup',
    },
    locked_at: { type: Date, default: null },
    access_expires_at: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
    sso_config: {
      type: SSOConfigSchema,
      default: () => ({}),
    },
    settings: {
      type: SettingsSchema,
      default: () => ({}),
    },
    hotline_config: {
      type: HotlineConfigSchema,
      default: () => ({}),
    },
    resource_links: {
      type: [ResourceLinkSchema],
      default: () => [],
    },
    activeAssessorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assessor',
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Resolves the effective tier:
 * If subscription.status === 'trialing':
 *   If new Date() < new Date(subscription.trialEndsAt), effective tier is 'pro'.
 *   If trial expired, effective tier gracefully falls back to 'free'.
 * Else return subscription.tier || 'free'.
 */
TenantSchema.methods.getEffectiveTier = function getEffectiveTier() {
  if (!this.subscription) return 'pro';
  if (this.subscription.status === 'trialing') {
    const trialEnd = this.subscription.trialEndsAt ? new Date(this.subscription.trialEndsAt) : null;
    if (trialEnd && new Date() < trialEnd) {
      return 'pro';
    }
    return 'free';
  }
  return this.subscription.tier || 'free';
};

TenantSchema.virtual('effectiveTier').get(function () {
  return this.getEffectiveTier();
});

/* ───── indexes ───── */
TenantSchema.index({ company_id: 1 }, { unique: true, name: 'idx_company_id_unique' });
TenantSchema.index(
  { company_name: 'text' },
  { name: 'idx_company_name_text', weights: { company_name: 10 } }
);

/* ───── pre-save validation: used_seats <= max_allowed_seats ───── */
TenantSchema.pre('save', function preSaveTenantValidation(next) {
  if (this.used_seats > this.max_allowed_seats) {
    return next(new Error('used_seats cannot exceed max_allowed_seats'));
  }
  if (this.settings && this.settings.work_hours_start >= this.settings.work_hours_end) {
    return next(new Error('work_hours_start must be less than work_hours_end'));
  }
  next();
});

module.exports = mongoose.model('Tenant', TenantSchema);
