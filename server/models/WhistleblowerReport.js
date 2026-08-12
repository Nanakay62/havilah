'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * @fileoverview Anonymized Whistleblower / Hazard Escalation Report model.
 *
 * Privacy guarantees:
 *   - NO user_id field - structurally impossible to link to a submitter
 *   - NO IP address stored
 *   - Timestamp coarsened to nearest hour
 *   - Description encrypted at rest
 */

const WhistleblowerReportSchema = new mongoose.Schema(
  {
    report_id: {
      type: String,
      required: true,
      unique: true,
      default: () => 'WB-' + uuidv4().slice(0, 8).toUpperCase(),
    },
    company_id: {
      type: String,
      required: [true, 'company_id is required'],
      index: true,
    },
    category: {
      type: String,
      required: true,
      enum: {
        values: ['harassment', 'unsafe_conditions', 'systemic_burnout', 'discrimination', 'retaliation', 'other'],
        message: 'Invalid category',
      },
    },
    description_encrypted: {
      type: String,
      required: true,
    },
    description_iv: {
      type: String,
      required: true,
    },
    description_tag: {
      type: String,
      required: true,
    },
    urgency: {
      type: String,
      enum: ['standard', 'urgent', 'critical'],
      default: 'standard',
    },
    status: {
      type: String,
      enum: ['submitted', 'acknowledged', 'investigating', 'resolved'],
      default: 'submitted',
    },
    submitted_at: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: false, // No auto timestamps to prevent fingerprinting
    toJSON: { virtuals: false },
    toObject: { virtuals: false },
  }
);

WhistleblowerReportSchema.index({ company_id: 1, status: 1 });

module.exports = mongoose.model('WhistleblowerReport', WhistleblowerReportSchema);
