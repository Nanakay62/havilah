const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');
html = html.replace('src="/js/data.js"', 'src="/js/data.js?v=' + Date.now() + '"');
html = html.replace('src="/js/app.js"', 'src="/js/app.js?v=' + Date.now() + '"');
fs.writeFileSync('private/app/dashboard.html', html);
console.log("Patched cache busting");
