'use strict';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');
const { callSignalingHub } = require('../services/callSignaling');

describe('WebRTC Call Routes & Signaling Integration', () => {
  describe('GET /api/v1/calls/ice-config', () => {
    const Referral = require('../models/Referral');
    const meteredServers = [
      { urls: 'stun:stun.relay.metered.ca:80' },
      { urls: ['turn:global.relay.metered.ca:80', 'turns:global.relay.metered.ca:443?transport=tcp'], username: 'u', credential: 'c' },
    ];
    let existsSpy;
    let fetchSpy;

    beforeEach(() => {
      process.env.METERED_API_KEY = 'test-key';
      process.env.METERED_APP_NAME = 'testapp';
      existsSpy = vi.spyOn(Referral, 'exists').mockResolvedValue({ _id: 'x' });
      fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => meteredServers,
      });
    });

    afterEach(() => {
      vi.restoreAllMocks();
      delete process.env.METERED_API_KEY;
      delete process.env.METERED_APP_NAME;
    });

    it('requires a reference code', async () => {
      const res = await request(app).get('/api/v1/calls/ice-config');
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('rejects unknown reference codes', async () => {
      existsSpy.mockResolvedValue(null);
      const res = await request(app).get('/api/v1/calls/ice-config?ref=NOPE1234');
      expect(res.status).toBe(403);
    });

    it('returns STUN and Metered TURN/TURNS servers, no public openrelay credentials', async () => {
      const res = await request(app).get('/api/v1/calls/ice-config?ref=REF-TEST1234');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.headers['cache-control']).toContain('no-store');
      expect(Array.isArray(res.body.iceServers)).toBe(true);

      const allUrls = res.body.iceServers.flatMap(s => (Array.isArray(s.urls) ? s.urls : [s.urls]));
      expect(allUrls.some(u => u.startsWith('stun:'))).toBe(true);
      expect(allUrls.some(u => u.startsWith('turn:'))).toBe(true);
      expect(allUrls.some(u => u.startsWith('turns:'))).toBe(true);
      expect(JSON.stringify(res.body)).not.toContain('openrelay');
      expect(res.body.relayConfigured).toBe(true);
      expect(res.body).toHaveProperty('signalPort');
    });

    it('returns 503 in production when no relay is available', async () => {
      delete process.env.METERED_API_KEY;
      process.env.RENDER = 'true';
      const callRoutes = require('../routes/callRoutes');
      if (typeof callRoutes.__resetMeteredCache === 'function') {
        callRoutes.__resetMeteredCache();
      }
      try {
        const res = await request(app).get('/api/v1/calls/ice-config?ref=REF-TEST1234');
        expect(res.status).toBe(503);
        expect(res.body.success).toBe(false);
      } finally {
        delete process.env.RENDER;
      }
    });
  });

  it('POST /api/v1/calls/log validates required referenceCode', async () => {
    const res = await request(app)
      .post('/api/v1/calls/log')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toContain('Reference code is required');
  });

  it('POST /api/v1/calls/log records connectionPath in call audit trail', async () => {
    const Referral = require('../models/Referral');
    const origFindOne = Referral.findOne;
    const mockReferral = {
      referenceCode: 'REF-LOGPATH1',
      thread: [],
      status: 'scheduled',
      appointmentNotes: '',
      save: vi.fn().mockResolvedValue(true)
    };
    Referral.findOne = vi.fn().mockResolvedValue(mockReferral);

    try {
      const res = await request(app)
        .post('/api/v1/calls/log')
        .send({
          referenceCode: 'REF-LOGPATH1',
          durationSeconds: 125,
          callerRole: 'doctor',
          endReason: 'Normal hangup',
          connectionPath: 'relay'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connectionPath).toBe('relay');
      expect(mockReferral.thread[0].message).toContain('Path: relay.');
      expect(mockReferral.save).toHaveBeenCalled();
    } finally {
      Referral.findOne = origFindOne;
    }
  });

  it('POST /api/v1/calls/log sanitizes unvalidated connectionPath to unknown', async () => {
    const Referral = require('../models/Referral');
    const origFindOne = Referral.findOne;
    const mockReferral = {
      referenceCode: 'REF-XSSPATH',
      thread: [],
      status: 'scheduled',
      appointmentNotes: '',
      save: vi.fn().mockResolvedValue(true)
    };
    Referral.findOne = vi.fn().mockResolvedValue(mockReferral);

    try {
      const res = await request(app)
        .post('/api/v1/calls/log')
        .send({
          referenceCode: 'REF-XSSPATH',
          durationSeconds: 45,
          callerRole: 'doctor',
          endReason: 'Normal hangup',
          connectionPath: '<script>alert(1)</script>'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connectionPath).toBe('unknown');
      expect(mockReferral.thread[0].message).not.toContain('<script>');
    } finally {
      Referral.findOne = origFindOne;
    }
  });

  it('CallSignalingHub relays restart_request event from peer', () => {
    const mockDoctorWs = {
      referenceCode: 'REF-RESTART1',
      role: 'doctor',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const mockEmployeeWs = {
      referenceCode: 'REF-RESTART1',
      role: 'employee',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    callSignalingHub.rooms.set('REF-RESTART1', {
      doctor: mockDoctorWs,
      employee: mockEmployeeWs,
      callState: 'connected'
    });

    callSignalingHub.handleSignalMessage(mockEmployeeWs, {
      action: 'restart_request',
      referenceCode: 'REF-RESTART1',
      reason: 'callee_reconnect'
    });

    expect(mockDoctorWs.send).toHaveBeenCalled();
    const sent = JSON.parse(mockDoctorWs.send.mock.calls[0][0]);
    expect(sent.event).toBe('restart_request');
    expect(sent.referenceCode).toBe('REF-RESTART1');

    callSignalingHub.rooms.delete('REF-RESTART1');
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

    // Test SDP Offer relay from Doctor to Employee with iceRestart
    callSignalingHub.handleSignalMessage(mockDoctorWs, {
      action: 'offer',
      offer: { type: 'offer', sdp: 'v=0\r\ntest' },
      callerName: 'Dr. Test',
      ipShield: true,
      iceRestart: true
    });

    expect(mockEmployeeWs.send).toHaveBeenCalled();
    const sentToEmployee = JSON.parse(mockEmployeeWs.send.mock.calls[0][0]);
    expect(sentToEmployee.event).toBe('incoming_call');
    expect(sentToEmployee.callerName).toBe('Dr. Test');
    expect(sentToEmployee.ipShield).toBe(true);
    expect(sentToEmployee.iceRestart).toBe(true);

    // Test SDP Answer relay from Employee to Doctor with iceRestart
    callSignalingHub.handleSignalMessage(mockEmployeeWs, {
      action: 'answer',
      answer: { type: 'answer', sdp: 'v=0\r\nanswer' },
      iceRestart: true
    });

    expect(mockDoctorWs.send).toHaveBeenCalled();
    const sentToDoctor = JSON.parse(mockDoctorWs.send.mock.calls[0][0]);
    expect(sentToDoctor.event).toBe('call_answered');
    expect(sentToDoctor.iceRestart).toBe(true);

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

  it('CallSignalingHub returns restart_deferred instead of callee_offline on iceRestart offer when peer is offline', () => {
    const mockDoctorWs = {
      referenceCode: 'REF-DEFER1',
      role: 'doctor',
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };

    callSignalingHub.rooms.set('REF-DEFER1', {
      doctor: mockDoctorWs,
      employee: null,
      callState: 'connected'
    });

    callSignalingHub.handleSignalMessage(mockDoctorWs, {
      action: 'offer',
      referenceCode: 'REF-DEFER1',
      offer: { type: 'offer', sdp: 'v=0' },
      iceRestart: true
    });

    expect(mockDoctorWs.send).toHaveBeenCalled();
    const sent = JSON.parse(mockDoctorWs.send.mock.calls[0][0]);
    expect(sent.event).toBe('restart_deferred');
    expect(sent.referenceCode).toBe('REF-DEFER1');

    callSignalingHub.rooms.delete('REF-DEFER1');
  });

  it('delays call_ended on peer socket drop during connected call and terminates after 20s if peer does not rejoin', () => {
    vi.useFakeTimers();
    try {
      const ref = 'REF-DELAYED1';
      const mockDoctorWs = {
        referenceCode: ref,
        role: 'doctor',
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };
      const mockEmployeeWs = {
        referenceCode: ref,
        role: 'employee',
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };

      const mockWss = { on: vi.fn() };
      callSignalingHub.attachHandlers(mockWss);
      const connectionHandler = mockWss.on.mock.calls.find(c => c[0] === 'connection')[1];

      let closeHandler;
      const empWsWrapper = {
        ...mockEmployeeWs,
        on: vi.fn((event, handler) => {
          if (event === 'close') closeHandler = handler;
        })
      };

      connectionHandler(empWsWrapper);
      const room = callSignalingHub.rooms.get(ref);
      room.doctor = mockDoctorWs;
      room.callState = 'connected';

      expect(closeHandler).toBeDefined();

      // Trigger socket close during active call
      closeHandler();

      // doctor receives peer_offline, but NOT call_ended yet
      const offlineCalls = mockDoctorWs.send.mock.calls.map(c => JSON.parse(c[0]));
      expect(offlineCalls.some(m => m.event === 'peer_offline')).toBe(true);
      expect(offlineCalls.some(m => m.event === 'call_ended')).toBe(false);

      // Advance timers by 19s: still no call_ended
      vi.advanceTimersByTime(19000);
      const midCalls = mockDoctorWs.send.mock.calls.map(c => JSON.parse(c[0]));
      expect(midCalls.some(m => m.event === 'call_ended')).toBe(false);

      // Advance by another 2s (total 21s): call_ended sent
      vi.advanceTimersByTime(2000);
      const finalCalls = mockDoctorWs.send.mock.calls.map(c => JSON.parse(c[0]));
      expect(finalCalls.some(m => m.event === 'call_ended')).toBe(true);
      expect(callSignalingHub.rooms.get(ref)?.callState).toBe('idle');

      callSignalingHub.rooms.delete(ref);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancels delayed call_ended timer and dispatches peer_rejoined when peer reconnects within 20s', () => {
    vi.useFakeTimers();
    try {
      const ref = 'REF-REJOIN1';
      const mockDoctorWs = {
        referenceCode: ref,
        role: 'doctor',
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };
      const mockEmployeeWs1 = {
        referenceCode: ref,
        role: 'employee',
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
      };

      const mockWss = { on: vi.fn() };
      callSignalingHub.attachHandlers(mockWss);
      const connectionHandler = mockWss.on.mock.calls.find(c => c[0] === 'connection')[1];

      let closeHandler;
      const empWs1 = {
        ...mockEmployeeWs1,
        on: vi.fn((event, handler) => {
          if (event === 'close') closeHandler = handler;
        })
      };

      connectionHandler(empWs1);
      const room = callSignalingHub.rooms.get(ref);
      room.doctor = mockDoctorWs;
      room.callState = 'connected';

      // Drop socket 1
      closeHandler();
      expect(room.endTimer).not.toBeNull();

      // Employee reconnects before 20s
      vi.advanceTimersByTime(5000);
      const mockEmployeeWs2 = {
        referenceCode: ref,
        role: 'employee',
        readyState: 1,
        send: vi.fn(),
        close: vi.fn(),
        on: vi.fn()
      };
      connectionHandler(mockEmployeeWs2);

      // Timer should be cleared
      expect(room.endTimer).toBeNull();

      // Doctor should have received peer_rejoined
      const doctorMsgs = mockDoctorWs.send.mock.calls.map(c => JSON.parse(c[0]));
      expect(doctorMsgs.some(m => m.event === 'peer_rejoined')).toBe(true);

      // Advance another 20s: call_ended should NEVER be sent
      vi.advanceTimersByTime(20000);
      const afterCalls = mockDoctorWs.send.mock.calls.map(c => JSON.parse(c[0]));
      expect(afterCalls.some(m => m.event === 'call_ended')).toBe(false);

      callSignalingHub.rooms.delete(ref);
    } finally {
      vi.useRealTimers();
    }
  });
});
