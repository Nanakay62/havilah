const fs = require('fs');
const path = require('path');

const targetDirs = ['private', 'public', 'server'];
const filesToProcess = [];

function scanDir(dirPath) {
  const items = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dirPath, item.name);
    if (item.isDirectory()) {
      if (item.name !== 'node_modules' && item.name !== '.git') {
        scanDir(fullPath);
      }
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (['.html', '.js', '.css', '.json', '.txt', '.md'].includes(ext)) {
        filesToProcess.push(fullPath);
      }
    }
  }
}

const rootDir = path.join(__dirname, '..');
targetDirs.forEach(dir => scanDir(path.join(rootDir, dir)));

console.log(`Found ${filesToProcess.length} files to scan.`);

let matchesCount = 0;
const matchedFiles = [];

filesToProcess.forEach(filePath => {
  const content = fs.readFileSync(filePath, 'utf8');
  if (content.includes('—') || content.includes('&mdash;')) {
    matchesCount++;
    matchedFiles.push(filePath);
    console.log(`Matched: ${path.relative(rootDir, filePath)}`);
  }
});

console.log(`\nTotal matched files: ${matchedFiles.length}`);
