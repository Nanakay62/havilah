'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const PendingNotificationSchema = new mongoose.Schema({
  notification_id: {
    type: String,
    required: true,
    unique: true,
    default: uuidv4,
  },
  company_id: {
    type: String,
    required: true,
    index: true,
  },
  user_id: {
    type: String,
    required: true,
  },
  user_email_encrypted: {
    type: String,
    required: true,
  },
  user_email_iv: {
    type: String,
    required: true,
  },
  user_email_tag: {
    type: String,
    required: true,
  },
  survey_type: {
    type: String,
    required: true,
  },
  dispatch_at: {
    type: Date,
    required: true,
    index: true,
  },
  dispatched: {
    type: Boolean,
    default: false,
    index: true,
  },
  dispatched_at: {
    type: Date,
    default: null,
  },
  retry_count: {
    type: Number,
    default: 0,
  },
}, { timestamps: true });

PendingNotificationSchema.index({ dispatch_at: 1, dispatched: 1 });

module.exports = mongoose.model('PendingNotification', PendingNotificationSchema);
