/**
 * MadStore — mock API + static server.
 * Zero dependencies. Node 18+.
 *
 *   node server/server.mjs            # http://localhost:4321
 *   PORT=5000 node server/server.mjs
 *
 * The endpoint surface mirrors the contract observed in the live bundle
 * (/api/v1/...). Everything is local: no external service is contacted.
 */

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(ROOT, 'app');
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');

const PORT = Number(process.env.PORT || 4321);
const SESSION_COOKIE = 'vs_session';
const SESSION_TTL = 1000 * 60 * 60 * 24 * 14;

/* ------------------------------------------------------------------ data */

const products = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
const productBySlug = new Map();
const productById = new Map();
for (const p of products) {
  productBySlug.set(p.slug, p);
  productById.set(p.id, p);
}

let db = { users: [], sessions: {}, orders: [], topups: [], reviews: [] };
const DB_SEED = path.join(DATA_DIR, 'db.seed.json');

if (fs.existsSync(DB_FILE)) {
  try {
    db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.users ||= [];
    db.sessions ||= {};
    db.orders ||= [];
    db.topups ||= [];
    db.reviews ||= [];
  } catch {
    console.warn('[warn] db.json unreadable, starting fresh');
  }
} else if (fs.existsSync(DB_SEED)) {
  /* lần chạy đầu: lấy dữ liệu mẫu (tài khoản demo) thay vì db trống */
  try {
    db = JSON.parse(fs.readFileSync(DB_SEED, 'utf8'));
    console.log('[init] tạo db.json từ db.seed.json');
  } catch {
    console.warn('[warn] db.seed.json unreadable, starting fresh');
  }
}

let saveTimer = null;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    const tmp = DB_FILE + '.tmp';
    await fsp.writeFile(tmp, JSON.stringify(db, null, 2), 'utf8');
    await fsp.rename(tmp, DB_FILE);
  }, 40);
}

/* --------------------------------------------------------------- helpers */

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const round = (n) => Math.round(Number(n) || 0);

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function parseCookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function currentUser(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  const session = db.sessions[token];
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    delete db.sessions[token];
    persist();
    return null;
  }
  return db.users.find((u) => u.id === session.userId) || null;
}

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone || null,
    avatar: user.avatar || null,
    role: user.role,
    balance: user.balance,
    points: user.points,
    createdAt: user.createdAt,
  };
}

function send(res, status, body, headers = {}) {
  const isBuffer = Buffer.isBuffer(body);
  const payload = isBuffer ? body : JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': isBuffer ? 'application/octet-stream' : 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

const ok = (res, data, extra = {}) => send(res, 200, { success: true, data, error: null, ...extra });
const fail = (res, status, message, code = 'error') =>
  send(res, status, { success: false, data: null, error: { code, message } });

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error('payload too large');
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('invalid JSON body');
  }
}

/* --------------------------------------------------------------- catalog */

const TYPE_LABELS = {
  GAME_TOPUP: 'Nạp game',
  CARD: 'Thẻ cào',
  GENERAL: 'Tài khoản & dịch vụ',
  NETFLIX: 'Netflix',
};

function fromPriceOf(p) {
  const prices = p.variants.filter((v) => v.available !== false && v.price > 0).map((v) => v.price);
  return prices.length ? Math.min(...prices) : p.price;
}

function cheapestVariant(p) {
  const usable = p.variants.filter((v) => v.available !== false && v.price > 0);
  if (!usable.length) return null;
  return usable.reduce((a, b) => (b.price < a.price ? b : a));
}

