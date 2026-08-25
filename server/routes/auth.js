'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const { hashField } = require('../utils/crypto');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');

// POST /api/v1/auth/login - Rate limited (max 5 attempts per window)
router.post('/login', sensitiveRateLimiter(5), async (req, res, next) => {
  try {
    const { email, password } = req.body;

    if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'MISSING_CREDENTIALS',
        message: 'Email and password are required',
      });
    }

    const normalised = email.trim().toLowerCase();
    const emailHash = hashField(normalised);

    const user = await User.findOne({ email_hash: emailHash });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    if (user.status === 'deactivated') {
      return res.status(403).json({
        success: false,
        error: 'ACCOUNT_DEACTIVATED',
        message: 'This account has been deactivated',
      });
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password',
      });
    }

    if (user.company_id && !user.isSystemSuperAdmin) {
      const tenant = await Tenant.findOne({ company_id: user.company_id });
      if (tenant && tenant.lifecycle_state === 'suspended') {
        return res.status(403).json({
          success: false,
          error: 'TENANT_SUSPENDED',
          message: 'This company account has been suspended by system administrator',
        });
      }
    }

    const payload = {
      userId: user.user_id,
      companyId: user.company_id,
      departmentId: user.department_id,
      role: user.role,
      isSystemSuperAdmin: user.isSystemSuperAdmin || false
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret_for_dev', {
      expiresIn: '24h',
    });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    user.last_login_at = new Date();
    await user.save();

    return res.json({
      success: true,
      token,
      user: {
        user_id: user.user_id,
        role: user.role,
        full_name: user.full_name,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/verify-invite
router.post('/verify-invite', sensitiveRateLimiter(10), async (req, res, next) => {
  try {
    const { email, code, invite } = req.body;
    const activationCode = (code || invite || '').toString().trim().toUpperCase();

    // 1. PRIMARY AUTHORITY: Check for Activation Code / Magic Link
    if (activationCode) {
      const matchedInvite = await Invitation.findOne({ 
        activation_code: activationCode, 
        status: { $in: ['active', 'pending', 'used'] } 
      });

      if (!matchedInvite) {
        return res.status(400).json({ success: false, error: 'Invalid or revoked activation code' });
      }
      if (matchedInvite.status === 'revoked') {
        return res.status(400).json({ success: false, error: 'This activation code has been revoked by HR Admin' });
      }
      if (matchedInvite.expires_at && matchedInvite.expires_at < new Date()) {
        return res.status(400).json({ success: false, error: 'Activation code has expired' });
      }

      const tenant = await Tenant.findOne({ company_id: matchedInvite.company_id });
      if (!tenant) {
        return res.status(400).json({ success: false, error: 'Associated company not found for this code' });
      }

      const dept = matchedInvite.department_id ? await Department.findOne({ department_id: matchedInvite.department_id }) : null;

      return res.json({ 
        success: true, 
        companyName: tenant.company_name,
        companyId: tenant.company_id,
        departmentName: dept ? dept.name : 'General',
        departmentId: matchedInvite.department_id || 'unassigned',
        code: matchedInvite.activation_code
      });
    }

    // 2. FALLBACK: Check Email Domain Matching
    if (email && typeof email === 'string' && email.includes('@')) {
      const domain = email.trim().toLowerCase().split('@')[1];
      const tenant = await Tenant.findOne({ domain });

      if (tenant) {
        return res.json({
          success: true,
          companyName: tenant.company_name,
          companyId: tenant.company_id,
          departmentName: 'General',
          departmentId: 'unassigned',
          code: null
        });
      }
    }

    return res.status(400).json({ 
      success: false, 
      error: 'Associated company not found',
      message: 'No matching activation code or corporate email domain found.' 
    });
  } catch (err) {
    next(err);
  }
});

// Helper for Registration / Account Activation with Graceful Failure Handling
const handleRegistration = async (req, res, next) => {
  try {
    const { email, code, invite, password, fullName, full_name } = req.body;
    const name = fullName || full_name;
    const activationCode = (code || invite || '').toString().trim().toUpperCase();

    if (!email || !password || !name || typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, error: 'Email, full name, and password are required' });
    }

    let targetCompanyId = null;
    let targetDepartmentId = 'unassigned';
    let matchedInvite = null;

    // STEP 1: Activation Code / Magic Link as PRIMARY AUTHORITY
    if (activationCode) {
      matchedInvite = await Invitation.findOne({ 
        activation_code: activationCode, 
        status: { $in: ['active', 'pending', 'used'] } 
      });

      if (!matchedInvite) {
        return res.status(400).json({ success: false, error: 'Invalid or revoked activation code' });
      }
      if (matchedInvite.status === 'revoked') {
        return res.status(400).json({ success: false, error: 'This activation code has been revoked by HR Admin' });
      }
      if (matchedInvite.expires_at && matchedInvite.expires_at < new Date()) {
        return res.status(400).json({ success: false, error: 'Activation code has expired' });
      }

      targetCompanyId = matchedInvite.company_id;
      targetDepartmentId = matchedInvite.department_id || 'unassigned';
    } else {
      // STEP 2: Fallback to Domain Matching
      if (!email.includes('@')) {
        return res.status(400).json({ success: false, error: 'Please enter a valid email address' });
      }

      const domain = email.trim().toLowerCase().split('@')[1];
      const tenant = await Tenant.findOne({ domain });

      if (tenant) {
        targetCompanyId = tenant.company_id;
      } else {
        return res.status(400).json({ 
          success: false, 
          error: 'Associated company not found',
          message: 'No matching company domain or activation code found.' 
        });
      }
    }

    // Verify company exists and check seat capacity
    const tenant = await Tenant.findOne({ company_id: targetCompanyId });
    if (!tenant) {
      return res.status(400).json({ success: false, error: 'Associated company not found' });
    }

    if (tenant.used_seats >= tenant.max_allowed_seats) {
      return res.status(400).json({
        success: false,
        error: 'SEAT_LIMIT_EXCEEDED',
        message: 'This organization has reached its maximum seat limit. Please contact your HR administrator.'
      });
    }

    // Check if user already exists
    const email_hash = hashField(email.trim().toLowerCase());
    const existing = await User.findOne({ email_hash });
    if (existing) {
      return res.status(400).json({ success: false, error: 'User already registered with this email' });
    }

    // Create User & update seat usage
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email_encrypted: `enc_${Buffer.from(email).toString('base64')}`,
      email_hash,
      passwordHash,
      full_name: name,
      role: 'employee',
      company_id: targetCompanyId,
      department_id: targetDepartmentId
    });

    // Atomically increment seat usage
    await Tenant.updateOne({ company_id: targetCompanyId }, { $inc: { used_seats: 1 } });

    // Update invite usage count
    if (matchedInvite) {
      matchedInvite.usage_count = (matchedInvite.usage_count || 0) + 1;
      matchedInvite.used_by_user_id = user.user_id;
      await matchedInvite.save();
    }

    const payload = {
      userId: user.user_id,
      companyId: user.company_id,
      departmentId: user.department_id,
      role: user.role,
      isSystemSuperAdmin: false
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'fallback_secret_for_dev', {
      expiresIn: '24h',
    });

    return res.json({ 
      success: true, 
      token,
      message: 'Account activated successfully. You can now log in.',
      user: {
        user_id: user.user_id,
        role: user.role,
        full_name: user.full_name,
        company_id: user.company_id
      }
    });
  } catch (err) {
    next(err);
  }
};

