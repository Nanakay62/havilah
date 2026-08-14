'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const PersonalWellnessLogSchema = new mongoose.Schema(
  {
    log_id: {
      type: String,
      required: true,
      unique: true,
      default: uuidv4,
      immutable: true,
    },
    user_id: {
      type: String,
      required: true,
      index: true,
    },
    company_id: {
      type: String,
      required: true,
      index: true,
    },
    dimension_scores: {
      mood: { type: Number, min: 0, max: 100, default: null },
      calm: { type: Number, min: 0, max: 100, default: null },
      stress: { type: Number, min: 0, max: 100, default: null },
      energy: { type: Number, min: 0, max: 100, default: null },
      work_fit: { type: Number, min: 0, max: 100, default: null },
    },
    survey_type: {
      type: String,
      required: true,
    },
    composite_score: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    overallIndex: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },
    clinical_score: {
      type: Number,
      default: null,
    },
    max_score: {
      type: Number,
      default: null,
    },
    severity_label: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: { createdAt: 'submitted_at', updatedAt: false },
    toJSON: {
      transform(_doc, ret) {
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

PersonalWellnessLogSchema.index({ user_id: 1, submitted_at: -1 });

module.exports = mongoose.model('PersonalWellnessLog', PersonalWellnessLogSchema);
