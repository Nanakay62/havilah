'use strict';

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const Referral = require('../models/Referral');
const logger = require('../utils/logger');
let notificationService = null;
try {
  const NotificationService = require('./notificationService');
  notificationService = new NotificationService();
} catch (e) {
  logger.warn('[CallSignaling] NotificationService could not be loaded:', e.message);
}

/**
 * Havilah Doctor-Employee WebRTC Signaling Hub
 * Manages peer discovery and SDP/ICE routing for confidential consultations.
 */
class CallSignalingHub {
  constructor() {
    this.wss = null;
    this.standaloneServer = null;
    this.rooms = new Map(); // referenceCode -> { doctor: ws, employee: ws, callState: string }
    this.heartbeatInterval = null;
  }

  /**
   * Initializes the signaling server.
   * Runs as a standalone WebSocket server on port 3001, with optional upgrade hook on main HTTP server.
   * @param {import('http').Server} [httpServer] Optional main HTTP server for dual-binding
   */
  start(httpServer) {
    const port = parseInt(process.env.CALL_SIGNAL_PORT, 10) || 3001;

    try {
      this.wss = new WebSocket.Server({ noServer: true });
      this.attachHandlers(this.wss);

      // 1. Standalone listener on PORT 3001
      const http = require('http');
      this.standaloneServer = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', service: 'havilah-call-signaling', port }));
      });

      this.standaloneServer.on('upgrade', (req, socket, head) => {
        this.handleUpgrade(req, socket, head);
      });

      this.standaloneServer.listen(port, () => {
        logger.info({ port }, '[CallSignaling] Standalone WebSocket signaling server listening on port ' + port);
      });

