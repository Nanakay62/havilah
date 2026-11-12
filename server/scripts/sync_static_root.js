'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Havilah Static Root & Portal Mirror Sync Script
 * 
 * Rules:
 * 1. Only copy files, NEVER delete anything.
 * 2. Prints dry-run list before writing.
 * 3. Verifies byte-for-byte SHA-256 checksum parity between sources and destinations.
 */

const rootDir = path.resolve(__dirname, '../..');
const isDryRun = process.argv.includes('--dry-run');

function sha256(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function getSyncPairs() {
  const pairs = [];

  // Helper to walk a directory recursively
  function addDirPairs(srcRelDir, destRelDir) {
    const srcAbs = path.join(rootDir, srcRelDir);
    if (!fs.existsSync(srcAbs)) return;

    function walk(currentDir) {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullSrc = path.join(currentDir, entry.name);
        const subRel = path.relative(srcAbs, fullSrc);
        const targetRel = path.join(destRelDir, subRel);
        if (entry.isDirectory()) {
          walk(fullSrc);
        } else if (entry.isFile()) {
          pairs.push({
            src: path.relative(rootDir, fullSrc).replace(/\\/g, '/'),
            dest: targetRel.replace(/\\/g, '/')
          });
        }
      }
    }
    walk(srcAbs);
  }

  // 1. private/app -> app/
  addDirPairs('private/app', 'app');

  // 2. private/portal -> portal/
  addDirPairs('private/portal', 'portal');

  // 3. public HTML files -> root HTML files
  const publicEntries = fs.readdirSync(path.join(rootDir, 'public'), { withFileTypes: true });
  for (const entry of publicEntries) {
    if (entry.isFile() && entry.name.endsWith('.html')) {
      pairs.push({
        src: `public/${entry.name}`,
        dest: entry.name
      });
    }
  }

  // 4. public/fonts -> public/assets/fonts AND root fonts/ (ensures /fonts/* works on Cloudflare)
  addDirPairs('public/fonts', 'public/assets/fonts');
  addDirPairs('public/fonts', 'fonts');

  return pairs;
}

function runSync() {
  console.log('================================================================');
  console.log('  Havilah Static Asset Mirror & Root Sync');
  console.log(`  Mode: ${isDryRun ? 'DRY RUN (no files modified)' : 'WRITE & VERIFY'}`);
  console.log('================================================================\n');

  const pairs = getSyncPairs();
  console.log(`Discovered ${pairs.length} sync mappings.\n`);

  let writeCount = 0;
  let skippedCount = 0;

  console.log('--- SYNC PLAN (DRY-RUN LIST) ---');
  for (const pair of pairs) {
    const srcAbs = path.join(rootDir, pair.src);
    const destAbs = path.join(rootDir, pair.dest);

    if (!fs.existsSync(srcAbs)) {
      console.warn(`[WARN] Source file missing: ${pair.src}`);
      continue;
    }

    const srcHash = sha256(srcAbs);
    const destHash = sha256(destAbs);

    if (srcHash === destHash) {
      console.log(`  [IN SYNC]  ${pair.src} == ${pair.dest}`);
      skippedCount++;
    } else {
      console.log(`  [COPY]     ${pair.src} -> ${pair.dest}`);
      writeCount++;
      if (!isDryRun) {
        ensureDir(path.dirname(destAbs));
        fs.copyFileSync(srcAbs, destAbs);
      }
    }
  }

  console.log('\n--- VERIFICATION DIFF CHECK ---');
  let diffErrors = 0;
  for (const pair of pairs) {
    const srcAbs = path.join(rootDir, pair.src);
    const destAbs = path.join(rootDir, pair.dest);

    if (!fs.existsSync(srcAbs)) continue;

    if (!isDryRun) {
      const srcHash = sha256(srcAbs);
      const destHash = sha256(destAbs);
      if (srcHash !== destHash) {
        console.error(`  [FAIL] Checksum mismatch: ${pair.src} vs ${pair.dest}`);
        diffErrors++;
      }
    }
  }

  if (diffErrors > 0) {
    console.error(`\nSync verification failed with ${diffErrors} errors.`);
    process.exit(1);
  }

  console.log(`\nVerification successful. ${writeCount} written, ${skippedCount} already in sync.`);
}

if (require.main === module) {
  runSync();
}

module.exports = { runSync, getSyncPairs };
