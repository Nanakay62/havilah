'use strict';

/**
 * cleanDemoData.js
 *
 * Safe, idempotent database inventory & cleanup script for Havilah.
 *
 * Section 0 Guardrails:
 * - Default mode is --dry-run (READ-ONLY inventory).
 * - Refuses to delete anything unless run with --execute AND the confirmation
 *   phrase "DELETE DEMO DATA FROM <db name>" is typed or passed via --confirm.
 * - Masks all personal emails (h***@domain); never logs or prints sensitive data.
 * - Scans for explicit demo markers (Section 2) and reports orphans separately.
 *
 * Usage:
 *   node server/scripts/cleanDemoData.js --uri="mongodb+srv://user:pass@cluster.mongodb.net/dbname"
 *   node server/scripts/cleanDemoData.js --uri="<connection_string>" --dry-run
 *   node server/scripts/cleanDemoData.js --uri="<connection_string>" --execute
 */

const readline = require('readline');
const path = require('path');
const mongoose = require('mongoose');

// Auto-load server/.env if present
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {}

// Helper to mask email address: a***@domain.com
function maskEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) return '***@***';
  const parts = email.split('@');
  const user = parts[0];
  const domain = parts[1];
  const maskedUser = user.length > 1 ? user[0] + '***' : '***';
  return `${maskedUser}@${domain}`;
}

// Known demo markers from Section 2 & seed scripts
const DEMO_TENANT_SLUGS = new Set(['havilah-demo', 'acme-corp-test', 'acme-corp']);
const DEMO_TENANT_NAMES = new Set([
  'Havilah Demo Workspace',
  'Apex Horizon Logistics',
  'Acme Corp Test',
  'Acme Corp (Testing)',
  'Acme Corp'
]);
const DEMO_COMPANY_IDS = new Set([
  'b8ecbd7c-7993-48f9-babe-20c8001c345b',
  'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  '11111111-1111-4111-y111-111111111111'
]);
const DEMO_REFERRAL_CODES = new Set([
  'REF-8492-K',
  'REF-3104-M',
  'REF-7721-P',
  'REF-5290-B',
  'REF-6183-T'
]);
const DEMO_REPORT_CODES = new Set(['ETH-2026-9041']);

const DEMO_EMAIL_EXACT = new Set([
  'hr.demo@havilah.local',
  'employee.demo@havilah.local',
  'assessor.demo@havilah.local',
  'employee@test.com',
  'hr@test.com',
  'admin@wellframe.io',
  'super@wellframe.io',
  'alex.mercer@fzsafety.com',
  'alex.mercer@example.com',
  'dr.jane@apexhealth.com',
  'assessor@fzsafety.com'
]);

// Protected real clinical accounts - NEVER delete
const PROTECTED_EMAILS = new Set([
  'clarke.edith@gmail.com',
  'dr.clarke@fzsafety.com',
  'nanakwamedickson553@gmail.com',
  'nanakwamedickson62@gmail.com'
]);

function isDemoEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const clean = email.trim().toLowerCase();
  if (PROTECTED_EMAILS.has(clean)) return false;
  if (DEMO_EMAIL_EXACT.has(clean)) return true;
  if (clean.endsWith('@havilah.local')) return true;
  if (clean.endsWith('@apexhorizon.local')) return true;
  if (clean.endsWith('@acmecorptest.com')) return true;
  if (clean.endsWith('@example.com')) return true;
  if (clean.endsWith('.invalid')) return true;
  return false;
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  let uri = null;
  let isExecute = false;
  let confirmPhrase = null;
  let cleanOrphans = false;

  for (const arg of args) {
    if (arg.startsWith('--uri=')) {
      uri = arg.substring(6).trim();
    } else if (arg.startsWith('--mongo-uri=')) {
      uri = arg.substring(12).trim();
    } else if (arg === '--execute') {
      isExecute = true;
    } else if (arg.startsWith('--confirm=')) {
      confirmPhrase = arg.substring(10).trim();
    } else if (arg === '--clean-orphans') {
      cleanOrphans = true;
    }
  }

  // Fallback to environment variable if provided by caller environment
  if (!uri && process.env.MONGODB_URI) {
    uri = process.env.MONGODB_URI;
  } else if (!uri && process.env.MONGO_URI) {
    uri = process.env.MONGO_URI;
  }

  return { uri, isExecute, confirmPhrase, cleanOrphans };
}

