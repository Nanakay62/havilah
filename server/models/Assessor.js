'use strict';

const mongoose = require('mongoose');

const AssessorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  organization: { type: String }, // clinic/practice name
  authorizedTenants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Tenant' }],
  active: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('Assessor', AssessorSchema);
