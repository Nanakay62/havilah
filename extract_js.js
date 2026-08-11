const fs = require('fs');
const html = fs.readFileSync('private/app/dashboard.html', 'utf8');
const match = html.match(/<script>\s*const App = \(\(\) => {([\s\S]*?)<\/script>/);
if (match) {
  fs.writeFileSync('test_dashboard.js', 'const App = (() => {' + match[1]);
  console.log("Extracted JS");
} else {
  console.log("No match found");
}
