'use strict';

const { sendEmail } = require('./mailer');

const CLINICAL_EMAIL = process.env.DEFAULT_CLINICAL_PARTNER_EMAIL || 'clarke.edith@gmail.com';
const CLINICAL_HOTLINE = process.env.DEFAULT_CLINICAL_HOTLINE || '0551022714';
const NOTIFICATION_RECIPIENT = process.env.DEFAULT_NOTIFICATION_RECIPIENT || 'clarke.edith@gmail.com';

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
 * Sends a structured clinical referral dispatch email to FZ Safety and Health.
 * @param {object} opts
 * @param {string} opts.referenceCode - Reference code (e.g. REF-A3X9K2)
 * @param {string} [opts.patientName] - Employee / Patient name
 * @param {string} [opts.patientContact] - Phone or Email contact info
 * @param {string} [opts.contactInfo] - Alias for contact info
 * @param {string} [opts.patientEmail] - Alias for email
 * @param {string} [opts.departmentName] - Human-readable department name
 * @param {string} [opts.department] - Alias for department name
 * @param {string} [opts.topic] - Intake reason / consultation topic
 * @param {string} [opts.preferredDate] - Preferred appointment date
 * @param {string} [opts.preferredTime] - Preferred contact / appointment time
 * @param {string} [opts.notes] - Additional optional notes
 * @param {string} [opts.to] - Override recipient (defaults to clarke.edith@gmail.com)
 */
