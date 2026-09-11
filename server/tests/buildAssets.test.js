'use strict';

const fs = require('fs');
const path = require('path');
const { buildAssets } = require('../scripts/buildAssets');

describe('Production Asset Pipeline & SRI Manifest Verification (Stage 4 Gate)', () => {
  const manifestPath = path.join(__dirname, '../dist/asset-manifest.json');

  it('executes buildAssets and writes asset-manifest.json', () => {
    buildAssets();
    expect(fs.existsSync(manifestPath)).toBe(true);
  });

  it('verifies manifest contains valid metadata and asset hashes', () => {
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const manifest = JSON.parse(raw);

    expect(manifest).toHaveProperty('buildTimestamp');
    expect(manifest).toHaveProperty('version');
    expect(manifest.totalFiles).toBeGreaterThan(0);
    expect(manifest.totalBytes).toBeGreaterThan(0);
    expect(manifest.hygieneChecks.passed).toBe(true);

    // Verify key production assets are cataloged with sha256 and SRI strings
    expect(manifest.assets).toHaveProperty('public/register.html');
    expect(manifest.assets['public/register.html'].sri).toMatch(/^sha256-[A-Za-z0-9+/=]+$/);
    expect(manifest.assets['public/register.html'].sha256).toMatch(/^[a-f0-9]{64}$/);
  });
});
