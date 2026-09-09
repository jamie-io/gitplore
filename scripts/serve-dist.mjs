/**
 * Serves the production build for the E2E suite, with the SPA fallback our nginx config uses
 * (`try_files $uri /index.html`, IMPLEMENTATION_PLAN.md §9).
 *
 * The dev server compiles lazy routes on demand and re-optimises dependencies when it first meets
 * them, which made the first request under several Playwright workers unreliable. Serving what
 * actually ships is both steadier and more honest.
 */
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `DIST_ROOT` lets a second instance serve a copy (e.g. for Lighthouse) while e2e rebuilds dist. */
const ROOT = process.env.DIST_ROOT
  ? process.env.DIST_ROOT.replace(/\/?$/, '/')
  : fileURLToPath(new URL('../dist/gitplore/browser/', import.meta.url));
const PORT = Number(process.env.PORT ?? 4173);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.md': 'text/markdown; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.glb': 'model/gltf-binary',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/** Static files answer 404 when missing, as Pages and nginx would; only routes fall back. */
const STATIC_PREFIXES = ['/assets/', '/content/'];

async function resolve(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(ROOT, safe);
  if (candidate.startsWith(ROOT)) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) {
      return { file: candidate, status: 200 };
    }
  }
  if (STATIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return { file: null, status: 404 };
  }
  return { file: join(ROOT, 'index.html'), status: 200 };
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const { file, status } = await resolve(pathname);
  if (!file) {
    response.writeHead(status, { 'content-type': 'text/plain' });
    response.end('not found');
    return;
  }
  response.writeHead(status, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
