'use strict';

/**
 * Tenant Data Re-Link & Recovery Utility
 * 
 * Re-associates all historical multi-tenant data (PersonalWellnessLog, AnonHazardLog,
 * PulseResponse, Department, AssessmentCycle, Invitation, WhistleblowerReport, Alert, User)
 * from a source company_id to a target company_id.
 * 
 * Usage via CLI:
 *   node server/scripts/relinkTenantData.js <source_company_id> <target_company_id> [--dry-run]
 */

const mongoose = require('mongoose');

async function relinkTenantData(sourceCompanyId, targetCompanyId, options = {}) {
  const { dryRun = false } = options;

  if (!sourceCompanyId || !targetCompanyId) {
    throw new Error('Both sourceCompanyId and targetCompanyId are required.');
  }

  if (sourceCompanyId === targetCompanyId) {
    throw new Error('Source and target company_id must be different.');
  }

  // Load models safely
  const Tenant = mongoose.models.Tenant || require('../models/Tenant');
  const User = mongoose.models.User || require('../models/User');
  const Department = mongoose.models.Department || require('../models/Department');
  const PersonalWellnessLog = mongoose.models.PersonalWellnessLog || require('../models/PersonalWellnessLog');
  const AnonHazardLog = mongoose.models.AnonHazardLog || require('../models/AnonHazardLog');
  const PulseResponse = mongoose.models.PulseResponse || require('../models/PulseResponse');
  const AssessmentCycle = mongoose.models.AssessmentCycle || require('../models/AssessmentCycle');
  const Invitation = mongoose.models.Invitation || require('../models/Invitation');
  const WhistleblowerReport = mongoose.models.WhistleblowerReport || require('../models/WhistleblowerReport');
  const Alert = mongoose.models.Alert || require('../models/Alert');

  // Verify target tenant exists
  const targetTenant = await Tenant.findOne({ company_id: targetCompanyId });
  if (!targetTenant) {
    throw new Error(`Target tenant '${targetCompanyId}' not found.`);
  }

  const results = {};

  // 1. PersonalWellnessLog
  const pwlCount = await PersonalWellnessLog.countDocuments({ company_id: sourceCompanyId });
  results.PersonalWellnessLog = pwlCount;
  if (!dryRun && pwlCount > 0) {
    await PersonalWellnessLog.updateMany({ company_id: sourceCompanyId }, { $set: { company_id: targetCompanyId } });
  }

  // 2. AnonHazardLog (checks company_id and tenant_id)
  const ahlCount = await AnonHazardLog.countDocuments({
    $or: [{ company_id: sourceCompanyId }, { tenant_id: sourceCompanyId }]
  });
  results.AnonHazardLog = ahlCount;
  if (!dryRun && ahlCount > 0) {
    await AnonHazardLog.updateMany(
      { $or: [{ company_id: sourceCompanyId }, { tenant_id: sourceCompanyId }] },
      { $set: { company_id: targetCompanyId, tenant_id: targetCompanyId } }
    );
  }

  // 3. PulseResponse
  const prCount = await PulseResponse.countDocuments({
    $or: [{ company_id: sourceCompanyId }, { tenant_id: sourceCompanyId }]
  });
  results.PulseResponse = prCount;
  if (!dryRun && prCount > 0) {
    await PulseResponse.updateMany(
      { $or: [{ company_id: sourceCompanyId }, { tenant_id: sourceCompanyId }] },
      { $set: { company_id: targetCompanyId, tenant_id: targetCompanyId } }
    );
  }

  // 4. Department
  const deptCount = await Department.countDocuments({ company_id: sourceCompanyId });
  results.Department = deptCount;
  if (!dryRun && deptCount > 0) {
    await Department.updateMany({ company_id: sourceCompanyId }, { $set: { company_id: targetCompanyId } });
  }

  // 5. AssessmentCycle
  const acCount = await AssessmentCycle.countDocuments({ company_id: sourceCompanyId });
  results.AssessmentCycle = acCount;
  if (!dryRun && acCount > 0) {
    await AssessmentCycle.updateMany({ company_id: sourceCompanyId }, { $set: { company_id: targetCompanyId } });
  }

  // 6. Invitation
  const invCount = await Invitation.countDocuments({ company_id: sourceCompanyId });
  results.Invitation = invCount;
  if (!dryRun && invCount > 0) {
    await Invitation.updateMany({ company_id: sourceCompanyId }, { $set: { company_id: targetCompanyId } });
  }

  // 7. WhistleblowerReport
  const wbCount = await WhistleblowerReport.countDocuments({ company_id: sourceCompanyId });
  results.WhistleblowerReport = wbCount;
  if (!dryRun && wbCount > 0) {
    await WhistleblowerReport.updateMany({ company_id: sourceCompanyId }, { $set: { company_id: targetCompanyId } });
  }

  // 8. Alert
  const alertCount = await Alert.countDocuments({
    $or: [{ company_id: sourceCompanyId }, { tenant_id: sourceCompanyId }]
  });
  results.Alert = alertCount;
  if (!dryRun && alertCount > 0) {
    await Alert.updateMany(
      { $or: [{ company_id: sourceCompanyId }, { tenant_id: sourceCompanyId }] },
      { $set: { company_id: targetCompanyId, tenant_id: targetCompanyId } }
    );
  }

  // 9. Users
  const userCount = await User.countDocuments({ company_id: sourceCompanyId });
  results.User = userCount;
  if (!dryRun && userCount > 0) {
    await User.updateMany({ company_id: sourceCompanyId }, { $set: { company_id: targetCompanyId } });
  }

  // Recalculate used seats on target tenant
  if (!dryRun) {
    const totalUsers = await User.countDocuments({ company_id: targetCompanyId, status: 'active', role: { $ne: 'super_admin' } });
    await Tenant.updateOne({ company_id: targetCompanyId }, { $set: { used_seats: totalUsers } });
  }

  return {
    success: true,
    dryRun,
    sourceCompanyId,
    targetCompanyId,
    recordsMigrated: results,
  };
}

// CLI entrypoint
if (require.main === module) {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const positional = args.filter(a => !a.startsWith('--'));

  if (positional.length < 2) {
    console.error('Usage: node relinkTenantData.js <source_company_id> <target_company_id> [--dry-run]');
    process.exit(1);
  }

  const [source, target] = positional;
  require('dotenv').config();
  const connectDB = require('../config/db');

  connectDB()
    .then(async () => {
      console.log(`[Relink] Starting data re-link: ${source} -> ${target} (dryRun: ${dryRun})`);
      const result = await relinkTenantData(source, target, { dryRun });
      console.log('[Relink] Success:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('[Relink] Error:', err.message);
      process.exit(1);
    });
}

module.exports = {
  relinkTenantData,
};
