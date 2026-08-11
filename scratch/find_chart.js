const fs = require('fs');
const content = fs.readFileSync('private/portal/hr.html', 'utf8');
const lines = content.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('severity') || line.includes('Severity') || line.includes('severity-trends') || line.includes('chart') || line.includes('Chart')) {
    console.log(`Line ${idx + 1}: ${line.substring(0, 120)}`);
  }
});
