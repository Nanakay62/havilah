'use strict';

const express = require('express');
const router = express.Router();
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const AssessmentCycle = require('../models/AssessmentCycle');
const { validateSession } = require('../middleware/auth');

// Active SSE client connections indexed by tenant_id
const sseClientsByTenant = new Map(); // tenant_id -> Set of Express res objects

/**
 * Helper to extract standard instrument codes from an active cycles map
 */
function getUnlockedInstrumentCodes(activeMap = {}) {
  const codeMap = {
    phq9: 'PHQ-9',
    gad7: 'GAD-7',
    pss10: 'PSS-10',
    fas10: 'FAS-10',
    copsoq3: 'COPSOQ_III',
    copsoq3_core: 'COPSOQ_III',
    copsoq3_middle: 'COPSOQ_III',
    copsoq3_long: 'COPSOQ_III',
    daily_pulse: 'DAILY_PULSE',
    checkin_slider: 'DAILY_PULSE'
  };

  const unlocked = new Set(['DAILY_PULSE']); // Daily Pulse is always available
  Object.keys(activeMap).forEach(key => {
    if (activeMap[key] && activeMap[key].status !== 'locked') {
      const norm = codeMap[key] || key.toUpperCase();
      unlocked.add(norm);
    }
  });
  return Array.from(unlocked);
}

/**
 * Broadcast availability updates to all connected SSE clients for a tenant
 */
async function broadcastTenantAvailability(tenantId) {
  const clients = sseClientsByTenant.get(tenantId);
  if (!clients || clients.size === 0) return;

  try {
    const activeMap = await AssessmentCycle.getActiveForEmployee(tenantId, null);
    const unlockedInstruments = getUnlockedInstrumentCodes(activeMap);

    const payload = JSON.stringify({
      type: 'availability_update',
      tenant_id: tenantId,
      unlocked_instruments: unlockedInstruments,
      status_map: activeMap,
      timestamp: new Date().toISOString()
    });

    clients.forEach(clientRes => {
      try {
        clientRes.write(`data: ${payload}\n\n`);
      } catch (e) {
        // connection closed
      }
    });
  } catch (err) {
    console.warn('[SSE Broadcast Warning]', err.message);
  }
}

/**
 * @route   GET /api/v1/assessments/stream-availability
 * @desc    Establish real-time Server-Sent Events (SSE) stream for assessment availability updates
 * @access  Public / Authenticated
 */
