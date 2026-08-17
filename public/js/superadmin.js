let token = localStorage.getItem('havilah_token') || localStorage.getItem('token') || localStorage.getItem('session_token');
if (!token) {
  window.location.href = '/login.html';
}

function logout() {
  if (typeof Auth !== 'undefined' && Auth.logout) {
    Auth.logout();
  } else {
    localStorage.removeItem('havilah_token');
    localStorage.removeItem('havilah_user');
    localStorage.removeItem('token');
    localStorage.removeItem('session_token');
    localStorage.removeItem('wf_user');
    localStorage.removeItem('wf_user_name');
    localStorage.removeItem('wf_user_email');
    window.location.href = '/login.html';
  }
}

function switchTab(tabId) {
  // Update nav active states
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${tabId}`);
  if (activeNav) activeNav.classList.add('active');

  // Update view active states
  document.querySelectorAll('.page-view').forEach(el => el.classList.remove('active'));
  const activeView = document.getElementById(`view-${tabId}`);
  if (activeView) activeView.classList.add('active');
}

async function fetchStats() {
  try {
    const res = await fetch('/api/v1/superadmin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      // 1. Top KPI Cards
      if (document.getElementById('statTotalTenants')) document.getElementById('statTotalTenants').innerText = data.activeTenants !== undefined ? data.activeTenants : (data.totalTenants || 0);
      if (document.getElementById('statTenantsTrend')) document.getElementById('statTenantsTrend').innerText = `${data.totalTenants || 0} Total Workspaces`;
      
      if (document.getElementById('statTotalUsers')) document.getElementById('statTotalUsers').innerText = (data.totalUsers || 0).toLocaleString();
      if (document.getElementById('statUsersTrend')) document.getElementById('statUsersTrend').innerText = data.totalAllocatedSeats ? `${data.totalAllocatedSeats.toLocaleString()} max seats allocated` : 'Registered Workers';

      if (document.getElementById('statEngagementRate')) document.getElementById('statEngagementRate').innerText = `${data.engagementRate || '0.0'}%`;
      if (document.getElementById('statEngagementTrend')) document.getElementById('statEngagementTrend').innerText = data.totalResponses ? `${data.totalResponses} check-ins submitted` : 'Response Compliance';

      // 2. Cross-Tenant Benchmark Analytics
      const b = data.benchmarks || {};
      
      const updateBench = (valId, trendId, benchObj) => {
        const valEl = document.getElementById(valId);
        const trendEl = document.getElementById(trendId);
        if (valEl) valEl.innerText = benchObj && benchObj.score ? benchObj.score : '--';
        if (trendEl) trendEl.innerText = benchObj && benchObj.tier ? benchObj.tier : 'No Data';
      };

      updateBench('benchPhq9Value', 'benchPhq9Trend', b.phq9);
      updateBench('benchGad7Value', 'benchGad7Trend', b.gad7);
      updateBench('benchPss10Value', 'benchPss10Trend', b.pss10);
      updateBench('benchFas10Value', 'benchFas10Trend', b.fas10);
      updateBench('benchCopsoqValue', 'benchCopsoqTrend', b.copsoq3);

      // 3. System Telemetry & Privacy Shield
      const telem = data.telemetry || {};
      if (document.getElementById('telemEmailSub')) {
        document.getElementById('telemEmailSub').innerText = `Nodemailer • ${telem.emailsSentToday || 0} Invites Dispatched Today`;
      }
      if (document.getElementById('telemAnonSub')) {
        document.getElementById('telemAnonSub').innerText = `${telem.suppressedCount || 0} Suppressed Reports Masked`;
      }
      if (document.getElementById('statSuppressedCount')) {
        document.getElementById('statSuppressedCount').innerText = telem.suppressedCount || 0;
      }
    }
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function fetchTenants() {
  try {
    const res = await fetch('/api/v1/superadmin/tenants', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      const tbody = document.querySelector('#tenantsTable tbody');
      if (!tbody) return;
      tbody.innerHTML = '';

      data.tenants.forEach(t => {
        const tr = document.createElement('tr');
        const isActive = t.lifecycle_state === 'active';

        // 1. Subdomain Slug Subtitle
        const slugDisplay = t.slug ? `${t.slug}.havilah.app` : 'unassigned.havilah.app';

        // 2. Billing Tier Pill
        const tierDisplay = (t.billing_tier || 'trial').toUpperCase();

        // 3. Seats Meter
        const used = t.used_seats || 0;
        const max = t.max_allowed_seats || 100;
        const pct = Math.min(100, Math.round((used / max) * 100));
        let colorClass = 'green';
        if (pct >= 90) colorClass = 'red';
        else if (pct >= 80) colorClass = 'amber';

        // 4. SSO / Domain Status
        let ssoHtml = '';
        if (t.sso_config && t.sso_config.enabled) {
          const provider = (t.sso_config.provider || 'SAML').toUpperCase();
          ssoHtml = `<span class="badge badge-sso-active">${provider} Active</span>`;
        } else if (t.domain) {
          ssoHtml = `<span class="badge badge-sso-none">${t.domain}</span>`;
        } else {
          ssoHtml = `<span class="text-xs text-slate-400 italic">No domain linked</span>`;
        }

        // 5. Lifecycle Badge
        let stateClass = '';
        let stateText = '';
        switch(t.lifecycle_state) {
          case 'active':
            stateClass = 'badge-state-active';
            stateText = 'ACTIVE';
            break;
          case 'suspended':
            stateClass = 'badge-state-suspended';
            stateText = '🔒 LOCKED';
            break;
          case 'expired':
            stateClass = 'badge-state-expired';
            stateText = '⏰ EXPIRED';
            break;
          case 'churned':
            stateClass = 'badge-state-churned';
            stateText = 'CHURNED';
            break;
          case 'pending_setup':
            stateClass = 'badge-state-pending';
            stateText = 'PENDING';
            break;
          default:
            stateClass = isActive ? 'badge-state-active' : 'badge-state-suspended';
            stateText = (t.lifecycle_state || 'active').toUpperCase();
        }

        // Expiry Badge
        const expiryDate = t.access_expires_at ? new Date(t.access_expires_at) : null;
        const now = new Date();
        let expiryBadge = '';
        if (expiryDate) {
          const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 0) {
            expiryBadge = '<span style="background:rgba(239,68,68,0.15);color:#f87171;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;">⏰ Expired</span>';
          } else if (daysLeft <= 7) {
            expiryBadge = '<span style="background:rgba(245,158,11,0.15);color:#f59e0b;padding:4px 10px;border-radius:6px;font-size:11px;font-weight:600;">⚠️ Expires: ' + expiryDate.toLocaleDateString() + '</span>';
          } else {
            expiryBadge = '<span style="background:rgba(99,102,241,0.1);color:#a78bfa;padding:4px 10px;border-radius:6px;font-size:11px;">📅 Expires: ' + expiryDate.toLocaleDateString() + '</span>';
          }
        }

        // 6. Action Button
        const nextState = isActive ? 'suspended' : 'active';
        const btnClass = isActive ? 'suspend' : 'activate';
        const btnText = isActive ? '🔒 Lock' : '🔓 Unlock';
        const extendBtn = `<button onclick="openExtendModal('${t.company_id}', '${t.company_name}', '${t.access_expires_at || ''}')" style="background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:6px 12px;color:#a78bfa;font-size:11px;cursor:pointer;">📅 Extend</button>`;

        tr.setAttribute('data-company', (t.company_name + ' ' + (t.slug || '') + ' ' + (t.domain || '')).toLowerCase());
        tr.setAttribute('data-tier', (t.billing_tier || 'trial').toLowerCase());
        tr.setAttribute('data-state', (t.lifecycle_state || 'active').toLowerCase());

        tr.innerHTML = `
          <td>
            <div class="company-cell-title">${t.company_name}</div>
            <div class="company-cell-sub">${slugDisplay}</div>
          </td>
          <td>
            <select class="tier-select-dropdown" onchange="changeTenantTier('${t.company_id}', '${t.company_name}', '${t.billing_tier || 'trial'}', this.value, this)" style="padding: 4px 8px; border-radius: 6px; font-weight: 700; font-size: 11px; text-transform: uppercase; cursor: pointer; border: 1px solid var(--border); background: var(--bg-elev); color: var(--accent);">
              <option value="trial" ${t.billing_tier === 'trial' ? 'selected' : ''}>TRIAL</option>
              <option value="starter" ${t.billing_tier === 'starter' ? 'selected' : ''}>STARTER</option>
              <option value="professional" ${t.billing_tier === 'professional' ? 'selected' : ''}>PROFESSIONAL</option>
              <option value="enterprise" ${t.billing_tier === 'enterprise' ? 'selected' : ''}>ENTERPRISE</option>
            </select>
          </td>
          <td>
            <div class="seat-meter-container">
              <div class="seat-count-label" style="display: flex; align-items: center; justify-content: space-between;">
                <span>${used.toLocaleString()} / <strong>${max.toLocaleString()}</strong></span>
                <button onclick="editSeatCapacity('${t.company_id}', '${t.company_name}', ${max})" style="border: none; background: transparent; cursor: pointer; color: var(--accent); font-weight: 700; font-size: 11px;" title="Edit Max Seats">✏️</button>
              </div>
              <div class="seat-progress-bar">
                <div class="seat-progress-fill ${colorClass}" style="width: ${pct}%"></div>
              </div>
            </div>
          </td>
          <td>${ssoHtml}</td>
          <td>
            <div style="display: flex; flex-direction: column; gap: 4px; align-items: flex-start;">
              <span class="badge ${stateClass}">${stateText}</span>
              ${expiryBadge}
            </div>
          </td>
          <td>
            <div style="display: flex; gap: 6px; align-items: center; position: relative; flex-wrap: wrap;">
              <button class="btn-action-toggle ${btnClass}" onclick="toggleStatus('${t.company_id}', '${nextState}')">${btnText}</button>
              <button class="btn-action-toggle" style="background:#EEF2FF; color:#4F46E5; border-color:#C7D2FE;" onclick="impersonateHR('${t.company_id}')">Impersonate</button>
              ${extendBtn}
              <button class="btn-action-toggle" style="background:var(--bg-base); color:var(--text-1); border-color:var(--border);" onclick="toggleActionMenu('menu-${t.company_id}', event)">•••</button>
              
              <div id="menu-${t.company_id}" class="action-popover" style="display: none; position: absolute; right: 0; background: #FFFFFF; border: 1px solid var(--border); border-radius: 8px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); z-index: 500; min-width: 190px; padding: 4px 0;">
                <a onclick="editSeatCapacity('${t.company_id}', '${t.company_name}', ${max})" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; color: var(--text-1); cursor: pointer;">✏️ Edit Seat Limit</a>
                <a onclick="resetHRCredentials('${t.company_id}', '${t.company_name}')" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; color: var(--text-1); cursor: pointer;">🔑 Set HR Password</a>
                <a onclick="openGenerateCodesModal('${t.company_id}', '${t.company_name}')" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; color: var(--text-1); cursor: pointer;">🎫 Generate Codes</a>
                <a onclick="openModuleFlagsModal('${t.company_id}', '${t.company_name}')" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; color: var(--text-1); cursor: pointer;">📦 Module Flags</a>
                <a onclick="deleteTenant('${t.company_id}', '${t.company_name}')" style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; font-size: 12px; color: #DC2626; cursor: pointer; border-top: 1px solid var(--border-light);">🗑️ Delete Tenant</a>
              </div>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
    }
  } catch (err) {
    console.error('Error fetching tenants:', err);
  }
}

