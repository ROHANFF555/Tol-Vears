// Tiny static file server for ToolsHub's production build, used to test this MCP server
// locally without touching the live deployment.
//
//   node scripts/static-server.mjs                      # serve ../dist on :4173 WITH SPA rewrites
//   node scripts/static-server.mjs --dir /path/to/dist  # explicit build directory
//   node scripts/static-server.mjs --no-rewrite         # emulate a static host that is MISSING
//                                                       # SPA rewrite rules (deep links 404) — this
//                                                       # reproduces the real production bug so
//                                                       # check_all_routes can be seen catching it.
//   node scripts/static-server.mjs --port 5005
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');

const argv = process.argv.slice(2);
const getFlag = (name) => {
  const i = argv.indexOf(`--${name}`);
  if (i === -1) return undefined;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : 'true';
};

const DIR = path.resolve(getFlag('dir') || path.join(ROOT, '..', 'dist'));
const PORT = Number(getFlag('port') || 4173);
const HOST = getFlag('host') || '0.0.0.0';
const SPA_REWRITE = getFlag('no-rewrite') === undefined;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

if (!fs.existsSync(path.join(DIR, 'index.html'))) {
  console.error(`✗ No index.html in ${DIR}`);
  console.error('  Build the site first:  (cd .. && npm install && npm run build)');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  let filePath = path.join(DIR, urlPath);

  // Never escape the served directory.
  if (!filePath.startsWith(DIR)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  const send = (file, status = 200) => {
    res.writeHead(status, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    fs.createReadStream(file).pipe(res);
  };

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    send(filePath);
    return;
  }

  // Every static host serves index.html for the site root and for directories, rewrite rules
  // or not -- only *deep* paths are affected by missing SPA rewrites.
  const isRootOrDir = urlPath === '/' || (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory());
  if (isRootOrDir) {
    send(path.join(DIR, 'index.html'));
    return;
  }

  if (SPA_REWRITE) {
    send(path.join(DIR, 'index.html')); // React Router decides what to render
    return;
  }

  // Emulating a static host without rewrite rules: real 404 page for anything but an asset.
  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not Found\n');
});

server.listen(PORT, HOST, () => {
  console.log(`Serving ${DIR}`);
  console.log(`  → http://localhost:${PORT}/   (SPA rewrite rules: ${SPA_REWRITE ? 'ON' : 'OFF'})`);
});
