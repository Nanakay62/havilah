const nodemailer = require('nodemailer');
require('dotenv').config();

// Reusable Nodemailer transporter backed by Gmail SMTP
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER || 'nanakwamedickson62@gmail.com',
    pass: (process.env.GMAIL_APP_PASSWORD || 'kyck buvc yrcq aqjb').replace(/\s+/g, ''),
  },
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
