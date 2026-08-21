'use strict';

const mongoose = require('mongoose');

const ReportSchema = new mongoose.Schema(
  {
    trackingCode: { type: String, required: true, unique: true, index: true },
    pinHash: { type: String, required: true },
    tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
    category: { type: String, required: true },
    description: { type: String, required: true },
    urgency: { type: String, enum: ['Standard', 'Urgent', 'Critical'], default: 'Standard' },
    involvesLeadershipOrHR: { type: Boolean, default: false, index: true },
    status: {
      type: String,
      enum: ['submitted', 'under_investigation', 'action_taken', 'closed'],
      default: 'submitted',
    },
    thread: [
      {
        sender: { type: String, enum: ['whistleblower', 'investigator'], required: true },
        message: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

ReportSchema.index({ tenantId: 1, involvesLeadershipOrHR: 1, status: 1 });

module.exports = mongoose.model('Report', ReportSchema);
