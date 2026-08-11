// server/scripts/createTestUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const User = require('../models/User');
const { hashField, encryptField } = require('../utils/crypto');

const testUsers = [
  {
    email: 'employee@test.com',
    password: 'password123',
    role: 'employee',
    company_id: '11111111-1111-4111-y111-111111111111', // Fixed UUID v4 representation
    department_id: '22222222-2222-4222-y222-222222222222'
  },
  {
    email: 'hr@test.com',
    password: 'password123',
    role: 'hr_admin',
    company_id: '11111111-1111-4111-y111-111111111111',
    department_id: '22222222-2222-4222-y222-222222222222'
  }
];

const seedTestUsers = async (skipConnection = false) => {
  try {
    if (!skipConnection) {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wellframe');
      console.log("📡 Connected to MongoDB for provisioning...");
    }

    // Clear existing test accounts to keep the DB clean
    await User.deleteMany({ 
      email_hash: { $in: testUsers.map(u => hashField(u.email)) } 
    });

    for (const u of testUsers) {
      const passwordHash = await bcrypt.hash(u.password, 10);
      const email_hash = hashField(u.email.trim().toLowerCase());
      const email_encrypted = JSON.stringify(encryptField(u.email.trim().toLowerCase()));

      await User.create({
        full_name: u.role === 'employee' ? 'Test Employee' : 'Test HR',
        email_encrypted,
        email_hash,
        passwordHash,
        role: u.role,
        company_id: u.company_id,
        department_id: u.department_id,
        status: 'active',
        supportConfiguration: {
          eapPhoneNumber: "+1-800-555-0199",
          eapCustomLabel: "Primary EAP Helpline",
          localEmergencyNumber: "988"
        }
      });
      console.log(`👤 Created ${u.role} account: ${u.email}`);
    }

    console.log("🚀 Test accounts provisioned successfully!");
    if (!skipConnection) process.exit(0);
  } catch (err) {
    console.error("❌ Seeding failed:", err);
    if (!skipConnection) process.exit(1);
  }
};

if (require.main === module) {
  seedTestUsers();
}

module.exports = { seedTestUsers };
