'use strict';

const cron = require('node-cron');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const { computeAuditHash } = require('../utils/crypto');

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
      const now = new Date();
      // Format options to get local parts in the specific timezone
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hourCycle: 'h23',
        weekday: 'short'
      });
      
      const parts = formatter.formatToParts(now);
      let hour = 0;
      let weekday = '';
      
      for (const part of parts) {
        if (part.type === 'hour') hour = parseInt(part.value, 10);
        if (part.type === 'weekday') weekday = part.value;
      }

      if (this.config.excludeWeekends && (weekday === 'Sat' || weekday === 'Sun')) {
        return false;
      }

      return hour >= this.config.workStart && hour < this.config.workEnd;
    } catch (err) {
      // Fallback if timezone is invalid
      return false;
    }
  }

  getNextDispatchTime(timezone) {
    const now = new Date();
    // Simplified logic for calculating next dispatch window.
    // In a real production system, this would use a robust timezone math library like luxon or date-fns-tz.
    // We return 'now' if we are currently in the window, otherwise we schedule for later.
    if (this.isWithinWorkingHours(timezone)) {
      return now;
    }
    
    // For this implementation, we just set it to +24h if not in working hours
    // This is a simplification of the complex calendar math required.
    const next = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    return next;
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
    
    // In a real system, we would save these to a 'pending_notifications' collection.
    // For this blueprint, we simulate the grouping and audit log.
    for (const [timezone, userIds] of Object.entries(tzGroups)) {
      const dispatch_at = this.getNextDispatchTime(timezone);
      groups.push({ timezone, user_count: userIds.length, dispatch_at });
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
    // In a real system, this queries the database for notifications where dispatch_at <= now
    // and processes them.
    console.log(`[Scheduler] Checking pending notifications at ${new Date().toISOString()}`);
    return [];
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

function initScheduler() {
  console.log('[Scheduler] Initializing ISO 45003 compliance scheduler...');
  
  // Run every minute
  cron.schedule('* * * * *', async () => {
    try {
      await schedulerInstance.processPendingNotifications();
    } catch (err) {
      console.error('[Scheduler] Error processing notifications:', err);
    }
  });
}

module.exports = {
  WorkingHoursScheduler,
  ISO_45003_CONTROLS,
  logControlActivation,
  initScheduler
};
