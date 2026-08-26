(() => {
  'use strict';

  let state = {
    assessor: null,
    doctors: [],
    queue: [],
    filteredQueue: [],
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
      status: 'all',
      settlement: 'all',
      datePreset: 'all',
      startDate: null,
      endDate: null,
    },
  };

  const API_BASE = '/api/v1/assessor';

  // --- Auto-Lock Security Watcher (HIPAA Compliance: 15-min inactivity timeout) ---
  const INACTIVITY_TIMEOUT_SEC = 15 * 60; // 900 seconds (15 mins)
  const WARNING_THRESHOLD_SEC = 60; // 60 seconds warning
  let secondsRemaining = INACTIVITY_TIMEOUT_SEC;
  let inactivityInterval = null;

  function initAutoLockTimer() {
    const resetTimer = () => {
      secondsRemaining = INACTIVITY_TIMEOUT_SEC;
      const warningModal = document.getElementById('autoLockWarningModal');
      if (warningModal && warningModal.classList.contains('show')) {
        warningModal.classList.remove('show');
      }
      const badge = document.getElementById('securityTimerBadge');
      if (badge) badge.classList.remove('warning');
    };

    ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    if (inactivityInterval) clearInterval(inactivityInterval);
    inactivityInterval = setInterval(() => {
      if (!getAssessorToken()) return;

      secondsRemaining--;
      updateTimerDisplay();

      if (secondsRemaining === WARNING_THRESHOLD_SEC) {
        showAutoLockWarning();
      }

      if (secondsRemaining <= 0) {
        clearInterval(inactivityInterval);
        handleSecurityAutoLock();
      }
    }, 1000);
  }

  function updateTimerDisplay() {
    const timerEl = document.getElementById('autoLockTimer');
    const badge = document.getElementById('securityTimerBadge');
    if (!timerEl) return;

    const mins = Math.floor(Math.max(0, secondsRemaining) / 60);
    const secs = Math.max(0, secondsRemaining) % 60;
    timerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (badge) {
      if (secondsRemaining <= WARNING_THRESHOLD_SEC) {
        badge.classList.add('warning');
      } else {
        badge.classList.remove('warning');
      }
    }
  }

  function showAutoLockWarning() {
    const modal = document.getElementById('autoLockWarningModal');
    if (modal) modal.classList.add('show');

    const countdownEl = document.getElementById('lockWarningCountdown');
    const countdownTimer = setInterval(() => {
      if (countdownEl) countdownEl.textContent = String(Math.max(0, secondsRemaining));
      if (secondsRemaining <= 0 || !modal.classList.contains('show')) {
        clearInterval(countdownTimer);
      }
    }, 1000);
  }

  window.resetInactivityTimerFromModal = () => {
    secondsRemaining = INACTIVITY_TIMEOUT_SEC;
    closeModal('autoLockWarningModal');
    const badge = document.getElementById('securityTimerBadge');
    if (badge) badge.classList.remove('warning');
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

  async function checkAuth() {
    const token = getAssessorToken();
    const loginSection = document.getElementById('assessorLoginSection');
    const dashboardSection = document.getElementById('assessorDashboardSection');
    const headerControls = document.getElementById('authHeaderControls');

    if (!token) {
      if (loginSection) loginSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      if (headerControls) headerControls.style.display = 'none';
      return;
    }

    try {
      const res = await assessorApiFetch(`${API_BASE}/me`);
      state.assessor = res.assessor;

      const isClinicAdmin = isUserClinicAdmin(res.assessor);
      state.assessor.isClinicAdmin = isClinicAdmin;

      const nameDisplay = document.getElementById('assessorNameDisplay');
      const orgDisplay = document.getElementById('assessorOrgDisplay');
      const manageStaffBtn = document.getElementById('manageStaffBtn');
      const doctorFilterSelect = document.getElementById('doctorFilterSelect');

      if (nameDisplay) nameDisplay.textContent = res.assessor.name;
      if (orgDisplay) {
        orgDisplay.innerHTML = `${res.assessor.organization || 'Clinical Practice'} &bull; <span class="badge ${isClinicAdmin ? 'badge-admin-role' : 'badge-specialty'}">${isClinicAdmin ? 'Clinic Admin' : (res.assessor.specialty || 'Staff Doctor')}</span>`;
      }

      if (manageStaffBtn) manageStaffBtn.style.display = isClinicAdmin ? 'inline-flex' : 'none';
      if (doctorFilterSelect) doctorFilterSelect.style.display = isClinicAdmin ? 'inline-block' : 'none';

      if (loginSection) loginSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'block';
      if (headerControls) headerControls.style.display = 'flex';

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
    }
  }

  // --- Clinician Staff Management ---
  async function fetchDoctorsList() {
    try {
      const res = await assessorApiFetch(`${API_BASE}/doctors`);
      state.doctors = res.data || [];
      updateDoctorDropdowns();
      const badge = document.getElementById('doctorCountBadge');
      if (badge) badge.textContent = state.doctors.length;
      renderDoctorsTable();
    } catch (err) {
      console.warn('Doctors list load notice:', err.message);
    }
  }

  function updateDoctorDropdowns() {
    const filterSelect = document.getElementById('doctorFilterSelect');
    const assignSelect = document.getElementById('modalDoctorAssignSelect');

    if (filterSelect) {
      const curFilter = filterSelect.value;
      let filterOpts = '<option value="all">All Clinicians</option><option value="unassigned">Unassigned Only</option>';
      state.doctors.forEach(doc => {
        if (doc.active) {
          filterOpts += `<option value="${doc._id}">${doc.fullName} (${doc.specialty || 'General'})</option>`;
        }
      });
      filterSelect.innerHTML = filterOpts;
      if (curFilter) filterSelect.value = curFilter;
    }

    if (assignSelect) {
      const curAssign = assignSelect.value;
      let assignOpts = '<option value="">-- Unassigned (Practice Queue) --</option>';
      state.doctors.forEach(doc => {
        if (doc.active) {
          assignOpts += `<option value="${doc._id}">${doc.fullName} (${doc.specialty || 'General'})${doc.role === 'clinic_admin' ? ' [Lead]' : ''}</option>`;
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

    if (tab === 'add') {
      if (rosterTab) rosterTab.style.display = 'none';
      if (addTab) addTab.style.display = 'block';
      if (tabRosterBtn) {
        tabRosterBtn.className = 'btn btn-sm btn-outline';
      }
      if (tabAddDoctorBtn) {
        tabAddDoctorBtn.className = 'btn btn-sm btn-primary';
      }
    } else {
      if (rosterTab) rosterTab.style.display = 'block';
      if (addTab) addTab.style.display = 'none';
      if (tabRosterBtn) {
        tabRosterBtn.className = 'btn btn-sm btn-primary';
      }
      if (tabAddDoctorBtn) {
        tabAddDoctorBtn.className = 'btn btn-sm btn-outline';
      }
    }
  };

  function renderDoctorsTable() {
    const tbody = document.getElementById('doctorsTableBody');
    if (!tbody) return;

    if (!state.doctors || state.doctors.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; padding: 28px; color: var(--text-muted);">
            No clinicians registered in this practice yet. Click <strong>➕ Add New Doctor</strong> to onboard staff.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = state.doctors.map(doc => {
      const roleBadge = doc.role === 'clinic_admin'
        ? '<span class="badge badge-admin-role">Clinic Admin</span>'
        : '<span class="badge badge-specialty">Attending</span>';

      const statusBadge = doc.active
        ? '<span class="badge badge-completed">Active</span>'
        : '<span class="badge badge-cancelled">Deactivated</span>';

      const isCurrent = state.assessor?.doctorId && String(state.assessor.doctorId) === String(doc._id);

      return `
        <tr>
          <td style="font-weight: 700; color: var(--text-1);">${doc.fullName}${isCurrent ? ' (You)' : ''}</td>
          <td style="color: var(--text-2); font-size: 0.82rem;">${doc.specialty || 'General Practitioner'}</td>
          <td>${roleBadge}</td>
          <td><span style="font-weight: 700; color: var(--accent);">${doc.activeCaseCount || 0}</span> active cases</td>
          <td style="font-size: 0.8rem; color: var(--text-2);">${doc.email}<br/><span style="color: var(--text-muted);">${doc.phone || 'No phone'}</span></td>
          <td>${statusBadge}</td>
          <td>
            <button type="button" class="btn btn-outline btn-sm" onclick="toggleDoctorStatus('${doc._id}')" style="font-size: 0.72rem; padding: 3px 8px;" ${isCurrent ? 'disabled' : ''}>
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
    const role = document.getElementById('newDocRole').value;

    btn.disabled = true;
    btn.textContent = 'Creating Clinician Account...';

    try {
      const res = await assessorApiFetch(`${API_BASE}/doctors`, {
        method: 'POST',
        body: JSON.stringify({ fullName, email, password, specialty, phone, role }),
      });

      showToast(`Clinician ${res.data.fullName} registered successfully!`);
      document.getElementById('addDoctorForm').reset();
      await fetchDoctorsList();
      switchDoctorModalTab('roster');
    } catch (err) {
      alert('Error creating clinician account: ' + err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '➕ Create Clinician Account';
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
          badgeEl.style.background = '#DCFCE7';
          badgeEl.style.color = '#15803D';
        } else {
          badgeEl.textContent = 'Unassigned';
          badgeEl.style.background = '#FEF3C7';
          badgeEl.style.color = '#92400E';
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
      if (btn) { btn.disabled = false; btn.textContent = '✓ Delegate Case'; }
    }
  };

  window.handleAssessorLogin = async (event) => {
    event.preventDefault();
    const email = document.getElementById('assessorEmailInput').value.trim();
    const password = document.getElementById('assessorPasswordInput').value;
    const btn = document.getElementById('assessorLoginBtn');

    btn.disabled = true;
    btn.textContent = 'Signing in...';

    try {
      const res = await assessorApiFetch(`${API_BASE}/login`, {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      setAssessorToken(res.token);
      showToast(`Welcome, ${res.assessor.name}!`);
      checkAuth();
    } catch (err) {
      alert(err.message || 'Login failed');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Sign In to Clinical Console';
    }
  };

  window.logoutAssessor = () => {
    clearAssessorToken();
    state.assessor = null;
    state.queue = [];
    checkAuth();
    showToast('Signed out of Assessor Portal');
  };

  // --- Queue Data & Processing ---
  window.fetchAssessorQueue = async () => {
    try {
      const res = await assessorApiFetch(`${API_BASE}/queue`);
      state.queue = res.data || [];
      updateCompanyFilter();
      processFilteredQueue();
      updateKPIs();
    } catch (err) {
      console.error('Queue load error', err);
      showToast('Error loading queue: ' + err.message);
    }
  };

  function updateKPIs() {
    let pending = 0;
    let scheduled = 0;
    let completed = 0;
    let totalBilled = 0;
    let settledAmount = 0;
    let pendingDisbursement = 0;

    state.queue.forEach((r) => {
      const st = r.status || 'pending';
      const amount = r.billing?.amount || 0;

      if (st === 'completed') {
        completed++;
        totalBilled += amount;
        if (r.billing?.settlementStatus === 'settled') {
          settledAmount += amount;
        } else {
          pendingDisbursement += amount;
        }
      } else if (st === 'scheduled') {
        scheduled++;
        pending++;
      } else if (st === 'pending') {
        pending++;
      }
    });

    const curr = state.assessor?.billingSettings?.defaultCurrency || 'GHS';

    if (document.getElementById('kpiTotalAssigned')) document.getElementById('kpiTotalAssigned').textContent = state.queue.length;
    if (document.getElementById('kpiPending')) document.getElementById('kpiPending').textContent = pending;
    if (document.getElementById('kpiScheduledCount')) document.getElementById('kpiScheduledCount').textContent = scheduled;
    if (document.getElementById('kpiCompleted')) document.getElementById('kpiCompleted').textContent = completed;
    if (document.getElementById('kpiTotalBilled')) document.getElementById('kpiTotalBilled').textContent = `${curr} ${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (document.getElementById('kpiSettlementBreakdown')) {
      document.getElementById('kpiSettlementBreakdown').textContent = `${curr} ${settledAmount.toFixed(2)} Settled · ${curr} ${pendingDisbursement.toFixed(2)} Pending`;
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

    let optionsHtml = '<option value="all">All Client Companies</option>';
    companies.forEach((name, id) => {
      optionsHtml += `<option value="${id}">${name}</option>`;
    });

    select.innerHTML = optionsHtml;
    if (companies.has(currentVal)) select.value = currentVal;

    if (exportSelect) exportSelect.innerHTML = optionsHtml;
  }

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
    state.filters.status = document.getElementById('statusFilterSelect')?.value || 'all';
    state.filters.settlement = document.getElementById('settlementFilterSelect')?.value || 'all';

    if (state.filters.datePreset === 'custom') {
      const sVal = document.getElementById('customStartDate')?.value;
      const eVal = document.getElementById('customEndDate')?.value;
      state.filters.startDate = sVal ? new Date(sVal) : null;
      state.filters.endDate = eVal ? new Date(eVal) : null;
    }

    state.pagination.page = 1;
    processFilteredQueue();
  };

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
    if (state.filters.status !== 'all') {
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
        valA = a.referenceCode || '';
        valB = b.referenceCode || '';
      } else if (field === 'company') {
        valA = a.tenantId?.company_name || '';
        valB = b.tenantId?.company_name || '';
      } else if (field === 'patientName') {
        valA = a.clinicalDetails?.patientName || '';
        valB = b.clinicalDetails?.patientName || '';
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

    renderQueue();
  }

  function renderQueue() {
    const tableBody = document.getElementById('assessorQueueTableBody');
    if (!tableBody) return;

    const { page, limit, totalCount } = state.pagination;
    const startIdx = (page - 1) * limit;
    const endIdx = startIdx + limit;
    const pageItems = state.filteredQueue.slice(startIdx, endIdx);

    // Update Pagination Display
    const paginationSummary = document.getElementById('paginationSummary');
    const pageIndicator = document.getElementById('pageIndicator');
    const prevBtn = document.getElementById('prevPageBtn');
    const nextBtn = document.getElementById('nextPageBtn');

    if (paginationSummary) {
      paginationSummary.textContent = totalCount > 0
        ? `Showing ${startIdx + 1}–${Math.min(endIdx, totalCount)} of ${totalCount} cases`
        : 'Showing 0 cases';
    }
    if (pageIndicator) {
      pageIndicator.textContent = `Page ${page} of ${state.pagination.totalPages}`;
    }
    if (prevBtn) prevBtn.disabled = page <= 1;
    if (nextBtn) nextBtn.disabled = page >= state.pagination.totalPages;

    tableBody.innerHTML = '';
    if (pageItems.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding:36px; color:var(--text-muted);">No clinical referrals found matching current filters.</td></tr>';
      return;
    }

    const isClinicAdmin = isUserClinicAdmin(state.assessor);

    pageItems.forEach((r) => {
      const tr = document.createElement('tr');

      const companyName = r.tenantId?.company_name || r.tenantId?.companyName || 'Organization';
      const patientName = r.clinicalDetails?.patientName || '—';
      const patientContact = r.clinicalDetails?.patientContact || '—';
      const deptName = r.departmentName || 'General';
      const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—';

      // Status badge
      let statusBadge = '';
      const st = (r.status || 'pending').toLowerCase();
      if (st === 'completed') {
        statusBadge = '<span class="badge badge-completed">✓ Completed</span>';
      } else if (st === 'scheduled') {
        statusBadge = '<span class="badge badge-scheduled">📅 Scheduled</span>';
      } else if (st === 'cancelled') {
        statusBadge = '<span class="badge badge-cancelled">✕ Cancelled</span>';
      } else {
        statusBadge = '<span class="badge badge-pending">⏳ Pending</span>';
      }

      const staleBadge = r.isStale ? '<span class="badge badge-stale" title="Pending >48hrs">⏱️ 48h+</span>' : '';

      // Clinician Column
      let clinicianHtml = '';
      if (r.assignedDoctorId) {
        const docName = r.assignedDoctorId.fullName || 'Attending Clinician';
        const docSpec = r.assignedDoctorId.specialty ? `<div style="font-size:0.7rem; color:var(--text-muted);">${r.assignedDoctorId.specialty}</div>` : '';
        clinicianHtml = `
          <div>
            <span class="badge badge-clinician">🩺 ${docName}</span>
            ${docSpec}
          </div>
        `;
      } else {
        if (isClinicAdmin && r.status !== 'completed') {
          clinicianHtml = `
            <div style="display:flex; align-items:center; gap:4px;">
              <span class="badge badge-unassigned">○ Unassigned</span>
              <button class="btn btn-outline btn-sm" onclick="openCaseDetail('${r._id}')" style="padding:2px 6px; font-size:0.7rem;" title="Triage & Delegate">Assign</button>
            </div>
          `;
        } else {
          clinicianHtml = '<span class="badge badge-unassigned">○ Unassigned</span>';
        }
      }

      // Appointment date badge
      let appointmentStr = '<span style="color:var(--text-muted); font-size:0.78rem;">Not set</span>';
      if (r.scheduledAt) {
        appointmentStr = `<span style="font-weight:600; color:#1E429F; font-size:0.8rem;">📅 ${new Date(r.scheduledAt).toLocaleDateString()}</span>`;
      }

      // Billing Amount
      const currency = r.billing?.currency || state.assessor?.billingSettings?.defaultCurrency || 'GHS';
      const amountStr = r.billing?.isBilled
        ? `<strong>${currency} ${(r.billing.amount || 0).toFixed(2)}</strong>`
        : '<span style="color:var(--text-muted);">Unbilled</span>';

      // Settlement Status Pill
      let settlementPill = '';
      const settlement = r.billing?.settlementStatus || (r.billing?.isBilled ? 'pending_payment' : 'unbilled');
      if (settlement === 'settled') {
        settlementPill = `<span class="settlement-pill settlement-settled" onclick="toggleSettlementStatus('${r._id}', 'settled')" title="Click to toggle settlement">✓ Settled</span>`;
      } else if (settlement === 'pending_payment') {
        settlementPill = `<span class="settlement-pill settlement-pending" onclick="toggleSettlementStatus('${r._id}', 'pending_payment')" title="Click to mark Settled / Paid">⏳ Pending Pay</span>`;
      } else {
        settlementPill = '<span class="settlement-pill settlement-unbilled">○ Unbilled</span>';
      }

      // Action links for contact
      const isEmail = patientContact.includes('@');
      const isPhone = !isEmail && patientContact.length >= 7;
      let contactHtml = `<span style="color:var(--text-1); font-size:0.82rem;">${patientContact}</span>`;
      if (isPhone) {
        contactHtml = `<a href="tel:${patientContact.replace(/\s+/g, '')}" style="color:#0284c7; text-decoration:none; font-weight:600; font-size:0.82rem;">📞 ${patientContact}</a>`;
      } else if (isEmail) {
        const mailtoSubj = encodeURIComponent(`Havilah Clinical Consultation [${r.referenceCode}]`);
        contactHtml = `<a href="mailto:${patientContact}?subject=${mailtoSubj}" style="color:#0284c7; text-decoration:none; font-weight:600; font-size:0.82rem;">✉️ ${patientContact}</a>`;
      }

      const isCompleted = r.status === 'completed';

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:700; color:var(--accent); font-size:0.86rem;">${r.referenceCode}</td>
        <td style="font-weight:700; color:var(--text-1); font-size:0.84rem;">${companyName}</td>
        <td style="font-weight:700; color:var(--text-1);">${patientName}</td>
        <td>${contactHtml}</td>
        <td style="color:var(--text-2);">${deptName}</td>
        <td>${clinicianHtml}</td>
        <td>${appointmentStr}</td>
        <td style="color:var(--text-muted); font-size:0.8rem;">${dateStr}</td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            ${statusBadge}
            ${staleBadge}
          </div>
        </td>
        <td>${amountStr}</td>
        <td>${settlementPill}</td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn btn-ghost btn-sm" onclick="openCaseDetail('${r._id}')">View</button>
            ${!isCompleted ? `<button class="btn btn-primary btn-sm" onclick="openCompleteModal('${r._id}')">Complete</button>` : ''}
          </div>
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

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

      showToast(`Settlement status updated to ${newStatus === 'settled' ? 'Settled / Paid' : 'Pending Payment'}`);
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
    const pName = item.clinicalDetails?.patientName || '—';
    const pContact = item.clinicalDetails?.patientContact || '—';
    const pDept = item.departmentName || 'General';
    const pSchedule = item.preferredTime || 'As soon as available';
    const intakeNotes = item.clinicalDetails?.intakeNotes || 'None provided';
    const assessorNotes = item.clinicalDetails?.assessorNotes || 'None recorded yet';
    const isCompleted = item.status === 'completed';
    const isClinicAdmin = isUserClinicAdmin(state.assessor);

    // Direct phone/email action links
    const isEmail = pContact.includes('@');
    const isPhone = !isEmail && pContact.length >= 7;
    let contactAction = pContact;
    if (isPhone) {
      contactAction = `<a href="tel:${pContact.replace(/\s+/g, '')}" style="color:#0284c7; font-weight:700; text-decoration:none;">📞 Call ${pContact}</a>`;
    } else if (isEmail) {
      const mailtoSubj = encodeURIComponent(`Havilah Clinical Consultation [${item.referenceCode}]`);
      contactAction = `<a href="mailto:${pContact}?subject=${mailtoSubj}" style="color:#0284c7; font-weight:700; text-decoration:none;">✉️ Email ${pContact}</a>`;
    }

    const assignedDocText = item.assignedDoctorId
      ? `Dr. ${item.assignedDoctorId.fullName || item.assignedDoctorId}${item.assignedDoctorId.specialty ? ` (${item.assignedDoctorId.specialty})` : ''}`
      : 'Unassigned';

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; background:#F8FAFC; padding:14px; border-radius:8px; border:1px solid var(--border);">
        <div><span style="color:var(--text-muted); font-size:0.75rem; font-weight:700;">CLIENT COMPANY</span><div style="font-weight:700; color:var(--text-1);">${compName}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem; font-weight:700;">DEPARTMENT</span><div style="font-weight:600; color:var(--text-1);">${pDept}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem; font-weight:700;">PATIENT NAME</span><div style="font-weight:700; color:var(--text-1); font-size:0.95rem;">${pName}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem; font-weight:700;">DIRECT CONTACT</span><div>${contactAction}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem; font-weight:700;">PREFERRED SCHEDULE</span><div style="font-weight:600; color:var(--text-1);">${pSchedule}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem; font-weight:700;">CASE STATUS</span><div style="font-weight:700; text-transform:uppercase; color:var(--accent);">${item.status}</div></div>
      </div>

      <div>
        <span style="color:var(--text-2); font-size:0.78rem; font-weight:700; text-transform:uppercase;">Intake Consultation Reason / Notes</span>
        <div style="background:#F8FAFC; padding:12px; border-radius:8px; margin-top:4px; border:1px solid var(--border); font-size:0.86rem; color:var(--text-1); white-space:pre-wrap;">${intakeNotes}</div>
      </div>

      ${isCompleted ? `
        <div>
          <span style="color:var(--text-2); font-size:0.78rem; font-weight:700; text-transform:uppercase;">Assessor Case Notes &amp; Fee</span>
          <div style="background:#F8FAFC; padding:12px; border-radius:8px; margin-top:4px; border:1px solid var(--border); font-size:0.86rem; color:var(--text-1);">
            <div style="margin-bottom:6px;"><strong>Amount Billed:</strong> ${item.billing?.currency || 'GHS'} ${(item.billing?.amount || 0).toFixed(2)} (${item.billing?.billedAt ? new Date(item.billing.billedAt).toLocaleDateString() : 'Settled'})</div>
            <div><strong>Clinical Notes:</strong> ${assessorNotes}</div>
          </div>
        </div>
      ` : ''}
    `;

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
          if (item.assignedDoctorId) {
            const docName = item.assignedDoctorId.fullName || 'Attending Clinician';
            badgeEl.textContent = `Assigned: ${docName}`;
            badgeEl.style.background = '#DCFCE7';
            badgeEl.style.color = '#15803D';
          } else {
            badgeEl.textContent = 'Unassigned';
            badgeEl.style.background = '#FEF3C7';
            badgeEl.style.color = '#92400E';
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

    openModal('caseDetailModal');
    startAssessorLiveSync();
  };

  // --- Clinical Attachment Functions for Assessor ---
  function renderAssessorAttachments(attachments) {
    const attachList = document.getElementById('modalAttachmentsList');
    if (!attachList) return;

    if (!attachments || attachments.length === 0) {
      attachList.innerHTML = `
        <div style="color: var(--text-muted); font-size: 0.8rem; background: #F8FAFC; border: 1px dashed var(--border); border-radius: 8px; padding: 14px; text-align: center;">
          No medical documents attached yet. Click <strong>+ Attach Certificate</strong> above to issue a medical certificate or clinical report.
        </div>
      `;
      return;
    }

    attachList.innerHTML = attachments.map((att, idx) => {
      const isPdf = (att.fileName || '').toLowerCase().endsWith('.pdf') || (att.fileType || '').includes('pdf');
      const isImg = /\.(png|jpg|jpeg|webp)$/i.test(att.fileName || '') || (att.fileType || '').includes('image');
      const icon = isPdf ? '📕' : isImg ? '🖼️' : '📝';
      
      const sizeStr = att.fileSize 
        ? (att.fileSize > 1024 * 1024 
            ? `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB` 
            : `${Math.round(att.fileSize / 1024)} KB`)
        : '';

      const timeStr = att.uploadedAt 
        ? new Date(att.uploadedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
        : 'Recently';

      return `
        <div style="display: flex; justify-content: space-between; align-items: center; background: #FFFFFF; border: 1px solid var(--border); padding: 10px 14px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.03); gap: 10px;">
          <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
            <div style="font-size: 1.4rem; flex-shrink: 0;">${icon}</div>
            <div style="min-width: 0; flex: 1;">
              <div style="font-weight: 700; color: var(--text-1); font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${att.fileName || 'Clinical_Document'}</div>
              <div style="font-size: 0.72rem; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
                <span>${timeStr}</span>
                ${sizeStr ? `<span>•</span><span>${sizeStr}</span>` : ''}
                <span style="color: #059669; font-weight: 600;">• Verified</span>
              </div>
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">
            <a href="${att.fileData}" download="${att.fileName}" class="btn btn-outline btn-sm" style="padding: 4px 10px; font-size: 0.75rem; text-decoration: none; display: inline-flex; align-items: center; gap: 4px;">
              <span>📥</span>
              <span>Download</span>
            </a>
            <button type="button" class="btn btn-outline btn-sm" onclick="handleDeleteAssessorAttachment(${idx})" style="padding: 4px 8px; font-size: 0.75rem; color: #DC2626; border-color: #FECACA;" title="Remove Document">
              🗑️
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

  // --- Clinical Thread Functions for Assessor ---
  function renderAssessorModalThread(thread) {
    const container = document.getElementById('modalCaseThreadContainer');
    if (!container) return;

    if (!thread || thread.length === 0) {
      container.innerHTML = '<div style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:16px;">No messages in consultation dialogue yet. Type a note below to initiate communication.</div>';
      return;
    }

    container.innerHTML = thread.map(msg => {
      const isAssessor = msg.sender === 'assessor';
      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const safeMsg = (msg.message || '').replace(/</g, '&lt;');

      return `
        <div style="display:flex;flex-direction:column;align-items:${isAssessor ? 'flex-end' : 'flex-start'};gap:2px;margin-bottom:6px;">
          <div style="font-size:0.68rem;font-weight:600;color:var(--text-muted);padding:0 4px;">
            ${isAssessor ? '🩺 You (Practitioner)' : '👤 Patient (Employee)'} • ${timeStr}
          </div>
          <div style="max-width:82%;padding:8px 12px;border-radius:${isAssessor ? '14px 14px 2px 14px' : '14px 14px 14px 2px'};font-size:0.82rem;line-height:1.45;background:${isAssessor ? 'linear-gradient(135deg, #0d9488, #0f766e)' : '#FFFFFF'};color:${isAssessor ? '#FFFFFF' : 'var(--text-1)'};border:1px solid ${isAssessor ? 'transparent' : 'var(--border)'};box-shadow:0 1px 3px rgba(0,0,0,0.05);word-break:break-word;">
            ${safeMsg}
          </div>
        </div>
      `;
    }).join('');

    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 10);
  }

  window.submitAssessorCaseMessage = async () => {
    if (!state.selectedCase) return;
    const id = state.selectedCase._id;
    const inputEl = document.getElementById('modalCaseReplyInput');
    const msg = inputEl?.value.trim();
    const btn = document.getElementById('modalCaseSendReplyBtn');

    if (!msg) {
      alert('Please enter a message before sending.');
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

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
        showToast('Message sent to patient.');
      }
    } catch (err) {
      alert('Error sending message: ' + err.message);
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<span>Send</span> <span>✉️</span>'; }
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
    closeModal('caseDetailModal');
    if (state.selectedCase) {
      openCompleteModal(state.selectedCase._id);
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
          btn.textContent = 'Mark Completed & Bill';
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
      btn.textContent = 'Mark Completed & Bill';
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
  window.openClinicSettingsModal = async () => {
    try {
      const res = await assessorApiFetch(`${API_BASE}/profile`);
      const data = res.data || {};
      const settings = data.billingSettings || {};

      document.getElementById('settingsClinicName').value = data.organization || data.name || '';
      document.getElementById('settingsPhone').value = data.phone || '';
      document.getElementById('settingsNotificationEmail').value = data.notificationEmail || data.email || '';
      document.getElementById('settingsAddress').value = data.address || '';
      document.getElementById('settingsDefaultRate').value = settings.defaultRate || 450;
      document.getElementById('settingsDefaultCurrency').value = settings.defaultCurrency || 'GHS';
      document.getElementById('settingsTaxId').value = settings.taxId || '';
      document.getElementById('settingsTaxRate').value = settings.taxRate || 0;
      document.getElementById('settingsPaymentInstructions').value = settings.paymentInstructions || '';

      openModal('clinicSettingsModal');
    } catch (err) {
      alert('Error loading clinic settings: ' + err.message);
    }
  };

  window.handleSaveClinicSettings = async (event) => {
    event.preventDefault();
    const btn = document.getElementById('saveSettingsBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';

    const organization = document.getElementById('settingsClinicName').value.trim();
    const phone = document.getElementById('settingsPhone').value.trim();
    const notificationEmail = document.getElementById('settingsNotificationEmail').value.trim();
    const address = document.getElementById('settingsAddress').value.trim();
    const defaultRate = Number(document.getElementById('settingsDefaultRate').value) || 0;
    const defaultCurrency = document.getElementById('settingsDefaultCurrency').value;
    const taxId = document.getElementById('settingsTaxId').value.trim();
    const taxRate = Number(document.getElementById('settingsTaxRate').value) || 0;
    const paymentInstructions = document.getElementById('settingsPaymentInstructions').value.trim();

    try {
      const res = await assessorApiFetch(`${API_BASE}/profile`, {
        method: 'PUT',
        body: JSON.stringify({
          organization,
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

      const orgDisplay = document.getElementById('assessorOrgDisplay');
      if (orgDisplay) orgDisplay.textContent = state.assessor.organization || 'Medical Assessor';

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

  // --- Modal Helpers ---
  window.openModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('show');
  };

  window.closeModal = (id) => {
    if (id === 'caseDetailModal') {
      stopAssessorLiveSync();
    }
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
  };

  document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
  });
})();
