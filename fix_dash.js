
const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

const strStart = html.indexOf('const recList = document.getElementById(\'recommendedList\');');
const strEnd = html.indexOf('        }', strStart) + 9;
const recommendedStr = html.substring(strStart, strEnd);

let newHtml = html.replace(recommendedStr, '');
newHtml = newHtml.replace('function renderEmployeeDashboard() {', 'function renderEmployeeDashboard() {\n' + recommendedStr);

fs.writeFileSync('private/app/dashboard.html', newHtml);