function publicProduct(p, { light = false } = {}) {
  const base = {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    image: p.image,
    imageFit: p.imageFit || 'frame',
    productType: p.productType,
    typeLabel: p.category || TYPE_LABELS[p.productType] || 'Khác',
    deliveryType: p.deliveryType,
    category: p.category,
    categoryColor: p.categoryColor || null,
    iconPath: p.iconPath || null,
    badge: p.badge || null,
    rating: p.rating || null,
    discountPct: p.discountPct || 0,
    maintenance: Boolean(p.maintenance),
    available: p.available !== false,
    stock: p.availableStock,
    sold7d: p.sold7d,
    fromPrice: fromPriceOf(p),
    fromOriginalPrice: cheapestVariant(p)?.originalPrice || null,
    fromVariantName: cheapestVariant(p)?.name || null,
    description: p.description ? String(p.description).slice(0, 220) : '',
  };
  if (light) return base;
  return {
    ...base,
    description: p.description,
    guarantees: p.guarantees || [],
    guaranteesTitle: p.guaranteesTitle || null,
    instructions: p.instructions || '',
    variants: p.variants,
  };
}

function listProducts({ q, type, exclude, delivery, sort, limit, offset, category }) {
  let rows = products;
  if (type) rows = rows.filter((p) => p.productType === type);
  if (exclude) {
    const skip = new Set(String(exclude).split(',').map((s) => s.trim()).filter(Boolean));
    rows = rows.filter((p) => !skip.has(p.productType));
  }
  if (category) rows = rows.filter((p) => p.category === category);
  if (delivery) rows = rows.filter((p) => p.deliveryType === delivery);
  if (q) {
    const needle = q.toLowerCase();
    rows = rows.filter(
      (p) => p.name.toLowerCase().includes(needle) || (p.description || '').toLowerCase().includes(needle),
    );
  }
  if (sort === 'price-asc') rows = [...rows].sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') rows = [...rows].sort((a, b) => b.price - a.price);
  else if (sort === 'popular') rows = [...rows].sort((a, b) => b.sold7d - a.sold7d);

  const total = rows.length;
  const start = Math.max(0, Number(offset) || 0);
  const take = Math.min(200, Math.max(1, Number(limit) || 24));
  return { rows: rows.slice(start, start + take), total };
}

/* ---------------------------------------------------------------- orders */

function priceForLine(line) {
  const product = productById.get(line.productId);
  if (!product) return null;
  const variant = line.variantId ? product.variants.find((v) => v.id === line.variantId) : null;
  if (line.variantId && !variant) return null;
  if (product.available === false) return null;
  if (variant && variant.available === false) return null;
  const unit = variant ? variant.price : product.price;
  if (!(unit > 0)) return null;
  const qty = Math.min(99, Math.max(1, Number(line.qty) || 1));
  return { product, variant, unit, qty, total: unit * qty };
}

/* ---------------------------------------------------------------- routes */

const routes = [];
const route = (method, pattern, handler) => routes.push({ method, pattern, handler });

route('GET', /^\/api\/v1\/health$/, (req, res) => ok(res, { status: 'up', products: products.length }));

route('GET', /^\/api\/v1\/products$/, (req, res, _m, url) => {
  const params = url.searchParams;
  const { rows, total } = listProducts({
    q: params.get('q') || '',
    type: params.get('type') || '',
    exclude: params.get('exclude') || '',
    category: params.get('category') || '',
    delivery: params.get('delivery') || '',
    sort: params.get('sort') || '',
    limit: params.get('limit'),
    offset: params.get('offset'),
  });
  ok(res, rows.map((p) => publicProduct(p, { light: params.get('light') === '1' })), { meta: { total } });
});

route('GET', /^\/api\/v1\/products\/groups$/, (req, res) => {
  const groups = {};
  for (const p of products) {
    if (p.productType === 'DECOR') continue;
    (groups[p.productType] ||= []).push(publicProduct(p, { light: true }));
  }
  ok(res, groups, {
    meta: {
      total: Object.values(groups).reduce((n, g) => n + g.length, 0),
      labels: TYPE_LABELS,
    },
  });
});

route('GET', /^\/api\/v1\/products\/featured$/, (req, res, _m, url) => {
  const limit = Math.min(24, Number(url.searchParams.get('limit')) || 8);
  const rows = [...products]
    .filter((p) => p.available !== false && p.price > 0 && p.productType !== 'DECOR')
    .sort((a, b) => b.sold7d - a.sold7d)
    .slice(0, limit);
  ok(res, rows.map((p) => publicProduct(p, { light: true })));
});

