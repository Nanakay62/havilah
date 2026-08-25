'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Assessor = require('../models/Assessor');
const { encryptField, hashField } = require('../utils/crypto');

/**
 * Controller handling self-serve tenant registration with 30-day Pro reverse trial.
 */
async function registerTenant(req, res, next) {
  try {
    const { companyName, company_name, fullName, full_name, email, password, industry } = req.body;

    const orgName = (companyName || company_name || '').trim();
    const adminName = (fullName || full_name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    // 1. Validation
    if (!orgName) {
      return res.status(400).json({ success: false, error: 'Company / Organization name is required.' });
    }
    if (!adminName) {
      return res.status(400).json({ success: false, error: 'Full name is required.' });
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid work email is required.' });
    }
    if (!cleanPassword || cleanPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Password must be at least 6 characters long.' });
    }

    // 2. Check if email is already in use
    const emailHash = hashField(cleanEmail);
    const existingUser = await User.findOne({ email_hash: emailHash });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address already exists. Please log in or use a different email.',
      });
    }

    // 3. Find default active Assessor
    let defaultAssessor = null;
    try {
      defaultAssessor = await Assessor.findOne({ active: true });
    } catch (e) {
      console.warn('[registerTenant] Assessor lookup warning:', e.message);
    }

    // 4. Generate unique slug for company
    let baseSlug = orgName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    if (!baseSlug) baseSlug = 'org-' + Math.floor(1000 + Math.random() * 9000);

    let slug = baseSlug;
    let slugExists = await Tenant.findOne({ slug });
    if (slugExists) {
      slug = `${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const companyId = uuidv4();
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    // 5. Create new Tenant with 30-day Pro reverse trial
    const newTenant = await Tenant.create({
      company_id: companyId,
      company_name: orgName,
      slug,
      billing_tier: 'trial',
      subscription: {
        tier: 'pro',
        status: 'trialing',
        trialEndsAt,
        maxEmployees: 100,
      },
      max_allowed_seats: 100,
      used_seats: 0,
      lifecycle_state: 'active',
      access_expires_at: trialEndsAt,
      activeAssessorId: defaultAssessor ? defaultAssessor._id : null,
      settings: {
        industry: industry ? String(industry).trim() : 'General',
      },
    });

    // 6. Encrypt email & hash password for HR Admin user
    const { iv, encrypted, authTag } = encryptField(cleanEmail);
    const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
    const passwordHash = await bcrypt.hash(cleanPassword, 10);

    // 7. Create initial HR Admin user
    const hrUser = await User.create({
      user_id: uuidv4(),
      company_id: newTenant.company_id,
      full_name: adminName,
      role: 'hr_admin',
      status: 'active',
      email_encrypted,
      email_hash: emailHash,
      passwordHash,
    });

    // 8. Generate JWT Auth Token
    const payload = {
      userId: hrUser.user_id,
      companyId: newTenant.company_id,
      departmentId: 'unassigned',
      role: hrUser.role,
      isSystemSuperAdmin: false,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret_for_dev', {
      expiresIn: '24h',
    });

    // 9. Set Secure Cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });

    // 10. Send Response
    return res.status(201).json({
      success: true,
      token,
      user: {
        user_id: hrUser.user_id,
        full_name: hrUser.full_name,
        role: hrUser.role,
        company_id: newTenant.company_id,
      },
      tenant: {
        company_id: newTenant.company_id,
        company_name: newTenant.company_name,
        slug: newTenant.slug,
        subscription: newTenant.subscription,
        effectiveTier: newTenant.getEffectiveTier(),
        activeAssessorId: newTenant.activeAssessorId,
      },
      redirectUrl: '/portal/hr.html',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerTenant,
};