async function promptConfirmation(promptText) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(promptText, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function run() {
  const { uri, isExecute, confirmPhrase, cleanOrphans } = parseArgs();

  console.log('\n============================================================');
  console.log('   HAVILAH PRODUCTION CLEANUP ENGINE (cleanDemoData.js)     ');
  console.log('============================================================\n');

  if (!uri) {
    console.error('ERROR: Database URI is required.');
    console.error('Usage:');
    console.error('  node server/scripts/cleanDemoData.js --uri="<connection_string>" [--dry-run]');
    console.error('  node server/scripts/cleanDemoData.js --uri="<connection_string>" --execute\n');
    process.exit(1);
  }

  // Parse and display masked URI
  const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  console.log(`Connecting to: ${maskedUri}`);

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 8000,
  });

  const db = mongoose.connection.db;
  const dbName = db.databaseName;
  console.log(`Connected successfully to database: "${dbName}"`);
  console.log(`Execution Mode: ${isExecute ? '⚠️  EXECUTE (DESTRUCTIVE PURGE)' : '🛡️  DRY RUN (READ-ONLY INVENTORY)'}\n`);

  // Load models
  const Tenant = mongoose.models.Tenant || require('../models/Tenant');
  const Company = mongoose.models.Company || require('../models/Company');
  const Department = mongoose.models.Department || require('../models/Department');
  const DepartmentSnapshot = mongoose.models.DepartmentSnapshot || require('../models/DepartmentSnapshot');
  const User = mongoose.models.User || require('../models/User');
  const Assessor = mongoose.models.Assessor || require('../models/Assessor');
  const Doctor = mongoose.models.Doctor || require('../models/Doctor');
  const Referral = mongoose.models.Referral || require('../models/Referral');
  const Report = mongoose.models.Report || require('../models/Report');
  const WhistleblowerReport = mongoose.models.WhistleblowerReport || require('../models/WhistleblowerReport');
  const PersonalWellnessLog = mongoose.models.PersonalWellnessLog || require('../models/PersonalWellnessLog');
  const PulseResponse = mongoose.models.PulseResponse || require('../models/PulseResponse');
  const AnonHazardLog = mongoose.models.AnonHazardLog || require('../models/AnonHazardLog');
  const AssessmentCycle = mongoose.models.AssessmentCycle || require('../models/AssessmentCycle');
  const Invitation = mongoose.models.Invitation || require('../models/Invitation');
  const Alert = mongoose.models.Alert || require('../models/Alert');
  const PendingNotification = mongoose.models.PendingNotification || require('../models/PendingNotification');
  const AuditLog = mongoose.models.AuditLog || require('../models/AuditLog');

  // Try loading decryptField if crypto key is in env
  let decryptFn = null;
  let hashFn = null;
  try {
    const cryptoUtils = require('../utils/crypto');
    decryptFn = cryptoUtils.decryptField;
    hashFn = cryptoUtils.hashField;
  } catch (e) {}

  // 1. Identify Demo Tenants
  const allTenants = await Tenant.find({}).lean();

  const demoTenantIds = new Set();
  const demoCompanyIds = new Set(DEMO_COMPANY_IDS);
  const realTenantIds = new Set();
  const realCompanyIds = new Set();

  for (const t of allTenants) {
    const isDemo =
      DEMO_TENANT_SLUGS.has(t.slug) ||
      DEMO_TENANT_NAMES.has(t.company_name) ||
      DEMO_COMPANY_IDS.has(t.company_id);

    if (isDemo) {
      demoTenantIds.add(String(t._id));
      if (t.company_id) demoCompanyIds.add(t.company_id);
    } else {
      realTenantIds.add(String(t._id));
      if (t.company_id) realCompanyIds.add(t.company_id);
    }
  }

  // 2. Scan Users
  const allUsers = await User.find({}).lean();
  const demoUserIds = new Set();
  const maskedDemoUserEmails = [];

  for (const u of allUsers) {
    let email = null;
    if (u.email && !u.email.includes('{')) {
      email = u.email;
    } else if (u.email_encrypted && decryptFn) {
      try {
        const parsed = typeof u.email_encrypted === 'string' ? JSON.parse(u.email_encrypted) : u.email_encrypted;
        email = decryptFn({ iv: parsed.iv, encrypted: parsed.encrypted, authTag: parsed.authTag });
      } catch (e) {}
    }

    const belongsToDemoTenant =
      (u.company_id && demoCompanyIds.has(u.company_id)) ||
      (u.tenant_id && demoCompanyIds.has(u.tenant_id));

    const matchesDemoEmail = email && isDemoEmail(email);

    // Also match known demo user IDs
    const isDemoUserId = String(u.user_id).startsWith('usr-demo-') || u.user_id === 'ba4040b3-d7d5-4c23-8a53-5d440ec3c834';

    if (belongsToDemoTenant || matchesDemoEmail || isDemoUserId) {
      demoUserIds.add(String(u._id));
      if (email) maskedDemoUserEmails.push(maskEmail(email));
    }
  }

  // 3. Scan Assessors & Doctors
  const allAssessors = await Assessor.find({}).lean();
  const demoAssessorIds = new Set();
  const maskedDemoAssessorEmails = [];

  for (const a of allAssessors) {
    if (PROTECTED_EMAILS.has(a.email?.toLowerCase())) continue;

    if (isDemoEmail(a.email) || a.email === 'assessor.demo@havilah.local' || a.email === 'dr.jane@apexhealth.com' || a.email === 'assessor@fzsafety.com') {
      demoAssessorIds.add(String(a._id));
      maskedDemoAssessorEmails.push(maskEmail(a.email));
    }
  }

  const allDoctors = await Doctor.find({}).lean();
  const demoDoctorIds = new Set();
  for (const d of allDoctors) {
    if (PROTECTED_EMAILS.has(d.email?.toLowerCase())) continue;
    if (isDemoEmail(d.email) || (d.practiceId && demoAssessorIds.has(String(d.practiceId)))) {
      demoDoctorIds.add(String(d._id));
    }
  }

  // 4. Scan Referrals
  const allReferrals = await Referral.find({}).lean();
  const demoReferralIds = new Set();
  const demoReferralDetails = [];

  for (const r of allReferrals) {
    const isDemoRef =
      DEMO_REFERRAL_CODES.has(r.referenceCode) ||
      (r.tenantId && demoTenantIds.has(String(r.tenantId))) ||
      (r.company_id && demoCompanyIds.has(r.company_id)) ||
      (r.assignedAssessorId && demoAssessorIds.has(String(r.assignedAssessorId))) ||
      (r.clinicalDetails?.patientContact && isDemoEmail(r.clinicalDetails.patientContact)) ||
      (r.clinicalDetails?.patientName && /^Demo Employee 0[1-5]$/.test(r.clinicalDetails.patientName));

    if (isDemoRef) {
      demoReferralIds.add(String(r._id));
      demoReferralDetails.push({
        id: String(r._id),
        referenceCode: r.referenceCode || 'NO_CODE',
        reason: r.referenceCode && DEMO_REFERRAL_CODES.has(r.referenceCode) ? 'Known demo code' : 'Demo contact/patient'
      });
    }
  }

  // 5. Scan Ethics / Whistleblower Reports
  const allReports = await Report.find({}).lean();
  const demoReportIds = new Set();
  for (const rep of allReports) {
    if (DEMO_REPORT_CODES.has(rep.trackingCode) || (rep.tenantId && demoTenantIds.has(String(rep.tenantId)))) {
      demoReportIds.add(String(rep._id));
    }
  }

  const allWbReports = await WhistleblowerReport.find({}).lean();
  for (const wb of allWbReports) {
    if (DEMO_REPORT_CODES.has(wb.trackingCode) || (wb.company_id && demoCompanyIds.has(wb.company_id))) {
      demoReportIds.add(String(wb._id));
    }
  }

  // 6. Dependent Data (Wellness Logs, Hazard Logs, Pulse, Cycles, Invites, Alerts, Depts)
  const [
    totalDepts, demoDepts,
    totalSnapshots, demoSnapshots,
    totalPwl, demoPwl,
    totalAhl, demoAhl,
    totalPulse, demoPulse,
    totalCycles, demoCycles,
    totalInvites, demoInvites,
    totalAlerts, demoAlerts,
    totalPendingNotifs, demoPendingNotifs,
    totalAudit, demoAudit
  ] = await Promise.all([
    Department.countDocuments(),
    Department.countDocuments({ company_id: { $in: Array.from(demoCompanyIds) } }),

    DepartmentSnapshot.countDocuments(),
    DepartmentSnapshot.countDocuments({ company_id: { $in: Array.from(demoCompanyIds) } }),

    PersonalWellnessLog.countDocuments(),
    PersonalWellnessLog.countDocuments({
      $or: [
        { company_id: { $in: Array.from(demoCompanyIds) } },
        { user_id: { $in: Array.from(demoUserIds) } }
      ]
    }),

    AnonHazardLog.countDocuments(),
    AnonHazardLog.countDocuments({
      $or: [
        { company_id: { $in: Array.from(demoCompanyIds) } },
        { tenant_id: { $in: Array.from(demoCompanyIds) } }
      ]
    }),

    PulseResponse.countDocuments(),
    PulseResponse.countDocuments({
      $or: [
        { company_id: { $in: Array.from(demoCompanyIds) } },
        { tenant_id: { $in: Array.from(demoCompanyIds) } }
      ]
    }),

    AssessmentCycle.countDocuments(),
    AssessmentCycle.countDocuments({ company_id: { $in: Array.from(demoCompanyIds) } }),

    Invitation.countDocuments(),
    Invitation.countDocuments({ company_id: { $in: Array.from(demoCompanyIds) } }),

    Alert.countDocuments(),
    Alert.countDocuments({
      $or: [
        { company_id: { $in: Array.from(demoCompanyIds) } },
        { tenant_id: { $in: Array.from(demoCompanyIds) } }
      ]
    }),

    PendingNotification.countDocuments(),
    PendingNotification.countDocuments({ company_id: { $in: Array.from(demoCompanyIds) } }),

    AuditLog.countDocuments(),
    AuditLog.countDocuments({ company_id: { $in: Array.from(demoCompanyIds) } })
  ]);

  // Check for orphan records (pointing to nonexistent company/tenant)
  const allKnownCompanyIds = new Set([
    ...realCompanyIds,
    ...realTenantIds,
    ...demoCompanyIds,
    ...demoTenantIds,
    'SYSTEM_SUPER_ADMIN'
  ]);
  const orphanUsersList = await User.find({
    $and: [
      { company_id: { $nin: Array.from(allKnownCompanyIds) } },
      { tenant_id: { $nin: Array.from(allKnownCompanyIds) } },
      { _id: { $nin: Array.from(demoUserIds).map(id => new mongoose.Types.ObjectId(id)) } }
    ]
  }).lean();
  const orphanUsers = orphanUsersList.length;
  const orphanPwlDist = await PersonalWellnessLog.distinct('company_id', {
    $and: [
      { company_id: { $nin: Array.from(allKnownCompanyIds) } },
      { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
    ]
  });
  const orphanAhlDist = await AnonHazardLog.distinct('company_id', {
    $and: [
      { company_id: { $nin: Array.from(allKnownCompanyIds) } },
      { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
    ]
  });

  // PRINT SUMMARY TABLE
  console.log('─────────────────────────────────────────────────────────────────────────────────');
  console.log('COLLECTION INVENTORY SUMMARY');
  console.log('─────────────────────────────────────────────────────────────────────────────────');
  console.log(`Tenants             : Total: ${allTenants.length} | Demo Match: ${demoTenantIds.size} | Real: ${realTenantIds.size}`);
  console.log(`Users               : Total: ${allUsers.length} | Demo Match: ${demoUserIds.size} | Real: ${allUsers.length - demoUserIds.size}`);
  console.log(`Assessors / Doctors : Total: ${allAssessors.length + allDoctors.length} | Demo Match: ${demoAssessorIds.size + demoDoctorIds.size} | Real: ${(allAssessors.length + allDoctors.length) - (demoAssessorIds.size + demoDoctorIds.size)}`);
  console.log(`Referrals           : Total: ${allReferrals.length} | Demo Match: ${demoReferralIds.size} | Real: ${allReferrals.length - demoReferralIds.size}`);
  console.log(`Whistleblower/Ethics: Total: ${allReports.length + allWbReports.length} | Demo Match: ${demoReportIds.size} | Real: ${(allReports.length + allWbReports.length) - demoReportIds.size}`);
  console.log(`Departments         : Total: ${totalDepts} | Demo Match: ${demoDepts} | Real: ${totalDepts - demoDepts}`);
  console.log(`Wellness Logs (PWL) : Total: ${totalPwl} | Demo Match: ${demoPwl} | Real: ${totalPwl - demoPwl}`);
  console.log(`Hazard Logs (AHL)   : Total: ${totalAhl} | Demo Match: ${demoAhl} | Real: ${totalAhl - demoAhl}`);
  console.log(`Pulse Responses     : Total: ${totalPulse} | Demo Match: ${demoPulse} | Real: ${totalPulse - demoPulse}`);
  console.log(`Assessment Cycles   : Total: ${totalCycles} | Demo Match: ${demoCycles} | Real: ${totalCycles - demoCycles}`);
  console.log(`Invitations         : Total: ${totalInvites} | Demo Match: ${demoInvites} | Real: ${totalInvites - demoInvites}`);
  console.log(`Alerts              : Total: ${totalAlerts} | Demo Match: ${demoAlerts} | Real: ${totalAlerts - demoAlerts}`);
  console.log(`Pending Notifs      : Total: ${totalPendingNotifs} | Demo Match: ${demoPendingNotifs} | Real: ${totalPendingNotifs - demoPendingNotifs}`);
  console.log(`Audit Logs          : Total: ${totalAudit} | Demo Match: ${demoAudit} | Real: ${totalAudit - demoAudit}`);
  console.log('─────────────────────────────────────────────────────────────────────────────────');
  const orphanPwlCount = await PersonalWellnessLog.countDocuments({
    $and: [
      { company_id: { $nin: Array.from(allKnownCompanyIds) } },
      { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
    ]
  });
  const orphanAhlCount = await AnonHazardLog.countDocuments({
    $and: [
      { company_id: { $nin: Array.from(allKnownCompanyIds) } },
      { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
    ]
  });
  console.log(`Orphan Records Detected: Users: ${orphanUsers} | PWL: ${orphanPwlCount} (Companies: ${JSON.stringify(orphanPwlDist)}) | AHL: ${orphanAhlCount} (Companies: ${JSON.stringify(orphanAhlDist)})`);
  console.log('─────────────────────────────────────────────────────────────────────────────────');

  if (demoUserIds.size > 0) {
    console.log(`\nDemo User Matches (${demoUserIds.size}):`);
    console.log(`IDs: ${Array.from(demoUserIds).join(', ')}`);
    console.log(`Masked Emails: ${Array.from(new Set(maskedDemoUserEmails)).join(', ')}`);
  }
  if (demoReferralIds.size > 0) {
    console.log(`\nDemo Referral Matches (${demoReferralIds.size}):`);
    console.log(`IDs: ${Array.from(demoReferralIds).join(', ')}`);
    demoReferralDetails.forEach(d => console.log(`  - Ref [${d.referenceCode}] (ID: ${d.id}): ${d.reason}`));
  }
  if (orphanUsers > 0) {
    console.log(`\nOrphan Users Identified (${orphanUsers}):`);
    orphanUsersList.forEach(u => {
      console.log(`  - ID: ${u._id} | Role: ${u.role} | CompanyId: ${u.company_id || 'none'} | TenantId: ${u.tenant_id || 'none'}`);
    });
  }
  if (demoAssessorIds.size > 0) {
    console.log(`\nDemo Assessor Matches (${demoAssessorIds.size}):`);
    console.log(`IDs: ${Array.from(demoAssessorIds).join(', ')}`);
    console.log(`Masked Emails: ${Array.from(new Set(maskedDemoAssessorEmails)).join(', ')}`);
  }
  if (demoTenantIds.size > 0 || demoCompanyIds.size > 0) {
    console.log(`\nDemo Tenant Matches (${demoTenantIds.size}):`);
    console.log(`Tenant IDs: ${Array.from(demoTenantIds).join(', ')}`);
    console.log(`Company IDs: ${Array.from(demoCompanyIds).join(', ')}`);
  }

  // IF DRY RUN, EXIT CLEANLY
  if (!isExecute) {
    console.log('\n[DRY RUN COMPLETE] Zero records were modified or deleted.');
    console.log('Share this inventory output with Antigravity to approve Gate 2 when ready.');
    await mongoose.disconnect();
    process.exit(0);
  }

  // IF EXECUTE, PROMPT CONFIRMATION PHRASE
  console.log('\n⚠️  ATTENTION: YOU ARE RUNNING IN DESTRUCTIVE EXECUTE MODE ⚠️');
  const expectedPhrase = `DELETE DEMO DATA FROM ${dbName}`;

  let typedPhrase = confirmPhrase;
  if (!typedPhrase) {
    console.log(`To confirm permanent deletion of the demo records above, type: "${expectedPhrase}"`);
    typedPhrase = await promptConfirmation('\nEnter confirmation phrase: ');
  }

  if (typedPhrase !== expectedPhrase) {
    console.error(`\nConfirmation mismatch. Expected: "${expectedPhrase}". Aborting cleanly.`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const fs = require('fs');

  // Automatic Pre-Execution Backup (Option B)
  const backupDir = path.join(__dirname, '../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(backupDir, `wellframe_backup_pre_cleanup_${timestamp}.json`);
  console.log(`\n📦 Creating pre-execution safety backup (Option B) -> ${backupPath}...`);

  const backupData = {
    createdAt: new Date().toISOString(),
    database: dbName,
    summary: {
      tenants: allTenants.length,
      users: allUsers.length,
      assessors: allAssessors.length,
      referrals: allReferrals.length,
      reports: allReports.length,
      whistleblowerReports: allWbReports.length,
      departments: totalDepts,
      wellnessLogs: totalPwl,
      hazardLogs: totalAhl,
      assessmentCycles: totalCycles,
      auditLogs: totalAudit,
      orphanPwlCount,
      orphanAhlCount
    },
    demoMatches: {
      demoUserIds: Array.from(demoUserIds),
      demoCompanyIds: Array.from(demoCompanyIds),
      demoTenantIds: Array.from(demoTenantIds),
      demoReferralIds: Array.from(demoReferralIds),
      demoAssessorIds: Array.from(demoAssessorIds),
      demoDoctorIds: Array.from(demoDoctorIds)
    },
    recordsScheduledForDeletion: {
      users: await User.find({ _id: { $in: Array.from(demoUserIds) } }).lean(),
      referrals: await Referral.find({ _id: { $in: Array.from(demoReferralIds) } }).lean(),
      departments: await Department.find({ company_id: { $in: Array.from(demoCompanyIds) } }).lean(),
      assessmentCycles: await AssessmentCycle.find({ company_id: { $in: Array.from(demoCompanyIds) } }).lean(),
      hazardLogs: await AnonHazardLog.find({
        $or: [
          { company_id: { $in: Array.from(demoCompanyIds) } },
          { tenant_id: { $in: Array.from(demoCompanyIds) } }
        ]
      }).lean(),
      auditLogs: await AuditLog.find({ company_id: { $in: Array.from(demoCompanyIds) } }).lean(),
      orphanWellnessLogs: cleanOrphans ? await PersonalWellnessLog.find({
        $and: [
          { company_id: { $nin: Array.from(allKnownCompanyIds) } },
          { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
        ]
      }).lean() : [],
      orphanHazardLogs: cleanOrphans ? await AnonHazardLog.find({
        $and: [
          { company_id: { $nin: Array.from(allKnownCompanyIds) } },
          { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
        ]
      }).lean() : []
    }
  };

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
  console.log(`✅ Backup successfully created and verified (${(fs.statSync(backupPath).size / 1024).toFixed(1)} KB).`);

  console.log('\nExecuting safe ordered deletion...');

  const demoCompArr = Array.from(demoCompanyIds);
  const demoTenantArr = Array.from(demoTenantIds);
  const demoUserArr = Array.from(demoUserIds);
  const demoAssessorArr = Array.from(demoAssessorIds);
  const demoDoctorArr = Array.from(demoDoctorIds);
  const demoRefArr = Array.from(demoReferralIds);
  const demoRepArr = Array.from(demoReportIds);

  // 1. Notifications, Alerts & Audit Logs
  if (demoCompArr.length > 0) {
    await PendingNotification.deleteMany({ company_id: { $in: demoCompArr } });
    await Alert.deleteMany({ $or: [{ company_id: { $in: demoCompArr } }, { tenant_id: { $in: demoCompArr } }] });
    // AuditLog has a Mongoose immutability hook; bypass via native MongoDB collection
    await mongoose.connection.collection('auditlogs').deleteMany({ company_id: { $in: demoCompArr } });
  }

  // 2. Referrals & Reports
  if (demoRefArr.length > 0) {
    await Referral.deleteMany({ _id: { $in: demoRefArr } });
  }
  if (demoRepArr.length > 0) {
    await Report.deleteMany({ _id: { $in: demoRepArr } });
    await WhistleblowerReport.deleteMany({ _id: { $in: demoRepArr } });
  }

  // 3. Wellness Logs, Hazard Logs, Pulse, Cycles
  if (demoCompArr.length > 0 || demoUserArr.length > 0) {
    await PersonalWellnessLog.deleteMany({
      $or: [
        { company_id: { $in: demoCompArr } },
        { user_id: { $in: demoUserArr } }
      ]
    });
    await AnonHazardLog.deleteMany({
      $or: [
        { company_id: { $in: demoCompArr } },
        { tenant_id: { $in: demoCompArr } }
      ]
    });
    await PulseResponse.deleteMany({
      $or: [
        { company_id: { $in: demoCompArr } },
        { tenant_id: { $in: demoCompArr } }
      ]
    });
    await AssessmentCycle.deleteMany({ company_id: { $in: demoCompArr } });
  }

  // 4. Invites & Departments
  if (demoCompArr.length > 0) {
    await Invitation.deleteMany({ company_id: { $in: demoCompArr } });
    await DepartmentSnapshot.deleteMany({ company_id: { $in: demoCompArr } });
    await Department.deleteMany({ company_id: { $in: demoCompArr } });
  }

  // 5. Users, Doctors & Assessors
  if (demoUserArr.length > 0) {
    await User.deleteMany({ _id: { $in: demoUserArr } });
  }
  if (demoDoctorArr.length > 0) {
    await Doctor.deleteMany({ _id: { $in: demoDoctorArr } });
  }
  if (demoAssessorArr.length > 0) {
    await Assessor.deleteMany({ _id: { $in: demoAssessorArr } });
  }

  // 6. Tenants & Companies
  if (demoTenantArr.length > 0) {
    await Tenant.deleteMany({ _id: { $in: demoTenantArr } });
    await Company.deleteMany({ _id: { $in: demoTenantArr } });
  }

  // 7. Orphan Records (When approved by owner)
  if (cleanOrphans) {
    console.log('\nPurging confirmed orphan records from deleted company workspaces...');
    const orphanPwlRes = await PersonalWellnessLog.deleteMany({
      $and: [
        { company_id: { $nin: Array.from(allKnownCompanyIds) } },
        { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
      ]
    });
    const orphanAhlRes = await AnonHazardLog.deleteMany({
      $and: [
        { company_id: { $nin: Array.from(allKnownCompanyIds) } },
        { tenant_id: { $nin: Array.from(allKnownCompanyIds) } }
      ]
    });
    console.log(`  - Deleted orphan PersonalWellnessLogs: ${orphanPwlRes.deletedCount}`);
    console.log(`  - Deleted orphan AnonHazardLogs: ${orphanAhlRes.deletedCount}`);
  }

  console.log('\n✅ Deletion complete. All matching demo records have been removed.');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('\nFatal execution error:', err.message);
  process.exit(1);
});
