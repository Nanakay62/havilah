'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * Wellframe Production Asset Pipeline & Hygiene Verifier
 * Scans public and private static assets, computes SHA-256 / SRI integrity hashes,
 * verifies script/style hygiene, and compiles a deployment asset manifest.
 */
function buildAssets() {
  console.log('================================================================');
  console.log('  Wellframe Asset Build Pipeline & SRI Integrity Manifest Generator');
  console.log('================================================================\n');

  const rootDir = path.resolve(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');
  const targetDirs = [
    { name: 'public', dir: path.resolve(rootDir, '../public') },
    { name: 'private_app', dir: path.resolve(rootDir, '../private/app') },
    { name: 'private_portal', dir: path.resolve(rootDir, '../private/portal') },
  ];

  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  const manifest = {
    buildTimestamp: new Date().toISOString(),
    version: require('../package.json').version,
    totalFiles: 0,
    totalBytes: 0,
    assets: {},
    hygieneChecks: {
      passed: true,
      htmlFilesChecked: 0,
      scriptsChecked: 0,
      stylesChecked: 0,
      warnings: [],
    },
  };

  /**
   * Recursively scans directory for assets (.html, .js, .css, .svg, .json)
   */
  function scanDir(baseDir, relativePrefix) {
    if (!fs.existsSync(baseDir)) return;

    const entries = fs.readdirSync(baseDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(baseDir, entry.name);
      const relPath = path.join(relativePrefix, entry.name).replace(/\\/g, '/');

      if (entry.isDirectory()) {
        scanDir(fullPath, relPath);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.html', '.js', '.css', '.svg', '.json', '.ico'].includes(ext)) {
          const content = fs.readFileSync(fullPath);
          const hashSha256 = crypto.createHash('sha256').update(content).digest('hex');
          const sri = 'sha256-' + crypto.createHash('sha256').update(content).digest('base64');
          const stat = fs.statSync(fullPath);

          manifest.assets[relPath] = {
            sizeBytes: stat.size,
            sha256: hashSha256,
            sri: sri,
            extension: ext,
            lastModified: stat.mtime.toISOString(),
          };

          manifest.totalFiles += 1;
          manifest.totalBytes += stat.size;

          // Perform HTML hygiene verification
          if (ext === '.html') {
            manifest.hygieneChecks.htmlFilesChecked += 1;
            const text = content.toString('utf8');

            const scriptMatches = text.match(/<script\b[^>]*>/gi) || [];
            const styleMatches = text.match(/<style\b[^>]*>/gi) || [];
            manifest.hygieneChecks.scriptsChecked += scriptMatches.length;
            manifest.hygieneChecks.stylesChecked += styleMatches.length;

            // Check for unsafe patterns or unescaped secrets in templates
            if (text.includes('sk_live_') || text.includes('sk_test_')) {
              manifest.hygieneChecks.warnings.push(`Potential Stripe secret key found in ${relPath}`);
              manifest.hygieneChecks.passed = false;
            }
          }
        }
      }
    }
  }

  for (const target of targetDirs) {
    scanDir(target.dir, target.name);
  }

  const manifestPath = path.join(distDir, 'asset-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  console.log(`[build] Scanned ${manifest.totalFiles} production assets (${(manifest.totalBytes / 1024).toFixed(1)} KB total).`);
  console.log(`[build] Checked ${manifest.hygieneChecks.htmlFilesChecked} HTML templates, ${manifest.hygieneChecks.scriptsChecked} script tags, ${manifest.hygieneChecks.stylesChecked} style blocks.`);
  console.log(`[build] Generated SRI integrity manifest -> ${manifestPath}`);

  if (manifest.hygieneChecks.warnings.length > 0) {
    console.warn('[build] Warnings:', manifest.hygieneChecks.warnings);
    if (!manifest.hygieneChecks.passed) {
      console.error('[build] Asset hygiene checks failed!');
      process.exit(1);
    }
  } else {
    console.log('[build] All asset hygiene checks passed cleanly! [OK]\n');
  }
}

if (require.main === module) {
  buildAssets();
}

module.exports = { buildAssets };
