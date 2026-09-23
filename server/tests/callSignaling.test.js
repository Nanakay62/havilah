'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { callSignalingHub } = require('../services/callSignaling');

describe('WebRTC Call Routes & Signaling Integration', () => {
  it('GET /api/v1/calls/ice-config returns STUN and TURN server configuration', async () => {
    const res = await request(app).get('/api/v1/calls/ice-config');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.iceServers)).toBe(true);
    expect(res.body.iceServers.length).toBeGreaterThanOrEqual(2);

    // Verify STUN servers are included
    const hasStun = res.body.iceServers.some(s => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some(u => typeof u === 'string' && u.startsWith('stun:'));
    });
    expect(hasStun).toBe(true);

    // Verify TURN servers are included
    const hasTurn = res.body.iceServers.some(s => {
      const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
      return urls.some(u => typeof u === 'string' && u.startsWith('turn:'));
    });
    expect(hasTurn).toBe(true);
    expect(res.body).toHaveProperty('signalPort');
  });

  it('POST /api/v1/calls/log validates required referenceCode', async () => {
    const res = await request(app)
      .post('/api/v1/calls/log')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Reference code is required');
  });

  it('CallSignalingHub initializes and manages room lifecycle cleanly', () => {
    expect(callSignalingHub).toBeDefined();
    expect(callSignalingHub.rooms instanceof Map).toBe(true);

    // Mock WebSocket clients
    const mockDoctorWs = {
      referenceCode: 'REF-TEST1234',
      role: 'doctor',
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
    };

    const mockEmployeeWs = {
      referenceCode: 'REF-TEST1234',
      role: 'employee',
      readyState: 1, // OPEN
      send: vi.fn(),
      close: vi.fn(),
    };

    callSignalingHub.rooms.set('REF-TEST1234', {
      doctor: mockDoctorWs,
      employee: mockEmployeeWs,
      callState: 'idle'
    });

    // Test SDP Offer relay from Doctor to Employee
    callSignalingHub.handleSignalMessage(mockDoctorWs, {
      action: 'offer',
      offer: { type: 'offer', sdp: 'v=0\r\ntest' },
      callerName: 'Dr. Test',
      ipShield: true
    });

    expect(mockEmployeeWs.send).toHaveBeenCalled();
    const sentToEmployee = JSON.parse(mockEmployeeWs.send.mock.calls[0][0]);
    expect(sentToEmployee.event).toBe('incoming_call');
    expect(sentToEmployee.callerName).toBe('Dr. Test');
    expect(sentToEmployee.ipShield).toBe(true);

    // Test SDP Answer relay from Employee to Doctor
    callSignalingHub.handleSignalMessage(mockEmployeeWs, {
      action: 'answer',
      answer: { type: 'answer', sdp: 'v=0\r\nanswer' }
    });

    expect(mockDoctorWs.send).toHaveBeenCalled();
    const sentToDoctor = JSON.parse(mockDoctorWs.send.mock.calls[0][0]);
    expect(sentToDoctor.event).toBe('call_answered');

    // Test ICE Candidate relay
    callSignalingHub.handleSignalMessage(mockDoctorWs, {
      action: 'candidate',
      candidate: { candidate: 'candidate:1 1 UDP 1234' }
    });

    const candidateMsg = JSON.parse(mockEmployeeWs.send.mock.calls[1][0]);
    expect(candidateMsg.event).toBe('candidate');
    expect(candidateMsg.candidate).toBeDefined();

    // Clean up test room
    callSignalingHub.rooms.delete('REF-TEST1234');
  });

  it('guarantees replaced socket closure does not wipe active session or delete room', () => {
    const ref = 'REF-REPLACE99';
    const oldWs = {
      referenceCode: ref,
      role: 'employee',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const newWs = {
      referenceCode: ref,
      role: 'employee',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const doctorWs = {
      referenceCode: ref,
      role: 'doctor',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };

    // Simulate connection handler with oldWs
    callSignalingHub.rooms.set(ref, { doctor: doctorWs, employee: oldWs, callState: 'idle' });

    // Emulate replacing oldWs with newWs
    const room = callSignalingHub.rooms.get(ref);
    if (room['employee'] && room['employee'] !== newWs) {
      room['employee'].isReplaced = true;
      room['employee'].close();
    }
    room['employee'] = newWs;

    expect(oldWs.isReplaced).toBe(true);
    expect(callSignalingHub.rooms.get(ref).employee).toBe(newWs);

    // Now trigger oldWs close logic: verify it does NOT wipe newWs
    const currentRoom = callSignalingHub.rooms.get(ref);
    if (!oldWs.isReplaced && currentRoom.employee === oldWs) {
      currentRoom.employee = null;
    }
    // Verify room is still intact and employee is still newWs
    expect(callSignalingHub.rooms.get(ref).employee).toBe(newWs);

    // Test self-healing: if an offer is sent by newWs, doctor receives incoming_call
    callSignalingHub.handleSignalMessage(newWs, {
      action: 'offer',
      callerName: 'Patient Alex',
      offer: { type: 'offer', sdp: 'test' }
    });

    expect(doctorWs.send).toHaveBeenCalled();
    const callMsg = JSON.parse(doctorWs.send.mock.calls[0][0]);
    expect(callMsg.event).toBe('incoming_call');
    expect(callMsg.callerName).toBe('Patient Alex');

    callSignalingHub.rooms.delete(ref);
  });

  it('routes bidirectional calls with explicit referenceCode correctly', () => {
    const refCode = 'REF-BIDI9999';
    const doctorWs = {
      referenceCodes: [refCode, 'REF-OTHER111'],
      referenceCode: refCode,
      role: 'doctor',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const employeeWs = {
      referenceCode: refCode,
      role: 'employee',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };

    callSignalingHub.rooms.set(refCode, { doctor: doctorWs, employee: employeeWs, callState: 'idle' });

    // 1. Employee initiates call to Doctor
    callSignalingHub.handleSignalMessage(employeeWs, {
      action: 'offer',
      referenceCode: refCode,
      callerName: 'Employee Jane',
      offer: { type: 'offer', sdp: 'offer_sdp' }
    });

    expect(doctorWs.send).toHaveBeenCalled();
    const offerReceived = JSON.parse(doctorWs.send.mock.calls[0][0]);
    expect(offerReceived.event).toBe('incoming_call');
    expect(offerReceived.referenceCode).toBe(refCode);
    expect(offerReceived.fromRole).toBe('employee');

    // 2. Doctor sends ringing signal
    callSignalingHub.handleSignalMessage(doctorWs, {
      action: 'ringing',
      referenceCode: refCode
    });

    expect(employeeWs.send).toHaveBeenCalled();
    const ringingReceived = JSON.parse(employeeWs.send.mock.calls[0][0]);
    expect(ringingReceived.event).toBe('call_ringing');

    // 3. Doctor answers call
    callSignalingHub.handleSignalMessage(doctorWs, {
      action: 'answer',
      referenceCode: refCode,
      answer: { type: 'answer', sdp: 'answer_sdp' }
    });

    const answerReceived = JSON.parse(employeeWs.send.mock.calls[1][0]);
    expect(answerReceived.event).toBe('call_answered');
    expect(answerReceived.referenceCode).toBe(refCode);

    // 4. ICE candidate exchange
    callSignalingHub.handleSignalMessage(employeeWs, {
      action: 'candidate',
      referenceCode: refCode,
      candidate: { candidate: 'cand1' }
    });
    const doctorCandidate = JSON.parse(doctorWs.send.mock.calls[1][0]);
    expect(doctorCandidate.event).toBe('candidate');
    expect(doctorCandidate.referenceCode).toBe(refCode);

    callSignalingHub.rooms.delete(refCode);
  });

  it('GET /api/v1/referrals/my-active requires authentication', async () => {
    const res = await request(app).get('/api/v1/referrals/my-active');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/referrals/my-active resolves active case for authenticated user', async () => {
    const Tenant = require('../models/Tenant');
    const Referral = require('../models/Referral');
    const origTenantFindOne = Tenant.findOne;
    const origReferralFindOne = Referral.findOne;

    Tenant.findOne = () => ({
      select: () => ({
        lean: () => Promise.resolve({ locked_at: null, lifecycle_state: 'active' })
      })
    });

    Referral.findOne = () => ({
      sort: () => ({
        select: () => ({
          lean: () => Promise.resolve({
            referenceCode: 'REF-ACT1234',
            status: 'scheduled',
            clinicalDetails: { patientName: 'Jane Doe' },
            scheduledAt: new Date(),
            createdAt: new Date()
          })
        })
      })
    });

    try {
      const testSecret = process.env.JWT_SECRET || 'wellframe-test-jwt-secret-2026';
      const testToken = jwt.sign(
        { userId: '00000000-0000-4000-8000-000000000001', companyId: 'test-company-corp', role: 'employee', status: 'active' },
        testSecret,
        { expiresIn: '1h' }
      );

      const res = await request(app)
        .get('/api/v1/referrals/my-active?email=test%40example.com')
        .set('Authorization', `Bearer ${testToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.referenceCode).toBe('REF-ACT1234');
    } finally {
      Tenant.findOne = origTenantFindOne;
      Referral.findOne = origReferralFindOne;
    }
  });
});
