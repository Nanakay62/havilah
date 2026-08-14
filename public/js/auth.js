// public/js/auth.js
const Auth = {
  login: async (email, password) => {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.message || 'Login failed');
    }
    
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('havilah_token', data.token);
      localStorage.setItem('token', data.token);
      localStorage.setItem('session_token', data.token);
      localStorage.setItem('wf_user_email', email);
      document.cookie = `token=${data.token}; path=/; max-age=86400; SameSite=Lax`;
    }
    if (data.user) {
      const userObj = {
        id: data.user.user_id || data.user.id,
        user_id: data.user.user_id || data.user.id,
        email: email,
        role: data.user.role,
        tenant_id: data.user.company_id || data.user.tenant_id,
        company_id: data.user.company_id || data.user.tenant_id,
        full_name: data.user.full_name
      };
      localStorage.setItem('havilah_user', JSON.stringify(userObj));
      localStorage.setItem('wf_user', JSON.stringify(userObj));
      if (data.user.full_name) {
        localStorage.setItem('wf_user_name', data.user.full_name);
      }
    }
    return data;
  },
  
  getToken: () => {
    return localStorage.getItem('havilah_token') || localStorage.getItem('token') || localStorage.getItem('session_token');
  },
  
  getAuthHeader: () => {
    const token = Auth.getToken();
    return token ? { 'Authorization': `Bearer ${token}` } : {};
  },

  authHeaders: () => {
    return Auth.getAuthHeader();
  },
  
  parseToken: (tokenStr) => {
    const token = tokenStr || Auth.getToken();
    if (!token) return null;
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
          return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  },

  logout: () => {
    ['havilah_token', 'havilah_user', 'token', 'session_token', 'wf_user', 'wf_user_name', 'wf_user_email'].forEach(k => {
      try { localStorage.removeItem(k); } catch (e) {}
    });
    document.cookie = 'token=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
    if (!window.location.pathname.includes('login')) {
      window.location.href = '/login.html';
    }
  }
};

window.Auth = Auth;

// Global Auth Check on Page Load & Session Restoration
document.addEventListener('DOMContentLoaded', async () => {
  const currentPath = window.location.pathname.toLowerCase();

  const isPublicPage = currentPath.includes('login') ||
                       currentPath.includes('register') ||
                       currentPath.includes('activate') ||
                       currentPath === '/' ||
                       currentPath === '/index.html';

  const token = Auth.getToken();

  // If no token exists and on a protected page, redirect to login
  if (!token) {
    if (!isPublicPage) {
      window.location.href = '/login.html';
    }
    return;
  }

  // Ensure cookie is synced for static page routing
  if (token && !document.cookie.includes('token=')) {
    document.cookie = `token=${token}; path=/; max-age=86400; SameSite=Lax`;
  }

  // Set default Authorization header for all global fetch requests
  window.authHeader = Auth.getAuthHeader();

  // Validate token freshness with backend GET /api/v1/auth/me
  try {
    const res = await fetch('/api/v1/auth/me', {
      headers: window.authHeader
    });

    if (res.status === 401 || res.status === 403) {
      console.warn('Session expired or unauthorized');
      Auth.logout();
      return;
    }

    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        localStorage.setItem('havilah_user', JSON.stringify(data.user));
        localStorage.setItem('wf_user', JSON.stringify(data.user));
        if (data.user.full_name) {
          localStorage.setItem('wf_user_name', data.user.full_name);
        }
      }
    }
  } catch (err) {
    console.warn('Network issue during session check, keeping local session active:', err);
  }

  // Role checks for current view
  const payload = Auth.parseToken();
  if (payload) {
    if (payload.role === 'employee') {
      const hrLinks = document.querySelectorAll(`.hr-analytics-link, [href*="hr"], [href*="analytics"], [onclick*="'hr'"]`);
      hrLinks.forEach(link => link.remove());
      const roleBadge = document.querySelector('.profile-role');
      if (roleBadge) roleBadge.textContent = 'Team Member';
    }
  }
});
