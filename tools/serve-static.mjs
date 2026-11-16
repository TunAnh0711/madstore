/**
 * serve-static.mjs — xem trước bản deploy tĩnh (giống Netlify) ngay trên máy.
 *
 *   node tools/serve-static.mjs            # http://localhost:4330
 *   PORT=5000 node tools/serve-static.mjs
 *
 * Chỉ phục vụ thư mục app/ + áp đúng các rewrite trong netlify.toml.
 * KHÔNG có /api/v1 → front-end tự chuyển sang chế độ demo.
 */

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(__dirname, '..', 'app');
const PORT = Number(process.env.PORT || 4330);

const CLEAN = {
  '/': 'index.html',
  '/products': 'products.html',
  '/cart': 'cart.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/account': 'account.html',
  '/wallet': 'wallet.html',
  '/orders': 'orders.html',
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);

  let rel = CLEAN[pathname];
  if (!rel && /^\/products\/[\w-]+\/?$/.test(pathname)) rel = 'product.html';
  if (!rel) rel = pathname.replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel = path.join(rel, 'index.html');

  const file = path.resolve(APP_DIR, rel);
  if (!file.startsWith(APP_DIR)) return notFound(res);

  try {
    const data = await fs.readFile(file);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  } catch {
    notFound(res);
  }
});

async function notFound(res) {
  try {
    const data = await fs.readFile(path.join(APP_DIR, '404.html'));
    res.writeHead(404, { 'Content-Type': MIME['.html'], 'Content-Length': data.length });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404');
  }
}

server.listen(PORT, () => {
  console.log(`\n  Bản tĩnh (demo UI):  http://localhost:${PORT}`);
  console.log('  Không có /api/v1 → front-end chạy ở chế độ demo.\n');
});