async function sendClinicalDispatch({ referenceCode, patientName, patientContact, contactInfo, patientEmail, department, departmentName, topic, preferredDate, preferredTime, notes, to }) {
  const recipient = to || process.env.CLINICAL_INTAKE_EMAIL || 'clarke.edith@gmail.com';
  const resolvedPatientName = patientName || 'Not provided';
  const resolvedContact = patientContact || contactInfo || patientEmail || 'Not provided';
  const resolvedDepartment = departmentName || department || 'General Staff';
  const resolvedTopic = topic || 'General Clinical Consultation Intake Request';
  
  let resolvedSchedule = 'As soon as available';
  if (preferredDate && preferredTime && preferredTime !== 'As soon as available') {
    resolvedSchedule = `${preferredDate} at ${preferredTime}`;
  } else if (preferredDate) {
    resolvedSchedule = `${preferredDate} (${preferredTime || 'Any time'})`;
  } else if (preferredTime) {
    resolvedSchedule = preferredTime;
  }

  const timestamp = new Date().toISOString();

  const html = `
    <div style="background-color: #000000; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0a0a0e; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #222228;">
        <div style="background-color: #111116; border-bottom: 1px solid #222228; padding: 24px 32px;">
          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">🏥 FZ Safety & Health - Clinical Referral Intake</h1>
          <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Havilah Occupational Health Intake System</p>
        </div>
        <div style="padding: 24px 32px;">
          <div style="background-color: #131318; border: 1px solid #222228; padding: 14px 18px; border-radius: 8px; margin-bottom: 20px;">
            <strong style="color: #2dd4bf; font-size: 14px; display: block; margin-bottom: 2px;">Direct Patient Intake Request Received</strong>
            <p style="margin: 0; font-size: 12px; color: #94a3b8;">Please assign a practitioner to contact this patient via their preferred method.</p>
          </div>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 9px 0; color: #94a3b8; width: 160px; font-weight: 600;">Reference Code</td><td style="padding: 9px 0; font-weight: 700; color: #2dd4bf; font-family: monospace; font-size: 15px;">${referenceCode}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Patient Name</td><td style="padding: 9px 0; font-weight: 700; color: #ffffff;">${resolvedPatientName}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Contact Phone/Email</td><td style="padding: 9px 0; font-weight: 700; color: #38bdf8;">${resolvedContact}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Department</td><td style="padding: 9px 0; color: #e2e8f0; font-weight: 600;">${resolvedDepartment}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Consultation Topic</td><td style="padding: 9px 0; color: #f8fafc; font-weight: 600;">${resolvedTopic}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Preferred Schedule</td><td style="padding: 9px 0; color: #e2e8f0;">${resolvedSchedule}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Submitted At</td><td style="padding: 9px 0; color: #94a3b8; font-size: 12px;">${timestamp}</td></tr>
          </table>
          ${notes ? `<div style="margin-top: 20px; padding: 16px; background-color: #131318; border: 1px solid #222228; border-radius: 8px;"><p style="margin: 0 0 6px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Additional Notes</p><p style="margin: 0; line-height: 1.6; color: #f1f5f9;">${notes}</p></div>` : ''}
          <div style="margin-top: 24px; padding: 14px 18px; background-color: #131318; border: 1px solid #222228; border-radius: 8px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
            <strong style="color: #cbd5e1;">🔒 Employer Privacy Guarantee:</strong> This intake request is dispatched strictly to FZ Safety & Health. Employer/HR dashboards will NEVER receive this individual patient contact data.
          </div>
        </div>
        <div style="padding: 16px 32px; background-color: #070709; border-top: 1px solid #1a1a1f; font-size: 11px; color: #64748b; text-align: center;">
          FZ Safety & Health Helpline: ${CLINICAL_HOTLINE} &bull; Powered by Havilah Compliance Platform
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to: recipient,
    subject: `🏥 FZ Safety Clinical Referral [${referenceCode}] - Patient: ${resolvedPatientName}`,
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
 * @param {string} [opts.to] - Override recipient
 */
async function sendWhistleblowerAlert({ reportId, category, description, urgency, companyName, to }) {
  const recipient = to || CLINICAL_EMAIL;
  const timestamp = new Date().toISOString();

  const categoryLabels = {
    harassment: 'Harassment',
    unsafe_conditions: 'Unsafe Working Conditions',
    systemic_burnout: 'Systemic Burnout',
    discrimination: 'Discrimination',
    retaliation: 'Retaliation',
    other: 'Other Workplace Hazard'
  };
  const resolvedCategory = categoryLabels[category] || (category || '').replace(/_/g, ' ');

  const urgencyColors = {
    critical: '#ef4444',
    urgent: '#f59e0b',
    standard: '#818cf8'
  };
  const color = urgencyColors[urgency] || urgencyColors.standard;

  const html = `
    <div style="background-color: #000000; padding: 32px 12px; font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #0a0a0e; color: #e2e8f0; border-radius: 12px; overflow: hidden; border: 1px solid #222228;">
        <div style="background-color: #111116; border-bottom: 1px solid #222228; padding: 24px 32px;">
          <h1 style="margin: 0; color: #ffffff; font-size: 20px; font-weight: 700;">🛡️ Anonymous Hazard Escalation Report</h1>
          <p style="margin: 4px 0 0; color: #94a3b8; font-size: 13px;">Whistleblower Protection - Confidential</p>
        </div>
        <div style="padding: 24px 32px;">
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 9px 0; color: #94a3b8; width: 140px; font-weight: 600;">Report ID</td><td style="padding: 9px 0; font-weight: 700; color: #a78bfa; font-family: monospace; font-size: 15px;">${reportId}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Category</td><td style="padding: 9px 0; font-weight: 700; color: #ffffff;">${resolvedCategory}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Urgency</td><td style="padding: 9px 0; color: ${color}; font-weight: 700; text-transform: uppercase;">${urgency}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Organization</td><td style="padding: 9px 0; color: #e2e8f0; font-weight: 600;">${companyName || 'Confidential'}</td></tr>
            <tr><td style="padding: 9px 0; color: #94a3b8; font-weight: 600;">Received At</td><td style="padding: 9px 0; color: #94a3b8; font-size: 12px;">${timestamp}</td></tr>
          </table>
          
          <!-- Hazard Description Card (Clean Dark Card, No Colored Edge) -->
          <div style="margin-top: 20px; padding: 16px; background-color: #131318; border: 1px solid #222228; border-radius: 8px;">
            <p style="margin: 0 0 6px; color: #94a3b8; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">Hazard Description & Incident Details</p>
            <p style="margin: 0; line-height: 1.6; color: #f1f5f9; white-space: pre-wrap; font-size: 13.5px;">${description || 'No additional narrative provided.'}</p>
          </div>

          <div style="margin-top: 24px; padding: 14px 18px; background-color: #131318; border: 1px solid #222228; border-radius: 8px; font-size: 12px; color: #94a3b8; line-height: 1.5;">
            <strong style="color: #cbd5e1;">🔒 Anonymity Guarantee:</strong> This report was submitted through the Havilah Anonymous Vault. No IP addresses, user IDs, or identifying metadata have been stored. The submitter's identity is structurally unrecoverable.
          </div>
        </div>
        <div style="padding: 16px 32px; background-color: #070709; border-top: 1px solid #1a1a1f; font-size: 11px; color: #64748b; text-align: center;">
          Clinical Hotline: ${CLINICAL_HOTLINE} &bull; Havilah Whistleblower Protection System
        </div>
      </div>
    </div>
  `;

  return sendMail({
    to: recipient,
    subject: `🛡️ Anonymous Hazard Report ${reportId} - ${(urgency || 'standard').toUpperCase()} Priority`,
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