function filterTenantsTable() {
  const search = document.getElementById('tenantSearchInput') ? document.getElementById('tenantSearchInput').value.toLowerCase() : '';
  const tierFilter = document.getElementById('tenantTierFilter') ? document.getElementById('tenantTierFilter').value.toLowerCase() : 'all';
  const stateFilter = document.getElementById('tenantStateFilter') ? document.getElementById('tenantStateFilter').value.toLowerCase() : 'all';

  const rows = document.querySelectorAll('#tenantsTable tbody tr');
  rows.forEach(tr => {
    const compData = tr.getAttribute('data-company') || '';
    const tierData = tr.getAttribute('data-tier') || '';
    const stateData = tr.getAttribute('data-state') || '';

    const matchesSearch = !search || compData.includes(search);
    const matchesTier = tierFilter === 'all' || tierData === tierFilter;
    const matchesState = stateFilter === 'all' || stateData === stateFilter;

    if (matchesSearch && matchesTier && matchesState) {
      tr.style.display = '';
    } else {
      tr.style.display = 'none';
    }
  });
}

function toggleActionMenu(menuId, event) {
  if (event) event.stopPropagation();
  const target = document.getElementById(menuId);
  if (!target) return;

  const isOpening = target.style.display === 'none' || !target.style.display;

  document.querySelectorAll('.action-popover').forEach(pop => {
    if (pop.id !== menuId) pop.style.display = 'none';
  });

  if (isOpening) {
    target.style.display = 'block';

    const btn = event ? event.currentTarget : null;
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const windowHeight = window.innerHeight;
      const spaceBelow = windowHeight - rect.bottom;
      const popoverHeight = 220;

      if (spaceBelow < popoverHeight && rect.top > popoverHeight) {
        // Open UPWARDS!
        target.style.top = 'auto';
        target.style.bottom = '100%';
        target.style.marginBottom = '6px';
        target.style.marginTop = '0';
        target.style.boxShadow = '0 -10px 25px rgba(0,0,0,0.15)';
      } else {
        // Open DOWNWARDS!
        target.style.top = '100%';
        target.style.bottom = 'auto';
        target.style.marginTop = '6px';
        target.style.marginBottom = '0';
        target.style.boxShadow = '0 10px 25px rgba(0,0,0,0.15)';
      }
    }
  } else {
    target.style.display = 'none';
  }
}

