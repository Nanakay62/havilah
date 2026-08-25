/**
 * Cloudflare Worker: Havilah Full-Stack Edge Proxy & Static Asset Server
 * Intercepts /api/* requests (including POST/PUT/PATCH/DELETE) and proxies them to the backend API.
 * Delegates all other requests to Cloudflare Static Assets.
 */
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

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
        headers.set('X-Forwarded-For', clientIp);
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

    // Static Route Mapping & Rewrites
    const path = url.pathname;
    let targetPath = path;

    if (path === '/app/dashboard' || path === '/dashboard' || path === '/dashboard.html') {
      targetPath = '/app/dashboard.html';
    } else if (path === '/portal/hr' || path === '/hr' || path === '/hr.html') {
      targetPath = '/portal/hr.html';
    } else if (path === '/app/superadmin' || path === '/superadmin' || path === '/superadmin.html') {
      targetPath = '/app/superadmin.html';
    } else if (path === '/portal/clinical' || path === '/portal/clinical.html' || path === '/clinical') {
      targetPath = '/clinical-portal.html';
    } else if (path === '/login') {
      targetPath = '/login.html';
    } else if (path === '/register') {
      targetPath = '/register.html';
    } else if (path === '/activate') {
      targetPath = '/activate.html';
    } else if (path === '/') {
      targetPath = '/index.html';
    }

    // Delegate to Cloudflare Static Assets
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      if (targetPath !== path) {
        const rewrittenUrl = new URL(request.url);
        rewrittenUrl.pathname = targetPath;
        const rewrittenRequest = new Request(rewrittenUrl.toString(), request);
        return env.ASSETS.fetch(rewrittenRequest);
      }
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  },
};
