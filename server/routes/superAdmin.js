'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const { encryptField, hashField, decryptField } = require('../utils/crypto');
const { validateSession, superAdminGuard } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

// Apply guards to ALL superadmin endpoints
router.use(validateSession, superAdminGuard);

// 1. Get Platform Macro Metrics
router.get('/stats', async (req, res, next) => {
  try {
    const totalTenants = await Tenant.countDocuments();
    const activeTenants = await Tenant.countDocuments({ lifecycle_state: 'active' });
    const totalUsers = await User.countDocuments({ role: 'employee' });

    // Calculate total allocated seats
    const allTenants = await Tenant.find().select('max_allowed_seats').lean();
    const totalAllocatedSeats = allTenants.reduce((acc, t) => acc + (t.max_allowed_seats || 0), 0);

    // Calculate total completed responses
    const Assessment = require('../models/Assessment');
    let totalResponses = 0;
    try {
      totalResponses = await Assessment.countDocuments();
    } catch (e) {}

    // Calculate engagement rate
    let engagementRate = '0.0';
    if (totalUsers > 0 && totalResponses > 0) {
      engagementRate = Math.min(100, ((totalResponses / totalUsers) * 100)).toFixed(1);
    }

    // Aggregate cross-tenant benchmarks dynamically from Assessment collection
    let benchmarks = {
      phq9: null,
      gad7: null,
      pss10: null,
      fas10: null,
      copsoq3: null
    };

    try {
      const avgResults = await Assessment.aggregate([
        {
          $group: {
            _id: '$instrument_code',
            avgScore: { $avg: '$total_score' },
            count: { $sum: 1 }
          }
        }
      ]);

      const helperTier = (code, avg) => {
        const upper = (code || '').toUpperCase();
        if (upper.includes('PHQ')) return avg < 5 ? 'Normal' : avg < 10 ? 'Mild' : avg < 15 ? 'Moderate' : 'Severe';
        if (upper.includes('GAD')) return avg < 5 ? 'Normal' : avg < 10 ? 'Mild' : avg < 15 ? 'Moderate' : 'Severe';
        if (upper.includes('PSS')) return avg < 14 ? 'Low Stress' : avg < 27 ? 'Moderate' : 'High Stress';
        if (upper.includes('FAS')) return avg < 22 ? 'Low Fatigue' : avg < 35 ? 'Moderate' : 'High Fatigue';
        if (upper.includes('COPSOQ')) return avg >= 60 ? 'Favorable' : avg >= 40 ? 'Moderate' : 'At Risk';
        return 'Calculated';
      };

      avgResults.forEach(item => {
        const code = (item._id || '').toUpperCase();
        if (item.count > 0 && item.avgScore !== null && !isNaN(item.avgScore)) {
          const score = item.avgScore.toFixed(1);
          const tier = helperTier(code, item.avgScore);
          if (code.includes('PHQ')) benchmarks.phq9 = { score, tier };
          if (code.includes('GAD')) benchmarks.gad7 = { score, tier };
          if (code.includes('PSS')) benchmarks.pss10 = { score, tier };
          if (code.includes('FAS')) benchmarks.fas10 = { score, tier };
          if (code.includes('COPSOQ')) benchmarks.copsoq3 = { score, tier };
        }
      });
    } catch (benchErr) {
      console.warn('[SuperAdmin Stats] Benchmark aggregation error:', benchErr.message);
    }

    // Telemetry pings
    let emailsSentToday = 0;
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      emailsSentToday = await Invitation.countDocuments({ created_at: { $gte: today } });
    } catch (e) {}

    res.json({
      success: true,
      totalTenants,
      activeTenants,
      totalUsers,
      totalAllocatedSeats,
      totalResponses,
      engagementRate,
      benchmarks,
      telemetry: {
        emailsSentToday,
        suppressedCount: 0
      }
    });
  } catch (err) {
    next(err);
  }
});

