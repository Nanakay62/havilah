'use strict';

const express = require('express');
const AnonHazardLog = require('../models/AnonHazardLog');
const { validateSession } = require('../middleware/auth');
const { enforceTenantScope } = require('../middleware/tenantIsolation');

const router = express.Router();

/**
 * @route   GET /api/v1/resources/recommendations
 * @desc    Get recommended resources based on departmental risk anomalies
 * @access  Authenticated
 */
router.get(
  '/recommendations',
  validateSession,
  enforceTenantScope,
  async (req, res, next) => {
    try {
      const companyId = req.tenantScope.company_id;
      const departmentId = req.sessionData.department_id; // Assume employee's department

      if (!departmentId) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_DEPARTMENT',
          message: 'User must belong to a department to receive contextual recommendations.',
        });
      }

      // 1. Find the 30 days window
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      // 2. Aggregate logs for this department over the last 30 days
      const riskAggregation = await AnonHazardLog.aggregate([
        {
          $match: {
            company_id: companyId,
            department_id: departmentId,
            submitted_at: { $gte: thirtyDaysAgo },
          },
        },
        {
          $group: {
            _id: '$risk_category',
            avg_severity: { $avg: '$severity' },
            count: { $sum: 1 },
          },
        },
      ]);

      // 3. Identify flagged categories (average severity >= 3)
      const flaggedCategories = riskAggregation
        .filter((group) => group.avg_severity >= 3)
        .map((group) => group._id);

      // 4. Map flagged categories to specific resources
      const recommendations = [];

      if (flaggedCategories.includes('workload')) {
        recommendations.push({
          id: 'res_workload_1',
          title: 'Desk mobility \u2014 5 minute reset',
          category: 'Movement & body',
          meta: '5 min \u00b7 Video',
          trigger: 'Workload/Time Boundary Overrun',
        });
        recommendations.push({
          id: 'res_workload_2',
          title: 'Building a wind-down routine',
          category: 'Sleep & recovery',
          meta: '6 min \u00b7 Article',
          trigger: 'Workload/Time Boundary Overrun',
        });
      }

      if (flaggedCategories.includes('psychosocial') || flaggedCategories.includes('interpersonal')) {
        recommendations.push({
          id: 'res_psycho_1',
          title: 'Box breathing for acute stress',
          category: 'Breathing & relaxation',
          meta: '4 min \u00b7 Audio guided',
          trigger: 'Psychosocial Stress Spike',
        });
        recommendations.push({
          id: 'res_psycho_2',
          title: 'Reframing catastrophic thoughts',
          category: 'Cognitive exercises',
          meta: '7 min \u00b7 Interactive',
          trigger: 'Psychosocial Stress Spike',
        });
      }

      if (flaggedCategories.includes('environmental') || flaggedCategories.includes('organizational')) {
        recommendations.push({
          id: 'res_env_1',
          title: 'Sleep hygiene for shift workers',
          category: 'Sleep & recovery',
          meta: '7 min \u00b7 Article',
          trigger: 'Environmental/Organizational Risk',
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          flagged_categories: flaggedCategories,
          recommendations,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

module.exports = router;