route('GET', /^\/api\/v1\/products\/([\w-]+)$/, (req, res, m) => {
  const product = productBySlug.get(m[1]) || productById.get(m[1]);
  if (!product) return fail(res, 404, 'Sản phẩm không tồn tại', 'not_found');
  ok(res, publicProduct(product));
});

route('GET', /^\/api\/v1\/reviews$/, (req, res, _m, url) => {
  const productId = url.searchParams.get('productId');
  const rows = productId ? db.reviews.filter((r) => r.productId === productId) : db.reviews.slice(0, 12);
  ok(res, rows);
});

/* ------------------------------------------------------------------ auth */

route('POST', /^\/api\/v1\/auth\/register$/, async (req, res) => {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const name = String(body.name || '').trim() || email.split('@')[0];

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail(res, 422, 'Email không hợp lệ', 'invalid_email');
  if (password.length < 6) return fail(res, 422, 'Mật khẩu tối thiểu 6 ký tự', 'weak_password');
  if (db.users.some((u) => u.email === email)) return fail(res, 409, 'Email đã được sử dụng', 'email_taken');

  const user = {
    id: uid(),
    email,
    name,
    phone: null,
    password: hashPassword(password),
    role: 'customer',
    balance: 0,
    points: 0,
    createdAt: now(),
  };
  db.users.push(user);

  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL };
  persist();

  send(res, 201, { success: true, data: { user: publicUser(user) }, error: null }, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`,
  });
});

route('POST', /^\/api\/v1\/auth\/login$/, async (req, res) => {
  const body = await readBody(req);
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  const user = db.users.find((u) => u.email === email);

  if (!user || !verifyPassword(password, user.password)) {
    return fail(res, 401, 'Email hoặc mật khẩu không đúng', 'invalid_credentials');
  }

  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[token] = { userId: user.id, expiresAt: Date.now() + SESSION_TTL };
  persist();

  send(res, 200, { success: true, data: { user: publicUser(user) }, error: null }, {
    'Set-Cookie': `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL / 1000}`,
  });
});

route('POST', /^\/api\/v1\/auth\/logout$/, (req, res) => {
  const token = parseCookies(req)[SESSION_COOKIE];
  if (token) delete db.sessions[token];
  persist();
  send(res, 200, { success: true, data: { ok: true }, error: null }, {
    'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`,
  });
});

route('GET', /^\/api\/v1\/auth\/session$/, (req, res) => {
  const user = currentUser(req);
  ok(res, { authenticated: Boolean(user), user: publicUser(user) });
});

/* ------------------------------------------------------------------ user */

route('GET', /^\/api\/v1\/users\/me$/, (req, res) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  ok(res, publicUser(user));
});

route('PATCH', /^\/api\/v1\/users\/me$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const body = await readBody(req);
  if (typeof body.name === 'string' && body.name.trim()) user.name = body.name.trim();
  if (typeof body.phone === 'string') user.phone = body.phone.trim() || null;
  persist();
  ok(res, publicUser(user));
});

/* ---------------------------------------------------------------- wallet */

route('GET', /^\/api\/v1\/wallet$/, (req, res) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const history = [
    ...db.topups.filter((t) => t.userId === user.id).map((t) => ({
      id: t.id,
      kind: 'topup',
      amount: t.amount,
      status: t.status,
      createdAt: t.createdAt,
      note: t.method === 'card' ? 'Nạp bằng thẻ cào' : 'Nạp bằng chuyển khoản QR',
    })),
    ...db.orders.filter((o) => o.userId === user.id).map((o) => ({
      id: o.id,
      kind: 'order',
      amount: -o.total,
      status: o.status,
      createdAt: o.createdAt,
      note: `Thanh toán đơn ${o.code}`,
    })),
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  ok(res, { balance: user.balance, points: user.points, history });
});

