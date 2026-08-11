
const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

const target = 'new Chart(ctx, {';
const replacement = 'window.employeeTrendChartInstance = new Chart(ctx, {';

html = html.replace(target, replacement);
fs.writeFileSync('private/app/dashboard.html', html);