document.addEventListener('click', () => {
  document.querySelectorAll('.action-popover').forEach(pop => pop.style.display = 'none');
});

// Global Glassmorphism Custom Dialog System
function showToast(title, desc = '', type = 'success') {
  const container = document.getElementById('customToastContainer') || document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.style.cssText = `
    pointer-events: auto; min-width: 280px; max-width: 380px; padding: 12px 16px; border-radius: 12px;
    background: #FFFFFF; border: 1px solid var(--border); box-shadow: 0 10px 30px rgba(0,0,0,0.12);
    display: flex; align-items: flex-start; gap: 12px; transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    opacity: 0; transform: translateY(-10px);
  `;
  
  let borderColor = '#0D9488';
  let iconSvg = '🟢';
  if (type === 'error' || type === 'danger') {
    borderColor = '#DC2626'; iconSvg = '🔴';
  } else if (type === 'warning') {
    borderColor = '#D97706'; iconSvg = '🟡';
  } else if (type === 'info') {
    borderColor = '#0284C7'; iconSvg = '🔵';
  }
  toast.style.borderLeft = `4px solid ${borderColor}`;

  toast.innerHTML = `
    <div style="font-size: 1rem;">${iconSvg}</div>
    <div style="flex: 1; min-width: 0;">
      <div style="font-weight: 700; font-size: 0.875rem; color: var(--text-1);">${title}</div>
      ${desc ? `<div style="font-size: 0.8125rem; color: var(--text-2); margin-top: 2px;">${desc}</div>` : ''}
    </div>
    <button onclick="this.parentElement.remove()" style="border:none; background:transparent; color:var(--text-muted); cursor:pointer; font-size:1rem; padding:0;">×</button>
  `;

  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function showCustomAlert(title, message, iconType = 'info') {
  return new Promise(resolve => {
    const overlay = document.getElementById('customDialogOverlay');
    const titleEl = document.getElementById('customDialogTitle');
    const msgEl = document.getElementById('customDialogMessage');
    const iconEl = document.getElementById('customDialogIcon');
    const cancelBtn = document.getElementById('customDialogCancelBtn');
    const confirmBtn = document.getElementById('customDialogConfirmBtn');

    if (!overlay) return resolve();

    titleEl.textContent = title;
    msgEl.textContent = message;
    cancelBtn.style.display = 'none';
    confirmBtn.textContent = 'OK';
    confirmBtn.style.background = 'var(--accent)';

    if (iconType === 'error') {
      iconEl.textContent = '🔴'; iconEl.style.background = 'rgba(220,38,38,0.1)'; iconEl.style.color = '#DC2626';
    } else if (iconType === 'success') {
      iconEl.textContent = '🟢'; iconEl.style.background = 'rgba(13,148,136,0.1)'; iconEl.style.color = '#0D9488';
    } else {
      iconEl.textContent = 'ℹ️'; iconEl.style.background = 'rgba(2,132,199,0.1)'; iconEl.style.color = '#0284C7';
    }

    overlay.style.display = 'flex';

    confirmBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve();
    };
  });
}

