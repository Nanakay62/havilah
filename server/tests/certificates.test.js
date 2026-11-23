'use strict';

require('./testConfig');
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import path from 'path';

const Assessor = require('../models/Assessor');
const Referral = require('../models/Referral');
const IssuedCertificate = require('../models/IssuedCertificate');
const AuditLog = require('../models/AuditLog');
const certificatesRouter = require('../routes/certificates');
const assessorController = require('../controllers/assessorController');

const SECRET = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';

describe('Medical Excuse Duty Certificate Integrity, Ghana Compliance & PDF Verification', () => {
  let app;

  beforeEach(() => {
    vi.restoreAllMocks();
    app = express();
    app.use(express.json({ limit: '5mb' }));
    app.use('/api/v1/certificates', certificatesRouter);
    app.use('/api/v1/assessor', assessorController);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('generates tamper-evident certificate IDs and verifies HMAC integrity for both v1 and v2 schemas', () => {
    const certificateId = IssuedCertificate.generateCertificateId();
    expect(certificateId).toMatch(/^HVL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');

    // Legacy v1 check
    const v1Hash = IssuedCertificate.computeIntegrityHash({
      certificateId,
      referralId,
      assessorId,
      issuedAt,
    });
    const v1Doc = new IssuedCertificate({
      schemaVersion: 1,
      certificateId,
      integrityHash: v1Hash,
      referralId,
      assessorId,
      certificateType: 'excuse_duty',
      clinicName: 'FZ Safety and Health Centre',
      issuedAt,
    });
    expect(v1Doc.verifyIntegrity()).toBe(true);
    v1Doc.issuedAt = new Date('2026-11-25T14:30:00.000Z');
    expect(v1Doc.verifyIntegrity()).toBe(false);

    // Upgraded v2 check binding regulatory credentials and leave dates
    const pdfHash = crypto.createHash('sha256').update('sample-pdf-bytes').digest('hex');
    const v2Params = {
      schemaVersion: 2,
      certificateId,
      referralId,
      assessorId,
      doctorId: null,
      certificateType: 'excuse_duty',
      clinicName: 'FZ Safety and Health Centre',
      practiceRegNumber: 'HEFRA/GH/2026/001',
      clinicianName: 'Dr. Edith Clarke',
      mdcNumber: 'MDC/RN/12345',
      consultationDate: '2026-11-20',
      consultationMode: 'in_person',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      durationDays: 3,
      returnDate: '2026-11-23',
      issuedAt,
      pdfSha256: pdfHash,
    };
    const v2Hash = IssuedCertificate.computeIntegrityHash(v2Params);
    const v2Doc = new IssuedCertificate({
      ...v2Params,
      integrityHash: v2Hash,
    });
    expect(v2Doc.verifyIntegrity()).toBe(true);

    // Tampering with duration or MDC fails v2 verification
    v2Doc.durationDays = 10;
    expect(v2Doc.verifyIntegrity()).toBe(false);
    v2Doc.durationDays = 3;
    v2Doc.mdcNumber = 'MDC/FAKE/999';
    expect(v2Doc.verifyIntegrity()).toBe(false);
    v2Doc.mdcNumber = 'MDC/RN/12345';
    v2Doc.pdfSha256 = 'f'.repeat(64);
    expect(v2Doc.verifyIntegrity()).toBe(false);

    // Upgraded v3 check binding OSH fitness disposition, restrictions, and re-assessment date
    const v3Params = {
      ...v2Params,
      schemaVersion: 3,
      certificateType: 'light_duty',
      fitnessStatus: 'fit_with_restrictions',
      reassessmentRequired: true,
      reassessmentDate: '2026-11-27',
      workRestrictions: [
        'No heavy lifting or strenuous manual handling',
        'No operating heavy machinery, forklifts, or commercial vehicles',
      ],
    };
    const v3Doc = new IssuedCertificate({
      ...v3Params,
      integrityHash: IssuedCertificate.computeIntegrityHash(v3Params),
    });
    expect(v3Doc.verifyIntegrity()).toBe(true);

    v3Doc.fitnessStatus = 'fit_full_duty';
    expect(v3Doc.verifyIntegrity()).toBe(false);
    v3Doc.fitnessStatus = 'fit_with_restrictions';
    v3Doc.reassessmentRequired = false;
    expect(v3Doc.verifyIntegrity()).toBe(false);
    v3Doc.reassessmentRequired = true;
    v3Doc.reassessmentDate = '2026-12-01';
    expect(v3Doc.verifyIntegrity()).toBe(false);
    v3Doc.reassessmentDate = '2026-11-27';
    v3Doc.workRestrictions = [];
    expect(v3Doc.verifyIntegrity()).toBe(false);
  });

  it('GET /api/v1/certificates/verify/:certificateId returns Ghana regulatory metadata and zero patient PII', async () => {
    const certificateId = IssuedCertificate.generateCertificateId();
    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');
    const pdfSha256 = crypto.createHash('sha256').update('%PDF-1.3 test').digest('hex');

    const v3Params = {
      schemaVersion: 3,
      certificateId,
      referralId,
      assessorId,
      doctorId: null,
      certificateType: 'light_duty',
      clinicName: 'FZ Safety and Health Centre',
      practiceRegNumber: 'HEFRA/GH/2026/001',
      clinicianName: 'Dr. Edith Clarke',
      mdcNumber: 'MDC/RN/12345',
      consultationDate: '2026-11-20',
      consultationMode: 'in_person',
      startDate: '2026-11-20',
      endDate: '2026-11-22',
      durationDays: 3,
      returnDate: '2026-11-23',
      fitnessStatus: 'fit_with_restrictions',
      workRestrictions: ['No heavy lifting or strenuous manual handling'],
      reassessmentRequired: true,
      reassessmentDate: '2026-11-27',
      issuedAt,
      pdfSha256,
    };

    const record = new IssuedCertificate({
      ...v3Params,
      integrityHash: IssuedCertificate.computeIntegrityHash(v3Params),
      revoked: false,
    });

    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValue(record);

    const res = await request(app)
      .get(`/api/v1/certificates/verify/${certificateId}`)
      .set('CF-Connecting-IP', '198.51.100.10');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      valid: true,
      status: 'valid',
      certificateId,
      issuedAt: '2026-11-20T14:30:00.000Z',
      clinicName: 'FZ Safety and Health Centre',
      practiceRegNumber: 'HEFRA/GH/2026/001',
      clinicianName: 'Dr. Edith Clarke',
      mdcNumber: 'MDC/RN/12345',
      certificateType: 'light_duty',
      durationDays: 3,
      consultationMode: 'in_person',
      fitnessStatus: 'fit_with_restrictions',
      reassessmentRequired: true,
      fileHashProtected: true,
      pdfSha256Prefix: pdfSha256.slice(0, 12),
    });

    // Zero patient PII, diagnosis, leave dates, or specific restrictions exposed publicly
    expect(res.body.patientName).toBeUndefined();
    expect(res.body.referralId).toBeUndefined();
    expect(res.body.startDate).toBeUndefined();
    expect(res.body.endDate).toBeUndefined();
    expect(res.body.reassessmentDate).toBeUndefined();
    expect(res.body.workRestrictions).toBeUndefined();
    expect(res.body.diagnosis).toBeUndefined();
    expect(res.body.remarks).toBeUndefined();
  });

  it('returns 404 valid:false for unknown, malformed, revoked, or tampered certificates', async () => {
    const malformed = await request(app)
      .get('/api/v1/certificates/verify/NOT-A-VALID-ID')
      .set('CF-Connecting-IP', '198.51.100.11');
    expect(malformed.status).toBe(404);
    expect(malformed.body.valid).toBe(false);
    expect(malformed.body.status).toBe('invalid');

    const unknownId = IssuedCertificate.generateCertificateId();
    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValueOnce(null);
    const unknown = await request(app)
      .get(`/api/v1/certificates/verify/${unknownId}`)
      .set('CF-Connecting-IP', '198.51.100.12');
    expect(unknown.status).toBe(404);
    expect(unknown.body.valid).toBe(false);

    const revokedId = IssuedCertificate.generateCertificateId();
    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');
    const revokedAt = new Date('2026-11-21T08:00:00.000Z');
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
      revokedAt,
      revokedReason: 'Wrong date entered',
    });
    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValueOnce(revokedRec);
    const revoked = await request(app)
      .get(`/api/v1/certificates/verify/${revokedId}`)
      .set('CF-Connecting-IP', '198.51.100.13');
    expect(revoked.status).toBe(404);
    expect(revoked.body.valid).toBe(false);
    expect(revoked.body.status).toBe('revoked');
    expect(revoked.body.revoked).toBe(true);
    expect(revoked.body.revokedAt).toBe('2026-11-21T08:00:00.000Z');
    // Revocation reason must not expose internal notes publicly
    expect(revoked.body.revokedReason).toBeUndefined();

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
    const tampered = await request(app)
      .get(`/api/v1/certificates/verify/${revokedId}`)
      .set('CF-Connecting-IP', '198.51.100.14');
    expect(tampered.status).toBe(404);
    expect(tampered.body.valid).toBe(false);
    expect(tampered.body.status).toBe('invalid');
  });

  it('POST /api/v1/certificates/verify/:certificateId/hash confirms exact PDF bytes and detects alteration', async () => {
    const certificateId = IssuedCertificate.generateCertificateId();
    const referralId = new mongoose.Types.ObjectId();
    const assessorId = new mongoose.Types.ObjectId();
    const issuedAt = new Date('2026-11-20T14:30:00.000Z');
    const truePdfHash = crypto.createHash('sha256').update('original-pdf-binary').digest('hex');
    const modifiedPdfHash = crypto.createHash('sha256').update('edited-pdf-binary').digest('hex');

    const v2Params = {
      schemaVersion: 2,
      certificateId,
      referralId,
      assessorId,
      certificateType: 'excuse_duty',
      clinicName: 'FZ Safety and Health Centre',
      practiceRegNumber: 'HEFRA/GH/2026/001',
      clinicianName: 'Dr. Edith Clarke',
      mdcNumber: 'MDC/RN/12345',
      consultationDate: '2026-11-20',
      consultationMode: 'in_person',
      startDate: '2026-11-20',
      endDate: '2026-11-20',
      durationDays: 1,
      returnDate: '2026-11-21',
      issuedAt,
      pdfSha256: truePdfHash,
    };
    const record = new IssuedCertificate({
      ...v2Params,
      integrityHash: IssuedCertificate.computeIntegrityHash(v2Params),
    });

    vi.spyOn(IssuedCertificate, 'findOne').mockResolvedValue(record);

    const matchRes = await request(app)
      .post(`/api/v1/certificates/verify/${certificateId}/hash`)
      .set('CF-Connecting-IP', '198.51.100.20')
      .send({ sha256: truePdfHash });
    expect(matchRes.status).toBe(200);
    expect(matchRes.body.valid).toBe(true);
    expect(matchRes.body.hashProtected).toBe(true);
    expect(matchRes.body.hashMatches).toBe(true);

    const mismatchRes = await request(app)
      .post(`/api/v1/certificates/verify/${certificateId}/hash`)
      .set('CF-Connecting-IP', '198.51.100.21')
      .send({ sha256: modifiedPdfHash });
    expect(mismatchRes.status).toBe(200);
    expect(mismatchRes.body.valid).toBe(true);
    expect(mismatchRes.body.hashProtected).toBe(true);
    expect(mismatchRes.body.hashMatches).toBe(false);

    const badHashRes = await request(app)
      .post(`/api/v1/certificates/verify/${certificateId}/hash`)
      .set('CF-Connecting-IP', '198.51.100.22')
      .send({ sha256: 'not-a-sha256' });
    expect(badHashRes.status).toBe(400);
    expect(badHashRes.body.error).toBe('INVALID_HASH');
  });

  it('rejects unauthenticated requests and enforces HeFRA, MDC, and attestation requirements on issuance', async () => {
    const assessorId = new mongoose.Types.ObjectId();
    const referralId = new mongoose.Types.ObjectId();

    const unauthRes = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/certificates`)
      .send({ certificateType: 'excuse_duty' });
    expect(unauthRes.status).toBe(401);

    const token = jwt.sign(
      { assessorId: assessorId.toString(), email: 'clinic@fz.org', name: 'Dr. Edith Clarke', role: 'clinic_admin' },
      SECRET,
      { expiresIn: '1h' }
    );

    const assessorDoc = {
      _id: assessorId,
      name: 'Dr. Edith Clarke',
      email: 'clinic@fz.org',
      organization: 'FZ Safety and Health Centre',
      practiceRegistrationNumber: '',
      mdcNumber: '',
      active: true,
      totp_enabled: true,
    };
    const referralDoc = {
      _id: referralId,
      referenceCode: 'REF-1001',
      company_id: 'comp-1',
      assignedAssessorId: assessorId,
      status: 'scheduled',
      clinicalDetails: { attachments: [] },
      save: vi.fn().mockResolvedValue(true),
    };

    vi.spyOn(Assessor, 'findById').mockImplementation(() => Promise.resolve(assessorDoc));
    vi.spyOn(Referral, 'findById').mockImplementation(() => Promise.resolve(referralDoc));

    // 1. Missing HeFRA
    const noHefra = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/certificates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certificateType: 'excuse_duty', mdcNumber: 'MDC/RN/12345', attestationConfirmed: true });
    expect(noHefra.status).toBe(400);
    expect(noHefra.body.error).toBe('HEFRA_LICENSE_REQUIRED');

    // 2. Missing MDC
    assessorDoc.practiceRegistrationNumber = 'HEFRA/GH/2026/001';
    const noMdc = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/certificates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certificateType: 'excuse_duty', attestationConfirmed: true });
    expect(noMdc.status).toBe(400);
    expect(noMdc.body.error).toBe('MDC_NUMBER_REQUIRED');

    // 3. Missing attestation
    const noAttest = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/certificates`)
      .set('Authorization', `Bearer ${token}`)
      .send({ certificateType: 'excuse_duty', mdcNumber: 'MDC/RN/12345', attestationConfirmed: false });
    expect(noAttest.status).toBe(400);
    expect(noAttest.body.error).toBe('ATTESTATION_REQUIRED');

    // 4. Successful issue + seal + list + revoke + attachment URI normalization
    let storedCert = null;
    vi.spyOn(IssuedCertificate, 'create').mockImplementation(async (payload) => {
      storedCert = new IssuedCertificate(payload);
      storedCert.save = vi.fn().mockResolvedValue(storedCert);
      return storedCert;
    });
    const auditSpy = vi.spyOn(AuditLog, 'append').mockResolvedValue({});

    // Rejects invalid reassessmentDate
    const badReviewRes = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/certificates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        certificateType: 'light_duty',
        mdcNumber: 'MDC/RN/12345',
        reassessmentDate: 'not-a-date',
        attestationConfirmed: true,
      });
    expect(badReviewRes.status).toBe(400);
    expect(badReviewRes.body.error).toBe('INVALID_DATE');

    const issueRes = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/certificates`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        certificateType: 'light_duty',
        consultationDate: '2026-11-20',
        consultationMode: 'telehealth',
        startDate: '2026-11-19',
        endDate: '2026-11-21',
        mdcNumber: 'MDC/RN/12345',
        fitnessStatus: 'fit_with_restrictions',
        workRestrictions: [
          'No heavy lifting or strenuous manual handling',
          'No operating heavy machinery, forklifts, or commercial vehicles',
        ],
        reassessmentRequired: true,
        reassessmentDate: '2026-11-26',
        attestationConfirmed: true,
      });

    expect(issueRes.status).toBe(201);
    expect(issueRes.body.data.certificateId).toMatch(/^HVL-/);
    expect(issueRes.body.data.practiceRegNumber).toBe('HEFRA/GH/2026/001');
    expect(issueRes.body.data.mdcNumber).toBe('MDC/RN/12345');
    expect(issueRes.body.data.durationDays).toBe(3);
    expect(issueRes.body.data.returnDate).toBe('2026-11-22');
    expect(issueRes.body.data.fitnessStatus).toBe('fit_with_restrictions');
    expect(issueRes.body.data.reassessmentRequired).toBe(true);
    expect(issueRes.body.data.reassessmentDate).toBe('2026-11-26');
    expect(issueRes.body.data.workRestrictions).toHaveLength(2);
    expect(issueRes.body.data.isBackdated).toBe(true);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'CERTIFICATE_ISSUED' }));

    // Seal PDF hash
    const pdfHash = crypto.createHash('sha256').update('real-pdf-bytes').digest('hex');
    vi.spyOn(IssuedCertificate, 'findOne').mockImplementation(async () => storedCert);
    const sealRes = await request(app)
      .patch(`/api/v1/assessor/referrals/${referralId}/certificates/${storedCert.certificateId}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pdfSha256: pdfHash });
    expect(sealRes.status).toBe(200);
    expect(sealRes.body.data.pdfSha256).toBe(pdfHash);
    expect(storedCert.verifyIntegrity()).toBe(true);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'CERTIFICATE_SEALED' }));

    // Conflict when attempting to overwrite sealed hash
    const conflictRes = await request(app)
      .patch(`/api/v1/assessor/referrals/${referralId}/certificates/${storedCert.certificateId}/seal`)
      .set('Authorization', `Bearer ${token}`)
      .send({ pdfSha256: 'a'.repeat(64) });
    expect(conflictRes.status).toBe(409);
    expect(conflictRes.body.error).toBe('ALREADY_SEALED');

    // Revoke requires >= 5 chars reason and marks record revoked
    const shortRevoke = await request(app)
      .patch(`/api/v1/assessor/certificates/${storedCert.certificateId}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'bad' });
    expect(shortRevoke.status).toBe(400);

    const revokeRes = await request(app)
      .patch(`/api/v1/assessor/certificates/${storedCert.certificateId}/revoke`)
      .set('Authorization', `Bearer ${token}`)
      .send({ reason: 'Incorrect return-to-duty date entered' });
    expect(revokeRes.status).toBe(200);
    expect(revokeRes.body.data.revoked).toBe(true);
    expect(auditSpy).toHaveBeenCalledWith(expect.objectContaining({ event_type: 'CERTIFICATE_REVOKED' }));

    // Attachment endpoint strips ';filename=generated.pdf;' from legacy data URIs
    const attachRes = await request(app)
      .post(`/api/v1/assessor/referrals/${referralId}/attachments`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        fileName: 'Havilah_Excuse_Duty.pdf',
        fileData: 'data:application/pdf;filename=generated.pdf;base64,JVBERi0xLjMK',
        fileType: 'application/pdf',
        fileSize: 8,
        certificateId: storedCert.certificateId,
        pdfSha256: pdfHash,
      });
    expect(attachRes.status).toBe(200);
    expect(attachRes.body.data[0].fileData).toBe('data:application/pdf;base64,JVBERi0xLjMK');
    expect(attachRes.body.data[0].certificateId).toBe(storedCert.certificateId);
  });

  it('ExcuseDutyPdf.buildExcuseDutyPdf outputs valid %PDF bytes with clean data:application/pdf;base64 prefix, accurate SHA-256, and zero em dashes', async () => {
    const rootDir = path.resolve(__dirname, '../..');
    const prevWindow = global.window;
    const prevQr = global.qrcode;
    try {
      const jspdfMod = require('jspdf');
      global.window = global.window || {};
      global.window.jspdf = jspdfMod;
      global.qrcode = require(path.join(rootDir, 'public/js/vendor/qrcode-generator.min.js'));
      const ExcuseDutyPdf = require(path.join(rootDir, 'public/js/excuseDutyPdf.js'));

      const built = await ExcuseDutyPdf.buildExcuseDutyPdf({
        certificateType: 'excuse_duty',
        certificateId: 'HVL-AAAA-BBBB-CCCC',
        referenceCode: 'REF-2026-001',
        patientName: 'Akua Mensah',
        employeeStaffId: 'EMP-0428',
        companyName: 'Gold Coast Mining Ltd',
        departmentName: 'Operations',
        consultationDate: '2026-11-20',
        consultationMode: 'in_person',
        startDate: '2026-11-20',
        endDate: '2026-11-22',
        clinicName: 'FZ Safety and Health Centre',
        practiceRegistrationNumber: 'HEFRA/GH/2026/001',
        clinicianName: 'Dr. Edith Clarke',
        clinicianSpecialty: 'Occupational Health Physician',
        mdcNumber: 'MDC/RN/12345',
        verifyUrl: 'https://havilah.dic20016.workers.dev/verify/HVL-AAAA-BBBB-CCCC',
        hrSafePrivacy: true,
      });

      // Must start strictly with clean data:application/pdf;base64, (no ';filename=generated.pdf;')
      expect(built.dataUri.startsWith('data:application/pdf;base64,')).toBe(true);
      expect(built.dataUri).not.toContain('filename=generated.pdf');

      const b64 = built.dataUri.slice('data:application/pdf;base64,'.length);
      const pdfBytes = Buffer.from(b64, 'base64');
      expect(pdfBytes.subarray(0, 5).toString('ascii')).toBe('%PDF-');
      expect(built.blobSize).toBe(pdfBytes.length);

      const expectedSha256 = crypto.createHash('sha256').update(pdfBytes).digest('hex');
      expect(built.pdfSha256).toBe(expectedSha256);

      // Zero em dashes in payload fields
      expect(JSON.stringify(built.data)).not.toContain('\u2014');
      expect(built.pageCount).toBe(1);

      // Maximum OSH restrictions + custom restriction + re-assessment must still fit strictly on 1 A4 page
      const oshBuilt = await ExcuseDutyPdf.buildExcuseDutyPdf({
        certificateType: 'light_duty',
        certificateId: 'HVL-BBBB-CCCC-DDDD',
        referenceCode: 'REF-2026-099',
        patientName: 'Kwame Boateng',
        employeeStaffId: 'MIN-8821',
        companyName: 'Ashanti Deep Gold Mining Corporation Ltd',
        departmentName: 'Underground Maintenance & Hoisting Operations',
        consultationDate: '2026-11-20',
        consultationMode: 'in_person',
        startDate: '2026-11-20',
        endDate: '2026-11-27',
        clinicName: 'FZ Safety and Health Centre',
        practiceRegistrationNumber: 'HEFRA/GH/2026/001',
        clinicianName: 'Dr. Edith Clarke',
        clinicianSpecialty: 'Occupational Health Physician',
        mdcNumber: 'MDC/RN/12345',
        fitnessStatus: 'fit_with_restrictions',
        reassessmentRequired: true,
        reassessmentDate: '2026-11-27',
        workRestrictions: [
          ...ExcuseDutyPdf.DEFAULT_WORK_RESTRICTIONS,
          'Avoid silica dust and respiratory irritant zones',
        ],
        verifyUrl: 'https://havilah.dic20016.workers.dev/verify/HVL-BBBB-CCCC-DDDD',
        hrSafePrivacy: true,
      });
      expect(oshBuilt.pageCount).toBe(1);
      expect(oshBuilt.data.workRestrictions).toHaveLength(7);
      expect(oshBuilt.data.reassessmentRequired).toBe(true);
      expect(oshBuilt.dataUri.startsWith('data:application/pdf;base64,')).toBe(true);
      expect(JSON.stringify(oshBuilt.data)).not.toContain('\u2014');
    } finally {
      global.window = prevWindow;
      global.qrcode = prevQr;
    }
  });
});
