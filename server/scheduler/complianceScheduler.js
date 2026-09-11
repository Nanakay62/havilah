'use strict';

const cron = require('node-cron');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const PendingNotification = require('../models/PendingNotification');
const { computeAuditHash, decryptField } = require('../utils/crypto');
const { sendMail } = require('../utils/emailService');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');

/**
 * ISO 45003 Primary and Secondary Controls
 * @type {Object}
 */
const ISO_45003_CONTROLS = {
  primary: [
    { id: 'JDM-01', name: 'Job Demand Management', category: 'primary', description: 'Modify workloads and deadlines', activation_criteria: 'When workload dimension scores exceed 70% risk threshold' },
    { id: 'JCT-01', name: 'Job Control/Autonomy', category: 'primary', description: 'Increase employee autonomy', activation_criteria: 'Low autonomy scores combined with high stress' },
    { id: 'RCL-01', name: 'Role Clarity', category: 'primary', description: 'Review and clarify job descriptions', activation_criteria: 'Role ambiguity scores exceed threshold' },
    { id: 'ORC-01', name: 'Organizational Change Management', category: 'primary', description: 'Consultation during restructuring', activation_criteria: 'During major M&A or restructuring events' },
    { id: 'RWD-01', name: 'Reward and Recognition', category: 'primary', description: 'Implement structured recognition programs', activation_criteria: 'Low effort-reward imbalance scores' },
    { id: 'ENV-01', name: 'Physical Environment', category: 'primary', description: 'Improve physical working conditions', activation_criteria: 'Physical hazard scores elevated' }
  ],
  secondary: [
    { id: 'TRN-01', name: 'Manager Training', category: 'secondary', description: 'Mental health leadership training', activation_criteria: 'Manager support scores below baseline' },
    { id: 'EAP-01', name: 'EAP Promotion', category: 'secondary', description: 'Targeted promotion of support services', activation_criteria: 'General distress scores elevated' },
    { id: 'FWA-01', name: 'Flexible Work Arrangements', category: 'secondary', description: 'Promote flex-time and remote options', activation_criteria: 'Work-life conflict scores elevated' },
    { id: 'MNT-01', name: 'Peer Mentoring', category: 'secondary', description: 'Establish peer support networks', activation_criteria: 'Social isolation scores elevated' },
    { id: 'COM-01', name: 'Communication Strategy', category: 'secondary', description: 'Transparent leadership communication', activation_criteria: 'Trust in leadership scores low' },
    { id: 'RTM-01', name: 'Return to Work Management', category: 'secondary', description: 'Structured RTW policies', activation_criteria: 'Absenteeism rates increasing' }
  ]
};

/**
 * Handles timezone-aware scheduling of survey pulses.
 */
class WorkingHoursScheduler {
  constructor(config = { workStart: 9, workEnd: 17, excludeWeekends: true }) {
    this.config = config;
  }

  isWithinWorkingHours(timezone) {
    try {
      const now = DateTime.now().setZone(timezone || 'UTC');
      if (!now.isValid) return false;
      const isWeekend = now.weekday >= 6; // 6=Saturday, 7=Sunday
      if (this.config.excludeWeekends && isWeekend) {
        return false;
      }
      return now.hour >= this.config.workStart && now.hour < this.config.workEnd;
    } catch {
      return false;
    }
  }

