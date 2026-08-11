'use strict';

const express = require('express');
const { requireTenantAdmin } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { encryptEmail, hashIdentifier, computeAuditHash } = require('../utils/crypto');
const crypto = require('crypto');

const router = express.Router();

/**
 * Validates array of objects ensuring required fields.
 */
function validateImportData(employees) {
  if (!Array.isArray(employees)) return false;
  return employees.every(e => 
    e.email && typeof e.email === 'string' &&
    e.full_name && typeof e.full_name === 'string' &&
    e.department_path && typeof e.department_path === 'string' &&
    e.role && ['employee', 'hr_admin', 'tenant_admin'].includes(e.role)
  );
}

/**
 * Creates department tree from dot notation.
 */
async function ensureDepartmentsExist(companyId, pathStr) {
  const parts = pathStr.split('.');
  let parentId = null;
  let currentPath = '';

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    currentPath = i === 0 ? part : `${currentPath}.${part}`;
    
    let dept = await Department.findOne({ company_id: companyId, materialized_path: currentPath });
    if (!dept) {
      dept = new Department({
        company_id: companyId,
        parent_department_id: parentId,
        name: part,
        canonical_name: currentPath,
        materialized_path: currentPath,
        depth: i
      });
      await dept.save();
    }
    parentId = dept.department_id;
  }
  return parentId;
}

/**
 * POST /api/v1/onboarding/bulk-import
 * HR/Tenant Admin imports a list of employees, generating departments and pending users.
 */
router.post('/bulk-import', requireTenantAdmin, async (req, res, next) => {
  try {
    const { employees } = req.body;
    const companyId = req.sessionData.company_id;

    if (!validateImportData(employees)) {
      return res.status(400).json({ success: false, error: 'INVALID_DATA_FORMAT' });
    }

    const tenant = await Tenant.findOne({ company_id: companyId });
    if (!tenant) return res.status(404).json({ success: false, error: 'TENANT_NOT_FOUND' });

    // Validate seat capacity
    const availableSeats = tenant.max_allowed_seats - tenant.used_seats;
    if (employees.length > availableSeats) {
      return res.status(400).json({
        success: false,
        error: 'SEAT_LIMIT_EXCEEDED',
        available: availableSeats,
        requested: employees.length
      });
    }

    const createdIds = [];
    const skippedEmails = [];
    const errors = [];

    // Cache department paths to IDs
    const deptCache = new Map();

    for (const emp of employees) {
      try {
        const emailHash = hashIdentifier(emp.email);
        
        // Check for duplicates
        const existingUser = await User.findOne({ company_id: companyId, email_hash: emailHash });
        if (existingUser) {
          skippedEmails.push(emp.email);
          continue;
        }

        // Resolve Department
        let deptId = deptCache.get(emp.department_path);
        if (!deptId) {
          deptId = await ensureDepartmentsExist(companyId, emp.department_path);
          deptCache.set(emp.department_path, deptId);
        }

        const consentToken = crypto.randomUUID();
        const consentExpires = new Date();
        consentExpires.setHours(consentExpires.getHours() + 72);

        const newUser = new User({
          company_id: companyId,
          department_id: deptId,
          email_hash: emailHash,
          email_encrypted: encryptEmail(emp.email),
          full_name: emp.full_name,
          role: emp.role,
          status: 'pending_consent',
          consent_token: consentToken,
          consent_token_expires_at: consentExpires
        });
        
        await newUser.save();
        createdIds.push(newUser.user_id);
        
      } catch (err) {
        errors.push({ email: emp.email, reason: err.message });
      }
    }

    // Note: Used seats are NOT incremented until the user actually accepts consent.
    res.status(200).json({
      success: true,
      created: createdIds,
      skipped_duplicates: skippedEmails,
      errors: errors,
      seats_remaining: availableSeats
    });

  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/accept-consent
 * Public endpoint. User provides token to accept terms, becoming active and consuming a seat.
 */
router.post('/accept-consent', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'MISSING_TOKEN' });

    const user = await User.findOne({
      consent_token: token,
      consent_token_expires_at: { $gt: new Date() },
      status: 'pending_consent'
    });

    if (!user) {
      return res.status(400).json({ success: false, error: 'INVALID_OR_EXPIRED_TOKEN' });
    }

    // Increment tenant seat usage atomically
    const tenant = await Tenant.findOneAndUpdate(
      { company_id: user.company_id, used_seats: { $lt: '$max_allowed_seats' } },
      { $inc: { used_seats: 1 } },
      { new: true }
    );

    if (!tenant) {
      return res.status(400).json({ success: false, error: 'NO_AVAILABLE_SEATS' });
    }

    // Update user
    user.status = 'active';
    user.consent_accepted_at = new Date();
    user.consent_token = undefined;
    user.consent_token_expires_at = undefined;
    await user.save();

    // Audit Log
    const lastAudit = await AuditLog.findOne({ company_id: user.company_id }).sort({ created_at: -1 });
    const prevHash = lastAudit ? lastAudit.sha256_hash : 'GENESIS';
    const payload = { event: 'consent_accepted', user_id: user.user_id, role: user.role };
    const newHash = computeAuditHash(prevHash, payload);

    await AuditLog.create({
      company_id: user.company_id,
      actor_user_id: user.user_id,
      actor_role: user.role,
      event_type: 'consent_accepted',
      event_payload: payload,
      previous_hash: prevHash,
      sha256_hash: newHash
    });

    res.status(200).json({ success: true, message: 'Consent accepted. You may now log in.' });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/onboarding/reject-consent
 * Public endpoint. User rejects terms. Status becomes deactivated. Does not consume a seat.
 */
router.post('/reject-consent', async (req, res, next) => {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ success: false, error: 'MISSING_TOKEN' });

    const user = await User.findOne({ consent_token: token });
    if (!user) {
      return res.status(400).json({ success: false, error: 'INVALID_TOKEN' });
    }

    user.status = 'deactivated';
    user.consent_token = undefined;
    user.consent_token_expires_at = undefined;
    await user.save();

    // Audit Log
    const lastAudit = await AuditLog.findOne({ company_id: user.company_id }).sort({ created_at: -1 });
    const prevHash = lastAudit ? lastAudit.sha256_hash : 'GENESIS';
    const payload = { event: 'consent_rejected', user_id: user.user_id };
    const newHash = computeAuditHash(prevHash, payload);

    await AuditLog.create({
      company_id: user.company_id,
      actor_user_id: user.user_id,
      actor_role: user.role,
      event_type: 'consent_rejected',
      event_payload: payload,
      previous_hash: prevHash,
      sha256_hash: newHash
    });

    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
