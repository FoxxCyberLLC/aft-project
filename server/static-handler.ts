// Static file handler

import * as path from 'node:path';
import { applySecurityHeaders } from '../lib/security';

const ALLOWED_LIB_EXTENSIONS = new Set(['.js', '.css', '.map']);
const ALLOWED_STATIC_EXTENSIONS = new Set([
  '.css',
  '.js',
  '.map',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.ico',
  '.webp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.txt',
  '.json',
]);

const STATIC_ROOT = path.resolve('./static');
const PUBLIC_LIB_ROOT = path.resolve('./public/lib');

// Resolve a request path relative to a fixed root and refuse anything that
// escapes that root via traversal (../ etc) or symlink shenanigans.
function safeResolve(root: string, requestSubpath: string): string | null {
  // Strip a leading slash so path.join treats it as relative.
  const relative = requestSubpath.replace(/^\/+/, '');
  if (!relative) return null;
  // path.normalize collapses .. so we need to check the final absolute path
  // is still inside `root`.
  const absolute = path.resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + path.sep)) {
    return null;
  }
  return absolute;
}

function contentTypeFor(p: string): string {
  const ext = path.extname(p).toLowerCase();
  switch (ext) {
    case '.css':
      return 'text/css';
    case '.js':
      return 'application/javascript';
    case '.json':
      return 'application/json';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.gif':
      return 'image/gif';
    case '.ico':
      return 'image/x-icon';
    case '.webp':
      return 'image/webp';
    case '.woff':
      return 'font/woff';
    case '.woff2':
      return 'font/woff2';
    case '.ttf':
      return 'font/ttf';
    case '.otf':
      return 'font/otf';
    default:
      return 'application/octet-stream';
  }
}

export async function handleStaticFiles(reqPath: string): Promise<Response | null> {
  // Serve CSS files
  if (reqPath === '/globals.css') {
    const file = Bun.file('./globals.css');
    if (await file.exists()) {
      return applySecurityHeaders(
        new Response(file, {
          headers: { 'Content-Type': 'text/css' },
        }),
      );
    }
  }

  // Serve static directory files
  if (reqPath.startsWith('/static/')) {
    const subpath = reqPath.slice('/static/'.length);
    const ext = path.extname(subpath).toLowerCase();
    if (!ALLOWED_STATIC_EXTENSIONS.has(ext)) {
      return new Response('Forbidden', { status: 403 });
    }
    const absolute = safeResolve(STATIC_ROOT, subpath);
    if (!absolute) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(absolute);
    if (await file.exists()) {
      return applySecurityHeaders(
        new Response(file, {
          headers: { 'Content-Type': contentTypeFor(absolute) },
        }),
      );
    }
    return new Response('File not found', { status: 404 });
  }

  // Serve public lib files (for CAC Web Crypto)
  if (reqPath.startsWith('/lib/')) {
    const subpath = reqPath.slice('/lib/'.length);
    const ext = path.extname(subpath).toLowerCase();
    if (!ALLOWED_LIB_EXTENSIONS.has(ext)) {
      return new Response('Forbidden', { status: 403 });
    }
    const absolute = safeResolve(PUBLIC_LIB_ROOT, subpath);
    if (!absolute) return new Response('Forbidden', { status: 403 });
    const file = Bun.file(absolute);
    if (await file.exists()) {
      return applySecurityHeaders(
        new Response(file, {
          headers: { 'Content-Type': contentTypeFor(absolute) },
        }),
      );
    }
    return new Response('File not found', { status: 404 });
  }

  return null;
}
