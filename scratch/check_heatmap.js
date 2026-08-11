const fs = require('fs');
let html = fs.readFileSync('private/portal/hr.html', 'utf8');
console.log('heatmapTableBody:', html.includes('heatmapTableBody'));
