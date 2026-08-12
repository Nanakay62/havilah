const fs = require('fs');
const path = require('path');

const targetDirs = ['private', 'public', 'server'];
const rootDir = path.join(__dirname, '..');

function getFiles(dirPath) {
  let results = [];
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git') {
        results = results.concat(getFiles(fullPath));
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (['.html', '.js', '.css', '.json', '.txt', '.md'].includes(ext)) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

let files = [];
targetDirs.forEach(d => {
  files = files.concat(getFiles(path.join(rootDir, d)));
});

let modifiedCount = 0;
let totalReplacements = 0;

files.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('—') || content.includes('&mdash;')) {
    const count1 = (content.match(/—/g) || []).length;
    const count2 = (content.match(/&mdash;/g) || []).length;
    const totalInFile = count1 + count2;

    // Cleanly replace em-dashes with standard dash
    content = content.replace(/\s*—\s*/g, ' - ');
    content = content.replace(/\s*&mdash;\s*/g, ' - ');

    fs.writeFileSync(filePath, content, 'utf8');
    modifiedCount++;
    totalReplacements += totalInFile;
    console.log(`Replaced ${totalInFile} em-dash(es) in ${path.relative(rootDir, filePath)}`);
  }
});

console.log(`\n==========================================`);
console.log(`SUCCESS: Replaced ${totalReplacements} em-dashes across ${modifiedCount} files.`);
