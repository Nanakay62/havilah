'use strict';

const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  referenceCode: { type: String, required: true, unique: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  assignedAssessorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessor', required: true, index: true },
  departmentName: { type: String, default: 'General' },
  preferredTime: { type: String, default: 'As soon as available' },
  status: { type: String, enum: ['pending', 'scheduled', 'completed', 'cancelled'], default: 'pending' },
  billing: {
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'GHS' },
    isBilled: { type: Boolean, default: false },
    billedAt: { type: Date },
  },
  clinicalDetails: {
    patientName: { type: String, required: true },
    patientContact: { type: String, required: true },
    intakeNotes: { type: String },
    assessorNotes: { type: String },
    completedAt: { type: Date },
  },
  reassignedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessor' },
  reassignedAt: { type: Date },
}, { timestamps: true });

ReferralSchema.index({ tenantId: 1, status: 1 });
ReferralSchema.index({ assignedAssessorId: 1, status: 1 });

module.exports = mongoose.model('Referral', ReferralSchema);
