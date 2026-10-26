'use strict';

const { hashField } = require('../utils/crypto');
const { withTransaction } = require('../utils/dbTransaction');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Department = require('../models/Department');
const Invitation = require('../models/Invitation');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const PendingNotification = require('../models/PendingNotification');
const AuditLog = require('../models/AuditLog');

const HR_MAX_ACCOUNT_AGE_DAYS = 30;

/**
 * Looks up a user by plaintext email using deterministic SHA-256 hash.
 *
 * @param {string} email
 * @returns {Promise<{ user: object, companyName: string, departmentName: string, wellnessCount: number } | null>}
 */
async function findUserByEmail(email) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return null;
  }

  const normalised = email.trim().toLowerCase();
  const emailHash = hashField(normalised);

  const user = await User.findOne({ email_hash: emailHash });
  if (!user) {
    return null;
  }

  let companyName = '(unknown)';
  if (user.company_id) {
    const tenant = await Tenant.findOne({ company_id: user.company_id }).select('company_name').lean();
    if (tenant && tenant.company_name) {
      companyName = tenant.company_name;
    }
  }

  let departmentName = user.department_id || 'unassigned';
  if (user.department_id && user.department_id !== 'unassigned') {
    const dept = await Department.findOne({ department_id: user.department_id }).select('name').lean();
    if (dept && dept.name) {
      departmentName = dept.name;
    }
  }

  const wellnessCount = await PersonalWellnessLog.countDocuments({ user_id: user.user_id });

  return {
    user,
    companyName,
    departmentName,
    wellnessCount,
  };
}

/**
 * Evaluates whether the actor is permitted to remove the target account.
 *
 * @param {object} params
 * @param {object} params.target - Mongoose User document or object
 * @param {number} params.wellnessCount - Count of PersonalWellnessLog documents
 * @param {object} [params.actor] - { user_id, company_id, role }
 * @param {'superadmin'|'hr'} params.mode
 * @param {boolean} [params.confirmAdmin]
 * @returns {{ allowed: boolean, reasonCode: string | null }}
 */
function checkRemovalAllowed({ target, wellnessCount = 0, actor = {}, mode = 'hr', confirmAdmin = false }) {
  if (!target) {
    return { allowed: false, reasonCode: 'NOT_FOUND' };
  }

  if (mode === 'hr') {
    if (!actor || !actor.company_id || target.company_id !== actor.company_id) {
      return { allowed: false, reasonCode: 'NOT_FOUND' };
    }
  }

  if (actor && actor.user_id && target.user_id === actor.user_id) {
    return { allowed: false, reasonCode: 'CANNOT_REMOVE_SELF' };
  }

  if (target.role === 'super_admin' || target.isSystemSuperAdmin === true) {
    return { allowed: false, reasonCode: 'CANNOT_REMOVE_SUPER_ADMIN' };
  }

  if (mode === 'hr') {
    if (target.role !== 'employee') {
      return { allowed: false, reasonCode: 'ADMIN_REQUIRES_SUPERADMIN' };
    }

    const createdAt = target.created_at ? new Date(target.created_at) : null;
    const maxAgeMs = HR_MAX_ACCOUNT_AGE_DAYS * 24 * 60 * 60 * 1000;
    if (!createdAt || Date.now() - createdAt.getTime() > maxAgeMs) {
      return { allowed: false, reasonCode: 'ACCOUNT_TOO_OLD' };
    }

    if (wellnessCount > 0) {
      return { allowed: false, reasonCode: 'HAS_WELLNESS_DATA' };
    }

    return { allowed: true, reasonCode: null };
  }

  if (mode === 'superadmin') {
    if ((target.role === 'hr_admin' || target.role === 'tenant_admin') && confirmAdmin !== true) {
      return { allowed: false, reasonCode: 'ADMIN_CONFIRM_REQUIRED' };
    }
    return { allowed: true, reasonCode: null };
  }

  return { allowed: false, reasonCode: 'FORBIDDEN' };
}

/**
 * Atomically removes a user account, frees their tenant seat, unlinks invites,
 * and appends a privacy-preserving AuditLog entry.
 *
 * @param {object} params
 * @param {object} params.target - Target user document
 * @param {object} [params.actor] - { user_id, role, mode }
 * @param {string} params.reason - Reason for removal (5-300 chars)
 * @returns {Promise<{ deletedWellnessLogs: number, deletedNotifications: number, unlinkedInvites: number, seatFreed: boolean }>}
 */
async function removeUser({ target, actor = {}, reason }) {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  return await withTransaction(async (session) => {
    const opts = session ? { session } : {};

    const wellnessRes = await PersonalWellnessLog.deleteMany({ user_id: target.user_id }, opts);
    const notifRes = await PendingNotification.deleteMany({ user_id: target.user_id }, opts);

    // Decrement usage_count only when > 0, and clear used_by_user_id
    const inviteDecRes = await Invitation.updateMany(
      { used_by_user_id: target.user_id, usage_count: { $gt: 0 } },
      { $set: { used_by_user_id: null }, $inc: { usage_count: -1 } },
      opts
    );
    const inviteClearRes = await Invitation.updateMany(
      { used_by_user_id: target.user_id, usage_count: { $lte: 0 } },
      { $set: { used_by_user_id: null, usage_count: 0 } },
      opts
    );

    let seatFreed = false;
    if (target.company_id) {
      const tenantRes = await Tenant.updateOne(
        { company_id: target.company_id, used_seats: { $gt: 0 } },
        { $inc: { used_seats: -1 } },
        opts
      );
      seatFreed = (tenantRes?.modifiedCount || tenantRes?.nModified || 0) > 0;
    }

    await User.deleteOne({ user_id: target.user_id }, opts);

    const deletedWellnessLogs = wellnessRes?.deletedCount || 0;
    const deletedNotifications = notifRes?.deletedCount || 0;
    const unlinkedInvites =
      (inviteDecRes?.modifiedCount || inviteDecRes?.nModified || 0) +
      (inviteClearRes?.modifiedCount || inviteClearRes?.nModified || 0);

    await AuditLog.append(
      {
        company_id: target.company_id || 'system',
        actor_user_id: (actor && actor.user_id) || 'system-admin-key',
        actor_role: (actor && actor.role) || 'super_admin',
        event_type: 'user_removed',
        event_payload: {
          removed_user_id: target.user_id,
          removed_role: target.role,
          department_id: target.department_id || 'unassigned',
          reason: cleanReason,
          deleted_wellness_logs: deletedWellnessLogs,
          deleted_notifications: deletedNotifications,
          mode: (actor && actor.mode) || 'superadmin',
        },
      },
      opts
    );

    return {
      deletedWellnessLogs,
      deletedNotifications,
      unlinkedInvites,
      seatFreed,
    };
  });
}

module.exports = {
  HR_MAX_ACCOUNT_AGE_DAYS,
  findUserByEmail,
  checkRemovalAllowed,
  removeUser,
};