function showCustomConfirm({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', danger = false, icon = '⚡' }) {
  return new Promise(resolve => {
    const overlay = document.getElementById('customDialogOverlay');
    const titleEl = document.getElementById('customDialogTitle');
    const msgEl = document.getElementById('customDialogMessage');
    const iconEl = document.getElementById('customDialogIcon');
    const cancelBtn = document.getElementById('customDialogCancelBtn');
    const confirmBtn = document.getElementById('customDialogConfirmBtn');

    if (!overlay) return resolve(false);

    titleEl.textContent = title;
    msgEl.textContent = message;
    iconEl.textContent = icon;
    iconEl.style.background = danger ? 'rgba(220,38,38,0.1)' : 'rgba(13,148,136,0.1)';
    iconEl.style.color = danger ? '#DC2626' : '#0D9488';

    cancelBtn.style.display = 'inline-block';
    cancelBtn.textContent = cancelText;
    confirmBtn.textContent = confirmText;
    confirmBtn.style.background = danger ? '#DC2626' : 'var(--accent)';

    overlay.style.display = 'flex';

    cancelBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve(false);
    };

    confirmBtn.onclick = () => {
      overlay.style.display = 'none';
      resolve(true);
    };
  });
}

async function changeTenantTier(companyId, companyName, oldTier, newTier, selectElem) {
  if (oldTier.toLowerCase() === newTier.toLowerCase()) return;
  
  const confirmed = await showCustomConfirm({
    title: '⚡ Update Billing Tier?',
    message: `Are you sure you want to change ${companyName} from ${oldTier.toUpperCase()} to ${newTier.toUpperCase()}?\n\nChanging tier will automatically adjust seat allocations, unlock framework capabilities, and log an audit entry.`,
    confirmText: 'Confirm Update',
    cancelText: 'Cancel',
    icon: '💳'
  });

  if (!confirmed) {
    if (selectElem) selectElem.value = oldTier;
    return;
  }

  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/tier`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ billing_tier: newTier })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Tier Updated', `Billing tier for ${companyName} updated to ${newTier.toUpperCase()}.`, 'success');
      fetchTenants();
      fetchStats();
    } else {
      showToast('Update Failed', data.error || 'Unknown error', 'error');
      if (selectElem) selectElem.value = oldTier;
    }
  } catch (err) {
    console.error('Error changing tier:', err);
    if (selectElem) selectElem.value = oldTier;
  }
}

function showCustomPrompt(title, message, defaultValue = '', placeholder = '') {
  return new Promise(resolve => {
    let overlay = document.getElementById('customPromptOverlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'customPromptOverlay';
      overlay.className = 'modal-overlay';
      overlay.style.cssText = 'display: none; z-index: 9999; backdrop-filter: blur(8px); background: rgba(15, 23, 42, 0.5);';
      overlay.innerHTML = `
        <div class="modal" style="max-width: 440px; border-radius: 16px; padding: 24px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);">
          <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
            <div id="customPromptIcon" style="width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 1.25rem; font-weight: 700; flex-shrink: 0; background: rgba(2,132,199,0.1); color: #0284C7;">🪑</div>
            <h3 id="customPromptTitle" style="font-size: 1.125rem; font-weight: 700; color: var(--text-1); margin: 0;">Input Required</h3>
          </div>
          <div id="customPromptMessage" style="font-size: 0.875rem; color: var(--text-2); line-height: 1.5; margin-bottom: 16px;"></div>
          <div class="form-group" style="margin-bottom: 20px;">
            <input type="text" id="customPromptInput" style="width: 100%; padding: 10px 14px; border: 1px solid var(--border); border-radius: 8px; font-size: 0.9375rem; box-sizing: border-box;">
          </div>
          <div style="display: flex; justify-content: flex-end; gap: 10px;">
            <button class="btn-outline" id="customPromptCancelBtn">Cancel</button>
            <button class="btn-action-primary" id="customPromptSubmitBtn">Save Seats</button>
          </div>
        </div>
      `;
      document.body.appendChild(overlay);
    }

    const titleEl = document.getElementById('customPromptTitle');
    const msgEl = document.getElementById('customPromptMessage');
    const inputEl = document.getElementById('customPromptInput');
    const cancelBtn = document.getElementById('customPromptCancelBtn');
    const submitBtn = document.getElementById('customPromptSubmitBtn');

    titleEl.textContent = title;
    msgEl.textContent = message;
    inputEl.value = defaultValue;
    inputEl.placeholder = placeholder;

    overlay.style.display = 'flex';
    setTimeout(() => { inputEl.focus(); inputEl.select(); }, 50);

    const cleanup = () => {
      overlay.style.display = 'none';
      cancelBtn.onclick = null;
      submitBtn.onclick = null;
      inputEl.onkeydown = null;
    };

    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };

    submitBtn.onclick = () => {
      const val = inputEl.value;
      cleanup();
      resolve(val);
    };

    inputEl.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = inputEl.value;
        cleanup();
        resolve(val);
      } else if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      }
    };
  });
}

async function editSeatCapacity(companyId, companyName, currentMax) {
  const newSeatsStr = await showCustomPrompt(
    '🪑 Update Max Allowed Seats',
    `Enter the new seat capacity for ${companyName}:`,
    currentMax,
    'e.g. 250'
  );
  if (newSeatsStr === null) return;
  const newSeats = parseInt(newSeatsStr);
  if (isNaN(newSeats) || newSeats <= 0) {
    return showToast('Invalid Seat Limit', 'Please enter a valid seat capacity.', 'warning');
  }

  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/seats`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ max_allowed_seats: newSeats })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Seats Updated', `Max seats for ${companyName} updated to ${newSeats.toLocaleString()}.`, 'success');
      fetchTenants();
    } else {
      showToast('Update Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error updating seat capacity:', err);
  }
}

