require('dotenv').config();
const mongoose = require('mongoose');
const Tenant = require('./models/Tenant');
const Invitation = require('./models/Invitation');
const crypto = require('crypto');

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wellframe');
    console.log('Connected to MongoDB');

    // Create a dummy tenant if not exists
    let tenant = await Tenant.findOne({ slug: 'acme-corp' });
    if (!tenant) {
      tenant = await Tenant.create({
        company_name: 'Acme Corp',
        slug: 'acme-corp',
        billing_tier: 'enterprise',
        max_allowed_seats: 100,
        lifecycle_state: 'active'
      });
      console.log('Created Tenant:', tenant.company_id);
    }

    console.log('--------------------------------------------------');
    for (let i = 0; i < 3; i++) {
      const code = 'WFA-' + crypto.randomBytes(3).toString('hex').toUpperCase();
      const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days from now
      
      await Invitation.create({
        company_id: tenant.company_id,
        activation_code: code,
        status: 'pending',
        expires_at: expiresAt
      });
      console.log(`Activation Code ${i+1}: ${code}`);
    }
    console.log('Use ANY email for testing since these are new invitations.');
    console.log('--------------------------------------------------');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

seed();
