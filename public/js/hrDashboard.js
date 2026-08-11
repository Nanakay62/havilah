(() => {
  const state = {
    heatmapData: [],
    invites: [],
    departments: []
  };

  async function apiFetch(url, options = {}) {
    const token = localStorage.getItem('token');
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
      hrInvitesTableBody.innerHTML = '<tr><td colspan="6" style="padding: 16px; text-align: center; color: var(--text-2);">No activation codes generated yet.</td></tr>';
      return;
    }

    state.invites.forEach(invite => {
      const tr = document.createElement('tr');
      const isExpired = new Date(invite.expires_at) < new Date();
      let statusBadge = '';
      
      if (invite.status === 'revoked') {
        statusBadge = '<span style="background: #fee2e2; color: #991b1b; padding: 3px 8px; border-radius: 99px; font-size: 0.75rem; font-weight: 600;">Revoked</span>';
      } else if (invite.status === 'used') {
        statusBadge = '<span style="background: #e2e8f0; color: #475569; padding: 3px 8px; border-radius: 99px; font-size: 0.75rem; font-weight: 600;">Used</span>';
      } else if (isExpired || invite.status === 'expired') {
        statusBadge = '<span style="background: #fef3c7; color: #92400e; padding: 3px 8px; border-radius: 99px; font-size: 0.75rem; font-weight: 600;">Expired</span>';
      } else {
        statusBadge = '<span style="background: #dcfce7; color: #166534; padding: 3px 8px; border-radius: 99px; font-size: 0.75rem; font-weight: 600;">Active</span>';
      }

      const redemptions = invite.usage_count || (invite.status === 'used' ? 1 : 0);
      const isRevokable = invite.status === 'active' || invite.status === 'pending';

      const host = window.location.host;
      const protocol = window.location.protocol;
      const magicLink = `${protocol}//${host}/activate.html?code=${invite.activation_code}`;

      tr.innerHTML = `
        <td style="padding: 12px 14px; border-bottom: 1px solid var(--border);">
          <div style="font-family: monospace; font-size: 0.95rem; font-weight: 700; color: var(--text-1); letter-spacing: 0.05em;">${invite.activation_code}</div>
          <div style="font-size: 0.75rem; color: var(--text-3); margin-top: 2px;">1-Click Registration Link Ready</div>
        </td>
        <td style="padding: 12px 14px; border-bottom: 1px solid var(--border); font-weight: 600;">${invite.department_name}</td>
        <td style="padding: 12px 14px; border-bottom: 1px solid var(--border); font-size: 0.85rem; color: var(--text-2);">${redemptions} worker${redemptions === 1 ? '' : 's'}</td>
        <td style="padding: 12px 14px; border-bottom: 1px solid var(--border);">${statusBadge}</td>
        <td style="padding: 12px 14px; border-bottom: 1px solid var(--border); color: var(--text-2); font-size: 0.8rem;">${new Date(invite.expires_at).toLocaleDateString()}</td>
        <td style="padding: 12px 14px; border-bottom: 1px solid var(--border);">
          <div style="display: flex; gap: 6px; flex-wrap: wrap;">
            <button class="btn btn-ghost btn-sm" onclick="window.copyHrInviteLink('${invite.activation_code}')" style="padding: 4px 8px; font-size: 0.75rem;" title="Copy 1-Click Magic Link">📋 Copy Link</button>
            ${isRevokable ? `<button class="btn btn-ghost btn-sm" onclick="window.revokeHrInvite('${invite.activation_code}')" style="padding: 4px 8px; font-size: 0.75rem; color: #dc2626;" title="Revoke Code">🚫 Revoke</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="window.deleteHrInvite('${invite.activation_code}')" style="padding: 4px 8px; font-size: 0.75rem; color: #b91c1c; background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2);" title="Delete Code & Link">🗑️ Delete</button>
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

  async function init() {
    await Promise.all([
      fetchInvites(),
      fetchDepartments()
    ]);
  }

  // Global actions attached to window
  window.refreshHrInvites = () => {
    fetchInvites();
    fetchDepartments();
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
          ? `Code ${res.code} created & magic links sent to ${res.emails_invited.length} worker(s)!`
          : `Code ${res.code} created successfully with 1-click magic link!`;
        App.toast('1-Click Link Generated', msg, 'success');
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
    
    const host = window.location.host;
    const protocol = window.location.protocol;
    const url = `${protocol}//${host}/activate.html?code=${code}`;

    navigator.clipboard.writeText(url).then(() => {
      if (window.App && typeof App.toast === 'function') {
        App.toast('Link Copied!', '1-click registration link copied to clipboard.', 'info');
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

  document.addEventListener('DOMContentLoaded', () => {
    init();
  });
})();
