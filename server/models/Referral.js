'use strict';

const mongoose = require('mongoose');

const ReferralSchema = new mongoose.Schema({
  referenceCode: { type: String, required: true, unique: true, index: true },
  tenantId: { type: mongoose.Schema.Types.ObjectId, ref: 'Tenant', required: true, index: true },
  assignedAssessorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessor', required: true, index: true },
  assignedDoctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null, index: true },
  delegatedAt: { type: Date, default: null },
  delegatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Doctor', default: null },
  departmentName: { type: String, default: 'General' },
  preferredTime: { type: String, default: 'As soon as available' },
  status: { type: String, enum: ['pending', 'scheduled', 'completed', 'cancelled', 'archived'], default: 'pending' },
  previousStatus: { type: String, default: 'pending' },
  scheduledAt: { type: Date, default: null },
  appointmentNotes: { type: String, default: '' },
  billing: {
    amount: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'GHS' },
    isBilled: { type: Boolean, default: false },
    billedAt: { type: Date },
    settlementStatus: {
      type: String,
      enum: ['unbilled', 'pending_payment', 'settled'],
      default: 'unbilled',
    },
    settledAt: { type: Date, default: null },
  },
  clinicalDetails: {
    patientName: { type: String, required: true },
    patientContact: { type: String, required: true },
    intakeNotes: { type: String },
    assessorNotes: { type: String },
    meetingLink: { type: String, trim: true, default: '' },
    completedAt: { type: Date },
    attachments: [{
      fileName: { type: String, required: true },
      fileData: { type: String, required: true }, // Base64 / data URI
      fileType: { type: String },
      fileSize: { type: Number },
      uploadedAt: { type: Date, default: Date.now },
    }],
  },
  thread: [{
    sender: { type: String, enum: ['employee', 'assessor'], required: true },
    senderName: { type: String, trim: true, default: '' },
    message: { type: String, required: true, trim: true },
    timestamp: { type: Date, default: Date.now },
  }],
  reassignedFrom: { type: mongoose.Schema.Types.ObjectId, ref: 'Assessor' },
  reassignedAt: { type: Date },
}, { timestamps: true });

ReferralSchema.index({ tenantId: 1, status: 1 });
ReferralSchema.index({ assignedAssessorId: 1, status: 1 });
ReferralSchema.index({ assignedDoctorId: 1, status: 1 });
ReferralSchema.index({ assignedAssessorId: 1, assignedDoctorId: 1 });

module.exports = mongoose.model('Referral', ReferralSchema);
