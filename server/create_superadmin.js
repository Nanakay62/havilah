require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');
const { encryptField, hashField } = require('./utils/crypto');

async function createSuperAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/wellframe');
    console.log('Connected to MongoDB');

    const adminEmail = 'super@wellframe.io';
    const plainPassword = 'superpassword123';
    
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
            company_id: 'SYSTEM_SUPER_ADMIN', // Bypassed by role
            full_name: 'Super Admin',
            role: 'super_admin',
            status: 'active',
            email_encrypted,
            email_hash,
            passwordHash
        });
        await user.save();
        console.log(`Created new Super Admin user!`);
    } else {
        user.role = 'super_admin';
        user.status = 'active';
        await user.save();
        console.log(`Updated existing user to Super Admin!`);
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

createSuperAdmin();
