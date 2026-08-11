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

    if (!token) {
      return res.redirect('/login.html');
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'fallback_secret_for_dev');
      
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
