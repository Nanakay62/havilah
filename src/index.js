/**
 * Cloudflare Worker: Havilah Full-Stack Edge Proxy & Static Asset Server
 * Intercepts /api/* requests (including POST/PUT/PATCH/DELETE) and proxies them to the backend API.
 * Serves dynamic SEO endpoints (/robots.txt, /sitemap.xml), rewrites canonical/OG origins,
 * applies X-Robots-Tag noindex headers on private/API routes, and delegates static assets.
 */
const DEFAULT_SITE_ORIGIN = 'https://havilah.dic20016.workers.dev';
const SITEMAP_LASTMOD = '2026-11-17';

const DUPLICATE_PUBLIC_REDIRECTS = {
  '/public/index.html': '/',
  '/public/privacy.html': '/privacy',
  '/public/terms.html': '/terms',
  '/public/login.html': '/login',
  '/public/register.html': '/register',
};

const NOINDEX_EXACT_PATHS = new Set([
  '/dashboard',
  '/dashboard.html',
  '/hr',
  '/hr.html',
  '/superadmin',
  '/superadmin.html',
  '/clinical',
  '/clinical-portal',
  '/clinical-portal.html',
  '/activate',
  '/activate.html',
  '/reset-password',
  '/reset-password.html',
  '/app.html',
  '/admin.html',
]);

const NOINDEX_PREFIXES = ['/api/', '/app/', '/portal/', '/private/', '/verify'];

function getCanonicalOrigin(requestUrl, env) {
  const raw = (env && env.PUBLIC_ORIGIN) ? env.PUBLIC_ORIGIN : requestUrl.origin;
  return String(raw || DEFAULT_SITE_ORIGIN).replace(/\/$/, '');
}

function isNoIndexPath(pathname) {
  const normalized = (pathname || '/').toLowerCase();
  if (NOINDEX_EXACT_PATHS.has(normalized)) return true;
  return NOINDEX_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

function getDuplicatePublicRedirect(pathname, canonicalOrigin) {
  const target = DUPLICATE_PUBLIC_REDIRECTS[pathname];
  if (!target) return null;
  return `${canonicalOrigin}${target}`;
}

function buildRobotsTxt(canonicalOrigin) {
  return [
    'User-agent: *',
    'Allow: /',
    'Allow: /privacy',
    'Allow: /terms',
    'Allow: /login',
    'Allow: /register',
    'Allow: /assets/',
    'Allow: /css/',
    'Allow: /js/',
    'Allow: /site.webmanifest',
    'Disallow: /api/',
    'Disallow: /app/',
    'Disallow: /portal/',
    'Disallow: /private/',
    'Disallow: /dashboard',
    'Disallow: /hr',
    'Disallow: /superadmin',
    'Disallow: /clinical',
    'Disallow: /clinical-portal',
    'Disallow: /activate',
    'Disallow: /reset-password',
    'Disallow: /verify',
    '',
    `Sitemap: ${canonicalOrigin}/sitemap.xml`,
    '',
  ].join('\n');
}

function buildSitemapXml(canonicalOrigin) {
  const entries = [
    { path: '/', changefreq: 'weekly', priority: '1.0' },
    { path: '/privacy', changefreq: 'monthly', priority: '0.6' },
    { path: '/terms', changefreq: 'monthly', priority: '0.6' },
    { path: '/login', changefreq: 'monthly', priority: '0.5' },
    { path: '/register', changefreq: 'monthly', priority: '0.5' },
  ];
  const urlNodes = entries.map(
    (e) =>
      `  <url>\n` +
      `    <loc>${canonicalOrigin}${e.path}</loc>\n` +
      `    <lastmod>${SITEMAP_LASTMOD}</lastmod>\n` +
      `    <changefreq>${e.changefreq}</changefreq>\n` +
      `    <priority>${e.priority}</priority>\n` +
      `  </url>`
  );
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    `${urlNodes.join('\n')}\n` +
    `</urlset>\n`
  );
}