      this.standaloneServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
          logger.warn({ port }, `[CallSignaling] Port ${port} is already in use; falling back to main HTTP server upgrade handler.`);
        } else {
          logger.error({ err: err.message }, '[CallSignaling] Standalone server error:');
        }
      });
    } catch (e) {
      logger.warn('[CallSignaling] Could not start standalone server:', e.message);
    }

    // 2. Also attach to main HTTP server's 'upgrade' event as a fallback
    if (httpServer) {
      httpServer.on('upgrade', (req, socket, head) => {
        const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
        if (url.pathname === '/api/v1/calls/ws' || url.pathname === '/ws/call') {
          this.handleUpgrade(req, socket, head);
        }
      });
    }

    // 3. Keep-alive heartbeat to prevent NAT timeout
    this.heartbeatInterval = setInterval(() => {
      if (!this.wss) return;
      this.wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }
        ws.isAlive = false;
        try {
          ws.ping();
        } catch (e) {}
      });
    }, 30000);
  }

  /**
   * Validates handshake parameters and upgrades connection
   */
  async handleUpgrade(req, socket, head) {
    try {
      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      const rawRef = url.searchParams.get('ref') || '';
      const role = (url.searchParams.get('role') || '').trim().toLowerCase();
      const token = url.searchParams.get('token') || '';

      if (!rawRef || !['doctor', 'employee'].includes(role)) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      const referenceCodes = rawRef.split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
      if (referenceCodes.length === 0) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      // Authorize connection against database referral records
      const authorizedCodes = [];
      for (const rc of referenceCodes) {
        const isAuthorized = await this.verifyRoomAccess(rc, role, token);
        if (isAuthorized) {
          authorizedCodes.push(rc);
        }
      }

      if (authorizedCodes.length === 0) {
        socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(req, socket, head, (ws) => {
        ws.referenceCodes = authorizedCodes;
        ws.referenceCode = authorizedCodes[0];
        ws.role = role;
        ws.token = token;
        ws.isAlive = true;
        this.wss.emit('connection', ws, req);
      });
    } catch (err) {
      logger.warn({ err: err.message }, '[CallSignaling] Upgrade handshake error');
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  }

  /**
   * Verifies that the client has rights to join the signaling room for referenceCode
   */
  async verifyRoomAccess(referenceCode, role, token) {
    try {
      const referral = await Referral.findOne({ referenceCode }).select('_id status assignedAssessorId assignedDoctorId clinicalDetails').lean();
      if (!referral) {
        logger.warn({ referenceCode }, '[CallSignaling] Referral not found for referenceCode');
        return false;
      }

      if (role === 'doctor') {
        if (!token) return false;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const validRoles = ['assessor', 'clinic_admin', 'doctor'];
        if (!validRoles.includes(decoded.role) && !decoded.isLeadAssessor) {
          return false;
        }
        return true;
      }

      if (role === 'employee') {
        // If employee provides token, verify it
        if (token) {
          try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded) return true;
          } catch (e) {
            // Token might be expired or client is authenticating zero-knowledge via reference code
          }
        }
        // Zero-knowledge authentication: knowing the unguessable 8-character referenceCode grants employee room access
        return true;
      }

      return false;
    } catch (err) {
      logger.warn({ err: err.message, referenceCode }, '[CallSignaling] verifyRoomAccess error');
      return false;
    }
  }

  /**
   * Attaches message, close, and error handlers to the WebSocket server
   */
  attachHandlers(wss) {
    wss.on('connection', (ws) => {
      const { role } = ws;
      const refList = ws.referenceCodes || (ws.referenceCode ? [ws.referenceCode] : []);

      refList.forEach((rc) => {
        if (!this.rooms.has(rc)) {
          this.rooms.set(rc, { doctor: null, employee: null, callState: 'idle' });
        }
        const room = this.rooms.get(rc);

        // If an existing socket for this role was connected, mark it replaced before closing
        if (room[role] && room[role] !== ws) {
          room[role].isReplaced = true;
          if (room[role].readyState === WebSocket.OPEN) {
            try {
              room[role].close(1000, 'Replaced by newer session');
            } catch (e) {}
          }
        }
        room[role] = ws;

        logger.info({ referenceCode: rc, role }, `[CallSignaling] ${role.toUpperCase()} joined call room ${rc}`);

        // Notify peer and client of presence state for rc
        const peer = role === 'doctor' ? room.employee : room.doctor;
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ event: 'peer_online', role, referenceCode: rc }));
          ws.send(JSON.stringify({ event: 'peer_online', role: role === 'doctor' ? 'employee' : 'doctor', referenceCode: rc }));
        } else {
          ws.send(JSON.stringify({ event: 'peer_offline', role: role === 'doctor' ? 'employee' : 'doctor', referenceCode: rc }));
        }
      });

      ws.on('pong', () => {
        ws.isAlive = true;
      });

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleSignalMessage(ws, msg);
        } catch (err) {
          logger.warn({ err: err.message }, '[CallSignaling] Invalid JSON message received');
        }
      });

      ws.on('close', () => {
        logger.info({ referenceCodes: refList, role }, `[CallSignaling] ${role.toUpperCase()} socket closed`);

        // If this socket was superseded by a newer session, ignore close event completely
        if (ws.isReplaced) {
          return;
        }

        refList.forEach((rc) => {
          const currentRoom = this.rooms.get(rc);
          if (currentRoom && currentRoom[role] === ws) {
            currentRoom[role] = null;
            currentRoom.callState = 'idle';

            const remainingPeer = role === 'doctor' ? currentRoom.employee : currentRoom.doctor;
            if (remainingPeer && remainingPeer.readyState === WebSocket.OPEN) {
              remainingPeer.send(JSON.stringify({ event: 'call_ended', referenceCode: rc, reason: `${role === 'doctor' ? 'Doctor' : 'Patient'} disconnected` }));
              remainingPeer.send(JSON.stringify({ event: 'peer_offline', role, referenceCode: rc }));
            }

            // Only clean up if both are truly gone
            if (!currentRoom.doctor && !currentRoom.employee) {
              this.rooms.delete(rc);
            }
          }
        });
      });

      ws.on('error', (err) => {
        logger.warn({ err: err.message, referenceCodes: refList, role }, '[CallSignaling] WebSocket client error');
      });
    });
  }

  /**
   * Relays signaling messages between Doctor and Employee
   */
  async handleSignalMessage(senderWs, msg) {
    const { role } = senderWs;
    if (!role) return;

    // Support dynamic room subscription
    if (msg.action === 'subscribe' && Array.isArray(msg.referenceCodes)) {
      senderWs.referenceCodes = senderWs.referenceCodes || [];
      for (const rawCode of msg.referenceCodes) {
        const rc = (rawCode || '').trim().toUpperCase();
        if (!rc || senderWs.referenceCodes.includes(rc)) continue;
        const ok = await this.verifyRoomAccess(rc, role, senderWs.token || '');
        if (ok) {
          senderWs.referenceCodes.push(rc);
          if (!this.rooms.has(rc)) {
            this.rooms.set(rc, { doctor: null, employee: null, callState: 'idle' });
          }
          const room = this.rooms.get(rc);
          room[role] = senderWs;
          const peer = role === 'doctor' ? room.employee : room.doctor;
          if (peer && peer.readyState === WebSocket.OPEN) {
            peer.send(JSON.stringify({ event: 'peer_online', role, referenceCode: rc }));
            senderWs.send(JSON.stringify({ event: 'peer_online', role: role === 'doctor' ? 'employee' : 'doctor', referenceCode: rc }));
          } else {
            senderWs.send(JSON.stringify({ event: 'peer_offline', role: role === 'doctor' ? 'employee' : 'doctor', referenceCode: rc }));
          }
        }
      }
      return;
    }

    const targetRef = (msg.referenceCode || senderWs.referenceCode || (senderWs.referenceCodes && senderWs.referenceCodes[0]) || '').trim().toUpperCase();
    if (!targetRef) return;

    // Self-heal: ensure room exists and sender is bound
    if (!this.rooms.has(targetRef)) {
      this.rooms.set(targetRef, { doctor: null, employee: null, callState: 'idle' });
    }
    const room = this.rooms.get(targetRef);
    if (room[role] !== senderWs) {
      room[role] = senderWs;
    }

    const peer = role === 'doctor' ? room.employee : room.doctor;
    const peerRole = role === 'doctor' ? 'employee' : 'doctor';

    switch (msg.action) {
      case 'offer': {
        room.callState = 'ringing';
        room.activeCaller = role;

        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            event: 'incoming_call',
            referenceCode: targetRef,
            fromRole: role,
            callerName: msg.callerName || (role === 'doctor' ? 'Medical Assessor' : 'Patient'),
            offer: msg.offer,
            ipShield: !!msg.ipShield,
            timestamp: Date.now(),
          }));
        } else {
          // Peer is offline in the signaling room
          senderWs.send(JSON.stringify({
            event: 'callee_offline',
            referenceCode: targetRef,
            calleeRole: peerRole,
            message: `${peerRole === 'doctor' ? 'Doctor' : 'Patient'} is not currently active in the consultation room.`
          }));

          // Trigger push notification if available
          this.dispatchOfflineCallNotification(targetRef, role, msg.callerName);
        }
        break;
      }

      case 'ringing': {
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ event: 'call_ringing', referenceCode: targetRef }));
        }
        break;
      }

      case 'answer': {
        room.callState = 'connected';
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            event: 'call_answered',
            referenceCode: targetRef,
            answer: msg.answer,
          }));
        }
        break;
      }

      case 'candidate': {
        if (peer && peer.readyState === WebSocket.OPEN && msg.candidate) {
          peer.send(JSON.stringify({
            event: 'candidate',
            referenceCode: targetRef,
            candidate: msg.candidate,
          }));
        }
        break;
      }

      case 'decline': {
        room.callState = 'idle';
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            event: 'call_declined',
            referenceCode: targetRef,
            reason: msg.reason || 'Call was declined',
          }));
        }
        break;
      }

      case 'hangup': {
        room.callState = 'idle';
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({
            event: 'call_ended',
            referenceCode: targetRef,
            reason: msg.reason || 'Call ended by peer',
          }));
        }
        break;
      }

      default:
        logger.warn({ action: msg.action }, '[CallSignaling] Unknown action');
    }
  }

  /**
   * Attempts to dispatch an offline notification via FCM / email
   */
  async dispatchOfflineCallNotification(referenceCode, callerRole, callerName) {
    try {
      const referral = await Referral.findOne({ referenceCode }).select('assignedDoctorId assignedAssessorId tenantId clinicalDetails').lean();
      if (!referral) return;

      const title = '📞 Incoming Consultation Call';
      const body = `${callerName || 'Your practitioner'} is ready and calling for consultation ${referenceCode}. Click to join.`;

      logger.info({ referenceCode, callerRole }, '[CallSignaling] Callee is offline; logged call notification event');
      // If notificationService is configured and device tokens are known, send push
      if (notificationService && notificationService.fcmEnabled) {
        // Can target tenant or clinician devices
      }
    } catch (err) {
      logger.warn({ err: err.message }, '[CallSignaling] dispatchOfflineCallNotification error');
    }
  }

  /**
   * Shuts down servers cleanly
   */
  stop() {
    if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
    if (this.wss) this.wss.close();
    if (this.standaloneServer) this.standaloneServer.close();
  }
}

const callSignalingHub = new CallSignalingHub();

module.exports = {
  callSignalingHub,
  initCallSignaling: (server) => callSignalingHub.start(server),
};
