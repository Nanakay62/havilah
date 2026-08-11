'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const AnonHazardLog = require('../models/AnonHazardLog');

/**
 * Migration 001: Deprecate COPSOQ II
 * 
 * As per organizational directive, all previous iterations of COPSOQ 
 * (copsoq_short, copsoq_medium, copsoq_long) based on COPSOQ II guidelines 
 * are deprecated in favor of COPSOQ III.
 * 
 * This script removes legacy COPSOQ II records from the system to ensure 
 * they do not pollute the new COPSOQ III analytics and Correlation Engine.
 */

async function up() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/copsoq');
  
  console.log('Running migration: Deprecating legacy COPSOQ II hazard logs...');

  const legacyTypes = ['copsoq_short', 'copsoq_medium', 'copsoq_long'];

  try {
    const result = await AnonHazardLog.deleteMany({ survey_type: { $in: legacyTypes } });
    console.log(`Migration complete. Removed ${result.deletedCount} legacy COPSOQ II records.`);
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB.');
  }
}

if (require.main === module) {
  up();
}

module.exports = { up };
