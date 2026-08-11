
const fs = require('fs');
let html = fs.readFileSync('private/app/dashboard.html', 'utf8');

const leftover = '      );\n      }';
const leftover2 = '      );\r\n      }';

html = html.replace(leftover, '');
html = html.replace(leftover2, '');

fs.writeFileSync('private/app/dashboard.html', html);

