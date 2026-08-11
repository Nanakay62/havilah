'use strict';

const express = require('express');
const { requireSuperAdmin } = require('../middleware/auth');
const Tenant = require('../models/Tenant');
const AnonHazardLog = require('../models/AnonHazardLog');
const AuditLog = require('../models/AuditLog');
const crypto = require('crypto');
const { computeAuditHash } = require('../utils/crypto');

const router = express.Router();

// All routes in this controller require Super Admin privileges
router.use(requireSuperAdmin);

/**
 * GET /api/v1/admin/tenants
 * List all tenants on the platform.
 */
router.get('/tenants', async (req, res, next) => {
  try {
    const tenants = await Tenant.find({})
      .select('company_id company_name slug billing_tier max_allowed_seats used_seats lifecycle_state created_at')
      .sort({ created_at: -1 });
    
    res.status(200).json({ success: true, tenants });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/tenants
 * Create a new tenant.
 */
router.post('/tenants', async (req, res, next) => {
  try {
    const { company_name, slug, billing_tier, max_allowed_seats, sso_config, settings } = req.body;
    
    const companyId = crypto.randomUUID();

    const newTenant = new Tenant({
      company_id: companyId,
      company_name,
      slug,
      billing_tier,
      max_allowed_seats,
      used_seats: 0,
      lifecycle_state: 'pending_setup',
      sso_config: sso_config || { enabled: false },
      settings: settings || {}
    });

    await newTenant.save();
    
    res.status(201).json({ success: true, tenant: newTenant });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, error: 'SLUG_ALREADY_EXISTS' });
    }
    next(err);
  }
});

/**
 * PATCH /api/v1/admin/tenants/:company_id
 * Update tenant configuration. Logs significant changes to audit trail.
 */
router.patch('/tenants/:company_id', async (req, res, next) => {
  try {
    const { company_id } = req.params;
    const updates = req.body;
    
    const tenant = await Tenant.findOne({ company_id });
    if (!tenant) return res.status(404).json({ success: false, error: 'TENANT_NOT_FOUND' });

    const allowedUpdates = ['company_name', 'billing_tier', 'max_allowed_seats', 'lifecycle_state', 'sso_config', 'settings'];
    let stateChanged = false;
    let limitChanged = false;

    allowedUpdates.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'lifecycle_state' && tenant[field] !== updates[field]) stateChanged = true;
        if (field === 'max_allowed_seats' && tenant[field] !== updates[field]) limitChanged = true;
        tenant[field] = updates[field];
      }
    });

    await tenant.save();

    // Audit logs for critical changes
    if (stateChanged || limitChanged) {
      const lastAudit = await AuditLog.findOne({ company_id }).sort({ created_at: -1 });
      const prevHash = lastAudit ? lastAudit.sha256_hash : 'GENESIS';
      
      const payload = {
        event: stateChanged ? 'tenant_state_changed' : 'seat_limit_changed',
        details: updates
      };
      
      const newHash = computeAuditHash(prevHash, payload);
      
      await AuditLog.create({
        company_id,
        actor_user_id: 'SUPER_ADMIN',
        actor_role: 'super_admin',
        event_type: stateChanged ? 'tenant_state_changed' : 'seat_limit_changed',
        event_payload: payload,
        previous_hash: prevHash,
        sha256_hash: newHash
      });
    }

    res.status(200).json({ success: true, tenant });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/analytics
 * Platform-wide aggregated analytics.
 */
router.get('/analytics', async (req, res, next) => {
  try {
    const tenants = await Tenant.find({});
    
    let total_tenants = tenants.length;
    let total_seats_used = 0;
    let total_seats_available = 0;
    const engagement_by_tier = {};

    tenants.forEach(t => {
      total_seats_used += t.used_seats;
      total_seats_available += t.max_allowed_seats;
      engagement_by_tier[t.billing_tier] = (engagement_by_tier[t.billing_tier] || 0) + 1;
    });

    const total_responses = await AnonHazardLog.countDocuments({});

    res.status(200).json({
      success: true,
      total_tenants,
      total_seats_used,
      total_seats_available,
      total_responses,
      engagement_by_tier,
      computed_at: new Date()
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/admin/audit-trail/:company_id
 * Paginated query of the immutable audit trail.
 */
router.get('/audit-trail/:company_id', async (req, res, next) => {
  try {
    const { company_id } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { event_type } = req.query;

    const query = { company_id };
    if (event_type) query.event_type = event_type;

    const skip = (page - 1) * limit;

    const entries = await AuditLog.find(query)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(query);

    res.status(200).json({
      success: true,
      entries,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/v1/admin/audit-trail/:company_id/verify
 * Cryptographically verifies the entire hash chain for a tenant.
 */
router.post('/audit-trail/:company_id/verify', async (req, res, next) => {
  try {
    const { company_id } = req.params;
    
    // Must load in chronological order to walk the chain
    const entries = await AuditLog.find({ company_id }).sort({ created_at: 1 });
    
    let valid = true;
    let first_invalid_at = null;
    let expectedHash = 'GENESIS';

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      
      // Verify link to previous
      if (entry.previous_hash !== expectedHash) {
        valid = false;
        first_invalid_at = i;
        break;
      }
      
      // Verify current hash computation
      const recomputedHash = computeAuditHash(entry.previous_hash, entry.event_payload);
      if (recomputedHash !== entry.sha256_hash) {
        valid = false;
        first_invalid_at = i;
        break;
      }
      
      expectedHash = entry.sha256_hash;
    }

    res.status(200).json({
      success: true,
      valid,
      entries_checked: valid ? entries.length : first_invalid_at,
      first_invalid_at
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
