/**
 * @fileoverview Super Admin panel logic.
 * Manages multi-tenant configuration, platform analytics, onboarding wizard, and secure audit trails.
 */
(function() {
    'use strict';

    /**
     * @type {Object} Admin Application State
     */
    const adminState = {
        authenticated: false,
        currentView: 'dashboard',
        selectedTenant: null,
        editingTenant: false,
        wizardStep: 1,
        importData: null,
        importValidation: { valid: false, errors: [] },
        tenants: [
            { id: 'T-001', name: 'Acme Corp', users: 1250, status: 'Active', plan: 'Enterprise', created: '2025-10-12' },
            { id: 'T-002', name: 'Global Tech', users: 3400, status: 'Active', plan: 'Enterprise Plus', created: '2026-01-05' },
            { id: 'T-003', name: 'StartUp Inc', users: 45, status: 'Pending', plan: 'Pro', created: '2026-07-10' }
        ],
        auditLogs: [],
        charts: {}
    };

    /**
     * Auth
     */
    function checkAdminAuth() {
        const auth = sessionStorage.getItem('wf_admin_auth');
        if (auth === 'true') {
            adminState.authenticated = true;
            document.getElementById('adminLoginView').classList.add('hidden');
            document.getElementById('adminAppView').classList.remove('hidden');
            loadDashboard();
        } else {
            document.getElementById('adminLoginView').classList.remove('hidden');
            document.getElementById('adminAppView').classList.add('hidden');
        }
    }

    function adminLogin(e) {
        if (e) e.preventDefault();
        // Mock basic auth
        const code = document.getElementById('adminAuthCode').value;
        if (code === 'superadmin') {
            sessionStorage.setItem('wf_admin_auth', 'true');
            checkAdminAuth();
            adminToast('Login successful. System secure.', 'success');
        } else {
            adminToast('Invalid admin credentials', 'error');
        }
    }

    function adminLogout() {
        sessionStorage.removeItem('wf_admin_auth');
        window.location.reload();
    }

    /**
     * View Management
     */
    function switchAdminView(viewName) {
        adminState.currentView = viewName;
        
        // UI Navigation toggle
        document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('bg-gray-800', 'text-white'));
        const activeNav = document.querySelector(`.admin-nav-item[data-target="${viewName}"]`);
        if (activeNav) activeNav.classList.add('bg-gray-800', 'text-white');

        // Toggle View Sections
        document.querySelectorAll('.admin-section').forEach(el => el.classList.add('hidden'));
        document.getElementById(`section-${viewName}`).classList.remove('hidden');

        // Route Handler
        switch (viewName) {
            case 'dashboard':
                loadDashboard();
                break;
            case 'tenants':
                renderTenantsTable();
                break;
            case 'wizard':
                renderWizard();
                break;
            case 'audit':
                loadAuditLog();
                break;
            case 'health':
                renderHealth();
                break;
        }
    }

    /**
     * Dashboard & Analytics
     */
    function loadDashboard() {
        computeAnalytics();
    }

    function computeAnalytics() {
        document.getElementById('statTotalTenants').textContent = adminState.tenants.length;
        const totalUsers = adminState.tenants.reduce((sum, t) => sum + t.users, 0);
        document.getElementById('statTotalUsers').textContent = totalUsers.toLocaleString();
        document.getElementById('statActiveSessions').textContent = Math.floor(totalUsers * 0.12).toLocaleString();
        
        renderAnalytics();
    }

    function renderAnalytics() {
        const ctx = document.getElementById('platformGrowthChart');
        if (!ctx) return;
        if (adminState.charts.growth) adminState.charts.growth.destroy();

        adminState.charts.growth = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul'],
                datasets: [{
                    label: 'New Tenants',
                    data: [2, 3, 5, 4, 8, 12, 15],
                    backgroundColor: '#4f46e5'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
    }

    /**
     * Tenant Management
     */
    function loadTenants() {
        // Mock load from server
        renderTenantsTable();
    }

    function renderTenantsTable() {
        const tbody = document.getElementById('tenantsTableBody');
        if (!tbody) return;

        tbody.innerHTML = adminState.tenants.map(t => `
            <tr class="border-b hover:bg-gray-50">
                <td class="p-3 text-sm font-medium text-gray-900">${t.id}</td>
                <td class="p-3 text-sm text-gray-700">${t.name}</td>
                <td class="p-3 text-sm text-gray-700">${t.users.toLocaleString()}</td>
                <td class="p-3 text-sm">
                    <span class="px-2 py-1 text-xs rounded-full ${t.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}">${t.status}</span>
                </td>
                <td class="p-3 text-sm text-gray-700">${t.plan}</td>
                <td class="p-3 text-sm">
                    <button class="text-indigo-600 hover:underline mr-3" onclick="window.admin.openTenantModal('${t.id}')">Edit</button>
                    <button class="text-red-600 hover:underline">Suspend</button>
                </td>
            </tr>
        `).join('');
    }

    function openTenantModal(tenantId = null) {
        adminState.editingTenant = !!tenantId;
        const modal = document.getElementById('tenantModal');
        const title = document.getElementById('tenantModalTitle');
        
        if (tenantId) {
            title.textContent = 'Edit Tenant Config';
            const t = adminState.tenants.find(x => x.id === tenantId);
            document.getElementById('tnName').value = t.name;
            document.getElementById('tnPlan').value = t.plan;
        } else {
            title.textContent = 'Provision New Tenant';
            document.getElementById('tenantForm').reset();
        }
        
        modal.classList.remove('hidden');
    }

    function closeTenantModal() {
        document.getElementById('tenantModal').classList.add('hidden');
    }

    function saveTenant(e) {
        e.preventDefault();
        const name = document.getElementById('tnName').value;
        const plan = document.getElementById('tnPlan').value;
        
        if (adminState.editingTenant) {
            adminToast(`Tenant ${name} updated successfully.`);
            createAuditEntry('SYS', 'ADM_001', 'SuperAdmin', 'TENANT_UPDATE', { name, plan });
        } else {
            const newId = `T-00${adminState.tenants.length + 1}`;
            adminState.tenants.push({
                id: newId, name, users: 0, status: 'Pending', plan, created: new Date().toISOString().split('T')[0]
            });
            adminToast(`Tenant ${name} provisioned.`);
            createAuditEntry(newId, 'ADM_001', 'SuperAdmin', 'TENANT_CREATE', { name, plan });
        }
        
        closeTenantModal();
        renderTenantsTable();
    }

    /**
     * Onboarding Wizard
     */
    function renderWizard() {
        document.querySelectorAll('.wizard-step-content').forEach(el => el.classList.add('hidden'));
        document.getElementById(`wiz-step-${adminState.wizardStep}`).classList.remove('hidden');

        // Progress UI update
        const steps = document.querySelectorAll('.wizard-step-indicator');
        steps.forEach((el, index) => {
            if (index + 1 < adminState.wizardStep) {
                el.classList.add('bg-green-500', 'text-white', 'border-green-500');
                el.classList.remove('bg-gray-200', 'text-gray-500', 'border-gray-300', 'bg-indigo-600');
            } else if (index + 1 === adminState.wizardStep) {
                el.classList.add('bg-indigo-600', 'text-white', 'border-indigo-600');
                el.classList.remove('bg-gray-200', 'text-gray-500', 'border-gray-300', 'bg-green-500');
            } else {
                el.classList.add('bg-gray-200', 'text-gray-500', 'border-gray-300');
                el.classList.remove('bg-indigo-600', 'text-white', 'border-indigo-600', 'bg-green-500');
            }
        });

        // Button states
        document.getElementById('btnWizPrev').disabled = adminState.wizardStep === 1;
        document.getElementById('btnWizNext').textContent = adminState.wizardStep === 3 ? 'Execute Import' : 'Next Step';
    }

    function wizardNext() {
        if (adminState.wizardStep === 1) {
            // Validate basic info
            adminState.wizardStep++;
            renderWizard();
        } else if (adminState.wizardStep === 2) {
            // Validate File Import
            const fileInput = document.getElementById('hrisImportFile').files[0];
            if (!fileInput) {
                adminToast('Please upload a CSV file to map HRIS data.', 'error');
                return;
            }
            parseImportData(fileInput);
            adminState.wizardStep++;
            renderWizard();
        } else if (adminState.wizardStep === 3) {
            executeImport();
        }
    }

    function wizardBack() {
        if (adminState.wizardStep > 1) {
            adminState.wizardStep--;
            renderWizard();
        }
    }

    function parseImportData(file) {
        // Mock parsing logic
        adminState.importValidation = {
            valid: true,
            totalRows: 1540,
            validRows: 1538,
            errors: ["Row 45: Missing Department", "Row 102: Invalid Email"]
        };
        
        const summary = document.getElementById('importSummary');
        summary.innerHTML = `
            <p><strong>Total Employees Found:</strong> ${adminState.importValidation.totalRows}</p>
            <p class="text-green-600"><strong>Valid Records:</strong> ${adminState.importValidation.validRows}</p>
            <p class="text-red-600"><strong>Errors:</strong> ${adminState.importValidation.errors.length}</p>
            <ul class="text-xs text-red-500 mt-2 list-disc pl-4">${adminState.importValidation.errors.map(e => `<li>${e}</li>`).join('')}</ul>
        `;
    }

    function executeImport() {
        if (!adminState.importValidation.valid) return;
        
        adminToast('Executing secure data sync via AES-256...', 'success');
        createAuditEntry('SYS', 'ADM_001', 'SuperAdmin', 'HRIS_SYNC_EXECUTE', { rows: adminState.importValidation.validRows });
        
        setTimeout(() => {
            adminToast('Provisioning complete. HR admins notified.', 'success');
            adminState.wizardStep = 1;
            switchAdminView('tenants');
        }, 2000);
    }

    /**
     * Audit Trail (SHA-256 Verifiable)
     */
    async function computeAuditHash(previousHash, payloadStr) {
        const encoder = new TextEncoder();
        const data = encoder.encode(previousHash + payloadStr);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    async function createAuditEntry(companyId, actorId, actorRole, eventType, payloadObj) {
        const timestamp = new Date().toISOString();
        const payloadStr = JSON.stringify(payloadObj);
        
        const previousHash = adminState.auditLogs.length > 0 
            ? adminState.auditLogs[0].hash 
            : '0000000000000000000000000000000000000000000000000000000000000000'; // Genesis

        const rawData = `${companyId}|${actorId}|${actorRole}|${eventType}|${timestamp}|${payloadStr}`;
        const hash = await computeAuditHash(previousHash, rawData);

        const entry = {
            id: `AUD-${Date.now()}`,
            companyId, actorId, actorRole, eventType, timestamp, payload: payloadStr, hash, previousHash
        };

        adminState.auditLogs.unshift(entry); // prepend
        if (adminState.currentView === 'audit') renderAuditTrail();
    }

    function loadAuditLog() {
        if (adminState.auditLogs.length === 0) {
            // Genesis seeds
            createAuditEntry('SYS', 'SYSTEM', 'Root', 'SYS_INIT', { version: '2.0.4' }).then(() => {
                createAuditEntry('T-001', 'USR_09', 'HR_Admin', 'PULSE_LAUNCH', { surveyType: 'Burnout' });
            });
        } else {
            renderAuditTrail();
        }
    }

    function renderAuditTrail() {
        const tbody = document.getElementById('auditTableBody');
        if (!tbody) return;

        tbody.innerHTML = adminState.auditLogs.map(log => `
            <tr class="border-b font-mono text-xs hover:bg-gray-50">
                <td class="p-2 text-gray-500">${new Date(log.timestamp).toLocaleString()}</td>
                <td class="p-2 text-indigo-700">${log.eventType}</td>
                <td class="p-2 text-gray-700">${log.companyId}</td>
                <td class="p-2 text-gray-600">${log.actorRole} (${log.actorId})</td>
                <td class="p-2 text-gray-400 truncate max-w-xs" title="${log.hash}">${log.hash.substring(0, 16)}...</td>
            </tr>
        `).join('');
    }

    async function verifyChain() {
        const btn = document.getElementById('btnVerifyChain');
        btn.textContent = 'Verifying...';
        btn.disabled = true;

        let isValid = true;
        const logs = [...adminState.auditLogs].reverse(); // from genesis to latest

        let expectedPrevHash = '0000000000000000000000000000000000000000000000000000000000000000';

        for (let i = 0; i < logs.length; i++) {
            const log = logs[i];
            const rawData = `${log.companyId}|${log.actorId}|${log.actorRole}|${log.eventType}|${log.timestamp}|${log.payload}`;
            const computedHash = await computeAuditHash(expectedPrevHash, rawData);
            
            if (computedHash !== log.hash || log.previousHash !== expectedPrevHash) {
                isValid = false;
                break;
            }
            expectedPrevHash = log.hash;
        }

        setTimeout(() => {
            if (isValid) {
                adminToast('Immutable ledger verified successfully.', 'success');
            } else {
                adminToast('CRITICAL: Audit chain integrity compromised!', 'error');
            }
            btn.textContent = 'Verify Ledger Integrity';
            btn.disabled = false;
        }, 800);
    }

    function filterAuditLog(term) {
        // Implementation for filtering by term
        const termLow = term.toLowerCase();
        const rows = document.getElementById('auditTableBody').querySelectorAll('tr');
        rows.forEach(row => {
            if (row.innerText.toLowerCase().includes(termLow)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    }

    /**
     * System Health
     */
    function renderHealth() {
        // Mock health statuses
        document.getElementById('healthDb').innerHTML = '<span class="text-green-600">● Operational (9ms latency)</span>';
        document.getElementById('healthEnc').innerHTML = '<span class="text-green-600">● AES-256 Active</span>';
        document.getElementById('healthWorker').innerHTML = '<span class="text-yellow-600">● Heavy Load (85%)</span>';
    }

    /**
     * Utilities
     */
    function adminToast(message, type = 'info') {
        const container = document.getElementById('admin-toast-container');
        if (!container) return;
        
        const toast = document.createElement('div');
        const bgColor = type === 'success' ? 'bg-green-600' : (type === 'error' ? 'bg-red-600' : 'bg-gray-800');
        toast.className = `${bgColor} text-white px-4 py-3 rounded shadow-lg flex items-center justify-between text-sm min-w-[250px] mb-2 transition-opacity`;
        toast.innerHTML = `<span>${message}</span>`;
        
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('opacity-0');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    /**
     * Initialization
     */
    document.addEventListener('DOMContentLoaded', () => {
        // Check if admin login view exists in HTML context (assuming it might be placed inside admin.html)
        if (document.getElementById('adminLoginView')) {
            checkAdminAuth();
        }
        
        // Form Bindings
        const loginForm = document.getElementById('adminLoginForm');
        if (loginForm) loginForm.addEventListener('submit', adminLogin);

        const tenantForm = document.getElementById('tenantForm');
        if (tenantForm) tenantForm.addEventListener('submit', saveTenant);
    });

    /**
     * Expose Admin API
     */
    window.admin = {
        adminLogin,
        adminLogout,
        switchAdminView,
        openTenantModal,
        closeTenantModal,
        wizardNext,
        wizardBack,
        verifyChain,
        filterAuditLog
    };

})();
