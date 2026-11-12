'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { encryptField, hashField } = require('../utils/crypto');

function parseArgs() {
  const args = process.argv.slice(2);
  let email = process.env.SUPERADMIN_EMAIL || '';
  let password = process.env.SUPERADMIN_PASSWORD || '';
  let name = process.env.SUPERADMIN_NAME || 'Super Administrator';
  let uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      email = arg.substring(8).trim();
    } else if (arg.startsWith('--password=')) {
      password = arg.substring(11).trim();
    } else if (arg.startsWith('--name=')) {
      name = arg.substring(7).trim();
    } else if (arg.startsWith('--uri=')) {
      uri = arg.substring(6).trim();
    }
  }

  if (!email || !password) {
    console.error('Usage: node server/scripts/createSuperAdmin.js --email=admin@example.com --password=SecurePassword123! [--name="Admin Name"]');
    process.exit(1);
  }

  return { email, password, name, uri };
}

async function run() {
  const { email, password, name, uri } = parseArgs();

  if (!uri) {
    console.error('ERROR: No database URI provided or found in server/.env');
    process.exit(1);
  }

  const maskedUri = uri.replace(/\/\/[^:]+:[^@]+@/, '//***:***@');
  console.log(`Connecting to: ${maskedUri}...`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  console.log(`Connected to database: "${mongoose.connection.db.databaseName}"`);

  const normalised = email.trim().toLowerCase();
  let user = await User.findByEmail(normalised);

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  if (!user) {
    const { iv, encrypted, authTag } = encryptField(normalised);
    const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
    const email_hash = hashField(normalised);

    user = new User({
      company_id: 'SYSTEM_SUPER_ADMIN',
      full_name: name,
      role: 'super_admin',
      isSystemSuperAdmin: true,
      status: 'active',
      email_encrypted,
      email_hash,
      passwordHash
    });

    await user.save();
    console.log(`\n✅ Successfully created Super Admin account for: ${email}`);
  } else {
    user.full_name = name || user.full_name || 'Super Admin';
    user.passwordHash = passwordHash;
    user.role = 'super_admin';
    user.isSystemSuperAdmin = true;
    user.status = 'active';
    await user.save();
    console.log(`\n✅ Successfully upgraded existing account to Super Admin: ${email}`);
  }

  console.log(`\nSuper Admin Details:`);
  console.log(`  Name: ${user.full_name}`);
  console.log(`  Email: ${email}`);
  console.log(`  Role: super_admin`);
  console.log(`  isSystemSuperAdmin: true`);
  console.log(`  Default Password: ${password}`);
  console.log(`\nYou can now log in at /login.html using this email and password.`);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
