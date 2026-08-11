const fs = require('fs');
let js = fs.readFileSync('public/js/hrDashboard.js', 'utf8');
js = js.replace(/\\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('public/js/hrDashboard.js', js);
console.log('Fixed syntax error');
