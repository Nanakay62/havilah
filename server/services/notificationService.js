'use strict';

const logger = require('../utils/logger');

/**
 * Enterprise Push & Multi-Channel Notification Service.
 * Supports Firebase Cloud Messaging (FCM), APNs, and transactional alerts.
 */
class NotificationService {
  constructor() {
    this.fcmEnabled = Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_PRIVATE_KEY);
    this.client = null;

    if (this.fcmEnabled) {
      try {
        const admin = require('firebase-admin');
        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({
              projectId: process.env.FIREBASE_PROJECT_ID,
              clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
              privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            }),
          });
        }
        this.client = admin.messaging();
        logger.info('[NotificationService] FCM push provider initialized');
      } catch (err) {
        logger.warn({ err: err.message }, '[NotificationService] Could not initialize Firebase Admin SDK');
        this.fcmEnabled = false;
      }
    }
  }

  /**
   * Dispatches a mobile push notification to a device registration token.
   * @param {string} deviceToken - Target FCM / APNs device token
   * @param {{ title: string, body: string, data?: Record<string, string> }} payload
   * @returns {Promise<{ sent: boolean, id?: string, error?: string }>}
   */
  async sendPushNotification(deviceToken, { title, body, data = {} }) {
    if (!deviceToken || typeof deviceToken !== 'string') {
      return { sent: false, error: 'INVALID_DEVICE_TOKEN' };
    }

    if (!this.fcmEnabled || !this.client) {
      logger.info({ deviceToken: deviceToken.slice(0, 8) + '...' }, '[NotificationService] Push skipped (FCM not configured)');
      return { sent: false, error: 'FCM_NOT_CONFIGURED' };
    }

    try {
      const response = await this.client.send({
        token: deviceToken,
        notification: { title, body },
        data,
      });
      logger.info({ messageId: response }, '[NotificationService] Push successfully delivered');
      return { sent: true, id: response };
    } catch (err) {
      logger.error({ err: err.message }, '[NotificationService] Failed to deliver push notification');
      return { sent: false, error: err.message };
    }
  }
}

module.exports = new NotificationService();
