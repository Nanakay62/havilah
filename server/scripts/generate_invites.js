'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const Invitation = require('../models/Invitation');

async function run() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/copsoq';
  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to MongoDB');

  try {
    // 1. Find or create a Tenant
    let tenant = await Tenant.findOne({ slug: 'acme-corp' });
    if (!tenant) {
      tenant = await Tenant.create({
        company_name: 'Acme Corp (Testing)',
        slug: 'acme-corp',
        billing_tier: 'enterprise',
        max_allowed_seats: 100,
        lifecycle_state: 'active'
      });
      console.log('Created Mock Tenant: Acme Corp');
    } else {
      console.log('Found Existing Tenant: Acme Corp');
    }

    // 2. Generate 3 unique codes
    console.log('\n--- GENERATING 3 INVITATION CODES ---');
    for (let i = 1; i <= 3; i++) {
      const code = `ACME-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      
      await Invitation.create({
        company_id: tenant.company_id,
        activation_code: code,
        status: 'pending'
      });

      console.log(`Code ${i}: ${code}`);
    }

    console.log('\nUse these codes at http://localhost:3000/activate.html');
    console.log('-------------------------------------\n');

  } catch (err) {
    console.error('Error generating invites:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    process.exit(0);
  }
}

run();
