/**
 * Havilah WebRTC Audio Consultation System
 * Pure WebRTC + Native Node.js WebSocket Signaling Engine
 * Derived from the ND Chat Project with ISO 45003 Clinical Telehealth Adaptation
 */
(function(window) {
  'use strict';

  class HavilahCallClient {
    constructor() {
      this.role = null;               // 'doctor' | 'employee'
      this.referenceCode = null;      // 'REF-XXXXXXXX'
      this.token = null;
      this.ws = null;
      this.pc = null;
      this.localStream = null;
      this.remoteAudio = null;
      this.storedIncomingCall = null;
      this.iceConfig = null;
      this.ipShield = false;          // Opt-in toggle (defaults false for max direct P2P clarity)
      this.isMuted = false;
      this.isSpeaker = false;
      this.callStartTime = null;
      this.callTimerInterval = null;
      this.activeDurationSeconds = 0;
      this.activeCallState = 'idle';  // 'idle' | 'calling' | 'ringing' | 'connected' | 'ended'
      this.cachedIceServers = null;
      this.signalWsUrl = null;
      this.pendingCandidates = [];
      this.peerPresenceMap = new Map();
      this.activeCallRef = null;

      // Event hooks
      this.onIncomingCall = null;
      this.onCallConnected = null;
      this.onCallEnded = null;
      this.onStatusChange = null;
      this.onPeerPresence = null;

      // Ensure remote audio playback tag exists when DOM is ready
      if (typeof document !== 'undefined') {
        if (document.body) {
          this.ensureAudioElement();
        } else if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => this.ensureAudioElement(), { once: true });
        }
      }
    }

    /**
     * Initializes the client with consultation metadata and opens signaling WebSocket.
     */
    async init(options = {}) {
      const targetRole = options.role || this.role;
      const targetRef = (options.referenceCode || this.referenceCode || '').toUpperCase().trim();

      // Update callbacks immediately
      this.onIncomingCall = options.onIncomingCall || this.onIncomingCall;
      this.onCallConnected = options.onCallConnected || this.onCallConnected;
      this.onCallEnded = options.onCallEnded || this.onCallEnded;
      this.onStatusChange = options.onStatusChange || this.onStatusChange;
      this.onPeerPresence = options.onPeerPresence || this.onPeerPresence;

      // Check stored IP Shield preference
      const storedShield = localStorage.getItem('havilah_call_ip_shield');
      if (storedShield !== null) {
        this.ipShield = storedShield === 'true';
      }

      this.ensureAudioElement();

      // If already connected or connecting for the same role and ref, reuse!
      if (this.role === targetRole && this.referenceCode === targetRef) {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
          console.log(`[HavilahCall] Existing signaling session active for ${this.role} on ${this.referenceCode}; reusing connection.`);
          // If we already know the peer presence, re-fire callback for new listener
          if (this.lastPeerOnline !== undefined && typeof this.onPeerPresence === 'function') {
            this.onPeerPresence(this.lastPeerOnline, this.role === 'doctor' ? 'employee' : 'doctor');
          }
          return;
        }
        if (this._connectingPromise) {
          console.log(`[HavilahCall] Connection already in-flight for ${this.role} on ${this.referenceCode}; awaiting.`);
          await this._connectingPromise;
          return;
        }
      }

      this.role = targetRole;
      this.referenceCode = targetRef;
      this.token = options.token || this.token || localStorage.getItem('token') || localStorage.getItem('havilah_token') || '';

      this._connectingPromise = (async () => {
        try {
          await this.fetchIceConfig();
          this.connectSignaling();
        } finally {
          this._connectingPromise = null;
        }
      })();

      await this._connectingPromise;
    }

    /**
     * Guarantees hidden <audio> element exists in DOM for remote voice playback
     */
    ensureAudioElement() {
      if (typeof document === 'undefined') return;
      let audio = document.getElementById('havilah-remote-audio');
      if (!audio) {
        if (!document.body) {
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.ensureAudioElement(), { once: true });
          }
          return;
        }
        audio = document.createElement('audio');
        audio.id = 'havilah-remote-audio';
        audio.autoplay = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
      }
      this.remoteAudio = audio;
    }

    /**
     * Fetches ICE (STUN/TURN) and signaling server configuration from backend
     */
    async fetchIceConfig() {
      try {
        const res = await fetch('/api/v1/calls/ice-config');
        const data = await res.json();
        if (data && data.success) {
          this.cachedIceServers = data.iceServers;
          this.signalWsUrl = data.signalUrl;
        }
      } catch (err) {
        console.warn('[HavilahCall] Could not fetch remote ICE config; using defaults:', err.message);
      }
    }

    /**
     * Builds dynamic WebSocket URL based on current host & environment
     */
    getSignalingUrl() {
      if (this.signalWsUrl) {
        const separator = this.signalWsUrl.includes('?') ? '&' : '?';
        return `${this.signalWsUrl}${separator}ref=${encodeURIComponent(this.referenceCode)}&role=${this.role}&token=${encodeURIComponent(this.token)}`;
      }

      const isHttps = window.location.protocol === 'https:';
      const wsProtocol = isHttps ? 'wss:' : 'ws:';
      const hostname = window.location.hostname;

      if (hostname === 'localhost' || hostname === '127.0.0.1') {
        return `${wsProtocol}//${hostname}:3001?ref=${encodeURIComponent(this.referenceCode)}&role=${this.role}&token=${encodeURIComponent(this.token)}`;
      }

      // Production single-port Render host via HTTP server upgrade handler on standard port 443
      return `wss://havilah-api.onrender.com/api/v1/calls/ws?ref=${encodeURIComponent(this.referenceCode)}&role=${this.role}&token=${encodeURIComponent(this.token)}`;
    }

    /**
     * Establishes signaling WebSocket connection
     */
    connectSignaling() {
      if (!this.referenceCode || !this.role) return;

      if (this.ws) {
        try {
          this.ws.close();
        } catch (e) {}
      }

      const wsUrl = this.getSignalingUrl();
      console.log(`[HavilahCall] Connecting signaling socket for ${this.role} on ${this.referenceCode}...`);

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.onopen = () => {
          console.log(`[HavilahCall] Signaling connected for ${this.referenceCode}`);
          this.updateStatus('Signaling Ready');
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            this.handleSignalingMessage(msg);
          } catch (e) {
            console.warn('[HavilahCall] Failed to parse signaling payload:', e);
          }
        };

        this.ws.onclose = (event) => {
          console.log(`[HavilahCall] Signaling disconnected (code ${event.code})`);
          if (this.activeCallState === 'connected' || this.activeCallState === 'calling') {
            this.updateStatus('Signaling disconnected');
          }
        };

        this.ws.onerror = (err) => {
          console.warn('[HavilahCall] Signaling error:', err);
        };
      } catch (err) {
        console.error('[HavilahCall] Failed to initialize WebSocket:', err);
      }
    }

    /**
    /**
     * Checks if a peer is currently online for a given reference code
     */
    isPeerOnline(refCode) {
      if (refCode && this.peerPresenceMap) {
        return !!this.peerPresenceMap.get(refCode.toUpperCase().trim());
      }
      return !!this.lastPeerOnline;
    }

    /**
     * Dispatches signaling messages over the WebSocket
     */
    sendSignal(payload) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        const primaryRef = this.referenceCode ? this.referenceCode.split(',')[0].trim().toUpperCase() : '';
        const targetRef = payload.referenceCode || this.activeCallRef || primaryRef;
        const enriched = {
          ...payload,
          referenceCode: targetRef
        };
        this.ws.send(JSON.stringify(enriched));
      } else {
        console.warn('[HavilahCall] Cannot send signal; WebSocket not open. State:', this.ws?.readyState);
      }
    }

    /**
     * Subscribes to additional consultation cases dynamically without reconnecting
     */
    subscribe(refCodes) {
      const list = Array.isArray(refCodes) ? refCodes : [refCodes];
      const valid = list.map(r => (r || '').trim().toUpperCase()).filter(Boolean);
      if (valid.length === 0) return;
      this.sendSignal({
        action: 'subscribe',
        referenceCodes: valid
      });
    }

    /**
     * Drains any ICE candidates received prior to setRemoteDescription completion
     */
    async drainPendingCandidates() {
      if (!this.pc || !this.pc.remoteDescription) return;
      if (!this.pendingCandidates || this.pendingCandidates.length === 0) return;
      const queued = [...this.pendingCandidates];
      this.pendingCandidates = [];
      for (const cand of queued) {
        try {
          if (!cand || !cand.candidate) {
            await this.pc.addIceCandidate(null);
          } else {
            await this.pc.addIceCandidate(cand);
          }
          console.log('[HavilahCall] Added buffered ICE candidate successfully');
        } catch (e) {
          console.warn('[HavilahCall] Drain candidate error:', e.message);
        }
      }
    }

    /**
     * Constructs RTCConfiguration object according to standard or IP Shield mode
     */
    getIceConfiguration() {
      let iceServers = this.cachedIceServers || [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        {
          urls: [
            'turn:openrelay.metered.ca:80',
            'turn:openrelay.metered.ca:443',
            'turn:openrelay.metered.ca:443?transport=tcp'
          ],
          username: 'openrelay',
          credential: 'openrelay'
        }
      ];

      // Custom TURN override if configured in localStorage
      const customTurnRaw = localStorage.getItem('nd_custom_turn') || localStorage.getItem('havilah_custom_turn');
      if (customTurnRaw) {
        try {
          const customTurn = JSON.parse(customTurnRaw);
          if (customTurn && customTurn.url) {
            iceServers = [
              { urls: customTurn.url, username: customTurn.username, credential: customTurn.credential },
              ...iceServers
            ];
          }
        } catch (e) {}
      }

      if (this.ipShield) {
        // IP Shield ON: only allow TURN relays and mandate relay transport
        const relayOnlyServers = iceServers.filter(s => {
          const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
          return urls.some(u => typeof u === 'string' && u.startsWith('turn:'));
        });

        return {
          iceServers: relayOnlyServers.length > 0 ? relayOnlyServers : iceServers,
          iceTransportPolicy: 'relay',
          iceCandidatePoolSize: 0
        };
      }

      // Standard mode: P2P direct NAT discovery + TURN fallback
      return {
        iceServers,
        iceTransportPolicy: 'all',
        iceCandidatePoolSize: 1
      };
    }

    /**
     * Initiates an outgoing consultation call
     */
    async startCall(callerName, targetRef) {
      if (this.activeCallState !== 'idle') {
        alert('A call session is already active.');
        return;
      }

      this.activeCallRef = (targetRef || this.referenceCode || '').split(',')[0].trim().toUpperCase();

      // Ensure audio element is created and unlocked inside the user gesture
      this.ensureAudioElement();
      if (this.remoteAudio) {
        this.remoteAudio.play().catch(() => {});
      }

      // Ensure signaling connection is established before starting call negotiation
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          console.log('[HavilahCall] Awaiting in-flight signaling connection...');
          let count = 0;
          while (this.ws && this.ws.readyState === WebSocket.CONNECTING && count < 25) {
            await new Promise(r => setTimeout(r, 100));
            count++;
          }
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          console.warn('[HavilahCall] Signaling disconnected; reconnecting before call...');
          this.connectSignaling();
          let count = 0;
          while (this.ws && this.ws.readyState !== WebSocket.OPEN && count < 25) {
            await new Promise(r => setTimeout(r, 100));
            count++;
          }
        }
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
          alert('Secure call server is connecting. Please check your internet connection and try again in a few seconds.');
          this.endCallUI('Signaling not ready');
          return;
        }
      }

      try {
        this.updateStatus('Requesting microphone access...');

        // 1. Capture microphone audio stream
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

        this.updateStatus('Initializing encrypted channel...');

        // 2. Build PeerConnection with Opus negotiation
        const rtcConfig = this.getIceConfiguration();
        this.pc = new RTCPeerConnection(rtcConfig);

        // Add local audio tracks
        this.localStream.getAudioTracks().forEach(track => {
          this.pc.addTrack(track, this.localStream);
        });

        // Remote audio stream playback
        this.pc.ontrack = (event) => {
          this.ensureAudioElement();
          if (this.remoteAudio && event.streams && event.streams[0]) {
            this.remoteAudio.srcObject = event.streams[0];
            this.remoteAudio.play().catch(e => console.warn('[HavilahCall] Auto-play audio prevented:', e));
          }
        };

        // ICE candidate gathering with IP Shield filtering
        this.pc.onicecandidate = (event) => {
          if (!event.candidate) return;

          // IP Shield filter: drop any non-relay candidate
          if (this.ipShield && !event.candidate.candidate.includes('typ relay')) {
            return;
          }

          this.sendSignal({
            action: 'candidate',
            referenceCode: this.activeCallRef,
            candidate: event.candidate
          });
        };

        this.pendingCandidates = [];

        const handleConnected = () => {
          if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
          }
          if (this.activeCallState === 'connected') return;
          this.activeCallState = 'connected';
          this.startCallTimer();
          this.updateStatus('Connected');
          this.showCallOverlay();
          if (typeof this.onCallConnected === 'function') {
            this.onCallConnected();
          }
        };

        // Connection state watchers (both PeerConnection & ICE state)
        this.pc.onconnectionstatechange = () => {
          const state = this.pc ? this.pc.connectionState : 'closed';
          console.log(`[HavilahCall] WebRTC Connection State: ${state}`);

          if (state === 'connected') {
            handleConnected();
          } else if (['disconnected', 'failed', 'closed'].includes(state)) {
            this.endCallUI(state === 'failed' ? 'Connection failed' : 'Call ended');
          }
        };

        this.pc.oniceconnectionstatechange = () => {
          const iceState = this.pc ? this.pc.iceConnectionState : 'closed';
          console.log(`[HavilahCall] ICE Connection State: ${iceState}`);
          if (iceState === 'connected' || iceState === 'completed') {
            handleConnected();
          } else if (iceState === 'failed') {
            this.endCallUI('Relay connection failed');
          }
        };

        // Watchdog to prevent permanent stalls on subsequent calls
        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);
        this._watchdogTimer = setTimeout(() => {
          if (this.activeCallState === 'calling' || this.activeCallState === 'connecting') {
            console.warn('[HavilahCall] Connection watchdog timeout (20s):', {
              pcState: this.pc?.connectionState,
              iceState: this.pc?.iceConnectionState
            });
            if (this.pc && this.pc.connectionState !== 'connected' && typeof this.pc.restartIce === 'function') {
              try { this.pc.restartIce(); } catch (e) {}
            }
          }
        }, 20000);

        // 3. Create SDP Offer
        const offer = await this.pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false
        });

        await this.pc.setLocalDescription(offer);

        // 4. Send offer via signaling
        this.activeCallState = 'calling';
        this.sendSignal({
          action: 'offer',
          referenceCode: this.activeCallRef,
          callerName: callerName || (this.role === 'doctor' ? 'Medical Assessor' : 'Patient'),
          offer: { type: offer.type, sdp: offer.sdp },
          ipShield: this.ipShield
        });

        this.updateStatus('Ringing remote party...');
        this.showCallOverlay();
      } catch (err) {
        console.error('[HavilahCall] Error initiating call:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          alert('Microphone access is required for consultation calls. Please allow microphone permissions in your browser settings.');
        } else {
          alert('Failed to establish consultation call: ' + err.message);
        }
        this.endCallUI('Permission denied or mic error');
      }
    }

    /**
     * Answers an incoming consultation call
     */
    async answerCall() {
      if (!this.storedIncomingCall) return;

      this.hideIncomingCallOverlay();
      const callData = this.storedIncomingCall;
      this.storedIncomingCall = null;
      this.activeCallRef = callData.referenceCode || (this.referenceCode ? this.referenceCode.split(',')[0].trim().toUpperCase() : '');

      // Inherit caller's IP shield mode if enabled
      if (callData.ipShield) {
        this.ipShield = true;
      }

      try {
        // Ensure audio element is created and primed inside the user click gesture
        this.ensureAudioElement();
        if (this.remoteAudio) {
          this.remoteAudio.play().catch(() => {});
        }

        this.updateStatus('Connecting...');
        this.activeCallState = 'connecting';

        // 1. Capture microphone audio stream
        this.localStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          },
          video: false
        });

        // 2. Build PeerConnection
        const rtcConfig = this.getIceConfiguration();
        this.pc = new RTCPeerConnection(rtcConfig);

        this.localStream.getAudioTracks().forEach(track => {
          this.pc.addTrack(track, this.localStream);
        });

        this.pc.ontrack = (event) => {
          this.ensureAudioElement();
          if (this.remoteAudio && event.streams && event.streams[0]) {
            this.remoteAudio.srcObject = event.streams[0];
            this.remoteAudio.play().catch(e => console.warn('[HavilahCall] Auto-play audio prevented:', e));
          }
        };

        this.pc.onicecandidate = (event) => {
          if (!event.candidate) return;
          if (this.ipShield && !event.candidate.candidate.includes('typ relay')) {
            return;
          }
          this.sendSignal({
            action: 'candidate',
            referenceCode: this.activeCallRef,
            candidate: event.candidate
          });
        };

        const handleAnswerConnected = () => {
          if (this._watchdogTimer) {
            clearTimeout(this._watchdogTimer);
            this._watchdogTimer = null;
          }
          if (this.activeCallState === 'connected') return;
          this.activeCallState = 'connected';
          this.startCallTimer();
          this.updateStatus('Connected');
          this.showCallOverlay();
          if (typeof this.onCallConnected === 'function') {
            this.onCallConnected();
          }
        };

        this.pc.onconnectionstatechange = () => {
          const state = this.pc ? this.pc.connectionState : 'closed';
          console.log(`[HavilahCall] WebRTC Connection State: ${state}`);
          if (state === 'connected') {
            handleAnswerConnected();
          } else if (['disconnected', 'failed', 'closed'].includes(state)) {
            this.endCallUI(state === 'failed' ? 'Connection failed' : 'Call ended');
          }
        };

        this.pc.oniceconnectionstatechange = () => {
          const iceState = this.pc ? this.pc.iceConnectionState : 'closed';
          console.log(`[HavilahCall] ICE Connection State: ${iceState}`);
          if (iceState === 'connected' || iceState === 'completed') {
            handleAnswerConnected();
          } else if (iceState === 'failed') {
            this.endCallUI('Relay connection failed');
          }
        };

        // Callee watchdog timer
        if (this._watchdogTimer) clearTimeout(this._watchdogTimer);
        this._watchdogTimer = setTimeout(() => {
          if (this.activeCallState === 'connecting') {
            console.warn('[HavilahCall] Callee connection watchdog timeout (20s):', {
              connectionState: this.pc?.connectionState,
              iceState: this.pc?.iceConnectionState
            });
            if (this.pc && this.pc.connectionState !== 'connected') {
              this.updateStatus('Re-verifying audio connection...');
              this.drainPendingCandidates();
            }
          }
        }, 20000);

        // 3. Set remote description (caller offer) and drain buffered candidates
        await this.pc.setRemoteDescription(new RTCSessionDescription(callData.offer));
        await this.drainPendingCandidates();

        // 4. Create answer
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);

        // 5. Send answer over signaling
        this.activeCallState = 'connecting';
        this.sendSignal({
          action: 'answer',
          referenceCode: this.activeCallRef,
          answer: { type: answer.type, sdp: answer.sdp }
        });

        this.showCallOverlay();
      } catch (err) {
        console.error('[HavilahCall] Error answering call:', err);
        alert('Could not connect call: ' + err.message);
        this.endCallUI('Failed to establish audio channel');
      }
    }

    /**
     * Declines an incoming call
     */
    declineCall() {
      this.hideIncomingCallOverlay();
      this.sendSignal({
        action: 'decline',
        reason: 'User declined consultation'
      });
      this.storedIncomingCall = null;
      this.activeCallState = 'idle';
    }

    /**
     * Hangs up an active call
     */
    hangup() {
      this.sendSignal({
        action: 'hangup',
        reason: 'Normal hangup'
      });
      this.endCallUI('Call ended');
    }

    /**
     * Single teardown handler for all call completions
     */
    endCallUI(reason = 'Call ended') {
      const finalDuration = this.activeDurationSeconds;

      if (this._watchdogTimer) {
        clearTimeout(this._watchdogTimer);
        this._watchdogTimer = null;
      }

      this.stopCallTimer();
      this.hideIncomingCallOverlay();
      this.hideCallOverlay();

      // Stop local audio tracks to release microphone hardware back to OS
      if (this.localStream) {
        this.localStream.getTracks().forEach(t => {
          try { t.stop(); } catch (e) {}
        });
        this.localStream = null;
      }

      // Close PeerConnection
      if (this.pc) {
        this.pc.ontrack = null;
        this.pc.onicecandidate = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        try { this.pc.close(); } catch (e) {}
        this.pc = null;
      }

      // Detach audio playback
      if (this.remoteAudio) {
        this.remoteAudio.srcObject = null;
      }

      this.isMuted = false;
      this.isSpeaker = false;
      this.pendingCandidates = [];
      const callRef = this.activeCallRef || (this.referenceCode ? this.referenceCode.split(',')[0].trim().toUpperCase() : '');
      this.activeCallRef = null;
      this.storedIncomingCall = null;
      const wasActive = this.activeCallState !== 'idle';
      this.activeCallState = 'idle';

      this.updateStatus(reason);

      // Log call duration to referral audit trail if call lasted > 0 seconds
      if (wasActive && finalDuration > 0 && callRef) {
        this.logCallOutcome(finalDuration, reason, callRef);
      }

      if (typeof this.onCallEnded === 'function') {
        this.onCallEnded(finalDuration, reason);
      }
    }

    /**
     * Logs consultation outcome to Havilah backend
     */
    async logCallOutcome(durationSeconds, endReason, callRef) {
      try {
        const refToLog = callRef || this.referenceCode;
        if (!refToLog) return;
        await fetch('/api/v1/calls/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            referenceCode: refToLog.split(',')[0].trim().toUpperCase(),
            durationSeconds,
            callerRole: this.role,
            endReason
          })
        });
      } catch (e) {
        console.warn('[HavilahCall] Could not log call outcome:', e.message);
      }
    }

    /**
     * Soft mute toggle (keeps DTLS-SRTP connection alive, sends clean silence)
     */
    toggleMute() {
      if (!this.localStream) return;
      this.isMuted = !this.isMuted;

      this.localStream.getAudioTracks().forEach(track => {
        track.enabled = !this.isMuted;
      });

      const btn = document.getElementById('havilah-call-mute-btn');
      if (btn) {
        btn.classList.toggle('active-muted', this.isMuted);
        btn.innerHTML = this.isMuted ? '🔇 Unmute' : '🎙️ Mute';
      }
    }

    /**
     * Toggles audio output device between earpiece/default and secondary speaker
     */
    async toggleSpeaker() {
      if (!this.remoteAudio || typeof this.remoteAudio.setSinkId !== 'function') {
        console.info('[HavilahCall] setSinkId not supported by this browser; output routed to default device.');
        return;
      }

      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const outputs = devices.filter(d => d.kind === 'audiooutput');
        if (outputs.length < 2) return;

        this.isSpeaker = !this.isSpeaker;
        const targetId = this.isSpeaker ? outputs[1].deviceId : outputs[0].deviceId;
        await this.remoteAudio.setSinkId(targetId);

        const btn = document.getElementById('havilah-call-spk-btn');
        if (btn) {
          btn.innerHTML = this.isSpeaker ? '🔊 Speaker' : '🔈 Earpiece';
        }
      } catch (err) {
        console.warn('[HavilahCall] setSinkId error:', err);
      }
    }

    /**
     * IP Shield toggle handler
     */
    setIpShield(enabled) {
      this.ipShield = !!enabled;
      localStorage.setItem('havilah_call_ip_shield', this.ipShield ? 'true' : 'false');
      console.log(`[HavilahCall] IP Shield set to: ${this.ipShield}`);

      const shieldBadge = document.getElementById('havilah-call-shield-badge');
      if (shieldBadge) {
        shieldBadge.style.display = this.ipShield ? 'inline-flex' : 'none';
      }
    }

    /**
     * Starts call duration timer
     */
    startCallTimer() {
      this.stopCallTimer();
      this.callStartTime = Date.now();
      this.activeDurationSeconds = 0;

      const timerEl = document.getElementById('havilah-call-timer');
      if (timerEl) {
        timerEl.style.display = 'inline-block';
        timerEl.textContent = '00:00';
      }

      this.callTimerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - this.callStartTime) / 1000);
        this.activeDurationSeconds = elapsed;
        const mins = Math.floor(elapsed / 60);
        const secs = elapsed % 60;
        const formatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
        if (timerEl) {
          timerEl.textContent = formatted;
        }
      }, 1000);
    }

    stopCallTimer() {
      if (this.callTimerInterval) {
        clearInterval(this.callTimerInterval);
        this.callTimerInterval = null;
      }
    }

    updateStatus(text) {
      console.log(`[HavilahCall Status] ${text}`);
      const statusEl = document.getElementById('havilah-call-status-label');
      if (statusEl) {
        statusEl.textContent = text;
      }
      if (typeof this.onStatusChange === 'function') {
        this.onStatusChange(text);
      }
    }

    /**
     * Handles incoming messages from signaling WebSocket
     */
    handleSignalingMessage(msg) {
      switch (msg.event) {
        case 'incoming_call': {
          this.storedIncomingCall = msg;
          this.activeCallRef = msg.referenceCode || (this.referenceCode ? this.referenceCode.split(',')[0].trim().toUpperCase() : '');
          this.activeCallState = 'ringing';
          this.showIncomingCallOverlay(msg.callerName || 'Consultation Peer', msg.fromRole);
          this.sendSignal({ action: 'ringing', referenceCode: this.activeCallRef });
          if (typeof this.onIncomingCall === 'function') {
            try { this.onIncomingCall(msg); } catch (e) {}
          }
          break;
        }

        case 'call_ringing': {
          this.updateStatus('Ringing...');
          break;
        }

        case 'call_answered': {
          console.log('[HavilahCall] Received call_answered for ref:', msg.referenceCode);
          this.updateStatus('Answering...');
          if (this.pc && msg.answer) {
            this.pc.setRemoteDescription(new RTCSessionDescription(msg.answer))
              .then(() => {
                console.log('[HavilahCall] Remote answer applied; draining buffered candidates.');
                return this.drainPendingCandidates();
              })
              .catch(err => console.error('[HavilahCall] setRemoteDescription error on answer:', err));
          }
          break;
        }

        case 'candidate': {
          if (msg.candidate) {
            if (this.pc && this.pc.remoteDescription && this.pc.remoteDescription.type) {
              const candPayload = (!msg.candidate.candidate) ? null : msg.candidate;
              this.pc.addIceCandidate(candPayload)
                .catch(err => console.warn('[HavilahCall] addIceCandidate error:', err));
            } else {
              console.log('[HavilahCall] Buffering incoming ICE candidate (remoteDescription not ready)');
              if (!this.pendingCandidates) this.pendingCandidates = [];
              this.pendingCandidates.push(msg.candidate);
            }
          }
          break;
        }

        case 'call_declined': {
          this.endCallUI('Call was declined');
          break;
        }

        case 'call_ended': {
          this.endCallUI(msg.reason || 'Call ended by peer');
          break;
        }

        case 'callee_offline': {
          this.updateStatus(msg.message || 'Remote party is offline');
          alert(msg.message || 'Remote party is not currently online in the consultation room. A notification has been dispatched.');
          this.endCallUI('Party offline');
          break;
        }

        case 'peer_online': {
          const ref = (msg.referenceCode || this.referenceCode || '').split(',')[0].trim().toUpperCase();
          if (ref) {
            this.peerPresenceMap.set(ref, true);
          }
          this.lastPeerOnline = true;
          this.updatePeerPresence(true, msg.role, ref);
          break;
        }

        case 'peer_offline': {
          const ref = (msg.referenceCode || this.referenceCode || '').split(',')[0].trim().toUpperCase();
          if (ref) {
            this.peerPresenceMap.set(ref, false);
          }
          this.lastPeerOnline = false;
          this.updatePeerPresence(false, msg.role, ref);
          break;
        }
      }
    }

    /**
     * Centralized peer presence update helper
     */
    updatePeerPresence(isOnline, peerRole, refCode) {
      if (refCode) {
        const dot = document.getElementById(`presence-dot-${refCode}`);
        if (dot) {
          dot.style.background = isOnline ? '#10b981' : '#cbd5e1';
          dot.title = isOnline ? 'Online now' : 'Offline';
        }
        const text = document.getElementById(`presence-text-${refCode}`);
        if (text) {
          text.textContent = isOnline ? 'Online' : 'Offline';
          text.style.color = isOnline ? '#10b981' : '#94a3b8';
        }
        const badge = document.getElementById(`presence-badge-${refCode}`);
        if (badge) {
          badge.textContent = isOnline ? '🟢 Online' : '⚪ Offline';
          badge.style.background = isOnline ? '#dcfce7' : '#e2e8f0';
          badge.style.color = isOnline ? '#15803d' : '#475569';
        }
      }

      const aPill = document.getElementById('assessorPeerPresencePill');
      if (aPill) {
        const curRef = aPill.dataset.ref;
        if (!curRef || !refCode || curRef === refCode) {
          aPill.textContent = isOnline ? '🟢 Patient Online' : '⚪ Patient Offline';
          aPill.style.background = isOnline ? '#dcfce7' : '#e2e8f0';
          aPill.style.color = isOnline ? '#15803d' : '#475569';
        }
      }

      const ePill = document.getElementById('empPeerPresencePill');
      if (ePill) {
        ePill.textContent = isOnline ? '🟢 Doctor Online' : '⚪ Doctor Offline';
        ePill.style.background = isOnline ? '#dcfce7' : '#e2e8f0';
        ePill.style.color = isOnline ? '#15803d' : '#475569';
      }

      const dashPill = document.getElementById('dashboardDoctorPresencePill');
      if (dashPill) {
        dashPill.style.display = 'inline-block';
        dashPill.textContent = isOnline ? '🟢 Doctor Online' : '⚪ Doctor Offline';
        dashPill.style.background = isOnline ? '#dcfce7' : '#f1f5f9';
        dashPill.style.color = isOnline ? '#15803d' : '#64748b';
      }

      if (typeof this.onPeerPresence === 'function') {
        try {
          this.onPeerPresence(isOnline, peerRole, refCode);
        } catch (e) {}
      }
    }

    // =========================================================================
    // UI Helpers & In-Call Overlays
    // =========================================================================

    showIncomingCallOverlay(callerName, fromRole) {
      let overlay = document.getElementById('havilah-incoming-call-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'havilah-incoming-call-overlay';
        overlay.innerHTML = `
          <div class="h-call-incoming-card">
            <div class="h-call-pulse-ring"></div>
            <div class="h-call-avatar">📞</div>
            <div class="h-call-incoming-info">
              <h4 id="h-call-caller-name">Incoming Consultation Call</h4>
              <p id="h-call-caller-sub">Doctor is ready for your clinical consultation</p>
            </div>
            <div class="h-call-actions">
              <button id="h-call-accept-btn" class="h-btn-accept">✓ Accept</button>
              <button id="h-call-decline-btn" class="h-btn-decline">✕ Decline</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('h-call-accept-btn').addEventListener('click', () => this.answerCall());
        document.getElementById('h-call-decline-btn').addEventListener('click', () => this.declineCall());
      }

      const currentRef = this.activeCallRef || (this.referenceCode ? this.referenceCode.split(',')[0].trim().toUpperCase() : '');
      document.getElementById('h-call-caller-name').textContent = callerName;
      document.getElementById('h-call-caller-sub').textContent = fromRole === 'doctor'
        ? 'Medical Assessor is calling for consultation #' + currentRef
        : 'Employee is calling for consultation #' + currentRef;

      overlay.style.display = 'flex';

      // Play soft chime if user allows
      this.playChime();
    }

    hideIncomingCallOverlay() {
      const overlay = document.getElementById('havilah-incoming-call-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    showCallOverlay() {
      let overlay = document.getElementById('havilah-active-call-overlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'havilah-active-call-overlay';
        overlay.innerHTML = `
          <div class="h-active-call-box">
            <div class="h-call-header">
              <div class="h-call-status-pill">
                <span class="h-live-dot"></span>
                <span id="havilah-call-status-label">Connected</span>
              </div>
              <span id="havilah-call-timer" style="display:none;">00:00</span>
              <span id="havilah-call-shield-badge" class="h-shield-badge" style="display:${this.ipShield ? 'inline-flex' : 'none'};">
                🛡️ IP Shield Active
              </span>
            </div>
            <div class="h-call-body">
              <div class="h-call-soundwave">
                <span></span><span></span><span></span><span></span><span></span>
              </div>
              <p class="h-call-case-ref">Case: <span id="h-call-ref-display"></span></p>
            </div>
            <div class="h-call-controls">
              <button id="havilah-call-mute-btn" class="h-ctrl-btn">🎙️ Mute</button>
              <button id="havilah-call-spk-btn" class="h-ctrl-btn">🔊 Speaker</button>
              <button id="havilah-call-hangup-btn" class="h-ctrl-btn h-hangup">✕ End Call</button>
            </div>
          </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('havilah-call-mute-btn').addEventListener('click', () => this.toggleMute());
        document.getElementById('havilah-call-spk-btn').addEventListener('click', () => this.toggleSpeaker());
        document.getElementById('havilah-call-hangup-btn').addEventListener('click', () => this.hangup());
      }

      const currentRef = this.activeCallRef || (this.referenceCode ? this.referenceCode.split(',')[0].trim().toUpperCase() : '');
      const refEl = document.getElementById('h-call-ref-display');
      if (refEl) refEl.textContent = currentRef;
      overlay.style.display = 'flex';
    }

    hideCallOverlay() {
      const overlay = document.getElementById('havilah-active-call-overlay');
      if (overlay) overlay.style.display = 'none';
    }

    playChime() {
      try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
        osc.frequency.setValueAtTime(880, ctx.currentTime + 0.15); // A5
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch (e) {}
    }
  }

  // Inject UI Styles for Call Overlays
  const style = document.createElement('style');
  style.textContent = `
    #havilah-incoming-call-overlay {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 100000;
      display: none;
      align-items: center;
      justify-content: center;
      animation: hSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .h-call-incoming-card {
      background: rgba(15, 23, 42, 0.94);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(13, 148, 136, 0.4);
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.4), 0 0 20px rgba(13, 148, 136, 0.25);
      border-radius: 16px;
      padding: 18px 22px;
      display: flex;
      align-items: center;
      gap: 16px;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    .h-call-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #0d9488;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      animation: hBounce 1.5s infinite;
    }
    .h-call-incoming-info h4 { margin: 0 0 4px; font-size: 15px; font-weight: 600; color: #fff; }
    .h-call-incoming-info p { margin: 0; font-size: 12px; color: #94a3b8; max-width: 240px; }
    .h-call-actions { display: flex; gap: 10px; margin-left: 12px; }
    .h-btn-accept {
      background: #059669;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 99px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(5, 150, 105, 0.4);
      transition: all 0.2s;
    }
    .h-btn-accept:hover { background: #10b981; transform: translateY(-1px); }
    .h-btn-decline {
      background: #e11d48;
      color: #fff;
      border: none;
      padding: 8px 16px;
      border-radius: 99px;
      font-weight: 600;
      font-size: 13px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(225, 29, 72, 0.4);
      transition: all 0.2s;
    }
    .h-btn-decline:hover { background: #f43f5e; transform: translateY(-1px); }

    /* Active Call Overlay */
    #havilah-active-call-overlay {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 100000;
      display: none;
      animation: hSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }
    .h-active-call-box {
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(24px);
      -webkit-backdrop-filter: blur(24px);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 18px;
      padding: 16px 20px;
      box-shadow: 0 20px 48px rgba(0, 0, 0, 0.45);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      min-width: 280px;
    }
    .h-call-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      font-size: 12px;
    }
    .h-call-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #38bdf8;
      font-weight: 600;
    }
    .h-live-dot {
      width: 8px;
      height: 8px;
      background: #38bdf8;
      border-radius: 50%;
      animation: hPulse 1.2s infinite;
    }
    .h-shield-badge {
      background: rgba(13, 148, 136, 0.2);
      border: 1px solid #0d9488;
      color: #2dd4bf;
      padding: 2px 8px;
      border-radius: 99px;
      font-size: 11px;
      font-weight: 600;
    }
    .h-call-body {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 8px 0 14px;
    }
    .h-call-case-ref { margin: 8px 0 0; font-size: 12px; color: #94a3b8; font-weight: 500; }
    .h-call-soundwave {
      display: flex;
      align-items: center;
      gap: 4px;
      height: 24px;
    }
    .h-call-soundwave span {
      width: 4px;
      background: #0d9488;
      border-radius: 2px;
      animation: hWave 1s infinite ease-in-out;
    }
    .h-call-soundwave span:nth-child(1) { height: 8px; animation-delay: 0.1s; }
    .h-call-soundwave span:nth-child(2) { height: 16px; animation-delay: 0.2s; }
    .h-call-soundwave span:nth-child(3) { height: 22px; animation-delay: 0.3s; }
    .h-call-soundwave span:nth-child(4) { height: 14px; animation-delay: 0.4s; }
    .h-call-soundwave span:nth-child(5) { height: 6px; animation-delay: 0.5s; }
    .h-call-controls {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
    }
    .h-ctrl-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #fff;
      padding: 8px 12px;
      border-radius: 10px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .h-ctrl-btn:hover { background: rgba(255, 255, 255, 0.16); }
    .h-ctrl-btn.active-muted { background: rgba(225, 29, 72, 0.3); border-color: #e11d48; color: #fda4af; }
    .h-ctrl-btn.h-hangup {
      background: #e11d48;
      border-color: #e11d48;
      font-weight: 600;
    }
    .h-ctrl-btn.h-hangup:hover { background: #f43f5e; }

    @keyframes hSlideIn { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes hPulse { 0% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.85); } 100% { opacity: 1; transform: scale(1); } }
    @keyframes hBounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
    @keyframes hWave { 0%, 100% { transform: scaleY(0.4); } 50% { transform: scaleY(1); } }
  `;
  
  function injectCallStyles() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('havilah-call-styles')) return;
    style.id = 'havilah-call-styles';
    const target = document.head || document.documentElement || document.body;
    if (target) {
      target.appendChild(style);
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', injectCallStyles, { once: true });
    } else {
      injectCallStyles();
    }
  }

  // Expose singleton to window
  window.HavilahCall = new HavilahCallClient();

})(window);
