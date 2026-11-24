'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Assessor = require('../models/Assessor');
const Referral = require('../models/Referral');
const { withTransaction } = require('../utils/dbTransaction');
const { encryptField, hashField, validatePasswordStrength } = require('../utils/crypto');

async function resolveDefaultAssessor() {
  try {
    const preferredEmail = process.env.CLINICAL_INTAKE_EMAIL || process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'clarke.edith@gmail.com';
    return (
      (await Assessor.findOne({ email: preferredEmail, active: true })) ||
      (await Assessor.findOne({ email: 'dr.clarke@fzsafety.com', active: true })) ||
      (await Assessor.findOne({ active: true, email: { $not: /@clinic\.com$|\.test@/ } })) ||
      (await Assessor.findOne({ active: true }))
    );
  } catch (e) {
    console.warn('[authController] Assessor lookup warning:', e.message);
    return null;
  }
}

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
    const passwordCheck = validatePasswordStrength(cleanPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: passwordCheck.error,
      });
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

    // 3. Find default active Assessor (prefer designated clinical partner or FZ Safety)
    let defaultAssessor = null;
    try {
      const preferredEmail = process.env.CLINICAL_INTAKE_EMAIL || process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'clarke.edith@gmail.com';
      defaultAssessor = await Assessor.findOne({ email: preferredEmail, active: true }) ||
                        await Assessor.findOne({ email: 'dr.clarke@fzsafety.com', active: true }) ||
                        await Assessor.findOne({ active: true, email: { $not: /@clinic\.com$|\.test@/ } }) ||
                        await Assessor.findOne({ active: true });
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
      billing_tier: 'pro',
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
      status: hrUser.status,
      isSystemSuperAdmin: false,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
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

/**
 * Controller handling self-serve B2C Individual registration with a 30-day Personal free trial (no card required).
 */
async function registerIndividual(req, res, next) {
  try {
    const {
      fullName,
      full_name,
      email,
      password,
      timezone,
      consentAccepted,
      guestReference,
      guestToken,
    } = req.body || {};

    const personName = (fullName || full_name || '').trim();
    const cleanEmail = (email || '').trim().toLowerCase();
    const cleanPassword = (password || '').trim();

    if (!personName || personName.length < 2) {
      return res.status(400).json({ success: false, error: 'Full name is required (at least 2 characters).' });
    }
    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'A valid email address is required.' });
    }
    if (consentAccepted === false) {
      return res.status(400).json({
        success: false,
        error: 'CONSENT_REQUIRED',
        message: 'You must accept the Privacy Policy and Terms of Service to create an account.',
      });
    }

    const passwordCheck = validatePasswordStrength(cleanPassword);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: passwordCheck.error,
      });
    }

    // Enforce 1 trial per email across both Individual and Company accounts
    const emailHash = hashField(cleanEmail);
    const existingUser = await User.findOne({ email_hash: emailHash });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address already exists. Please log in or use a different email.',
      });
    }

    const defaultAssessor = await resolveDefaultAssessor();

    let baseSlug = personName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 40);
    if (!baseSlug) baseSlug = 'user';
    let slug = `ind-${baseSlug}-${Math.floor(1000 + Math.random() * 9000)}`;
    if (await Tenant.findOne({ slug })) {
      slug = `ind-${baseSlug}-${uuidv4().slice(0, 6)}`;
    }

    const companyId = uuidv4();
    const trialEndsAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const { iv, encrypted, authTag } = encryptField(cleanEmail);
    const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
    const passwordHash = await bcrypt.hash(cleanPassword, 10);

    let safeTz = 'UTC';
    if (timezone && typeof timezone === 'string') {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: timezone.trim() });
        safeTz = timezone.trim();
      } catch (_) {}
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const userId = uuidv4();
    const refreshToken = jwt.sign({ userId }, refreshSecret, { expiresIn: '7d' });

    let newTenant;
    let indUser;
    await withTransaction(async (dbSession) => {
      const sessOpt = dbSession ? { session: dbSession } : undefined;
      const createdTenants = await Tenant.create(
        [
          {
            company_id: companyId,
            company_name: `${personName} (Personal)`.slice(0, 256),
            slug,
            account_type: 'individual',
            billing_tier: 'personal',
            subscription: {
              tier: 'personal',
              status: 'trialing',
              currency: 'GHS',
              trialEndsAt,
              maxEmployees: 1,
              welcomeConsultationBenefit: 'none',
              welcomeConsultationUsed: false,
            },
            max_allowed_seats: 1,
            used_seats: 1,
            lifecycle_state: 'active',
            access_expires_at: null,
            activeAssessorId: defaultAssessor ? defaultAssessor._id : null,
          },
        ],
        sessOpt
      );
      newTenant = createdTenants[0];

      const createdUsers = await User.create(
        [
          {
            user_id: userId,
            company_id: newTenant.company_id,
            department_id: 'personal',
            full_name: personName,
            role: 'individual',
            status: 'active',
            timezone: safeTz,
            email_encrypted,
            email_hash: emailHash,
            passwordHash,
            refresh_token_hash: hashField(refreshToken),
            refresh_token_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            last_login_at: new Date(),
          },
        ],
        sessOpt
      );
      indUser = createdUsers[0];
    });

    // Optional: associate an existing paid guest consultation record if valid guestRef + guestToken supplied
    if (guestReference && guestToken) {
      try {
        const cleanRef = String(guestReference).trim().toUpperCase();
        const tokenHash = hashField(String(guestToken).trim());
        await Referral.findOneAndUpdate(
          {
            referenceCode: cleanRef,
            guestAccessTokenHash: tokenHash,
            'billing.payerType': 'guest_pay',
          },
          { $set: { 'billing.payerUserId': indUser.user_id } }
        );
      } catch (_) {}
    }

    const payload = {
      userId: indUser.user_id,
      companyId: newTenant.company_id,
      departmentId: 'personal',
      role: indUser.role,
      status: indUser.status,
      accountType: 'individual',
      isSystemSuperAdmin: false,
      tv: indUser.token_version || 0,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/',
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: {
        user_id: indUser.user_id,
        full_name: indUser.full_name,
        role: indUser.role,
        company_id: newTenant.company_id,
        account_type: 'individual',
      },
      tenant: {
        company_id: newTenant.company_id,
        company_name: newTenant.company_name,
        slug: newTenant.slug,
        account_type: 'individual',
        subscription: newTenant.subscription,
        effectiveTier: newTenant.getEffectiveTier(),
        activeAssessorId: newTenant.activeAssessorId,
      },
      redirectUrl: '/app/dashboard.html',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  registerTenant,
  registerIndividual,
};
