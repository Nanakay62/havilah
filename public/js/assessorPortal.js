(() => {
  let state = {
    assessor: null,
    queue: [],
    selectedCase: null,
  };

  const API_BASE = '/api/v1/assessor';

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

      const nameDisplay = document.getElementById('assessorNameDisplay');
      const orgDisplay = document.getElementById('assessorOrgDisplay');
      if (nameDisplay) nameDisplay.textContent = res.assessor.name;
      if (orgDisplay) orgDisplay.textContent = res.assessor.organization || 'Medical Assessor';

      if (loginSection) loginSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'block';
      if (headerControls) headerControls.style.display = 'flex';

      fetchAssessorQueue();
    } catch (err) {
      clearAssessorToken();
      if (loginSection) loginSection.style.display = 'block';
      if (dashboardSection) dashboardSection.style.display = 'none';
      if (headerControls) headerControls.style.display = 'none';
    }
  }

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
      btn.textContent = 'Sign In to Clinical Queue';
    }
  };

  window.logoutAssessor = () => {
    clearAssessorToken();
    state.assessor = null;
    state.queue = [];
    checkAuth();
    showToast('Signed out of Assessor Portal');
  };

  window.fetchAssessorQueue = async () => {
    try {
      const res = await assessorApiFetch(`${API_BASE}/queue`);
      state.queue = res.data || [];
      renderQueue();
      updateCompanyFilter();
      updateKPIs();
    } catch (err) {
      console.error('Queue load error', err);
      showToast('Error loading queue: ' + err.message);
    }
  };

  function updateKPIs() {
    let pending = 0;
    let completed = 0;
    let totalBilled = 0;

    state.queue.forEach((r) => {
      if (r.status === 'completed') {
        completed++;
        totalBilled += r.billing?.amount || 0;
      } else if (r.status === 'pending') {
        pending++;
      }
    });

    const kpiTotal = document.getElementById('kpiTotalAssigned');
    const kpiPending = document.getElementById('kpiPending');
    const kpiCompleted = document.getElementById('kpiCompleted');
    const kpiBilled = document.getElementById('kpiTotalBilled');

    if (kpiTotal) kpiTotal.textContent = state.queue.length;
    if (kpiPending) kpiPending.textContent = pending;
    if (kpiCompleted) kpiCompleted.textContent = completed;
    if (kpiBilled) kpiBilled.textContent = `GHS ${totalBilled.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function updateCompanyFilter() {
    const select = document.getElementById('companyFilterSelect');
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

    select.innerHTML = '<option value="all">All Client Companies</option>';
    companies.forEach((name, id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = name;
      select.appendChild(opt);
    });

    if (companies.has(currentVal)) {
      select.value = currentVal;
    }
  }

  window.applyQueueFilter = () => {
    renderQueue();
  };

  function renderQueue() {
    const tableBody = document.getElementById('assessorQueueTableBody');
    if (!tableBody) return;

    const companyFilter = document.getElementById('companyFilterSelect')?.value || 'all';
    const statusFilter = document.getElementById('statusFilterSelect')?.value || 'all';

    let filtered = state.queue;
    if (companyFilter !== 'all') {
      filtered = filtered.filter((r) => {
        const tId = r.tenantId?._id || r.tenantId;
        return String(tId) === String(companyFilter);
      });
    }
    if (statusFilter !== 'all') {
      filtered = filtered.filter((r) => r.status === statusFilter);
    }

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="9" style="text-align:center; padding:32px; color:var(--text-muted);">No clinical referrals found matching filters.</td></tr>';
      return;
    }

    filtered.forEach((r) => {
      const tr = document.createElement('tr');

      const companyName = r.tenantId?.company_name || r.tenantId?.companyName || 'Organization';
      const patientName = r.clinicalDetails?.patientName || '—';
      const patientContact = r.clinicalDetails?.patientContact || '—';
      const deptName = r.departmentName || 'General';
      const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '—';

      let statusBadge = '';
      const st = (r.status || 'pending').toLowerCase();
      if (st === 'completed') {
        statusBadge = '<span class="badge badge-completed">Completed</span>';
      } else if (st === 'scheduled') {
        statusBadge = '<span class="badge badge-scheduled">Scheduled</span>';
      } else if (st === 'cancelled') {
        statusBadge = '<span class="badge badge-cancelled">Cancelled</span>';
      } else {
        statusBadge = '<span class="badge badge-pending">Pending</span>';
      }

      const staleBadge = r.isStale ? '<span class="badge badge-stale" title="Pending >48hrs">⏱️ 48h+</span>' : '';

      const amountStr = r.billing?.isBilled
        ? `GHS ${(r.billing.amount || 0).toFixed(2)}`
        : '<span style="color:var(--text-muted);">Unbilled</span>';

      const isCompleted = r.status === 'completed';

      tr.innerHTML = `
        <td style="font-family:monospace; font-weight:700; color:#2DD4BF;">${r.referenceCode}</td>
        <td style="font-weight:600;">${companyName}</td>
        <td style="font-weight:700; color:#FFFFFF;">${patientName}</td>
        <td style="color:#38BDF8; font-size:0.82rem;">${patientContact}</td>
        <td>${deptName}</td>
        <td style="color:var(--text-2); font-size:0.8rem;">${dateStr}</td>
        <td>
          <div style="display:flex; gap:4px; align-items:center;">
            ${statusBadge}
            ${staleBadge}
          </div>
        </td>
        <td style="font-weight:600;">${amountStr}</td>
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

    body.innerHTML = `
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; background:var(--bg-elev); padding:14px; border-radius:8px; border:1px solid var(--border);">
        <div><span style="color:var(--text-muted); font-size:0.75rem;">CLIENT ORGANIZATION</span><div style="font-weight:700;">${compName}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem;">DEPARTMENT</span><div style="font-weight:600;">${pDept}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem;">PATIENT NAME</span><div style="font-weight:700; color:#FFFFFF;">${pName}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem;">CONTACT INFO</span><div style="font-weight:700; color:#38BDF8;">${pContact}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem;">PREFERRED SCHEDULE</span><div style="font-weight:600;">${pSchedule}</div></div>
        <div><span style="color:var(--text-muted); font-size:0.75rem;">STATUS</span><div style="font-weight:700; text-transform:uppercase;">${item.status}</div></div>
      </div>

      <div>
        <span style="color:var(--text-2); font-size:0.78rem; font-weight:700; text-transform:uppercase;">Intake Consultation Reason / Notes</span>
        <div style="background:var(--bg-elev); padding:12px; border-radius:8px; margin-top:4px; border:1px solid var(--border); font-size:0.86rem; color:#F1F5F9; white-space:pre-wrap;">${intakeNotes}</div>
      </div>

      ${isCompleted ? `
        <div>
          <span style="color:var(--text-2); font-size:0.78rem; font-weight:700; text-transform:uppercase;">Assessor Case Notes &amp; Billing</span>
          <div style="background:var(--bg-elev); padding:12px; border-radius:8px; margin-top:4px; border:1px solid var(--border); font-size:0.86rem; color:#F1F5F9;">
            <div style="margin-bottom:6px;"><strong>Amount Billed:</strong> GHS ${(item.billing?.amount || 0).toFixed(2)} (${item.billing?.billedAt ? new Date(item.billing.billedAt).toLocaleDateString() : 'Settled'})</div>
            <div><strong>Clinical Notes:</strong> ${assessorNotes}</div>
          </div>
        </div>
      ` : ''}
    `;

    const completeBtn = document.getElementById('modalCompleteCaseBtn');
    if (completeBtn) {
      completeBtn.style.display = isCompleted ? 'none' : 'inline-flex';
    }

    openModal('caseDetailModal');
  };

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
    document.getElementById('completeBillingAmount').value = item.billing?.amount || '';
    document.getElementById('completeAssessorNotes').value = item.clinicalDetails?.assessorNotes || '';

    openModal('completeCaseModal');
  };

  window.handleCompleteCaseSubmit = async (event) => {
    event.preventDefault();
    const id = document.getElementById('completeReferralId').value;
    const rawAmount = document.getElementById('completeBillingAmount').value;
    const notes = document.getElementById('completeAssessorNotes').value;
    const btn = document.getElementById('completeSubmitBtn');

    const amount = Number(rawAmount);
    if (isNaN(amount) || amount < 0) {
      alert('Please enter a valid non-negative billing amount.');
      return;
    }

    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      await assessorApiFetch(`${API_BASE}/referrals/${id}/complete`, {
        method: 'PATCH',
        body: JSON.stringify({
          amount,
          currency: 'GHS',
          assessorNotes: notes,
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

  window.openModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('show');
  };

  window.closeModal = (id) => {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('show');
  };

  document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
  });
})();