function escapeHtmlAttr(val) {
  return String(val || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export {
  DEFAULT_SITE_ORIGIN,
  getCanonicalOrigin,
  isNoIndexPath,
  getDuplicatePublicRedirect,
  buildRobotsTxt,
  buildSitemapXml,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const canonicalOrigin = getCanonicalOrigin(url, env);
    const isNonCanonicalHost = Boolean(
      env && env.PUBLIC_ORIGIN && url.origin !== canonicalOrigin
    );

    // Handle all API routes by proxying to the Node.js / Render backend
    if (url.pathname.startsWith('/api/')) {
      const backendBase = (env && env.BACKEND_API_URL) 
        ? env.BACKEND_API_URL.replace(/\/$/, '') 
        : 'https://havilah-api.onrender.com';

      const targetUrl = `${backendBase}${url.pathname}${url.search}`;

      // Handle CORS preflight OPTIONS requests directly at the edge
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': url.origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || 'Content-Type, Authorization, X-Requested-With',
            'Access-Control-Allow-Credentials': 'true',
            'Access-Control-Max-Age': '86400',
          }
        });
      }

      // Clone and modify incoming headers
      const headers = new Headers(request.headers);
      headers.set('X-Forwarded-Host', url.hostname);
      headers.set('X-Forwarded-Proto', 'https');
      const clientIp = request.headers.get('CF-Connecting-IP');
      if (clientIp) {
        headers.set('X-Real-Client-IP', clientIp);
        headers.set('X-Forwarded-For', clientIp);
      } else {
        headers.delete('X-Real-Client-IP');
      }
      if (env && env.WORKER_PROXY_SECRET) {
        headers.set('X-Worker-Secret', env.WORKER_PROXY_SECRET);
      } else {
        headers.delete('X-Worker-Secret');
      }

      const method = request.method.toUpperCase();
      const hasBody = !['GET', 'HEAD'].includes(method);

      try {
        const response = await fetch(targetUrl, {
          method: method,
          headers: headers,
          body: hasBody ? request.body : null,
          redirect: 'follow',
        });

        // Clone response headers and attach CORS credentials
        const newHeaders = new Headers(response.headers);
        newHeaders.set('Access-Control-Allow-Origin', url.origin);
        newHeaders.set('Access-Control-Allow-Credentials', 'true');
        newHeaders.set('Vary', 'Origin, Accept-Encoding');
        newHeaders.set('X-Robots-Tag', 'noindex, nofollow');

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: newHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({
          success: false,
          error: 'GATEWAY_ERROR',
          message: `Failed to connect to backend (${backendBase}): ${err.message}`
        }), {
          status: 502,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store'
          }
        });
      }
    }

    // Static Route Mapping, Dynamic SEO Endpoints & Rewrites
    const path = url.pathname;

    if (path === '/robots.txt') {
      return new Response(buildRobotsTxt(canonicalOrigin), {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    if (path === '/sitemap.xml') {
      return new Response(buildSitemapXml(canonicalOrigin), {
        status: 200,
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=3600',
        },
      });
    }

    const dupRedirect = getDuplicatePublicRedirect(path, canonicalOrigin);
    if (dupRedirect) {
      return Response.redirect(dupRedirect, 301);
    }

    let targetPath = path;

    if (path === '/dashboard' || path === '/dashboard.html') {
      targetPath = '/app/dashboard';
    } else if (path === '/hr' || path === '/hr.html') {
      targetPath = '/portal/hr';
    } else if (path === '/superadmin' || path === '/superadmin.html') {
      targetPath = '/app/superadmin';
    } else if (path === '/portal/clinical' || path === '/portal/clinical.html' || path === '/clinical' || path === '/clinical-portal') {
      targetPath = '/clinical-portal';
    } else if (path === '/verify' || path.startsWith('/verify/')) {
      targetPath = '/public/verify';
    } else if (path === '/favicon.ico') {
      targetPath = '/public/assets/havilah-mark.svg';
    } else if (path.startsWith('/js/')) {
      targetPath = '/public' + path;
    } else if (path.startsWith('/css/')) {
      targetPath = '/public' + path;
    } else if (path.startsWith('/assets/')) {
      targetPath = '/public' + path;
    }

    // Delegate to Cloudflare Static Assets
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      let assetRequest = request;
      if (targetPath !== path) {
        const rewrittenUrl = new URL(request.url);
        rewrittenUrl.pathname = targetPath;
        assetRequest = new Request(rewrittenUrl.toString(), request);
      }

      const response = await env.ASSETS.fetch(assetRequest);

      // Prevent aggressive caching on HTML and JS so updates deploy instantly
      const headers = new Headers(response.headers);
      if (path.endsWith('.html') || path === '/' || !path.includes('.')) {
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        headers.set('Pragma', 'no-cache');
      } else if (path.endsWith('.js') || path.endsWith('.css')) {
        headers.set('Cache-Control', 'public, max-age=120, must-revalidate');
      } else if (path === '/site.webmanifest') {
        headers.set('Content-Type', 'application/manifest+json; charset=utf-8');
        headers.set('Cache-Control', 'public, max-age=3600');
      }

      if (isNoIndexPath(path) || isNonCanonicalHost) {
        headers.set('X-Robots-Tag', 'noindex, nofollow');
      }

      const contentType = headers.get('content-type') || '';
      const backendBase = (env && env.BACKEND_API_URL)
        ? env.BACKEND_API_URL.replace(/\/$/, '')
        : 'https://havilah-api.onrender.com';

      if (response.status === 200 && contentType.includes('text/html') && typeof HTMLRewriter !== 'undefined') {
        headers.delete('Content-Length');
        const htmlResponse = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
        const gscVerification = (env && env.GOOGLE_SITE_VERIFICATION)
          ? `<meta name="google-site-verification" content="${escapeHtmlAttr(env.GOOGLE_SITE_VERIFICATION)}">`
          : '';
        const apiShim = `<script>(function(){var B=${JSON.stringify(backendBase)};window.__HAVILAH_BACKEND_URL__=B;var F=window.fetch;if(!F)return;window.fetch=function(u,o){if(typeof u==='string'&&u.startsWith('/api/')){u=B+u;}else if(typeof URL!=='undefined'&&u instanceof URL&&u.origin===location.origin&&u.pathname.startsWith('/api/')){u=new URL(B+u.pathname+u.search);}else if(typeof Request!=='undefined'&&u instanceof Request){var p=new URL(u.url,location.origin);if(p.origin===location.origin&&p.pathname.startsWith('/api/')){u=new Request(B+p.pathname+p.search,u);}}return F.call(this,u,o);};})();</script>`;
        let ldJsonBuf = '';
        return new HTMLRewriter()
          .on('head', {
            element(el) {
              el.prepend(apiShim + gscVerification, { html: true });
            },
          })
          .on('link[rel="canonical"]', {
            element(el) {
              const href = el.getAttribute('href');
              if (href && href.startsWith(DEFAULT_SITE_ORIGIN)) {
                el.setAttribute('href', canonicalOrigin + href.slice(DEFAULT_SITE_ORIGIN.length));
              }
            },
          })
          .on('meta[property="og:url"], meta[property="og:image"], meta[name="twitter:image"]', {
            element(el) {
              const content = el.getAttribute('content');
              if (content && content.startsWith(DEFAULT_SITE_ORIGIN)) {
                el.setAttribute('content', canonicalOrigin + content.slice(DEFAULT_SITE_ORIGIN.length));
              }
            },
          })
          .on('script[type="application/ld+json"]', {
            text(chunk) {
              ldJsonBuf += chunk.text;
              if (chunk.lastInTextNode) {
                chunk.replace(ldJsonBuf.split(DEFAULT_SITE_ORIGIN).join(canonicalOrigin));
                ldJsonBuf = '';
              } else {
                chunk.remove();
              }
            },
          })
          .transform(htmlResponse);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    }

    return new Response('Not Found', { status: 404 });
  },
};
