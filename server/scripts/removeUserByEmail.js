/**
 * Havilah - Remove Registered User By Email
 * File: server/scripts/removeUserByEmail.js
 *
 * Removes an employee account so the same email can register again
 * (e.g. they registered with the wrong activation code / company / department).
 *
 * Uses the shared userRemovalService so CLI and dashboard removals follow
 * identical rules and write to the AuditLog.
 *
 * Usage:
 *   node server/scripts/removeUserByEmail.js <email> [--company <company_id>] [--reason "<text>"] [--yes] [--allow-admin]
 */

'use strict';

const mongoose = require('mongoose');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Invitation = require('../models/Invitation');
const PendingNotification = require('../models/PendingNotification');
const {
  findUserByEmail,
  checkRemovalAllowed,
  removeUser,
} = require('../services/userRemovalService');

function getFlagValue(args, flag) {
  const idx = args.indexOf(flag);
  if (idx !== -1 && idx + 1 < args.length) {
    return args[idx + 1];
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const valueFlags = new Set(['--company', '--reason']);
  const email = args.find((a, i) => !a.startsWith('-') && !valueFlags.has(args[i - 1]));
  const companyFilter = getFlagValue(args, '--company');
  const reasonArg = getFlagValue(args, '--reason');
  const confirm = args.includes('--yes') || args.includes('-y');
  const allowAdmin = args.includes('--allow-admin');

  if (!email || !email.includes('@')) {
    console.log(
      'Usage: node server/scripts/removeUserByEmail.js <email> [--company <company_id>] [--reason "<text>"] [--yes] [--allow-admin]'
    );
    process.exitCode = 1;
    return;
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is missing from server/.env');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    const normalised = email.trim().toLowerCase();
    const lookup = await findUserByEmail(normalised);

    if (!lookup) {
      console.log(`No account found for ${normalised}. They can already register.`);
      return;
    }

    const { user, companyName, departmentName, wellnessCount } = lookup;
    const notifCount = await PendingNotification.countDocuments({ user_id: user.user_id });
    const invites = await Invitation.find({ used_by_user_id: user.user_id });

    console.log('\nAccount found:');
    console.log(`  user_id       : ${user.user_id}`);
    console.log(`  name          : ${user.full_name}`);
    console.log(`  role / status : ${user.role} / ${user.status}`);
    console.log(`  company       : ${companyName} (${user.company_id})`);
    console.log(`  department    : ${departmentName} (${user.department_id})`);
    console.log(`  created_at    : ${user.created_at ? user.created_at.toISOString() : '-'}`);
    console.log(`  last_login_at : ${user.last_login_at ? user.last_login_at.toISOString() : 'never'}`);
    console.log(`  wellness logs : ${wellnessCount}`);
    console.log(`  pending notifs: ${notifCount}`);
    console.log(`  invites used  : ${invites.map((i) => i.activation_code).join(', ') || 'none'}`);

    if (companyFilter && user.company_id !== companyFilter) {
      console.error(`\nAborting: user belongs to ${user.company_id}, not ${companyFilter}.`);
      process.exitCode = 1;
      return;
    }

    const check = checkRemovalAllowed({
      target: user,
      wellnessCount,
      actor: { user_id: 'cli-operator', role: 'cli' },
      mode: 'superadmin',
      confirmAdmin: allowAdmin,
    });

    if (!check.allowed) {
      if (check.reasonCode === 'ADMIN_CONFIRM_REQUIRED') {
        console.error(`\nAborting: user is '${user.role}'. Re-run with --allow-admin if you are sure.`);
      } else {
        console.error(`\nAborting: removal not allowed (${check.reasonCode}).`);
      }
      process.exitCode = 1;
      return;
    }

    if (!confirm) {
      console.log('\nDRY RUN - nothing deleted. Re-run with --yes --reason "<reason>" to remove this account.');
      return;
    }

    const cleanReason = typeof reasonArg === 'string' ? reasonArg.trim() : '';
    if (cleanReason.length < 5 || cleanReason.length > 300) {
      console.error('\nAborting: --reason "<text>" (5-300 characters) is required when removing an account.');
      process.exitCode = 1;
      return;
    }

    await removeUser({
      target: user,
      actor: { user_id: 'cli-operator', role: 'cli', mode: 'superadmin' },
      reason: cleanReason,
    });

    console.log(`\nRemoved ${normalised}. Seat freed. They can now register again.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exitCode = 1;
});