route('POST', /^\/api\/v1\/wallet\/topup$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const body = await readBody(req);
  const amount = round(body.amount);
  const method = body.method === 'card' ? 'card' : 'qr';
  if (amount < 10000) return fail(res, 422, 'Số tiền nạp tối thiểu 10.000 VNĐ', 'amount_too_small');
  if (amount > 20_000_000) return fail(res, 422, 'Số tiền nạp tối đa 20.000.000 VNĐ', 'amount_too_large');

  const topup = {
    id: uid(),
    userId: user.id,
    amount,
    method,
    status: 'pending',
    code: 'VS' + crypto.randomInt(100000, 999999),
    createdAt: now(),
  };
  db.topups.push(topup);
  persist();
  ok(res, topup);
});

route('POST', /^\/api\/v1\/wallet\/topup\/([\w-]+)\/confirm$/, (req, res, m) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const topup = db.topups.find((t) => t.id === m[1] && t.userId === user.id);
  if (!topup) return fail(res, 404, 'Không tìm thấy lệnh nạp', 'not_found');
  if (topup.status === 'paid') return ok(res, { topup, balance: user.balance });

  topup.status = 'paid';
  topup.paidAt = now();
  user.balance += topup.amount;
  persist();
  ok(res, { topup, balance: user.balance });
});

/* ---------------------------------------------------------------- orders */

route('GET', /^\/api\/v1\/orders$/, (req, res) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const rows = db.orders
    .filter((o) => o.userId === user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  ok(res, rows);
});

route('POST', /^\/api\/v1\/orders$/, async (req, res) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const body = await readBody(req);
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return fail(res, 422, 'Giỏ hàng trống', 'empty_cart');

  const lines = [];
  for (const item of items) {
    const priced = priceForLine(item);
    if (!priced) return fail(res, 422, 'Sản phẩm trong giỏ không còn tồn tại', 'invalid_item');
    lines.push(priced);
  }

  const total = lines.reduce((sum, l) => sum + l.total, 0);
  if (user.balance < total) {
    return fail(res, 402, 'Số dư ví không đủ. Vui lòng nạp thêm.', 'insufficient_balance');
  }

  const order = {
    id: uid(),
    code: 'VS' + Date.now().toString().slice(-8),
    userId: user.id,
    status: 'processing',
    total,
    items: lines.map((l) => ({
      productId: l.product.id,
      variantId: l.variant ? l.variant.id : null,
      name: l.product.name,
      variantName: l.variant ? l.variant.name : null,
      image: l.product.image,
      unitPrice: l.unit,
      qty: l.qty,
      total: l.total,
      deliveryType: l.variant ? l.variant.deliveryType : l.product.deliveryType,
    })),
    note: typeof body.note === 'string' ? body.note.slice(0, 400) : '',
    createdAt: now(),
  };

  user.balance -= total;
  user.points += Math.floor(total / 10000);
  db.orders.push(order);
  persist();
  send(res, 201, { success: true, data: order, error: null });
});

route('GET', /^\/api\/v1\/orders\/([\w-]+)$/, (req, res, m) => {
  const user = currentUser(req);
  if (!user) return fail(res, 401, 'Chưa đăng nhập', 'unauthenticated');
  const order = db.orders.find((o) => (o.id === m[1] || o.code === m[1]) && o.userId === user.id);
  if (!order) return fail(res, 404, 'Không tìm thấy đơn hàng', 'not_found');
  ok(res, order);
});

/* -------------------------------------------------------------- qr image */

route('GET', /^\/api\/v1\/qr$/, (req, res, _m, url) => {
  const amount = round(url.searchParams.get('amount')) || 0;
  const code = (url.searchParams.get('code') || 'VIBESTORE').slice(0, 24);
  send(res, 200, Buffer.from(qrSvg(amount, code), 'utf8'), {
    'Content-Type': 'image/svg+xml; charset=utf-8',
    'Cache-Control': 'public, max-age=300',
  });
});