const authController = require('../controllers/authController');

// POST /api/v1/auth/register-tenant - Self-serve HR & Organization Registration with 30-Day Pro Reverse Trial
router.post('/register-tenant', sensitiveRateLimiter(5), authController.registerTenant);

// GET /api/v1/auth/me - Validate bearer token freshness and return user profile
const { validateSession } = require('../middleware/auth');
router.get('/me', validateSession, async (req, res, next) => {
  try {
    const userId = req.sessionData ? req.sessionData.user_id : null;
    if (!userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const user = await User.findOne({ user_id: userId }).select('-passwordHash');
    if (!user) {
      return res.status(401).json({ success: false, error: 'User not found' });
    }

    // Resolve human-readable department name from the department_id in the DB
    // so the frontend always shows the correct department, not stale localStorage values.
    let department_name = 'General Staff';
    if (user.department_id && user.department_id !== 'unassigned') {
      try {
        const dept = await Department.findOne({ department_id: user.department_id }).select('name').lean();
        if (dept && dept.name) department_name = dept.name;
      } catch (e) {}
    }

    // Resolve tenant subscription and effective tier
    let tenantInfo = null;
    if (user.company_id) {
      try {
        const tenant = await Tenant.findOne({ company_id: user.company_id });
        if (tenant) {
          tenantInfo = {
            company_id: tenant.company_id,
            company_name: tenant.company_name,
            subscription: tenant.subscription,
            effectiveTier: tenant.getEffectiveTier ? tenant.getEffectiveTier() : (tenant.subscription?.tier || 'free'),
            activeAssessorId: tenant.activeAssessorId,
          };
        }
      } catch (e) {}
    }

    return res.json({
      success: true,
      user: {
        id: user.user_id,
        user_id: user.user_id,
        email_hash: user.email_hash,
        full_name: user.full_name,
        role: user.role,
        tenant_id: user.company_id,
        company_id: user.company_id,
        department_id: user.department_id,
        department_name,
        isSystemSuperAdmin: user.isSystemSuperAdmin || false,
      },
      tenant: tenantInfo,
    });
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

// POST /api/v1/auth/activate - Rate limited (max 5 attempts)
router.post('/activate', sensitiveRateLimiter(5), handleRegistration);

// POST /api/v1/auth/register - Rate limited (max 5 attempts)
router.post('/register', sensitiveRateLimiter(5), handleRegistration);

module.exports = router;
