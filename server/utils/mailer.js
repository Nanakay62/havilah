'use strict';

const { BrevoClient } = require('@getbrevo/brevo');
require('dotenv').config();

let brevoClient = null;
function getBrevoClient() {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) return null;
  if (!brevoClient) {
    brevoClient = new BrevoClient({ apiKey });
  }
  return brevoClient;
}

const DEFAULT_SENDER = {
  email: process.env.BREVO_SENDER_EMAIL || 'nanakwamedickson62@gmail.com',
  name: process.env.BREVO_SENDER_NAME || 'Havilah Health',
};

/**
 * Universal email delivery helper powered by Brevo Transactional Email REST API.
 * Completely eliminates SMTP port blocks, IPv6 ENETUNREACH, and connection timeouts on cloud hosts (Render, AWS, etc.).
 *
 * @param {Object} options
 * @param {string|string[]} options.to - Single email string, comma-separated string, or array of emails
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - HTML content
 * @param {string|object} [options.from] - Custom sender
 * @returns {Promise<{success: boolean, messageId?: string, error?: string}>}
 */
async function sendEmail({ to, subject, html, from }) {
  const rawList = Array.isArray(to) ? to : [to];
  const recipients = rawList
    .flatMap(item => typeof item === 'string' ? item.split(/[\s,;]+/) : item)
    .map(email => (typeof email === 'string' ? email.trim() : ''))
    .filter(email => email && email.includes('@'))
    .map(email => ({ email }));

  if (recipients.length === 0) {
    console.warn('[Brevo] No valid recipient email addresses provided.');
    return { success: false, error: 'No valid recipient email addresses provided.' };
  }

  let sender = DEFAULT_SENDER;
  if (from) {
    if (typeof from === 'string') {
      const match = from.match(/^(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)$/);
      if (match) {
        sender = { name: match[1] || 'Havilah Health', email: match[2] };
      } else {
        sender = { email: from, name: 'Havilah Health' };
      }
    } else if (typeof from === 'object' && from.email) {
      sender = from;
    }
  }

  const client = getBrevoClient();
  if (!client) {
    console.error('[Brevo] BREVO_API_KEY environment variable is not configured on server.');
    return { success: false, error: 'BREVO_API_KEY is not configured on server.' };
  }

  const results = [];
  for (const recipient of recipients) {
    try {
      const response = await client.transactionalEmails.sendTransacEmail({
        subject,
        htmlContent: html,
        sender,
        to: [recipient],
      });
      const messageId = response?.messageId || response?.body?.messageId || 'ok';
      console.log(`✉️ [Brevo] Delivered to ${recipient.email} (id: ${messageId})`);
      results.push({ recipient: recipient.email, success: true, messageId });
    } catch (err) {
      const errMsg = err.response?.body?.message || err.message || String(err);
      console.error(`❌ [Brevo] Delivery failed to ${recipient.email}:`, errMsg);
      results.push({ recipient: recipient.email, success: false, error: errMsg });
    }
  }

  const allSuccessful = results.some(r => r.success);
  return {
    success: allSuccessful,
    results,
    messageId: results.find(r => r.success)?.messageId,
    error: results.find(r => !r.success)?.error
  };
}

module.exports = { sendEmail };
