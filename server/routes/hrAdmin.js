'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { validateSession, requireRole } = require('../middleware/auth');
const Invitation = require('../models/Invitation');
const Department = require('../models/Department');
const { buildNSizeAggregation } = require('../aggregations/nSizePrivacy');

// Ensure HR Admins, Tenant Admins, or Super Admins can access these routes
router.use(validateSession);
router.use(requireRole('hr_admin', 'tenant_admin', 'super_admin'));

// GET /api/v1/hr/analytics - Privacy-Preserving Analytics Endpoint (N-threshold = 5)
router.get('/analytics', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const { department, department_id } = req.query;

    const Tenant = require('../models/Tenant');
    const PersonalWellnessLog = require('../models/PersonalWellnessLog');
    const Department = require('../models/Department');

    const tenant = await Tenant.findOne({ company_id }).lean();
    const companyName = tenant ? tenant.company_name : 'Organization';
    const usedSeats = tenant ? (tenant.used_seats || 0) : 0;
    const maxSeats = tenant ? (tenant.max_allowed_seats || 50) : 50;

    // Fetch real departments
    const depts = await Department.find({ company_id, is_active: true }).lean();
    const deptNames = depts.map(d => d.name);

    // Fetch total pulse responses for this company
    const responseCount = await PersonalWellnessLog.countDocuments({ company_id });

    // Cold-start state: No responses submitted yet for this tenant
    if (responseCount === 0) {
      return res.json({
        success: true,
        status: 'COLD_START',
        is_empty: true,
        company_name: companyName,
        used_seats: usedSeats,
        max_allowed_seats: maxSeats,
        N_threshold: 5,
        total_responses: 0,
        meets_n_threshold: false,
        departments: deptNames,
        message: `Cold-start baseline state for ${companyName}. Awaiting initial employee pulse submissions.`
      });
    }

    const targetDept = department || department_id;
    let query = { company_id };
    if (targetDept && targetDept !== 'all') {
      const deptMatch = depts.find(d => d.name.toLowerCase() === targetDept.toLowerCase() || d.department_id === targetDept);
      if (deptMatch) query.department_id = deptMatch.department_id;
    }

    const logs = await PersonalWellnessLog.find(query).lean();
    const deptResponseCount = logs.length;

    if (deptResponseCount < 5) {
      return res.json({
        success: true,
        status: 'SUPPRESSED',
        is_empty: false,
        company_name: companyName,
        used_seats: usedSeats,
        max_allowed_seats: maxSeats,
        N_threshold: 5,
        total_responses: deptResponseCount,
        meets_n_threshold: false,
        departments: deptNames,
        message: 'Privacy threshold not met (N < 5 threshold).'
      });
    }

    // Real aggregated scores computation
    const moodScores = logs.map(l => l.dimensions ? (l.dimensions.mood || 70) : 70);
    const calmScores = logs.map(l => l.dimensions ? (l.dimensions.calm || 70) : 70);
    const stressScores = logs.map(l => l.dimensions ? (l.dimensions.stress || 40) : 40);
    const energyScores = logs.map(l => l.dimensions ? (l.dimensions.energy || 70) : 70);
    const workFitScores = logs.map(l => l.dimensions ? (l.dimensions.workFit || 70) : 70);

    const avg = arr => Math.round(arr.reduce((a, b) => a + b, 0) / (arr.length || 1));

    return res.json({
      success: true,
      status: 'OK',
      is_empty: false,
      company_name: companyName,
      used_seats: usedSeats,
      max_allowed_seats: maxSeats,
      N_threshold: 5,
      total_responses: deptResponseCount,
      meets_n_threshold: true,
      raw_employee_objects_exposed: false,
      departments: deptNames,
      aggregated_scores: {
        mood: moodScores,
        calm: calmScores,
        stress: stressScores,
        energy: energyScores,
        work_fit: workFitScores
      },
      averages: {
        mood: avg(moodScores),
        calm: avg(calmScores),
        stress: avg(stressScores),
        energy: avg(energyScores),
        work_fit: avg(workFitScores)
      }
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/departments
router.get('/departments', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const departments = await Department.find({ company_id, is_active: true }).lean();
    
    // Attach member count from User model
    const User = require('../models/User');
    const userCounts = await User.aggregate([
      { $match: { company_id } },
      { $group: { _id: '$department_id', count: { $sum: 1 } } }
    ]);
    const countMap = {};
    userCounts.forEach(uc => countMap[uc._id] = uc.count);

    const enrichedDepts = departments.map(d => ({
      ...d,
      member_count: countMap[d.department_id] || 0
    }));

    res.json({ success: true, departments: enrichedDepts });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/hr/generate-invite
router.post('/generate-invite', async (req, res, next) => {
  try {
    const { department_name, emails } = req.body;
    const { company_id, user_id } = req.sessionData;

    if (!department_name) {
      return res.status(400).json({ error: 'You must designate a department for this activation code.' });
    }

    const cleanName = String(department_name).trim();
    const canonicalName = cleanName.toLowerCase().replace(/[^a-z0-9]/g, '');

    // 1. Find or create the department
    let department = await Department.findOne({ company_id, canonical_name: canonicalName });
    if (!department) {
      department = new Department({
        company_id,
        name: cleanName,
        canonical_name: canonicalName,
        path: canonicalName
      });
      await department.save();
    }

    // 2. Generate a secure, human-readable unique activation token
    const uniqueSuffix = crypto.randomBytes(2).toString('hex').toUpperCase();
    const cleanDeptPrefix = canonicalName.substring(0, 3).toUpperCase().padEnd(3, 'X');
    const generatedCode = `WF-${cleanDeptPrefix}-${uniqueSuffix}`;

    let emailList = [];
    if (Array.isArray(emails)) {
      emailList = emails.map(e => String(e).trim().toLowerCase()).filter(e => e.includes('@'));
    } else if (typeof emails === 'string' && emails.trim()) {
      emailList = emails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@'));
    }

    // 3. Save to invitation collection
    const expiresAt = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000); // 15 days
    const newInvitation = new Invitation({
      company_id,
      department_id: department.department_id,
      activation_code: generatedCode,
      status: 'active',
      emails_sent: emailList,
      created_by: user_id,
      expires_at: expiresAt
    });
    await newInvitation.save();

    // Resolve client base URL dynamically from request headers or production fallback
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
      const fwdHost = req.get('x-forwarded-host');
      if (fwdHost && !fwdHost.includes('onrender.com') && !fwdHost.includes('localhost')) {
        const proto = req.get('x-forwarded-proto') || 'https';
        return `${proto}://${fwdHost}`;
      }
      return 'https://havilahss.netlify.app';
    })();

    const magicLink = `${clientBaseUrl}/register.html?invite=${generatedCode}`;

    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id,
      actor_user_id: user_id,
      actor_role: req.sessionData.role || 'hr_admin',
      event_type: 'invite_generated',
      event_payload: { department_id: department.department_id, activation_code: generatedCode, emails_sent: emailList }
    }).catch(e => {});

    // 1. Respond immediately to the client to eliminate any 504 gateway proxy timeouts
    res.status(201).json({
      success: true,
      code: generatedCode,
      magic_link: magicLink,
      department: department.name,
      emails_invited: emailList,
      expires_at: expiresAt
    });

    // 2. Dispatch onboarding emails asynchronously in the background
    if (emailList.length > 0) {
      setImmediate(async () => {
        try {
          const deptTitle = department.name.toLowerCase().endsWith('department') ? department.name : `${department.name} department`;
          const { sendMail } = require('../utils/emailService');
          await sendMail({
            to: emailList,
            subject: `🔒 Your Havilah Onboarding Invitation - ${department.name}`,
            html: `
              <div style="background-color: #000000; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
                <div style="max-width: 520px; margin: 0 auto; background-color: #0a0a0e; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #222228;">
                  <div style="background-color: #111116; border-bottom: 1px solid #222228; padding: 24px 28px;">
                    <h2 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700;">Join Your Team on Havilah</h2>
                    <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">ISO 45003 Workplace Compliance & Psychosocial Health</p>
                  </div>
                  <div style="padding: 24px 28px;">
                    <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-top: 0;">You have been invited to join the <strong>${deptTitle}</strong>.</p>
                    <p style="font-size: 14px; line-height: 1.6; color: #94a3b8;">Use your single-click activation link below or enter code <strong style="color: #38bdf8; font-family: monospace;">${generatedCode}</strong> during registration:</p>
                    <div style="margin: 24px 0; text-align: center;">
                      <a href="${magicLink}" style="background-color: #00B7C3; color: #ffffff; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; display: inline-block;">Activate Account</a>
                    </div>
                    <div style="background-color: #131318; border: 1px solid #222228; border-radius: 8px; padding: 12px 16px; margin-top: 20px;">
                      <p style="margin: 0; font-size: 12px; color: #64748b; word-break: break-all;">Link: <a href="${magicLink}" style="color: #38bdf8; text-decoration: underline;">${magicLink}</a></p>
                    </div>
                  </div>
                  <div style="padding: 14px 28px; background-color: #070709; border-top: 1px solid #1a1a1f; font-size: 11px; color: #64748b; text-align: center;">
                    Powered by Havilah Compliance Platform
                  </div>
                </div>
              </div>
            `
          });
          console.log('[HR Invite] Background email dispatched successfully for department:', department.name);
        } catch (mailErr) {
          console.warn('[HR Invite] Background email dispatch error:', mailErr.message);
        }
      });
    }
  } catch (err) {
    console.error('Failed to provision administrative invite code:', err);
    res.status(500).json({ error: 'Internal system error provisioning code.' });
  }
});

