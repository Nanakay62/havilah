'use strict';

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const { encryptField, decryptField, hashField, validatePasswordStrength } = require('../utils/crypto');
const { generateTotpSecret, verifyTotpCode, getOtpAuthUrl, generateRecoveryCodes, verifyAndConsumeRecoveryCode } = require('../utils/totp');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');
const { sensitiveRateLimiter } = require('../middleware/rateLimiter');
const { validate } = require('../middleware/validate');
const { LoginSchema, RegisterSchema } = require('../schemas/auth.schema');

// POST /api/v1/auth/login - Rate limited (max 15 failed attempts per 15m window; successful logins do not count)
router.post('/login', sensitiveRateLimiter(5, { skipSuccessfulRequests: true }), validate(LoginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body;

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

    const isSuper = user.isSystemSuperAdmin === true || user.role === 'super_admin' || user.role === 'superadmin';

    if (user.company_id && !isSuper && user.company_id !== 'SYSTEM_SUPER_ADMIN') {
      const tenant = await Tenant.findOne({ company_id: user.company_id });
      if (tenant && tenant.lifecycle_state === 'suspended') {
        return res.status(403).json({
          success: false,
          error: 'TENANT_SUSPENDED',
          message: 'This company account has been suspended by system administrator',
        });
      }
      if (tenant && (tenant.lifecycle_state === 'expired' || (tenant.access_expires_at && new Date() > new Date(tenant.access_expires_at)))) {
        return res.status(403).json({
          success: false,
          error: 'Access expired. Please contact administrator.',
          code: 'TENANT_EXPIRED',
        });
      }
    }

    const payload = {
      userId: user.user_id,
      companyId: user.company_id,
      departmentId: user.department_id,
      role: user.role,
      status: user.status,
      isSystemSuperAdmin: isSuper,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '24h',
    });

    // Issue 7-day Refresh Token
    if (user.totp_enabled && user.totp_secret) {
      const challengeToken = jwt.sign(
        {
          purpose: '2fa_login',
          entityType: 'user',
          userId: user.user_id,
          companyId: user.company_id,
          departmentId: user.department_id,
          role: user.role,
          status: user.status,
          isSystemSuperAdmin: isSuper,
        },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      return res.json({
        success: true,
        requires_2fa: true,
        temp_token: challengeToken,
        user: {
          user_id: user.user_id,
          role: user.role,
          full_name: user.full_name,
        },
        message: 'Two-factor authentication code required.',
      });
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const refreshToken = jwt.sign({ userId: user.user_id }, refreshSecret, { expiresIn: '7d' });
    user.refresh_token_hash = hashField(refreshToken);
    user.refresh_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    user.last_login_at = new Date();
    await user.save();

    return res.json({
      success: true,
      token,
      refreshToken,
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

    const passwordCheck = validatePasswordStrength(password);
    if (!passwordCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: passwordCheck.error,
      });
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
      return res.status(400).json({
        success: false,
        error: 'EMAIL_ALREADY_EXISTS',
        message: 'An account with this email address already exists. Please log in or use a different email.'
      });
    }

    // Encrypt email using AES-256-GCM
    const { iv, encrypted, authTag } = encryptField(email.trim().toLowerCase());
    const email_encrypted = JSON.stringify({ iv, encrypted, authTag });

    // Create User & update seat usage
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({
      email_encrypted,
      email_hash,
      passwordHash,
      full_name: name,
      role: 'employee',
      status: 'active',
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
      status: user.status,
      isSystemSuperAdmin: false
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
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

    let user = await User.findOne({ user_id: userId }).select('-passwordHash');
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

    // Decrypt user email for authenticated profile display
    let userEmail = null;
    if (user.email_encrypted) {
      try {
        const parsed = typeof user.email_encrypted === 'string' ? JSON.parse(user.email_encrypted) : user.email_encrypted;
        if (parsed && parsed.iv && parsed.encrypted && parsed.authTag) {
          const { decryptField } = require('../utils/crypto');
          userEmail = decryptField({ iv: parsed.iv, encrypted: parsed.encrypted, authTag: parsed.authTag });
        }
      } catch (e) {}
    }

    return res.json({
      success: true,
      user: {
        id: user.user_id,
        user_id: user.user_id,
        email: userEmail,
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

// POST /api/v1/auth/refresh - Rotate access token using valid refresh token
router.post('/refresh', sensitiveRateLimiter(20), async (req, res, next) => {
  try {
    const refreshToken = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ success: false, error: 'REFRESH_TOKEN_MISSING', message: 'No refresh token provided' });
    }

    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const decoded = jwt.verify(refreshToken, refreshSecret);
    const tokenHash = hashField(refreshToken);

    const user = await User.findOne({
      user_id: decoded.userId,
      refresh_token_hash: tokenHash,
      refresh_token_expires_at: { $gt: new Date() },
    });

    if (!user) {
      return res.status(401).json({ success: false, error: 'REFRESH_TOKEN_INVALID', message: 'Refresh token is expired or has been revoked' });
    }

    const payload = {
      userId: user.user_id,
      companyId: user.company_id,
      departmentId: user.department_id,
      role: user.role,
      status: user.status,
      isSystemSuperAdmin: user.isSystemSuperAdmin || false
    };

    const newToken = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: '24h'
    });

    res.cookie('token', newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000,
      path: '/'
    });

    res.json({ success: true, token: newToken });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'REFRESH_TOKEN_INVALID', message: 'Invalid or expired refresh token' });
    }
    next(err);
  }
});

