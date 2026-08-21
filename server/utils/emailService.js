'use strict';

const { sendEmail } = require('./mailer');

const CLINICAL_EMAIL = process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'nanakwamedickson62@gmail.com';
const CLINICAL_HOTLINE = process.env.DEFAULT_CLINICAL_HOTLINE || '0551022714';
const NOTIFICATION_RECIPIENT = process.env.DEFAULT_NOTIFICATION_RECIPIENT || 'nanakwamedickson62@gmail.com';

/**
 * Sends email using Brevo Transactional Email REST API.
 * @param {object} options
 * @param {string|string[]} options.to - Recipient email or array of emails
 * @param {string} options.subject - Email subject line
 * @param {string} options.html - Email HTML content
 * @param {string} [options.from] - Sender address
 */
async function sendMail({ to, subject, html, from }) {
  return sendEmail({ to, subject, html, from });
}

/**
 * Sends a Zero-Knowledge clinical referral notification alert to the designated Medical Assessor.
 * Strictly contains NO patient name, NO phone/email contact, and NO clinical notes.
 *
 * @param {object} opts
 * @param {string} opts.referenceCode - Referral reference code (e.g. 'REF-A3X9K2')
 * @param {string} [opts.companyName] - Organization / Tenant name
 * @param {string} [opts.to] - Assessor email recipient
 */
async function sendClinicalDispatch({ referenceCode, companyName, to }) {
  const recipient = to || process.env.CLINICAL_INTAKE_EMAIL || 'nanakwamedickson62@gmail.com';
  const resolvedCompany = companyName || 'Client Organization';
  const timestamp = new Date().toUTCString();

  const html = `
    <div style="background-color: #0f172a; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 580px; margin: 0 auto; background-color: #ffffff; color: #1e293b; border-radius: 14px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #0f766e, #0d9488); padding: 24px 32px; color: #ffffff;">
          <h1 style="margin: 0; color: #ffffff; font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
            🏥 Havilah Clinical Referral Alert
          </h1>
          <p style="margin: 4px 0 0; color: #ccfbf1; font-size: 12.5px;">Zero-Knowledge Confidential Patient Intake System</p>
        </div>

        <!-- Body -->
        <div style="padding: 28px 32px;">
          <p style="font-size: 15px; line-height: 1.6; color: #1e293b; margin-top: 0;">
            A new confidential occupational health referral (<strong>Ref: <span style="font-family: monospace; color: #0d9488; font-weight: 700;">${referenceCode}</span></strong>) has been submitted for company <strong>${resolvedCompany}</strong> and assigned to your clinical queue.
          </p>

          <!-- Zero-Knowledge Security Notice -->
          <div style="background-color: #f0fdfa; border-left: 4px solid #14b8a6; padding: 14px 16px; border-radius: 4px; margin: 20px 0;">
            <strong style="color: #0f766e; font-size: 13px; display: block; margin-bottom: 3px;">🔒 Patient Privacy &amp; Medical Compliance Guarantee:</strong>
            <p style="margin: 0; font-size: 12px; color: #334155; line-height: 1.5;">
              To prevent cleartext data exposure and maintain strict medical confidentiality (ISO 45003 / HIPAA / GDPR), patient identities, contact details, and clinical notes are <strong>never transmitted via email</strong>.
            </p>
          </div>

          <p style="font-size: 13.5px; color: #334155; margin-bottom: 24px; line-height: 1.5;">
            Please log into your Havilah Clinical Portal to decrypt and review patient intake details, access contact preferences, and manage the consultation lifecycle.
          </p>

          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="http://localhost:3000/clinical-portal.html" style="background: linear-gradient(135deg, #0d9488, #0f766e); color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 700; font-size: 13.5px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(13,148,136,0.3);">
              🩺 Access Clinical Hub &amp; Review Queue
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 14px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Assigned: ${timestamp} &bull; Havilah Occupational Health &amp; Clinical Referral Network
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to: recipient,
    subject: `🏥 New Clinical Referral Assigned [${referenceCode}]`,
    html
  });
}

/**
 * Sends a high-risk intervention alert email (no PII).
 * @param {object} opts
 * @param {string} opts.surveyType - Survey instrument (e.g. 'phq9', 'copsoq3')
 * @param {string} opts.severityBand - Risk level (e.g. 'severe', 'critical')
 * @param {string} [opts.department] - Anonymized department tag
 * @param {string} [opts.to] - Override recipient
 */
async function sendInterventionAlert({ surveyType, severityBand, department, to }) {
  const recipient = to || CLINICAL_EMAIL;
  const timestamp = new Date().toISOString();

  const html = `
    <div style="background-color: #000000; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0a0a0e; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #222228;">
        <div style="background-color: #111116; border-bottom: 1px solid #222228; padding: 24px 32px;">
          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">⚠️ High-Risk Intervention Alert</h1>
          <p style="margin: 4px 0 0; color: #f87171; font-size: 13px; font-weight: 600;">Automated Hazard Detection - Immediate Review Required</p>
        </div>
        <div style="padding: 24px 32px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 9px 0; color: #94a3b8; width: 140px; font-weight: 600;">Survey Type</td><td style="padding: 9px 0; font-weight: 700; color: #ffffff;">${(surveyType || '').toUpperCase()}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Severity Band</td><td style="padding: 9px 0; color: #ef4444; font-weight: 700;">${(severityBand || '').toUpperCase()}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Department</td><td style="padding: 9px 0; color: #e2e8f0;">${department || 'Anonymized'}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Detected At</td><td style="padding: 9px 0; color: #94a3b8; font-size: 12px;">${timestamp}</td></tr>
          </table>
          <div style="margin-top: 24px; padding: 14px 18px; background-color: #131318; border: 1px solid #222228; border-radius: 8px; font-size: 12px; color: #fca5a5; line-height: 1.5;">
            <strong style="color: #ef4444;">⚠️ Action Required:</strong> An anonymous assessment submission has triggered a high-severity alert. Please review departmental risk indicators and consider initiating a targeted intervention protocol.
          </div>
          <div style="margin-top: 12px; padding: 14px 18px; background-color: #131318; border: 1px solid #222228; border-radius: 8px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
            <strong style="color: #cbd5e1;">Privacy Notice:</strong> No personally identifiable information is included. This alert contains only aggregate risk indicators.
          </div>
        </div>
        <div style="padding: 16px 32px; background-color: #070709; border-top: 1px solid #1a1a1f; font-size: 11px; color: #64748b; text-align: center;">
          Clinical Hotline: ${CLINICAL_HOTLINE} &bull; Generated by Havilah Compliance Engine
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to: recipient,
    subject: `⚠️ HIGH-RISK ALERT - ${(surveyType || '').toUpperCase()} Severity: ${(severityBand || '').toUpperCase()}`,
    html
  });
}