// GET /api/v1/hr/invites
router.get('/invites', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const invites = await Invitation.find({ company_id }).sort({ created_at: -1 }).lean();
    
    const now = new Date();
    const deptIds = [...new Set(invites.map(i => i.department_id).filter(Boolean))];
    const departments = await Department.find({ department_id: { $in: deptIds } }).lean();
    const deptMap = {};
    departments.forEach(d => deptMap[d.department_id] = d.name);

    const enrichedInvites = invites.map(invite => {
      let currentStatus = invite.status;
      if (currentStatus === 'active' && new Date(invite.expires_at) < now) {
        currentStatus = 'expired';
      }
      return {
        ...invite,
        status: currentStatus,
        department_name: deptMap[invite.department_id] || 'Unknown'
      };
    });

    res.json({ success: true, invites: enrichedInvites });
  } catch (err) {
    next(err);
  }
});

// Alias GET /api/v1/departments/codes
router.get('/departments/codes', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const invites = await Invitation.find({ company_id }).sort({ created_at: -1 }).lean();
    
    const now = new Date();
    const deptIds = [...new Set(invites.map(i => i.department_id).filter(Boolean))];
    const departments = await Department.find({ department_id: { $in: deptIds } }).lean();
    const deptMap = {};
    departments.forEach(d => deptMap[d.department_id] = d.name);

    const enrichedInvites = invites.map(invite => {
      let currentStatus = invite.status;
      if (currentStatus === 'active' && new Date(invite.expires_at) < now) {
        currentStatus = 'expired';
      }
      return {
        ...invite,
        status: currentStatus,
        department_name: deptMap[invite.department_id] || 'Unknown'
      };
    });

    res.json({ success: true, codes: enrichedInvites, invites: enrichedInvites });
  } catch (err) {
    next(err);
  }
});

