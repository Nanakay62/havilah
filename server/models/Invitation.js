'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const InvitationSchema = new mongoose.Schema(
  {
    invitation_id: {
      type: String,
      required: true,
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
      default: null,
    },
    activation_code: {
      type: String,
      required: [true, 'activation_code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'active', 'used', 'expired', 'revoked'],
      default: 'active',
    },
    usage_count: {
      type: Number,
      default: 0,
    },
    emails_sent: {
      type: [String],
      default: [],
    },
    created_by: {
      type: String,
      default: null,
    },
    used_by_user_id: {
      type: String,
      default: null,
    },
    expires_at: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 15 * 24 * 60 * 60 * 1000), // 15 days
      index: { expireAfterSeconds: 0 },
    },
  },
  {
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  }
);

module.exports = mongoose.model('Invitation', InvitationSchema);
