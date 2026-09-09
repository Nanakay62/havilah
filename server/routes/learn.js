'use strict';

const express = require('express');
const router = express.Router();
const HealthArticle = require('../models/HealthArticle');
const PersonalWellnessLog = require('../models/PersonalWellnessLog');
const { validateSession } = require('../middleware/auth');

router.use(validateSession);

/**
 * GET /api/v1/learn/categories
 * Returns all active categories with published article counts
 */
router.get('/categories', async (req, res, next) => {
  try {
    const rawCounts = await HealthArticle.aggregate([
      { $match: { is_published: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const categoryMeta = {
      stress: { label: 'Stress Management', emoji: '⚡', description: 'De-escalation tools, somatic exercises, and cognitive reframing' },
      anxiety: { label: 'Anxiety & Calm', emoji: '🌿', description: 'Techniques for easing worry, panic symptoms, and meeting overload' },
      burnout: { label: 'Burnout Recovery', emoji: '🔥', description: 'Recognizing chronic exhaustion, detached cynicism, and restoration' },
      sleep: { label: 'Sleep & Energy', emoji: '🌙', description: 'Circadian hygiene, managing shift-work fatigue, and mental decompression' },
      work_life_balance: { label: 'Work-Life Harmony', emoji: '⚖️', description: 'Asynchronous boundaries, shutdown routines, and digital detox' },
      resilience: { label: 'Resilience & Growth', emoji: '🛡️', description: 'Adaptive mindset, psychological safety, and coping endurance' },
      crisis_support: { label: 'Crisis & Immediate Help', emoji: '🆘', description: 'Hotlines, professional services, and emergency protocols' },
      relationships: { label: 'Workplace Dynamics', emoji: '🤝', description: 'Conflict resolution, healthy communication, and peer connection' },
      leadership: { label: 'Compassionate Leadership', emoji: '🧭', description: 'Leading psychologically healthy teams under ISO 45003' }
    };

    const categories = Object.entries(categoryMeta).map(([catKey, meta]) => {
      const match = rawCounts.find(c => c._id === catKey);
      return {
        key: catKey,
        ...meta,
        article_count: match ? match.count : 0,
      };
    });

    res.json({ success: true, categories });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/learn/recommended
 * Surfaces articles personalized to the employee's most recent assessments + always pins crisis resources
 */
router.get('/recommended', async (req, res, next) => {
  try {
    const { user_id } = req.sessionData;

    // Fetch latest user assessments
    const recentLogs = await PersonalWellnessLog.find({ user_id })
      .sort({ submitted_at: -1 })
      .limit(5)
      .lean();

    // Crisis support is always fetched first
    const crisisResources = await HealthArticle.find({
      is_crisis_resource: true,
      is_published: true,
    }).select('-content_markdown').lean();

    // Determine high-risk trigger tags
    const targetCategories = new Set();
    recentLogs.forEach(log => {
      const type = (log.survey_type || '').toLowerCase();
      const dims = log.dimension_scores || {};
      const comp = log.composite_score || 0;

      if (type.includes('pss') && (dims.stress > 60 || comp > 25)) {
        targetCategories.add('stress');
        targetCategories.add('resilience');
      }
      if (type.includes('phq') && (dims.mood < 40 || comp > 9)) {
        targetCategories.add('burnout');
        targetCategories.add('crisis_support');
      }
      if (type.includes('gad') && (dims.calm < 40 || comp > 9)) {
        targetCategories.add('anxiety');
        targetCategories.add('stress');
      }
      if (type.includes('fas') && (dims.energy < 40 || comp > 21)) {
        targetCategories.add('sleep');
        targetCategories.add('burnout');
      }
      if (type.includes('copsoq') && dims.work_fit < 50) {
        targetCategories.add('work_life_balance');
        targetCategories.add('burnout');
      }
    });

    let query = { is_published: true, is_crisis_resource: false };
    if (targetCategories.size > 0) {
      query.category = { $in: Array.from(targetCategories) };
    }

    let recommended = await HealthArticle.find(query)
      .select('-content_markdown')
      .sort({ featured: -1, createdAt: -1 })
      .limit(6)
      .lean();

    // Fallback if no personalized matches
    if (recommended.length === 0) {
      recommended = await HealthArticle.find({ is_published: true, is_crisis_resource: false })
        .select('-content_markdown')
        .sort({ featured: -1, createdAt: -1 })
        .limit(6)
        .lean();
    }

    res.json({
      success: true,
      has_tailored_recommendations: targetCategories.size > 0,
      focus_areas: Array.from(targetCategories),
      crisis_resources: crisisResources,
      articles: recommended,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/learn/articles
 * Browse/search published articles with filters and pagination
 */
router.get('/articles', async (req, res, next) => {
  try {
    const { category, search, page = 1, limit = 12 } = req.query;
    const query = { is_published: true };

    if (category && category !== 'all') {
      query.category = category;
    }

    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      query.$or = [
        { title: { $regex: q, $options: 'i' } },
        { summary: { $regex: q, $options: 'i' } },
        { tags: { $in: [new RegExp(q, 'i')] } },
      ];
    }

    const p = Math.max(1, parseInt(page, 10) || 1);
    const lim = Math.max(1, Math.min(50, parseInt(limit, 10) || 12));

    const [articles, total] = await Promise.all([
      HealthArticle.find(query)
        .select('-content_markdown')
        .sort({ featured: -1, createdAt: -1 })
        .skip((p - 1) * lim)
        .limit(lim)
        .lean(),
      HealthArticle.countDocuments(query),
    ]);

    res.json({
      success: true,
      total,
      page: p,
      pages: Math.ceil(total / lim) || 1,
      articles,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/learn/articles/:slug
 * Full article reader endpoint
 */
router.get('/articles/:slug', async (req, res, next) => {
  try {
    const article = await HealthArticle.findOne({
      slug: req.params.slug.toLowerCase().trim(),
      is_published: true,
    }).lean();

    if (!article) {
      return res.status(404).json({
        success: false,
        error: 'ARTICLE_NOT_FOUND',
        message: 'The requested mental health resource could not be found.',
      });
    }

    res.json({ success: true, article });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