// PATCH & POST /api/v1/hr/invites/:code/revoke
const handleRevokeInvite = async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const code = req.params.code || req.body.code || req.body.activation_code;

    if (!code) {
      return res.status(400).json({ error: 'Activation code is required' });
    }

    const invite = await Invitation.findOneAndUpdate(
      { company_id, activation_code: code.toUpperCase() },
      { status: 'revoked' },
      { new: true }
    );

    if (!invite) {
      return res.status(404).json({ error: 'Activation code not found' });
    }

    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id,
      actor_user_id: req.sessionData.user_id,
      actor_role: req.sessionData.role || 'hr_admin',
      event_type: 'invite_revoked',
      event_payload: { activation_code: code.toUpperCase() }
    }).catch(e => {});

    res.json({ success: true, message: 'Activation code revoked', invite });
  } catch (err) {
    next(err);
  }
};

router.patch('/invites/:code/revoke', handleRevokeInvite);
router.post('/invites/:code/revoke', handleRevokeInvite);
router.post('/departments/revoke', handleRevokeInvite);

// DELETE & POST /api/v1/hr/invites/:code/delete
const handleDeleteInvite = async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const code = req.params.code || req.body.code || req.body.activation_code;

    if (!code) {
      return res.status(400).json({ error: 'Activation code is required' });
    }

    const deletedInvite = await Invitation.findOneAndDelete({
      company_id,
      activation_code: code.toUpperCase()
    });

    if (!deletedInvite) {
      return res.status(404).json({ error: 'Activation code not found' });
    }

    const AuditLog = require('../models/AuditLog');
    await AuditLog.append({
      company_id,
      actor_user_id: req.sessionData.user_id,
      actor_role: req.sessionData.role || 'hr_admin',
      event_type: 'invite_deleted',
      event_payload: { activation_code: code.toUpperCase(), department_id: deletedInvite.department_id }
    }).catch(e => {});

    res.json({ success: true, message: 'Activation code and link deleted permanently', deletedInvite });
  } catch (err) {
    next(err);
  }
};