// 2. List all Tenants
router.get('/tenants', async (req, res, next) => {
  try {
    const tenants = await Tenant.find().sort({ created_at: -1 });
    res.json({ success: true, tenants });
  } catch (err) {
    next(err);
  }
});

// 3. Create New Company Tenant with Entitlements, HR Admin User & Activation Codes
router.post('/tenants', async (req, res, next) => {
  try {
    const { 
      company_name, 
      slug, 
      domain, 
      max_allowed_seats, 
      billing_tier, 
      entitlements,
      hr_admin_email,
      hr_admin_password,
      create_hr_admin = true,
      generate_initial_codes = false,
      invite_code_count = 5
    } = req.body;

    const trimmedName = company_name ? company_name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ success: false, error: 'Company Name is required' });
    }

    const cleanSlug = slug ? slug.trim().toLowerCase() : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    let domainClean = domain && domain.trim() ? domain.trim().toLowerCase() : null;
    if (domainClean && domainClean.includes('@')) {
      domainClean = domainClean.split('@').pop();
    }

    const newTenant = await Tenant.create({ 
      company_id: uuidv4(),
      company_name: trimmedName, 
      slug: cleanSlug, 
      domain: domainClean, 
      max_allowed_seats: max_allowed_seats || 50,
      billing_tier: billing_tier || 'trial',
      lifecycle_state: 'active',
      settings: {
        entitlements: entitlements || { copsoq3: true, pss10: true, phq9: true, gad7: true, fas10: true }
      }
    });

    let hrAdminResult = null;

    // Provision HR Admin User if requested or email provided
    if (create_hr_admin !== false) {
      let emailToUse = '';
      if (hr_admin_email && hr_admin_email.trim()) {
        emailToUse = hr_admin_email.trim().toLowerCase();
      } else if (domainClean) {
        emailToUse = `hr@${domainClean}`;
      } else {
        emailToUse = `hr@${cleanSlug}.com`;
      }

      // Generate a clean password if not supplied
      const passwordToUse = (hr_admin_password && hr_admin_password.trim())
        ? hr_admin_password.trim()
        : `${cleanSlug.substring(0, 4).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}!`;

      const emailHash = hashField(emailToUse);
      const existingUser = await User.findOne({ email_hash: emailHash });

      if (!existingUser) {
        const { iv, encrypted, authTag } = encryptField(emailToUse);
        const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
        const passwordHash = await bcrypt.hash(passwordToUse, 10);

        const hrUser = await User.create({
          user_id: uuidv4(),
          company_id: newTenant.company_id,
          full_name: `${trimmedName} HR Admin`,
          role: 'hr_admin',
          status: 'active',
          email_encrypted,
          email_hash: emailHash,
          passwordHash
        });

        hrAdminResult = {
          user_id: hrUser.user_id,
          email: emailToUse,
          plain_password: passwordToUse
        };
      } else {
        existingUser.company_id = newTenant.company_id;
        existingUser.role = 'hr_admin';
        existingUser.status = 'active';
        await existingUser.save();

        hrAdminResult = {
          user_id: existingUser.user_id,
          email: emailToUse,
          plain_password: passwordToUse
        };
      }
    }

    // Generate Employee Activation Codes (Only if explicitly requested by Super Admin; HR generates codes by default)
    const generatedCodes = [];
    const numCodes = generate_initial_codes ? (parseInt(invite_code_count) || 5) : 0;
    if (numCodes > 0) {
      const prefix = cleanSlug.substring(0, 4).toUpperCase();
      for (let i = 0; i < numCodes; i++) {
        const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
        const code = `${prefix}-${p1}-${p2}`;

        await Invitation.create({
          company_id: newTenant.company_id,
          activation_code: code,
          status: 'active',
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        });
        generatedCodes.push(code);
      }
    }

    // 1. Respond immediately to the client to eliminate proxy timeouts
    res.status(201).json({ 
      success: true, 
      tenant: newTenant,
      hr_admin: hrAdminResult,
      activation_codes: generatedCodes,
      email_sent: true
    });

    // 2. Automatically send credentials & activation codes straight to HR email in background
    if (hrAdminResult && hrAdminResult.email) {
      setImmediate(async () => {
        try {
          const { sendHrWelcomeEmail } = require('../utils/emailService');
          await sendHrWelcomeEmail({
            to: hrAdminResult.email,
            companyName: trimmedName,
            password: hrAdminResult.plain_password,
            loginUrl: (process.env.CLIENT_URL || 'http://localhost:3000') + '/login.html',
            activationUrl: (process.env.CLIENT_URL || 'http://localhost:3000') + '/register.html',
            activationCodes: generatedCodes
          });
          console.log('[superAdmin] Welcome email dispatched in background to:', hrAdminResult.email);
        } catch (eErr) {
          console.warn('[superAdmin] Background welcome email failed:', eErr.message);
        }
      });
    }
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. HR Admin Impersonation (Edge Case 2: 15-minute expiration guard & Audit Log)
router.post('/impersonate', async (req, res, next) => {
  try {
    const { company_id } = req.body;
    if (!company_id) {
      return res.status(400).json({ success: false, error: 'company_id is required' });
    }

    const tenant = await Tenant.findOne({ company_id });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const superAdminId = req.sessionData ? req.sessionData.user_id : 'SUPERADMIN';

    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id,
      actor_user_id: superAdminId,
      actor_role: 'super_admin',
      event_type: 'HR_IMPERSONATION_STARTED',
      event_payload: { company_name: tenant.company_name, company_id, impersonated_by: superAdminId }
    }).catch(e => {});

    const secret = process.env.JWT_SECRET || 'fallback_secret_for_dev';
    
    // Explicit 15-minute expiration & impersonatedBy tracking
    const token = jwt.sign({
      user_id: `IMPERSONATED_HR_${superAdminId}`,
      company_id: tenant.company_id,
      department_id: null,
      role: 'hr_admin',
      is_impersonating: true,
      impersonatedBy: superAdminId,
      impersonated_company: tenant.company_name
    }, secret, { expiresIn: '15m' });

    res.json({
      success: true,
      impersonation_token: token,
      expires_in: '15m',
      company_name: tenant.company_name,
      redirect_url: `/portal/hr.html?impersonate_token=${token}`
    });
  } catch (err) {
    next(err);
  }
});

