const fs = require('fs');
let html = fs.readFileSync('private/portal/hr.html', 'utf8');

// Use regular expressions for a clean fix
html = html.replace(/const csv = 'Department,Wellbeing Index,Trend,Employees\n' \+/, "const csv = 'Department,Wellbeing Index,Trend,Employees\\n' +");
html = html.replace(/\.join\('\n'\);/g, ".join('\\n');");

// Fix duplicate injection
html = html.replace(/setTimeout\(\(\) => \{ initSeverityChart\(\); initRadarChart\(\); \}, 100\);\s+setTimeout\(\(\) => \{ initSeverityChart\(\); initRadarChart\(\); \}, 100\);/g, "setTimeout(() => { initSeverityChart(); initRadarChart(); }, 100);");

fs.writeFileSync('private/portal/hr.html', html);
console.log('Fixed syntax!');