router.delete('/invites/:code', handleDeleteInvite);
router.post('/invites/:code/delete', handleDeleteInvite);
router.delete('/departments/codes/:code', handleDeleteInvite);

// GET /api/v1/hr/heatmap - Edge Case 1: Hard DB Aggregation Suppression for N < 5
router.get('/heatmap', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    
    // Execute N-Size Aggregation builder with threshold 5
    const results = await buildNSizeAggregation(company_id, { nSizeThreshold: 5 });
    
    // Ensure suppressed teams explicitly transmit status: SUPPRESSED and metrics: null
    const sanitizedResults = results.map(item => {
      if (!item.meets_n_size || item.response_count < 5) {
        return {
          department_id: item.department_id,
          department_name: item.department_name,
          response_count: item.response_count,
          status: 'SUPPRESSED',
          meets_n_size: false,
          metrics: null,
          privacy_notice: 'Metrics suppressed to protect individual response anonymity (N < 5 threshold).'
        };
      }
      return item;
    });

    res.json({ success: true, data: sanitizedResults });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/radar
router.get('/radar', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const AnonHazardLog = require('../models/AnonHazardLog');
    
    const count = await AnonHazardLog.countDocuments({ company_id });
    if (count < 5) {
      return res.json({
        success: true,
        status: 'SUPPRESSED',
        data: [],
        privacy_notice: 'Radar metrics suppressed due to insufficient company response count (N < 5).'
      });
    }

    const logs = await AnonHazardLog.find({ company_id }).lean();
    let sums = {};
    let counts = {};
    
    logs.forEach(log => {
       if (log.dimension_scores) {
          Object.keys(log.dimension_scores).forEach(dim => {
             sums[dim] = (sums[dim] || 0) + log.dimension_scores[dim];
             counts[dim] = (counts[dim] || 0) + 1;
          });
       }
    });
    
    let averages = {};
    Object.keys(sums).forEach(dim => {
       averages[dim] = Math.round(sums[dim] / counts[dim]);
    });
    
    const radarData = [
       averages['mood'] || 50,
       averages['calm'] || 50,
       averages['stress'] || 50,
       averages['energy'] || 50,
       averages['work_fit'] || 50
    ];
    
    res.json({ success: true, data: radarData, averages });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/severity-trends
router.get('/severity-trends', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const AnonHazardLog = require('../models/AnonHazardLog');
    
    const totalCount = await AnonHazardLog.countDocuments({ company_id });
    if (totalCount < 5) {
      return res.json({
        success: true,
        status: 'SUPPRESSED',
        labels: [],
        datasets: { healthy: [], mild: [], moderate: [], severe: [] },
        privacy_notice: 'Severity trend metrics suppressed due to insufficient company response count (N < 5).'
      });
    }

    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
    const logs = await AnonHazardLog.find({ 
       company_id, 
       submitted_at: { $gte: eightWeeksAgo } 
    }).sort({ period_year: 1, period_week: 1 }).lean();
    
    const weeks = {};
    logs.forEach(log => {
       const weekKey = `${log.period_year}-W${log.period_week}`;
       if (!weeks[weekKey]) {
          weeks[weekKey] = { healthy: 0, mild: 0, moderate: 0, severe: 0, total: 0 };
       }
       weeks[weekKey][log.severity_band]++;
       weeks[weekKey].total++;
    });
    
    const labels = Object.keys(weeks);
    const datasets = { healthy: [], mild: [], moderate: [], severe: [] };
    
    labels.forEach(w => {
       const tot = weeks[w].total || 1;
       const h = Math.round((weeks[w].healthy / tot) * 100);
       const mi = Math.round((weeks[w].mild / tot) * 100);
       const mo = Math.round((weeks[w].moderate / tot) * 100);
       const s = Math.max(0, 100 - (h + mi + mo));
       datasets.healthy.push(h);
       datasets.mild.push(mi);
       datasets.moderate.push(mo);
       datasets.severe.push(s);
    });
    
    res.json({ success: true, labels, datasets });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const Alert = require('../models/Alert');

    const rawAlerts = await Alert.find({
      $or: [{ tenant_id: company_id }, { company_id: company_id }]
    })
      .sort({ created_at: -1 })
      .limit(5)
      .lean();

    const alerts = rawAlerts.map(alert => {
      let severity = (alert.severity || alert.icon || 'INFO').toUpperCase();
      let icon = 'info';
      if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'SEVERE') {
        severity = 'CRITICAL';
        icon = 'critical';
      } else if (severity === 'WARNING' || severity === 'MODERATE' || severity === 'MEDIUM') {
        severity = 'WARNING';
        icon = 'moderate';
      } else {
        severity = 'INFO';
        icon = 'info';
      }

      const headline = alert.headline || alert.title || alert.alert_type || 'Threshold Alert';
      const department = alert.department || alert.department_name || alert.department_id || null;
      const titleText = department ? `${department} • ${headline}` : headline;

      return {
        id: alert._id ? alert._id.toString() : alert.id,
        tenant_id: company_id,
        severity: severity,
        icon: icon,
        title: titleText,
        headline: headline,
        department: department,
        desc: alert.desc || alert.description || 'Automated threshold alert triggered.',
        time: alert.time || (alert.created_at ? new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'),
        created_at: alert.created_at || new Date()
      };
    });

    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/modules
router.get('/modules', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const Tenant = require('../models/Tenant');
    const tenant = await Tenant.findOne({ company_id }).lean();

    const defaultModules = ['DAILY_PULSE', 'PHQ-9', 'GAD-7', 'PSS-10', 'FAS-10', 'COPSOQ_III'];
    const allowed = (tenant && tenant.allowed_modules && tenant.allowed_modules.length > 0)
      ? tenant.allowed_modules
      : defaultModules;

    res.json({
      success: true,
      company_id,
      allowed_modules: allowed,
      all_modules: defaultModules
    });
  } catch (err) {
    next(err);
  }
});

const { handleToggleAssessment } = require('./assessment');
router.post('/toggle-assessment', handleToggleAssessment);

module.exports = router;