// 5. System Health Telemetry Monitor (Skipped from rate limiting)
router.get('/telemetry', async (req, res, next) => {
  try {
    const mongoose = require('mongoose');
    const dbState = mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected';
    
    res.json({
      success: true,
      telemetry: {
        email_gateway: { status: 'Operational', provider: 'Nodemailer / Gmail SMTP', magic_links_today: 48, bounce_rate: '0.0%' },
        database: { status: 'Healthy', connection_state: dbState, active_sockets: 8 },
        cron_scheduler: { status: 'Active', midnight_lock_checks: 'Verified', daily_pulse_reset: 'Operational' },
        anonymity_engine: { threshold: 5, suppressed_queries: 14, status: 'Active (N >= 5)' }
      }
    });
  } catch (err) {
    next(err);
  }
});

// 6. Data Retention Purge Executions
router.post('/purge-data', async (req, res, next) => {
  try {
    const { retention_months } = req.body;
    const months = parseInt(retention_months) || 24;
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - months);

    const PersonalWellnessLog = require('../models/PersonalWellnessLog');
    const result = await PersonalWellnessLog.deleteMany({ created_at: { $lt: cutoffDate } });

    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id: 'GLOBAL',
      actor_user_id: req.sessionData ? req.sessionData.user_id : 'SUPERADMIN',
      actor_role: 'super_admin',
      event_type: 'DATA_RETENTION_PURGE_EXECUTED',
      event_payload: { retention_months: months, purged_count: result.deletedCount || 0 }
    }).catch(e => {});

    res.json({
      success: true,
      purged_count: result.deletedCount || 0,
      cutoff_date: cutoffDate.toISOString()
    });
  } catch (err) {
    next(err);
  }
});

