'use strict';

const request = require('supertest');
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
});
