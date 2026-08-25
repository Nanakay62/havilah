/**
 * Cloudflare Pages Function: Dynamic API Reverse Proxy
 * Intercepts all requests matching /api/* and proxies them to the backend API.
 * Supports environment variable overrides for custom backend URLs.
 */
export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Read backend URL from environment or default to Render production backend
  const backendBase = (env && env.BACKEND_API_URL) 
    ? env.BACKEND_API_URL.replace(/\/$/, '') 
    : 'https://havilah-api.onrender.com';

  const targetUrl = `${backendBase}${url.pathname}${url.search}`;

  // Forward incoming headers, attaching real client IP and host
  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Host', url.hostname);
  headers.set('X-Forwarded-Proto', 'https');
  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) {
    headers.set('X-Forwarded-For', clientIp);
  }

  // Determine if request method allows a body
  const method = request.method.toUpperCase();
  const hasBody = !['GET', 'HEAD'].includes(method);

  try {
    const response = await fetch(targetUrl, {
      method: method,
      headers: headers,
      body: hasBody ? request.body : null,
      redirect: 'follow'
    });

    // Build response with CORS and security headers preserved
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', url.origin);
    responseHeaders.set('Access-Control-Allow-Credentials', 'true');
    responseHeaders.set('Vary', 'Origin, Accept-Encoding');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response(JSON.stringify({
      success: false,
      error: 'GATEWAY_CONNECTION_ERROR',
      message: `Failed to connect to backend service (${backendBase}): ${err.message}`
    }), {
      status: 502,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    });
  }
}
