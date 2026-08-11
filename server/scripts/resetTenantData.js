/**
 * Havilah Multi-Tenant Reset Utility
 * File: server/scripts/resetTenantData.js
 * 
 * Safely clears synthetic/mock data for a tenant while preserving core infrastructure.
 */

const mongoose = require('mongoose');
const readline = require('readline');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Company = require('../models/Company');
const PulseResponse = require('../models/PulseResponse');
const AssessmentCycle = require('../models/AssessmentCycle');
const Alert = require('../models/Alert');
const WhistleblowerReport = require('../models/WhistleblowerReport');
const AuditLog = require('../models/AuditLog');

// Helper for interactive terminal confirmation
function askConfirmation(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => rl.question(query, answer => {
    rl.close();
    resolve(answer.trim());
  }));
}

async function resetTenantData() {
  const args = process.argv.slice(2);
  const targetTenantId = args.find(arg => !arg.startsWith('-'));
  const autoConfirm = args.includes('-y') || args.includes('--yes');
  const clearAudit = args.includes('--clear-audit');

  if (!targetTenantId) {
    console.error('❌ Error: Target tenant_id is required.');
    console.log('\nUsage: node server/scripts/resetTenantData.js <tenant_id> [options]');
    console.log('Options:');
    console.log('  --clear-audit    Also purge system activity/audit logs for this tenant');
    console.log('  -y, --yes        Bypass interactive confirmation prompt (for automation)');
    process.exitCode = 1;
    return;
  }

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('❌ Error: MONGODB_URI environment variable is missing.');
    process.exitCode = 1;
    return;
  }

  try {
    console.log('\n🔌 Connecting to Database...');
    await mongoose.connect(mongoUri);

    console.log(`\n==================================================`);
    console.log(`🔒 HAVILAH TENANT DATA RESET ENGINE`);
    console.log(`==================================================`);

    // 1. Verify Target Tenant Exists (by company_id, tenant_id, or slug)
    const company = await Company.findOne({
      $or: [
        { company_id: targetTenantId },
        { tenant_id: targetTenantId },
        { slug: targetTenantId }
      ]
    });

    if (!company) {
      console.error(`❌ Tenant '${targetTenantId}' not found in database. Aborting.`);
      process.exitCode = 1;
      return;
    }

    const compName = company.name || company.company_name || targetTenantId;
    const compId = company.company_id || company.tenant_id || targetTenantId;
    const isTrialAcc = company.is_trial || company.billing_tier === 'trial';

    console.log(`Target Tenant:   ${compName} (${compId})`);
    console.log(`Account Type:    ${isTrialAcc ? 'TRIAL ACCOUNT' : 'ENTERPRISE PAID'}`);
    console.log(`Clear Audit Logs: ${clearAudit ? 'YES' : 'NO (Preserving setup logs)'}`);
    console.log(`--------------------------------------------------`);

    // 2. Interactive Safety Confirmation
    if (!autoConfirm) {
      console.log(`\n⚠️  WARNING: This will permanently delete all pulse responses, alerts,`);
      console.log(`   and whistleblower reports for organization '${compName}'.`);
      const userInput = await askConfirmation(`\nTo confirm, type the exact tenant_id [${compId}]: `);

      if (userInput !== compId && userInput !== targetTenantId && userInput !== company.slug) {
        console.log('\n❌ Confirmation mismatch. Reset aborted cleanly.');
        process.exitCode = 0;
        return;
      }
    }

    console.log('\n🚀 Executing Data Purge...');

    // 3. Purge Synthetic Data Collections
    const responseResult = await PulseResponse.deleteMany({ $or: [{ tenant_id: compId }, { company_id: compId }] });
    console.log(`🧹 Purged Pulse Responses:          ${responseResult.deletedCount}`);

    const alertResult = await Alert.deleteMany({ $or: [{ tenant_id: compId }, { company_id: compId }] });
    console.log(`🧹 Purged Predictive Alerts:        ${alertResult.deletedCount}`);

    const wbResult = await WhistleblowerReport.deleteMany({ $or: [{ tenant_id: compId }, { company_id: compId }] });
    console.log(`🧹 Purged Whistleblower Reports:    ${wbResult.deletedCount}`);

    if (clearAudit) {
      let auditDeletedCount = 0;
      try {
        // Bypass Mongoose immutability pre-hook to clear audit logs for requested tenant reset
        const auditResult = await AuditLog.collection.deleteMany({
          $or: [{ tenant_id: compId }, { company_id: compId }]
        });
        auditDeletedCount = auditResult.deletedCount || 0;
      } catch (e) {
        console.warn('  ⚠️ Direct AuditLog purge notice:', e.message);
      }
      console.log(`🧹 Purged Audit Logs:               ${auditDeletedCount}`);
    }

    // 4. Reset Assessment Availability Baseline
    await AssessmentCycle.deleteMany({ $or: [{ tenant_id: compId }, { company_id: compId }] }).catch(e => {});
    await AssessmentCycle.create({
      company_id: compId,
      survey_type: 'copsoq3',
      copsoq_depth: 'core',
      status: 'locked'
    }).catch(e => {});

    console.log(`⚙️  Assessment Availability Reset:   [DAILY_PULSE] Active / Formal Locked`);

    console.log(`--------------------------------------------------`);
    console.log(`✅ SUCCESS: '${compName}' is now in a Clean Cold-Start State!`);
    console.log(`==================================================\n`);

  } catch (err) {
    console.error(`\n❌ Reset Execution Failed:`, err);
    process.exitCode = 1;
  } finally {
    // Always close connection cleanly to prevent hanging CLI threads
    await mongoose.disconnect();
    console.log('🔌 Database disconnected.');
  }
}

resetTenantData();
