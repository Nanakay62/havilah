(() => {
  'use strict';

  let state = {
    assessor: null,
    doctors: [],
    queue: [],
    filteredQueue: [],
    hasMultipleCompanies: false,
    selectedCase: null,
    pagination: {
      page: 1,
      limit: 10,
      totalPages: 1,
      totalCount: 0,
    },
    sorting: {
      field: 'createdAt',
      asc: false,
    },
    filters: {
      search: '',
      company: 'all',
      doctor: 'all',
      status: 'active',
      settlement: 'all',
      datePreset: 'all',
      startDate: null,
      endDate: null,
    },
  };

  const API_BASE = '/api/v1/assessor';
  let pendingConfirmCompleteId = null;
  let lastModalOpener = null;
  let removeActiveFocusTrap = null;
  let warningCountdownTimer = null;

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeJsAttr(str) {
    const jsEscaped = String(str == null ? '' : str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, "\\'")
      .replace(/"/g, '\\"')
      .replace(/\r|\n/g, ' ')
      .replace(/</g, '\\x3c')
      .replace(/>/g, '\\x3e');
    return escapeHtml(jsEscaped);
  }

  function sanitizeSafeHref(rawHref, options = {}) {
    if (!rawHref || typeof rawHref !== 'string') return '#';
    const trimmed = rawHref.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (options.allowData) {
      const match = trimmed.match(/^data:(application\/pdf|image\/(?:png|jpeg|jpg|gif|webp)|text\/plain)(?:;[^;,=]+=[^;,]*)*;base64,([A-Za-z0-9+/=\s]+)$/i);
      if (match) {
        return `data:${match[1].toLowerCase()};base64,${match[2].replace(/\s+/g, '')}`;
      }
    }
    return '#';
  }

  function dataUriToBlob(dataUri) {
    const clean = sanitizeSafeHref(dataUri, { allowData: true });
    if (!clean.startsWith('data:')) return null;
    const commaIdx = clean.indexOf(',');
    if (commaIdx === -1) return null;
    const header = clean.slice(5, commaIdx);
    const mime = header.split(';')[0] || 'application/octet-stream';
    const b64 = clean.slice(commaIdx + 1);
    const binStr = atob(b64);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) {
      bytes[i] = binStr.charCodeAt(i);
    }
    return { blob: new Blob([bytes], { type: mime }), mime };
  }

  // --- Auto-Lock Security Watcher (15-min inactivity timeout) ---
  const INACTIVITY_TIMEOUT_SEC = 15 * 60; // 900 seconds (15 mins)
  const WARNING_THRESHOLD_SEC = 120; // 2:00 warning dialog threshold
  let secondsRemaining = INACTIVITY_TIMEOUT_SEC;
  let inactivityInterval = null;

  function formatCountdownMmSs(totalSec) {
    const clamped = Math.max(0, totalSec);
    const mins = Math.floor(clamped / 60);
    const secs = clamped % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  function initAutoLockTimer() {
    const resetTimer = () => {
      secondsRemaining = INACTIVITY_TIMEOUT_SEC;
      const warningModal = document.getElementById('autoLockWarningModal');
      if (warningModal && (warningModal.classList.contains('show') || warningModal.classList.contains('is-open'))) {
        closeModal('autoLockWarningModal');
      }
      if (warningCountdownTimer) {
        clearInterval(warningCountdownTimer);
        warningCountdownTimer = null;
      }
      updateTimerDisplay();
    };

    if (!window._assessorInactivityBound) {
      ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
        window.addEventListener(evt, resetTimer, { passive: true });
      });
      window._assessorInactivityBound = true;
    }

    if (inactivityInterval) clearInterval(inactivityInterval);
    updateTimerDisplay();
    inactivityInterval = setInterval(() => {
      if (!getAssessorToken()) return;

      secondsRemaining--;
      updateTimerDisplay();

      if (secondsRemaining === WARNING_THRESHOLD_SEC) {
        showAutoLockWarning();
      }

      if (secondsRemaining <= 0) {
        clearInterval(inactivityInterval);
        if (warningCountdownTimer) {
          clearInterval(warningCountdownTimer);
          warningCountdownTimer = null;
        }
        handleSecurityAutoLock();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('autoLockTimer');
    const mins = Math.floor(Math.max(0, secondsRemaining) / 60);
    const secs = Math.max(0, secondsRemaining) % 60;
    if (timerEl) {
      timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }

    const countdownEl = document.getElementById('lockWarningCountdown');
    if (countdownEl) {
      countdownEl.textContent = formatCountdownMmSs(secondsRemaining);
    }
  }

  function showAutoLockWarning() {
    const modal = document.getElementById('autoLockWarningModal');
    const countdownEl = document.getElementById('lockWarningCountdown');
    if (countdownEl) countdownEl.textContent = formatCountdownMmSs(secondsRemaining);
    openModal('autoLockWarningModal');

    if (warningCountdownTimer) clearInterval(warningCountdownTimer);
    warningCountdownTimer = setInterval(() => {
      if (countdownEl) countdownEl.textContent = formatCountdownMmSs(secondsRemaining);
      if (secondsRemaining <= 0 || !modal || !modal.classList.contains('show')) {
        clearInterval(warningCountdownTimer);
        warningCountdownTimer = null;
      }
    }, 1000);
  }

  window.resetInactivityTimerFromModal = () => {
    secondsRemaining = INACTIVITY_TIMEOUT_SEC;
    if (warningCountdownTimer) {
      clearInterval(warningCountdownTimer);
      warningCountdownTimer = null;
    }
    closeModal('autoLockWarningModal');
    updateTimerDisplay();
  };

  function handleSecurityAutoLock() {
    closeModal('autoLockWarningModal');
    clearAssessorToken();
    state.assessor = null;
    state.queue = [];
    checkAuth();
    alert('Security Notice: Your session was automatically locked after 15 minutes of inactivity to protect confidential medical records.');
  }

  // --- Auth & Utility Functions ---
  function showToast(message) {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');
    if (!toast || !toastMessage) return;
    toastMessage.textContent = message;
    toast.classList.add('show');
    setTimeout(() => {
      toast.classList.remove('show');
    }, 3500);
  }

  function getAssessorToken() {
    return localStorage.getItem('assessor_token');
  }

  function setAssessorToken(token) {
    localStorage.setItem('assessor_token', token);
  }

  function clearAssessorToken() {
    localStorage.removeItem('assessor_token');
  }

  async function assessorApiFetch(url, options = {}) {
    const token = getAssessorToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.message || data.error || 'Request failed');
    }
    return data;
  }

  function isUserClinicAdmin(assessorObj) {
    if (!assessorObj) return false;
    if (assessorObj.role === 'clinic_admin' || assessorObj.isLeadAssessor === true) return true;
    if (assessorObj.role === 'doctor') return false;
    if (assessorObj.doctorId) return false;
    // Fallback: If logged in as practice assessor account (e.g. Dr. Edith Clarke), default to clinic_admin = true
    return true;
  }

  function computeInitials(name) {
    const parts = String(name || 'DR').trim().split(/\s+/).filter(Boolean);
    const filtered = parts.filter(p => !/^dr\.?$/i.test(p));
    const source = filtered.length ? filtered : parts;
    if (source.length >= 2) return (source[0][0] + source[source.length - 1][0]).toUpperCase();
    return (source[0] || 'DR').slice(0, 2).toUpperCase();
  }

  async function checkAuth() {
    const token = getAssessorToken();
    const loginSection = document.getElementById('assessorLoginSection');
    const dashboardSection = document.getElementById('assessorDashboardSection');
    const headerControls = document.getElementById('authHeaderControls');
    const primaryNav = document.getElementById('portalPrimaryNav');

    if (!token) {
      if (loginSection) loginSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      if (headerControls) headerControls.style.display = 'none';
      if (primaryNav) primaryNav.style.display = 'none';
      return;
    }

    try {
      const res = await assessorApiFetch(`${API_BASE}/me`);
      state.assessor = res.assessor;

      const isClinicAdmin = isUserClinicAdmin(res.assessor);
      state.assessor.isClinicAdmin = isClinicAdmin;

      const nameDisplay = document.getElementById('assessorNameDisplay');
      const menuName = document.getElementById('assessorMenuName');
      const menuEmail = document.getElementById('assessorMenuEmail');
      const avatarEl = document.getElementById('assessorAvatarInitials');
      const manageStaffBtn = document.getElementById('manageStaffBtn');
      const doctorFilterField = document.getElementById('doctorFilterField');
      const doctorFilterSelect = document.getElementById('doctorFilterSelect');

      const displayName = res.assessor.name || 'Practitioner';
      if (nameDisplay) nameDisplay.textContent = displayName;
      if (menuName) menuName.textContent = displayName;
      if (menuEmail) menuEmail.textContent = res.assessor.email || 'Clinical account';
      if (avatarEl) avatarEl.textContent = computeInitials(displayName);

      if (manageStaffBtn) manageStaffBtn.style.display = isClinicAdmin ? 'inline-flex' : 'none';
      if (doctorFilterField) doctorFilterField.style.display = isClinicAdmin ? 'flex' : 'none';
      if (doctorFilterSelect) doctorFilterSelect.style.display = isClinicAdmin ? '' : 'none';

      if (loginSection) loginSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'block';
      if (headerControls) headerControls.style.display = 'flex';
      if (primaryNav) primaryNav.style.display = 'flex';

      initAutoLockTimer();
      if (isClinicAdmin) {
        fetchDoctorsList();
      }
      fetchAssessorQueue();
    } catch (err) {
      clearAssessorToken();
      if (loginSection) loginSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      if (headerControls) headerControls.style.display = 'none';
      if (primaryNav) primaryNav.style.display = 'none';
    }
  }

  window.focusReferralsView = () => {
    const refBtn = document.getElementById('navReferralsBtn');
    if (refBtn) refBtn.classList.add('active');
    const dash = document.getElementById('assessorDashboardSection');
    if (dash) dash.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  window.focusReferralSearch = () => {
    const searchEl = document.getElementById('searchInput');
    if (searchEl) {
      searchEl.focus();
      searchEl.select();
    }
  };

  // --- Clinician Staff Management ---
  async function fetchDoctorsList() {
    try {
      const res = await assessorApiFetch(`${API_BASE}/doctors`);
      state.doctors = res.data || [];
      updateDoctorDropdowns();
      const badge = document.getElementById('doctorCountBadge');
      if (badge) badge.textContent = state.doctors.length;
      renderDoctorsTable();
      if (state.queue.length > 0) {
        renderQueue();
      }
    } catch (err) {
      console.warn('Doctors list load notice:', err.message);
    }
  }

  function updateDoctorDropdowns() {
    const filterSelect = document.getElementById('doctorFilterSelect');
    const assignSelect = document.getElementById('modalDoctorAssignSelect');

    if (filterSelect) {
      const curFilter = filterSelect.value;
      let filterOpts = '<option value="all">All clinicians</option><option value="unassigned">Unassigned only</option>';
      state.doctors.forEach(doc => {
        if (doc.active) {
          filterOpts += `<option value="${escapeHtml(doc._id)}">${escapeHtml(doc.fullName)}</option>`;
        }
      });
      filterSelect.innerHTML = filterOpts;
      if (curFilter) filterSelect.value = curFilter;
    }

    if (assignSelect) {
      const curAssign = assignSelect.value;
      let assignOpts = '<option value="">Unassigned (Practice queue)</option>';
      state.doctors.forEach(doc => {
        if (doc.active) {
          assignOpts += `<option value="${escapeHtml(doc._id)}">${escapeHtml(doc.fullName)} (${escapeHtml(doc.specialty || 'General')})${doc.role === 'clinic_admin' ? ' [Lead]' : ''}</option>`;
        }
      });
      assignSelect.innerHTML = assignOpts;
      if (curAssign) assignSelect.value = curAssign;
    }
  }

  window.openManageDoctorsModal = () => {
    switchDoctorModalTab('roster');
    fetchDoctorsList();
    openModal('manageDoctorsModal');
  };

  window.switchDoctorModalTab = (tab) => {
    const rosterTab = document.getElementById('doctorRosterTab');
    const addTab = document.getElementById('addDoctorTab');
    const tabRosterBtn = document.getElementById('tabRosterBtn');
    const tabAddDoctorBtn = document.getElementById('tabAddDoctorBtn');
    const isAdd = tab === 'add';

    if (rosterTab) rosterTab.style.display = isAdd ? 'none' : 'block';
    if (addTab) addTab.style.display = isAdd ? 'block' : 'none';
    if (tabRosterBtn) {
      tabRosterBtn.classList.toggle('active', !isAdd);
      tabRosterBtn.setAttribute('aria-selected', String(!isAdd));
    }
    if (tabAddDoctorBtn) {
      tabAddDoctorBtn.classList.toggle('active', isAdd);
      tabAddDoctorBtn.setAttribute('aria-selected', String(isAdd));
    }
  };

  function renderDoctorsTable() {
    const tbody = document.getElementById('doctorsTableBody');
    if (!tbody) return;

    if (!state.doctors || state.doctors.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: var(--space-6); color: var(--text-muted);">
            No clinicians registered in this practice yet. Use Add clinician to onboard staff.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.doctors.map(doc => {
      const roleBadge = doc.role === 'clinic_admin'
        ? '<span class="badge badge-warning">Clinic admin</span>'
        : '<span class="badge badge-neutral">Attending</span>';

      const statusBadge = doc.active
        ? '<span class="badge badge-success">Active</span>'
        : '<span class="badge badge-danger">Deactivated</span>';

      const isCurrent = state.assessor?.doctorId && String(state.assessor.doctorId) === String(doc._id);

      return `
        <tr>
          <td style="font-weight: var(--weight-semibold); color: var(--text);">${escapeHtml(doc.fullName)}${isCurrent ? ' (You)' : ''}${doc.mdcNumber ? `<div class="text-subtle-xs" style="font-weight: var(--weight-regular);">MDC: ${escapeHtml(doc.mdcNumber)}</div>` : ''}</td>
          <td style="color: var(--text-muted);">${escapeHtml(doc.specialty || 'General Practitioner')}</td>
          <td>${roleBadge}</td>
          <td class="tabular-nums">${Number(doc.activeCaseCount || 0)} active</td>
          <td style="font-size: var(--text-sm); color: var(--text-muted);">${escapeHtml(doc.email)}<br><span style="color: var(--text-subtle);">${escapeHtml(doc.phone || 'No phone')}</span></td>
          <td>${statusBadge}</td>
          <td style="text-align: right;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="toggleDoctorStatus('${escapeJsAttr(doc._id)}')" ${isCurrent ? 'disabled' : ''}>
              ${doc.active ? 'Deactivate' : 'Activate'}
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  window.handleCreateDoctorSubmit = async (event) => {
    event.preventDefault();
    const btn = document.getElementById('createDoctorSubmitBtn');
    const fullName = document.getElementById('newDocFullName').value.trim();
    const email = document.getElementById('newDocEmail').value.trim();
    const password = document.getElementById('newDocPassword').value;
    const specialty = document.getElementById('newDocSpecialty').value.trim();
    const phone = document.getElementById('newDocPhone').value.trim();
    const mdcNumber = (document.getElementById('newDocMdcNumber')?.value || '').trim();
    const role = document.getElementById('newDocRole').value;

    btn.disabled = true;
    btn.textContent = 'Creating Clinician Account...';

    try {
      const res = await assessorApiFetch(`${API_BASE}/doctors`, {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, specialty, phone, mdcNumber, role }),
      });

      showToast(`Clinician ${res.data.fullName} registered successfully!`);
      document.getElementById('addDoctorForm').reset();
      await fetchDoctorsList();
      switchDoctorModalTab('roster');
    } catch (err) {
      alert('Error creating clinician account: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Create Clinician Account';
    }
  };

  window.toggleDoctorStatus = async (doctorId) => {
    try {
      const res = await assessorApiFetch(`${API_BASE}/doctors/${doctorId}/toggle-status`, {
        method: 'PATCH',
      });
      showToast(res.message);
      await fetchDoctorsList();
      fetchAssessorQueue();
    } catch (err) {
      alert('Error toggling clinician status: ' + err.message);
    }
  };

  window.submitModalAssignDoctor = async () => {
    if (!state.selectedCase) return;
    const id = state.selectedCase._id;
    const doctorId = document.getElementById('modalDoctorAssignSelect')?.value || null;
    const btn = document.getElementById('modalAssignDoctorBtn');

    if (btn) { btn.disabled = true; btn.textContent = 'Delegating...'; }

    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${id}/assign-doctor`, {
        method: 'PATCH',
        body: JSON.stringify({ doctorId }),
      });

      state.selectedCase = res.data;
      const item = state.queue.find(r => r._id === id);
      if (item) {
        item.assignedDoctorId = res.data.assignedDoctorId;
        item.delegatedAt = res.data.delegatedAt;
        item.delegatedBy = res.data.delegatedBy;
      }

      showToast(res.message);

      // Update badge in modal
      const badgeEl = document.getElementById('modalTriageDelegatedBadge');
      if (badgeEl) {
        if (res.data.assignedDoctorId) {
          const docName = res.data.assignedDoctorId.fullName || 'Assigned Clinician';
          badgeEl.textContent = `Assigned: ${docName}`;
          badgeEl.className = 'badge badge-success';
        } else {
          badgeEl.textContent = 'Unassigned';
          badgeEl.className = 'badge badge-neutral';
        }
      }

      const metaEl = document.getElementById('modalDelegationMeta');
      if (metaEl) {
        if (res.data.delegatedAt) {
          metaEl.style.display = 'block';
          metaEl.textContent = `Delegated on ${new Date(res.data.delegatedAt).toLocaleString()}`;
        } else {
          metaEl.style.display = 'none';
        }
      }

      processFilteredQueue();
      fetchDoctorsList();
    } catch (err) {
      alert('Error delegating referral: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Delegate'; }
    }
  };

  window.quickAssignDoctor = async (referralId, doctorId) => {
    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${referralId}/assign-doctor`, {
        method: 'PATCH',
        body: JSON.stringify({ doctorId: doctorId || null }),
      });

      const item = state.queue.find(r => r._id === referralId);
      if (item && res.data) {
        item.assignedDoctorId = res.data.assignedDoctorId;
        item.delegatedAt = res.data.delegatedAt;
        item.delegatedBy = res.data.delegatedBy;
      }

      showToast(res.message || 'Clinician assignment updated.');
      processFilteredQueue();
      updateKPIs();
      fetchDoctorsList();
    } catch (err) {
      alert('Error assigning clinician: ' + err.message);
      renderQueue();
    }
  };

  let pendingAssessor2faToken = null;

  window.resetAssessor2faStep = () => {
    pendingAssessor2faToken = null;
    const credsGroup = document.getElementById('assessorCredsGroup');
    const twoFaGroup = document.getElementById('assessor2faGroup');
    const emailEl = document.getElementById('assessorEmailInput');
    const passEl = document.getElementById('assessorPasswordInput');
    const codeEl = document.getElementById('assessor2faCodeInput');
    const btn = document.getElementById('assessorLoginBtn');
    if (credsGroup) credsGroup.style.display = 'block';
    if (twoFaGroup) twoFaGroup.style.display = 'none';
    if (emailEl) emailEl.required = true;
    if (passEl) passEl.required = true;
    if (codeEl) codeEl.value = '';
    if (btn) btn.textContent = 'Sign in';
  };

  window.handleAssessorLogin = async (event) => {
    event.preventDefault();
    const email = document.getElementById('assessorEmailInput').value.trim();
    const password = document.getElementById('assessorPasswordInput').value;
    const codeEl = document.getElementById('assessor2faCodeInput');
    const twoFaCode = codeEl ? codeEl.value.trim() : '';
    const btn = document.getElementById('assessorLoginBtn');

    btn.disabled = true;
    btn.textContent = pendingAssessor2faToken ? 'Verifying 2FA...' : 'Signing in...';

    try {
      let res;
      if (pendingAssessor2faToken) {
        if (!twoFaCode) throw new Error('Enter your 6-digit authenticator code or recovery code.');
        res = await assessorApiFetch(`${API_BASE}/login/verify-2fa`, {
          method: 'POST',
          body: JSON.stringify({ temp_token: pendingAssessor2faToken, code: twoFaCode }),
        });
      } else {
        res = await assessorApiFetch(`${API_BASE}/login`, {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
      }

      if (res && res.requires_2fa && res.temp_token) {
        pendingAssessor2faToken = res.temp_token;
        const credsGroup = document.getElementById('assessorCredsGroup');
        const twoFaGroup = document.getElementById('assessor2faGroup');
        const emailEl = document.getElementById('assessorEmailInput');
        const passEl = document.getElementById('assessorPasswordInput');
        if (credsGroup) credsGroup.style.display = 'none';
        if (twoFaGroup) twoFaGroup.style.display = 'block';
        if (emailEl) emailEl.required = false;
        if (passEl) passEl.required = false;
        if (codeEl) codeEl.focus();
        btn.disabled = false;
        btn.textContent = 'Verify 2FA & sign in';
        return;
      }

      pendingAssessor2faToken = null;
      setAssessorToken(res.token);
      showToast(`Welcome, ${res.assessor.name}!`);
      checkAuth();
    } catch (err) {
      alert(err.message || 'Login failed');
    } finally {
      if (!pendingAssessor2faToken) {
        btn.disabled = false;
        btn.textContent = 'Sign in';
      } else {
        btn.disabled = false;
      }
    }
  };

  window.closeFiltersPopover = () => {
    const popover = document.getElementById('filtersPopover');
    const backdrop = document.getElementById('filtersBackdrop');
    const btn = document.getElementById('filtersToggleBtn');
    if (popover) popover.classList.remove('open');
    if (backdrop) backdrop.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  window.toggleFiltersPopover = (event) => {
    if (event) event.stopPropagation();
    window.closeAssessorUserMenu();
    window.closeExportMenu();
    window.closeAllRowActionMenus();
    const popover = document.getElementById('filtersPopover');
    const backdrop = document.getElementById('filtersBackdrop');
    const btn = document.getElementById('filtersToggleBtn');
    if (!popover || !btn) return;
    const isOpen = popover.classList.toggle('open');
    if (backdrop) backdrop.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  window.closeAssessorUserMenu = () => {
    const menu = document.getElementById('assessorUserMenu');
    const btn = document.getElementById('assessorUserMenuBtn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  window.toggleAssessorUserMenu = (event) => {
    if (event) event.stopPropagation();
    window.closeExportMenu();
    window.closeFiltersPopover();
    window.closeAllRowActionMenus();
    const menu = document.getElementById('assessorUserMenu');
    const btn = document.getElementById('assessorUserMenuBtn');
    if (!menu || !btn) return;
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  window.closeExportMenu = () => {
    const menu = document.getElementById('exportMenuDropdown');
    const btn = document.getElementById('exportMenuBtn');
    if (menu) menu.classList.remove('open');
    if (btn) btn.setAttribute('aria-expanded', 'false');
  };

  window.toggleExportMenu = (event) => {
    if (event) event.stopPropagation();
    window.closeAssessorUserMenu();
    window.closeFiltersPopover();
    window.closeAllRowActionMenus();
    const menu = document.getElementById('exportMenuDropdown');
    const btn = document.getElementById('exportMenuBtn');
    if (!menu || !btn) return;
    const isOpen = menu.classList.toggle('open');
    btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  };

  document.addEventListener('click', (e) => {
    const userWrap = document.getElementById('assessorUserMenuWrap');
    if (userWrap && !userWrap.contains(e.target)) {
      window.closeAssessorUserMenu();
    }
    const exportWrap = document.getElementById('exportMenuWrap');
    if (exportWrap && !exportWrap.contains(e.target)) {
      window.closeExportMenu();
    }
    const filtersWrap = document.getElementById('filtersMenuWrap');
    if (filtersWrap && !filtersWrap.contains(e.target)) {
      window.closeFiltersPopover();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      window.closeAssessorUserMenu();
      window.closeExportMenu();
      window.closeFiltersPopover();
      window.closeAllRowActionMenus();
      const openBackdrop = document.querySelector('.modal-backdrop.show');
      if (openBackdrop && openBackdrop.id) {
        if (openBackdrop.id === 'autoLockWarningModal') {
          window.resetInactivityTimerFromModal();
        } else {
          window.closeModal(openBackdrop.id);
        }
      }
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      const dash = document.getElementById('assessorDashboardSection');
      if (dash && dash.style.display !== 'none') {
        e.preventDefault();
        window.focusReferralSearch();
      }
    }
  });

  window.logoutAssessor = () => {
    openModal('assessorSignOutModal');
  };

  window.confirmLogoutAssessor = () => {
    closeModal('assessorSignOutModal');
    clearAssessorToken();
    state.assessor = null;
    state.queue = [];
    checkAuth();
    showToast('Signed out of Assessor Portal');
  };

  // --- Queue Data & Processing ---
  function showKpiSkeletons() {
    ['kpiActiveCases', 'kpiAwaitingAppt', 'kpiCompletedMonth', 'kpiOutstandingAmount'].forEach((id) => {
      const node = document.getElementById(id);
      if (node) {
        node.innerHTML = '<span class="skeleton stat-skeleton-value" aria-hidden="true"></span>';
      }
    });
  }

  window.fetchAssessorQueue = async () => {
    if (!state.queue || state.queue.length === 0) {
      showKpiSkeletons();
    }
    try {
      const res = await assessorApiFetch(`${API_BASE}/queue`);
      state.queue = res.data || [];
      updateCompanyFilter();
      processFilteredQueue();
      updateKPIs();

      // Initialize doctor call signaling for active cases
      initDoctorCallSignaling();
    } catch (err) {
      console.error('Queue load error', err);
      updateKPIs();
      showToast('Error loading queue: ' + err.message);
    }
  };

  function initDoctorCallSignaling() {
    if (!window.HavilahCall) return;
    const token = getAssessorToken();
    if (!token) return;

    const activeRefs = (state.queue || [])
      .filter(r => r.referenceCode && r.status !== 'completed' && r.status !== 'archived')
      .map(r => r.referenceCode.trim().toUpperCase());

    if (activeRefs.length === 0) return;

    window.HavilahCall.init({
      role: 'doctor',
      referenceCode: activeRefs.join(','),
      token: token,
      onPeerPresence: (isOnline, peerRole, refCode) => {
        if (refCode) {
          const dot = document.getElementById(`presence-dot-${refCode}`);
          if (dot) {
            dot.classList.toggle('is-online', Boolean(isOnline));
            dot.title = isOnline ? 'Patient is Online now' : 'Patient is Offline';
          }
        }
        if (state.selectedCase && (!refCode || state.selectedCase.referenceCode === refCode)) {
          const pill = document.getElementById('assessorPeerPresencePill');
          if (pill) {
            pill.textContent = isOnline ? 'Patient online' : 'Patient offline';
            pill.className = isOnline ? 'badge badge-success' : 'badge badge-neutral';
            pill.style.background = '';
            pill.style.color = '';
            pill.style.borderColor = '';
          }
        }
      },
      onIncomingCall: (callData) => {
        console.log('[AssessorPortal] Incoming consultation call for:', callData.referenceCode);
        const matched = (state.queue || []).find(r => r.referenceCode === callData.referenceCode);
        if (matched) {
          if (!state.selectedCase || state.selectedCase.referenceCode !== callData.referenceCode) {
            window.openCaseDetail(matched._id);
          }
        }
      },
      onCallEnded: (durationSeconds) => {
        if (durationSeconds > 0) {
          const badge = document.getElementById('assessorCallDurationBadge');
          const text = document.getElementById('assessorCallDurationText');
          if (badge && text) {
            const mins = Math.floor(durationSeconds / 60);
            const secs = durationSeconds % 60;
            text.textContent = `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
            badge.style.display = 'inline-flex';
          }
          const notesInput = document.getElementById('scheduleNotesInput');
          if (notesInput && !notesInput.value.includes('Call completed')) {
            const prev = notesInput.value ? `${notesInput.value} | ` : '';
            notesInput.value = `${prev}Call completed (${Math.floor(durationSeconds / 60)}m ${durationSeconds % 60}s)`;
          }
        }
      }
    });
  }

  window.quickCallCase = (refCode, patientName) => {
    if (!window.HavilahCall) {
      alert('Secure call engine is initializing. Please try again in a moment.');
      return;
    }
    const docName = (state.assessor?.name || state.profile?.fullName) ? `Dr. ${state.assessor?.name || state.profile?.fullName}` : 'Medical Assessor';
    window.HavilahCall.startCall(docName, refCode);
  };

  function updateKPIs() {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();

    let activeCases = 0;
    let awaitingAppointment = 0;
    let completedThisMonth = 0;
    let unbilledCompletedThisMonth = 0;
    let outstandingAmount = 0;
    let unsettledCount = 0;

    state.queue.forEach((r) => {
      const st = (r.status || 'pending').toLowerCase();
      if (st === 'archived') return;

      if (st === 'pending' || st === 'scheduled') {
        activeCases++;
      }

      if (st === 'pending' && !r.scheduledAt) {
        awaitingAppointment++;
      }

      if (st === 'completed') {
        const closedRaw = r.clinicalDetails?.completedAt || r.updatedAt || r.createdAt;
        const closedDate = closedRaw ? new Date(closedRaw) : null;
        if (closedDate && !isNaN(closedDate.getTime()) && closedDate.getMonth() === curMonth && closedDate.getFullYear() === curYear) {
          completedThisMonth++;
          if (!r.billing?.isBilled) {
            unbilledCompletedThisMonth++;
          }
        }
      }

      const amount = Number(r.billing?.amount || 0);
      const settlement = r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled');
      if ((r.billing?.isBilled || st === 'completed') && settlement !== 'settled' && amount > 0) {
        outstandingAmount += amount;
        unsettledCount++;
      }
    });

    const curr = state.assessor?.billingSettings?.defaultCurrency || 'GHS';

    const activeEl = document.getElementById('kpiActiveCases');
    const awaitingEl = document.getElementById('kpiAwaitingAppt');
    const completedEl = document.getElementById('kpiCompletedMonth');
    const completedHelperEl = document.getElementById('kpiCompletedMonthHelper');
    const outstandingLabelEl = document.getElementById('kpiOutstandingLabel');
    const outstandingAmountEl = document.getElementById('kpiOutstandingAmount');
    const outstandingHelperEl = document.getElementById('kpiOutstandingHelper');
    const feeHeaderEl = document.getElementById('thFeeHeader');

    if (activeEl) activeEl.textContent = String(activeCases);
    if (awaitingEl) awaitingEl.textContent = String(awaitingAppointment);
    if (completedEl) completedEl.textContent = String(completedThisMonth);
    if (completedHelperEl) {
      completedHelperEl.textContent = (completedThisMonth > 0 && unbilledCompletedThisMonth === completedThisMonth)
        ? 'Ready to bill'
        : 'Closed this month';
    }
    if (outstandingLabelEl) outstandingLabelEl.textContent = `Outstanding (${curr})`;
    if (outstandingAmountEl) {
      outstandingAmountEl.textContent = outstandingAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
    if (outstandingHelperEl) {
      outstandingHelperEl.textContent = `${unsettledCount} unsettled ${unsettledCount === 1 ? 'invoice' : 'invoices'}`;
    }
    if (feeHeaderEl) {
      feeHeaderEl.textContent = `Fee (${curr})`;
    }
  }

  function updateCompanyFilter() {
    const select = document.getElementById('companyFilterSelect');
    const exportSelect = document.getElementById('exportCompanySelect');
    if (!select) return;

    const currentVal = select.value;
    const companies = new Map();
    state.queue.forEach((r) => {
      if (r.tenantId) {
        const id = r.tenantId._id || r.tenantId;
        const name = r.tenantId.company_name || r.tenantId.companyName || 'Company';
        companies.set(String(id), name);
      }
    });

    state.hasMultipleCompanies = companies.size > 1;
    const table = document.getElementById('referralsTable');
    if (table) {
      table.classList.toggle('hide-company-col', !state.hasMultipleCompanies);
    }
    if (!state.hasMultipleCompanies && state.sorting.field === 'company') {
      state.sorting.field = 'createdAt';
      state.sorting.asc = false;
    }

    let optionsHtml = '<option value="all">All client companies</option>';
    companies.forEach((name, id) => {
      optionsHtml += `<option value="${escapeHtml(id)}">${escapeHtml(name)}</option>`;
    });

    select.innerHTML = optionsHtml;
    if (companies.has(currentVal)) select.value = currentVal;

    if (exportSelect) exportSelect.innerHTML = optionsHtml;
  }

  function syncStatusTabs(statusVal) {
    const activeTab = document.getElementById('statusTabActive');
    const completedTab = document.getElementById('statusTabCompleted');
    const allTab = document.getElementById('statusTabAll');

    const map = [
      [activeTab, statusVal === 'active'],
      [completedTab, statusVal === 'completed'],
      [allTab, statusVal === 'all' || statusVal === 'all_including_archived'],
    ];
    map.forEach(([el, isActive]) => {
      if (!el) return;
      el.classList.toggle('active', isActive);
      el.setAttribute('aria-selected', String(isActive));
    });
  }

  window.selectStatusTab = (tabValue) => {
    state.filters.status = tabValue;
    const statusSelect = document.getElementById('statusFilterSelect');
    if (statusSelect) statusSelect.value = tabValue;
    syncStatusTabs(tabValue);
    state.pagination.page = 1;
    processFilteredQueue();
  };

  window.handleSearchChange = () => {
    state.filters.search = document.getElementById('searchInput')?.value.trim().toLowerCase() || '';
    state.pagination.page = 1;
    processFilteredQueue();
  };

  window.handleDatePresetChange = () => {
    const preset = document.getElementById('datePresetSelect')?.value || 'all';
    state.filters.datePreset = preset;
    const customContainer = document.getElementById('customDateRangeContainer');

    const now = new Date();
    if (preset === 'this_month') {
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      state.filters.startDate = firstDay;
      state.filters.endDate = now;
      if (customContainer) customContainer.style.display = 'none';
    } else if (preset === 'last_month') {
      const firstDayLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastDayLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      state.filters.startDate = firstDayLastMonth;
      state.filters.endDate = lastDayLastMonth;
      if (customContainer) customContainer.style.display = 'none';
    } else if (preset === 'custom') {
      if (customContainer) customContainer.style.display = 'flex';
      const sVal = document.getElementById('customStartDate')?.value;
      const eVal = document.getElementById('customEndDate')?.value;
      state.filters.startDate = sVal ? new Date(sVal) : null;
      state.filters.endDate = eVal ? new Date(eVal) : null;
    } else {
      state.filters.startDate = null;
      state.filters.endDate = null;
      if (customContainer) customContainer.style.display = 'none';
    }

    state.pagination.page = 1;
    processFilteredQueue();
  };

  window.applyQueueFilter = () => {
    state.filters.company = document.getElementById('companyFilterSelect')?.value || 'all';
    state.filters.doctor = document.getElementById('doctorFilterSelect')?.value || 'all';
    state.filters.status = document.getElementById('statusFilterSelect')?.value || 'active';
    state.filters.settlement = document.getElementById('settlementFilterSelect')?.value || 'all';

    syncStatusTabs(state.filters.status);

    if (state.filters.datePreset === 'custom') {
      const sVal = document.getElementById('customStartDate')?.value;
      const eVal = document.getElementById('customEndDate')?.value;
      state.filters.startDate = sVal ? new Date(sVal) : null;
      state.filters.endDate = eVal ? new Date(eVal) : null;
    }

    state.pagination.page = 1;
    processFilteredQueue();
  };

  window.removeQueueFilter = (key) => {
    if (key === 'search') {
      state.filters.search = '';
      const el = document.getElementById('searchInput');
      if (el) el.value = '';
    } else if (key === 'company') {
      state.filters.company = 'all';
      const el = document.getElementById('companyFilterSelect');
      if (el) el.value = 'all';
    } else if (key === 'doctor') {
      state.filters.doctor = 'all';
      const el = document.getElementById('doctorFilterSelect');
      if (el) el.value = 'all';
    } else if (key === 'status') {
      state.filters.status = 'active';
      const el = document.getElementById('statusFilterSelect');
      if (el) el.value = 'active';
      syncStatusTabs('active');
    } else if (key === 'settlement') {
      state.filters.settlement = 'all';
      const el = document.getElementById('settlementFilterSelect');
      if (el) el.value = 'all';
    } else if (key === 'datePreset') {
      state.filters.datePreset = 'all';
      state.filters.startDate = null;
      state.filters.endDate = null;
      const el = document.getElementById('datePresetSelect');
      if (el) el.value = 'all';
      const sEl = document.getElementById('customStartDate');
      const eEl = document.getElementById('customEndDate');
      const customContainer = document.getElementById('customDateRangeContainer');
      if (sEl) sEl.value = '';
      if (eEl) eEl.value = '';
      if (customContainer) customContainer.style.display = 'none';
    }
    state.pagination.page = 1;
    processFilteredQueue();
  };

  window.clearAllQueueFilters = () => {
    const resetStatus = state.filters.status === 'active' ? 'all' : 'active';
    state.filters = {
      search: '',
      company: 'all',
      doctor: 'all',
      status: resetStatus,
      settlement: 'all',
      datePreset: 'all',
      startDate: null,
      endDate: null,
    };
    const searchEl = document.getElementById('searchInput');
    const compEl = document.getElementById('companyFilterSelect');
    const docEl = document.getElementById('doctorFilterSelect');
    const statusEl = document.getElementById('statusFilterSelect');
    const settEl = document.getElementById('settlementFilterSelect');
    const dateEl = document.getElementById('datePresetSelect');
    const sEl = document.getElementById('customStartDate');
    const eEl = document.getElementById('customEndDate');
    const customContainer = document.getElementById('customDateRangeContainer');

    if (searchEl) searchEl.value = '';
    if (compEl) compEl.value = 'all';
    if (docEl) docEl.value = 'all';
    if (statusEl) statusEl.value = resetStatus;
    if (settEl) settEl.value = 'all';
    if (dateEl) dateEl.value = 'all';
    if (sEl) sEl.value = '';
    if (eEl) eEl.value = '';
    if (customContainer) customContainer.style.display = 'none';

    syncStatusTabs(resetStatus);
    state.pagination.page = 1;
    processFilteredQueue();
  };

  function renderActiveFilterChips() {
    const container = document.getElementById('activeFilterChips');
    const countBadge = document.getElementById('filtersActiveCount');

    const chips = [];
    if (state.filters.search) {
      chips.push({ key: 'search', label: `Search: "${state.filters.search}"` });
    }
    if (state.filters.company !== 'all') {
      const sel = document.getElementById('companyFilterSelect');
      const txt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : 'Company';
      chips.push({ key: 'company', label: `Client: ${txt}` });
    }
    if (state.filters.doctor && state.filters.doctor !== 'all') {
      const sel = document.getElementById('doctorFilterSelect');
      const txt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : 'Clinician';
      chips.push({ key: 'doctor', label: `Clinician: ${txt}` });
    }
    if (state.filters.status !== 'active') {
      const sel = document.getElementById('statusFilterSelect');
      const txt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : state.filters.status;
      chips.push({ key: 'status', label: `Status: ${txt}` });
    }
    if (state.filters.settlement !== 'all') {
      const sel = document.getElementById('settlementFilterSelect');
      const txt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : state.filters.settlement;
      chips.push({ key: 'settlement', label: `Settlement: ${txt}` });
    }
    if (state.filters.datePreset !== 'all') {
      const sel = document.getElementById('datePresetSelect');
      const txt = sel && sel.selectedIndex >= 0 ? sel.options[sel.selectedIndex].text : state.filters.datePreset;
      chips.push({ key: 'datePreset', label: `Dates: ${txt}` });
    }

    if (countBadge) {
      const popoverFilterCount = chips.filter((c) => c.key !== 'search').length;
      countBadge.textContent = String(popoverFilterCount);
      countBadge.style.display = popoverFilterCount > 0 ? 'inline-flex' : 'none';
    }

    if (!container) return;

    if (chips.length === 0) {
      container.style.display = 'none';
      container.innerHTML = '';
      return;
    }

    container.style.display = 'flex';
    const closeSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    container.innerHTML = chips.map((chip) => `
      <span class="filter-chip">
        <span>${escapeHtml(chip.label)}</span>
        <button type="button" class="filter-chip-remove" onclick="removeQueueFilter('${escapeJsAttr(chip.key)}')" aria-label="Remove ${escapeHtml(chip.label)}">${closeSvg}</button>
      </span>
    `).join('') + '<button type="button" class="btn btn-ghost btn-sm" onclick="clearAllQueueFilters()">Clear filters</button>';
  }

  function updateSortHeaders() {
    const mappings = [
      { id: 'thSortCompany', field: 'company' },
      { id: 'thSortRef', field: 'referenceCode' },
      { id: 'thSortPatient', field: 'patientName' },
      { id: 'thSortAppt', field: 'createdAt' },
    ];
    const chevronsUpDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"></path><path d="m7 9 5-5 5 5"></path></svg>';
    const chevronUp = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>';
    const chevronDown = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';

    mappings.forEach(({ id, field }) => {
      const th = document.getElementById(id);
      if (!th) return;
      const isSorted = state.sorting.field === field;
      const dir = isSorted ? (state.sorting.asc ? 'ascending' : 'descending') : 'none';
      th.setAttribute('aria-sort', dir);
      const iconEl = th.querySelector('.sort-icon');
      if (iconEl) {
        iconEl.innerHTML = isSorted ? (state.sorting.asc ? chevronUp : chevronDown) : chevronsUpDown;
      }
    });
  }

  window.handlePageSizeChange = () => {
    const size = parseInt(document.getElementById('pageSizeSelect')?.value, 10) || 10;
    state.pagination.limit = size;
    state.pagination.page = 1;
    renderQueue();
  };

  window.changePage = (delta) => {
    const newPage = state.pagination.page + delta;
    if (newPage >= 1 && newPage <= state.pagination.totalPages) {
      state.pagination.page = newPage;
      renderQueue();
    }
  };

  window.sortTable = (field) => {
    if (state.sorting.field === field) {
      state.sorting.asc = !state.sorting.asc;
    } else {
      state.sorting.field = field;
      state.sorting.asc = true;
    }
    processFilteredQueue();
  };

  function processFilteredQueue() {
    let result = [...state.queue];

    // Company filter
    if (state.filters.company !== 'all') {
      result = result.filter((r) => {
        const tId = r.tenantId?._id || r.tenantId;
        return String(tId) === String(state.filters.company);
      });
    }

    // Doctor / Clinician filter
    if (state.filters.doctor && state.filters.doctor !== 'all') {
      if (state.filters.doctor === 'unassigned') {
        result = result.filter((r) => !r.assignedDoctorId);
      } else {
        result = result.filter((r) => {
          const dId = r.assignedDoctorId?._id || r.assignedDoctorId;
          return String(dId) === String(state.filters.doctor);
        });
      }
    }

    // Status filter
    if (state.filters.status === 'active') {
      result = result.filter((r) => {
        const st = (r.status || 'pending').toLowerCase();
        return st === 'pending' || st === 'scheduled';
      });
    } else if (state.filters.status === 'all') {
      result = result.filter((r) => (r.status || 'pending') !== 'archived');
    } else if (state.filters.status !== 'all_including_archived') {
      result = result.filter((r) => (r.status || 'pending') === state.filters.status);
    }

    // Settlement filter
    if (state.filters.settlement !== 'all') {
      result = result.filter((r) => {
        const s = r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled');
        return s === state.filters.settlement;
      });
    }

    // Date range filter
    if (state.filters.startDate) {
      const startMs = new Date(state.filters.startDate).setHours(0, 0, 0, 0);
      result = result.filter((r) => new Date(r.createdAt).getTime() >= startMs);
    }
    if (state.filters.endDate) {
      const endMs = new Date(state.filters.endDate).setHours(23, 59, 59, 999);
      result = result.filter((r) => new Date(r.createdAt).getTime() <= endMs);
    }

    // Search filter
    if (state.filters.search) {
      const q = state.filters.search;
      result = result.filter((r) => {
        const ref = (r.referenceCode || '').toLowerCase();
        const pName = (r.clinicalDetails?.patientName || '').toLowerCase();
        const pContact = (r.clinicalDetails?.patientContact || '').toLowerCase();
        const dept = (r.departmentName || '').toLowerCase();
        const comp = (r.tenantId?.company_name || '').toLowerCase();
        const docName = (r.assignedDoctorId?.fullName || '').toLowerCase();
        return ref.includes(q) || pName.includes(q) || pContact.includes(q) || dept.includes(q) || comp.includes(q) || docName.includes(q);
      });
    }

    // Sorting
    const field = state.sorting.field;
    const asc = state.sorting.asc;
    result.sort((a, b) => {
      let valA, valB;
      if (field === 'referenceCode') {
        valA = (a.referenceCode || '').toLowerCase();
        valB = (b.referenceCode || '').toLowerCase();
      } else if (field === 'company') {
        valA = (a.tenantId?.company_name || a.tenantId?.companyName || '').toLowerCase();
        valB = (b.tenantId?.company_name || b.tenantId?.companyName || '').toLowerCase();
      } else if (field === 'patientName') {
        valA = (a.clinicalDetails?.patientName || '').toLowerCase();
        valB = (b.clinicalDetails?.patientName || '').toLowerCase();
      } else {
        valA = new Date(a.createdAt || 0).getTime();
        valB = new Date(b.createdAt || 0).getTime();
      }

      if (valA < valB) return asc ? -1 : 1;
      if (valA > valB) return asc ? 1 : -1;
      return 0;
    });

    state.filteredQueue = result;
    state.pagination.totalCount = result.length;
    state.pagination.totalPages = Math.ceil(result.length / state.pagination.limit) || 1;
    if (state.pagination.page > state.pagination.totalPages) {
      state.pagination.page = state.pagination.totalPages;
    }

    renderActiveFilterChips();
    updateSortHeaders();
    renderQueue();
  }

  function formatAppointmentDisplay(scheduledAt) {
    if (!scheduledAt) return null;
    const d = new Date(scheduledAt);
    if (isNaN(d.getTime())) return null;
    const datePart = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const hasTime = d.getHours() !== 0 || d.getMinutes() !== 0;
    if (!hasTime) return datePart;
    const timePart = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${timePart}`;
  }

  function renderQueue() {
    const tableBody = document.getElementById('assessorQueueTableBody');
    if (!tableBody) return;

    const { page, limit, totalCount, totalPages } = state.pagination;
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    const pageItems = state.filteredQueue.slice(startIdx, endIdx);

    const paginationSummary = document.getElementById('paginationSummary');
    const paginationControlsRight = document.getElementById('paginationControlsRight');
    const pageIndicator = document.getElementById('pageIndicator');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (paginationSummary) {
      paginationSummary.textContent = totalCount > 0
        ? `Showing ${startIdx + 1} to ${Math.min(endIdx, totalCount)} of ${totalCount}`
        : 'Showing 0 referrals';
    }
    if (paginationControlsRight) {
      paginationControlsRight.style.display = totalPages <= 1 ? 'none' : 'flex';
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${page} of ${totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= totalPages;

    tableBody.innerHTML = '';
    const visibleColCount = state.hasMultipleCompanies ? 8 : 7;
    if (pageItems.length === 0) {
      if (state.queue.length === 0) {
        tableBody.innerHTML = `
          <tr class="empty-row">
            <td colspan="${visibleColCount}">
              <div class="empty-state-inline">
                <strong>No referrals yet</strong>
                <p>Assigned referrals for your clinic will appear here.</p>
              </div>
            </td>
          </tr>
        `;
      } else {
        tableBody.innerHTML = `
          <tr class="empty-row">
            <td colspan="${visibleColCount}">
              <div class="empty-state-inline">
                <strong>No results for these filters</strong>
                <p>Try adjusting your search or filter selections.</p>
                <button type="button" class="btn btn-secondary btn-sm" onclick="clearAllQueueFilters()">Clear filters</button>
              </div>
            </td>
          </tr>
        `;
      }
      return;
    }

    const isClinicAdmin = isUserClinicAdmin(state.assessor);
    const defaultCurr = state.assessor?.billingSettings?.defaultCurrency || 'GHS';
    const activeDoctors = (state.doctors || []).filter((doc) => doc.active);

    pageItems.forEach((r) => {
      const tr = document.createElement('tr');

      const companyName = r.tenantId?.company_name || r.tenantId?.companyName || 'Organization';
      const patientName = r.clinicalDetails?.patientName || '-';
      const patientContact = r.clinicalDetails?.patientContact || '-';
      const receivedStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-';
      const st = (r.status || 'pending').toLowerCase();
      const isCompleted = st === 'completed';
      const isClosedCase = st === 'completed' || st === 'archived' || st === 'cancelled';

      // Strictly one status badge per referral
      let statusBadge = '';
      if (st === 'completed') {
        statusBadge = '<span class="badge badge-success">Completed</span>';
      } else if (st === 'scheduled') {
        statusBadge = '<span class="badge badge-info">Scheduled</span>';
      } else if (st === 'cancelled') {
        statusBadge = '<span class="badge badge-danger">Cancelled</span>';
      } else if (st === 'archived') {
        statusBadge = '<span class="badge badge-neutral">Archived</span>';
      } else {
        statusBadge = '<span class="badge badge-warning">Pending</span>';
      }

      // Billing status shows ONLY for completed cases, as a second neutral badge
      const settlement = r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled');
      let completedBillingBadge = '';
      if (isCompleted) {
        if (settlement === 'settled') {
          completedBillingBadge = '<span class="badge badge-neutral">Settled</span>';
        } else if (r.billing?.isBilled || settlement === 'pending_payment') {
          completedBillingBadge = '<span class="badge badge-neutral">Billed</span>';
        } else {
          completedBillingBadge = '<span class="badge badge-neutral">Unbilled</span>';
        }
      }

      const safeRefAttr = escapeHtml(r.referenceCode || '');
      const safeRefJs = escapeJsAttr(r.referenceCode || '');
      const safeIdJs = escapeJsAttr(r._id || '');
      const safeIdAttr = escapeHtml(r._id || '');
      const safePatientNameJs = escapeJsAttr(patientName || 'Patient');

      // Clinician column: assigned name or inline select when unassigned
      let clinicianHtml = '';
      if (r.assignedDoctorId) {
        const docName = escapeHtml(r.assignedDoctorId.fullName || 'Attending Clinician');
        const docSpec = r.assignedDoctorId.specialty
          ? `<div class="cell-sub">${escapeHtml(r.assignedDoctorId.specialty)}</div>`
          : '';
        clinicianHtml = `<div class="cell-primary">${docName}</div>${docSpec}`;
      } else if (isClinicAdmin && !isClosedCase) {
        const docOpts = activeDoctors.map((doc) => (
          `<option value="${escapeHtml(doc._id)}">${escapeHtml(doc.fullName)}</option>`
        )).join('');
        clinicianHtml = `
          <select class="select inline-assign-select" aria-label="Assign clinician for ${safeRefAttr}" onchange="quickAssignDoctor('${safeIdJs}', this.value)">
            <option value="">Assign clinician</option>
            ${docOpts}
          </select>
        `;
      } else {
        clinicianHtml = '<span class="text-subtle-xs">Unassigned</span>';
      }

      // Appointment column
      const apptFormatted = formatAppointmentDisplay(r.scheduledAt);
      const appointmentHtml = apptFormatted
        ? `<div class="cell-primary tabular-nums">${escapeHtml(apptFormatted)}</div>`
        : '<div class="text-muted-sm">Not set</div>';

      // Fee column (currency in header only, numbers right-aligned, never duplicate "Unbilled")
      const hasFee = Boolean(r.billing?.isBilled || Number(r.billing?.amount || 0) > 0);
      const feeDisplay = hasFee
        ? Number(r.billing?.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '-';

      // Contact link
      const isEmail = patientContact.includes('@');
      const isPhone = !isEmail && patientContact.length >= 7;
      const safeContact = escapeHtml(patientContact);
      let contactHtml = `<span class="text-subtle-xs">${safeContact}</span>`;
      if (isPhone) {
        const cleanTel = patientContact.replace(/[^+\d]/g, '');
        contactHtml = `<a href="tel:${escapeHtml(cleanTel)}" class="contact-link">${safeContact}</a>`;
      } else if (isEmail) {
        const mailtoSubj = encodeURIComponent(`Havilah Clinical Consultation [${r.referenceCode || ''}]`);
        const safeMailAddr = encodeURIComponent(patientContact).replace(/%40/g, '@');
        contactHtml = `<a href="mailto:${escapeHtml(safeMailAddr)}?subject=${mailtoSubj}" class="contact-link">${safeContact}</a>`;
      }

      const isOnline = window.HavilahCall ? window.HavilahCall.isPeerOnline(r.referenceCode) : false;
      const dotTitle = isOnline ? 'Patient is Online now' : 'Patient is Offline';

      // Primary style only on rows needing action (unassigned open case or pending)
      const needsAction = !isClosedCase && (st === 'pending' || !r.assignedDoctorId);
      const openBtnClass = needsAction ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

      let billingMenuAction = '';
      if (isCompleted && r.billing?.isBilled) {
        const isSettled = settlement === 'settled';
        const toggleLabel = isSettled ? 'Billing: Mark pending payment' : 'Billing: Mark settled';
        billingMenuAction = `
          <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); toggleSettlementStatus('${safeIdJs}', '${escapeJsAttr(settlement)}')">
            <span>${toggleLabel}</span>
          </button>
        `;
      } else if (isCompleted) {
        billingMenuAction = `
          <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); openCompleteModal('${safeIdJs}')">
            <span>Billing</span>
          </button>
        `;
      } else {
        billingMenuAction = `
          <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); openExportModal()">
            <span>Billing</span>
          </button>
        `;
      }

      tr.innerHTML = `
        <td class="col-company" data-label="Company">
          <div class="cell-company-wrap">
            <div class="cell-company">${escapeHtml(companyName)}</div>
            <div class="mobile-only-badge">${statusBadge}${completedBillingBadge}</div>
          </div>
        </td>
        <td class="col-ref" data-label="Reference">
          <div class="cell-ref-code tabular-nums">
            <span id="presence-dot-${safeRefAttr}" class="presence-dot ${isOnline ? 'is-online' : ''}" title="${dotTitle}"></span>
            <span>${escapeHtml(r.referenceCode)}</span>
          </div>
        </td>
        <td class="col-patient" data-label="Patient">
          <div>
            <div class="cell-primary">${escapeHtml(patientName)}</div>
            <div class="cell-sub">${contactHtml}</div>
          </div>
        </td>
        <td class="col-clinician" data-label="Clinician">
          ${clinicianHtml}
        </td>
        <td class="col-appt" data-label="Appointment">
          <div>
            ${appointmentHtml}
            <div class="cell-sub">Received ${escapeHtml(receivedStr)}</div>
          </div>
        </td>
        <td class="col-status" data-label="Status">
          <div class="status-cell-group">${statusBadge}${completedBillingBadge}</div>
        </td>
        <td class="col-fee num" data-label="Fee (${escapeHtml(defaultCurr)})">
          <span class="tabular-nums">${escapeHtml(feeDisplay)}</span>
        </td>
        <td class="col-actions" data-label="Actions" style="text-align: right; white-space: nowrap;">
          <div class="row-actions-group">
            <button type="button" class="${openBtnClass}" onclick="openCaseDetail('${safeIdJs}')">Open</button>
            <div class="row-menu-wrap">
              <button
                type="button"
                class="row-menu-trigger"
                aria-haspopup="menu"
                aria-expanded="false"
                aria-controls="row-menu-${safeIdAttr}"
                onclick="toggleRowActionMenu(event, 'row-menu-${safeIdJs}')"
                title="More actions"
                aria-label="More actions for ${safeRefAttr}"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
              </button>
              <div class="row-action-dropdown" id="row-menu-${safeIdAttr}" role="menu">
                ${!isClosedCase ? `
                <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); openCaseDetailSection('${safeIdJs}', 'schedule')">
                  <span>Schedule</span>
                </button>` : ''}
                <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); openCaseDetailSection('${safeIdJs}', 'note')">
                  <span>Add note</span>
                </button>
                <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); openCaseDetailSection('${safeIdJs}', 'certificate')">
                  <span>Record certificate</span>
                </button>
                ${!isClosedCase ? `
                <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); quickCallCase('${safeRefJs}', '${safePatientNameJs}')">
                  <span>Call patient</span>
                </button>
                <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); requestCompleteConfirmation('${safeIdJs}')">
                  <span>Mark complete</span>
                </button>` : ''}
                ${billingMenuAction}
                <div class="menu-divider" role="separator"></div>
                <button type="button" class="row-action-item" role="menuitem" onclick="closeAllRowActionMenus(); quickArchiveCase('${safeIdJs}', ${st === 'archived'})">
                  <span>${st === 'archived' ? 'Restore case' : 'Archive case'}</span>
                </button>
                <button type="button" class="row-action-item danger" role="menuitem" onclick="closeAllRowActionMenus(); quickDeleteCase('${safeIdJs}', '${safeRefJs}')">
                  <span>Delete case</span>
                </button>
              </div>
            </div>
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  // --- Row Action Menu Helpers ---
  window.closeAllRowActionMenus = () => {
    document.querySelectorAll('.row-action-dropdown.open').forEach((el) => {
      el.classList.remove('open');
      el.style.top = '';
      el.style.left = '';
      const wrap = el.closest('.row-menu-wrap');
      const trigger = wrap ? wrap.querySelector('.row-menu-trigger') : null;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  };

  window.toggleRowActionMenu = (event, menuId) => {
    if (event) event.stopPropagation();
    window.closeAssessorUserMenu();
    window.closeExportMenu();
    window.closeFiltersPopover();

    const targetMenu = document.getElementById(menuId);
    if (!targetMenu) return;
    const isOpen = targetMenu.classList.contains('open');
    window.closeAllRowActionMenus();
    if (!isOpen) {
      targetMenu.classList.add('open');
      const wrap = targetMenu.closest('.row-menu-wrap');
      const trigger = wrap ? wrap.querySelector('.row-menu-trigger') : null;
      if (trigger) {
        trigger.setAttribute('aria-expanded', 'true');
        const rect = trigger.getBoundingClientRect();
        const menuWidth = targetMenu.offsetWidth || 184;
        const menuHeight = targetMenu.offsetHeight || 220;
        const left = Math.max(8, Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8));
        const spaceBelow = window.innerHeight - rect.bottom;
        const top = spaceBelow >= menuHeight + 8 ? rect.bottom + 4 : Math.max(8, rect.top - menuHeight - 4);
        targetMenu.style.left = `${left}px`;
        targetMenu.style.top = `${top}px`;
      }
    }
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.row-menu-wrap')) {
      window.closeAllRowActionMenus();
    }
  });

  window.addEventListener('scroll', window.closeAllRowActionMenus, true);
  window.addEventListener('resize', window.closeAllRowActionMenus);

  // --- Confirmation Dialog & Deep-Link Helpers ---
  window.requestCompleteConfirmation = (id) => {
    const item = state.queue.find((r) => r._id === id);
    if (!item) return;
    pendingConfirmCompleteId = item._id;
    const msgEl = document.getElementById('confirmCompleteMessage');
    if (msgEl) {
      msgEl.textContent = `Mark ${item.referenceCode || 'this referral'} as complete? This closes the case.`;
    }
    openModal('confirmCompleteCaseModal');
  };

  window.proceedConfirmedComplete = () => {
    const targetId = pendingConfirmCompleteId;
    pendingConfirmCompleteId = null;
    closeModal('confirmCompleteCaseModal');
    if (targetId) {
      window.openCompleteModal(targetId);
    }
  };

  window.openCaseDetailSection = (id, section) => {
    window.openCaseDetail(id);
    if (section === 'certificate') {
      window.switchClinicalRecordTab('documents');
    } else if (section === 'schedule') {
      window.switchClinicalRecordTab('overview');
      setTimeout(() => document.getElementById('scheduleDateInput')?.focus(), 50);
    } else if (section === 'note') {
      setTimeout(() => document.getElementById('modalCaseReplyInput')?.focus(), 50);
    }
  };

  // --- Settlement Status Toggle ---
  window.toggleSettlementStatus = async (referralId, currentStatus) => {
    const newStatus = currentStatus === 'settled' ? 'pending_payment' : 'settled';
    try {
      await assessorApiFetch(`${API_BASE}/referrals/${referralId}/settlement`, {
        method: 'PATCH',
        body: JSON.stringify({ settlementStatus: newStatus }),
      });

      // Update in local queue
      const item = state.queue.find(r => r._id === referralId);
      if (item) {
        item.billing = item.billing || {};
        item.billing.settlementStatus = newStatus;
        item.billing.settledAt = newStatus === 'settled' ? new Date() : null;
      }

      showToast(`Settlement status updated to ${newStatus === 'settled' ? 'Settled' : 'Pending payment'}`);
      updateKPIs();
      processFilteredQueue();
    } catch (err) {
      alert('Error updating settlement: ' + err.message);
    }
  };

  // --- View Case & Direct Scheduling ---
  window.openCaseDetail = (id) => {
    const item = state.queue.find((r) => r._id === id);
    if (!item) return;
    state.selectedCase = item;

    document.getElementById('modalCaseRefCode').textContent = item.referenceCode;

    const body = document.getElementById('modalCaseDetailBody');
    const compName = item.tenantId?.company_name || 'Organization';
    const pName = item.clinicalDetails?.patientName || '-';
    const pContact = item.clinicalDetails?.patientContact || '-';
    const pDept = item.departmentName || 'General';
    const pSchedule = item.preferredTime || 'As soon as available';
    const intakeNotes = item.clinicalDetails?.intakeNotes || 'None provided';
    const assessorNotes = item.clinicalDetails?.assessorNotes || 'None recorded yet';
    const isCompleted = item.status === 'completed';
    const isClinicAdmin = isUserClinicAdmin(state.assessor);

    // Populate sticky workspace header
    const hdrNameEl = document.getElementById('modalHeaderPatientName');
    const hdrOrgEl = document.getElementById('modalHeaderOrgDept');
    const hdrStatusEl = document.getElementById('modalHeaderStatusBadge');
    if (hdrNameEl) hdrNameEl.textContent = pName;
    if (hdrOrgEl) hdrOrgEl.textContent = `${compName} · ${pDept}`;
    if (hdrStatusEl) {
      const st = (item.status || 'pending').toLowerCase();
      hdrStatusEl.textContent = st.charAt(0).toUpperCase() + st.slice(1);
      hdrStatusEl.style.background = '';
      hdrStatusEl.style.color = '';
      if (st === 'completed') {
        hdrStatusEl.className = 'badge badge-success';
      } else if (st === 'scheduled') {
        hdrStatusEl.className = 'badge badge-info';
      } else if (st === 'cancelled') {
        hdrStatusEl.className = 'badge badge-danger';
      } else if (st === 'archived') {
        hdrStatusEl.className = 'badge badge-neutral';
      } else {
        hdrStatusEl.className = 'badge badge-warning';
      }
    }

    // Direct phone/email action links
    const isEmail = pContact.includes('@');
    const isPhone = !isEmail && pContact.length >= 7;
    const safePContact = escapeHtml(pContact);
    let contactAction = safePContact;
    if (isPhone) {
      const cleanTel = pContact.replace(/[^+\d]/g, '');
      contactAction = `<a href="tel:${escapeHtml(cleanTel)}" class="contact-link" style="color: var(--brand); font-weight: var(--weight-medium);">${safePContact}</a>`;
    } else if (isEmail) {
      const mailtoSubj = encodeURIComponent(`Havilah Clinical Consultation [${item.referenceCode || ''}]`);
      const safeMail = encodeURIComponent(pContact).replace(/%40/g, '@');
      contactAction = `<a href="mailto:${escapeHtml(safeMail)}?subject=${mailtoSubj}" class="contact-link" style="color: var(--brand); font-weight: var(--weight-medium); word-break: break-all;">${safePContact}</a>`;
    }

    body.innerHTML = `
      <div class="ws-section">
        <div class="ws-kv-grid">
          <div>
            <div class="ws-kv-label">Direct contact</div>
            <div class="ws-kv-value">${contactAction}</div>
          </div>
          <div>
            <div class="ws-kv-label">Preferred schedule</div>
            <div class="ws-kv-value" style="font-weight: var(--weight-medium);">${escapeHtml(pSchedule)}</div>
          </div>
        </div>
        <div class="ws-divider"></div>
        <div>
          <div class="ws-kv-label">Intake reason &amp; notes</div>
          <div class="ws-kv-value" style="white-space: pre-wrap;">${escapeHtml(intakeNotes)}</div>
        </div>
        ${isCompleted ? `
          <div class="ws-divider"></div>
          <div style="display: flex; flex-direction: column; gap: var(--space-1); font-size: var(--text-sm);">
            <div><span class="text-muted-sm">Billed fee:</span> <strong class="tabular-nums">${escapeHtml(item.billing?.currency || 'GHS')} ${(item.billing?.amount || 0).toFixed(2)}</strong> (${escapeHtml(item.billing?.billedAt ? new Date(item.billing.billedAt).toLocaleDateString() : 'Settled')})</div>
            <div><span class="text-muted-sm">Clinical notes:</span> ${escapeHtml(assessorNotes)}</div>
          </div>
        ` : ''}
      </div>
    `;

    // Reset left-pane tab to Overview and initialize Digital Excuse Duty defaults
    if (typeof window.switchClinicalRecordTab === 'function') {
      window.switchClinicalRecordTab('overview');
    }
    initExcuseDutyFormForCase(item);

    // Populate triage & delegation section
    const triageSec = document.getElementById('modalTriageSection');
    if (triageSec) {
      if (isClinicAdmin && !isCompleted) {
        triageSec.style.display = 'block';
        updateDoctorDropdowns();
        const assignSelect = document.getElementById('modalDoctorAssignSelect');
        if (assignSelect) {
          assignSelect.value = item.assignedDoctorId?._id || item.assignedDoctorId || '';
        }
        const badgeEl = document.getElementById('modalTriageDelegatedBadge');
        if (badgeEl) {
          badgeEl.style.background = '';
          badgeEl.style.color = '';
          if (item.assignedDoctorId) {
            const docName = item.assignedDoctorId.fullName || 'Attending Clinician';
            badgeEl.textContent = `Assigned: ${docName}`;
            badgeEl.className = 'badge badge-success';
          } else {
            badgeEl.textContent = 'Unassigned';
            badgeEl.className = 'badge badge-neutral';
          }
        }
        const metaEl = document.getElementById('modalDelegationMeta');
        if (metaEl) {
          if (item.delegatedAt) {
            metaEl.style.display = 'block';
            metaEl.textContent = `Delegated on ${new Date(item.delegatedAt).toLocaleString()}`;
          } else {
            metaEl.style.display = 'none';
          }
        }
      } else {
        triageSec.style.display = 'none';
      }
    }

    // Populate scheduling section
    const schedSection = document.getElementById('schedulingSection');
    if (schedSection) {
      schedSection.style.display = isCompleted ? 'none' : 'block';
      if (item.scheduledAt) {
        const d = new Date(item.scheduledAt);
        document.getElementById('scheduleDateInput').value = d.toISOString().split('T')[0];
        document.getElementById('scheduleTimeInput').value = d.toTimeString().slice(0, 5);
      } else {
        document.getElementById('scheduleDateInput').value = '';
        document.getElementById('scheduleTimeInput').value = '';
      }
      document.getElementById('scheduleNotesInput').value = item.appointmentNotes || '';
      const meetInput = document.getElementById('scheduleMeetingLinkInput');
      if (meetInput) meetInput.value = item.clinicalDetails?.meetingLink || '';
    }

    // Render clinical dialogue thread
    renderAssessorModalThread(item.thread || []);
    const replyInput = document.getElementById('modalCaseReplyInput');
    if (replyInput) replyInput.value = '';

    // Render attachments
    renderAssessorAttachments(item.clinicalDetails?.attachments || []);

    const completeBtn = document.getElementById('modalCompleteCaseBtn');
    if (completeBtn) {
      completeBtn.style.display = isCompleted ? 'none' : 'inline-flex';
    }

    const archiveBtn = document.getElementById('modalArchiveCaseBtn');
    if (archiveBtn) {
      const isArchived = item.status === 'archived';
      archiveBtn.textContent = isArchived ? 'Restore case' : 'Archive case';
    }

    // Update WebRTC Call Client presence for this specific case
    if (window.HavilahCall && item.referenceCode) {
      if (typeof window.HavilahCall.subscribe === 'function') {
        window.HavilahCall.subscribe(item.referenceCode);
      }
      const shieldCheckbox = document.getElementById('assessorIpShieldToggle');
      if (shieldCheckbox) {
        shieldCheckbox.checked = window.HavilahCall.ipShield;
      }
      const presencePill = document.getElementById('assessorPeerPresencePill');
      if (presencePill) {
        presencePill.dataset.ref = item.referenceCode;
        const isOnline = window.HavilahCall.isPeerOnline(item.referenceCode);
        presencePill.textContent = isOnline ? 'Patient online' : 'Patient offline';
        presencePill.className = isOnline ? 'badge badge-success' : 'badge badge-neutral';
        presencePill.style.background = '';
        presencePill.style.color = '';
        presencePill.style.borderColor = '';
      }
    }

    openModal('caseDetailModal');
    startAssessorLiveSync();
  };

  window.startAssessorCall = () => {
    if (!state.selectedCase || !window.HavilahCall) return;
    const docName = (state.assessor?.name || state.profile?.name || state.profile?.fullName) ? `Dr. ${state.assessor?.name || state.profile?.name || state.profile?.fullName}` : 'Medical Assessor';
    window.HavilahCall.startCall(docName, state.selectedCase.referenceCode);
  };

  window.handleToggleArchiveCurrentCase = async () => {
    if (!state.selectedCase) return;
    const isArchived = state.selectedCase.status === 'archived';
    await window.quickArchiveCase(state.selectedCase._id, isArchived);
    closeModal('caseDetailModal');
  };

  window.handleDeleteCurrentCase = async () => {
    if (!state.selectedCase) return;
    const ref = state.selectedCase.referenceCode;
    const id = state.selectedCase._id;
    await window.quickDeleteCase(id, ref);
    closeModal('caseDetailModal');
  };

  window.quickArchiveCase = async (referralId, isCurrentlyArchived) => {
    const actionText = isCurrentlyArchived ? 'restore this referral case to the active queue' : 'archive this referral case (hide from active queue)';
    if (!confirm(`Are you sure you want to ${actionText}?`)) {
      return;
    }

    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${referralId}/archive`, {
        method: 'PATCH',
        body: JSON.stringify({ archive: !isCurrentlyArchived }),
      });

      showToast(res.message || 'Case archive status updated.');
      await window.fetchAssessorQueue();
    } catch (err) {
      alert('Error updating archive status: ' + err.message);
    }
  };

  window.quickDeleteCase = async (referralId, referenceCode) => {
    const confirmPrompt = confirm(`Are you sure you want to permanently delete referral ${referenceCode}?\n\nThis will remove it from the system and cannot be undone.`);
    if (!confirmPrompt) return;

    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${referralId}`, {
        method: 'DELETE',
      });

      showToast(res.message || `Referral ${referenceCode} deleted.`);
      await window.fetchAssessorQueue();
    } catch (err) {
      alert('Error deleting referral: ' + err.message);
    }
  };

  // --- Clinical Workspace Left-Pane Tabs & Digital Excuse Duty Helpers ---
  window.switchClinicalRecordTab = (tabName) => {
    const overviewBtn = document.getElementById('clinicalTabOverviewBtn');
    const docsBtn = document.getElementById('clinicalTabDocsBtn');
    const overviewPanel = document.getElementById('clinicalTabOverviewPanel');
    const docsPanel = document.getElementById('clinicalTabDocsPanel');

    const isDocs = tabName === 'documents';
    if (overviewBtn) {
      overviewBtn.classList.toggle('active', !isDocs);
      overviewBtn.setAttribute('aria-selected', String(!isDocs));
    }
    if (docsBtn) {
      docsBtn.classList.toggle('active', isDocs);
      docsBtn.setAttribute('aria-selected', String(isDocs));
    }
    if (overviewPanel) overviewPanel.style.display = isDocs ? 'none' : 'flex';
    if (docsPanel) docsPanel.style.display = isDocs ? 'flex' : 'none';
  };

  let excuseDutyFitnessEdited = false;

  function initExcuseDutyFormForCase(item) {
    const today = new Date().toISOString().split('T')[0];
    const typeEl = document.getElementById('excuseDutyTypeSelect');
    const consultDateEl = document.getElementById('excuseDutyConsultDateInput');
    const consultModeEl = document.getElementById('excuseDutyConsultModeSelect');
    const startEl = document.getElementById('excuseDutyStartInput');
    const endEl = document.getElementById('excuseDutyEndInput');
    const staffIdEl = document.getElementById('excuseDutyStaffIdInput');
    const mdcEl = document.getElementById('excuseDutyMdcInput');
    const fitnessEl = document.getElementById('excuseDutyFitnessSelect');
    const reassessDateEl = document.getElementById('excuseDutyReassessmentDateInput');
    const reassessCheckEl = document.getElementById('excuseDutyReassessmentCheck');
    const customRestrictEl = document.getElementById('excuseDutyCustomRestrictionInput');
    const detailsEl = document.getElementById('excuseDutyRestrictionsDetails');
    const remarksEl = document.getElementById('excuseDutyRemarksInput');
    const privacyEl = document.getElementById('excuseDutyPrivacyCheck');
    const attestEl = document.getElementById('excuseDutyAttestationCheck');

    excuseDutyFitnessEdited = false;
    if (typeEl) typeEl.value = 'excuse_duty';
    if (fitnessEl) fitnessEl.value = 'temporarily_unfit';
    if (reassessDateEl) reassessDateEl.value = '';
    if (reassessCheckEl) reassessCheckEl.checked = false;
    if (customRestrictEl) customRestrictEl.value = '';
    if (detailsEl) detailsEl.open = false;
    document.querySelectorAll('.excuse-duty-restriction-cb').forEach((cb) => {
      cb.checked = false;
    });

    let defaultConsultDate = today;
    if (item && item.scheduledAt) {
      const schedIso = new Date(item.scheduledAt).toISOString().split('T')[0];
      if (schedIso && schedIso <= today) defaultConsultDate = schedIso;
    }
    if (consultDateEl) consultDateEl.value = defaultConsultDate;
    if (consultModeEl) {
      consultModeEl.value = item?.clinicalDetails?.meetingLink ? 'telehealth' : 'in_person';
    }
    if (startEl) startEl.value = today;
    if (endEl) endEl.value = today;
    if (staffIdEl) staffIdEl.value = '';
    if (mdcEl) {
      const profileMdc = (state.assessor?.mdcNumber || '').trim();
      const savedMdc = localStorage.getItem('havilah_clinician_mdc_number') || '';
      mdcEl.value = profileMdc || savedMdc;
    }
    if (remarksEl && window.ExcuseDutyPdf) {
      remarksEl.value = window.ExcuseDutyPdf.CERTIFICATE_TYPES.excuse_duty.defaultRemarks;
    }
    if (privacyEl) privacyEl.checked = true;
    if (attestEl) attestEl.checked = false;

    updateExcuseDutyComplianceBanner();
    window.onExcuseDutyFormChange(true);
    if (item && item._id) {
      loadCaseCertificates(item._id);
    }
  }

  window.onExcuseDutyFitnessManualChange = () => {
    excuseDutyFitnessEdited = true;
  };

  window.onExcuseDutyOshChange = () => {
    const dateVal = (document.getElementById('excuseDutyReassessmentDateInput')?.value || '').trim();
    const checkEl = document.getElementById('excuseDutyReassessmentCheck');
    if (dateVal && checkEl) {
      checkEl.checked = true;
    }
  };

  function updateExcuseDutyComplianceBanner() {
    const alertEl = document.getElementById('excuseDutyComplianceAlert');
    if (!alertEl) return;
    const issues = [];
    const hefra = String(state.assessor?.practiceRegistrationNumber || '').trim();
    if (!hefra) {
      issues.push('Clinic HeFRA / practice registration number is missing. Add it in Clinic Settings before issuing official certificates.');
    }
    const nowMs = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
    if (state.assessor?.hefraLicenseExpiry) {
      const exp = new Date(state.assessor.hefraLicenseExpiry).getTime();
      if (!isNaN(exp) && exp < nowMs) {
        issues.push('Clinic HeFRA licence expiry date has passed. Update your renewal date in Clinic Settings.');
      } else if (!isNaN(exp) && exp - nowMs < thirtyDaysMs) {
        issues.push('Clinic HeFRA licence expires within 30 days.');
      }
    }
    if (state.assessor?.mdcLicenseExpiry) {
      const exp = new Date(state.assessor.mdcLicenseExpiry).getTime();
      if (!isNaN(exp) && exp < nowMs) {
        issues.push('Your MDC annual retention expiry date has passed. Update it in Clinic Settings.');
      }
    }

    if (issues.length > 0) {
      alertEl.className = 'alert-banner alert-banner-warning';
      alertEl.style.display = 'flex';
      alertEl.innerHTML = `
        <div>${escapeHtml(issues.join(' '))}</div>
        <button type="button" class="btn btn-secondary btn-sm" style="align-self: flex-start;" onclick="closeModal('caseDetailModal'); openClinicSettingsModal();">Open Clinic settings</button>
      `;
    } else if (!state.assessor?.totp_enabled) {
      alertEl.className = 'alert-banner alert-banner-info';
      alertEl.style.display = 'flex';
      alertEl.innerHTML = '<span>Security recommendation: Enable 2FA in Clinic Settings to strengthen non-repudiation under the Electronic Transactions Act 772.</span>';
    } else {
      alertEl.style.display = 'none';
      alertEl.innerHTML = '';
    }
  }

  window.onExcuseDutyFormChange = (skipRemarksReset) => {
    const typeEl = document.getElementById('excuseDutyTypeSelect');
    const consultDateEl = document.getElementById('excuseDutyConsultDateInput');
    const startEl = document.getElementById('excuseDutyStartInput');
    const endEl = document.getElementById('excuseDutyEndInput');
    const endCol = document.getElementById('excuseDutyEndCol');
    const previewEl = document.getElementById('excuseDutySchedulePreview');
    const remarksEl = document.getElementById('excuseDutyRemarksInput');
    const backdateEl = document.getElementById('excuseDutyBackdateWarning');
    const privacyEl = document.getElementById('excuseDutyPrivacyCheck');
    const consentEl = document.getElementById('excuseDutyConsentAlert');

    const typeKey = typeEl ? typeEl.value : 'excuse_duty';
    const needsRange = typeKey === 'excuse_duty' || typeKey === 'light_duty';
    if (endCol) endCol.style.display = needsRange ? 'block' : 'none';

    const oshRow = document.getElementById('excuseDutyOshRow');
    const reassessWrap = document.getElementById('excuseDutyReassessmentWrap');
    const restrictWrap = document.getElementById('excuseDutyRestrictionsWrap');
    const fitnessEl = document.getElementById('excuseDutyFitnessSelect');
    const detailsEl = document.getElementById('excuseDutyRestrictionsDetails');
    const isAttendance = typeKey === 'attendance';
    if (oshRow) oshRow.style.display = isAttendance ? 'none' : 'grid';
    if (reassessWrap) reassessWrap.style.display = isAttendance ? 'none' : 'flex';
    if (restrictWrap) restrictWrap.style.display = isAttendance ? 'none' : 'block';
    if (!isAttendance && !excuseDutyFitnessEdited && fitnessEl) {
      const defaultFitnessByType = {
        excuse_duty: 'temporarily_unfit',
        light_duty: 'fit_with_restrictions',
        fit_to_return: 'fit_full_duty',
      };
      if (defaultFitnessByType[typeKey]) {
        fitnessEl.value = defaultFitnessByType[typeKey];
      }
    }
    if (detailsEl && typeKey === 'light_duty') {
      detailsEl.open = true;
    }

    if (startEl && endEl && needsRange && startEl.value && (!endEl.value || endEl.value < startEl.value)) {
      endEl.value = startEl.value;
    }

    if (remarksEl && !skipRemarksReset && window.ExcuseDutyPdf && window.ExcuseDutyPdf.CERTIFICATE_TYPES[typeKey]) {
      const allDefaults = Object.values(window.ExcuseDutyPdf.CERTIFICATE_TYPES).map(t => t.defaultRemarks);
      if (!remarksEl.value.trim() || allDefaults.includes(remarksEl.value.trim())) {
        remarksEl.value = window.ExcuseDutyPdf.CERTIFICATE_TYPES[typeKey].defaultRemarks;
      }
    }

    const startVal = startEl ? startEl.value : '';
    const consultVal = consultDateEl ? consultDateEl.value : '';
    if (backdateEl) {
      backdateEl.style.display = (needsRange && startVal && consultVal && startVal < consultVal) ? 'flex' : 'none';
    }
    if (consentEl && privacyEl) {
      consentEl.style.display = privacyEl.checked ? 'none' : 'flex';
    }

    if (previewEl && window.ExcuseDutyPdf) {
      const endVal = needsRange ? (endEl ? endEl.value : startVal) : startVal;
      const sched = window.ExcuseDutyPdf.calculateExcuseDutySchedule(startVal, endVal);
      if (!sched.valid) {
        previewEl.textContent = 'Select a valid start and end date.';
      } else if (needsRange) {
        previewEl.textContent = `Duration: ${sched.days} Day${sched.days === 1 ? '' : 's'} (${sched.startFormatted} to ${sched.endFormatted}) | Return to duty: ${sched.returnDateFormatted}`;
      } else if (typeKey === 'fit_to_return') {
        previewEl.textContent = `Certified fit to resume duties on ${sched.startFormatted}`;
      } else {
        previewEl.textContent = `Consultation attendance date: ${sched.startFormatted}`;
      }
    }
  };

  function collectExcuseDutyPayload() {
    const item = state.selectedCase;
    if (!item) return null;
    const todayIso = new Date().toISOString().split('T')[0];
    const typeKey = (document.getElementById('excuseDutyTypeSelect') || {}).value || 'excuse_duty';
    const consultationDate = (document.getElementById('excuseDutyConsultDateInput') || {}).value || todayIso;
    const consultationMode = (document.getElementById('excuseDutyConsultModeSelect') || {}).value === 'telehealth'
      ? 'telehealth'
      : 'in_person';
    const startDate = (document.getElementById('excuseDutyStartInput') || {}).value || consultationDate;
    const endDate = (document.getElementById('excuseDutyEndInput') || {}).value || startDate;
    const employeeStaffId = ((document.getElementById('excuseDutyStaffIdInput') || {}).value || '').trim();
    const mdcNumber = ((document.getElementById('excuseDutyMdcInput') || {}).value || '').trim();
    const remarks = ((document.getElementById('excuseDutyRemarksInput') || {}).value || '').trim();
    const hrSafePrivacy = Boolean((document.getElementById('excuseDutyPrivacyCheck') || {}).checked);
    const attestationConfirmed = Boolean((document.getElementById('excuseDutyAttestationCheck') || {}).checked);

    let fitnessStatus = '';
    let workRestrictions = [];
    let reassessmentRequired = false;
    let reassessmentDate = '';
    if (typeKey !== 'attendance') {
      fitnessStatus = ((document.getElementById('excuseDutyFitnessSelect') || {}).value || '').trim();
      reassessmentDate = ((document.getElementById('excuseDutyReassessmentDateInput') || {}).value || '').trim();
      reassessmentRequired = Boolean((document.getElementById('excuseDutyReassessmentCheck') || {}).checked || reassessmentDate);
      document.querySelectorAll('.excuse-duty-restriction-cb:checked').forEach((cb) => {
        const val = String(cb.value || '').trim();
        if (val) workRestrictions.push(val);
      });
      const customRestrict = ((document.getElementById('excuseDutyCustomRestrictionInput') || {}).value || '').trim();
      if (customRestrict) workRestrictions.push(customRestrict);
    }

    if (mdcNumber) {
      try { localStorage.setItem('havilah_clinician_mdc_number', mdcNumber); } catch (e) {}
    }

    const clinicianName = state.profile?.fullName || state.profile?.name || state.assessor?.name || '';
    const clinicianSpecialty = state.profile?.specialty || state.assessor?.specialty || '';
    const clinicName = state.assessor?.organization || state.assessor?.clinicName || '';
    const practiceRegistrationNumber = state.assessor?.practiceRegistrationNumber || '';
    const clinicAddress = state.assessor?.address || '';
    const clinicPhone = state.assessor?.phone || '';
    const clinicEmail = state.assessor?.notificationEmail || state.assessor?.email || '';
    const effectiveMdc = mdcNumber || state.assessor?.mdcNumber || '';

    // Static verified assets for Dr. Edith Clarke / FZ Safety and Health Centre pilot profile
    // (can be overridden or removed in Clinic Settings; other clinicians require explicit upload & approval)
    const isDrEdith = /edith\s+clarke/i.test(clinicianName);
    const isFzClinic = /fz\s+safety/i.test(clinicName);

    let signatureDataUrl = state.assessor?.signatureDataUrl || '';
    let signatureApproved = Boolean(state.assessor?.signatureApprovedAt && signatureDataUrl);
    if (!signatureDataUrl && isDrEdith && state.assessor?.signatureApprovedAt !== false) {
      signatureDataUrl = '/assets/signatures/dr-edith-clarke.png';
      signatureApproved = true;
    }

    let stampDataUrl = state.assessor?.stampDataUrl || '';
    let stampApproved = Boolean(state.assessor?.stampApprovedAt && stampDataUrl);
    if (!stampDataUrl && isFzClinic && state.assessor?.stampApprovedAt !== false) {
      stampDataUrl = '/assets/stamps/fz-safety-and-health-centre.png';
      stampApproved = true;
    }

    const clinicLogoDataUrl = isFzClinic ? '/assets/logos/fz-emblem.png' : '';
    const clinicWatermarkDataUrl = isFzClinic ? '/assets/logos/fz-watermark.png' : '';

    return {
      certificateType: typeKey,
      referenceCode: item.referenceCode || '',
      patientName: item.clinicalDetails?.patientName || '',
      employeeStaffId,
      companyName: item.tenantId?.company_name || '',
      departmentName: item.departmentName || '',
      consultationDate,
      consultationMode,
      startDate,
      endDate: (typeKey === 'excuse_duty' || typeKey === 'light_duty') ? endDate : startDate,
      mdcNumber: effectiveMdc,
      remarks,
      hrSafePrivacy,
      attestationConfirmed,
      fitnessStatus,
      workRestrictions,
      reassessmentRequired,
      reassessmentDate,
      clinicianName,
      clinicianSpecialty,
      clinicName,
      practiceRegistrationNumber,
      clinicAddress,
      clinicPhone,
      clinicEmail,
      signatureDataUrl,
      signatureApproved,
      stampDataUrl,
      stampApproved,
      clinicLogoDataUrl,
      clinicWatermarkDataUrl
    };
  }

  window.handlePreviewExcuseDutyPdf = async () => {
    if (!window.ExcuseDutyPdf) {
      alert('Excuse Duty PDF generator is still loading. Please refresh and try again.');
      return;
    }
    const payload = collectExcuseDutyPayload();
    if (!payload) return;
    try {
      await window.ExcuseDutyPdf.downloadExcuseDutyPdf({
        ...payload,
        isDraftPreview: true
      });
      showToast('Draft preview downloaded (unissued).');
    } catch (err) {
      alert('Could not generate PDF preview: ' + err.message);
    }
  };

  window.handleIssueExcuseDutyPdf = async () => {
    if (!state.selectedCase) return;
    if (!window.ExcuseDutyPdf) {
      alert('Excuse Duty PDF generator is still loading. Please refresh and try again.');
      return;
    }
    const payload = collectExcuseDutyPayload();
    if (!payload.practiceRegistrationNumber) {
      alert('Please configure your clinic HeFRA / practice registration number in Clinic Settings before issuing an official certificate.');
      window.openClinicSettingsModal();
      return;
    }
    if (!payload.mdcNumber || payload.mdcNumber.length < 3) {
      alert('Please enter your valid Medical and Dental Council (MDC) registration number.');
      document.getElementById('excuseDutyMdcInput')?.focus();
      return;
    }
    if (!payload.attestationConfirmed) {
      alert('Please confirm the clinician attestation checkbox under Act 857 and Act 772 before issuing.');
      document.getElementById('excuseDutyAttestationCheck')?.focus();
      return;
    }

    const sched = window.ExcuseDutyPdf.calculateExcuseDutySchedule(payload.startDate, payload.endDate);
    if (!sched.valid) {
      alert('Please choose a valid start date and end date (end date must be on or after start date).');
      return;
    }

    const btn = document.getElementById('issueExcuseDutyBtn');
    const statusEl = document.getElementById('modalAttachmentUploadStatus');
    if (btn) { btn.disabled = true; btn.textContent = 'Registering & Sealing...'; }
    if (statusEl) { statusEl.textContent = 'Registering verifiable certificate ID, building PDF & sealing SHA-256 hash...'; statusEl.style.display = 'block'; }

    try {
      // 1. Register & log authoritative tamper-evident certificate on server (clinician-only)
      const certRes = await assessorApiFetch(`${API_BASE}/referrals/${state.selectedCase._id}/certificates`, {
        method: 'POST',
        body: JSON.stringify({
          certificateType: payload.certificateType,
          consultationDate: payload.consultationDate,
          consultationMode: payload.consultationMode,
          startDate: payload.startDate,
          endDate: payload.endDate,
          mdcNumber: payload.mdcNumber,
          hrSafePrivacy: payload.hrSafePrivacy,
          fitnessStatus: payload.fitnessStatus,
          workRestrictions: payload.workRestrictions,
          reassessmentRequired: payload.reassessmentRequired,
          reassessmentDate: payload.reassessmentDate,
          attestationConfirmed: true
        })
      });
      if (!certRes || !certRes.data || !certRes.data.certificateId) {
        throw new Error('Could not register verifiable certificate ID on server.');
      }

      const issuedPayload = {
        ...payload,
        isDraftPreview: false,
        certificateId: certRes.data.certificateId,
        issuedAt: certRes.data.issuedAt,
        verifyUrl: certRes.data.verifyUrl,
        clinicName: certRes.data.clinicName || payload.clinicName,
        practiceRegistrationNumber: certRes.data.practiceRegNumber || payload.practiceRegistrationNumber,
        clinicianName: certRes.data.clinicianName || payload.clinicianName,
        clinicianSpecialty: certRes.data.clinicianSpecialty || payload.clinicianSpecialty,
        mdcNumber: certRes.data.mdcNumber || payload.mdcNumber
      };

      // 2. Render official PDF bytes with QR code and compute exact SHA-256 digest
      const built = await window.ExcuseDutyPdf.buildExcuseDutyPdf(issuedPayload);

      // 3. Seal the exact PDF SHA-256 hash on the server record (immutable)
      if (built.pdfSha256) {
        await assessorApiFetch(`${API_BASE}/referrals/${state.selectedCase._id}/certificates/${encodeURIComponent(built.certificateId)}/seal`, {
          method: 'PATCH',
          body: JSON.stringify({ pdfSha256: built.pdfSha256 })
        });
      }

      // 4. Attach clean data URI & integrity metadata to the consultation record
      const res = await assessorApiFetch(`${API_BASE}/referrals/${state.selectedCase._id}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: built.fileName,
          fileData: built.dataUri,
          fileType: 'application/pdf',
          fileSize: built.blobSize,
          certificateId: built.certificateId,
          pdfSha256: built.pdfSha256 || ''
        })
      });

      if (res && res.data) {
        state.selectedCase.clinicalDetails = state.selectedCase.clinicalDetails || {};
        state.selectedCase.clinicalDetails.attachments = res.data;
        renderAssessorAttachments(res.data);

        // Post a clean notice into the consultation chat so the employee sees it immediately
        const certLabel = built.data.typeMeta.shortLabel || built.data.typeMeta.title;
        const periodSummary = (payload.certificateType === 'excuse_duty' || payload.certificateType === 'light_duty')
          ? ` (${sched.startFormatted} to ${sched.endFormatted}, ${sched.days} day${sched.days === 1 ? '' : 's'})`
          : ` (${sched.startFormatted})`;
        const noticeMsg = `I have issued your ${certLabel} certificate${periodSummary} [Cert ID: ${built.certificateId}]. You can download or open the PDF from your Clinical Documents section above.`;

        try {
          const msgRes = await assessorApiFetch(`${API_BASE}/referrals/${state.selectedCase._id}/message`, {
            method: 'POST',
            body: JSON.stringify({ message: noticeMsg })
          });
          if (msgRes && msgRes.success && msgRes.thread) {
            state.selectedCase.thread = msgRes.thread;
            renderAssessorModalThread(msgRes.thread);
          }
        } catch (chatErr) {
          console.warn('[ExcuseDuty] Chat notice skipped:', chatErr.message);
        }

        const attestEl = document.getElementById('excuseDutyAttestationCheck');
        if (attestEl) attestEl.checked = false;
        loadCaseCertificates(state.selectedCase._id);
        showToast(`Digital Excuse Duty (${built.certificateId}) issued, SHA-256 sealed, and sent to employee.`);
      }
    } catch (err) {
      alert('Failed to issue Digital Excuse Duty PDF: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Issue & send to employee'; }
      if (statusEl) { statusEl.style.display = 'none'; statusEl.textContent = 'Uploading medical document...'; }
    }
  };

  async function loadCaseCertificates(referralId) {
    const sec = document.getElementById('modalIssuedCertificatesSection');
    const list = document.getElementById('modalIssuedCertificatesList');
    if (!sec || !list || !referralId) return;
    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${referralId}/certificates`);
      renderCaseCertificates(res.data || []);
    } catch (e) {
      sec.style.display = 'none';
    }
  }

  function renderCaseCertificates(certs) {
    const sec = document.getElementById('modalIssuedCertificatesSection');
    const list = document.getElementById('modalIssuedCertificatesList');
    if (!sec || !list) return;
    if (!certs || certs.length === 0) {
      sec.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    sec.style.display = 'block';
    list.innerHTML = certs.map((c) => {
      const isRevoked = Boolean(c.revoked);
      const statusBadge = isRevoked
        ? '<span class="badge badge-danger">Revoked</span>'
        : '<span class="badge badge-success">Active</span>';
      const sealBadge = c.fileHashProtected
        ? '<span class="badge badge-neutral">SHA-256 sealed</span>'
        : '';
      const datesText = c.startDate
        ? (c.endDate && c.endDate !== c.startDate ? `${c.startDate} to ${c.endDate}` : c.startDate)
        : (c.issuedAt ? new Date(c.issuedAt).toISOString().split('T')[0] : '-');
      const safeIdAttr = escapeHtml(c.certificateId || '');
      const safeIdJs = escapeJsAttr(c.certificateId || '');
      const verifyHref = `/verify/${encodeURIComponent(c.certificateId || '')}`;

      return `
        <div class="attachment-row" style="flex-wrap: wrap;">
          <div style="min-width: 0; flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
              <strong class="tabular-nums" style="font-size: var(--text-sm); color: var(--text);">${safeIdAttr}</strong>
              ${statusBadge}
              ${sealBadge}
            </div>
            <div class="text-subtle-xs" style="margin-top: 2px;">
              Dates: ${escapeHtml(datesText)}${c.mdcNumber ? ` · MDC: ${escapeHtml(c.mdcNumber)}` : ''}
            </div>
            ${isRevoked && c.revokedReason ? `<div class="text-subtle-xs" style="color: var(--danger); margin-top: 2px;">Reason: ${escapeHtml(c.revokedReason)}</div>` : ''}
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0;">
            <a href="${escapeHtml(verifyHref)}" target="_blank" rel="noopener" class="btn btn-secondary btn-sm">Verify link</a>
            ${!isRevoked ? `<button type="button" class="btn btn-destructive btn-sm" onclick="openRevokeCertificateModal('${safeIdJs}', '${escapeJsAttr(datesText)}')">Revoke</button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  window.openRevokeCertificateModal = (certId, datesLabel) => {
    const idInput = document.getElementById('revokeCertIdInput');
    const summaryEl = document.getElementById('revokeCertSummary');
    const reasonEl = document.getElementById('revokeCertReasonInput');
    if (idInput) idInput.value = certId || '';
    if (summaryEl) {
      summaryEl.textContent = `Revoke certificate ${certId || ''}${datesLabel ? ' (' + datesLabel + ')' : ''}? Employers scanning its QR code will immediately see that it has been revoked.`;
    }
    if (reasonEl) reasonEl.value = '';
    openModal('revokeCertificateModal');
    setTimeout(() => reasonEl?.focus(), 40);
  };

  window.confirmRevokeCertificate = async (event) => {
    event.preventDefault();
    const certId = (document.getElementById('revokeCertIdInput')?.value || '').trim();
    const reason = (document.getElementById('revokeCertReasonInput')?.value || '').trim();
    const btn = document.getElementById('confirmRevokeCertBtn');
    if (!certId || reason.length < 5) {
      alert('Provide a revocation reason (at least 5 characters).');
      return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Revoking...'; }
    try {
      await assessorApiFetch(`${API_BASE}/certificates/${encodeURIComponent(certId)}/revoke`, {
        method: 'PATCH',
        body: JSON.stringify({ reason }),
      });
      closeModal('revokeCertificateModal');
      showToast(`Certificate ${certId} revoked.`);
      if (state.selectedCase?._id) {
        loadCaseCertificates(state.selectedCase._id);
      }
    } catch (err) {
      alert('Failed to revoke certificate: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Revoke certificate'; }
    }
  };

  window.openAssessorAttachment = (idx) => {
    const att = (state.selectedCase?.clinicalDetails?.attachments || [])[idx];
    if (!att) return;
    const raw = att.fileData || att.fileUrl || '';
    const safeHref = sanitizeSafeHref(raw, { allowData: true });
    if (safeHref === '#') {
      alert('This document format cannot be opened safely.');
      return;
    }
    if (safeHref.startsWith('data:')) {
      const parsed = dataUriToBlob(safeHref);
      if (!parsed) return;
      const blobUrl = URL.createObjectURL(parsed.blob);
      const win = window.open(blobUrl, '_blank', 'noopener');
      if (!win) {
        window.downloadAssessorAttachment(idx);
      }
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      window.open(safeHref, '_blank', 'noopener');
    }
  };

  window.downloadAssessorAttachment = (idx) => {
    const att = (state.selectedCase?.clinicalDetails?.attachments || [])[idx];
    if (!att) return;
    const raw = att.fileData || att.fileUrl || '';
    const safeHref = sanitizeSafeHref(raw, { allowData: true });
    if (safeHref === '#') {
      alert('This document cannot be downloaded safely.');
      return;
    }
    const fileName = att.fileName || 'Clinical_Document.pdf';
    if (safeHref.startsWith('data:')) {
      const parsed = dataUriToBlob(safeHref);
      if (!parsed) return;
      const blobUrl = URL.createObjectURL(parsed.blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    } else {
      const a = document.createElement('a');
      a.href = safeHref;
      a.download = fileName;
      a.target = '_blank';
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  };

  // --- Clinical Attachment Functions for Assessor ---
  function renderAssessorAttachments(attachments) {
    const attachList = document.getElementById('modalAttachmentsList');
    const countBadge = document.getElementById('clinicalDocsCountBadge');
    const count = Array.isArray(attachments) ? attachments.length : 0;
    if (countBadge) countBadge.textContent = `(${count})`;
    if (!attachList) return;

    if (!attachments || attachments.length === 0) {
      attachList.innerHTML = `
        <div style="color: var(--text-muted); font-size: var(--text-sm); background-color: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-control); padding: var(--space-3); text-align: center;">
          No medical documents attached yet. Use the certificate generator or upload a file above.
        </div>
      `;
      return;
    }

    attachList.innerHTML = attachments.map((att, idx) => {
      const iconSvg = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="color: var(--brand);"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`;

      const sizeStr = att.fileSize
        ? (att.fileSize > 1024 * 1024
            ? `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`
            : `${Math.round(att.fileSize / 1024)} KB`)
        : '';

      const timeStr = att.uploadedAt
        ? new Date(att.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Recently';

      const safeFileName = escapeHtml(att.fileName || 'Clinical_Document');
      const safeFileHref = escapeHtml(sanitizeSafeHref(att.fileData || att.fileUrl || '', { allowData: true }));
      const isPdf = /\.pdf$/i.test(att.fileName || '') || /application\/pdf/i.test(att.fileType || '');

      return `
        <div class="attachment-row">
          <div style="display: flex; align-items: center; gap: var(--space-2); min-width: 0; flex: 1;">
            <div style="flex-shrink: 0; display: flex; align-items: center;">${iconSvg}</div>
            <div style="min-width: 0; flex: 1;">
              <div style="font-weight: var(--weight-medium); color: var(--text); font-size: var(--text-base); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${safeFileName}</div>
              <div class="text-subtle-xs" style="display: flex; align-items: center; gap: var(--space-1); flex-wrap: wrap;">
                <span>${escapeHtml(timeStr)}</span>
                ${sizeStr ? `<span>·</span><span>${escapeHtml(sizeStr)}</span>` : ''}
                ${att.certificateId ? `<span>·</span><span class="tabular-nums">${escapeHtml(att.certificateId)}</span>` : ''}
                <span style="color: var(--success);">· Verified</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0;">
            ${isPdf ? `
            <button type="button" class="btn btn-secondary btn-sm" onclick="openAssessorAttachment(${idx})">
              <span>Open</span>
            </button>` : ''}
            <a href="${safeFileHref}" download="${safeFileName}" onclick="event.preventDefault(); downloadAssessorAttachment(${idx});" class="btn btn-secondary btn-sm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
              <span>Download</span>
            </a>
            <button type="button" class="btn btn-destructive btn-sm" onclick="handleDeleteAssessorAttachment(${idx})" title="Remove document" aria-label="Remove ${safeFileName}">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  window.handleAssessorDirectUpload = async (event) => {
    const fileInput = event.target;
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
    if (!state.selectedCase) {
      alert('Please open a referral case before uploading an attachment.');
      return;
    }

    const file = fileInput.files[0];
    if (file.size > 10 * 1024 * 1024) {
      alert('File exceeds 10MB maximum limit. Please choose a smaller PDF or image file.');
      fileInput.value = '';
      return;
    }

    const statusEl = document.getElementById('modalAttachmentUploadStatus');
    if (statusEl) statusEl.style.display = 'block';

    try {
      const base64Data = await readFileAsBase64(file);
      const res = await assessorApiFetch(`${API_BASE}/referrals/${state.selectedCase._id}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          fileData: base64Data,
          fileType: file.type || 'application/octet-stream',
          fileSize: file.size,
        }),
      });

      if (res && res.data) {
        state.selectedCase.clinicalDetails = state.selectedCase.clinicalDetails || {};
        state.selectedCase.clinicalDetails.attachments = res.data;
        renderAssessorAttachments(res.data);
        showToast(`Document "${file.name}" attached successfully!`);
      }
    } catch (err) {
      alert('Error uploading medical certificate: ' + err.message);
    } finally {
      if (statusEl) statusEl.style.display = 'none';
      fileInput.value = '';
    }
  };

  window.handleDeleteAssessorAttachment = async (index) => {
    if (!state.selectedCase) return;
    const attachments = state.selectedCase.clinicalDetails?.attachments || [];
    const target = attachments[index];
    const docName = target?.fileName || 'this document';

    if (!confirm(`Are you sure you want to remove "${docName}" from this case?`)) {
      return;
    }

    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${state.selectedCase._id}/attachments/${index}`, {
        method: 'DELETE',
      });

      if (res && res.data) {
        state.selectedCase.clinicalDetails = state.selectedCase.clinicalDetails || {};
        state.selectedCase.clinicalDetails.attachments = res.data;
        renderAssessorAttachments(res.data);
        showToast('Document removed successfully.');
      }
    } catch (err) {
      alert('Error removing attachment: ' + err.message);
    }
  };

  // --- Clinical Thread Functions for Assessor (Unified iMessage-Style Bubbles) ---
  function formatChatDateLabel(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const todayKey = now.toDateString();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (d.toDateString() === todayKey) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function renderAssessorModalThread(thread) {
    const container = document.getElementById('modalCaseThreadContainer');
    if (!container) return;

    if (!thread || thread.length === 0) {
      container.innerHTML = '<div style="margin:auto;color:var(--text-subtle);font-size:var(--text-sm);text-align:center;padding:var(--space-6) var(--space-4);max-width:280px;line-height:1.5;">No messages yet. Start a confidential conversation with the patient below.</div>';
      return;
    }

    let lastDateKey = '';
    const htmlParts = [];

    thread.forEach((msg, idx) => {
      const isAssessor = msg.sender === 'assessor';
      const prev = idx > 0 ? thread[idx - 1] : null;
      const next = idx < thread.length - 1 ? thread[idx + 1] : null;

      const msgDate = msg.timestamp ? new Date(msg.timestamp) : null;
      const dateKey = msgDate && !isNaN(msgDate.getTime()) ? msgDate.toDateString() : '';
      const dateChanged = Boolean(dateKey && dateKey !== lastDateKey);
      if (dateChanged) {
        lastDateKey = dateKey;
        htmlParts.push(`<div class="imsg-date-divider">${escapeHtml(formatChatDateLabel(msg.timestamp))}</div>`);
      }

      const sameAsPrev = Boolean(prev && prev.sender === msg.sender && !dateChanged);
      const nextDate = next && next.timestamp ? new Date(next.timestamp) : null;
      const nextDateKey = nextDate && !isNaN(nextDate.getTime()) ? nextDate.toDateString() : '';
      const sameAsNext = Boolean(next && next.sender === msg.sender && (!nextDateKey || nextDateKey === dateKey));

      const timeStr = msgDate && !isNaN(msgDate.getTime())
        ? msgDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';
      const safeMsg = escapeHtml(msg.message || '');
      const senderLabel = isAssessor ? 'You' : (state.selectedCase?.clinicalDetails?.patientName || 'Patient');

      htmlParts.push(`
        <div class="imsg-row ${isAssessor ? 'imsg-row--out' : 'imsg-row--in'}${sameAsPrev ? ' imsg-row--continued' : ''}">
          ${!sameAsPrev ? `<div class="imsg-sender">${escapeHtml(senderLabel)}</div>` : ''}
          <div class="imsg-bubble ${isAssessor ? 'imsg-bubble--out' : 'imsg-bubble--in'}">${safeMsg}</div>
          ${!sameAsNext && timeStr ? `<div class="imsg-time">${escapeHtml(timeStr)}</div>` : ''}
        </div>
      `);
    });

    container.innerHTML = htmlParts.join('');
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
  }

  window.submitAssessorCaseMessage = async () => {
    if (!state.selectedCase) return;
    const id = state.selectedCase._id;
    const inputEl = document.getElementById('modalCaseReplyInput');
    const msg = inputEl?.value.trim();
    const btn = document.getElementById('modalCaseSendReplyBtn');

    if (!msg) {
      if (inputEl) inputEl.focus();
      return;
    }

    if (btn) btn.disabled = true;

    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${id}/message`, {
        method: 'POST',
        body: JSON.stringify({ message: msg }),
      });

      if (res.success && res.thread) {
        state.selectedCase.thread = res.thread;
        const item = state.queue.find(r => r._id === id);
        if (item) item.thread = res.thread;

        if (inputEl) inputEl.value = '';
        renderAssessorModalThread(res.thread);
      }
    } catch (err) {
      alert('Error sending message: ' + err.message);
    } finally {
      if (btn) btn.disabled = false;
    }
  };

  // --- Real-time Live Sync Polling for Assessor Portal ---
  let assessorLiveSyncInterval = null;

  function startAssessorLiveSync() {
    stopAssessorLiveSync();
    assessorLiveSyncInterval = setInterval(async () => {
      if (!getAssessorToken()) {
        stopAssessorLiveSync();
        return;
      }

      try {
        const res = await assessorApiFetch(`${API_BASE}/queue`);
        if (res && res.data) {
          const prevLen = state.queue.length;
          const newLen = res.data.length;
          state.queue = res.data;

          // If count changed or status changed, re-render queue table & KPIs
          if (newLen !== prevLen) {
            updateCompanyFilter();
            processFilteredQueue();
            updateKPIs();
          }

          // If a case modal is currently open, live-sync its thread & status
          const modal = document.getElementById('caseDetailModal');
          const isModalOpen = modal && modal.classList.contains('show');

          if (isModalOpen && state.selectedCase) {
            const updatedCase = res.data.find(r => r._id === state.selectedCase._id);
            if (updatedCase) {
              const prevThreadLen = (state.selectedCase.thread || []).length;
              const newThreadLen = (updatedCase.thread || []).length;
              const prevAttLen = (state.selectedCase.clinicalDetails?.attachments || []).length;
              const newAttLen = (updatedCase.clinicalDetails?.attachments || []).length;
              const prevStatus = state.selectedCase.status;

              if (newThreadLen !== prevThreadLen || updatedCase.status !== prevStatus || newAttLen !== prevAttLen) {
                state.selectedCase = updatedCase;
                renderAssessorModalThread(updatedCase.thread || []);
                renderAssessorAttachments(updatedCase.clinicalDetails?.attachments || []);
              }
            }
          }
        }
      } catch (err) {
        // Silent poll error
      }
    }, 2500);
  }

  function stopAssessorLiveSync() {
    if (assessorLiveSyncInterval) {
      clearInterval(assessorLiveSyncInterval);
      assessorLiveSyncInterval = null;
    }
  }

  window.submitScheduleAppointment = async () => {
    if (!state.selectedCase) return;
    const id = state.selectedCase._id;
    const dateVal = document.getElementById('scheduleDateInput')?.value;
    const timeVal = document.getElementById('scheduleTimeInput')?.value;
    const notesVal = document.getElementById('scheduleNotesInput')?.value;
    const meetingVal = document.getElementById('scheduleMeetingLinkInput')?.value.trim();

    if (!dateVal) {
      alert('Please select an appointment date.');
      return;
    }

    try {
      const res = await assessorApiFetch(`${API_BASE}/referrals/${id}/schedule`, {
        method: 'PATCH',
        body: JSON.stringify({
          scheduledDate: dateVal,
          scheduledTime: timeVal,
          appointmentNotes: notesVal,
          meetingLink: meetingVal,
        }),
      });

      // Update local state
      const item = state.queue.find(r => r._id === id);
      if (item) {
        item.scheduledAt = res.data.scheduledAt;
        item.appointmentNotes = res.data.appointmentNotes;
        item.clinicalDetails = item.clinicalDetails || {};
        item.clinicalDetails.meetingLink = res.data.clinicalDetails?.meetingLink || meetingVal;
        item.status = 'scheduled';
      }

      showToast('Appointment and meeting link saved successfully!');
      closeModal('caseDetailModal');
      updateKPIs();
      processFilteredQueue();
    } catch (err) {
      alert('Error scheduling appointment: ' + err.message);
    }
  };

  // --- Complete & Bill Modal ---
  window.openCompleteFromDetail = () => {
    const targetId = state.selectedCase?._id;
    closeModal('caseDetailModal');
    if (targetId) {
      window.requestCompleteConfirmation(targetId);
    }
  };

  window.openCompleteModal = (id) => {
    const item = state.queue.find((r) => r._id === id);
    if (!item) return;
    state.selectedCase = item;

    document.getElementById('completeReferralId').value = item._id;
    document.getElementById('completePatientSummary').textContent = `${item.clinicalDetails?.patientName || 'Patient'} · [${item.referenceCode}]`;
    
    const defaultRate = state.assessor?.billingSettings?.defaultRate || 450;
    const defaultCurr = state.assessor?.billingSettings?.defaultCurrency || 'GHS';
    
    document.getElementById('completeBillingAmount').value = item.billing?.amount || defaultRate;
    document.getElementById('completeCurrencySelect').value = item.billing?.currency || defaultCurr;
    document.getElementById('completeAssessorNotes').value = item.clinicalDetails?.assessorNotes || '';
    document.getElementById('completeAttachmentInput').value = '';

    openModal('completeCaseModal');
  };

  window.handleCompleteCaseSubmit = async (event) => {
    event.preventDefault();
    const id = document.getElementById('completeReferralId').value;
    const rawAmount = document.getElementById('completeBillingAmount').value;
    const currency = document.getElementById('completeCurrencySelect').value;
    const notes = document.getElementById('completeAssessorNotes').value;
    const fileInput = document.getElementById('completeAttachmentInput');
    const btn = document.getElementById('completeSubmitBtn');

    const amount = Number(rawAmount);
    if (isNaN(amount) || amount < 0) {
      alert('Please enter a valid non-negative billing amount.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving & Settling...';

    try {
      let attachmentPayload = null;
      if (fileInput && fileInput.files && fileInput.files[0]) {
        const file = fileInput.files[0];
        if (file.size > 10 * 1024 * 1024) {
          alert('File exceeds 10MB maximum size limit.');
          btn.disabled = false;
          btn.textContent = 'Complete & bill';
          return;
        }

        const base64Data = await readFileAsBase64(file);
        attachmentPayload = {
          fileName: file.name,
          fileData: base64Data,
          fileType: file.type,
          fileSize: file.size,
        };
      }

      await assessorApiFetch(`${API_BASE}/referrals/${id}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount,
          currency,
          assessorNotes: notes,
          attachment: attachmentPayload,
        }),
      });

      closeModal('completeCaseModal');
      showToast('Referral case completed and billed successfully!');
      fetchAssessorQueue();
    } catch (err) {
      alert('Error completing case: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Complete & bill';
    }
  };

  function readFileAsBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // --- Monthly Invoicing & Reconciliation Export Engine ---
  window.openExportModal = () => {
    updateCompanyFilter();
    updateExportPreview();
    openModal('exportStatementModal');
  };

  window.handleExportPeriodChange = () => {
    const period = document.getElementById('exportPeriodSelect')?.value;
    const customCont = document.getElementById('exportCustomDateContainer');
    if (customCont) {
      customCont.style.display = period === 'custom' ? 'grid' : 'none';
    }
    updateExportPreview();
  };

  function getExportFilteredCases() {
    const compVal = document.getElementById('exportCompanySelect')?.value || 'all';
    const period = document.getElementById('exportPeriodSelect')?.value || 'this_month';
    const settlement = document.getElementById('exportSettlementSelect')?.value || 'all';

    let list = [...state.queue];

    if (compVal !== 'all') {
      list = list.filter(r => String(r.tenantId?._id || r.tenantId) === String(compVal));
    }

    if (settlement !== 'all') {
      list = list.filter(r => (r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled')) === settlement);
    }

    const now = new Date();
    if (period === 'this_month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      list = list.filter(r => new Date(r.createdAt).getTime() >= start);
    } else if (period === 'last_month') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999).getTime();
      list = list.filter(r => {
        const t = new Date(r.createdAt).getTime();
        return t >= start && t <= end;
      });
    } else if (period === 'custom') {
      const sVal = document.getElementById('exportStartDate')?.value;
      const eVal = document.getElementById('exportEndDate')?.value;
      if (sVal) {
        const sTime = new Date(sVal).setHours(0, 0, 0, 0);
        list = list.filter(r => new Date(r.createdAt).getTime() >= sTime);
      }
      if (eVal) {
        const eTime = new Date(eVal).setHours(23, 59, 59, 999);
        list = list.filter(r => new Date(r.createdAt).getTime() <= eTime);
      }
    }

    return list;
  }

  window.updateExportPreview = () => {
    const list = getExportFilteredCases();
    let subtotal = 0;
    let settled = 0;
    let pending = 0;

    list.forEach(r => {
      const amt = r.billing?.amount || 0;
      subtotal += amt;
      const s = r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled');
      if (s === 'settled') {
        settled += amt;
      } else {
        pending += amt;
      }
    });

    const curr = state.assessor?.billingSettings?.defaultCurrency || 'GHS';

    if (document.getElementById('exportCountPreview')) document.getElementById('exportCountPreview').textContent = list.length;
    if (document.getElementById('exportSubtotalPreview')) document.getElementById('exportSubtotalPreview').textContent = `${curr} ${subtotal.toFixed(2)}`;
    if (document.getElementById('exportSettledPreview')) document.getElementById('exportSettledPreview').textContent = `${curr} ${settled.toFixed(2)}`;
    if (document.getElementById('exportPendingPreview')) document.getElementById('exportPendingPreview').textContent = `${curr} ${pending.toFixed(2)}`;
  };

  window.generateCSVExport = () => {
    const list = getExportFilteredCases();
    if (list.length === 0) {
      alert('No referral records match the selected statement criteria.');
      return;
    }

    const rows = [
      [
        'Reference Code',
        'Client Organization',
        'Department',
        'Patient Name',
        'Assigned Clinician',
        'Submission Date',
        'Scheduled Date',
        'Completed Date',
        'Status',
        'Billing Amount',
        'Currency',
        'Settlement Status',
        'Settled Date',
      ],
      ...list.map(r => [
        r.referenceCode,
        r.tenantId?.company_name || 'Organization',
        r.departmentName || 'General',
        r.clinicalDetails?.patientName || '',
        r.assignedDoctorId ? (r.assignedDoctorId.fullName || 'Clinician') : 'Unassigned',
        r.createdAt ? new Date(r.createdAt).toISOString().split('T')[0] : '',
        r.scheduledAt ? new Date(r.scheduledAt).toISOString().split('T')[0] : '',
        r.clinicalDetails?.completedAt ? new Date(r.clinicalDetails.completedAt).toISOString().split('T')[0] : '',
        r.status || 'pending',
        (r.billing?.amount || 0).toFixed(2),
        r.billing?.currency || 'GHS',
        r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled'),
        r.billing?.settledAt ? new Date(r.billing.settledAt).toISOString().split('T')[0] : '',
      ]),
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + rows.map(e => e.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Clinical_Invoicing_Statement_${dateStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('CSV statement downloaded successfully.');
  };

  window.generatePDFInvoice = async () => {
    const list = getExportFilteredCases();
    if (list.length === 0) {
      alert('No referral records match the selected statement criteria.');
      return;
    }

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if (!jsPDFClass) {
      alert('PDF generator library is initializing. Please try again in a moment.');
      return;
    }

    const doc = new jsPDFClass({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const assessor = state.assessor || {};
    const settings = assessor.billingSettings || {};
    const curr = settings.defaultCurrency || 'GHS';
    const clinicName = assessor.organization || assessor.name || 'Medical Assessor Services';
    const clinicPhone = assessor.phone || '';
    const clinicEmail = assessor.notificationEmail || assessor.email || '';
    const clinicAddress = assessor.address || 'Medical Assessment Division';

    // Page margins & dimensions
    const margin = 14;
    const pageWidth = 210;
    let y = 16;

    // Header Background Accent Bar
    doc.setFillColor(13, 148, 136); // #0D9488
    doc.rect(0, 0, pageWidth, 5, 'F');

    // Clinic Header
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42); // #0F172A
    doc.text(clinicName, margin, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    if (clinicAddress) doc.text(clinicAddress, margin, y + 9);
    if (clinicPhone || clinicEmail) doc.text(`Phone: ${clinicPhone} | Email: ${clinicEmail}`, margin, y + 14);

    // Invoice Title & Metadata
    const invoiceNum = `INV-${Date.now().toString().slice(-6)}`;
    const invoiceDate = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(13, 148, 136);
    doc.text('INVOICE STATEMENT', pageWidth - margin - 55, y + 4);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text(`Statement #: ${invoiceNum}`, pageWidth - margin - 55, y + 9);
    doc.text(`Date Issued: ${invoiceDate}`, pageWidth - margin - 55, y + 14);

    y += 24;

    // Divider Line
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y, pageWidth - margin, y);
    y += 6;

    // Bill To Section
    const compSelect = document.getElementById('exportCompanySelect');
    const clientName = compSelect && compSelect.value !== 'all'
      ? compSelect.options[compSelect.selectedIndex]?.text
      : 'All Client Organizations (Consolidated)';

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('BILL TO CLIENT:', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(13, 148, 136);
    doc.text(clientName, margin, y + 5);

    y += 12;

    // Itemized Table Header
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, pageWidth - (margin * 2), 7, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.rect(margin, y, pageWidth - (margin * 2), 7, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text('REF CODE', margin + 3, y + 4.5);
    doc.text('DEPARTMENT', margin + 38, y + 4.5);
    doc.text('CONSULTATION', margin + 85, y + 4.5);
    doc.text('STATUS', margin + 120, y + 4.5);
    doc.text(`AMOUNT (${curr})`, pageWidth - margin - 26, y + 4.5);

    y += 7;

    let subtotal = 0;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    list.forEach((item) => {
      if (y > 265) {
        doc.addPage();
        y = 16;
      }

      const amt = item.billing?.amount || 0;
      subtotal += amt;
      const dept = (item.departmentName || 'General Staff').slice(0, 22);
      const consultDate = item.clinicalDetails?.completedAt
        ? new Date(item.clinicalDetails.completedAt).toLocaleDateString()
        : (item.scheduledAt ? new Date(item.scheduledAt).toLocaleDateString() : 'Pending');
      const st = item.status === 'completed' ? 'Completed' : (item.status === 'scheduled' ? 'Scheduled' : 'Pending');

      doc.setTextColor(15, 23, 42);
      doc.text(item.referenceCode, margin + 3, y + 4.5);
      doc.text(dept, margin + 38, y + 4.5);
      doc.text(consultDate, margin + 85, y + 4.5);
      doc.text(st, margin + 120, y + 4.5);
      doc.text(amt.toFixed(2), pageWidth - margin - 10, y + 4.5, { align: 'right' });

      doc.setDrawColor(241, 245, 249);
      doc.line(margin, y + 6, pageWidth - margin, y + 6);
      y += 6;
    });

    y += 4;

    // Totals Box
    const taxRate = settings.taxRate || 0;
    const taxAmount = (subtotal * taxRate) / 100;
    const totalPayable = subtotal + taxAmount;

    doc.setFillColor(248, 250, 252);
    doc.roundedRect(pageWidth - margin - 70, y, 70, taxRate > 0 ? 24 : 16, 2, 2, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(pageWidth - margin - 70, y, 70, taxRate > 0 ? 24 : 16, 2, 2, 'S');

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Subtotal:', pageWidth - margin - 65, y + 5);
    doc.text(`${curr} ${subtotal.toFixed(2)}`, pageWidth - margin - 5, y + 5, { align: 'right' });

    if (taxRate > 0) {
      doc.text(`Tax/VAT (${taxRate}%):`, pageWidth - margin - 65, y + 10);
      doc.text(`${curr} ${taxAmount.toFixed(2)}`, pageWidth - margin - 5, y + 10, { align: 'right' });
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(13, 148, 136);
    const totalY = taxRate > 0 ? y + 18 : y + 12;
    doc.text('Total Due:', pageWidth - margin - 65, totalY);
    doc.text(`${curr} ${totalPayable.toFixed(2)}`, pageWidth - margin - 5, totalY, { align: 'right' });

    y += taxRate > 0 ? 30 : 22;

    // Payment Instructions Box
    const paymentInstructions = settings.paymentInstructions || 'Direct Bank Settlement / Standard Net 30 Terms';
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 16, 2, 2, 'F');
    doc.setDrawColor(153, 246, 228);
    doc.roundedRect(margin, y, pageWidth - (margin * 2), 16, 2, 2, 'S');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(13, 148, 136);
    doc.text('PAYMENT INSTRUCTIONS & TERMS:', margin + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(paymentInstructions, margin + 4, y + 10);

    // Save and Download PDF
    const filename = `Invoice_Statement_${clientName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;
    doc.save(filename);

    showToast('Official PDF Invoice generated and downloaded.');
  };

  // --- Clinic Profile & Settings ---
  window.loadAssessor2faStatus = async () => {
    const statusText = document.getElementById('assessor2faStatusText');
    const setupStep = document.getElementById('assessor2faSetupStep');
    const enabledStep = document.getElementById('assessor2faEnabledStep');
    try {
      const res = await assessorApiFetch(`${API_BASE}/2fa/status`);
      if (statusText) {
        statusText.textContent = res.enabled
          ? `Enabled (${res.recovery_codes_remaining || 0} backup codes remaining)`
          : 'Not enabled. Recommended for clinical account security.';
      }
      if (setupStep) setupStep.style.display = res.enabled ? 'none' : 'block';
      if (enabledStep) enabledStep.style.display = res.enabled ? 'block' : 'none';
    } catch (e) {
      if (statusText) statusText.textContent = 'Unable to load 2FA status';
    }
  };

  window.toggleAssessor2faPanel = async () => {
    const box = document.getElementById('assessor2faConfigBox');
    if (!box) return;
    const opening = box.style.display === 'none' || !box.style.display;
    box.style.display = opening ? 'block' : 'none';
    if (!opening) return;
    await window.loadAssessor2faStatus();
    try {
      const statusRes = await assessorApiFetch(`${API_BASE}/2fa/status`);
      if (!statusRes.enabled) {
        const setupRes = await assessorApiFetch(`${API_BASE}/2fa/setup`, { method: 'POST' });
        const secEl = document.getElementById('assessor2faSecretDisplay');
        if (secEl) secEl.textContent = setupRes.secret || '';
      }
    } catch (e) {
      showToast(e.message || 'Failed to start 2FA setup', 'error');
    }
  };

  function showAssessorRecoveryCodes(codes) {
    const box = document.getElementById('assessor2faRecoveryBox');
    const list = document.getElementById('assessor2faRecoveryList');
    if (box && list && Array.isArray(codes) && codes.length) {
      list.innerHTML = codes.map(c => `<div>${escapeHtml(c)}</div>`).join('');
      box.style.display = 'block';
    }
  }

  window.confirmEnableAssessor2fa = async () => {
    const code = (document.getElementById('assessor2faConfirmCode')?.value || '').trim();
    if (!/^\d{6}$/.test(code)) return showToast('Enter a valid 6-digit code from your authenticator app.', 'error');
    try {
      const res = await assessorApiFetch(`${API_BASE}/2fa/enable`, {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      showAssessorRecoveryCodes(res.recovery_codes);
      showToast('Two-factor authentication enabled!');
      await window.loadAssessor2faStatus();
    } catch (e) {
      showToast(e.message || 'Invalid verification code', 'error');
    }
  };

  window.regenerateAssessorRecoveryCodes = async () => {
    const code = (document.getElementById('assessor2faManageCode')?.value || '').trim();
    if (!/^\d{6}$/.test(code)) return showToast('Enter current 6-digit authenticator code first.', 'error');
    try {
      const res = await assessorApiFetch(`${API_BASE}/2fa/regenerate-recovery-codes`, {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      showAssessorRecoveryCodes(res.recovery_codes);
      showToast('New single-use recovery codes generated.');
      await window.loadAssessor2faStatus();
    } catch (e) {
      showToast(e.message || 'Could not regenerate recovery codes', 'error');
    }
  };

  window.disableAssessor2fa = async () => {
    const code = (document.getElementById('assessor2faManageCode')?.value || '').trim();
    if (!/^\d{6}$/.test(code)) return showToast('Enter current 6-digit authenticator code to disable 2FA.', 'error');
    try {
      await assessorApiFetch(`${API_BASE}/2fa/disable`, {
        method: 'POST',
        body: JSON.stringify({ code })
      });
      const recBox = document.getElementById('assessor2faRecoveryBox');
      if (recBox) recBox.style.display = 'none';
      showToast('Two-factor authentication disabled.');
      await window.loadAssessor2faStatus();
    } catch (e) {
      showToast(e.message || 'Could not disable 2FA', 'error');
    }
  };

  window.openClinicSettingsModal = async () => {
    try {
      const res = await assessorApiFetch(`${API_BASE}/profile`);
      window.loadAssessor2faStatus();
      const data = res.data || {};
      const settings = data.billingSettings || {};

      document.getElementById('settingsClinicName').value = data.organization || data.name || '';
      const regEl = document.getElementById('settingsPracticeRegNumber');
      if (regEl) regEl.value = data.practiceRegistrationNumber || '';
      const mdcEl = document.getElementById('settingsMdcNumber');
      if (mdcEl) mdcEl.value = state.assessor?.mdcNumber || data.mdcNumber || '';
      const hefraExpEl = document.getElementById('settingsHefraExpiry');
      if (hefraExpEl) {
        const rawHefra = data.hefraLicenseExpiry || state.assessor?.hefraLicenseExpiry;
        hefraExpEl.value = rawHefra ? new Date(rawHefra).toISOString().split('T')[0] : '';
      }
      const mdcExpEl = document.getElementById('settingsMdcExpiry');
      if (mdcExpEl) {
        const rawMdc = state.assessor?.mdcLicenseExpiry || data.mdcLicenseExpiry;
        mdcExpEl.value = rawMdc ? new Date(rawMdc).toISOString().split('T')[0] : '';
      }
      document.getElementById('settingsPhone').value = data.phone || '';
      document.getElementById('settingsNotificationEmail').value = data.notificationEmail || data.email || '';
      document.getElementById('settingsAddress').value = data.address || '';
      document.getElementById('settingsDefaultRate').value = settings.defaultRate || 450;
      document.getElementById('settingsDefaultCurrency').value = settings.defaultCurrency || 'GHS';
      document.getElementById('settingsTaxId').value = settings.taxId || '';
      document.getElementById('settingsTaxRate').value = settings.taxRate || 0;
      document.getElementById('settingsPaymentInstructions').value = settings.paymentInstructions || '';

      // Populate clinician signature state
      const isDrEdith = /edith\s+clarke/i.test(state.profile?.fullName || state.assessor?.name || data.name || '');
      const isFzClinic = /fz\s+safety/i.test(data.organization || state.assessor?.organization || '');

      const sigUrl = state.assessor?.signatureDataUrl || data.signatureDataUrl || (isDrEdith ? '/assets/signatures/dr-edith-clarke.png' : '');
      const sigApproved = Boolean(state.assessor?.signatureApprovedAt || data.signatureApprovedAt || (isDrEdith && sigUrl === '/assets/signatures/dr-edith-clarke.png'));
      window._pendingSignatureDataUrl = sigUrl;
      const sigPreview = document.getElementById('settingsSignaturePreview');
      const sigApproveCheck = document.getElementById('settingsSignatureApproveCheck');
      if (sigPreview) {
        if (sigUrl) {
          sigPreview.src = sigUrl;
          sigPreview.style.display = 'block';
        } else {
          sigPreview.removeAttribute('src');
          sigPreview.style.display = 'none';
        }
      }
      if (sigApproveCheck) sigApproveCheck.checked = sigApproved && Boolean(sigUrl);

      // Populate clinic stamp state
      const stampUrl = state.assessor?.stampDataUrl || data.stampDataUrl || (isFzClinic ? '/assets/stamps/fz-safety-and-health-centre.png' : '');
      const stampApproved = Boolean(state.assessor?.stampApprovedAt || data.stampApprovedAt || (isFzClinic && stampUrl === '/assets/stamps/fz-safety-and-health-centre.png'));
      window._pendingStampDataUrl = stampUrl;
      const stampPreview = document.getElementById('settingsStampPreview');
      const stampApproveCheck = document.getElementById('settingsStampApproveCheck');
      if (stampPreview) {
        if (stampUrl) {
          stampPreview.src = stampUrl;
          stampPreview.style.display = 'block';
        } else {
          stampPreview.removeAttribute('src');
          stampPreview.style.display = 'none';
        }
      }
      if (stampApproveCheck) stampApproveCheck.checked = stampApproved && Boolean(stampUrl);

      openModal('clinicSettingsModal');
    } catch (err) {
      alert('Error loading clinic settings: ' + err.message);
    }
  };

  window.handleSignatureFileSelected = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      alert('Please select a PNG or JPEG signature image.');
      return;
    }
    if (file.size > 250 * 1024) {
      alert('Signature image must be under 250 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      window._pendingSignatureDataUrl = reader.result || '';
      const sigPreview = document.getElementById('settingsSignaturePreview');
      if (sigPreview && window._pendingSignatureDataUrl) {
        sigPreview.src = window._pendingSignatureDataUrl;
        sigPreview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  };

  window.handleClearSignature = () => {
    window._pendingSignatureDataUrl = '';
    const sigPreview = document.getElementById('settingsSignaturePreview');
    const sigInput = document.getElementById('settingsSignatureInput');
    const sigApproveCheck = document.getElementById('settingsSignatureApproveCheck');
    if (sigPreview) { sigPreview.removeAttribute('src'); sigPreview.style.display = 'none'; }
    if (sigInput) sigInput.value = '';
    if (sigApproveCheck) sigApproveCheck.checked = false;
  };

  window.handleStampFileSelected = (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      alert('Please select a PNG or JPEG clinic stamp image.');
      return;
    }
    if (file.size > 250 * 1024) {
      alert('Clinic stamp image must be under 250 KB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      window._pendingStampDataUrl = reader.result || '';
      const stampPreview = document.getElementById('settingsStampPreview');
      if (stampPreview && window._pendingStampDataUrl) {
        stampPreview.src = window._pendingStampDataUrl;
        stampPreview.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  };

  window.handleClearStamp = () => {
    window._pendingStampDataUrl = '';
    const stampPreview = document.getElementById('settingsStampPreview');
    const stampInput = document.getElementById('settingsStampInput');
    const stampApproveCheck = document.getElementById('settingsStampApproveCheck');
    if (stampPreview) { stampPreview.removeAttribute('src'); stampPreview.style.display = 'none'; }
    if (stampInput) stampInput.value = '';
    if (stampApproveCheck) stampApproveCheck.checked = false;
  };

  window.handleSaveClinicSettings = async (event) => {
    event.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const organization = document.getElementById('settingsClinicName').value.trim();
    const practiceRegistrationNumber = (document.getElementById('settingsPracticeRegNumber')?.value || '').trim();
    const mdcNumber = (document.getElementById('settingsMdcNumber')?.value || '').trim();
    const hefraLicenseExpiry = document.getElementById('settingsHefraExpiry')?.value || null;
    const mdcLicenseExpiry = document.getElementById('settingsMdcExpiry')?.value || null;
    const phone = document.getElementById('settingsPhone').value.trim();
    const notificationEmail = document.getElementById('settingsNotificationEmail').value.trim();
    const address = document.getElementById('settingsAddress').value.trim();
    const defaultRate = Number(document.getElementById('settingsDefaultRate').value) || 0;
    const defaultCurrency = document.getElementById('settingsDefaultCurrency').value;
    const taxId = document.getElementById('settingsTaxId').value.trim();
    const taxRate = Number(document.getElementById('settingsTaxRate').value) || 0;
    const paymentInstructions = document.getElementById('settingsPaymentInstructions').value.trim();
    const signatureDataUrl = window._pendingSignatureDataUrl !== undefined
      ? window._pendingSignatureDataUrl
      : (state.assessor?.signatureDataUrl || '');
    const signatureApproved = Boolean(document.getElementById('settingsSignatureApproveCheck')?.checked && signatureDataUrl);
    const stampDataUrl = window._pendingStampDataUrl !== undefined
      ? window._pendingStampDataUrl
      : (state.assessor?.stampDataUrl || '');
    const stampApproved = Boolean(document.getElementById('settingsStampApproveCheck')?.checked && stampDataUrl);

    try {
      const res = await assessorApiFetch(`${API_BASE}/profile`, {
        method: 'PUT',
        body: JSON.stringify({
          organization,
          practiceRegistrationNumber,
          hefraLicenseExpiry,
          mdcNumber,
          mdcLicenseExpiry,
          signatureDataUrl,
          signatureApproved,
          stampDataUrl,
          stampApproved,
          phone,
          notificationEmail,
          address,
          billingSettings: {
            defaultRate,
            defaultCurrency,
            taxId,
            taxRate,
            paymentInstructions,
          },
        }),
      });

      state.assessor = {
        ...state.assessor,
        ...res.data,
      };

      closeModal('clinicSettingsModal');
      showToast('Clinic settings and billing preferences saved successfully.');
      updateKPIs();
    } catch (err) {
      alert('Error saving settings: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Save Settings';
    }
  };

  // --- Password Visibility Toggle ---
  window.togglePasswordVisibility = (inputId, btnEl) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    if (btnEl) {
      btnEl.setAttribute('aria-label', showing ? 'Hide password' : 'Show password');
      btnEl.setAttribute('aria-pressed', showing ? 'true' : 'false');
      btnEl.title = showing ? 'Hide password' : 'Show password';
      btnEl.innerHTML = showing
        ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>'
        : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    }
  };

  // --- Modal Helpers ---
  window.openModal = (id) => {
    const modal = document.getElementById(id);
    if (!modal) return;
    lastModalOpener = document.activeElement;
    modal.classList.add('show', 'is-open');
    if (typeof removeActiveFocusTrap === 'function') {
      removeActiveFocusTrap();
      removeActiveFocusTrap = null;
    }
    if (window.HavilahUI && typeof window.HavilahUI.trapModalFocus === 'function') {
      removeActiveFocusTrap = window.HavilahUI.trapModalFocus(modal, () => {
        if (id === 'autoLockWarningModal') {
          window.resetInactivityTimerFromModal();
        } else {
          window.closeModal(id);
        }
      });
    }
  };

  window.closeModal = (id) => {
    if (id === 'caseDetailModal') {
      stopAssessorLiveSync();
      if (window.HavilahCall && window.HavilahCall.activeCallState !== 'idle') {
        window.HavilahCall.hangup();
      }
    }
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show', 'is-open');
    if (typeof removeActiveFocusTrap === 'function') {
      removeActiveFocusTrap();
      removeActiveFocusTrap = null;
    }
    if (lastModalOpener && typeof lastModalOpener.focus === 'function' && document.contains(lastModalOpener)) {
      lastModalOpener.focus();
      lastModalOpener = null;
    }
  };

  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('modal-backdrop') && e.target.id && e.target.id !== 'autoLockWarningModal') {
      window.closeModal(e.target.id);
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
  });
})();
