'use strict';

/**
 * seedDemoTenant.js
 *
 * Seeds a local development database with fictional demo data for showcase screenshots.
 * Strictly enforces localhost guard: refuses to run if connection string points elsewhere.
 *
 * Demo Accounts Created:
 * - HR Admin: hr.demo@havilah.local / DemoAdmin123!
 * - Employee: employee.demo@havilah.local / DemoEmployee123!
 * - Medical Assessor: assessor.demo@havilah.local / DemoAssessor123!
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// Ensure local crypto fallback if not present in environment
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  process.env.ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'demo-jwt-secret-local-showcase-2026';
}

const { encryptField, hashField } = require('../utils/crypto');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const DepartmentSnapshot = require('../models/DepartmentSnapshot');
const User = require('../models/User');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');
const Referral = require('../models/Referral');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const AnonHazardLog = require('../models/AnonHazardLog');
const HealthArticle = require('../models/HealthArticle');
const Report = require('../models/Report');

async function seedDemoTenant(customUri) {
  if (process.env.NODE_ENV === 'production') {
    console.error('FATAL: seedDemoTenant cannot run in production.');
    process.exit(1);
  }
  const uri = customUri || process.env.DEMO_MONGO_URI || process.env.MONGO_URI || process.env.MONGODB_URI;

  // STRICT LOCALHOST GUARD
  if (!uri || (!uri.includes('localhost') && !uri.includes('127.0.0.1'))) {
    console.error('================================================================');
    console.error('FATAL ERROR: seedDemoTenant MUST ONLY RUN AGAINST A LOCAL DATABASE');
    console.error('Target URI was:', uri ? uri.replace(/\/\/.*@/, '//<credentials>@') : 'UNDEFINED');
    console.error('Aborting execution to safeguard production & remote databases.');
    console.error('================================================================');
    throw new Error('Refusing to seed non-localhost database');
  }

  console.log(`[seedDemoTenant] Connecting to local database: ${uri.replace(/\/\/.*@/, '//<credentials>@')}`);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  console.log('[seedDemoTenant] Connected successfully. Seeding fictional demo tenant...');

  // 1. Seed or Upsert Tenant
  const tenantCompanyId = uuidv4();
  let tenant = await Tenant.findOne({ slug: 'havilah-demo' });
  if (!tenant) {
    tenant = await Tenant.create({
      company_id: tenantCompanyId,
      company_name: 'Apex Horizon Logistics',
      slug: 'havilah-demo',
      billing_tier: 'pro',
      domain: 'apexhorizon.local',
      max_allowed_seats: 100,
      used_seats: 32,
      settings: {
        n_size_threshold: 5,
        default_timezone: 'UTC',
        work_hours_start: 9,
        work_hours_end: 17,
        exclude_weekends: true,
      },
      active_modules: {
        copsoq: true,
        pss10: true,
        phq9: true,
        fas: true,
      },
      allowed_modules: ['DAILY_PULSE', 'PHQ-9', 'GAD-7', 'PSS-10', 'FAS-10', 'COPSOQ_III'],
    });
    console.log(`✓ Created demo tenant: ${tenant.company_name} (company_id: ${tenant.company_id})`);
  } else {
    console.log(`✓ Found existing demo tenant: ${tenant.company_name}`);
  }

  // 2. Seed 3 Departments
  const departmentsData = [
    { name: 'Engineering', canonical_name: 'engineering', path: 'engineering' },
    { name: 'Operations', canonical_name: 'operations', path: 'operations' },
    { name: 'Customer Support', canonical_name: 'customer-support', path: 'customer-support' },
  ];

  const deptDocs = [];
  const snapshotDocs = [];

  for (const d of departmentsData) {
    let dept = await Department.findOne({ company_id: tenant.company_id, name: d.name });
    if (!dept) {
      dept = await Department.create({
        department_id: uuidv4(),
        company_id: tenant.company_id,
        name: d.name,
        canonical_name: d.canonical_name,
        path: d.path,
        is_active: true,
      });
      console.log(`✓ Created department: ${dept.name}`);
    }
    deptDocs.push(dept);

    let snapshot = await DepartmentSnapshot.findOne({ company_id: tenant.company_id, department_id: dept.department_id });
    if (!snapshot) {
      snapshot = await DepartmentSnapshot.create({
        snapshot_id: uuidv4(),
        department_id: dept.department_id,
        company_id: tenant.company_id,
        name_at_time: dept.name,
        path_at_time: dept.path,
        version_at_time: 1,
      });
    }
    snapshotDocs.push(snapshot);
  }

  // 3. Seed Medical Assessor & Doctor
  const assessorEmail = 'assessor.demo@havilah.local';
  const assessorPassword = 'DemoAssessor123!';
  const assessorPasswordHash = await bcrypt.hash(assessorPassword, 10);

  let assessor = await Assessor.findOne({ email: assessorEmail });
  if (!assessor) {
    assessor = await Assessor.create({
      name: 'Dr. Evelyn Reed, MBChB',
      email: assessorEmail,
      passwordHash: assessorPasswordHash,
      organization: 'St. Luke Occupational Health Clinic',
      phone: '+233 20 555 0199',
      notificationEmail: assessorEmail,
      address: 'St. Luke Health Center, Ridge, Accra',
      billingSettings: {
        defaultRate: 450,
        defaultCurrency: 'GHS',
        taxId: 'TIN-GH-84920412',
        taxRate: 0,
        paymentInstructions: 'Direct bank transfer to St. Luke Occupational Clinic',
      },
      authorizedTenants: [tenant._id],
      active: true,
    });
    console.log(`✓ Created demo medical assessor: ${assessor.email}`);
  } else {
    assessor.passwordHash = assessorPasswordHash;
    assessor.authorizedTenants = [tenant._id];
    assessor.active = true;
    await assessor.save();
  }

  // Link tenant active assessor
  tenant.activeAssessorId = assessor._id;
  await tenant.save();

  // Create staff doctor under assessor
  let doctor = await Doctor.findOne({ email: assessorEmail });
  if (!doctor) {
    doctor = await Doctor.create({
      practiceId: assessor._id,
      fullName: 'Dr. Evelyn Reed',
      email: assessorEmail,
      passwordHash: assessorPasswordHash,
      phone: '+233 20 555 0199',
      specialty: 'Occupational Medicine Specialist',
      role: 'clinic_admin',
      active: true,
    });
    console.log(`✓ Created demo doctor record: ${doctor.email}`);
  }

  // 4. Seed HR Admin & Demo Employee
  const hrAdminEmail = 'hr.demo@havilah.local';
  const hrAdminPassword = 'DemoAdmin123!';
  const hrAdminPasswordHash = await bcrypt.hash(hrAdminPassword, 10);

  let hrUser = await User.findByEmail(hrAdminEmail);
  if (!hrUser) {
    const { iv, encrypted, authTag } = encryptField(hrAdminEmail);
    hrUser = await User.create({
      user_id: uuidv4(),
      company_id: tenant.company_id,
      department_id: deptDocs[0].department_id,
      full_name: 'Kofi Mensah (HR Director)',
      email_encrypted: JSON.stringify({ iv, encrypted, authTag }),
      email_hash: hashField(hrAdminEmail),
      passwordHash: hrAdminPasswordHash,
      role: 'hr_admin',
      status: 'active',
      timezone: 'UTC',
    });
    console.log(`✓ Created demo HR Admin: ${hrAdminEmail}`);
  }

  const employeeEmail = 'employee.demo@havilah.local';
  const employeePassword = 'DemoEmployee123!';
  const employeePasswordHash = await bcrypt.hash(employeePassword, 10);

  let empUser = await User.findByEmail(employeeEmail);
  if (!empUser) {
    const { iv, encrypted, authTag } = encryptField(employeeEmail);
    empUser = await User.create({
      user_id: uuidv4(),
      company_id: tenant.company_id,
      department_id: deptDocs[0].department_id,
      full_name: 'Demo Employee',
      email_encrypted: JSON.stringify({ iv, encrypted, authTag }),
      email_hash: hashField(employeeEmail),
      passwordHash: employeePasswordHash,
      role: 'employee',
      status: 'active',
      timezone: 'UTC',
      baseline_profile: {
        mood: 78,
        calm: 82,
        stress: 32,
        energy: 75,
        work_fit: 85,
        last_updated: new Date(),
      },
    });
    console.log(`✓ Created demo Employee: ${employeeEmail}`);
  }

  // 5. Seed Additional Anonymous Fictional Users to reach >= 8 responses per department
  const userIdsByDept = {
    [deptDocs[0].department_id]: [empUser.user_id],
    [deptDocs[1].department_id]: [],
    [deptDocs[2].department_id]: [],
  };

  for (let d = 0; d < deptDocs.length; d++) {
    const dept = deptDocs[d];
    const targetCount = 10; // at least 10 users per dept
    const needed = targetCount - userIdsByDept[dept.department_id].length;

    for (let i = 0; i < needed; i++) {
      const fictEmail = `fictional.user.${dept.canonical_name}.${i + 1}@apexhorizon.local`;
      const exists = await User.findByEmail(fictEmail);
      if (!exists) {
        const { iv, encrypted, authTag } = encryptField(fictEmail);
        const passHash = await bcrypt.hash('FictionalPass123!', 10);
        const u = await User.create({
          user_id: uuidv4(),
          company_id: tenant.company_id,
          department_id: dept.department_id,
          full_name: `Team Member ${i + 1} (${dept.name})`,
          email_encrypted: JSON.stringify({ iv, encrypted, authTag }),
          email_hash: hashField(fictEmail),
          passwordHash: passHash,
          role: 'employee',
          status: 'active',
          timezone: 'UTC',
          baseline_profile: {
            mood: 70 + (i % 15),
            calm: 68 + (i % 12),
            stress: 30 + (i % 20),
            energy: 72 + (i % 14),
            work_fit: 75 + (i % 15),
            last_updated: new Date(),
          },
        });
        userIdsByDept[dept.department_id].push(u.user_id);
      } else {
        userIdsByDept[dept.department_id].push(exists.user_id);
      }
    }
  }

  // 6. Seed PersonalWellnessLogs (14 days for Demo Employee + >= 8 responses per department)
  console.log('[seedDemoTenant] Seeding wellness logs for realistic charts...');
  await PersonalWellnessLog.deleteMany({ company_id: tenant.company_id });

  // 14 days of logs for the demo employee
  const now = Date.now();
  for (let day = 13; day >= 0; day--) {
    const logDate = new Date(now - day * 24 * 60 * 60 * 1000);
    // Subtle realistic curve
    const moodScore = Math.min(95, Math.max(60, 75 + Math.sin(day) * 10));
    const calmScore = Math.min(95, Math.max(60, 80 + Math.cos(day) * 8));
    const stressScore = Math.min(60, Math.max(20, 35 - Math.sin(day) * 8));
    const energyScore = Math.min(95, Math.max(55, 74 + Math.sin(day * 1.5) * 8));
    const workFitScore = Math.min(95, Math.max(65, 82 + Math.cos(day * 1.2) * 6));

    await PersonalWellnessLog.create({
      log_id: uuidv4(),
      user_id: empUser.user_id,
      company_id: tenant.company_id,
      department_id: deptDocs[0].department_id,
      survey_type: 'DAILY_PULSE',
      dimension_scores: {
        mood: Math.round(moodScore),
        calm: Math.round(calmScore),
        stress: Math.round(stressScore),
        energy: Math.round(energyScore),
        work_fit: Math.round(workFitScore),
      },
      composite_score: Math.round((moodScore + calmScore + (100 - stressScore) + energyScore + workFitScore) / 5),
      overallIndex: Math.round((moodScore + calmScore + energyScore + workFitScore) / 4),
      submitted_at: logDate,
    });
  }

  // Logs for all departments to ensure each has >= 8 responses and historical trend data
  for (let d = 0; d < deptDocs.length; d++) {
    const dept = deptDocs[d];
    const userIds = userIdsByDept[dept.department_id];

    // Seed 10 responses per department across the past 6 weeks
    for (let u = 0; u < userIds.length; u++) {
      const weekOffset = (u % 6);
      const logDate = new Date(now - weekOffset * 7 * 24 * 60 * 60 * 1000 - (u * 3600000));
      const m = 68 + ((u * 7) % 22);
      const c = 65 + ((u * 5) % 25);
      const s = 30 + ((u * 4) % 25);
      const e = 70 + ((u * 6) % 20);
      const w = 75 + ((u * 3) % 20);

      await PersonalWellnessLog.create({
        log_id: uuidv4(),
        user_id: userIds[u],
        company_id: tenant.company_id,
        department_id: dept.department_id,
        survey_type: u % 2 === 0 ? 'DAILY_PULSE' : 'PHQ-9',
        dimension_scores: { mood: m, calm: c, stress: s, energy: e, work_fit: w },
        composite_score: Math.round((m + c + (100 - s) + e + w) / 5),
        overallIndex: Math.round((m + c + e + w) / 4),
        submitted_at: logDate,
      });
    }
  }

  // 7. Seed AnonHazardLog for Heatmap & COPSOQ display
  await AnonHazardLog.deleteMany({ company_id: tenant.company_id });
  for (let d = 0; d < deptDocs.length; d++) {
    const dept = deptDocs[d];
    const snapshot = snapshotDocs[d];

    for (let h = 0; h < 8; h++) {
      const hazardDate = new Date(now - h * 3 * 24 * 60 * 60 * 1000);
      await AnonHazardLog.create({
        log_id: uuidv4(),
        company_id: tenant.company_id,
        department_id: dept.department_id,
        department_snapshot_id: snapshot.snapshot_id,
        survey_type: 'copsoq3_core',
        risk_category: 'psychosocial',
        dimension_scores: new Map([
          ['quantitative_demands', 42 + (h % 10)],
          ['work_pace', 50 + (h % 15)],
          ['emotional_demands', 38 + (h % 12)],
          ['influence_at_work', 65 + (h % 10)],
          ['possibilities_for_development', 72 + (h % 8)],
          ['social_support', 75 + (h % 10)],
        ]),
        composite_score: 72 + (h % 6),
        likelihood: 2,
        severity: 2,
        severity_band: 'mild',
        submitted_at: hazardDate,
        period_year: hazardDate.getUTCFullYear(),
        period_month: hazardDate.getUTCMonth() + 1,
        period_week: Math.ceil(hazardDate.getUTCDate() / 7),
      });
    }
  }

  // 8. Seed Referrals (5 fictional cases, anonymous reference codes)
  console.log('[seedDemoTenant] Seeding referrals with anonymous reference codes...');
  await Referral.deleteMany({ tenantId: tenant._id });

  const referralsData = [
    {
      referenceCode: 'REF-8492-K',
      departmentName: 'Engineering',
      preferredTime: 'Thursday 14:00 GMT',
      status: 'scheduled',
      scheduledAt: new Date(now + 24 * 60 * 60 * 1000),
      patientName: 'Demo Employee 01',
      patientContact: 'demo.emp01@example.com · +233 20 555 0101',
      intakeNotes: 'Ergonomic & focus assessment. Mild workplace fatigue reported.',
      thread: [
        {
          sender: 'employee',
          senderName: 'Demo Employee 01',
          message: 'Hello, I requested support regarding sleep disruption and work-related fatigue.',
          timestamp: new Date(now - 86400000),
        },
        {
          sender: 'assessor',
          senderName: 'Dr. Evelyn Reed',
          message: 'Hello. I have received your referral notes. Your session has been scheduled for Thursday at 14:00 GMT.',
          timestamp: new Date(now - 43200000),
        },
      ],
      billing: { amount: 450, currency: 'GHS', isBilled: false, settlementStatus: 'unbilled' },
    },
    {
      referenceCode: 'REF-3104-M',
      departmentName: 'Operations',
      preferredTime: 'Morning sessions preferred',
      status: 'pending',
      patientName: 'Demo Employee 02',
      patientContact: 'demo.emp02@example.com · +233 20 555 0102',
      intakeNotes: 'Stress assessment following peak logistics launch week.',
      thread: [],
      billing: { amount: 0, currency: 'GHS', isBilled: false, settlementStatus: 'unbilled' },
    },
    {
      referenceCode: 'REF-7721-P',
      departmentName: 'Customer Support',
      preferredTime: 'Afternoons after 15:00 GMT',
      status: 'pending',
      patientName: 'Demo Employee 03',
      patientContact: 'demo.emp03@example.com · +233 20 555 0103',
      intakeNotes: 'Self-referred for screen fatigue and ergonomic neck discomfort.',
      thread: [],
      billing: { amount: 0, currency: 'GHS', isBilled: false, settlementStatus: 'unbilled' },
    },
    {
      referenceCode: 'REF-5290-B',
      departmentName: 'Engineering',
      preferredTime: 'Completed session',
      status: 'completed',
      scheduledAt: new Date(now - 7 * 24 * 60 * 60 * 1000),
      patientName: 'Demo Employee 04',
      patientContact: 'demo.emp04@example.com · +233 20 555 0104',
      intakeNotes: 'Follow-up clinical consultation for workstation posture evaluation.',
      thread: [],
      billing: {
        amount: 450,
        currency: 'GHS',
        isBilled: true,
        billedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
        settlementStatus: 'settled',
        settledAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      },
    },
    {
      referenceCode: 'REF-6183-T',
      departmentName: 'Operations',
      preferredTime: 'Friday morning',
      status: 'scheduled',
      scheduledAt: new Date(now + 2 * 24 * 60 * 60 * 1000),
      patientName: 'Demo Employee 05',
      patientContact: 'demo.emp05@example.com · +233 20 555 0105',
      intakeNotes: 'Periodic wellbeing review for shift rotation schedule.',
      thread: [],
      billing: { amount: 450, currency: 'GHS', isBilled: false, settlementStatus: 'unbilled' },
    },
  ];

  for (const ref of referralsData) {
    await Referral.create({
      referenceCode: ref.referenceCode,
      company_id: tenant.company_id,
      tenantId: tenant._id,
      assignedAssessorId: assessor._id,
      assignedDoctorId: doctor._id,
      departmentName: ref.departmentName,
      preferredTime: ref.preferredTime,
      status: ref.status,
      scheduledAt: ref.scheduledAt || null,
      clinicalDetails: {
        patientName: ref.patientName,
        patientContact: ref.patientContact,
        intakeNotes: ref.intakeNotes,
      },
      thread: ref.thread || [],
      billing: ref.billing,
    });
  }
  console.log('✓ Created 5 demo referrals with anonymous reference codes');

  // 9. Seed HealthArticles for Employee Library
  const articlesCount = await HealthArticle.countDocuments();
  if (articlesCount === 0) {
    await HealthArticle.create([
      {
        article_id: uuidv4(),
        title: 'Physiological Sigh & 4-7-8 Breathing Reset',
        slug: 'physiological-sigh-breathing',
        category: 'stress',
        summary: 'A fast, evidence-based somatic practice to down-regulate high autonomic arousal during the workday.',
        content_markdown: 'Take two quick inhales through the nose, followed by a long, relaxed exhalation through the mouth.',
        read_time_minutes: 3,
      },
      {
        article_id: uuidv4(),
        title: 'Circadian Light Alignment & Sleep Architecture',
        slug: 'circadian-light-alignment',
        category: 'sleep',
        summary: 'How early morning sunlight and evening screen boundaries optimize restorative deep sleep phases.',
        content_markdown: 'Viewing natural sunlight within 60 minutes of waking sets your internal circadian clock.',
        read_time_minutes: 4,
      },
      {
        article_id: uuidv4(),
        title: 'Async Work Boundaries & Cognitive Recovery',
        slug: 'async-work-boundaries',
        category: 'work_life_balance',
        summary: 'Practical strategies to prevent attention fragmentation and maintain calm focus in modern teams.',
        content_markdown: 'Batch notification checks to twice daily rather than constant context switching.',
        read_time_minutes: 3,
      },
    ]);
    console.log('✓ Created 3 wellness health articles');
  }

  // 10. Seed 1-2 Anonymous Whistleblower / Ethics Reports for HR portal
  const reportCount = await Report.countDocuments({ tenantId: tenant._id });
  if (reportCount === 0) {
    const pinHash = await bcrypt.hash('1234', 10);
    await Report.create({
      trackingCode: 'ETH-2026-9041',
      pinHash,
      tenantId: tenant._id,
      category: 'Workplace Safety',
      description: 'Observation regarding emergency exit illumination in warehouse bay 4.',
      urgency: 'Standard',
      involvesLeadershipOrHR: false,
      status: 'submitted',
      thread: [
        {
          sender: 'whistleblower',
          message: 'Observation regarding emergency exit illumination in warehouse bay 4.',
          timestamp: new Date(now - 3 * 24 * 60 * 60 * 1000),
        },
      ],
    });
    console.log('✓ Created demo anonymous ethics report for HR portal');
  }

  // 11. Write .env.demo file (gitignored)
  const envDemoContent = `# Havilah Demo Credentials (Local Dev Showcase Only)
DEMO_MONGO_URI=${uri}
DEMO_COMPANY_NAME=${tenant.company_name}
DEMO_COMPANY_ID=${tenant.company_id}
DEMO_TENANT_SLUG=${tenant.slug}

HR_EMAIL=${hrAdminEmail}
HR_PASSWORD=${hrAdminPassword}

EMPLOYEE_EMAIL=${employeeEmail}
EMPLOYEE_PASSWORD=${employeePassword}

ASSESSOR_EMAIL=${assessorEmail}
ASSESSOR_PASSWORD=${assessorPassword}
`;

  const envDemoPath = path.join(__dirname, '../../.env.demo');
  fs.writeFileSync(envDemoPath, envDemoContent, 'utf8');
  console.log(`✓ Generated local demo credentials at: ${envDemoPath}`);

  console.log('================================================================');
  console.log('DEMO TENANT SEEDING COMPLETE');
  console.log('Tenant:', tenant.company_name, `(${tenant.slug})`);
  console.log('HR Admin:', hrAdminEmail, '/', hrAdminPassword);
  console.log('Employee:', employeeEmail, '/', employeePassword);
  console.log('Assessor:', assessorEmail, '/', assessorPassword);
  console.log('Departments:', deptDocs.map(d => d.name).join(', '));
  console.log('Total Wellness Logs:', await PersonalWellnessLog.countDocuments({ company_id: tenant.company_id }));
  console.log('Total Referrals:', await Referral.countDocuments({ tenantId: tenant._id }));
  console.log('================================================================');

  return {
    tenant,
    deptDocs,
    assessor,
    doctor,
    hrUser,
    empUser,
  };
}

if (require.main === module) {
  seedDemoTenant()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seedDemoTenant] Error:', err);
      process.exit(1);
    });
}

module.exports = { seedDemoTenant };