let currentResetCompanyId = null;

function resetHRCredentials(companyId, companyName) {
  currentResetCompanyId = companyId;
  const nameEl = document.getElementById('resetHrCompanyName');
  if (nameEl) nameEl.textContent = companyName;
  generateRandomPassword('resetHrCustomPassword');
  const modal = document.getElementById('resetHrModal');
  if (modal) modal.style.display = 'flex';
}

function closeResetHrModal() {
  const modal = document.getElementById('resetHrModal');
  if (modal) modal.style.display = 'none';
}

async function submitResetHrPassword() {
  if (!currentResetCompanyId) return;
  const pwdInput = document.getElementById('resetHrCustomPassword');
  const pwd = pwdInput ? pwdInput.value.trim() : '';
  if (!pwd) return showToast('Field Required', 'Please enter or generate a password', 'warning');

  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${currentResetCompanyId}/reset-hr`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ custom_password: pwd })
    });
    const data = await res.json();
    if (data.success) {
      closeResetHrModal();
      showCustomAlert(
        '🔑 HR Password Updated',
        `${data.message}\n\nHR Email: ${data.email}\nNew Password: ${data.new_password}\n\nLogin URL: ${window.location.origin}/login.html`,
        'success'
      );
    } else {
      showToast('Reset Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error setting HR password:', err);
  }
}

let currentGenCompanyId = null;

function openGenerateCodesModal(companyId, companyName) {
  currentGenCompanyId = companyId;
  const nameEl = document.getElementById('genCodesCompanyName');
  if (nameEl) nameEl.textContent = companyName;
  const countEl = document.getElementById('genCodesCount');
  if (countEl) countEl.value = 5;
  const modal = document.getElementById('generateCodesModal');
  if (modal) modal.style.display = 'flex';
}

function closeGenerateCodesModal() {
  const modal = document.getElementById('generateCodesModal');
  if (modal) modal.style.display = 'none';
}

async function submitGenerateCodes() {
  if (!currentGenCompanyId) return;
  const countEl = document.getElementById('genCodesCount');
  const count = countEl ? (parseInt(countEl.value) || 5) : 5;

  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${currentGenCompanyId}/generate-codes`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ count })
    });
    const data = await res.json();
    if (data.success) {
      closeGenerateCodesModal();
      const codeList = data.codes.join('\n');
      showCustomAlert(
        '🎫 Activation Codes Generated',
        `Generated ${data.codes.length} new activation codes for ${data.company_name}:\n\n${codeList}\n\nActivation URL: ${window.location.origin}/register.html`,
        'success'
      );
    } else {
      showToast('Generation Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error generating codes:', err);
  }
}

async function deleteTenant(companyId, companyName) {
  const confirmed = await showCustomConfirm({
    title: '🗑️ Permanently Delete Tenant?',
    message: `Are you sure you want to PERMANENTLY DELETE "${companyName}"?\n\nThis will remove the tenant, all associated HR & employee accounts, and all activation codes from the database. This action CANNOT be undone.`,
    confirmText: 'Delete Permanently',
    cancelText: 'Cancel',
    danger: true,
    icon: '⚠️'
  });
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Tenant Deleted', data.message || `Tenant ${companyName} deleted permanently.`, 'success');
      fetchTenants();
      fetchStats();
    } else {
      showToast('Deletion Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error deleting tenant:', err);
  }
}

