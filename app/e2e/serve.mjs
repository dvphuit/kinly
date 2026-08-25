import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createBrotliCompress, createGzip } from 'node:zlib';

const host = '127.0.0.1';
const port = Number(process.env.PORT) || 4173;
const distDir = resolve(fileURLToPath(new URL('../dist/', import.meta.url)));
const indexFile = resolve(distDir, 'index.html');

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.woff2', 'font/woff2'],
]);

const compressibleExtensions = new Set(['.css', '.html', '.js', '.json', '.mjs', '.svg', '.txt', '.webmanifest']);

function resolveRequestFile(requestUrl = '/') {
  const pathname = decodeURIComponent(new URL(requestUrl, `http://${host}:${port}`).pathname);
  const relativePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const candidate = resolve(distDir, relativePath);
  const insideDist = candidate === distDir || candidate.startsWith(`${distDir}${sep}`);
  if (!insideDist) return null;

  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  return indexFile;
}

const server = createServer((request, response) => {
  const file = resolveRequestFile(request.url);
  if (!file || !existsSync(file)) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  const ext = extname(file);
  const contentType = contentTypes.get(ext) ?? 'application/octet-stream';
  const isImmutableAsset = file.includes('/assets/') || file.includes('/fonts/');
  const cacheControl = isImmutableAsset ? 'public, max-age=31536000, immutable' : 'no-cache';
  const headers = {
    'Cache-Control': cacheControl,
    'Content-Type': contentType,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
  };
  const acceptEncoding = request.headers['accept-encoding'] || '';

  if (compressibleExtensions.has(ext) && acceptEncoding.includes('br')) {
    headers['Content-Encoding'] = 'br';
    response.writeHead(200, headers);
    createReadStream(file).pipe(createBrotliCompress()).pipe(response);
  } else if (compressibleExtensions.has(ext) && acceptEncoding.includes('gzip')) {
    headers['Content-Encoding'] = 'gzip';
    response.writeHead(200, headers);
    createReadStream(file).pipe(createGzip()).pipe(response);
  } else {
    response.writeHead(200, headers);
    createReadStream(file).pipe(response);
  }
});

server.listen(port, host, () => {
  console.log(`BabyGrowth E2E server listening at http://${host}:${port}`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