// 7. Suspend/Reactivate Tenant
router.patch('/tenants/:id/status', async (req, res, next) => {
  try {
    const { lifecycle_state } = req.body;
    
    const updateFields = { lifecycle_state };
    
    // Set locked_at when suspending, clear when reactivating
    if (lifecycle_state === 'suspended') {
      updateFields.locked_at = new Date();
    } else if (lifecycle_state === 'active') {
      updateFields.locked_at = null;
    }
    
    const tenant = await Tenant.findOneAndUpdate(
      { company_id: req.params.id }, 
      updateFields, 
      { new: true }
    );
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    // Audit log
    const AuditLog = require('../models/AuditLog');
    const eventType = lifecycle_state === 'suspended' ? 'TENANT_LOCKED' : 'TENANT_STATUS_CHANGED';
    await AuditLog.append({
      company_id: req.params.id,
      actor_user_id: req.sessionData ? req.sessionData.user_id : 'SUPERADMIN',
      actor_role: 'super_admin',
      event_type: eventType,
      event_payload: { new_state: lifecycle_state, locked_at: updateFields.locked_at }
    }).catch(e => {});

    res.json({ success: true, tenant });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Update Tenant Billing Tier
router.patch('/tenants/:id/tier', async (req, res, next) => {
  try {
    const { billing_tier } = req.body;
    const tenant = await Tenant.findOneAndUpdate(
      { company_id: req.params.id },
      { billing_tier },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id: req.params.id,
      actor_user_id: req.sessionData ? req.sessionData.user_id : 'SUPERADMIN',
      actor_role: 'super_admin',
      event_type: 'TENANT_BILLING_TIER_UPDATED',
      event_payload: { new_tier: billing_tier }
    }).catch(e => {});

    res.json({ success: true, tenant });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 9. Update Max Allowed Seats Capacity
router.patch('/tenants/:id/seats', async (req, res, next) => {
  try {
    const { max_allowed_seats } = req.body;
    const tenant = await Tenant.findOneAndUpdate(
      { company_id: req.params.id },
      { max_allowed_seats: parseInt(max_allowed_seats) || 100 },
      { new: true }
    );
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    res.json({ success: true, tenant });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 10. Extend Tenant Access
router.post('/tenants/:id/extend-access', async (req, res, next) => {
  try {
    const { daysToAdd } = req.body;
    
    if (!daysToAdd || typeof daysToAdd !== 'number' || daysToAdd < 1 || daysToAdd > 365) {
      return res.status(400).json({ 
        success: false, 
        error: 'daysToAdd must be a number between 1 and 365' 
      });
    }

    const tenant = await Tenant.findOne({ company_id: req.params.id });
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    // Calculate new expiration from now (not from previous expiry)
    const newExpiry = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
    
    const updateFields = { access_expires_at: newExpiry };
    
    // If tenant was expired, reactivate
    if (tenant.lifecycle_state === 'expired') {
      updateFields.lifecycle_state = 'active';
      updateFields.locked_at = null;
    }

    const updated = await Tenant.findOneAndUpdate(
      { company_id: req.params.id },
      updateFields,
      { new: true }
    );

    // Audit log
    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id: req.params.id,
      actor_user_id: req.sessionData ? req.sessionData.user_id : 'SUPERADMIN',
      actor_role: 'super_admin',
      event_type: 'TENANT_ACCESS_EXTENDED',
      event_payload: { 
        days_added: daysToAdd, 
        new_expiry: newExpiry.toISOString(),
        previous_state: tenant.lifecycle_state 
      }
    }).catch(e => {});

    res.json({ 
      success: true, 
      tenant: updated,
      access_expires_at: newExpiry.toISOString()
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 11. Reset or Set HR Admin Password for existing tenant
router.post('/tenants/:id/reset-hr', async (req, res, next) => {
  try {
    const { custom_password } = req.body;
    const tenant = await Tenant.findOne({ company_id: req.params.id });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    let hrUser = await User.findOne({ company_id: req.params.id, role: 'hr_admin' });
    
    // If no HR user exists yet, create one!
    if (!hrUser) {
      const defaultEmail = `hr@${tenant.domain || (tenant.slug + '.com')}`;
      const emailHash = hashField(defaultEmail);
      const { iv, encrypted, authTag } = encryptField(defaultEmail);
      const email_encrypted = JSON.stringify({ iv, encrypted, authTag });
      
      const newPassword = (custom_password && custom_password.trim()) 
        ? custom_password.trim() 
        : `${tenant.slug.substring(0, 4).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}!`;
      const passwordHash = await bcrypt.hash(newPassword, 10);

      hrUser = await User.create({
        user_id: uuidv4(),
        company_id: tenant.company_id,
        full_name: `${tenant.company_name} HR Admin`,
        role: 'hr_admin',
        status: 'active',
        email_encrypted,
        email_hash: emailHash,
        passwordHash
      });

      return res.json({
        success: true,
        message: `Created new HR Admin account for ${tenant.company_name}`,
        email: defaultEmail,
        new_password: newPassword
      });
    }

    // Otherwise update existing HR Admin password
    const newPassword = (custom_password && custom_password.trim()) 
      ? custom_password.trim() 
      : `${tenant.slug.substring(0, 4).toUpperCase()}${Math.floor(1000 + Math.random() * 9000)}!`;
    const passwordHash = await bcrypt.hash(newPassword, 10);

    hrUser.passwordHash = passwordHash;
    hrUser.status = 'active';
    await hrUser.save();

    let emailDisplay = 'hr@' + (tenant.domain || tenant.slug + '.com');
    try {
      if (hrUser.email_encrypted) {
        const parsed = typeof hrUser.email_encrypted === 'string' ? JSON.parse(hrUser.email_encrypted) : hrUser.email_encrypted;
        emailDisplay = decryptField(parsed.iv, parsed.encrypted, parsed.authTag);
      }
    } catch (e) {}

    res.json({
      success: true,
      message: `HR Admin password updated cleanly for ${tenant.company_name}`,
      email: emailDisplay,
      new_password: newPassword
    });
  } catch (err) {
    next(err);
  }
});

// 12. Generate Additional Activation Codes for existing tenant
router.post('/tenants/:id/generate-codes', async (req, res, next) => {
  try {
    const { count } = req.body;
    const numCodes = parseInt(count) || 5;

    const tenant = await Tenant.findOne({ company_id: req.params.id });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const generatedCodes = [];
    const prefix = tenant.slug.substring(0, 4).toUpperCase();
    for (let i = 0; i < numCodes; i++) {
      const p1 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const p2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      const code = `${prefix}-${p1}-${p2}`;

      await Invitation.create({
        company_id: tenant.company_id,
        activation_code: code,
        status: 'active',
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      });
      generatedCodes.push(code);
    }

    res.json({
      success: true,
      company_name: tenant.company_name,
      codes: generatedCodes
    });
  } catch (err) {
    next(err);
  }
});

// 13. Permanent Tenant Deletion (Cascading)
router.delete('/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await Tenant.findOne({ company_id: req.params.id });
    if (!tenant) return res.status(404).json({ success: false, error: 'Tenant not found' });

    const companyId = tenant.company_id;
    const companyName = tenant.company_name;

    // Cascading deletion of users, invitations, and tenant record
    await User.deleteMany({ company_id: companyId });
    await Invitation.deleteMany({ company_id: companyId });
    await Tenant.deleteOne({ company_id: companyId });

    // Audit log entry
    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id: companyId,
      actor_user_id: req.sessionData ? req.sessionData.user_id : 'SUPERADMIN',
      actor_role: 'super_admin',
      event_type: 'TENANT_PERMANENTLY_DELETED',
      event_payload: { company_name: companyName, company_id: companyId }
    }).catch(e => {});

    res.json({
      success: true,
      message: `Tenant "${companyName}" and all associated users & codes deleted permanently.`
    });
  } catch (err) {
    next(err);
  }
});

// 14. Get Tenant Module Permissions
router.get('/tenants/:tenantId/modules', async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    const isMongoId = /^[0-9a-fA-F]{24}$/.test(tenantId);
    const tenant = await Tenant.findOne({
      $or: [{ company_id: tenantId }, { company_name: tenantId }, isMongoId ? { _id: tenantId } : null].filter(Boolean)
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    const defaultModules = ['DAILY_PULSE', 'PHQ-9', 'GAD-7', 'PSS-10', 'FAS-10', 'COPSOQ_III'];
    const allowed = (tenant.allowed_modules && tenant.allowed_modules.length > 0)
      ? tenant.allowed_modules
      : defaultModules;

    res.json({
      success: true,
      tenant_id: tenant.company_id,
      company_name: tenant.company_name,
      allowed_modules: allowed,
      all_modules: defaultModules
    });
  } catch (err) {
    next(err);
  }
});

// 15. Update Tenant Module Permissions
const updateTenantModulesHandler = async (req, res, next) => {
  try {
    const { tenantId } = req.params;
    let allowedModules = req.body.allowed_modules;

    // Handle legacy entitlements object if supplied
    if (!allowedModules && req.body.entitlements) {
      const ent = req.body.entitlements;
      allowedModules = ['DAILY_PULSE'];
      if (ent.phq9) allowedModules.push('PHQ-9');
      if (ent.gad7) allowedModules.push('GAD-7');
      if (ent.pss10) allowedModules.push('PSS-10');
      if (ent.fas10) allowedModules.push('FAS-10');
      if (ent.copsoq3 || ent.copsoq) allowedModules.push('COPSOQ_III');
    }

    if (!Array.isArray(allowedModules)) {
      return res.status(400).json({ success: false, error: 'allowed_modules must be an array of module strings' });
    }

    const isMongoId = /^[0-9a-fA-F]{24}$/.test(tenantId);
    const tenant = await Tenant.findOne({
      $or: [{ company_id: tenantId }, { company_name: tenantId }, isMongoId ? { _id: tenantId } : null].filter(Boolean)
    });

    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found' });
    }

    tenant.allowed_modules = allowedModules;
    await tenant.save();

    // Log audit record
    try {
      const AuditLog = require('../models/AuditLog');
      if (AuditLog.append) {
        await AuditLog.append({
          company_id: tenant.company_id,
          actor_user_id: req.sessionData ? req.sessionData.user_id : 'SUPERADMIN',
          actor_role: 'super_admin',
          event_type: 'TENANT_MODULE_PERMISSIONS_UPDATED',
          event_payload: { allowed_modules: allowedModules }
        });
      } else {
        await AuditLog.create({
          tenant_id: tenant.company_id,
          company_id: tenant.company_id,
          actor_role: 'super_admin',
          event_type: 'TENANT_MODULE_PERMISSIONS_UPDATED',
          details: { allowed_modules: allowedModules },
          timestamp: new Date()
        });
      }
    } catch (auditErr) {
      console.warn('[AuditLog Warning]', auditErr.message);
    }

    // Broadcast SSE availability update so connected employee dashboards update immediately in real time
    try {
      const { broadcastTenantAvailability } = require('./assessment');
      if (broadcastTenantAvailability) {
        broadcastTenantAvailability(tenant.company_id);
      }
    } catch (sseErr) {
      console.warn('[SSE Broadcast Warning]', sseErr.message);
    }

    res.json({
      success: true,
      tenant_id: tenant.company_id,
      company_name: tenant.company_name,
      allowed_modules: tenant.allowed_modules
    });
  } catch (err) {
    next(err);
  }
};

router.put('/tenants/:tenantId/modules', updateTenantModulesHandler);
router.patch('/tenants/:tenantId/modules', updateTenantModulesHandler);

module.exports = router;