let activeModuleCompanyId = null;
async function openModuleFlagsModal(companyId, companyName) {
  activeModuleCompanyId = companyId;
  const modal = document.getElementById('moduleFlagsModal');
  if (modal) {
    if (document.getElementById('moduleModalCompanyName')) {
      document.getElementById('moduleModalCompanyName').innerText = companyName;
    }

    try {
      const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/modules`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      const allowed = (data.success && Array.isArray(data.allowed_modules))
        ? data.allowed_modules
        : ['DAILY_PULSE', 'PHQ-9', 'GAD-7', 'PSS-10', 'FAS-10', 'COPSOQ_III'];

      if (document.getElementById('mod-daily-pulse')) document.getElementById('mod-daily-pulse').checked = allowed.includes('DAILY_PULSE');
      if (document.getElementById('mod-phq9')) document.getElementById('mod-phq9').checked = allowed.includes('PHQ-9');
      if (document.getElementById('mod-gad7')) document.getElementById('mod-gad7').checked = allowed.includes('GAD-7');
      if (document.getElementById('mod-pss10')) document.getElementById('mod-pss10').checked = allowed.includes('PSS-10');
      if (document.getElementById('mod-fas10')) document.getElementById('mod-fas10').checked = allowed.includes('FAS-10');
      if (document.getElementById('mod-copsoq')) document.getElementById('mod-copsoq').checked = allowed.includes('COPSOQ_III') || allowed.includes('COPSOQ');
    } catch (err) {
      console.warn('Error fetching tenant modules:', err.message);
    }

    modal.style.display = 'flex';
  }
}

function closeModuleFlagsModal() {
  const modal = document.getElementById('moduleFlagsModal');
  if (modal) modal.style.display = 'none';
  activeModuleCompanyId = null;
}

async function saveModuleFlags() {
  if (!activeModuleCompanyId) return;

  const allowed_modules = [];
  if (document.getElementById('mod-daily-pulse') && document.getElementById('mod-daily-pulse').checked) allowed_modules.push('DAILY_PULSE');
  if (document.getElementById('mod-phq9') && document.getElementById('mod-phq9').checked) allowed_modules.push('PHQ-9');
  if (document.getElementById('mod-gad7') && document.getElementById('mod-gad7').checked) allowed_modules.push('GAD-7');
  if (document.getElementById('mod-pss10') && document.getElementById('mod-pss10').checked) allowed_modules.push('PSS-10');
  if (document.getElementById('mod-fas10') && document.getElementById('mod-fas10').checked) allowed_modules.push('FAS-10');
  if (document.getElementById('mod-copsoq') && document.getElementById('mod-copsoq').checked) allowed_modules.push('COPSOQ_III');

  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${activeModuleCompanyId}/modules`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ allowed_modules })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Module Permissions Saved', 'Tenant module permissions updated in real-time.', 'success');
      closeModuleFlagsModal();
      fetchTenants();
    } else {
      showToast('Save Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error saving module flags:', err);
  }
}

async function impersonateHR(companyId) {
  try {
    const res = await fetch('/api/v1/superadmin/impersonate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ company_id: companyId })
    });
    const data = await res.json();
    if (data.success && data.redirect_url) {
      showToast('HR Impersonation Session', `Switching scope to ${data.company_name}...`, 'info');
      window.open(data.redirect_url, '_blank');
    } else {
      showToast('Impersonation Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error starting impersonation:', err);
  }
}

