const fs = require('fs');

let html = fs.readFileSync('private/portal/hr.html', 'utf8');

// Replace any unguarded empGreeting calls
html = html.replace(/\$\('#empGreeting'\)\.textContent =.*?;/g, "const _eg = document.getElementById('empGreeting'); if (_eg) { _eg.textContent = `${greeting()}, ${state.user.name.split(' ')[0]}.`; }");

fs.writeFileSync('private/portal/hr.html', html, 'utf8');
console.log('Fixed empGreeting bug!');
