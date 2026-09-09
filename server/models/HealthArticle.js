'use strict';

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

const HealthArticleSchema = new mongoose.Schema({
  article_id: {
    type: String,
    unique: true,
    default: uuidv4,
  },
  title: {
    type: String,
    required: [true, 'title is required'],
    maxlength: 200,
    trim: true,
  },
  slug: {
    type: String,
    required: [true, 'slug is required'],
    unique: true,
    lowercase: true,
    trim: true,
  },
  category: {
    type: String,
    required: true,
    enum: [
      'stress',
      'anxiety',
      'burnout',
      'sleep',
      'work_life_balance',
      'relationships',
      'crisis_support',
      'resilience',
      'leadership'
    ],
  },
  trigger_conditions: [{
    survey_type: { type: String }, // e.g. 'pss10', 'phq9', 'copsoq3'
    dimension: { type: String, default: null },
    threshold: { type: Number },
    direction: { type: String, enum: ['above', 'below'], default: 'above' },
  }],
  summary: {
    type: String,
    maxlength: 500,
    required: true,
  },
  content_markdown: {
    type: String,
    required: true,
  },
  read_time_minutes: {
    type: Number,
    default: 3,
  },
  source_url: {
    type: String,
    default: '',
  },
  source_name: {
    type: String,
    default: '',
  },
  tags: [{
    type: String,
    trim: true,
  }],
  is_crisis_resource: {
    type: Boolean,
    default: false,
  },
  is_published: {
    type: Boolean,
    default: true,
  },
  thumbnail_emoji: {
    type: String,
    default: '🧠',
  },
  featured: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

HealthArticleSchema.index({ category: 1, is_published: 1 });
HealthArticleSchema.index({ is_crisis_resource: 1 });
HealthArticleSchema.index({ tags: 1 });
HealthArticleSchema.index({ featured: 1, is_published: 1 });

module.exports = mongoose.model('HealthArticle', HealthArticleSchema);