// POST /api/v1/auth/erase-account - GDPR Art. 17 Right to Erasure
router.post('/erase-account', sensitiveRateLimiter(3), validateSession, async (req, res, next) => {
  try {
    const { password } = req.body;
    if (!password) {
      return res.status(400).json({ success: false, error: 'PASSWORD_REQUIRED', message: 'Password required to confirm account erasure.' });
    }

    const user = await User.findOne({ user_id: req.sessionData.user_id });
    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User record not found.' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ success: false, error: 'INVALID_CREDENTIALS', message: 'Incorrect password provided for erasure confirmation.' });
    }

    // 1. Decrement tenant used seats count if bound to a tenant
    if (user.company_id) {
      await Tenant.updateOne({ company_id: user.company_id }, { $inc: { used_seats: -1 } });
    }

    // 2. Permanently delete personal wellness logs identified with this user_id
    const PersonalWellnessLog = require('../models/PersonalWellnessLog');
    await PersonalWellnessLog.deleteMany({ user_id: user.user_id });

    // 3. Note: AnonHazardLog documents are deliberately preserved because they have NO user_id or IP linkage (Zero-PII)

    // 4. Delete the User account record completely
    await User.deleteOne({ user_id: user.user_id });

    // 5. Clear all session and refresh cookies
    res.clearCookie('token', { path: '/' });
    res.clearCookie('refreshToken', { path: '/' });

    return res.json({
      success: true,
      message: 'Your account and all personal wellbeing logs have been permanently erased under GDPR Article 17.'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/change-password - Authenticated password change
router.post('/change-password', sensitiveRateLimiter(5), validateSession, async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.sessionData?.user_id;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Current password and new password are required.',
      });
    }

    const user = await User.findOne({ user_id: userId });
    if (!user) {
      return res.status(404).json({ success: false, error: 'USER_NOT_FOUND', message: 'User not found.' });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CURRENT_PASSWORD',
        message: 'Current password is incorrect.',
      });
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: strengthCheck.error,
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    await user.save();

    return res.json({
      success: true,
      message: 'Password updated successfully.',
    });
  } catch (err) {
    next(err);
  }
});

const mongoose = require('mongoose');
async function findFallbackClinicAccount(query) {
  const dbReady = mongoose.connection && mongoose.connection.readyState === 1;
  if (dbReady || Assessor.findOne !== mongoose.Model.findOne) {
    try {
      const assessor = await Assessor.findOne(query);
      if (assessor) return assessor;
    } catch (_) {}
  }
  if (dbReady || Doctor.findOne !== mongoose.Model.findOne) {
    try {
      const doctor = await Doctor.findOne(query);
      if (doctor) return doctor;
    } catch (_) {}
  }
  return null;
}