async function toggleStatus(companyId, newState) {
  if (newState === 'suspended') {
    const confirmed = await showCustomConfirm({
      title: '🔒 Lock Tenant?',
      message: 'All active sessions for this tenant will be terminated. Continue?',
      confirmText: 'Lock Tenant',
      cancelText: 'Cancel',
      danger: true,
      icon: '🔒'
    });
    if (!confirmed) return;
  }
  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${companyId}/status`, {
      method: 'PATCH',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ lifecycle_state: newState })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Tenant Status Updated', `Lifecycle state set to ${newState.toUpperCase()}.`, 'success');
      fetchTenants();
      fetchStats();
    } else {
      showToast('Status Update Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error toggling status:', err);
  }
}

let isSlugManuallyEdited = false;

function generateSlug(text) {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')  // remove non-alphanumeric except spaces/hyphens
    .replace(/[\s_]+/g, '-')        // collapse spaces/underscores to single hyphen
    .replace(/^-+|-+$/g, '');       // trim hyphens
}

function setupSlugAutoGenerator() {
  const nameInput = document.getElementById('tenantName');
  const slugInput = document.getElementById('tenantSlug');

  if (!nameInput || !slugInput) return;

  nameInput.addEventListener('input', () => {
    if (!isSlugManuallyEdited) {
      slugInput.value = generateSlug(nameInput.value);
    }
  });

  slugInput.addEventListener('input', () => {
    const autoVal = generateSlug(nameInput.value);
    if (!slugInput.value.trim() || slugInput.value.trim() === autoVal) {
      isSlugManuallyEdited = false;
    } else {
      isSlugManuallyEdited = true;
    }
  });
}

function openModal() { 
  isSlugManuallyEdited = false;
  const modal = document.getElementById('provisionModal');
  if (modal) modal.style.display = 'flex'; 
}

function closeModal() { 
  const modal = document.getElementById('provisionModal');
  if (modal) modal.style.display = 'none'; 
  if (document.getElementById('tenantName')) document.getElementById('tenantName').value = '';
  if (document.getElementById('tenantSlug')) document.getElementById('tenantSlug').value = '';
  if (document.getElementById('tenantDomain')) document.getElementById('tenantDomain').value = '';
  if (document.getElementById('tenantClinicalPartner')) document.getElementById('tenantClinicalPartner').value = 'FZ Safety and Health';
  if (document.getElementById('tenantAllowCustomEap')) document.getElementById('tenantAllowCustomEap').checked = true;
  isSlugManuallyEdited = false;
}

async function createTenant() {
  const name = document.getElementById('tenantName') ? document.getElementById('tenantName').value.trim() : '';
  let slug = document.getElementById('tenantSlug') ? document.getElementById('tenantSlug').value.trim() : '';
  const domain = document.getElementById('tenantDomain') ? document.getElementById('tenantDomain').value.trim() : '';
  const tier = document.getElementById('tenantTier') ? document.getElementById('tenantTier').value : 'enterprise';
  const seats = document.getElementById('tenantSeats') ? document.getElementById('tenantSeats').value : 100;
  const hr_admin_email = document.getElementById('tenantHrEmail') ? document.getElementById('tenantHrEmail').value.trim() : '';
  const hr_admin_password = document.getElementById('tenantHrPassword') ? document.getElementById('tenantHrPassword').value.trim() : '';
  const invite_code_count = document.getElementById('tenantInviteCount') ? (parseInt(document.getElementById('tenantInviteCount').value) || 5) : 5;
  const generate_initial_codes = document.getElementById('provGenerateCodes') ? document.getElementById('provGenerateCodes').checked : false;
  const clinical_partner = document.getElementById('tenantClinicalPartner') ? document.getElementById('tenantClinicalPartner').value : 'FZ Safety and Health';
  const allow_custom_eap_overrides = document.getElementById('tenantAllowCustomEap') ? document.getElementById('tenantAllowCustomEap').checked : true;

  const entitlements = {
    copsoq3: document.getElementById('entitlement-copsoq') ? document.getElementById('entitlement-copsoq').checked : true,
    pss10: document.getElementById('entitlement-pss10') ? document.getElementById('entitlement-pss10').checked : true,
    phq9: document.getElementById('entitlement-phq9') ? document.getElementById('entitlement-phq9').checked : true,
    gad7: document.getElementById('entitlement-gad7') ? document.getElementById('entitlement-gad7').checked : true,
    fas10: document.getElementById('entitlement-fas10') ? document.getElementById('entitlement-fas10').checked : false
  };

  if (!name) return showToast('Field Required', 'Company Name is required', 'warning');

  if (!slug) {
    slug = generateSlug(name);
    if (document.getElementById('tenantSlug')) document.getElementById('tenantSlug').value = slug;
  }

  if (!slug) return showToast('Field Required', 'Subdomain Slug is required', 'warning');

  try {
    const res = await fetch('/api/v1/superadmin/tenants', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        company_name: name,
        slug: slug,
        domain: domain || null,
        billing_tier: tier,
        max_allowed_seats: parseInt(seats) || 100,
        hr_admin_email,
        hr_admin_password,
        invite_code_count,
        generate_initial_codes,
        clinical_partner,
        allow_custom_eap_overrides,
        entitlements
      })
    });
    
    const data = await res.json();
    if (data.success) {
      closeModal();
      fetchTenants();
      fetchStats();
      openProvisionSuccessModal(data);
    } else {
      showToast('Provisioning Failed', data.error || 'Unknown error', 'error');
    }
  } catch (err) {
    console.error('Error creating tenant:', err);
  }
}

// Helpers & Provision Success Modal Handlers
let currentProvisionData = null;

function openProvisionSuccessModal(data) {
  currentProvisionData = data;
  const tenant = data.tenant;
  const hr = data.hr_admin;
  const codes = data.activation_codes || [];

  const compNameEl = document.getElementById('succCompanyName');
  if (compNameEl) compNameEl.textContent = `${tenant.company_name} Provisioned!`;

  const metaEl = document.getElementById('succCompanyMeta');
  if (metaEl) metaEl.textContent = `Billing Tier: ${(tenant.billing_tier || 'TRIAL').toUpperCase()} | Seat Capacity: ${tenant.max_allowed_seats}`;

  const hrEmailEl = document.getElementById('succHrEmail');
  if (hrEmailEl) hrEmailEl.textContent = hr ? hr.email : 'None';

  const hrPwdEl = document.getElementById('succHrPassword');
  if (hrPwdEl) hrPwdEl.textContent = hr ? (hr.plain_password || '********') : 'None';

  const loginLink = document.getElementById('succLoginUrlLink');
  if (loginLink) {
    loginLink.href = `${window.location.origin}/login.html`;
    loginLink.textContent = `${window.location.origin}/login.html`;
  }

  const actLink = document.getElementById('succActivationUrlLink');
  if (actLink) {
    actLink.href = `${window.location.origin}/register.html`;
    actLink.textContent = `${window.location.origin}/register.html`;
  }

  const container = document.getElementById('succCodesContainer');
  if (container) {
    container.innerHTML = '';
    if (codes.length === 0) {
      container.innerHTML = `<div style="font-size: 12px; color: var(--text-2); background: rgba(0,183,195,0.05); padding: 10px 14px; border-radius: 8px; border: 1px solid rgba(0,183,195,0.15); font-style: italic;">ℹ️ No initial employee codes generated. HR Admin will manage activation codes directly in their HR Compliance Portal.</div>`;
    } else {
      codes.forEach((c) => {
        const chip = document.createElement('span');
        chip.style.cssText = 'background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); color: #10b981; font-family: monospace; font-weight: 700; font-size: 11px; padding: 4px 8px; border-radius: 6px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;';
        chip.title = 'Click to copy code';
        chip.innerHTML = `${c} <span style="opacity:0.6;">📋</span>`;
        chip.onclick = () => copyToClipboard(c, `Copied activation code: ${c}`);
        container.appendChild(chip);
      });
    }
  }

  const modal = document.getElementById('provisionSuccessModal');
  if (modal) modal.style.display = 'flex';
}

function closeProvisionSuccessModal() {
  const modal = document.getElementById('provisionSuccessModal');
  if (modal) modal.style.display = 'none';
}

function copyHrCredentials() {
  if (!currentProvisionData || !currentProvisionData.hr_admin) return;
  const hr = currentProvisionData.hr_admin;
  const text = `Havilah HR Admin Login Credentials:\nLogin URL: ${window.location.origin}/login.html\nEmail: ${hr.email}\nPassword: ${hr.plain_password}`;
  copyToClipboard(text, 'HR Login Credentials copied!');
}

function copyAllActivationCodes() {
  if (!currentProvisionData || !currentProvisionData.activation_codes) return;
  const codes = currentProvisionData.activation_codes;
  const text = `Employee Activation URL: ${window.location.origin}/register.html\nActivation Codes:\n${codes.join('\n')}`;
  copyToClipboard(text, 'All Activation Codes copied!');
}

function generateRandomPassword(inputId) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
  let pwd = '';
  for (let i = 0; i < 10; i++) {
    pwd += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  const el = document.getElementById(inputId);
  if (el) el.value = pwd;
}

function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    if (btnEl) btnEl.innerHTML = '🙈';
  } else {
    input.type = 'password';
    if (btnEl) btnEl.innerHTML = '👁️';
  }
}

function copyToClipboard(text, successMsg = 'Copied to clipboard!') {
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text);
  } else {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
  showToast('Copied', successMsg, 'success');
}

// Init
window.onload = () => {
  fetchStats();
  fetchTenants();
  setupSlugAutoGenerator();
};

// Extend Access Feature
let extendTargetCompanyId = null;
let extendSelectedDays = null;

function openExtendModal(companyId, companyName, currentExpiry) {
  extendTargetCompanyId = companyId;
  extendSelectedDays = null;
  document.getElementById('extendCompanyName').textContent = companyName;
  document.getElementById('extendCurrentExpiry').textContent = currentExpiry ? new Date(currentExpiry).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : 'Not set';
  document.getElementById('extendCustomDays').value = '';
  document.getElementById('extendAccessOverlay').style.display = 'flex';
  // Clear active states on quick buttons
  document.querySelectorAll('.extend-quick-btn').forEach(b => { b.style.background = 'rgba(99,102,241,0.1)'; b.style.borderColor = 'rgba(99,102,241,0.2)'; });
}

function closeExtendModal() {
  document.getElementById('extendAccessOverlay').style.display = 'none';
  extendTargetCompanyId = null;
  extendSelectedDays = null;
}

function setExtendDays(days) {
  extendSelectedDays = days;
  document.getElementById('extendCustomDays').value = days;
  // Highlight selected button
  document.querySelectorAll('.extend-quick-btn').forEach(b => {
    b.style.background = 'rgba(99,102,241,0.1)';
    b.style.borderColor = 'rgba(99,102,241,0.2)';
  });
  event.target.style.background = 'rgba(99,102,241,0.25)';
  event.target.style.borderColor = 'rgba(99,102,241,0.5)';
}

async function submitExtendAccess() {
  const daysInput = document.getElementById('extendCustomDays')?.value;
  const days = parseInt(daysInput) || extendSelectedDays;
  
  if (!days || days < 1) {
    showToast('Validation Error', 'Please select or enter the number of days to extend.', 'error');
    return;
  }
  
  const btn = document.getElementById('extendSubmitBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Extending...'; }
  
  try {
    const res = await fetch(`/api/v1/superadmin/tenants/${extendTargetCompanyId}/extend-access`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ daysToAdd: days })
    });
    const result = await res.json();
    
    if (result.success) {
      showToast('Access Extended', `Tenant access extended by ${days} days. New expiry: ${new Date(result.access_expires_at).toLocaleDateString()}`, 'success');
      closeExtendModal();
      fetchTenants();
    } else {
      showToast('Error', result.error || 'Failed to extend access.', 'error');
    }
  } catch (err) {
    showToast('Connection Error', 'Could not reach the server.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Extend Access'; }
  }
}
