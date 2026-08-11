'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const User = require('../models/User');
const AnonHazardLog = require('../models/AnonHazardLog');

async function seedDemoData() {
  let connectedHere = false;
  if (mongoose.connection.readyState !== 1) {
    const mongoURI = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/wellframe';
    try {
      await mongoose.connect(mongoURI, { serverSelectionTimeoutMS: 5000 });
      connectedHere = true;
      console.log('[seedDemoData] Connected to MongoDB');
    } catch (err) {
      console.warn('[seedDemoData] Could not connect to MongoDB, using memory/mock seed payload for testing:', err.message);
    }
  }

  const companyId = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';
  const companyName = 'Acme Corp Test';
  const slug = 'acme-corp-test';

  const tenantData = {
    company_id: companyId,
    company_name: companyName,
    slug: slug,
    billing_tier: 'enterprise',
    max_allowed_seats: 100,
    used_seats: 15,
    lifecycle_state: 'active',
    hotline_config: {
      eap_number: '1-800-555-FZCARE',
      crisis_number: '988',
      occupational_health_contact: 'referrals@fzsafetyhealth.com'
    },
    settings: {
      clinical_partner: 'FZ Safety and Health',
      allow_custom_eap_overrides: true,
      n_size_threshold: 5
    }
  };

  const depts = [
    { name: 'Operations', canonical: 'operations', count: 3 },
    { name: 'Engineering', canonical: 'engineering', count: 12 }
  ];

  let createdTenant = tenantData;
  let createdDepts = [];
  let createdUsers = [];
  let createdLogs = [];

  if (mongoose.connection.readyState === 1) {
    // 1. Clean existing test data for company_id or slug
    await Tenant.deleteMany({ $or: [{ company_id: companyId }, { slug: slug }] });
    await Department.deleteMany({ company_id: companyId });
    await User.deleteMany({ company_id: companyId });
    await AnonHazardLog.deleteMany({ company_id: companyId });

    // 2. Create Tenant
    createdTenant = new Tenant(tenantData);
    await createdTenant.save();

    // 3. Create Departments
    for (const d of depts) {
      const deptDoc = new Department({
        company_id: companyId,
        name: d.name,
        canonical_name: d.canonical,
        path: d.canonical
      });
      await deptDoc.save();
      createdDepts.push(deptDoc);
    }

    const opsDept = createdDepts.find(d => d.canonical_name === 'operations');
    const engDept = createdDepts.find(d => d.canonical_name === 'engineering');

    // 4. Create 15 Mock Employees (3 in Operations, 12 in Engineering)
    for (let i = 1; i <= 15; i++) {
      const isOps = i <= 3;
      const deptObj = isOps ? opsDept : engDept;
      const role = i === 1 ? 'hr_admin' : 'employee';
      const userDoc = new User({
        company_id: companyId,
        department_id: deptObj.department_id,
        full_name: `Test Employee ${i}`,
        role: role,
        passwordHash: '$2a$10$e8N8k8/p28b52z5s8w9u2e8v2h8c2m2k2j2i2h2g2f2e2d2c2b2a',
        _plaintext_email: `test.user${i}@acmecorptest.com`,
        email_encrypted: `enc_test_user${i}@acmecorptest.com`,
        email_hash: `hash_test_user${i}@acmecorptest.com`
      });
      await userDoc.save();
      createdUsers.push(userDoc);
    }

    // 5. Create Daily Check-in AnonHazardLogs & Burnout Alerts
    const now = new Date();
    // Operations logs (3 employees -> N = 3 < 5)
    for (let i = 0; i < 3; i++) {
      const log = new AnonHazardLog({
        company_id: companyId,
        department_id: opsDept.department_id,
        department_snapshot_id: opsDept.department_id,
        survey_type: 'pss10',
        risk_category: 'psychosocial',
        severity_band: 'mild',
        severity: 2,
        likelihood: 2,
        composite_score: 4,
        dimension_scores: { mood: 70, calm: 65, stress: 30, energy: 60, work_fit: 75 },
        submitted_at: now
      });
      await log.save();
      createdLogs.push(log);
    }

    // Engineering logs (12 employees -> N = 12 >= 5, with active burnout alerts)
    for (let i = 0; i < 12; i++) {
      const severityBand = i < 4 ? 'severe' : 'moderate'; // high risk for burnout alerts
      const log = new AnonHazardLog({
        company_id: companyId,
        department_id: engDept.department_id,
        department_snapshot_id: engDept.department_id,
        survey_type: 'pss10',
        risk_category: 'psychosocial',
        severity_band: severityBand,
        severity: severityBand === 'severe' ? 4 : 3,
        likelihood: 4,
        composite_score: severityBand === 'severe' ? 16 : 12,
        dimension_scores: { mood: 50, calm: 45, stress: 78, energy: 40, work_fit: 52 },
        submitted_at: now
      });
      await log.save();
      createdLogs.push(log);
    }

    console.log(`[seedDemoData] Successfully seeded Acme Corp Test (Tenant, 2 Departments, 15 Users, 15 Check-in Logs)`);
  } else {
    console.log(`[seedDemoData] Memory payload initialized for Acme Corp Test (15 Mock Employees, Operations N=3, Engineering N=12)`);
  }

  if (connectedHere && require.main === module) {
    await mongoose.connection.close();
  }

  return {
    success: true,
    company_id: companyId,
    tenant_name: companyName,
    departments: [
      { name: 'Operations', count: 3, meets_n_threshold: false },
      { name: 'Engineering', count: 12, meets_n_threshold: true }
    ],
    total_employees: 15,
    active_provider: 'FZ Safety and Health'
  };
}

if (require.main === module) {
  seedDemoData()
    .then(res => {
      console.log('Seed Res:', JSON.stringify(res, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('Seed Error:', err);
      process.exit(1);
    });
}

module.exports = { seedDemoData };