  getNextDispatchTime(timezone) {
    try {
      const now = DateTime.now().setZone(timezone || 'UTC');
      if (!now.isValid) return new Date(Date.now() + 24 * 60 * 60 * 1000);

      const isWeekend = now.weekday >= 6;
      const inWorkHours = now.hour >= this.config.workStart && now.hour < this.config.workEnd;

      if ((!this.config.excludeWeekends || !isWeekend) && inWorkHours) {
        return now.toJSDate();
      }

      // Calculate next working-hours window start
      let next = now.set({ hour: this.config.workStart, minute: 0, second: 0, millisecond: 0 });
      if (next <= now) {
        next = next.plus({ days: 1 });
      }

      // Advance through weekends if excluded
      if (this.config.excludeWeekends) {
        while (next.weekday >= 6) {
          next = next.plus({ days: 1 });
        }
      }

      return next.toJSDate();
    } catch (err) {
      return new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
  }

  async scheduleSurveyPulse(tenantId, surveyType, targetDate) {
    const tenant = await Tenant.findOne({ company_id: tenantId });
    if (!tenant) throw new Error('Tenant not found');

    const config = tenant.settings || {};
    this.config.workStart = config.work_hours_start || 9;
    this.config.workEnd = config.work_hours_end || 17;
    this.config.excludeWeekends = config.exclude_weekends !== false;

    // Fetch all active users
    const users = await User.find({ company_id: tenantId, status: 'active' });
    
    // Group by timezone
    const tzGroups = {};
    users.forEach(u => {
      const tz = u.timezone || config.default_timezone || 'UTC';
      if (!tzGroups[tz]) tzGroups[tz] = [];
      tzGroups[tz].push(u.user_id);
    });

    const groups = [];
    
    // Save notifications to PendingNotification collection and group by timezone
    for (const [timezone, userIds] of Object.entries(tzGroups)) {
      const dispatch_at = this.getNextDispatchTime(timezone);
      groups.push({ timezone, user_count: userIds.length, dispatch_at });

      // Create pending notifications for users in this timezone
      const tzUsers = users.filter(u => userIds.includes(u.user_id));
      for (const u of tzUsers) {
        try {
          let enc = u.email_encrypted;
          if (typeof enc === 'string') {
            enc = JSON.parse(enc);
          }
          if (enc && enc.encrypted && enc.iv && enc.authTag) {
            await PendingNotification.create({
              company_id: tenantId,
              user_id: u.user_id,
              user_email_encrypted: enc.encrypted,
              user_email_iv: enc.iv,
              user_email_tag: enc.authTag,
              survey_type: surveyType,
              dispatch_at,
            });
          }
        } catch (e) {
          logger.warn({ user_id: u.user_id, err: e.message }, '[Scheduler] Could not queue notification for user');
        }
      }
    }

    // Log the audit event
    const lastAudit = await AuditLog.findOne({ company_id: tenantId }).sort({ created_at: -1 });
    const prevHash = lastAudit ? lastAudit.sha256_hash : 'GENESIS';
    const payload = { event: 'survey_dispatched', survey_type: surveyType, target_date: targetDate, groups };
    const newHash = computeAuditHash(prevHash, payload);

    await AuditLog.create({
      company_id: tenantId,
      actor_user_id: 'SYSTEM_SCHEDULER',
      actor_role: 'system',
      event_type: 'survey_dispatched',
      event_payload: payload,
      previous_hash: prevHash,
      sha256_hash: newHash
    });

    return { scheduled: true, groups };
  }

  async processPendingNotifications() {
    const now = new Date();
    try {
      const pending = await PendingNotification.find({
        dispatch_at: { $lte: now },
        dispatched: false,
        retry_count: { $lt: 3 },
      }).limit(50);

      if (pending.length === 0) return [];
      logger.info({ count: pending.length }, '[Scheduler] Processing pending survey notifications');

      const names = {
        phq9: 'Mood Check-In (PHQ-9)',
        gad7: 'Anxiety Check-In (GAD-7)',
        pss10: 'Stress Check-In (PSS-10)',
        fas10: 'Fatigue Check-In (FAS-10)',
        copsoq3: 'Workplace Wellbeing Survey (COPSOQ III)'
      };

      for (const notif of pending) {
        try {
          const email = decryptField({
            iv: notif.user_email_iv,
            encrypted: notif.user_email_encrypted,
            authTag: notif.user_email_tag,
          });

          const label = names[notif.survey_type] || notif.survey_type.toUpperCase();
          const origin = process.env.CLIENT_ORIGIN || 'http://localhost:3000';

          await sendMail({
            to: email,
            subject: `📋 Your ${label} is Available`,
            html: `
              <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
                <h2 style="color: #0d9488; margin-top: 0;">Your Wellbeing Check-In is Ready</h2>
                <p style="color: #334155; line-height: 1.6;">Hello,</p>
                <p style="color: #334155; line-height: 1.6;">A new <strong>${label}</strong> assessment is now available for your organization.</p>
                <p style="color: #334155; line-height: 1.6;">Your responses are <strong>strictly anonymous</strong> (N≥5 privacy threshold) and help identify psychosocial workplace hazards to improve organizational health.</p>
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${origin}/app/dashboard.html" style="background-color: #0d9488; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block;">Complete Assessment</a>
                </div>
                <p style="color: #64748b; font-size: 12px;">This is an automated compliance notification from Havilah Health.</p>
              </div>
            `,
          });

          notif.dispatched = true;
          notif.dispatched_at = new Date();
          await notif.save();
        } catch (dispatchErr) {
          console.error(`[Scheduler] Failed to dispatch notification ${notif.notification_id}:`, dispatchErr.message);
          notif.retry_count += 1;
          await notif.save();
        }
      }

      return pending;
    } catch (err) {
      logger.error({ err: err.message }, '[Scheduler] Error processing pending notifications');
      return [];
    }
  }
}

/**
 * Logs the activation of an ISO 45003 control.
 */
async function logControlActivation(tenantId, actorUserId, controlType, controlId, details) {
  const controlGroup = ISO_45003_CONTROLS[controlType];
  if (!controlGroup) throw new Error('Invalid control type');
  
  const control = controlGroup.find(c => c.id === controlId);
  if (!control) throw new Error('Invalid control ID');

  const lastAudit = await AuditLog.findOne({ company_id: tenantId }).sort({ created_at: -1 });
  const prevHash = lastAudit ? lastAudit.sha256_hash : 'GENESIS';
  
  const payload = Object.freeze({
    event: 'control_activated',
    control_type: controlType,
    control_id: controlId,
    control_name: control.name,
    details
  });
  
  const newHash = computeAuditHash(prevHash, payload);

  const entry = await AuditLog.create({
    company_id: tenantId,
    actor_user_id: actorUserId,
    actor_role: 'hr_admin', // simplified
    event_type: 'control_activated',
    event_payload: payload,
    previous_hash: prevHash,
    sha256_hash: newHash
  });

  return entry;
}

const schedulerInstance = new WorkingHoursScheduler();

let redisLockClient = null;
if (process.env.REDIS_URL) {
  try {
    const Redis = require('ioredis');
    redisLockClient = new Redis(process.env.REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    redisLockClient.connect().catch(() => { redisLockClient = null; });
  } catch {
    redisLockClient = null;
  }
}

function initScheduler() {
  logger.info('[Scheduler] Initializing ISO 45003 compliance scheduler...');
  
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      if (redisLockClient && redisLockClient.status === 'ready') {
        const lockKey = `scheduler:lock:processPendingNotifications:${Math.floor(Date.now() / 60000)}`;
        const acquired = await redisLockClient.set(lockKey, '1', 'EX', 55, 'NX');
        if (!acquired) {
          // Another instance is already processing this window
          return;
        }
      }
      await schedulerInstance.processPendingNotifications();
    } catch (err) {
      logger.error({ err: err.message }, '[Scheduler] Error processing notifications');
    }
  });
}

module.exports = {
  WorkingHoursScheduler,
  schedulerInstance,
  ISO_45003_CONTROLS,
  logControlActivation,
  initScheduler
};
