'use strict';

const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const { validateSession } = require('../middleware/auth');

/**
 * @route   GET /api/v1/alerts
 * @desc    Fetch real threshold alerts for the tenant from MongoDB
 * @access  Authenticated
 */
router.get('/', validateSession, async (req, res, next) => {
  try {
    const tenantId = (req.sessionData && req.sessionData.company_id) || req.query.tenant_id || 'ten-123';

    if (!tenantId) {
      return res.status(400).json({ success: false, error: 'Tenant ID required' });
    }

    // Query real threshold alerts from MongoDB filtered strictly by tenant_id / company_id
    const rawAlerts = await Alert.find({
      $or: [{ tenant_id: tenantId }, { company_id: tenantId }]
    })
      .sort({ created_at: -1 })
      .limit(5)
      .lean();

    const formattedAlerts = rawAlerts.map(alert => {
      let severity = (alert.severity || alert.icon || 'INFO').toUpperCase();
      let icon = 'info';
      if (severity === 'CRITICAL' || severity === 'HIGH' || severity === 'SEVERE') {
        severity = 'CRITICAL';
        icon = 'critical';
      } else if (severity === 'WARNING' || severity === 'MODERATE' || severity === 'MEDIUM') {
        severity = 'WARNING';
        icon = 'moderate';
      } else {
        severity = 'INFO';
        icon = 'info';
      }

      const headline = alert.headline || alert.title || alert.alert_type || 'Threshold Alert';
      const department = alert.department || alert.department_name || alert.department_id || null;
      const titleText = department ? `${department} • ${headline}` : headline;

      return {
        id: alert._id ? alert._id.toString() : (alert.id || alert.alert_id),
        tenant_id: tenantId,
        severity: severity,
        icon: icon,
        title: titleText,
        headline: headline,
        department: department,
        desc: alert.desc || alert.description || 'Automated threshold alert triggered.',
        time: alert.time || (alert.created_at ? new Date(alert.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Recent'),
        created_at: alert.created_at || new Date()
      };
    });

    res.json({
      success: true,
      alerts: formattedAlerts
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
