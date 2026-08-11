const fs = require('fs');
let html = fs.readFileSync('private/portal/hr.html', 'utf8');
console.log('SeverityChart:', html.includes('severityChart'));
console.log('RadarChart:', html.includes('radarChart'));
console.log('wellnessDimensionsChart:', html.includes('wellnessDimensionsChart'));
console.log('riskSeverityTrendsChart:', html.includes('riskSeverityTrendsChart'));
