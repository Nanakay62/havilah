const dns = require('dns');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Ensure Node.js resolves IPv4 first to prevent ENETUNREACH errors on cloud container networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Strict IPv4 resolver to guarantee IPv6 is never returned in cloud container environments
function lookupIPv4(hostname, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  dns.lookup(hostname, { ...options, family: 4 }, (err, address, family) => {
    if (err) return callback(err);
    if (options && options.all) {
      return callback(null, [{ address, family: 4 }]);
    }
    callback(null, address, 4);
  });
}

const smtpHost = process.env.SMTP_HOST || 'smtp.gmail.com';
const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER || 'nanakwamedickson62@gmail.com';
const smtpPass = (process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD || 'kyck buvc yrcq aqjb').replace(/\s+/g, '');
const configuredPort = parseInt(process.env.SMTP_PORT, 10) || 587;
const isSecure = process.env.SMTP_SECURE === 'true' || configuredPort === 465;

// Primary Transporter (Port 587 with STARTTLS by default with strict IPv4 lookup)
const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: configuredPort,
  secure: isSecure,
  requireTLS: !isSecure,
  lookup: lookupIPv4,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    servername: smtpHost,
    rejectUnauthorized: false
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 25000,
});

// Secondary Fallback Transporter (Port 465 SSL with strict IPv4 lookup)
const fallbackTransporter = nodemailer.createTransport({
  host: smtpHost,
  port: configuredPort === 587 ? 465 : 587,
  secure: configuredPort === 587,
  requireTLS: configuredPort !== 587,
  lookup: lookupIPv4,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
  tls: {
    servername: smtpHost,
    rejectUnauthorized: false
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 25000,
});

/**
 * Universal email delivery helper with automatic retry, dual-port fallback, and individual recipient addressing
 * @param {Object} options - { to, subject, html, from }
 */
async function sendEmail({ to, subject, html, from }) {
  const recipients = (Array.isArray(to) ? to : [to])
    .flatMap(item => typeof item === 'string' ? item.split(/[\s,;]+/) : item)
    .map(e => (typeof e === 'string' ? e.trim() : ''))
    .filter(e => e && e.includes('@'));

  if (recipients.length === 0) {
    return { success: false, error: 'No valid recipient email addresses provided.' };
  }

  const sender = from || `"Havilah Compliance" <${smtpUser}>`;
  const results = [];

  for (const recipient of recipients) {
    const mailOptions = {
      from: sender,
      to: recipient,
      subject,
      html,
    };

    try {
      const info = await transporter.sendMail(mailOptions);
      console.log(`✉️ Email successfully delivered to ${recipient} (Message ID: ${info.messageId})`);
      results.push({ recipient, success: true, messageId: info.messageId });
    } catch (primaryErr) {
      console.warn(`[Mailer] Primary dispatch to ${recipient} failed (${primaryErr.message}). Trying fallback transport...`);
      try {
        const fallbackInfo = await fallbackTransporter.sendMail(mailOptions);
        console.log(`✉️ Email delivered via fallback transport to ${recipient} (Message ID: ${fallbackInfo.messageId})`);
        results.push({ recipient, success: true, messageId: fallbackInfo.messageId });
      } catch (fallbackErr) {
        console.error(`❌ Email Delivery Error (${recipient}):`, fallbackErr.message || fallbackErr);
        results.push({ recipient, success: false, error: fallbackErr.message || fallbackErr });
      }
    }
  }

  const allSuccessful = results.every(r => r.success);
  return {
    success: allSuccessful,
    results,
    messageId: results[0]?.messageId
  };
}

module.exports = { sendEmail, transporter };
