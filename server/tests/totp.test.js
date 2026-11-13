'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../server');
const User = require('../models/User');
const Tenant = require('../models/Tenant');
const Assessor = require('../models/Assessor');
const Doctor = require('../models/Doctor');
const { generateTotpSecret, generateTotpCode, verifyTotpCode, getOtpAuthUrl, generateRecoveryCodes, verifyAndConsumeRecoveryCode } = require('../utils/totp');

describe('RFC 6238 TOTP Two-Factor Authentication', () => {
  it('generates a valid 32-character Base32 secret', () => {
    const secret = generateTotpSecret();
    expect(typeof secret).toBe('string');
    expect(secret.length).toBe(32);
    expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
  });

  it('generates and verifies 6-digit TOTP code successfully', () => {
    const secret = generateTotpSecret();
    const code = generateTotpCode(secret);

    expect(typeof code).toBe('string');
    expect(code).toMatch(/^\d{6}$/);

    const isValid = verifyTotpCode(code, secret);
    expect(isValid).toBe(true);
  });

  it('rejects invalid or expired TOTP codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotpCode('000000', secret)).toBe(false);
    expect(verifyTotpCode('12345', secret)).toBe(false);
    expect(verifyTotpCode('', secret)).toBe(false);
    expect(verifyTotpCode(null, secret)).toBe(false);
  });

  it('formats standard otpauth URL for QR code generation', () => {
    const secret = 'JBSWY3DPEHPK3PXP';
    const url = getOtpAuthUrl({ issuer: 'Wellframe', accountName: 'admin@corp.com', secret });

    expect(url).toContain('otpauth://totp/Wellframe:admin%40corp.com');
    expect(url).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(url).toContain('algorithm=SHA1');
    expect(url).toContain('period=30');
  });

  it('generates 8 formatted single-use recovery codes and prevents replay after consumption', () => {
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
    expect(plainCodes).toHaveLength(8);
    expect(hashedCodes).toHaveLength(8);
    expect(plainCodes[0]).toMatch(/^[A-F0-9]{4}-[A-F0-9]{4}$/);

    const first = verifyAndConsumeRecoveryCode(plainCodes[0], hashedCodes);
    expect(first.valid).toBe(true);
    expect(first.remainingHashes).toHaveLength(7);

    // Replay of the same code must fail
    const replay = verifyAndConsumeRecoveryCode(plainCodes[0], first.remainingHashes);
    expect(replay.valid).toBe(false);
    expect(replay.remainingHashes).toHaveLength(7);
  });
});

