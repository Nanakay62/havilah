'use strict';

require('./testConfig');
const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../server');

const ROOT_DIR = path.resolve(__dirname, '../..');

describe('Technical & On-Page SEO Verification', () => {
  describe('Express origin SEO routes & X-Robots-Tag headers', () => {
    it('serves /robots.txt, /sitemap.xml, /site.webmanifest, /favicon.ico, and clean public pages', async () => {
      const robotsRes = await request(app).get('/robots.txt');
      expect(robotsRes.status).toBe(200);
      expect(robotsRes.headers['content-type']).toContain('text/plain');
      expect(robotsRes.text).toContain('Allow: /');
      expect(robotsRes.text).toContain('Disallow: /api/');
      expect(robotsRes.text).toContain('Disallow: /dashboard');
      expect(robotsRes.text).toMatch(/Sitemap:\s+https?:\/\/.+\/sitemap\.xml/);

      const sitemapRes = await request(app).get('/sitemap.xml');
      expect(sitemapRes.status).toBe(200);
      expect(sitemapRes.headers['content-type']).toContain('xml');
      expect(sitemapRes.text).toContain('<urlset');
      expect(sitemapRes.text).toContain('/privacy</loc>');
      expect(sitemapRes.text).toContain('/terms</loc>');
      expect(sitemapRes.text).toContain('/login</loc>');
      expect(sitemapRes.text).toContain('/register</loc>');

      const manifestRes = await request(app).get('/site.webmanifest');
      expect(manifestRes.status).toBe(200);
      const parsedManifest = JSON.parse(manifestRes.text);
      expect(parsedManifest.name).toBe('Havilah Workplace Wellbeing');
      expect(parsedManifest.icons[0].src).toBe('/assets/havilah-mark.svg');

      const favRes = await request(app).get('/favicon.ico');
      expect(favRes.status).toBe(200);
      expect(favRes.headers['content-type']).toContain('image/svg+xml');

      for (const pubPath of ['/', '/privacy', '/terms', '/login', '/register']) {
        const res = await request(app).get(pubPath);
        expect(res.status).toBe(200);
        expect(res.headers['x-robots-tag']).toBeUndefined();
      }
    });

    it('emits X-Robots-Tag: noindex, nofollow on private portals and API endpoints', async () => {
      const apiRes = await request(app).get('/api/v1/health');
      expect(apiRes.headers['x-robots-tag']).toBe('noindex, nofollow');

      for (const privPath of ['/dashboard', '/hr', '/superadmin', '/clinical-portal']) {
        const res = await request(app).get(privPath);
        expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      }
    });
  });

  describe('Cloudflare Worker (src/index.js) dynamic SEO & edge routing', () => {
    it('generates origin-aware robots.txt & sitemap.xml for both *.workers.dev and future custom domains', async () => {
      const workerMod = await import('../../src/index.js');
      const worker = workerMod.default;

      // 1. Live workers.dev origin
      const robotsWorkers = await worker.fetch(
        new Request('https://havilah.dic20016.workers.dev/robots.txt'),
        {},
        {}
      );
      expect(robotsWorkers.status).toBe(200);
      expect(await robotsWorkers.text()).toContain(
        'Sitemap: https://havilah.dic20016.workers.dev/sitemap.xml'
      );

      // 2. Future custom domain origin without code changes
      const sitemapCustom = await worker.fetch(
        new Request('https://havilahhealth.com/sitemap.xml'),
        {},
        {}
      );
      expect(sitemapCustom.status).toBe(200);
      const xml = await sitemapCustom.text();
      expect(xml).toContain('<loc>https://havilahhealth.com/</loc>');
      expect(xml).toContain('<loc>https://havilahhealth.com/privacy</loc>');

      // 3. Duplicate /public/*.html redirect to canonical clean path
      const dupRes = await worker.fetch(
        new Request('https://havilah.dic20016.workers.dev/public/privacy.html'),
        {},
        {}
      );
      expect(dupRes.status).toBe(301);
      expect(dupRes.headers.get('location')).toBe('https://havilah.dic20016.workers.dev/privacy');

      // 4. Non-public path gets X-Robots-Tag and non-canonical workers.dev gets noindex once PUBLIC_ORIGIN is set
      const mockAssetsEnv = {
        ASSETS: {
          fetch: async () =>
            new Response('<!doctype html><html><head><title>App</title></head><body></body></html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' },
            }),
        },
      };
      const dashRes = await worker.fetch(
        new Request('https://havilah.dic20016.workers.dev/dashboard'),
        mockAssetsEnv,
        {}
      );
      expect(dashRes.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');

      const workersWithCustomPublic = await worker.fetch(
        new Request('https://havilah.dic20016.workers.dev/'),
        { ...mockAssetsEnv, PUBLIC_ORIGIN: 'https://havilahhealth.com' },
        {}
      );
      expect(workersWithCustomPublic.headers.get('X-Robots-Tag')).toBe('noindex, nofollow');

      const customPrimary = await worker.fetch(
        new Request('https://havilahhealth.com/'),
        { ...mockAssetsEnv, PUBLIC_ORIGIN: 'https://havilahhealth.com' },
        {}
      );
      expect(customPrimary.headers.get('X-Robots-Tag')).toBeNull();
    });
  });

  describe('HTML metadata, JSON-LD structured data & mirror parity', () => {
    it('maintains byte-identical parity across all public/private/SEO mirrors', () => {
      const pairs = [
        ['index.html', 'public/index.html'],
        ['privacy.html', 'public/privacy.html'],
        ['terms.html', 'public/terms.html'],
        ['login.html', 'public/login.html'],
        ['register.html', 'public/register.html'],
        ['activate.html', 'public/activate.html'],
        ['reset-password.html', 'public/reset-password.html'],
        ['clinical-portal.html', 'public/clinical-portal.html'],
        ['app/dashboard.html', 'private/app/dashboard.html'],
        ['app/superadmin.html', 'private/app/superadmin.html'],
        ['portal/hr.html', 'private/portal/hr.html'],
        ['robots.txt', 'public/robots.txt'],
        ['sitemap.xml', 'public/sitemap.xml'],
        ['site.webmanifest', 'public/site.webmanifest'],
      ];
      for (const [a, b] of pairs) {
        const contentA = fs.readFileSync(path.join(ROOT_DIR, a), 'utf8');
        const contentB = fs.readFileSync(path.join(ROOT_DIR, b), 'utf8');
        expect(contentA).toBe(contentB);
      }
    });

    it('includes complete meta tags, social cards, JSON-LD, and crawlable footer links on index.html', () => {
      const html = fs.readFileSync(path.join(ROOT_DIR, 'index.html'), 'utf8');
      expect(html).toContain('<link rel="canonical" href="https://havilah.dic20016.workers.dev/">');
      expect(html).toContain('meta name="robots" content="index, follow');
      expect(html).toContain('<link rel="icon" type="image/svg+xml" href="/assets/havilah-mark.svg">');
      expect(html).toContain('<meta property="og:image" content="https://havilah.dic20016.workers.dev/assets/hero-hr-analytics.png">');
      expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
      expect(html).toContain('href="/privacy"');
      expect(html).toContain('href="/terms"');

      const ldMatch = html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/i);
      expect(ldMatch).toBeTruthy();
      const jsonLd = JSON.parse(ldMatch[1]);
      expect(Array.isArray(jsonLd['@graph'])).toBe(true);
      const types = jsonLd['@graph'].map((node) => node['@type']);
      expect(types).toContain('Organization');
      expect(types).toContain('WebSite');
      expect(types).toContain('SoftwareApplication');
      expect(types).toContain('FAQPage');
      const faqNode = jsonLd['@graph'].find((n) => n['@type'] === 'FAQPage');
      expect(faqNode.mainEntity).toHaveLength(5);
    });

    it('sets index/canonical tags on public subpages and noindex/nofollow on all private/utility pages', () => {
      const publicSubpages = [
        { file: 'privacy.html', canonical: '/privacy' },
        { file: 'terms.html', canonical: '/terms' },
        { file: 'login.html', canonical: '/login' },
        { file: 'register.html', canonical: '/register' },
      ];
      for (const { file, canonical } of publicSubpages) {
        const html = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
        expect(html).toContain(`href="https://havilah.dic20016.workers.dev${canonical}"`);
        expect(html).toContain('meta name="robots" content="index, follow"');
        expect(html).toContain('meta name="description"');
        expect(html).toContain('/assets/havilah-mark.svg');
      }

      const privatePages = [
        'activate.html',
        'reset-password.html',
        'clinical-portal.html',
        'app/dashboard.html',
        'app/superadmin.html',
        'portal/hr.html',
        'app.html',
        'admin.html',
      ];
      for (const file of privatePages) {
        const html = fs.readFileSync(path.join(ROOT_DIR, file), 'utf8');
        expect(html).toContain('meta name="robots" content="noindex, nofollow"');
      }
    });
  });
});
