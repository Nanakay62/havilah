const fs = require('fs');
const path = 'c:/Users/nanak/Desktop/copsoqu/server/routes/hrAdmin.js';
let content = fs.readFileSync(path, 'utf8');

const additionalRoutes = `
// GET /api/v1/hr/radar
router.get('/radar', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    
    // We aggregate all logs across the company to find the average dimension scores
    const AnonHazardLog = require('../models/AnonHazardLog');
    
    const logs = await AnonHazardLog.find({ company_id }).lean();
    if (logs.length === 0) {
       // Return empty or fallback
       return res.json({ success: true, data: [] });
    }
    
    let sums = {};
    let counts = {};
    
    logs.forEach(log => {
       if (log.dimension_scores) {
          Object.keys(log.dimension_scores).forEach(dim => {
             sums[dim] = (sums[dim] || 0) + log.dimension_scores[dim];
             counts[dim] = (counts[dim] || 0) + 1;
          });
       }
    });
    
    let averages = {};
    Object.keys(sums).forEach(dim => {
       averages[dim] = Math.round(sums[dim] / counts[dim]);
    });
    
    // Radar charts typically expect: Mood, Calm, Stress, Energy, Sleep, Work-fit, Social, Purpose
    // Map existing dimensions to these, or use what we have.
    const radarData = [
       averages['mood'] || 50,
       averages['calm'] || 50,
       averages['stress'] || 50,
       averages['energy'] || 50,
       averages['sleep'] || 50,
       averages['work_fit'] || 50,
       averages['social'] || 50,
       averages['purpose'] || 50
    ];
    
    res.json({ success: true, data: radarData, averages });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/severity-trends
router.get('/severity-trends', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const AnonHazardLog = require('../models/AnonHazardLog');
    
    // Find logs from the last 8 weeks
    const eightWeeksAgo = new Date(Date.now() - 8 * 7 * 24 * 60 * 60 * 1000);
    const logs = await AnonHazardLog.find({ 
       company_id, 
       submitted_at: { $gte: eightWeeksAgo } 
    }).sort({ period_year: 1, period_week: 1 }).lean();
    
    // Group by week
    const weeks = {};
    logs.forEach(log => {
       const weekKey = \`\${log.period_year}-W\${log.period_week}\`;
       if (!weeks[weekKey]) {
          weeks[weekKey] = { healthy: 0, mild: 0, moderate: 0, severe: 0, total: 0 };
       }
       weeks[weekKey][log.severity_band]++;
       weeks[weekKey].total++;
    });
    
    // Format into arrays for charts
    const labels = Object.keys(weeks);
    const datasets = {
       healthy: [],
       mild: [],
       moderate: [],
       severe: []
    };
    
    labels.forEach(w => {
       datasets.healthy.push(Math.round((weeks[w].healthy / weeks[w].total) * 100));
       datasets.mild.push(Math.round((weeks[w].mild / weeks[w].total) * 100));
       datasets.moderate.push(Math.round((weeks[w].moderate / weeks[w].total) * 100));
       datasets.severe.push(Math.round((weeks[w].severe / weeks[w].total) * 100));
    });
    
    res.json({ success: true, labels, datasets });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/hr/alerts
router.get('/alerts', async (req, res, next) => {
  try {
    const { company_id } = req.sessionData;
    const AnonHazardLog = require('../models/AnonHazardLog');
    const Department = require('../models/Department');
    
    // Simple logic: fetch all logs in the last week, group by department, and if severe > 20%, generate alert
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const logs = await AnonHazardLog.find({ 
       company_id, 
       submitted_at: { $gte: oneWeekAgo } 
    }).lean();
    
    let deptStats = {};
    logs.forEach(log => {
       if (!deptStats[log.department_id]) deptStats[log.department_id] = { severe: 0, total: 0 };
       deptStats[log.department_id].total++;
       if (log.severity_band === 'severe' || log.severity_band === 'moderate') {
          deptStats[log.department_id].severe++;
       }
    });
    
    const departments = await Department.find({ company_id }).lean();
    const deptMap = {};
    departments.forEach(d => deptMap[d.department_id] = d.name);
    
    const alerts = [];
    Object.keys(deptStats).forEach(deptId => {
       const stat = deptStats[deptId];
       const deptName = deptMap[deptId] || 'Unknown';
       if (stat.total >= 5) {
          const severePct = (stat.severe / stat.total) * 100;
          if (severePct >= 20) {
             alerts.push({
                icon: 'critical',
                title: \`\${deptName} - Elevated Risk Detected\`,
                desc: \`Over 20% of recent assessments in this department indicated moderate to severe risk.\`,
                time: 'Recent'
             });
          } else if (severePct >= 10) {
             alerts.push({
                icon: 'moderate',
                title: \`\${deptName} - Monitor Risk\`,
                desc: \`Noticeable elevation in stress levels detected this week.\`,
                time: 'Recent'
             });
          }
       }
    });
    
    if (alerts.length === 0) {
        alerts.push({
            icon: 'info',
            title: 'System operating normally',
            desc: 'No departments currently exceeding risk thresholds.',
            time: 'Just now'
        });
    }
    
    res.json({ success: true, alerts });
  } catch (err) {
    next(err);
  }
});
`;

// Inject before module.exports = router;
content = content.replace('module.exports = router;', additionalRoutes + '\nmodule.exports = router;');

fs.writeFileSync(path, content, 'utf8');
console.log('Routes added.');
