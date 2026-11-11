(() => {
  const state = {
    heatmapData: [],
    invites: [],
    departments: [],
    referralBilling: [],
    activeTab: 'analytics',
    ethicsReports: [],
    ethicsUrgencyFilter: 'all'
  };

  async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('havilah_token') || localStorage.getItem('token') || localStorage.getItem('session_token');
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const error = await res.json().catch(() => ({}));
      throw new Error(error.error || error.message || 'API request failed');
    }
    return res.json();
  }

  function renderInvites() {
    const hrInvitesTableBody = document.getElementById('hrInvitesTableBody');
    if (!hrInvitesTableBody) return;
    hrInvitesTableBody.innerHTML = '';

    if (!state.invites || state.invites.length === 0) {
      hrInvitesTableBody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: var(--text-sm);">No activation codes generated yet.</td></tr>';
      return;
    }

    state.invites.forEach(invite => {
      const tr = document.createElement('tr');
      const isExpired = new Date(invite.expires_at) < new Date();
      let statusBadge = '';
      
      if (invite.status === 'revoked') {
        statusBadge = '<span class="badge badge-danger">Revoked</span>';
      } else if (invite.status === 'used') {
        statusBadge = '<span class="badge badge-neutral">Used</span>';
      } else if (isExpired || invite.status === 'expired') {
        statusBadge = '<span class="badge badge-warning">Expired</span>';
      } else {
        statusBadge = '<span class="badge badge-success">Active</span>';
      }

      const redemptions = invite.usage_count || (invite.status === 'used' ? 1 : 0);
      const isRevokable = invite.status === 'active' || invite.status === 'pending';

      tr.innerHTML = `
        <td data-label="Code">
          <div style="font-family: monospace; font-size: var(--text-sm); font-weight: var(--weight-semibold); color: var(--text); letter-spacing: 0.04em; font-variant-numeric: tabular-nums; white-space: nowrap;">${invite.activation_code}</div>
        </td>
        <td data-label="Department" style="font-weight: var(--weight-medium); color: var(--text);">${invite.department_name}</td>
        <td data-label="Redemptions" style="font-size: var(--text-sm); color: var(--text-muted); font-variant-numeric: tabular-nums;">${redemptions}</td>
        <td data-label="Status">${statusBadge}</td>
        <td data-label="Expires" style="color: var(--text-muted); font-size: var(--text-sm); font-variant-numeric: tabular-nums; white-space: nowrap;">${new Date(invite.expires_at).toLocaleDateString()}</td>
        <td data-label="Actions" style="text-align: right;">
          <div style="display: inline-flex; gap: var(--space-1); align-items: center; justify-content: flex-end;">
            <button class="btn btn-secondary btn-sm" onclick="window.copyHrInviteLink('${invite.activation_code}')" title="Copy registration link" style="padding: 4px 8px; font-size: var(--text-xs);">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span>Copy</span>
            </button>
            ${isRevokable ? `
            <button class="btn btn-ghost btn-sm" onclick="window.revokeHrInvite('${invite.activation_code}')" style="color: var(--danger); padding: 4px 6px;" title="Revoke code" aria-label="Revoke code">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
            </button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="window.deleteHrInvite('${invite.activation_code}')" style="color: var(--danger); padding: 4px 6px;" title="Delete invitation" aria-label="Delete invitation">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
            </button>
          </div>
        </td>
      `;
      hrInvitesTableBody.appendChild(tr);
    });
  }

  function renderDepartmentSelect() {
    const select = document.getElementById('hrDeptSelect');
    const deptFilter = document.getElementById('deptFilter');

    if (select) {
      select.innerHTML = '';
      if (state.departments.length === 0) {
        select.innerHTML = '<option value="">No departments provisioned yet</option>';
      } else {
        state.departments.forEach(dept => {
          const count = dept.member_count !== undefined ? dept.member_count : (dept.count || 0);
          const label = count > 0 
            ? `${dept.name} (${count} active member${count === 1 ? '' : 's'})` 
            : `${dept.name} (Ready for onboarding)`;
          const opt = document.createElement('option');
          opt.value = dept.name;
          opt.innerText = label;
          select.appendChild(opt);
        });
      }
    }

    if (deptFilter) {
      const currentSelection = deptFilter.value;
      deptFilter.innerHTML = '<option value="all">All departments</option>';
      state.departments.forEach(dept => {
        const opt = document.createElement('option');
        opt.value = dept.name;
        opt.innerText = dept.name;
        deptFilter.appendChild(opt);
      });
      if (Array.from(deptFilter.options).some(o => o.value === currentSelection)) {
        deptFilter.value = currentSelection;
      }
    }
  }

  function renderClinicalBilling() {
    const tableBody = document.getElementById('hrBillingTableBody');
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const referrals = state.referralBilling || [];

    // Update Summary KPI elements
    const totalCountEl = document.getElementById('billingTotalCount');
    const totalAmountEl = document.getElementById('billingTotalAmount');
    const billedCountEl = document.getElementById('billingBilledCount');
    const staleCountEl = document.getElementById('billingStaleCount');

    let totalAmount = 0;
    let billedCount = 0;
    let staleCount = 0;

    referrals.forEach(r => {
      const amount = (r.billing && typeof r.billing.amount === 'number') ? r.billing.amount : 0;
      if (r.billing && r.billing.isBilled) {
        totalAmount += amount;
        billedCount++;
      }
      if (r.isStale) {
        staleCount++;
      }
    });

    if (totalCountEl) totalCountEl.innerText = referrals.length;
    if (totalAmountEl) {
      totalAmountEl.innerText = totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (billedCountEl) billedCountEl.innerText = `${billedCount} of ${referrals.length}`;
    if (staleCountEl) staleCountEl.innerText = staleCount;

    if (referrals.length === 0) {
      tableBody.innerHTML = '<tr class="empty-row"><td colspan="7" style="padding: 32px; text-align: center; color: var(--text-subtle); font-size: var(--text-base);">No clinical referral records found for your organization.</td></tr>';
      return;
    }

    referrals.forEach(r => {
      const tr = document.createElement('tr');

      const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      }) : '—';

      const st = (r.status || 'pending').toLowerCase();

      // Age calculation (hours/days since created; if >48h and pending, show e.g. "2d" plus overdue badge)
      let ageHtml = '—';
      if (r.createdAt) {
        const createdMs = new Date(r.createdAt).getTime();
        const diffMs = Math.max(0, Date.now() - createdMs);
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);

        let ageLabel = '';
        if (diffHours < 1) {
          ageLabel = '<1h';
        } else if (diffHours < 24) {
          ageLabel = `${diffHours}h`;
        } else {
          ageLabel = `${diffDays}d`;
        }

        const isOverdue = r.isStale || (st === 'pending' && diffHours >= 48);
        if (isOverdue) {
          ageHtml = `<div style="display: inline-flex; align-items: center; gap: 6px;"><span class="tabular-nums">${ageLabel}</span><span class="badge badge-danger">Overdue</span></div>`;
        } else {
          ageHtml = `<span class="tabular-nums">${ageLabel}</span>`;
        }
      }

      // Single Status Badge
      let statusBadge = '';
      if (st === 'completed') {
        statusBadge = '<span class="badge badge-success">Completed</span>';
      } else if (st === 'scheduled') {
        statusBadge = '<span class="badge badge-info">Scheduled</span>';
      } else if (st === 'cancelled') {
        statusBadge = '<span class="badge badge-danger">Cancelled</span>';
      } else {
        statusBadge = '<span class="badge badge-warning">Pending</span>';
      }

      // Amount: Tabular numbers in cell, no GHS prefix (currency is in column header)
      const amountVal = (r.billing && typeof r.billing.amount === 'number')
        ? r.billing.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '0.00';

      // Billed: Yes/No badge
      const isBilledVal = r.billing?.isBilled
        ? '<span class="badge badge-success">Yes</span>'
        : '<span class="badge badge-neutral">No</span>';

      tr.innerHTML = `
        <td data-label="Reference code" style="font-family: monospace; font-weight: 600; font-size: var(--text-sm); letter-spacing: 0.02em;">
          ${r.referenceCode || '—'}
        </td>
        <td data-label="Department" style="font-weight: 500;">
          ${r.departmentName || 'General'}
        </td>
        <td data-label="Date" style="color: var(--text-muted);">
          ${dateStr}
        </td>
        <td data-label="Age">
          ${ageHtml}
        </td>
        <td data-label="Status">
          ${statusBadge}
        </td>
        <td data-label="Amount (GHS)" class="tabular-nums num" style="text-align: right; font-weight: 600;">
          ${amountVal}
        </td>
        <td data-label="Billed">
          ${isBilledVal}
        </td>
      `;
      tableBody.appendChild(tr);
    });
  }

  async function fetchInvites() {
    try {
      const res = await apiFetch('/api/v1/hr/invites');
      state.invites = res.invites || [];
      renderInvites();
    } catch (e) {
      console.error('Invites load error', e);
    }
  }

  async function fetchDepartments() {
    try {
      const res = await apiFetch('/api/v1/hr/departments');
      state.departments = res.departments || [];
      renderDepartmentSelect();
    } catch (e) {
      console.error('Departments load error', e);
    }
  }

  async function fetchClinicalBilling() {
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const isSample = urlParams.get('sample') === '1' || window.location.hash === '#sample';
      if (isSample) {
        state.referralBilling = [
          {
            referenceCode: 'REF-8842',
            departmentName: 'Engineering',
            createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'pending',
            isStale: true,
            billing: { amount: 450.00, currency: 'GHS', isBilled: false }
          },
          {
            referenceCode: 'REF-8821',
            departmentName: 'Marketing',
            createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'completed',
            isStale: false,
            billing: { amount: 620.00, currency: 'GHS', isBilled: true }
          },
          {
            referenceCode: 'REF-8815',
            departmentName: 'Operations',
            createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString(),
            status: 'scheduled',
            isStale: false,
            billing: { amount: 380.00, currency: 'GHS', isBilled: false }
          },
          {
            referenceCode: 'REF-8790',
            departmentName: 'Human Resources',
            createdAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString(),
            status: 'completed',
            isStale: false,
            billing: { amount: 550.00, currency: 'GHS', isBilled: true }
          }
        ];
        renderClinicalBilling();
        return;
      }
      const res = await apiFetch('/api/v1/referrals/employer-billing');
      state.referralBilling = res.data || [];
      renderClinicalBilling();
    } catch (e) {
      console.error('Clinical billing load error', e);
      renderClinicalBilling();
    }
  }

  // ── Anonymous Ethics & Hazard Reports ──
  async function fetchEthicsReports() {
    try {
      const data = await apiFetch('/api/v1/hr/reports');
      if (data && data.success) {
        state.ethicsReports = data.reports || [];
        renderEthicsReports();
      }
    } catch (e) {
      console.error('Ethics reports load error', e);
    }
  }

  function renderEthicsReports() {
    const tableBody = document.getElementById('hrEthicsTableBody');
    const rawReports = state.ethicsReports || [];

    // Update KPIs
    const totalEl = document.getElementById('ethicsTotalCount');
    const investigatingEl = document.getElementById('ethicsInvestigatingCount');
    const actionEl = document.getElementById('ethicsActionCount');
    const closedEl = document.getElementById('ethicsClosedCount');

    if (totalEl) totalEl.textContent = rawReports.length;
    if (investigatingEl) investigatingEl.textContent = rawReports.filter(r => r.status === 'under_investigation').length;
    if (actionEl) actionEl.textContent = rawReports.filter(r => r.status === 'action_taken').length;
    if (closedEl) closedEl.textContent = rawReports.filter(r => r.status === 'closed').length;

    if (!tableBody) return;

    if (rawReports.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: var(--text-sm);">No whistleblower or ethics reports submitted for your organization.</td></tr>';
      return;
    }

    // Default sort: Critical -> Urgent -> Standard, then descending by date
    const urgencyRank = { Critical: 3, Urgent: 2, Standard: 1 };
    let reports = [...rawReports].sort((a, b) => {
      const diff = (urgencyRank[b.urgency] || 0) - (urgencyRank[a.urgency] || 0);
      if (diff !== 0) return diff;
      return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
    });

    // Apply urgency filter if active
    if (state.ethicsUrgencyFilter && state.ethicsUrgencyFilter !== 'all') {
      reports = reports.filter(r => (r.urgency || 'Standard').toLowerCase() === state.ethicsUrgencyFilter.toLowerCase());
    }

    if (reports.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="6" style="padding: 24px; text-align: center; color: var(--text-muted); font-size: var(--text-sm);">No reports matching selected urgency filter.</td></tr>';
      return;
    }

    tableBody.innerHTML = reports.map(r => {
      const urgencyBadgeClass = r.urgency === 'Critical' ? 'badge-danger' : r.urgency === 'Urgent' ? 'badge-warning' : 'badge-neutral';
      const statusBadges = {
        submitted: { label: 'Submitted', badgeClass: 'badge-info' },
        under_investigation: { label: 'Investigating', badgeClass: 'badge-warning' },
        action_taken: { label: 'Action Taken', badgeClass: 'badge-info' },
        closed: { label: 'Closed', badgeClass: 'badge-success' },
      };
      const st = statusBadges[r.status] || { label: r.status, badgeClass: 'badge-neutral' };
      const dateStr = r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

      return `
        <tr>
          <td data-label="Tracking code">
            <span style="font-family: monospace; font-weight: var(--weight-semibold); color: var(--brand); font-variant-numeric: tabular-nums;">${r.trackingCode || '—'}</span>
          </td>
          <td data-label="Category" style="font-weight: var(--weight-medium); color: var(--text);">${r.category || 'General'}</td>
          <td data-label="Urgency">
            <span class="badge ${urgencyBadgeClass}">${r.urgency || 'Standard'}</span>
          </td>
          <td data-label="Submitted date" style="color: var(--text-muted); font-variant-numeric: tabular-nums;">${dateStr}</td>
          <td data-label="Status">
            <span class="badge ${st.badgeClass}">${st.label}</span>
          </td>
          <td data-label="Actions" style="text-align: right;">
            <button onclick="window.openHrReportModal('${r._id}')" class="btn btn-secondary btn-sm">
              View &amp; respond
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  async function checkTrialStatus() {
    try {
      const banner = document.getElementById('hrTrialBanner');
      const bannerText = document.getElementById('hrTrialBannerText');
      if (!banner || !bannerText) return;

      const data = await apiFetch('/api/v1/tenant/config');
      if (data && data.success && data.data) {
        const tenant = data.data;
        const sub = tenant.subscription || {};
        const effectiveTier = tenant.effectiveTier || sub.tier || 'pro';
        const status = sub.status || 'active';

        if (status === 'trialing') {
          const trialEnd = sub.trialEndsAt ? new Date(sub.trialEndsAt) : null;
          const now = new Date();
          if (trialEnd && now < trialEnd) {
            const msLeft = trialEnd.getTime() - now.getTime();
            const daysLeft = Math.max(1, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));
            bannerText.innerHTML = `<strong>Pro Reverse Trial:</strong> ${daysLeft} day${daysLeft === 1 ? '' : 's'} remaining. Full access to Pro analytics, conflict guards &amp; clinical linkages.`;
            banner.style.display = 'block';
            banner.style.background = 'var(--brand)';
          } else {
            bannerText.innerHTML = `<strong>Pro Trial Expired:</strong> Your 30-day Pro trial has ended and your account is currently on the <strong>Free Community tier</strong>. Upgrade to restore full Pro capabilities.`;
            banner.style.display = 'block';
            banner.style.background = 'var(--warning)';
          }
        } else if (effectiveTier === 'free') {
          bannerText.innerHTML = `You are currently on the <strong>Free Community tier</strong> (Max 10 employees). Upgrade to unlock unlimited seats &amp; clinical routing.`;
          banner.style.display = 'block';
          banner.style.background = 'var(--text-muted)';
        } else {
          banner.style.display = 'none';
        }
      }
    } catch (err) {
      console.warn('[hrDashboard] Could not resolve trial status:', err.message);
    }
  }

  async function init() {
    await Promise.all([
      fetchInvites(),
      fetchDepartments(),
      fetchClinicalBilling(),
      fetchEthicsReports(),
      checkTrialStatus()
    ]);
  }

  // Global tab switcher for HR Dashboard
  window.switchHrViewTab = (tabName) => {
    state.activeTab = tabName;
    const analyticsTabBtn = document.getElementById('hr-tab-analytics');
    const billingTabBtn = document.getElementById('hr-tab-billing');
    const ethicsTabBtn = document.getElementById('hr-tab-ethics');
    const invitesTabBtn = document.getElementById('hr-tab-invites');
    const analyticsSection = document.getElementById('hr-section-analytics');
    const billingSection = document.getElementById('hr-section-billing');
    const ethicsSection = document.getElementById('hr-section-ethics');
    const invitesSection = document.getElementById('hr-section-invites');

    // Close mobile drawer if open
    const sidebar = document.getElementById('appSidebar');
    const backdrop = document.getElementById('sidebarBackdrop');
    const toggleBtn = document.getElementById('sidebarToggleBtn');
    if (sidebar && sidebar.classList.contains('is-open')) {
      sidebar.classList.remove('is-open');
      if (backdrop) backdrop.classList.remove('is-open');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    // Reset all tabs
    [analyticsTabBtn, billingTabBtn, ethicsTabBtn, invitesTabBtn].forEach(btn => btn && btn.classList.remove('active'));
    [analyticsSection, billingSection, ethicsSection, invitesSection].forEach(sec => sec && (sec.style.display = 'none'));

    if (tabName === 'billing') {
      if (billingTabBtn) billingTabBtn.classList.add('active');
      if (billingSection) billingSection.style.display = 'block';
      fetchClinicalBilling();
    } else if (tabName === 'ethics') {
      if (ethicsTabBtn) ethicsTabBtn.classList.add('active');
      if (ethicsSection) ethicsSection.style.display = 'block';
      fetchEthicsReports();
    } else if (tabName === 'invites') {
      if (invitesTabBtn) invitesTabBtn.classList.add('active');
      if (invitesSection) invitesSection.style.display = 'block';
      fetchInvites();
      fetchDepartments();
    } else {
      if (analyticsTabBtn) analyticsTabBtn.classList.add('active');
      if (analyticsSection) analyticsSection.style.display = 'block';
    }
  };

  window.filterEthicsByUrgency = (urgency) => {
    state.ethicsUrgencyFilter = urgency;
    renderEthicsReports();
  };

  // Global actions attached to window
  window.refreshHrInvites = () => {
    fetchInvites();
    fetchDepartments();
  };

  window.refreshClinicalBilling = () => {
    fetchClinicalBilling();
  };

  window.refreshEthicsReports = () => {
    fetchEthicsReports();
  };

  // ── HR Real-Time Live Sync Polling ──
  let hrReportPollInterval = null;

  function startHrReportLiveSync() {
    stopHrReportLiveSync();
    hrReportPollInterval = setInterval(async () => {
      if (!state.activeReport) {
        stopHrReportLiveSync();
        return;
      }
      const modal = document.getElementById('hrReportModalBackdrop');
      // Check both inline and computed styles to safely detect visibility
      const isHidden = !modal || modal.style.display === 'none' || getComputedStyle(modal).display === 'none';
      if (isHidden) {
        stopHrReportLiveSync();
        return;
      }

      try {
        const data = await apiFetch('/api/v1/hr/reports');
        if (data && data.success && Array.isArray(data.reports)) {
          state.ethicsReports = data.reports;
          const updated = data.reports.find(r => r._id === state.activeReport._id);
          if (updated) {
            const prevLen = (state.activeReport.thread || []).length;
            const newLen = (updated.thread || []).length;
            const prevStatus = state.activeReport.status;
            const newStatus = updated.status;

            if (newLen !== prevLen || newStatus !== prevStatus) {
              state.activeReport = updated;
              const statusSelect = document.getElementById('hrModalStatusSelect');
              if (statusSelect && newStatus !== prevStatus) statusSelect.value = newStatus;
              renderHrModalThread(updated.thread || []);
              // Only refresh the sidebar list when something actually changed
              renderEthicsReports();
            }
          }
        }
      } catch (e) {
        console.warn('[HR Live Sync] poll error:', e);
      }
    }, 2500);
  }

  function stopHrReportLiveSync() {
    if (hrReportPollInterval) {
      clearInterval(hrReportPollInterval);
      hrReportPollInterval = null;
    }
  }

  window.openHrReportModal = (reportId) => {
    const report = (state.ethicsReports || []).find(r => r._id === reportId);
    if (!report) return;

    state.activeReport = report;

    const modal = document.getElementById('hrReportModalBackdrop');
    const titleEl = document.getElementById('hrModalTitle');
    const codeChip = document.getElementById('hrModalCodeChip');
    const catEl = document.getElementById('hrModalCategory');
    const urgEl = document.getElementById('hrModalUrgency');
    const descEl = document.getElementById('hrModalDescription');
    const statusSelect = document.getElementById('hrModalStatusSelect');

    if (titleEl) titleEl.textContent = `Case #${report.trackingCode}`;
    if (codeChip) codeChip.textContent = report.trackingCode;
    if (catEl) catEl.textContent = report.category || 'General';
    if (urgEl) {
      urgEl.textContent = report.urgency || 'Standard';
      urgEl.className = `badge ${report.urgency === 'Critical' ? 'badge-danger' : report.urgency === 'Urgent' ? 'badge-warning' : 'badge-neutral'}`;
      urgEl.style.color = '';
    }
    if (descEl) descEl.textContent = report.description || '—';
    if (statusSelect) statusSelect.value = report.status || 'submitted';

    renderHrModalThread(report.thread || []);

    if (modal) modal.style.display = 'flex';
    startHrReportLiveSync();
  };

  function renderHrModalThread(thread) {
    const container = document.getElementById('hrModalThreadContainer');
    if (!container) return;

    if (!thread || thread.length === 0) {
      container.innerHTML = '<div style="color: var(--text-subtle); font-size: var(--text-xs); text-align: center; padding: var(--space-3);">No messages in thread yet.</div>';
      return;
    }

    container.innerHTML = thread.map(msg => {
      const isInvestigator = msg.sender === 'investigator';
      const timeStr = msg.timestamp ? new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
      const investigatorSender = `<span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg> Investigator (You)</span>`;
      const whistleblowerSender = `<span style="display: inline-flex; align-items: center; gap: 4px;"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg> Anonymous Whistleblower</span>`;

      return `
        <div style="display: flex; flex-direction: column; align-items: ${isInvestigator ? 'flex-end' : 'flex-start'}; margin-bottom: var(--space-3);">
          <div style="font-size: var(--text-xs); color: var(--text-subtle); margin-bottom: 2px;">
            ${isInvestigator ? investigatorSender : whistleblowerSender} • ${timeStr}
          </div>
          <div style="max-width: 85%; padding: var(--space-2) var(--space-3); border-radius: var(--radius-control); font-size: var(--text-sm); line-height: 1.4; background: ${isInvestigator ? 'var(--brand)' : 'var(--bg)'}; color: ${isInvestigator ? '#ffffff' : 'var(--text)'}; border: ${isInvestigator ? 'none' : '1px solid var(--border)'}; word-break: break-word;">
            ${(msg.message || '').replace(/</g, '&lt;')}
          </div>
        </div>
      `;
    }).join('');
    container.scrollTop = container.scrollHeight;
  }

  window.closeHrReportModal = () => {
    stopHrReportLiveSync();
    const modal = document.getElementById('hrReportModalBackdrop');
    if (modal) modal.style.display = 'none';
    state.activeReport = null;
  };

  window.saveHrReportStatus = async () => {
    if (!state.activeReport) return;
    const statusSelect = document.getElementById('hrModalStatusSelect');
    const newStatus = statusSelect?.value;
    const btn = document.getElementById('hrSaveStatusBtn');

    if (btn) { btn.disabled = true; btn.textContent = 'Saving...'; }

    try {
      const data = await apiFetch(`/api/v1/hr/reports/${state.activeReport._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus })
      });
      if (data && data.success) {
        state.activeReport.status = newStatus;
        await fetchEthicsReports();
        if (window.App && typeof App.toast === 'function') {
          App.toast('Status Updated', `Case status changed to ${newStatus}.`, 'success');
        }
      } else {
        if (window.App && typeof App.toast === 'function') {
          App.toast('Error', (data && data.message) || 'Failed to update status.', 'error');
        }
      }
    } catch (err) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', 'Could not reach the server.', 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Status'; }
    }
  };

  window.sendHrReportReply = async () => {
    if (!state.activeReport) {
      console.warn('sendHrReportReply called without activeReport');
      return;
    }
    const input = document.getElementById('hrModalReplyInput');
    const message = input?.value.trim();
    const btn = document.getElementById('hrSendReplyBtn');

    if (!message) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Warning', 'Please type a message before sending.', 'warning');
      }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }

    try {
      const data = await apiFetch(`/api/v1/hr/reports/${state.activeReport._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ message })
      });
      if (data && data.success && data.report) {
        if (input) input.value = '';
        state.activeReport.thread = data.report.thread || [];
        renderHrModalThread(state.activeReport.thread);
        // Refresh background table list asynchronously
        fetchEthicsReports();
        if (window.App && typeof App.toast === 'function') {
          App.toast('Message Sent', 'Your message has been sent to the anonymous whistleblower.', 'success');
        }
      } else {
        const errMsg = (data && (data.message || data.error)) || 'Failed to send message.';
        if (window.App && typeof App.toast === 'function') {
          App.toast('Error', errMsg, 'error');
        }
      }
    } catch (err) {
      const errMsg = err.message || 'Could not reach the server.';
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', errMsg, 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Send'; }
      if (input) input.focus();
    }
  };

  window.openNewDeptModal = () => {
    const backdrop = document.getElementById('newDeptModalBackdrop');
    if (backdrop) backdrop.classList.add('show');
    const input = document.getElementById('newDeptNameInput');
    if (input) {
      input.value = '';
      setTimeout(() => input.focus(), 100);
    }
  };

  window.closeNewDeptModal = () => {
    const backdrop = document.getElementById('newDeptModalBackdrop');
    if (backdrop) backdrop.classList.remove('show');
  };

  window.submitNewDept = () => {
    const input = document.getElementById('newDeptNameInput');
    if (!input || !input.value.trim()) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Input Required', 'Please enter a department name.', 'warning');
      }
      return;
    }
    const name = input.value.trim();
    
    // Check if already in list
    let existing = state.departments.find(d => d.name.toLowerCase() === name.toLowerCase());
    if (!existing) {
      existing = { name: name, member_count: 0 };
      state.departments.push(existing);
    }
    
    renderDepartmentSelect();
    
    const select = document.getElementById('hrDeptSelect');
    if (select) select.value = existing.name;
    
    window.closeNewDeptModal();
    if (window.App && typeof App.toast === 'function') {
      App.toast('Department Ready', `"${existing.name}" provisioned for key generation.`, 'info');
    }
  };

  window.generateHrInvite = async () => {
    const select = document.getElementById('hrDeptSelect');
    const emailsInput = document.getElementById('hrEmailsInput');
    const deptName = select ? select.value : '';

    if (!deptName || deptName.trim() === '') {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Department Required', 'Please select or provision a department.', 'warning');
      }
      return;
    }

    const emails = emailsInput ? emailsInput.value.trim() : '';
    const btn = document.getElementById('hrGenerateBtn');
    const originalText = btn.innerHTML;
    btn.innerText = 'Generating & Sending...';
    btn.disabled = true;

    try {
      const res = await apiFetch('/api/v1/hr/generate-invite', {
        method: 'POST',
        body: JSON.stringify({ 
          department_name: deptName,
          emails: emails
        })
      });
      
      // Display Result Card
      document.getElementById('hrResultDept').innerText = res.department;
      document.getElementById('hrResultCode').innerText = res.code;
      document.getElementById('hrInviteResult').style.display = 'block';
      
      window._activeHrInviteCode = res.code;
      window._activeHrMagicLink = res.magic_link;
      
      await Promise.all([fetchInvites(), fetchDepartments()]);
      
      if (window.App && typeof App.toast === 'function') {
        const msg = res.emails_invited && res.emails_invited.length > 0 
          ? `Code ${res.code} created and sent to ${res.emails_invited.length} employee(s).`
          : `Code ${res.code} created for ${res.department}.`;
        App.toast('Invitation created', msg, 'success');
      }
    } catch (err) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', err.message || 'Failed to generate code.', 'error');
      }
    } finally {
      btn.innerHTML = originalText;
      btn.disabled = false;
      if (emailsInput) emailsInput.value = '';
    }
  };

  window.copyHrInviteLink = (codeToCopy) => {
    const code = codeToCopy || window._activeHrInviteCode;
    if (!code) return;
    
    let url;
    if (!codeToCopy && window._activeHrMagicLink) {
      url = window._activeHrMagicLink;
    } else {
      const host = window.location.host;
      const protocol = window.location.protocol;
      url = `${protocol}//${host}/register.html?invite=${code}`;
    }

    navigator.clipboard.writeText(url).then(() => {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Link copied', 'Registration link copied to clipboard.', 'info');
      }
    }).catch(err => {
      console.error('Failed to copy link:', err);
    });
  };

  window.revokeHrInvite = async (code) => {
    if (!code) return;
    
    let confirmed = true;
    if (typeof showCustomConfirm === 'function') {
      confirmed = await showCustomConfirm({
        title: 'Revoke Code?',
        message: `Are you sure you want to revoke code ${code}? Employees will no longer be able to use it to register.`,
        confirmText: 'Revoke Code',
        danger: true
      });
    }

    if (!confirmed) return;

    try {
      await apiFetch(`/api/v1/hr/invites/${code}/revoke`, {
        method: 'PATCH'
      });
      await fetchInvites();
      if (window.App && typeof App.toast === 'function') {
        App.toast('Code Revoked', `Activation code ${code} has been revoked.`, 'warning');
      }
    } catch (err) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', err.message || 'Failed to revoke code.', 'error');
      }
    }
  };

  window.deleteHrInvite = async (code) => {
    if (!code) return;
    
    let confirmed = true;
    if (typeof showCustomConfirm === 'function') {
      confirmed = await showCustomConfirm({
        title: 'Delete Code & Magic Link?',
        message: `Are you sure you want to permanently delete activation code ${code}? This action cannot be undone.`,
        confirmText: 'Delete Permanently',
        danger: true
      });
    } else if (typeof confirm === 'function') {
      confirmed = confirm(`Are you sure you want to permanently delete activation code ${code}?`);
    }

    if (!confirmed) return;

    try {
      await apiFetch(`/api/v1/hr/invites/${code}`, {
        method: 'DELETE'
      });
      await fetchInvites();
      if (window.App && typeof App.toast === 'function') {
        App.toast('Code Deleted', `Activation code ${code} and 1-click magic link deleted permanently.`, 'success');
      }
    } catch (err) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', err.message || 'Failed to delete code.', 'error');
      }
    }
  };

  function escapeHrHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  let currentHrLookedUpUser = null;

  window.lookupHrUserAccount = async () => {
    const emailInput = document.getElementById('hrUserLookupEmail');
    const resultEl = document.getElementById('hrUserLookupResult');
    const btn = document.getElementById('hrUserLookupBtn');

    if (!emailInput || !resultEl) return;
    const email = emailInput.value.trim();

    if (!email || !email.includes('@')) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Invalid Email', 'Please enter a valid email address.', 'warning');
      }
      return;
    }

    if (btn) { btn.disabled = true; btn.textContent = 'Looking up...'; }

    try {
      const token = localStorage.getItem('havilah_token') || localStorage.getItem('token') || localStorage.getItem('session_token');
      const res = await fetch('/api/v1/hr/users/lookup', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ email })
      });

      resultEl.style.display = 'block';

      if (res.status === 429) {
        currentHrLookedUpUser = null;
        resultEl.innerHTML = `<div style="color: #b45309; font-weight: 600; font-size: 0.875rem;">Too many attempts. Try again in 15 minutes.</div>`;
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        currentHrLookedUpUser = null;
        resultEl.innerHTML = `<div style="color: #dc2626; font-weight: 600; font-size: 0.875rem;">${escapeHrHtml(data.message || data.error || 'Lookup failed.')}</div>`;
        return;
      }

      if (!data.found) {
        currentHrLookedUpUser = null;
        resultEl.innerHTML = `<div style="color: var(--text-2); font-weight: 600; font-size: 0.875rem;">${escapeHrHtml(data.message || 'No account with this email in your organization.')}</div>`;
        return;
      }

      const u = data.user || {};
      currentHrLookedUpUser = { email, ...u, removable: data.removable };
      const createdStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : '—';

      let actionSection = '';
      if (data.removable) {
        actionSection = `
          <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 10px;">
            <div>
              <label class="form-label" style="margin-bottom: 4px; font-size: 0.8rem;">Reason for removal (required, 5–300 characters)</label>
              <input type="text" id="hrUserRemoveReason" class="form-input" placeholder="e.g. Used wrong department activation code" style="max-width: 480px;" />
            </div>
            <div>
              <button type="button" class="btn btn-primary" id="hrUserRemoveBtn" style="background: #dc2626; border-color: #dc2626;" onclick="window.removeHrUserAccount()">Remove &amp; allow re-registration</button>
            </div>
          </div>
        `;
      } else {
        actionSection = `
          <div style="margin-top: 12px; padding: 10px 12px; background: #fef3c7; border: 1px solid #fde68a; color: #92400e; border-radius: 8px; font-size: 0.85rem; font-weight: 600;">
            ${escapeHrHtml(data.message || 'This account cannot be removed. Please contact Havilah support.')}
          </div>
        `;
      }

      resultEl.innerHTML = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; font-size: 0.85rem;">
          <div><span style="color: var(--text-3); display: block; font-size: 0.72rem; text-transform: uppercase; font-weight: 600;">Name</span><strong style="color: var(--text-1);">${escapeHrHtml(u.full_name)}</strong></div>
          <div><span style="color: var(--text-3); display: block; font-size: 0.72rem; text-transform: uppercase; font-weight: 600;">Department</span><strong style="color: var(--text-1);">${escapeHrHtml(u.department)}</strong></div>
          <div><span style="color: var(--text-3); display: block; font-size: 0.72rem; text-transform: uppercase; font-weight: 600;">Registration Date</span><strong style="color: var(--text-1);">${escapeHrHtml(createdStr)}</strong></div>
        </div>
        ${actionSection}
      `;
    } catch (err) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', err.message || 'Could not reach server.', 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Look up'; }
    }
  };

  window.removeHrUserAccount = async () => {
    if (!currentHrLookedUpUser || !currentHrLookedUpUser.removable) return;
    const reasonInput = document.getElementById('hrUserRemoveReason');
    const reason = reasonInput ? reasonInput.value.trim() : '';

    if (reason.length < 5 || reason.length > 300) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Reason Required', 'Please enter a reason between 5 and 300 characters.', 'warning');
      }
      return;
    }

    let confirmed = true;
    if (typeof showCustomConfirm === 'function') {
      confirmed = await showCustomConfirm({
        title: 'Remove Account & Allow Re-Registration?',
        message: `Remove ${currentHrLookedUpUser.full_name} (${currentHrLookedUpUser.email}) so they can register again with a valid code?`,
        confirmText: 'Remove Account',
        danger: true
      });
    } else if (typeof confirm === 'function') {
      confirmed = confirm(`Remove ${currentHrLookedUpUser.full_name} (${currentHrLookedUpUser.email}) so they can register again?`);
    }
    if (!confirmed) return;

    const btn = document.getElementById('hrUserRemoveBtn');
    if (btn) { btn.disabled = true; btn.textContent = 'Removing...'; }

    try {
      const token = localStorage.getItem('havilah_token') || localStorage.getItem('token') || localStorage.getItem('session_token');
      const res = await fetch('/api/v1/hr/users/remove', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          email: currentHrLookedUpUser.email,
          reason
        })
      });

      if (res.status === 429) {
        if (window.App && typeof App.toast === 'function') {
          App.toast('Rate Limit Reached', 'Too many attempts. Try again in 15 minutes.', 'warning');
        }
        return;
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (window.App && typeof App.toast === 'function') {
          App.toast('Removal Blocked', data.message || data.error || 'Could not remove account.', 'error');
        }
        return;
      }

      if (window.App && typeof App.toast === 'function') {
        App.toast('Account Removed', data.message || 'Account removed. Seat freed. The employee can now register again.', 'success');
      }

      currentHrLookedUpUser = null;
      const emailInput = document.getElementById('hrUserLookupEmail');
      const resultEl = document.getElementById('hrUserLookupResult');
      if (emailInput) emailInput.value = '';
      if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }

      await Promise.all([fetchInvites(), fetchDepartments()]);
      if (window.App && typeof App.loadDashboard === 'function') {
        try { App.loadDashboard(); } catch (e) {}
      }
    } catch (err) {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Error', err.message || 'Could not remove account.', 'error');
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Remove & allow re-registration'; }
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    init();
    const hash = (window.location.hash || '').replace('#', '');
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (hash === 'billing' || tabParam === 'billing' || hash === 'sample') {
      window.switchHrViewTab('billing');
    }
  });
})();
