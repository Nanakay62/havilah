'use strict';

const mongoose = require('mongoose');

const demoLeadSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  requestedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['new', 'contacted', 'scheduled'],
    default: 'new'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('DemoLead', demoLeadSchema);
