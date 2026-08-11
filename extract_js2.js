const fs = require('fs');
const html = fs.readFileSync('private/app/dashboard.html', 'utf8');
const scriptRegex = /<script>([\s\S]*?)<\/script>/g;
let allJs = '';
let match;
while ((match = scriptRegex.exec(html)) !== null) {
  allJs += match[1] + '\n';
}
fs.writeFileSync('test_dashboard.js', allJs);