describe('2FA Sign-In & Account Recovery (HR, SuperAdmin, Assessor)', () => {
  const originals = {};
  const passwordHash = bcrypt.hashSync('PilotSecure!2026', 4);
  let mockHrUser;
  let mockAssessor;

  beforeEach(() => {
    const secret = generateTotpSecret();
    const { plainCodes, hashedCodes } = generateRecoveryCodes(8);

    mockHrUser = {
      user_id: 'usr-hr-2fa-1',
      company_id: 'comp-2fa-1',
      department_id: 'dept-hr',
      role: 'hr_admin',
      status: 'active',
      full_name: 'HR Admin 2FA',
      passwordHash,
      totp_enabled: true,
      totp_secret: secret,
      totp_recovery_codes_hashes: [...hashedCodes],
      _plainRecoveryCodes: plainCodes,
      save: async function save() { return this; }
    };

    mockAssessor = {
      _id: '507f1f77bcf86cd799439022',
      name: 'Dr. Assessor 2FA',
      email: 'assessor2fa@fzsafety.com',
      organization: 'FZ Safety',
      passwordHash,
      active: true,
      totp_enabled: true,
      totp_secret: generateTotpSecret(),
      totp_recovery_codes_hashes: [...generateRecoveryCodes(4).hashedCodes],
      save: async function save() { return this; }
    };

    originals.userFindOne = User.findOne;
    originals.tenantFindOne = Tenant.findOne;
    originals.assessorFindOne = Assessor.findOne;
    originals.assessorFindById = Assessor.findById;
    originals.doctorFindOne = Doctor.findOne;

    Tenant.findOne = () => Promise.resolve({
      company_id: 'comp-2fa-1',
      lifecycle_state: 'active'
    });
    Doctor.findOne = () => Promise.resolve(null);
  });

  afterEach(() => {
    User.findOne = originals.userFindOne;
    Tenant.findOne = originals.tenantFindOne;
    Assessor.findOne = originals.assessorFindOne;
    Assessor.findById = originals.assessorFindById;
    Doctor.findOne = originals.doctorFindOne;
  });

  it('requires 2FA step on /api/v1/auth/login and completes sign-in via /login/verify-2fa with TOTP', async () => {
    User.findOne = (q) => {
      if (q && q.user_id === mockHrUser.user_id) return Promise.resolve(mockHrUser);
      return Promise.resolve(mockHrUser);
    };

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hr2fa@company.com', password: 'PilotSecure!2026' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requires_2fa).toBe(true);
    expect(loginRes.body.temp_token).toBeTruthy();
    expect(loginRes.body.token).toBeUndefined();

    const validTotp = generateTotpCode(mockHrUser.totp_secret);
    const verifyRes = await request(app)
      .post('/api/v1/auth/login/verify-2fa')
      .send({ temp_token: loginRes.body.temp_token, code: validTotp });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.token).toBeTruthy();
    expect(verifyRes.body.user.role).toBe('hr_admin');
  });

  it('allows single-use backup recovery code sign-in and rejects reuse', async () => {
    User.findOne = () => Promise.resolve(mockHrUser);

    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'hr2fa@company.com', password: 'PilotSecure!2026' });

    const recoveryCode = mockHrUser._plainRecoveryCodes[0];
    const okRes = await request(app)
      .post('/api/v1/auth/login/verify-2fa')
      .send({ temp_token: loginRes.body.temp_token, code: recoveryCode });

    expect(okRes.status).toBe(200);
    expect(okRes.body.token).toBeTruthy();
    expect(mockHrUser.totp_recovery_codes_hashes).toHaveLength(7);

    const replayRes = await request(app)
      .post('/api/v1/auth/login/verify-2fa')
      .send({ temp_token: loginRes.body.temp_token, code: recoveryCode });

    expect(replayRes.status).toBe(401);
    expect(replayRes.body.error).toBe('INVALID_2FA_CODE');
  });

  it('requires 2FA on /api/v1/assessor/login and issues Clinical Portal JWT after TOTP verification', async () => {
    Assessor.findOne = () => Promise.resolve(mockAssessor);
    Assessor.findById = () => Promise.resolve(mockAssessor);

    const loginRes = await request(app)
      .post('/api/v1/assessor/login')
      .send({ email: mockAssessor.email, password: 'PilotSecure!2026' });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.requires_2fa).toBe(true);
    expect(loginRes.body.temp_token).toBeTruthy();

    const code = generateTotpCode(mockAssessor.totp_secret);
    const verifyRes = await request(app)
      .post('/api/v1/assessor/login/verify-2fa')
      .send({ temp_token: loginRes.body.temp_token, code });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.success).toBe(true);
    expect(verifyRes.body.token).toBeTruthy();
    expect(verifyRes.body.assessor.totp_enabled).toBe(true);
  });

  it('supports password recovery (/forgot-password and /reset-password) for Medical Assessors', async () => {
    User.findOne = () => Promise.resolve(null);
    Assessor.findOne = (q) => {
      if (q && q.email === mockAssessor.email) return Promise.resolve(mockAssessor);
      if (q && q.password_reset_token_hash === mockAssessor.password_reset_token_hash) {
        return Promise.resolve(mockAssessor);
      }
      return Promise.resolve(null);
    };

    const forgotRes = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: mockAssessor.email });

    expect(forgotRes.status).toBe(200);
    expect(forgotRes.body.success).toBe(true);
    expect(mockAssessor.password_reset_token_hash).toBeTruthy();
    expect(forgotRes.body.resetToken).toBeTruthy();

    const resetRes = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: forgotRes.body.resetToken, newPassword: 'NewClinicalPass!2026' });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.success).toBe(true);
    expect(mockAssessor.password_reset_token_hash).toBeNull();
    expect(bcrypt.compareSync('NewClinicalPass!2026', mockAssessor.passwordHash)).toBe(true);
  });
});
