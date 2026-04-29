// AFT Server - Modular implementation

import { waitForReady, type DbRow } from './lib/database-bun';
import { applySecurityHeaders, initializeSecurity } from './lib/security';
import { handleAPI } from './server/api/index';
import { handleAdminRoutes } from './server/routes/admin-routes';
import { handleApproverRoutes } from './server/routes/approver-routes';
import {
  handleDashboardRoutes,
  handleLoginPage,
  handleLogout,
  handleRoleSelectionPage,
} from './server/routes/auth-routes';
import { handleCPSORoutes } from './server/routes/cpso-routes';
import { handleDTARoutes } from './server/routes/dta-routes';
import { handleMediaCustodianRoutes } from './server/routes/media-custodian-routes';
import { handleRequestorRoutes } from './server/routes/requestor-routes';
import { handleSMERoutes } from './server/routes/sme-routes';
import { handleStaticFiles } from './server/static-handler';

// Wait for the database schema to be ready, then initialize the security module.
await waitForReady();
await initializeSecurity();

// Shared secret nginx must include in X-AFT-Proxy-Secret. When set, the Bun
// server will refuse any request whose header value does not match. This
// prevents an attacker that can reach 127.0.0.1:3001 from spoofing CAC
// headers or otherwise bypassing nginx.
const PROXY_SHARED_SECRET = process.env.AFT_PROXY_SHARED_SECRET || '';
if (!PROXY_SHARED_SECRET) {
  console.warn(
    '⚠️  AFT_PROXY_SHARED_SECRET is not set - skipping reverse-proxy authentication. Do NOT run in production without this.',
  );
}

// Constant-time string comparison to avoid timing oracles on the secret.
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// Headers a client must NEVER be allowed to set themselves. nginx is the only
// component allowed to populate them, and only after verifying the CAC. We
// strip them from any request that did not come from a trusted proxy.
const SENSITIVE_HEADER_NAMES = [
  'x-client-cert-verify',
  'x-client-cert-subject',
  'x-client-cert-issuer',
  'x-client-cert-serial',
  'x-client-cert-fingerprint',
  'x-client-cert-not-before',
  'x-client-cert-not-after',
  'x-client-cert-pem',
];

function sanitizeRequest(request: Request): Request {
  const proxySecret = request.headers.get('x-aft-proxy-secret') || '';
  const trusted = PROXY_SHARED_SECRET ? timingSafeEqual(proxySecret, PROXY_SHARED_SECRET) : true; // No secret configured - dev mode, see warning above.

  // If the request did not come through a trusted proxy, drop any header that
  // claims to carry CAC certificate state. Otherwise, only honour CAC headers
  // when nginx says verification actually succeeded.
  const cleanedHeaders = new Headers(request.headers);
  cleanedHeaders.delete('x-aft-proxy-secret');

  if (!trusted) {
    for (const name of SENSITIVE_HEADER_NAMES) cleanedHeaders.delete(name);
  } else {
    const verify = cleanedHeaders.get('x-client-cert-verify') || '';
    if (verify !== 'SUCCESS') {
      for (const name of SENSITIVE_HEADER_NAMES) cleanedHeaders.delete(name);
    }
  }

  const init: RequestInit = {
    method: request.method,
    headers: cleanedHeaders,
  };
  // GET/HEAD requests must not carry a body when re-cloned through `new
  // Request()`. For other methods we forward the original body. duplex:'half'
  // is required by the Fetch spec when supplying a streaming body.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    (init as DbRow).body = request.body;
    (init as DbRow).duplex = 'half';
  }
  return new Request(request.url, init);
}

// Main server - nginx handles TLS and client certificates
Bun.serve({
  port: 3001,
  hostname: '127.0.0.1', // Loopback only - nginx is the public entry point.

  async fetch(originalRequest: Request, server: any): Promise<Response> {
    // Liveness probe - exempt from the proxy-secret check so it can be hit
    // from inside the container by HEALTHCHECK without needing the secret.
    {
      const probeUrl = new URL(originalRequest.url);
      if (probeUrl.pathname === '/healthz') {
        return new Response('ok', { status: 200, headers: { 'Content-Type': 'text/plain' } });
      }
    }

    // Reject anything that didn't come from a trusted proxy when a secret is
    // configured. We still serve the request when no secret is configured, to
    // allow local development without nginx.
    if (PROXY_SHARED_SECRET) {
      const proxySecret = originalRequest.headers.get('x-aft-proxy-secret') || '';
      if (!timingSafeEqual(proxySecret, PROXY_SHARED_SECRET)) {
        return new Response('Forbidden', { status: 403 });
      }
    }

    const request = sanitizeRequest(originalRequest);
    const url = new URL(request.url);
    const path = url.pathname;
    const ipAddress = server.requestIP(request)?.address ?? 'unknown';

    // Serve static files
    const staticResponse = await handleStaticFiles(path);
    if (staticResponse) {
      return staticResponse;
    }

    // Handle API routes
    if (path.startsWith('/api/')) {
      return applySecurityHeaders(await handleAPI(request, path, ipAddress));
    }

    // Handle page routes
    let response: Response;

    // Handle legacy dashboard routes - redirect to new role-specific routes
    if (path === '/dashboard/approver' || path === '/dashboard/cpso') {
      response = Response.redirect('/approver', 302);
    } else if (path === '/dashboard/dao') {
      // This role is not yet implemented, return appropriate message
      response = new Response('This role dashboard is not yet implemented', { status: 501 });
    } else if (path.startsWith('/sme') || path === '/dashboard/sme') {
      response = await handleSMERoutes(request, path, ipAddress);
    } else if (path === '/dashboard/dta') {
      // Redirect legacy DTA dashboard route to new route
      response = Response.redirect('/dta', 302);
      // Admin routes
    } else if (path.startsWith('/admin')) {
      response = await handleAdminRoutes(request, path, ipAddress);
      // Requestor routes
    } else if (path.startsWith('/requestor')) {
      response = await handleRequestorRoutes(request, path, ipAddress);
      // Approver routes
    } else if (path.startsWith('/approver')) {
      response = await handleApproverRoutes(request, path, ipAddress);
      // Media custodian routes
    } else if (path.startsWith('/media-custodian')) {
      response = await handleMediaCustodianRoutes(request, path, ipAddress);
      // DTA routes
    } else if (path.startsWith('/dta')) {
      response = await handleDTARoutes(request, path, ipAddress);
      // CPSO routes
    } else if (path.startsWith('/cpso')) {
      response = await handleCPSORoutes(request, path, ipAddress);
    } else {
      // Main application routes
      switch (path) {
        case '/':
        case '/login':
          response = await handleLoginPage(request, ipAddress);
          break;
        case '/select-role':
          response = await handleRoleSelectionPage(request, ipAddress);
          break;
        case '/dashboard':
          response = await handleDashboardRoutes(request, ipAddress);
          break;
        case '/logout':
          response = await handleLogout(request);
          break;
        default:
          response = new Response('Page not found', { status: 404 });
      }
    }

    // Apply security headers to all responses
    return applySecurityHeaders(response);
  },
});

console.log('AFT Server listening on http://127.0.0.1:3001 (loopback only)');
console.log('Multi-role authentication enabled - public entry point is nginx (HTTPS + CAC)');
if (!PROXY_SHARED_SECRET) {
  console.log('WARNING: AFT_PROXY_SHARED_SECRET not set - reverse-proxy auth disabled.');
}
