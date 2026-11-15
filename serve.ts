// RAILHEAD — serve.ts: a tiny static server for play-testing.
//
// Serves game/ on http://localhost:8080 (or $PORT). No build step, no
// dependencies, Node 22 standard library only. Usage:
//
//   node serve.ts
//   # then open http://localhost:8080 in desktop Chrome

import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const GAME_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'game');
const PORT = Number(process.env.PORT ?? 8080);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};

const server = createServer((req, res) => {
  const raw = decodeURIComponent((req.url ?? '/').split('?')[0]);
  const rel = raw === '/' ? 'index.html' : raw.replace(/^\/+/, '');
  const file = join(GAME_DIR, rel);
  const ok = file.startsWith(GAME_DIR) && existsSync(file) && statSync(file).isFile();
  if (!ok) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found\n');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'cache-control': 'no-store',
  });
  res.end(readFileSync(file));
});

server.listen(PORT, () => console.log(`RAILHEAD at http://localhost:${PORT}`));
