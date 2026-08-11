require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const Tenant = require('./models/Tenant');
const { encryptField, hashField } = require('./utils/crypto');

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wellframe');
    console.log('Connected to MongoDB');

    let tenant = await Tenant.findOne({ slug: 'acme-corp' });
    if (!tenant) {
        console.error('Tenant not found');
        return;
    }

    const adminEmail = 'admin@wellframe.io';
    const plainPassword = 'password123';
    
    // Check if user already exists
    let user = await User.findByEmail(adminEmail);
    if (!user) {
        const normalised = adminEmail.trim().toLowerCase();
        const { iv, encrypted, authTag } = encryptField(normalised);
        const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
        const email_hash = hashField(normalised);

        const salt = await bcrypt.genSalt(10);
        const passwordHash = await bcrypt.hash(plainPassword, salt);

        user = new User({
            company_id: tenant.company_id,
            full_name: 'HR Admin User',
            role: 'hr_admin',
            status: 'active',
            email_encrypted,
            email_hash,
            passwordHash
        });
        await user.save();
        console.log(`Created new HR Admin user!`);
    } else {
        user.role = 'hr_admin';
        user.status = 'active';
        await user.save();
        console.log(`Updated existing user to HR Admin!`);
    }

    console.log(`Email: ${adminEmail}`);
    console.log(`Password: ${plainPassword}`);

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

createAdmin();
