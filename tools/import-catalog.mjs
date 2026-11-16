/**
 * import-catalog.mjs — nhập danh mục từ lumiestore.uk vào server/data/products.json
 *
 *   node tools/import-catalog.mjs
 *
 * Nguồn: tools/data/lumie-products.json (tải từ https://lumiestore.uk/api/products)
 * Đích:  server/data/products.json  (schema nội bộ của store)
 *
 * Giữ nguyên tên, giá, gói, mô tả, đánh giá, cam kết và hướng dẫn của từng sản phẩm.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'tools', 'data', 'lumie-products.json');
const dest = path.join(root, 'server', 'data', 'products.json');

const raw = JSON.parse(await fs.readFile(src, 'utf8'));

const MANUAL_CATEGORIES = new Set(['Buff mxh', 'Khác']);

const pickBadge = (packages) => packages.map((p) => p.badge).find(Boolean) || null;

/* Đổi tên thương hiệu trong phần chữ lấy từ site gốc ("Cam kết từ Lumie:" …). */
const BRAND_FROM = /\bLumie\b/g;
const BRAND_TO = 'MadStore';
const rebrand = (s) => (typeof s === 'string' ? s.replace(BRAND_FROM, BRAND_TO) : s);
const rebrandList = (list) => (Array.isArray(list) ? list.map(rebrand) : list);

const products = raw
  .map((p) => {
    const packages = [...(p.packages || [])].sort((a, b) => a.sort_order - b.sort_order);
    const usable = packages.filter((k) => !k.sold_out && k.price > 0);
    const price = usable.length ? Math.min(...usable.map((k) => k.price)) : 0;
    const soldOut = usable.length === 0 || p.maintenance;

    return {
      id: String(p.id),
      name: p.name,
      slug: p.slug,
      description: rebrand(p.description || ''),
      price,
      image: p.image_url || null,
      imageFit: p.image_fit || 'frame',
      productType: p.category === 'Game' ? 'GAME_TOPUP' : 'GENERAL',
      deliveryType: MANUAL_CATEGORIES.has(p.category) ? 'MANUAL' : 'AUTO',
      category: p.category,
      categoryColor: p.color || '#FF9D1E',
      iconPath: p.icon_path || null,
      serviceLabel: p.service_label || null,
      badge: pickBadge(packages),
      discountPct: p.discount_pct || 0,
      rating: p.rating || { average: 0, count: 0 },
      guarantees: rebrandList(p.guarantees || []),
      guaranteesTitle: rebrand(p.guarantees_title) || null,
      instructions: rebrand(p.instructions || ''),
      credentialFields: p.credential_fields || [],
      usagePeriod: p.usage_period || 'none',
      noWarranty: Boolean(p.no_warranty),
      maintenance: Boolean(p.maintenance),
      maintenanceNote: p.maintenance_note || null,
      sortOrder: p.sort_order ?? 999,
      available: !soldOut,
      stock: 0,
      availableStock: 0,
      sold7d: (p.rating?.count || 0) * 3,
      variants: packages.map((k) => ({
        id: String(k.id),
        name: k.label,
        price: k.price,
        originalPrice: k.original_price || null,
        available: !k.sold_out,
        badge: k.badge || null,
        stock: 0,
        availableStock: 0,
        deliveryType: MANUAL_CATEGORIES.has(p.category) ? 'MANUAL' : 'AUTO',
        duration: null,
        note: null,
      })),
    };
  })
  .sort((a, b) => a.sortOrder - b.sortOrder);

await fs.writeFile(dest, JSON.stringify(products, null, 1));

const pkgs = products.reduce((n, p) => n + p.variants.length, 0);
console.log(`products.json ← ${products.length} sản phẩm, ${pkgs} gói`);
console.log('Danh mục:', [...new Set(products.map((p) => p.category))].join(' · '));
