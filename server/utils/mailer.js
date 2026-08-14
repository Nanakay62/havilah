const dns = require('dns');
const nodemailer = require('nodemailer');
require('dotenv').config();

// Ensure Node.js resolves IPv4 first to prevent ENETUNREACH errors on cloud container networks
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

// Reusable Nodemailer transporter backed by Gmail SMTP with forced IPv4
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  family: 4, // Force IPv4 to eliminate IPv6 ENETUNREACH errors
  auth: {
    user: process.env.GMAIL_USER || 'nanakwamedickson62@gmail.com',
    pass: (process.env.GMAIL_APP_PASSWORD || 'kyck buvc yrcq aqjb').replace(/\s+/g, ''),
  },
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});

/**
 * Universal email delivery helper
 * @param {Object} options - { to, subject, html, from }
 */
async function sendEmail({ to, subject, html, from }) {
  try {
    const recipientList = Array.isArray(to) ? to.join(', ') : to;
    const sender = from || `"Havilah Health" <${process.env.GMAIL_USER || 'nanakwamedickson62@gmail.com'}>`;

    const mailOptions = {
      from: sender,
      to: recipientList,
      subject,
      html,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`✉️ Email successfully delivered to ${recipientList} (Message ID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ Email Delivery Error (${to}):`, error.message || error);
    return { success: false, error: error.message || error };
  }
}

module.exports = { sendEmail, transporter };
