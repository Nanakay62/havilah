'use strict';

require('./testConfig');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const Tenant = require('../models/Tenant');
const User = require('../models/User');
const Report = require('../models/Report');
const PendingNotification = require('../models/PendingNotification');
const paystack = require('../utils/paystack');
const emailService = require('../utils/emailService');
const { encryptField } = require('../utils/crypto');
const {
  DEFAULT_CLIENT_ORIGIN,
  resolveAppBaseUrl,
  getAllowedOrigins,
  resolveWebSocketSignalUrl,
  getNotificationRecipients,
} = require('../utils/runtimeConfig');
const { schedulerInstance } = require('../scheduler/complianceScheduler');

const SECRET = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';

describe('Centralized Pilot Configuration (runtimeConfig)', () => {
  const savedEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    for (const key of [
      'APP_BASE_URL',
      'PUBLIC_ORIGIN',
      'CLIENT_ORIGIN',
      'ALLOWED_ORIGINS',
      'CLIENT_URL',
      'FRONTEND_URL',
      'API_PUBLIC_ORIGIN',
      'CALL_SIGNAL_URL',
      'RENDER',
      'WHISTLEBLOWER_NOTIFICATION_EMAIL',
      'DEFAULT_NOTIFICATION_RECIPIENT',
      'ADMIN_EMAIL',
      'SUPERADMIN_EMAIL',
      'CLINICAL_INTAKE_EMAIL',
      'DEFAULT_CLINICAL_PARTNER_EMAIL',
    ]) {
      if (savedEnv[key] !== undefined) process.env[key] = savedEnv[key];
      else delete process.env[key];
    }
  });

  it('resolves primary origin across APP_BASE_URL, comma-separated CLIENT_ORIGIN, and x-forwarded-host without localhost leaks', () => {
    process.env.CLIENT_ORIGIN = 'http://localhost:3000, https://custom.havilahhealth.com, https://www.havilahhealth.com';
    delete process.env.APP_BASE_URL;
    expect(resolveAppBaseUrl()).toBe('https://custom.havilahhealth.com');
    expect(getAllowedOrigins()).toContain('https://custom.havilahhealth.com');
    expect(getAllowedOrigins()).toContain('https://www.havilahhealth.com');

    delete process.env.APP_BASE_URL;
    delete process.env.PUBLIC_ORIGIN;
    delete process.env.CLIENT_ORIGIN;
    delete process.env.CLIENT_URL;
    delete process.env.FRONTEND_URL;
    const mockReq = {
      get: (h) => {
        if (h === 'x-forwarded-host') return 'portal.clientdomain.org';
        if (h === 'x-forwarded-proto') return 'https';
        return null;
      },
    };
    expect(resolveAppBaseUrl(mockReq)).toBe('https://portal.clientdomain.org');
    expect(resolveAppBaseUrl()).toBe(DEFAULT_CLIENT_ORIGIN);
  });

  it('dynamically derives WebSocket signal URL from active API host when CALL_SIGNAL_URL is unset', () => {
    delete process.env.CALL_SIGNAL_URL;
    delete process.env.API_PUBLIC_ORIGIN;
    process.env.RENDER = '1';
    const mockReq = {
      protocol: 'https',
      get: (h) => (h === 'host' ? 'api.havilahhealth.com' : null),
    };
    expect(resolveWebSocketSignalUrl(mockReq)).toBe('wss://api.havilahhealth.com/api/v1/calls/ws');
  });

  it('uses resolveAppBaseUrl for Paystack callback_url instead of API req.get(host)', async () => {
    process.env.APP_BASE_URL = 'https://havilahhealth.com';
    const hrToken = jwt.sign(
      { userId: 'hr-bill-1', companyId: 'comp-bill-1', role: 'hr_admin', status: 'active' },
      SECRET,
      { expiresIn: '1h' }
    );
    vi.spyOn(paystack, 'isConfigured').mockReturnValue(true);
    const initSpy = vi.spyOn(paystack, 'initializeTransaction').mockResolvedValue({
      authorization_url: 'https://checkout.paystack.com/xyz',
      access_code: 'ac_xyz',
      reference: 'ref_xyz',
    });
    vi.spyOn(Tenant, 'findOne').mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve({ company_id: 'comp-bill-1', lifecycle_state: 'active', locked_at: null }) }),
      then: (res) => res({ company_id: 'comp-bill-1', company_name: 'Pilot Corp', lifecycle_state: 'active' }),
    }));
    vi.spyOn(User, 'findOne').mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve({ user_id: 'hr-bill-1', status: 'active', role: 'hr_admin' }) }),
    }));

    const res = await request(app)
      .post('/api/v1/billing/initialize')
      .set('Host', 'havilah-api.onrender.com')
      .set('Authorization', `Bearer ${hrToken}`)
      .send({ tier: 'pro' });

    expect(res.status).toBe(200);
    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        callbackUrl: 'https://havilahhealth.com/dashboard?checkout=success',
      })
    );
  });

  it('uses resolveAppBaseUrl in complianceScheduler email links instead of localhost:3000', async () => {
    delete process.env.CLIENT_ORIGIN;
    process.env.APP_BASE_URL = 'https://havilah.dic20016.workers.dev';
    const enc = encryptField('worker@pilot.org');
    const mockNotif = {
      notification_id: 'notif-1',
      survey_type: 'phq9',
      user_email_iv: enc.iv,
      user_email_encrypted: enc.encrypted,
      user_email_tag: enc.authTag,
      retry_count: 0,
      save: vi.fn().mockResolvedValue(true),
    };
    vi.spyOn(PendingNotification, 'find').mockReturnValue({
      limit: () => Promise.resolve([mockNotif]),
    });
    const mailSpy = vi.spyOn(emailService, 'sendMail').mockResolvedValue({ success: true });

    await schedulerInstance.processPendingNotifications();
    expect(mailSpy).toHaveBeenCalledTimes(1);
    const htmlSent = mailSpy.mock.calls[0][0].html;
    expect(htmlSent).toContain('https://havilah.dic20016.workers.dev/app/dashboard.html');
    expect(htmlSent).not.toContain('localhost:3000');
  });

  it('returns null instead of unowned .app placeholder emails when notification env vars are absent', async () => {
    delete process.env.WHISTLEBLOWER_NOTIFICATION_EMAIL;
    delete process.env.DEFAULT_NOTIFICATION_RECIPIENT;
    delete process.env.ADMIN_EMAIL;
    delete process.env.SUPERADMIN_EMAIL;
    delete process.env.CLINICAL_INTAKE_EMAIL;
    delete process.env.DEFAULT_CLINICAL_PARTNER_EMAIL;

    expect(getNotificationRecipients()).toEqual({
      clinicalIntake: null,
      whistleblower: null,
      admin: null,
    });

    const clinicalResult = await emailService.sendClinicalDispatch({ referenceCode: 'REF-123' });
    expect(clinicalResult.skipped).toBe(true);

    vi.spyOn(Tenant, 'findOne').mockImplementation(() => ({
      select: () => ({ lean: () => Promise.resolve({ _id: '507f1f77bcf86cd799439088', company_id: 'comp-wb-1' }) }),
      then: (res) => res({ _id: '507f1f77bcf86cd799439088', company_id: 'comp-wb-1' }),
    }));
    vi.spyOn(Report, 'create').mockResolvedValue({ trackingCode: 'WBL-NORECIP1' });
    const sendSpy = vi.spyOn(emailService, 'sendWhistleblowerAlert').mockResolvedValue({ skipped: true });
    const wbRes = await request(app)
      .post('/api/v1/whistleblower/submit')
      .send({ tenantId: 'comp-wb-1', category: 'Ethics', urgency: 'Standard', description: 'Testing missing email env handling safely' });
    expect(wbRes.status).toBe(201);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});