/**
 * Sends an anonymized whistleblower hazard escalation alert.
 * @param {object} opts
 * @param {string} opts.reportId - Anonymous report reference ID
 * @param {string} opts.category - Hazard category code
 * @param {string} [opts.description] - Hazard description / incident narrative
 * @param {string} opts.urgency - Urgency level
 * @param {string} [opts.companyName] - Company name for context
/**
 * Sends a Zero-Knowledge whistleblower generic notification alert (ISO 37002 / GDPR / HIPAA compliant).
 * Strictly contains NO description, NO category, NO urgency, and NO PII.
 *
 * @param {object} opts
 * @param {string} opts.reportId - Tracking code reference (e.g. 'WBL-8A1C2D')
 * @param {string} [opts.companyName] - Organization name (optional)
 * @param {string} [opts.to] - Override recipient
 */
async function sendWhistleblowerAlert({ reportId, companyName, to }) {
  const recipient = to || process.env.WHISTLEBLOWER_NOTIFICATION_EMAIL || 'nanakwamedickson62@gmail.com';
  const timestamp = new Date().toUTCString();

  const html = `
    <div style="background-color: #0f172a; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 560px; margin: 0 auto; background-color: #ffffff; color: #1e293b; border-radius: 14px; overflow: hidden; border: 1px solid #cbd5e1; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.1);">
        
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #1e1b4b, #312e81); padding: 24px 32px; color: #ffffff;">
          <h1 style="margin: 0; color: #ffffff; font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 8px;">
            🛡️ Havilah Confidential Security Alert
          </h1>
          <p style="margin: 4px 0 0; color: #c7d2fe; font-size: 12px;">Zero-Knowledge Whistleblower Notification System</p>
        </div>

        <!-- Body -->
        <div style="padding: 28px 32px;">
          <p style="font-size: 15px; line-height: 1.6; color: #1e293b; margin-top: 0;">
            A new confidential report (<strong>Ref: <span style="font-family: monospace; color: #4f46e5;">${reportId}</span></strong>) has been submitted to the secure portal.
          </p>

          <!-- Zero-Knowledge Security Callout -->
          <div style="background-color: #f1f5f9; border-left: 4px solid #6366f1; padding: 14px 16px; border-radius: 4px; margin: 20px 0;">
            <strong style="color: #1e293b; font-size: 13px; display: block; margin-bottom: 3px;">🔒 Zero-Knowledge Compliance Standard (ISO 37002 / GDPR / HIPAA):</strong>
            <p style="margin: 0; font-size: 12px; color: #475569; line-height: 1.5;">
              To prevent cleartext exposure and unauthorized leaks in transit, confidential incident details, categories, and descriptions are <strong>never transmitted via email</strong>.
            </p>
          </div>

          <p style="font-size: 13.5px; color: #334155; margin-bottom: 24px; line-height: 1.5;">
            Please log into your authorized Havilah compliance dashboard to decrypt and review the full filing and exchange secure, two-way communications with the reporter.
          </p>

          <div style="text-align: center; margin: 28px 0 16px;">
            <a href="http://localhost:3000/login.html" style="background: linear-gradient(135deg, #6366f1, #4f46e5); color: #ffffff; text-decoration: none; padding: 13px 28px; border-radius: 8px; font-weight: 700; font-size: 13.5px; display: inline-block; box-shadow: 0 4px 6px -1px rgba(99,102,241,0.3);">
              🔐 Authenticate &amp; Access Dashboard
            </a>
          </div>
        </div>

        <!-- Footer -->
        <div style="padding: 14px 32px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; text-align: center;">
          Received: ${timestamp} &bull; Havilah Whistleblower Protection Engine
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to: recipient,
    subject: `🛡️ New Confidential Report Received [Ref: ${reportId}] - Dashboard Access Required`,
    html
  });
}

/**
 * Sends a welcome email containing HR credentials and activation codes to newly provisioned HR Admin.
 */
async function sendHrWelcomeEmail({ to, companyName, password, loginUrl, activationUrl, activationCodes }) {
  const codesListHtml = (activationCodes || []).map(c => `<li style="font-family: monospace; font-weight: bold; color: #34d399; margin-bottom: 4px;">${c}</li>`).join('');

  const html = `
    <div style="background-color: #000000; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0a0a0e; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #222228;">
        <div style="background-color: #111116; border-bottom: 1px solid #222228; padding: 24px 32px;">
          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">🎉 Welcome to Havilah Platform</h1>
          <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">ISO 45003 Workplace Compliance & Psychosocial Risk Platform</p>
        </div>
        <div style="padding: 24px 32px;">
          <p style="font-size: 14px; line-height: 1.6; color: #cbd5e1; margin-top: 0;">
            Hello HR Administrator,<br><br>
            A new tenant account has been provisioned for <strong>${companyName}</strong>. You can now log into your HR Compliance Portal to manage your organization's risk assessment cycles.
          </p>

          <!-- Login Credentials Card -->
          <div style="background-color: #131318; border: 1px solid #222228; border-radius: 8px; padding: 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 12px 0; color: #38bdf8; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">🔑 HR Admin Login Credentials</h3>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Portal URL:</strong> <a href="${loginUrl || 'https://havilahss.netlify.app/login.html'}" style="color: #38bdf8; text-decoration: underline;">${loginUrl || 'https://havilahss.netlify.app/login.html'}</a></p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Email:</strong> <span style="font-family: monospace; font-weight: bold; color: #ffffff;">${to}</span></p>
            <p style="margin: 6px 0; font-size: 14px;"><strong>Password:</strong> <span style="font-family: monospace; font-weight: bold; color: #ffffff;">${password}</span></p>
          </div>

          <!-- Activation Codes Card -->
          ${activationCodes && activationCodes.length > 0 ? `
          <div style="background-color: #131318; border: 1px solid #222228; border-radius: 8px; padding: 18px; margin: 20px 0;">
            <h3 style="margin: 0 0 10px 0; color: #34d399; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">🎫 Employee Activation Codes</h3>
            <p style="margin: 0 0 12px 0; font-size: 13px; color: #94a3b8;">Share these codes with participating employees to register at <a href="${activationUrl || 'https://havilahss.netlify.app/register.html'}" style="color: #38bdf8;">${activationUrl || 'https://havilahss.netlify.app/register.html'}</a>:</p>
            <ul style="margin: 0; padding-left: 20px; line-height: 1.8;">
              ${codesListHtml}
            </ul>
          </div>
          ` : ''}

          <p style="font-size: 12px; color: #64748b; margin-top: 24px; margin-bottom: 0;">
            For security, please log in and change your password upon your first access.
          </p>
        </div>
        <div style="padding: 16px 32px; background-color: #070709; border-top: 1px solid #1a1a1f; font-size: 11px; color: #64748b; text-align: center;">
          Powered by Havilah Compliance Platform
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to,
    subject: `🚀 Havilah Tenant Provisioned - HR Login Credentials for ${companyName}`,
    html
  });
}

module.exports = {
  sendMail,
  sendClinicalDispatch,
  sendInterventionAlert,
  sendWhistleblowerAlert,
  sendHrWelcomeEmail,
  CLINICAL_EMAIL,
  CLINICAL_HOTLINE,
  NOTIFICATION_RECIPIENT
};
