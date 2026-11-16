/**
 * sync-catalog.mjs — chép danh mục sản phẩm sang bản tĩnh cho chế độ demo.
 *
 *   node tools/sync-catalog.mjs
 *
 * Nguồn: server/data/products.json
 * Đích:  app/data/catalog.json   (front-end đọc khi không có /api/v1)
 *
 * Netlify chạy script này ở bước build, nên sửa products.json rồi deploy là đủ.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'server', 'data', 'products.json');
const dest = path.join(root, 'app', 'data', 'catalog.json');

const raw = await fs.readFile(src, 'utf8');
const products = JSON.parse(raw);

if (!Array.isArray(products)) {
  console.error('products.json phải là một mảng.');
  process.exit(1);
}

await fs.mkdir(path.dirname(dest), { recursive: true });
await fs.writeFile(dest, JSON.stringify(products));

const kb = (Buffer.byteLength(JSON.stringify(products)) / 1024).toFixed(1);
const variants = products.reduce((n, p) => n + (p.variants ? p.variants.length : 0), 0);
console.log(`catalog.json ← ${products.length} sản phẩm, ${variants} gói (${kb} KB)`);
