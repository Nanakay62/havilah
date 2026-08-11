'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { encryptField, hashField } = require('../utils/crypto');

async function createTrialCompany(companyName, hrAdminEmail, hrAdminPassword, seatLimit = 50, inviteCount = 5) {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI is not defined in env');
  }

  await mongoose.connect(mongoUri);
  console.log('[Setup] Connected to MongoDB Atlas.');

  try {
    const slug = companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    // 1. Create or fetch Tenant
    let tenant = await Tenant.findOne({ slug });
    if (!tenant) {
      tenant = await Tenant.create({
        company_id: uuidv4(),
        company_name: companyName,
        slug: slug,
        billing_tier: 'trial',
        max_allowed_seats: seatLimit,
        lifecycle_state: 'active',
        access_expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30-day trial
      });
      console.log(`[OK] Created Tenant: ${companyName} (${tenant.company_id})`);
    } else {
      console.log(`[INFO] Tenant "${companyName}" already exists.`);
    }

    // 2. Create or fetch HR Admin User
    const normalisedEmail = hrAdminEmail.trim().toLowerCase();
    const emailHash = hashField(normalisedEmail);
    let hrUser = await User.findOne({ email_hash: emailHash });

    if (!hrUser) {
      const { iv, encrypted, authTag } = encryptField(normalisedEmail);
      const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
      const passwordHash = await bcrypt.hash(hrAdminPassword, 10);

      hrUser = await User.create({
        user_id: uuidv4(),
        company_id: tenant.company_id,
        full_name: `${companyName} HR Admin`,
        role: 'hr_admin',
        status: 'active',
        email_encrypted,
        email_hash: emailHash,
        passwordHash
      });
      console.log(`[OK] Created HR Admin User: ${hrAdminEmail}`);
    } else {
      hrUser.role = 'hr_admin';
      hrUser.company_id = tenant.company_id;
      hrUser.status = 'active';
      await hrUser.save();
      console.log(`[INFO] Updated existing user ${hrAdminEmail} to HR Admin.`);
    }

    // 3. Generate Activation Codes
    const codes = [];
    const prefix = slug.substring(0, 4).toUpperCase();
    for (let i = 1; i <= inviteCount; i++) {
      const randomPart1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const randomPart2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `${prefix}-${randomPart1}-${randomPart2}`;

      await Invitation.create({
        company_id: tenant.company_id,
        activation_code: code,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      codes.push(code);
    }

    console.log('\n======================================================');
    console.log(`🚀 TRIAL SETUP COMPLETE FOR: ${companyName.toUpperCase()}`);
    console.log('======================================================');
    console.log(`• Company ID       : ${tenant.company_id}`);
    console.log(`• Billing Tier     : ${tenant.billing_tier.toUpperCase()}`);
    console.log(`• Max Seats Allowed: ${tenant.max_allowed_seats}`);
    console.log(`• Trial Expiration : ${tenant.access_expires_at.toISOString().split('T')[0]}`);
    console.log('------------------------------------------------------');
    console.log('🔑 HR ADMIN LOGIN CREDENTIALS:');
    console.log(`• Portal URL       : http://localhost:3000/login.html`);
    console.log(`• Email            : ${hrAdminEmail}`);
    console.log(`• Password         : ${hrAdminPassword}`);
    console.log('------------------------------------------------------');
    console.log('🎫 EMPLOYEE ACTIVATION / SURVEY CODES:');
    codes.forEach((c, idx) => {
      console.log(`  Code ${idx + 1}: ${c}`);
    });
    console.log('• Employee Activation URL: http://localhost:3000/register.html');
    console.log('======================================================\n');

  } catch (err) {
    console.error('Error creating trial company:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

// Check CLI arguments or run default example
const args = process.argv.slice(2);
const compName = args[0] || 'Trial Partner Ltd';
const adminEmail = args[1] || 'hr@trialpartner.com';
const adminPass = args[2] || 'TrialAdmin2026!';
const seats = parseInt(args[3]) || 50;
const inviteCount = parseInt(args[4]) || 5;

createTrialCompany(compName, adminEmail, adminPass, seats, inviteCount);