router.get('/stream-availability', async (req, res, next) => {
  try {
    const tenantId = req.query.tenant_id || (req.sessionData && req.sessionData.company_id) || 'ten-123';

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    if (!sseClientsByTenant.has(tenantId)) {
      sseClientsByTenant.set(tenantId, new Set());
    }
    const tenantClients = sseClientsByTenant.get(tenantId);
    tenantClients.add(res);

    // Send initial snapshot on connection
    const activeMap = await AssessmentCycle.getActiveForEmployee(tenantId, null).catch(() => ({}));
    const unlockedInstruments = getUnlockedInstrumentCodes(activeMap);

    const initialPayload = JSON.stringify({
      type: 'connected',
      tenant_id: tenantId,
      unlocked_instruments: unlockedInstruments,
      status_map: activeMap,
      timestamp: new Date().toISOString()
    });
    res.write(`data: ${initialPayload}\n\n`);

    // Keep connection alive with periodic heartbeats every 15 seconds
    const heartbeatInterval = setInterval(() => {
      try {
        res.write(`: heartbeat\n\n`);
      } catch (e) {
        clearInterval(heartbeatInterval);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(heartbeatInterval);
      tenantClients.delete(res);
      if (tenantClients.size === 0) {
        sseClientsByTenant.delete(tenantId);
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * @route   GET /api/v1/assessments/completed-status
 * @desc    Fetch completed assessments filtered strictly by worker_id, tenant_id, and optional cycle_id window.
 * @access  Authenticated
 */
router.get('/completed-status', validateSession, async (req, res, next) => {
  try {
    const workerId = req.query.worker_id || req.sessionData.user_id;
    const tenantId = req.query.tenant_id || req.sessionData.company_id;
    const cycleId = req.query.cycle_id;

    if (!workerId || !tenantId) {
      return res.status(400).json({ success: false, error: 'Worker ID and Tenant ID are required' });
    }

    let cutoffDate = null;
    if (cycleId) {
      const cycle = await AssessmentCycle.findOne({ cycle_id: cycleId, company_id: tenantId }).lean();
      if (cycle && cycle.unlocked_at) {
        cutoffDate = new Date(cycle.unlocked_at);
      }
    }

    if (!cutoffDate) {
      cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 90);
    }

    const logs = await PersonalWellnessLog.find({
      user_id: workerId,
      company_id: tenantId,
      submitted_at: { $gte: cutoffDate }
    })
      .select('survey_type submitted_at dimension_scores')
      .sort({ submitted_at: -1 })
      .lean();

    const normalizeCode = (type) => {
      if (!type) return null;
      const t = type.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (t === 'phq9' || t === 'phq') return 'PHQ-9';
      if (t === 'gad7' || t === 'gad') return 'GAD-7';
      if (t === 'pss10' || t === 'pss') return 'PSS-10';
      if (t === 'fas10' || t === 'fas') return 'FAS-10';
      if (t.startsWith('copsoq')) return 'COPSOQ_III';
      if (t === 'checkinslider' || t === 'dailypulse') return 'DAILY_PULSE';
      return type.toUpperCase();
    };

    const completedInstrumentsSet = new Set();
    const completedSurveyTypesSet = new Set();

    logs.forEach(log => {
      const norm = normalizeCode(log.survey_type);
      if (norm) completedInstrumentsSet.add(norm);
      if (log.survey_type) completedSurveyTypesSet.add(log.survey_type);
    });

    res.json({
      success: true,
      worker_id: workerId,
      tenant_id: tenantId,
      completed_instruments: Array.from(completedInstrumentsSet),
      completed_survey_types: Array.from(completedSurveyTypesSet),
      completed_logs: logs
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Handler for HR toggle-assessment request
 */
async function handleToggleAssessment(req, res, next) {
  try {
    const tenantId = req.body.tenant_id || (req.sessionData && req.sessionData.company_id) || 'ten-123';
    const userId = (req.sessionData && req.sessionData.user_id) || 'hr_admin';
    const { instrument_code, survey_type, status, department_id, deadline, copsoq_depth } = req.body;

    const rawCode = (survey_type || instrument_code || 'phq9').toLowerCase().replace(/[^a-z0-9]/g, '');
    let normType = rawCode;
    if (rawCode === 'phq9' || rawCode === 'phq') normType = 'phq9';
    else if (rawCode === 'gad7' || rawCode === 'gad') normType = 'gad7';
    else if (rawCode === 'pss10' || rawCode === 'pss') normType = 'pss10';
    else if (rawCode === 'fas10' || rawCode === 'fas') normType = 'fas10';
    else if (rawCode.startsWith('copsoq')) normType = 'copsoq3';

    const newStatus = (status || 'unlocked').toLowerCase();

    if (newStatus === 'unlocked') {
      await AssessmentCycle.updateMany(
        { company_id: tenantId, survey_type: normType, status: 'unlocked' },
        { status: 'closed', closed_at: new Date() }
      );

      const cycle = new AssessmentCycle({
        company_id: tenantId,
        department_id: department_id || null,
        survey_type: normType,
        copsoq_depth: copsoq_depth || 'core',
        status: 'unlocked',
        unlocked_by: userId,
        unlocked_at: new Date(),
        deadline: deadline ? new Date(deadline) : new Date(Date.now() + 14 * 86400000)
      });
      await cycle.save();
    } else {
      await AssessmentCycle.updateMany(
        { company_id: tenantId, survey_type: normType, status: 'unlocked' },
        { status: 'closed', closed_at: new Date() }
      );
    }

    // Broadcast update to all connected SSE clients for this tenant
    await broadcastTenantAvailability(tenantId);

    const activeMap = await AssessmentCycle.getActiveForEmployee(tenantId, null);
    const unlockedInstruments = getUnlockedInstrumentCodes(activeMap);

    res.json({
      success: true,
      tenant_id: tenantId,
      survey_type: normType,
      status: newStatus,
      unlocked_instruments: unlockedInstruments,
      status_map: activeMap
    });
  } catch (err) {
    next(err);
  }
}

/**
 * @route   POST /api/v1/assessments/toggle
 * @desc    HR Admin toggle assessment availability endpoint
 */
router.post('/toggle', handleToggleAssessment);

module.exports = {
  router,
  broadcastTenantAvailability,
  handleToggleAssessment
};
