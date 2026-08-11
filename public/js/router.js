// public/js/router.js
(function() {
  const tokenPayload = Auth.parseToken();
  if (!tokenPayload) {
    window.location.href = '/login.html';
    return;
  }
  
  const path = window.location.pathname;
  
  // Hard guard for HR Dashboard
  if (path.includes('/private/hr/')) {
    if (tokenPayload.role !== 'hr_admin' && tokenPayload.role !== 'tenant_admin' && !tokenPayload.isSystemSuperAdmin) {
      window.location.href = '/login.html';
    }
  }
  
  // Hard guard for Employee Dashboard
  if (path.includes('/private/employee/')) {
    if (tokenPayload.role !== 'employee' && !tokenPayload.isSystemSuperAdmin) {
      window.location.href = '/login.html';
    }
  }
})();