// POST /api/v1/auth/forgot-password - Rate limited (max 5 attempts per window)
router.post('/forgot-password', sensitiveRateLimiter(5), async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ success: false, error: 'EMAIL_REQUIRED', message: 'A valid email address is required.' });
    }

    const normalised = email.trim().toLowerCase();
    const emailHash = hashField(normalised);

    let user = await User.findOne({ email_hash: emailHash });
    if (!user) user = await findFallbackClinicAccount({ email: normalised });

    // Always respond with success to prevent user enumeration attacks
    if (!user || user.status === 'deactivated' || user.active === false) {
      return res.json({
        success: true,
        message: 'If an active account exists for that email, a password reset link has been dispatched.'
      });
    }

    // Generate secure 32-byte reset token
    const crypto = require('crypto');
    const rawResetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = hashField(rawResetToken);

    // Token expires in 1 hour
    user.password_reset_token_hash = resetTokenHash;
    user.password_reset_expires_at = new Date(Date.now() + 60 * 60 * 1000);
    await user.save();

    // Construct reset link
    const appBaseUrl = (process.env.APP_BASE_URL || process.env.CLIENT_ORIGIN || 'https://havilah.dic20016.workers.dev').replace(/\/$/, '');
    const resetUrl = `${appBaseUrl}/reset-password.html?token=${rawResetToken}&email=${encodeURIComponent(normalised)}`;

    // Dispatch email asynchronously
    const { sendMail } = require('../utils/emailService');
    const html = `
      <div style="background-color: #0f172a; padding: 32px 12px; font-family: sans-serif;">
        <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; color: #1e293b; border-radius: 12px; overflow: hidden; padding: 28px 32px;">
          <h2 style="color: #0f172a; margin-top: 0;">Password Reset Request</h2>
          <p style="font-size: 14px; line-height: 1.6; color: #475569;">
            We received a request to reset your password for your Havilah account. Click the button below to choose a new password. This link is valid for 60 minutes.
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="background: #00B7C3; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 700; font-size: 14px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
            If you did not request this, please disregard this email. Your password will remain unchanged.
          </p>
        </div>
      </div>
    `;

    try {
      await sendMail({
        to: normalised,
        subject: 'Havilah - Password Reset Request',
        html
      });
    } catch (e) {
      console.warn('[auth] Could not dispatch password reset email:', e.message);
    }

    return res.json({
      success: true,
      message: 'If an active account exists for that email, a password reset link has been dispatched.',
      ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawResetToken } : {})
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-password - Rate limited (max 5 attempts per window)
router.post('/reset-password', sensitiveRateLimiter(5), async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'MISSING_FIELDS', message: 'Reset token and new password are required.' });
    }

    const tokenHash = hashField(String(token).trim());
    let user = await User.findOne({
      password_reset_token_hash: tokenHash,
      password_reset_expires_at: { $gt: new Date() }
    });
    if (!user) {
      user = await findFallbackClinicAccount({
        password_reset_token_hash: tokenHash,
        password_reset_expires_at: { $gt: new Date() }
      });
    }

    if (!user || user.status === 'deactivated' || user.active === false) {
      return res.status(400).json({
        success: false,
        error: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'The password reset token is invalid or has expired. Please request a new one.'
      });
    }

    const strengthCheck = validatePasswordStrength(newPassword);
    if (!strengthCheck.valid) {
      return res.status(400).json({
        success: false,
        error: 'WEAK_PASSWORD',
        message: strengthCheck.error,
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.passwordHash = await bcrypt.hash(newPassword, salt);
    user.password_reset_token_hash = null;
    user.password_reset_expires_at = null;
    user.refresh_token_hash = null;
    user.refresh_token_expires_at = null;
    await user.save();

    return res.json({
      success: true,
      message: 'Your password has been reset successfully. You can now log in with your new credentials.'
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login/verify-2fa - Complete login with TOTP code or single-use recovery code
router.post('/login/verify-2fa', sensitiveRateLimiter(5), async (req, res, next) => {
  try {
    const { temp_token, code, recovery_code } = req.body;
    if (!temp_token || (!code && !recovery_code)) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_FIELDS',
        message: 'Challenge token and 6-digit authenticator code or recovery code are required.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(temp_token, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CHALLENGE',
        message: 'Two-factor session expired. Please sign in again.',
      });
    }

    if (!decoded || decoded.purpose !== '2fa_login' || decoded.entityType !== 'user') {
      return res.status(401).json({
        success: false,
        error: 'INVALID_CHALLENGE',
        message: 'Invalid two-factor challenge token.',
      });
    }

    const user = await User.findOne({ user_id: decoded.userId });
    if (!user || user.status === 'deactivated' || !user.totp_enabled || !user.totp_secret) {
      return res.status(401).json({
        success: false,
        error: 'ACCOUNT_UNAVAILABLE',
        message: 'Unable to complete two-factor authentication for this account.',
      });
    }

    const totpCandidate = (code || '').toString().trim();
    const backupCandidate = (recovery_code || totpCandidate).toString().trim();
    let authenticated = false;

    if (/^\d{6}$/.test(totpCandidate) && verifyTotpCode(totpCandidate, user.totp_secret)) {
      authenticated = true;
    } else if (backupCandidate) {
      const check = verifyAndConsumeRecoveryCode(backupCandidate, user.totp_recovery_codes_hashes || []);
      if (check.valid) {
        user.totp_recovery_codes_hashes = check.remainingHashes;
        authenticated = true;
      }
    }

    if (!authenticated) {
      return res.status(401).json({
        success: false,
        error: 'INVALID_2FA_CODE',
        message: 'Invalid authenticator or recovery code.',
      });
    }

    const isSuper = user.isSystemSuperAdmin === true || user.role === 'super_admin' || user.role === 'superadmin';
    const payload = {
      userId: user.user_id,
      companyId: user.company_id,
      departmentId: user.department_id,
      role: user.role,
      status: user.status,
      isSystemSuperAdmin: isSuper,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
    const refreshSecret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
    const refreshToken = jwt.sign({ userId: user.user_id }, refreshSecret, { expiresIn: '7d' });
    user.refresh_token_hash = hashField(refreshToken);
    user.refresh_token_expires_at = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    user.last_login_at = new Date();
    await user.save();

    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      path: '/',
    });

    return res.json({
      success: true,
      token,
      refreshToken,
      user: {
        user_id: user.user_id,
        role: user.role,
        full_name: user.full_name,
        totp_enabled: true,
      },
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/auth/2fa/status
router.get('/2fa/status', validateSession, async (req, res, next) => {
  try {
    const user = await User.findOne({ user_id: req.sessionData.user_id });
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    return res.json({
      success: true,
      enabled: Boolean(user.totp_enabled),
      recovery_codes_remaining: (user.totp_recovery_codes_hashes || []).length,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/2fa/setup
router.post('/2fa/setup', validateSession, async (req, res, next) => {
  try {
    const user = await User.findOne({ user_id: req.sessionData.user_id });
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });

    const secret = generateTotpSecret();
    user.totp_pending_secret = secret;
    await user.save();

    let accountLabel = user.full_name || user.user_id;
    try {
      if (user.email_encrypted && user.email_encrypted.encrypted) {
        accountLabel = decryptField(user.email_encrypted);
      }
    } catch (_) {}

    const otpauthUrl = getOtpAuthUrl({
      issuer: 'Havilah',
      accountName: accountLabel,
      secret,
    });

    return res.json({
      success: true,
      secret,
      otpauth_url: otpauthUrl,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/2fa/enable
router.post('/2fa/enable', validateSession, async (req, res, next) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({ user_id: req.sessionData.user_id });
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });
    if (!user.totp_pending_secret) {
      return res.status(400).json({ success: false, error: 'NO_PENDING_SETUP', message: 'Run 2FA setup first.' });
    }
    if (!verifyTotpCode(String(code || ''), user.totp_pending_secret)) {
      return res.status(400).json({ success: false, error: 'INVALID_CODE', message: 'Invalid 6-digit verification code.' });
    }

    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    user.totp_secret = user.totp_pending_secret;
    user.totp_pending_secret = null;
    user.totp_enabled = true;
    user.totp_recovery_codes_hashes = hashedCodes;
    await user.save();

    return res.json({
      success: true,
      enabled: true,
      recovery_codes: plainCodes,
      message: 'Two-factor authentication enabled. Store your single-use recovery codes safely.',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/2fa/disable
router.post('/2fa/disable', validateSession, async (req, res, next) => {
  try {
    const { code, password } = req.body;
    const user = await User.findOne({ user_id: req.sessionData.user_id });
    if (!user) return res.status(404).json({ success: false, error: 'USER_NOT_FOUND' });

    let verified = false;
    if (password && user.passwordHash && await bcrypt.compare(String(password), user.passwordHash)) {
      verified = true;
    } else if (code && user.totp_secret && verifyTotpCode(String(code), user.totp_secret)) {
      verified = true;
    }
    if (!verified) {
      return res.status(401).json({ success: false, error: 'VERIFICATION_FAILED', message: 'Provide valid password or 6-digit authenticator code to disable 2FA.' });
    }

    user.totp_enabled = false;
    user.totp_secret = null;
    user.totp_pending_secret = null;
    user.totp_recovery_codes_hashes = [];
    await user.save();

    return res.json({ success: true, enabled: false });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/2fa/regenerate-recovery-codes
router.post('/2fa/regenerate-recovery-codes', validateSession, async (req, res, next) => {
  try {
    const { code } = req.body;
    const user = await User.findOne({ user_id: req.sessionData.user_id });
    if (!user || !user.totp_enabled || !user.totp_secret) {
      return res.status(400).json({ success: false, error: '2FA_NOT_ENABLED' });
    }
    if (!verifyTotpCode(String(code || ''), user.totp_secret)) {
      return res.status(401).json({ success: false, error: 'INVALID_CODE', message: 'Valid 6-digit authenticator code required.' });
    }

    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    user.totp_recovery_codes_hashes = hashedCodes;
    await user.save();

    return res.json({ success: true, recovery_codes: plainCodes });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
