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

const ROOT = fileURLToPath(new URL('../dist/gitplore/browser/', import.meta.url));
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

async function resolve(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const candidate = join(ROOT, safe);
  if (candidate.startsWith(ROOT)) {
    const info = await stat(candidate).catch(() => null);
    if (info?.isFile()) {
      return candidate;
    }
  }
  return join(ROOT, 'index.html');
}

createServer(async (request, response) => {
  const { pathname } = new URL(request.url ?? '/', 'http://localhost');
  const file = await resolve(pathname);
  response.writeHead(200, {
    'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  createReadStream(file).pipe(response);
}).listen(PORT, () => console.log(`serving ${ROOT} on http://localhost:${PORT}`));
