'use strict';

const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Invitation = require('../models/Invitation');
const Assessor = require('../models/Assessor');
const AuditLog = require('../models/AuditLog');
const { encryptField, hashField } = require('../utils/crypto');

/**
 * SuperAdmin Controller for Tenant Management, Subscription Overrides & Assessor Routing.
 */

// PATCH /api/v1/superadmin/tenants/:id/subscription
async function updateTenantSubscription(req, res, next) {
  try {
    const { id } = req.params;
    const { tier, status, extendDays, trialEndsAt, maxEmployees, max_allowed_seats, currentPeriodEnd } = req.body;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { company_id: id }] }
      : { company_id: id };

    const tenant = await Tenant.findOne(query);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found.' });
    }

    if (!tenant.subscription) {
      tenant.subscription = {
        tier: 'pro',
        status: 'trialing',
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        maxEmployees: 100,
      };
    }

    if (tier && ['free', 'starter', 'pro', 'enterprise'].includes(tier.toLowerCase())) {
      tenant.subscription.tier = tier.toLowerCase();
      // Sync legacy billing_tier field
      tenant.billing_tier = tier.toLowerCase() === 'free' ? 'trial' : tier.toLowerCase() === 'pro' ? 'professional' : tier.toLowerCase();
    }

    if (status && ['trialing', 'active', 'past_due', 'canceled'].includes(status.toLowerCase())) {
      tenant.subscription.status = status.toLowerCase();
      if (status === 'canceled') {
        tenant.lifecycle_state = 'suspended';
      } else if (status === 'active' || status === 'trialing') {
        tenant.lifecycle_state = 'active';
        tenant.locked_at = null;
      }
    }

    if (extendDays && typeof extendDays === 'number' && extendDays > 0) {
      const currentExpiry = tenant.subscription.trialEndsAt ? new Date(tenant.subscription.trialEndsAt) : new Date();
      const baseDate = currentExpiry > new Date() ? currentExpiry : new Date();
      tenant.subscription.trialEndsAt = new Date(baseDate.getTime() + extendDays * 24 * 60 * 60 * 1000);
      tenant.access_expires_at = tenant.subscription.trialEndsAt;
      tenant.subscription.status = 'trialing';
      tenant.lifecycle_state = 'active';
      tenant.locked_at = null;
    } else if (trialEndsAt) {
      tenant.subscription.trialEndsAt = new Date(trialEndsAt);
      tenant.access_expires_at = new Date(trialEndsAt);
    }

    if (maxEmployees !== undefined && Number.isInteger(Number(maxEmployees))) {
      tenant.subscription.maxEmployees = Number(maxEmployees);
      tenant.max_allowed_seats = Number(maxEmployees);
    } else if (max_allowed_seats !== undefined && Number.isInteger(Number(max_allowed_seats))) {
      tenant.subscription.maxEmployees = Number(max_allowed_seats);
      tenant.max_allowed_seats = Number(max_allowed_seats);
    }

    if (currentPeriodEnd) {
      tenant.subscription.currentPeriodEnd = new Date(currentPeriodEnd);
    }

    await tenant.save();

    // Append audit log
    try {
      const superAdminId = req.sessionData ? req.sessionData.user_id : 'SUPERADMIN';
      await AuditLog.append({
        company_id: tenant.company_id,
        actor_user_id: superAdminId,
        actor_role: 'super_admin',
        event_type: 'TENANT_SUBSCRIPTION_OVERRIDE',
        event_payload: {
          tier: tenant.subscription.tier,
          status: tenant.subscription.status,
          trialEndsAt: tenant.subscription.trialEndsAt,
          maxEmployees: tenant.subscription.maxEmployees,
          effectiveTier: tenant.getEffectiveTier(),
        },
      });
    } catch (auditErr) {
      console.warn('[AuditLog Warning]', auditErr.message);
    }

    return res.json({
      success: true,
      message: 'Tenant subscription updated successfully.',
      tenant,
      effectiveTier: tenant.getEffectiveTier(),
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/v1/superadmin/tenants/:id/assessor
async function updateTenantAssessor(req, res, next) {
  try {
    const { id } = req.params;
    const { assessorId, activeAssessorId } = req.body;
    const targetAssessorId = assessorId !== undefined ? assessorId : activeAssessorId;

    const query = mongoose.Types.ObjectId.isValid(id)
      ? { $or: [{ _id: id }, { company_id: id }] }
      : { company_id: id };

    const tenant = await Tenant.findOne(query);
    if (!tenant) {
      return res.status(404).json({ success: false, error: 'Tenant not found.' });
    }

    let assessorDoc = null;
    if (targetAssessorId) {
      if (!mongoose.Types.ObjectId.isValid(targetAssessorId)) {
        return res.status(400).json({ success: false, error: 'Invalid assessor ID format.' });
      }
      assessorDoc = await Assessor.findById(targetAssessorId);
      if (!assessorDoc) {
        return res.status(404).json({ success: false, error: 'Assessor not found.' });
      }
      tenant.activeAssessorId = assessorDoc._id;
    } else {
      tenant.activeAssessorId = null;
    }

    await tenant.save();

    // Append audit log
    try {
      const superAdminId = req.sessionData ? req.sessionData.user_id : 'SUPERADMIN';
      await AuditLog.append({
        company_id: tenant.company_id,
        actor_user_id: superAdminId,
        actor_role: 'super_admin',
        event_type: 'TENANT_ASSESSOR_REASSIGNED',
        event_payload: {
          activeAssessorId: tenant.activeAssessorId,
          assessorName: assessorDoc ? assessorDoc.name : 'None',
        },
      });
    } catch (auditErr) {
      console.warn('[AuditLog Warning]', auditErr.message);
    }

    return res.json({
      success: true,
      message: 'Active assessor updated successfully for tenant.',
      tenant,
      activeAssessor: assessorDoc ? { id: assessorDoc._id, name: assessorDoc.name, email: assessorDoc.email } : null,
    });
  } catch (err) {
    next(err);
  }
}

// POST /api/v1/superadmin/tenants/manual-provision
async function manualProvisionTenant(req, res, next) {
  try {
    const {
      company_name,
      companyName,
      slug,
      domain,
      max_allowed_seats,
      maxEmployees,
      billing_tier,
      tier,
      entitlements,
      hr_admin_email,
      hr_admin_password,
      create_hr_admin = true,
      generate_initial_codes = false,
      invite_code_count = 5,
      activeAssessorId,
    } = req.body;

    const trimmedName = (company_name || companyName || '').trim();
    if (!trimmedName) {
      return res.status(400).json({ success: false, error: 'Company Name is required' });
    }

    const cleanSlug = slug
      ? slug.trim().toLowerCase()
      : trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    let domainClean = domain && domain.trim() ? domain.trim().toLowerCase() : null;
    if (domainClean && domainClean.includes('@')) {
      domainClean = domainClean.split('@').pop();
    }

    const seatLimit = parseInt(maxEmployees || max_allowed_seats) || 50;
    const subscriptionTier = (tier || billing_tier || 'pro').toLowerCase();

    const newTenant = await Tenant.create({
      company_id: uuidv4(),
      company_name: trimmedName,
      slug: cleanSlug,
      domain: domainClean,
      max_allowed_seats: seatLimit,
      billing_tier: subscriptionTier === 'pro' ? 'professional' : subscriptionTier === 'free' ? 'trial' : subscriptionTier,
      subscription: {
        tier: subscriptionTier === 'professional' ? 'pro' : subscriptionTier,
        status: 'active',
        maxEmployees: seatLimit,
        trialEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      lifecycle_state: 'active',
      activeAssessorId: activeAssessorId && mongoose.Types.ObjectId.isValid(activeAssessorId) ? activeAssessorId : null,
      settings: {
        entitlements: entitlements || { copsoq3: true, pss10: true, phq9: true, gad7: true, fas10: true },
      },
    });

    let hrAdminResult = null;

    // Provision HR Admin User if requested
    if (create_hr_admin !== false) {
      let emailToUse = '';
      if (hr_admin_email && hr_admin_email.trim()) {
        emailToUse = hr_admin_email.trim().toLowerCase();
      } else if (domainClean) {
        emailToUse = `hr@${domainClean}`;
      } else {
        emailToUse = `hr@${cleanSlug}.com`;
      }

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
          passwordHash,
        });

        hrAdminResult = {
          user_id: hrUser.user_id,
          email: emailToUse,
          plain_password: passwordToUse,
        };
      } else {
        existingUser.company_id = newTenant.company_id;
        existingUser.role = 'hr_admin';
        existingUser.status = 'active';
        await existingUser.save();

        hrAdminResult = {
          user_id: existingUser.user_id,
          email: emailToUse,
          plain_password: passwordToUse,
        };
      }
    }

    // Generate Initial Employee Activation Codes
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
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        });
        generatedCodes.push(code);
      }
    }

    // Dispatch background email
    const clientBaseUrl = (() => {
      if (process.env.CLIENT_URL && !process.env.CLIENT_URL.includes('localhost')) {
        return process.env.CLIENT_URL.replace(/\/+$/, '');
      }
      if (process.env.FRONTEND_URL && !process.env.FRONTEND_URL.includes('localhost')) {
        return process.env.FRONTEND_URL.replace(/\/+$/, '');
      }
      const origin = req.get('origin') || req.get('referer');
      if (origin && !origin.includes('localhost')) {
        try { return new URL(origin).origin; } catch (e) {}
      }
      return 'https://havilahss.netlify.app';
    })();

    if (hrAdminResult && hrAdminResult.email) {
      setImmediate(async () => {
        try {
          const { sendHrWelcomeEmail } = require('../utils/emailService');
          await sendHrWelcomeEmail({
            to: hrAdminResult.email,
            companyName: trimmedName,
            password: hrAdminResult.plain_password,
            loginUrl: `${clientBaseUrl}/login.html`,
            activationUrl: `${clientBaseUrl}/register.html`,
            activationCodes: generatedCodes,
          });
        } catch (eErr) {
          console.warn('[superAdminController] Welcome email failed:', eErr.message);
        }
      });
    }

    return res.status(201).json({
      success: true,
      tenant: newTenant,
      hr_admin: hrAdminResult,
      activation_codes: generatedCodes,
      email_sent: true,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  updateTenantSubscription,
  updateTenantAssessor,
  manualProvisionTenant,
};
