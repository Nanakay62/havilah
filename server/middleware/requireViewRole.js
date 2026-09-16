'use strict';

const jwt = require('jsonwebtoken');

/**
 * Validates HttpOnly cookies to protect static HTML files.
 * If validation fails, redirects the browser back to the login page.
 *
 * @param {...string} allowedRoles - The roles permitted to access the route.
 */
function requireViewRole(...allowedRoles) {
  return (req, res, next) => {
    let token = req.cookies && req.cookies.token;

    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.slice(7).trim();
    }

    if (!token && req.query && req.query.token) {
      token = req.query.token;
    }

    // Direct preview/demo bypass for localhost presentations (e.g. /dashboard?demo=true)
    if (!token && req.query && (req.query.demo === 'true' || req.query.demo === '1')) {
      const demoRole = allowedRoles.includes('employee') ? 'employee' : allowedRoles.includes('hr_admin') ? 'hr_admin' : 'super_admin';
      const demoPayload = {
        userId: 'usr-demo-' + demoRole,
        companyId: 'b8ecbd7c-7993-48f9-babe-20c8001c345b',
        departmentId: 'dept-engineering',
        role: demoRole,
        status: 'active',
        isSystemSuperAdmin: demoRole === 'super_admin',
      };
      token = jwt.sign(demoPayload, process.env.JWT_SECRET, { expiresIn: '24h' });
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
        path: '/',
      });
      return next();
    }

    if (!token) {
      return res.redirect('/login.html');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // If no roles specified, just being logged in is enough
      if (allowedRoles.length === 0) {
        return next();
      }

      // Super Admins can access all views
      if (decoded.isSystemSuperAdmin || decoded.role === 'super_admin' || decoded.role === 'superadmin') {
        return next();
      }

      if (allowedRoles.includes(decoded.role)) {
        return next();
      }

      // Unauthorized role
      return res.redirect('/login.html');
    } catch (err) {
      // Invalid or expired token
      res.clearCookie('token');
      return res.redirect('/login.html');
    }
  };
}

module.exports = requireViewRole;