function qrSvg(amount, code) {
  const size = 25;
  const cell = 8;
  const pad = 16;
  const dim = size * cell + pad * 2;
  const seed = crypto.createHash('sha256').update(`${amount}:${code}`).digest();
  let bits = '';
  for (let i = 0; i < 256; i += 1) bits += (seed[i % 32] >> (i % 8)) & 1 ? '1' : '0';
  while (bits.length < size * size) bits += bits;

  const isFinder = (r, c) => {
    const inBox = (r0, c0) => r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    return inBox(0, 0) || inBox(0, size - 7) || inBox(size - 7, 0);
  };
  const finderOn = (r, c) => {
    const lr = r < 7 ? r : r - (size - 7);
    const lc = c < 7 ? c : c - (size - 7);
    const ring = Math.max(Math.abs(lr - 3), Math.abs(lc - 3));
    return ring !== 2;
  };

  let rects = '';
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const on = isFinder(r, c) ? finderOn(r, c) : bits[r * size + c] === '1';
      if (on) rects += `<rect x="${pad + c * cell}" y="${pad + r * cell}" width="${cell}" height="${cell}"/>`;
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${dim}" height="${dim}" viewBox="0 0 ${dim} ${dim}" role="img" aria-label="Mã QR nạp ${amount} VNĐ">
  <rect width="${dim}" height="${dim}" fill="#ffffff"/>
  <g fill="#0a0a0b">${rects}</g>
  <rect x="${dim / 2 - 34}" y="${dim / 2 - 34}" width="68" height="68" rx="14" fill="#0a0a0b"/>
  <text x="${dim / 2}" y="${dim / 2 + 6}" font-family="Inter,sans-serif" font-size="16" font-weight="700" fill="#f7f5f0" text-anchor="middle">VS</text>
</svg>`;
}

/* -------------------------------------------------------------- fallback */

route('ALL', /^\/api\//, (req, res) => fail(res, 404, 'Endpoint không tồn tại', 'route_not_found'));

/* ------------------------------------------------------------ static I/O */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

const PAGE_ROUTES = {
  '/': 'index.html',
  '/products': 'products.html',
  '/cart': 'cart.html',
  '/login': 'login.html',
  '/register': 'register.html',
  '/account': 'account.html',
  '/wallet': 'wallet.html',
  '/orders': 'orders.html',
};

async function serveStatic(req, res, pathname) {
  let rel = PAGE_ROUTES[pathname];
  if (!rel && /^\/products\/[\w-]+\/?$/.test(pathname)) rel = 'product.html';
  if (!rel) rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!rel || rel.endsWith('/')) rel = path.join(rel, 'index.html');

  const filePath = path.resolve(APP_DIR, rel);
  if (!filePath.startsWith(APP_DIR)) return notFoundPage(res);

  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) return notFoundPage(res);
    const ext = path.extname(filePath).toLowerCase();
    const data = await fsp.readFile(filePath);
    const cache = /\.(woff2|png|jpg|jpeg|webp|svg|ico)$/.test(ext)
      ? 'public, max-age=86400'
      : 'no-cache';
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': data.length,
      'Cache-Control': cache,
    });
    res.end(data);
  } catch {
    notFoundPage(res);
  }
}

async function notFoundPage(res) {
  try {
    const data = await fsp.readFile(path.join(APP_DIR, '404.html'));
    res.writeHead(404, { 'Content-Type': MIME['.html'], 'Content-Length': data.length });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('404 — Không tìm thấy trang');
  }
}

/* ---------------------------------------------------------------- server */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  try {
    for (const r of routes) {
      if (r.method !== 'ALL' && r.method !== req.method) continue;
      const match = r.pattern.exec(pathname);
      if (!match) continue;
      await r.handler(req, res, match, url);
      return;
    }
    await serveStatic(req, res, pathname);
  } catch (err) {
    console.error('[error]', req.method, pathname, err);
    if (!res.headersSent) fail(res, 500, 'Lỗi máy chủ nội bộ', 'internal_error');
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`\n  MadStore đang chạy:        http://localhost:${PORT}`);
  console.log(`  Danh mục sản phẩm:          ${products.length}`);
  console.log(`  Dữ liệu:                    ${path.relative(ROOT, DB_FILE)}\n`);
});
