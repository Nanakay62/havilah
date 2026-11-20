'use strict';

import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';

const IssuedCertificate = require('../models/IssuedCertificate');
const certificatesRouter = require('../routes/certificates');

describe('Medical Excuse Duty Certificate Integrity & Public Verification', () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json());
    app.use('/api/v1/certificates', certificatesRouter);
  });

  it('generates a tamper-evident certificate ID and verifies HMAC integrity', () => {
    const certificateId = IssuedCertificate.generateCertificateId();
    expect(certificateId).toMatch(/^HVL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');
    const integrityHash = IssuedCertificate.computeIntegrityHash({
      certificateId,
      referralId,
      assessorId,
      issuedAt,
    });

    const doc = new IssuedCertificate({
      certificateId,
      integrityHash,
      referralId,
      assessorId,
      certificateType: 'excuse_duty',
      clinicName: 'FZ Safety and Health Centre',
      issuedAt,
    });

    expect(doc.verifyIntegrity()).toBe(true);

    // Tampering with issuedAt breaks integrity check
    doc.issuedAt = new Date('2026-11-25T14:30:00.000Z');
    expect(doc.verifyIntegrity()).toBe(false);
  });

  it('GET /api/v1/certificates/verify/:certificateId returns ONLY validity, issue date, and clinic name', async () => {
    const certificateId = IssuedCertificate.generateCertificateId();
    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');
    const integrityHash = IssuedCertificate.computeIntegrityHash({
      certificateId,
      referralId,
      assessorId,
      issuedAt,
    });

    const record = new IssuedCertificate({
      certificateId,
      integrityHash,
      referralId,
      assessorId,
      certificateType: 'excuse_duty',
      clinicName: 'FZ Safety and Health Centre',
      issuedAt,
      revoked: false,
    });

    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValue(record);

    const res = await request(app).get(`/api/v1/certificates/verify/${certificateId}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      certificateId,
      issuedAt: '2026-11-20T14:30:00.000Z',
      clinicName: 'FZ Safety and Health Centre',
    });
    // Ensure zero patient or medical fields are leaked
    expect(Object.keys(res.body).sort()).toEqual(['certificateId', 'clinicName', 'issuedAt', 'valid']);
  });

  it('returns 404 valid:false for unknown, malformed, revoked, or tampered certificates', async () => {
    // Malformed ID
    const malformed = await request(app).get('/api/v1/certificates/verify/NOT-A-VALID-ID');
    expect(malformed.status).toBe(404);
    expect(malformed.body.valid).toBe(false);

    // Unknown ID
    const unknownId = IssuedCertificate.generateCertificateId();
    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValueOnce(null);
    const unknown = await request(app).get(`/api/v1/certificates/verify/${unknownId}`);
    expect(unknown.status).toBe(404);
    expect(unknown.body.valid).toBe(false);

    // Revoked certificate
    const revokedId = IssuedCertificate.generateCertificateId();
    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');
    const revokedRec = new IssuedCertificate({
      certificateId: revokedId,
      integrityHash: IssuedCertificate.computeIntegrityHash({
        certificateId: revokedId,
        referralId,
        assessorId,
        issuedAt,
      }),
      referralId,
      assessorId,
      clinicName: 'FZ Safety and Health Centre',
      issuedAt,
      revoked: true,
    });
    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValueOnce(revokedRec);
    const revoked = await request(app).get(`/api/v1/certificates/verify/${revokedId}`);
    expect(revoked.status).toBe(404);
    expect(revoked.body.valid).toBe(false);

    // Tampered certificate
    const tamperedRec = new IssuedCertificate({
      certificateId: revokedId,
      integrityHash: '0'.repeat(64),
      referralId,
      assessorId,
      clinicName: 'FZ Safety and Health Centre',
      issuedAt,
      revoked: false,
    });
    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValueOnce(tamperedRec);
    const tampered = await request(app).get(`/api/v1/certificates/verify/${revokedId}`);
    expect(tampered.status).toBe(404);
    expect(tampered.body.valid).toBe(false);
  });

  it('rejects unauthenticated requests to clinician certificate issuance', async () => {
    const assessorController = require('../controllers/assessorController');
    const authApp = express();
    authApp.use(express.json());
    authApp.use('/api/v1/assessor', assessorController);

    const fakeRefId = new mongoose.Types.ObjectId().toString();
    const res = await request(authApp)
      .post(`/api/v1/assessor/referrals/${fakeRefId}/certificates`)
      .send({ certificateType: 'excuse_duty' });

    expect(res.status).toBe(401);
  });
});
