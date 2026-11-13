'use strict';

const MAX_SUPPORT_CONTACTS = 5;
const PHONE_VALUE_RE = /^\+?[0-9\s\-()]{3,30}$/;
const EMAIL_VALUE_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNSAFE_SCHEME_RE = /(?:https?:\/\/|javascript:|data:|vbscript:)/i;

/**
 * Strip HTML angle brackets and normalize whitespace to plain text.
 * Rejects URLs/scripts so HR support contacts stay plain phone/email entries.
 */
function toPlainText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Validate and sanitize an array of employer support contacts (max 5).
 * Returns { valid: true, contacts } or { valid: false, message }.
 */
function validateEmployerSupportContacts(input) {
  if (!Array.isArray(input)) {
    return { valid: false, message: 'Support contacts must be provided as an array.' };
  }
  if (input.length > MAX_SUPPORT_CONTACTS) {
    return { valid: false, message: `You can add at most ${MAX_SUPPORT_CONTACTS} workplace support contacts.` };
  }

  const sanitized = [];
  for (let i = 0; i < input.length; i++) {
    const raw = input[i];
    if (!raw || typeof raw !== 'object') {
      return { valid: false, message: `Contact #${i + 1} must be an object.` };
    }

    const label = toPlainText(raw.label);
    const phone = toPlainText(raw.phone);
    const email = toPlainText(raw.email).toLowerCase();
    const hours = toPlainText(raw.hours);

    if (!label) {
      return { valid: false, message: `Contact #${i + 1} requires a label.` };
    }
    if (label.length > 80) {
      return { valid: false, message: `Contact "${label.slice(0, 24)}..." label must be 80 characters or fewer.` };
    }
    if ([label, phone, email, hours].some((v) => UNSAFE_SCHEME_RE.test(v))) {
      return { valid: false, message: `Contact "${label}" contains disallowed link syntax. Enter plain text only.` };
    }
    if (!phone && !email) {
      return { valid: false, message: `Contact "${label}" must include a phone number or email address.` };
    }
    if (phone && (phone.length > 30 || !PHONE_VALUE_RE.test(phone))) {
      return { valid: false, message: `Contact "${label}" phone number is invalid.` };
    }
    if (email && (email.length > 120 || !EMAIL_VALUE_RE.test(email))) {
      return { valid: false, message: `Contact "${label}" email address is invalid.` };
    }
    if (hours && hours.length > 80) {
      return { valid: false, message: `Contact "${label}" hours must be 80 characters or fewer.` };
    }

    sanitized.push({ label, phone, email, hours });
  }

  return { valid: true, contacts: sanitized };
}

module.exports = {
  MAX_SUPPORT_CONTACTS,
  PHONE_VALUE_RE,
  EMAIL_VALUE_RE,
  validateEmployerSupportContacts,
};
