const fs = require('fs');
const path = 'c:/Users/nanak/Desktop/copsoqu/private/app/dashboard.html';
let content = fs.readFileSync(path, 'utf8');

// Remove view-landing section
const landingStart = '<section class="view" id="view-landing" style="display:none;" aria-label="Global Dashboard">';
const employeeStart = '<!-- ============ EMPLOYEE VIEW ============ -->';

const startIndex = content.indexOf(landingStart);
const endIndex = content.indexOf(employeeStart);

if (startIndex !== -1 && endIndex !== -1) {
    content = content.substring(0, startIndex) + content.substring(endIndex);
    console.log('Removed view-landing section');
}

// Remove script tag
content = content.replace('<script src="/js/hrDashboard.js"></script>\n', '');
content = content.replace('<script src="/js/hrDashboard.js"></script>', '');

fs.writeFileSync(path, content, 'utf8');
console.log('Done.');
