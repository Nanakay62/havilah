'use strict';

const mongoose = require('mongoose');

const DoctorSchema = new mongoose.Schema({
  practiceId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assessor',
    required: true,
    index: true,
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  phone: {
    type: String,
    default: '',
    trim: true,
  },
  specialty: {
    type: String,
    default: 'Occupational Health Specialist',
    trim: true,
  },
  role: {
    type: String,
    enum: ['clinic_admin', 'doctor'],
    default: 'doctor',
  },
  active: {
    type: Boolean,
    default: true,
  },
}, { timestamps: true });

DoctorSchema.index({ practiceId: 1, active: 1 });

module.exports = mongoose.model('Doctor', DoctorSchema);
