/**
 * @fileoverview Havilah Safety Module — Crisis Detection & Audit Trail Helpers
 * Crisis keyword scanning is LOCAL ONLY — no data is sent to any server.
 * @version 2.0.0
 */

(function () {
  'use strict';

  /* ──────────────────────────────────────────────
   *  Crisis Detector
   * ────────────────────────────────────────────── */

  /** @type {Object} */
  var CrisisDetector = {
    /** @type {number|null} */
    _debounceTimer: null,

    /**
     * Attach crisis monitoring to an input element.
     * Uses a 300ms debounce to avoid excessive scanning.
     * @param {HTMLElement} element - The textarea or input to monitor
     */
    attachToInput: function (element) {
      if (!element) return;
      var self = this;
      element.addEventListener('input', function () {
        if (self._debounceTimer) {
          clearTimeout(self._debounceTimer);
        }
        self._debounceTimer = setTimeout(function () {
          var result = self.scanText(element.value);
          if (result.detected) {
            self.showCrisisBanner(result.category);
          }
        }, 300);
      });
    },

    /**
     * Scan text against all crisis pattern regexes.
     * THIS IS LOCAL ONLY — no data is sent to any server.
     * @param {string} text - The text to scan
     * @returns {{ detected: boolean, category: string|null }}
     */
    scanText: function (text) {
      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { detected: false, category: null };
      }

      var patterns = WF_DATA.crisisPatterns;
      var categories = ['self_harm', 'severe_harassment', 'acute_crisis'];

      for (var c = 0; c < categories.length; c++) {
        var category = categories[c];
        var categoryPatterns = patterns[category];
        if (!categoryPatterns) continue;

        for (var p = 0; p < categoryPatterns.length; p++) {
          if (categoryPatterns[p].test(text)) {
            return { detected: true, category: category };
          }
        }
      }

      return { detected: false, category: null };
    },

    /**
     * Show the crisis intervention banner with emergency resources.
     * @param {string} category - The crisis category detected
     */
    showCrisisBanner: function (category) {
      var banner = document.getElementById('crisisBanner');
      var contactsContainer = document.getElementById('crisisContacts');
      if (!banner || !contactsContainer) return;

      var resources = WF_DATA.emergencyResources;
      var html = '';

      for (var i = 0; i < resources.length; i++) {
        var r = resources[i];
        html += '<div class="crisis-contact">';
        html += '<div class="crisis-contact-num">' + r.number + '</div>';
        html += '<div class="crisis-contact-label">' + r.name + ' — ' + r.description + '</div>';
        html += '</div>';
      }

      contactsContainer.innerHTML = html;
      banner.classList.add('visible');
    }
  };

  /**
   * Dismiss the crisis banner.
   */
  function dismissCrisisBanner() {
    var banner = document.getElementById('crisisBanner');
    if (banner) {
      banner.classList.remove('visible');
    }
  }

  /* ──────────────────────────────────────────────
   *  Audit Trail Helpers
   * ────────────────────────────────────────────── */

  /** @type {Object} */
  var WF_Audit = {

    /**
     * Compute SHA-256 hash of previousHash + payload using Web Crypto API.
     * @param {string} previousHash - The previous entry's hash or 'GENESIS'
     * @param {Object} payload - The event payload to hash
     * @returns {Promise<string>} Hex-encoded SHA-256 hash
     */
    computeHash: async function (previousHash, payload) {
      var input = previousHash + JSON.stringify(payload, Object.keys(payload).sort());
      var encoder = new TextEncoder();
      var data = encoder.encode(input);
      var hashBuffer = await crypto.subtle.digest('SHA-256', data);
      var hashArray = Array.from(new Uint8Array(hashBuffer));
      var hashHex = hashArray.map(function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
      return hashHex;
    },

    /**
     * Log an ISO 45003 control activation to the audit trail.
     * @param {string} tenantId - The company_id
     * @param {string} actorId - The user performing the action
     * @param {string} controlType - 'primary' or 'secondary'
     * @param {string} controlId - The control identifier (e.g., 'JDM-01')
     * @param {Object} details - Additional details about the activation
     * @returns {Promise<Object>} The created audit entry
     */
    logControlActivation: async function (tenantId, actorId, controlType, controlId, details) {
      var payload = {
        action: 'control_activation',
        control_type: controlType,
        control_id: controlId,
        details: details || {},
        timestamp: new Date().toISOString()
      };

      var storageKey = 'WF_AUDIT_LOG_' + tenantId;
      var log = [];
      try {
        var stored = localStorage.getItem(storageKey);
        if (stored) {
          log = JSON.parse(stored);
        }
      } catch (e) {
        log = [];
      }

      var previousHash = log.length > 0 ? log[log.length - 1].sha256_hash : 'GENESIS';
      var hash = await this.computeHash(previousHash, payload);

      var entry = {
        audit_id: crypto.randomUUID(),
        company_id: tenantId,
        actor_user_id: actorId,
        actor_role: 'system',
        event_type: 'control_activation',
        event_payload: Object.freeze(payload),
        previous_hash: previousHash,
        sha256_hash: hash,
        created_at: new Date().toISOString()
      };

      log.push(entry);
      localStorage.setItem(storageKey, JSON.stringify(log));
      return entry;
    },

    /**
     * Verify the integrity of the entire audit chain for a company.
     * Recomputes each hash and compares with stored values.
     * @param {string} companyId - The company_id to verify
     * @returns {Promise<{ valid: boolean, entries_checked: number, first_invalid_at: number|null }>}
     */
    verifyChain: async function (companyId) {
      var storageKey = 'WF_AUDIT_LOG_' + companyId;
      var log = [];
      try {
        var stored = localStorage.getItem(storageKey);
        if (stored) {
          log = JSON.parse(stored);
        }
      } catch (e) {
        return { valid: false, entries_checked: 0, first_invalid_at: null };
      }

      if (log.length === 0) {
        return { valid: true, entries_checked: 0, first_invalid_at: null };
      }

      for (var i = 0; i < log.length; i++) {
        var entry = log[i];
        var expectedPrevious = i === 0 ? 'GENESIS' : log[i - 1].sha256_hash;

        // Check previous hash linkage
        if (entry.previous_hash !== expectedPrevious) {
          return { valid: false, entries_checked: i + 1, first_invalid_at: i };
        }

        // Recompute hash and compare
        var recomputedHash = await this.computeHash(entry.previous_hash, entry.event_payload);
        if (recomputedHash !== entry.sha256_hash) {
          return { valid: false, entries_checked: i + 1, first_invalid_at: i };
        }
      }

      return { valid: true, entries_checked: log.length, first_invalid_at: null };
    }
  };

  /* ──────────────────────────────────────────────
   *  Initialization
   * ────────────────────────────────────────────── */

  document.addEventListener('DOMContentLoaded', function () {
    // Auto-attach crisis monitor to anonymous feedback textarea if it exists
    var feedbackTextarea = document.getElementById('anonFeedbackText');
    if (feedbackTextarea) {
      CrisisDetector.attachToInput(feedbackTextarea);
    }
  });

  /* ──────────────────────────────────────────────
   *  Global Exports
   * ────────────────────────────────────────────── */

  window.dismissCrisisBanner = dismissCrisisBanner;
  window.WF_CrisisDetector = CrisisDetector;
  window.WF_Audit = WF_Audit;

})();
