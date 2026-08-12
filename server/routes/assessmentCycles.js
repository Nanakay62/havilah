'use strict';

const express = require('express');
const router = express.Router();
const { validateSession, requireRole } = require('../middleware/auth');
const AssessmentCycle = require('../models/AssessmentCycle');
const AuditLog = require('../models/AuditLog');
const Tenant = require('../models/Tenant');
const { broadcastTenantAvailability } = require('./assessment');

// GET /status - Auth: validateSession
router.get('/status', validateSession, async (req, res, next) => {
  try {
    const { company_id, department_id } = req.sessionData;
    
    // Get tenant defaults
    const tenant = await Tenant.findOne({ company_id }).lean();
    const defaults = tenant?.settings?.default_lock_policy || {
      phq9: 'locked', gad7: 'locked', pss10: 'locked', fas10: 'locked', copsoq3: 'locked'
    };

    // Get active unlocked cycles for the user
    const activeMap = await AssessmentCycle.getActiveForEmployee(company_id, department_id);

    const result = {};
    const surveyTypes = ['phq9', 'gad7', 'pss10', 'fas10', 'copsoq3'];

    for (const type of surveyTypes) {
      if (activeMap[type]) {
        result[type] = activeMap[type];
      } else {
        result[type] = { status: defaults[type] || 'locked' };
      }
    }

    res.json({ success: true, status: result });
  } catch (err) {
    next(err);
  }
});

// Require admin for subsequent routes
router.use(validateSession);
router.use(requireRole('hr_admin', 'tenant_admin', 'super_admin'));

// GET /active
router.get('/active', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const cycles = await AssessmentCycle.find({ company_id, status: 'unlocked' }).sort({ created_at: -1 }).lean();
    res.json({ success: true, cycles });
  } catch (err) {
    next(err);
  }
});

// POST /unlock
router.post('/unlock', async (req, res, next) => {
  try {
    const { company_id, user_id, role } = req.sessionData || {};
    const { survey_type, department_id, deadline, copsoq_depth } = req.body;

    if (!survey_type) {
      return res.status(400).json({ success: false, error: 'survey_type is required' });
    }

    const cycle = new AssessmentCycle({
      company_id,
      department_id: department_id || null,
      survey_type,
      copsoq_depth,
      status: 'unlocked',
      unlocked_by: user_id || 'system_admin',
      unlocked_at: new Date(),
      deadline: deadline ? new Date(deadline) : undefined
    });

    await cycle.save();

    // Broadcast updated availability to connected SSE employee dashboards
    if (company_id && typeof broadcastTenantAvailability === 'function') {
      broadcastTenantAvailability(company_id).catch(() => {});
    }

    // Wrap non-critical side effects (audit log, email alerts, etc.) in safe nested try/catch blocks
    try {
      if (AuditLog && typeof AuditLog.append === 'function') {
        await AuditLog.append({
          company_id: company_id || 'system',
          actor_user_id: user_id || 'system_admin',
          actor_role: role || 'admin',
          event_type: 'survey_dispatched',
          event_payload: {
            cycle_id: cycle.cycle_id,
            survey_type,
            department_id: department_id || null,
            deadline: deadline || null
          }
        });
      }
    } catch (auditErr) {
      console.warn('[AssessmentCycles] Non-fatal audit log warning on unlock:', auditErr.message);
    }

    return res.status(200).json({ success: true, cycle });
  } catch (err) {
    next(err);
  }
});

// POST /lock
router.post('/lock', async (req, res, next) => {
  try {
    const { company_id, user_id, role } = req.sessionData || {};
    const { cycle_id } = req.body;

    if (!cycle_id) {
      return res.status(400).json({ success: false, error: 'cycle_id is required' });
    }

    const cycle = await AssessmentCycle.findOneAndUpdate(
      { cycle_id, company_id, status: 'unlocked' },
      { status: 'closed', closed_at: new Date() },
      { new: true }
    );

    if (!cycle) {
      return res.status(404).json({ success: false, error: 'Active cycle not found' });
    }

    // Broadcast updated availability to connected SSE employee dashboards
    if (company_id && typeof broadcastTenantAvailability === 'function') {
      broadcastTenantAvailability(company_id).catch(() => {});
    }

    // Wrap non-critical side effects (audit log, etc.) in safe nested try/catch blocks
    try {
      if (AuditLog && typeof AuditLog.append === 'function') {
        await AuditLog.append({
          company_id: company_id || 'system',
          actor_user_id: user_id || 'system_admin',
          actor_role: role || 'admin',
          event_type: 'control_activated',
          event_payload: {
            action: 'lock_survey_cycle',
            cycle_id: cycle.cycle_id,
            survey_type: cycle.survey_type
          }
        });
      }
    } catch (auditErr) {
      console.warn('[AssessmentCycles] Non-fatal audit log warning on lock:', auditErr.message);
    }

    return res.status(200).json({ success: true, cycle });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
