/* ==========================================================================
   core.js — API client, cart store, shared UI behaviour
   ========================================================================== */

const API_BASE = '/api/v1';

/* ---------------------------------------------------------------- backend */
/*
 * Hai chế độ:
 *   'live' — có server Node, dùng /api/v1 thật (đăng nhập, ví, đơn hàng).
 *   'demo' — chỉ host tĩnh (Netlify...), API không tồn tại. Sản phẩm đọc từ
 *            /data/catalog.json, giỏ + đơn giả lập lưu localStorage.
 * Chế độ được quyết định một lần bằng cách dò /api/v1/health.
 */

let MODE = null;

const modeReady = (async () => {
  try {
    const res = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
    MODE = res.ok ? 'live' : 'demo';
  } catch {
    MODE = 'demo';
  }
  return MODE;
})();

const isDemo = () => MODE === 'demo';

/* ------------------------------------------------------------------- http */

async function request(method, path, body) {
  await modeReady;
  if (MODE === 'demo') return demoRequest(method, path, body);

  const res = await fetch(API_BASE + path, {
    method,
    credentials: 'same-origin',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });

  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.success === false) {
    const err = new Error((payload && payload.error && payload.error.message) || `Lỗi ${res.status}`);
    err.status = res.status;
    err.code = payload && payload.error && payload.error.code;
    throw err;
  }
  return payload;
}

const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body || {}),
  patch: (path, body) => request('PATCH', path, body || {}),
  del: (path) => request('DELETE', path),
};

/* ------------------------------------------------------- demo backend (UI) */

const DEMO_ORDERS_KEY = 'vs_demo_orders_v1';

let catalogPromise = null;

function catalog() {
  catalogPromise ||= fetch('/data/catalog.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  return catalogPromise;
}

function demoOrders() {
  try {
    const raw = JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY) || '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function saveDemoOrders(list) {
  localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(list));
}

function lightProduct(p) {
  const usable = p.variants.filter((v) => v.available !== false && v.price > 0);
  const prices = usable.map((v) => v.price);
  const from = prices.length ? Math.min(...prices) : p.price;
  const cheapest = usable.find((v) => v.price === from);
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    price: p.price,
    image: p.image,
    imageFit: p.imageFit,
    productType: p.productType,
    typeLabel: p.category,
    deliveryType: p.deliveryType,
    category: p.category,
    categoryColor: p.categoryColor,
    badge: p.badge,
    rating: p.rating,
    available: p.available !== false,
    stock: p.availableStock || 0,
    sold7d: p.sold7d || 0,
    fromPrice: from,
    fromOriginalPrice: cheapest && cheapest.originalPrice ? cheapest.originalPrice : null,
    fromVariantName: cheapest ? cheapest.name : null,
    description: p.description ? String(p.description).slice(0, 220) : '',
  };
}

async function demoRequest(method, path, body) {
  const [rawPath, rawQuery = ''] = path.split('?');
  const params = new URLSearchParams(rawQuery);
  const ok = (data, meta) => ({ success: true, data, error: null, ...(meta ? { meta } : {}) });

  /* --- sản phẩm --- */
  if (method === 'GET' && rawPath === '/products') {
    const all = await catalog();
    let rows = all.slice();
    const cat = params.get('category');
    const q = params.get('q');
    const sort = params.get('sort');

    if (cat) rows = rows.filter((p) => p.category === cat);
    if (q) {
      const needle = q.toLowerCase();
      rows = rows.filter(
        (p) =>
          p.name.toLowerCase().includes(needle) ||
          (p.description || '').toLowerCase().includes(needle),
      );
    }
    if (sort === 'price-asc') rows.sort((a, b) => a.price - b.price);
    else if (sort === 'price-desc') rows.sort((a, b) => b.price - a.price);
    else if (sort === 'popular') rows.sort((a, b) => (b.sold7d || 0) - (a.sold7d || 0));

    const total = rows.length;
    const limit = Math.min(200, Number(params.get('limit')) || 24);
    const offset = Math.max(0, Number(params.get('offset')) || 0);
    const page = rows.slice(offset, offset + limit);
    const light = params.get('light') === '1';
    return ok(light ? page.map(lightProduct) : page, { total });
  }

  if (method === 'GET' && rawPath === '/products/featured') {
    const all = await catalog();
    const limit = Math.min(24, Number(params.get('limit')) || 8);
    const rows = all
      .filter((p) => p.available !== false && p.price > 0)
      .sort((a, b) => (b.sold7d || 0) - (a.sold7d || 0))
      .slice(0, limit)
      .map(lightProduct);
    return ok(rows);
  }

  const productMatch = /^\/products\/([\w-]+)$/.exec(rawPath);
  if (method === 'GET' && productMatch) {
    const all = await catalog();
    const slug = decodeURIComponent(productMatch[1]);
    const found = all.find((p) => p.slug === slug || p.id === slug);
    if (!found) {
      const err = new Error('Sản phẩm không tồn tại');
      err.status = 404;
      throw err;
    }
    return ok(found);
  }

  /* --- phiên đăng nhập: demo luôn là khách --- */
  if (rawPath === '/auth/session') {
    return ok({ authenticated: false, user: null, demo: true });
  }
  if (rawPath === '/auth/logout') return ok({ ok: true });
  if (rawPath.startsWith('/auth/')) {
    const err = new Error('Bản demo giao diện chưa có đăng nhập.');
    err.code = 'demo_mode';
    throw err;
  }

  /* --- đơn hàng giả lập --- */
  if (method === 'GET' && rawPath === '/orders') {
    return ok(demoOrders());
  }

  if (method === 'POST' && rawPath === '/orders') {
    const all = await catalog();
    const items = Array.isArray(body && body.items) ? body.items : [];
    if (!items.length) {
      const err = new Error('Giỏ hàng trống');
      err.code = 'empty_cart';
      throw err;
    }

    const lines = [];
    for (const item of items) {
      const product = all.find((p) => p.id === item.productId);
      if (!product) continue;
      const variant = item.variantId ? product.variants.find((v) => v.id === item.variantId) : null;
      const unit = variant ? variant.price : product.price;
      const qty = Math.min(99, Math.max(1, Number(item.qty) || 1));
      lines.push({
        productId: product.id,
        variantId: variant ? variant.id : null,
        name: product.name,
        variantName: variant ? variant.name : null,
        image: product.image,
        unitPrice: unit,
        qty,
        total: unit * qty,
        deliveryType: variant ? variant.deliveryType : product.deliveryType,
      });
    }

    if (!lines.length) {
      const err = new Error('Sản phẩm trong giỏ không còn tồn tại');
      err.code = 'invalid_item';
      throw err;
    }

    const order = {
      id: `demo-${Date.now()}`,
      code: 'DM' + Date.now().toString().slice(-8),
      status: 'processing',
      total: lines.reduce((n, l) => n + l.total, 0),
      items: lines,
      note: 'Đơn giả lập — bản demo giao diện, không có giao dịch thật.',
      createdAt: new Date().toISOString(),
    };

    const list = demoOrders();
    list.unshift(order);
    saveDemoOrders(list);
    return ok(order);
  }

  /* --- ví: không có trong demo --- */
  if (rawPath.startsWith('/wallet')) {
    if (method === 'GET') return ok({ balance: 0, points: 0, history: [], demo: true });
    const err = new Error('Bản demo giao diện chưa có ví.');
    err.code = 'demo_mode';
    throw err;
  }

  if (rawPath === '/users/me') {
    return ok({ id: 'demo', name: 'Khách demo', email: 'demo@madstore.vn', balance: 0, points: 0, role: 'guest' });
  }

  const err = new Error('Chức năng này chưa có ở bản demo.');
  err.code = 'demo_mode';
  throw err;
}

/* ------------------------------------------------------------------ utils */

const fmt = new Intl.NumberFormat('vi-VN');

function vnd(n) {
  return `${fmt.format(Math.round(Number(n) || 0))} VNĐ`;
}

function shortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} · ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function dateOnly(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[c]);
}

function debounce(fn, wait = 220) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ------------------------------------------------------------------ toast */

function toast(message, kind = 'ok') {
  let host = document.querySelector('.toast-host');
  if (!host) {
    host = el('div', { class: 'toast-host' });
    document.body.append(host);
  }
  const node = el(
    'div',
    { class: 'toast', 'data-kind': kind, role: 'status' },
    el('span', { class: 'toast__dot' }),
    el('span', {}, message),
  );
  host.append(node);
  setTimeout(() => {
    node.style.transition = 'opacity .3s, transform .3s';
    node.style.opacity = '0';
    node.style.transform = 'translateY(6px)';
    setTimeout(() => node.remove(), 320);
  }, 3200);
}

/* -------------------------------------------------------------- cart store */

const CART_KEY = 'vs_cart_v1';

const cart = {
  read() {
    try {
      const raw = JSON.parse(localStorage.getItem(CART_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  },
  write(items) {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
  },
  add(item, qty = 1) {
    const items = cart.read();
    const key = `${item.productId}::${item.variantId || ''}`;
    const found = items.find((i) => `${i.productId}::${i.variantId || ''}` === key);
    if (found) found.qty = Math.min(99, found.qty + qty);
    else items.push({ ...item, qty });
    cart.write(items);
  },
  setQty(key, qty) {
    const items = cart.read();
    const item = items.find((i) => i.key === key);
    if (!item) return;
    item.qty = Math.min(99, Math.max(1, qty));
    cart.write(items);
  },
  remove(key) {
    cart.write(cart.read().filter((i) => i.key !== key));
  },
  clear() {
    cart.write([]);
  },
  count() {
    return cart.read().reduce((n, i) => n + i.qty, 0);
  },
  total() {
    return cart.read().reduce((n, i) => n + i.qty * i.unitPrice, 0);
  },
};

/* ---------------------------------------------------------------- session */

let sessionCache = null;

async function getSession(force = false) {
  if (sessionCache && !force) return sessionCache;
  try {
    const { data } = await api.get('/auth/session');
    sessionCache = data;
  } catch {
    sessionCache = { authenticated: false, user: null };
  }
  return sessionCache;
}

function clearSession() {
  sessionCache = null;
}

/* --------------------------------------------------------------- icons */

const icons = {
  cart: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2.5 3h2.2l2.3 11.2a1.6 1.6 0 0 0 1.6 1.3h8.6a1.6 1.6 0 0 0 1.6-1.3L21 7H6"/></svg>',
  user: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/></svg>',
  search: '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>',
  sun: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>',
  moon: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8.2 8.2 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>',
  menu: '<svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>',
  arrow: '<svg class="btn__arrow" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h13M13 6.5 18.5 12 13 17.5"/></svg>',
  chev: '<svg class="hero-tile__chev" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m9 5 7 7-7 7"/></svg>',
  star: '<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.6 5.7 6.2.7-4.6 4.2 1.3 6.1L12 16.8 6.5 19.7l1.3-6.1L3.2 9.4l6.2-.7z"/></svg>',
  bolt: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H12z"/></svg>',
  shield: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 2.5 20 5.5v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z"/><path d="m8.8 11.8 2.2 2.2 4.2-4.4"/></svg>',
  discord: '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor"><path d="M19.6 5.6A16 16 0 0 0 15.7 4.4l-.3.6a12 12 0 0 0-6.8 0l-.3-.6a16 16 0 0 0-3.9 1.2C2.1 9.2 1.4 12.7 1.7 16.1a16 16 0 0 0 4.8 2.4l.6-1a10 10 0 0 1-1.7-.8l.4-.3a11 11 0 0 0 9.4 0l.4.3c-.5.3-1.1.6-1.7.8l.6 1a16 16 0 0 0 4.8-2.4c.4-4-.8-7.5-3.7-10.5ZM8.7 14.1c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9Zm6.6 0c-.9 0-1.7-.9-1.7-1.9s.7-1.9 1.7-1.9 1.7.9 1.7 1.9-.8 1.9-1.7 1.9Z"/></svg>',
  qr: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><path d="M14 14h3v3h-3zM20 14v3M17 20h4"/></svg>',
  ai: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/><path d="M18.5 15.5 19.2 18l2.3.8-2.3.7-.7 2.5-.7-2.5-2.3-.7 2.3-.8z"/></svg>',
  film: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="15" rx="2.5"/><path d="M3 9h18M3 15h18M8 4.5v15M16 4.5v15"/></svg>',
  pen: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M15.5 4.5 19.5 8.5 9 19H5v-4z"/><path d="m13 7 4 4"/></svg>',
  gamepad: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="2.5" y="7" width="19" height="10" rx="4.5"/><path d="M7 10.5v3M5.5 12h3M16 11.2h.01M18.3 13.4h.01"/></svg>',
  spark: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg>',
};

/* -------------------------------------------- thương hiệu theo danh mục */
/*
 * Dải màu + glyph lấy từ /api/catalog của lumiestore.uk: mỗi sản phẩm có
 * `categoryColor` riêng, còn glyph thì dùng logo thương hiệu của danh mục.
 */

const CAT = {
  Discord: {
    color: '#5865F2',
    path: 'M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z',
  },
  Spotify: {
    color: '#1DB954',
    path: 'M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z',
  },
  Netflix: {
    color: '#E50914',
    path: 'm5.398 0 8.348 23.602c2.346.059 4.856.398 4.856.398L10.113 0H5.398zm8.489 0v9.172l4.715 13.33V0h-4.715zM5.398 1.5V24c1.873-.225 2.81-.312 4.715-.398V14.83L5.398 1.5z',
  },
  YouTube: {
    color: '#FF0000',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  'Chat AI': {
    color: '#211A12',
    path: 'M11.04 19.32Q12 21.51 12 24q0-2.49.93-4.68.96-2.19 2.58-3.81t3.81-2.55Q21.51 12 24 12q-2.49 0-4.68-.93a12.3 12.3 0 0 1-3.81-2.58 12.3 12.3 0 0 1-2.58-3.81Q12 2.49 12 0q0 2.49-.96 4.68-.93 2.19-2.55 3.81a12.3 12.3 0 0 1-3.81 2.58Q2.49 12 0 12q2.49 0 4.68.96 2.19.93 3.81 2.55t2.55 3.81',
  },
  Canva: { color: '#3FE4AD', path: null },
  CapCut: { color: '#3A3A41', path: null },
  'Buff mxh': { color: '#9E8CD4', path: null },
  Khác: { color: '#FF5D73', path: null },
  Game: { color: '#7048E8', path: null },
};

function catOf(name) {
  return CAT[name] || { color: '#7048E8', path: null };
}

function initials(name) {
  return String(name || '?')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || '')
    .join('')
    .toUpperCase();
}

/* glyph trong dải màu: ảnh sản phẩm → logo danh mục → chữ viết tắt */
function glyphHtml(p, { size = 44 } = {}) {
  if (p.image) return `<img src="${escapeHtml(p.image)}" alt="" loading="lazy" decoding="async">`;
  const c = catOf(p.category);
  if (c.path) {
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${c.path}"/></svg>`;
  }
  return `<span class="is-text">${escapeHtml(initials(p.name))}</span>`;
}

/* -------------------------------------------------------- nền ambient (fx) */

function mountBackground() {
  /* nền giấy được vẽ bằng body::before, không cần lớp phụ */
}

/* ----------------------------------------------------------------- header */

const catUrl = (c) => `/products?category=${encodeURIComponent(c)}`;

const NAV_LINKS = [
  { href: '/', label: 'Trang chủ', exact: true },
  { href: '/products', label: 'Sản phẩm' },
  { href: catUrl('Game'), label: 'Nạp game' },
  { href: '/#vip', label: 'VIP' },
  { href: '/#support', label: 'Hỗ trợ' },
];

const SPARK_SVG =
  '<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1.8l2.5 7.7 7.7 2.5-7.7 2.5L12 22.2l-2.5-7.7L1.8 12l7.7-2.5z"/></svg>';

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('vs_theme', theme);
  const btn = document.querySelector('[data-theme-toggle]');
  if (btn) btn.innerHTML = theme === 'dark' ? icons.sun : icons.moon;
}

function initTheme() {
  /* MadStore mặc định tông sáng (giấy kem); chỉ đổi khi người dùng đã chọn */
  const stored = localStorage.getItem('vs_theme');
  applyTheme(stored === 'dark' ? 'dark' : 'light');
}

function mountHeader() {
  const host = document.querySelector('[data-header]');
  if (!host) return;
  const here = location.pathname + location.search;
  const isActive = (l) => {
    if (l.exact) return location.pathname === '/' && !location.search;
    if (l.href.includes('#')) return false;
    return decodeURI(here) === decodeURI(l.href) || (l.href === '/products' && location.pathname === '/products' && !location.search);
  };

  host.className = 'site-header';
  host.innerHTML = `
    <div class="site-header__top">
      <div class="shell site-header__inner">
        <a class="brand" href="/" aria-label="MadStore — trang chủ">
          <span class="brand__word">MadStore</span>
        </a>

        <nav class="nav" data-nav>
          ${NAV_LINKS.map(
            (l) => `<a class="nav__link" href="${l.href}" ${isActive(l) ? 'aria-current="page"' : ''}>${l.label}</a>`,
          ).join('')}
        </nav>

        ${location.pathname === '/products'
          ? ''
          : `<form class="header-search" role="search" action="/products" method="get">
          <span class="header-search__ico">${icons.search}</span>
          <input type="search" name="q" placeholder="Tìm sản phẩm" aria-label="Tìm sản phẩm" autocomplete="off" value="${escapeHtml(new URLSearchParams(location.search).get('q') || '')}">
          <button type="submit" aria-label="Tìm kiếm">${icons.search}</button>
        </form>`}

        <div class="header-actions">
          <button class="icon-btn" data-theme-toggle aria-label="Đổi giao diện sáng/tối"></button>
          <a class="icon-btn" href="/cart" aria-label="Giỏ hàng">
            ${icons.cart}
            <span class="icon-btn__dot" data-cart-count hidden>0</span>
          </a>
          <a class="icon-btn" href="/account" aria-label="Tài khoản">${icons.user}</a>
          <button class="icon-btn nav-toggle" data-nav-toggle aria-label="Mở menu" aria-expanded="false">${icons.menu}</button>
        </div>
      </div>
    </div>`;

  const header = host;
  const onScroll = () => {
    header.setAttribute('data-scrolled', window.scrollY > 4 ? 'true' : 'false');
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  const nav = header.querySelector('[data-nav]');
  header.querySelector('[data-nav-toggle]')?.addEventListener('click', (e) => {
    const open = nav.getAttribute('data-open') !== 'true';
    nav.setAttribute('data-open', String(open));
    e.currentTarget.setAttribute('aria-expanded', String(open));
  });

  header.querySelector('[data-theme-toggle]').addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  });

  const syncCart = () => {
    const badge = header.querySelector('[data-cart-count]');
    const n = cart.count();
    badge.textContent = String(n);
    badge.hidden = n === 0;
  };
  syncCart();
  document.addEventListener('cart:change', syncCart);
  applyTheme(document.documentElement.getAttribute('data-theme') || 'light');
}

/* ----------------------------------------------------------------- footer */

const FOOTER_HTML = `
  <div class="shell">
    <div class="footer-grid">
      <div class="footer-brand">
        <a class="brand" href="/">
          <span class="brand__word">MadStore</span>
        </a>
        <p>Tài khoản premium, nạp game và dịch vụ số. Giao tự động 24/7, thanh toán bằng ví MadStore, hỗ trợ trực tuyến 1-1.</p>
        <a class="btn btn--ghost btn--sm" href="#support" style="margin-top:12px">Hỗ trợ trực tuyến</a>
      </div>
      <div class="footer-col">
        <h4>Sản phẩm</h4>
        <ul>
          <li><a href="/products">Tất cả sản phẩm</a></li>
          <li><a href="/products?category=Discord">Discord</a></li>
          <li><a href="/products?category=Netflix">Netflix</a></li>
          <li><a href="/products?category=Spotify">Spotify</a></li>
          <li><a href="/products?category=Chat%20AI">Chat AI</a></li>
          <li><a href="/products?category=Game">Nạp game</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Tài khoản</h4>
        <ul>
          <li><a href="/wallet">Ví của tôi</a></li>
          <li><a href="/account">Hồ sơ</a></li>
          <li><a href="/orders">Đơn hàng</a></li>
          <li><a href="/#vip">Hạng VIP</a></li>
        </ul>
      </div>
      <div class="footer-col">
        <h4>Hỗ trợ</h4>
        <ul>
          <li><a href="#support">Hỗ trợ trực tuyến</a></li>
          <li><a href="#faq">Câu hỏi thường gặp</a></li>
          <li><a href="#">Điều khoản dịch vụ</a></li>
          <li><a href="#">Chính sách bảo mật</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>© <span data-year>2026</span> MadStore. Đã đăng ký bản quyền.</span>
      <span>Giao tự động 24/7 · Thanh toán an toàn</span>
    </div>
  </div>`;

function mountFooter() {
  const host = document.querySelector('[data-footer]');
  if (!host) return;
  host.className = 'site-footer';
  host.innerHTML = FOOTER_HTML;
}

/* --------------------------------------------------------------- reveals */

function initReveals(root = document) {
  const nodes = root.querySelectorAll('[data-reveal]:not([data-in])');
  if (!nodes.length) return;

  if (!('IntersectionObserver' in window)) {
    nodes.forEach((n) => n.setAttribute('data-in', 'true'));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        const node = entry.target;
        node.setAttribute('data-in', 'true');
        io.unobserve(node);
      });
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
  );

  nodes.forEach((node) => {
    /* delay theo vị trí trong cùng nhóm → hiệu ứng so le tự nhiên */
    const siblings = node.parentElement
      ? [...node.parentElement.children].filter((c) => c.hasAttribute('data-reveal'))
      : [];
    const idx = Math.max(0, siblings.indexOf(node));
    node.style.setProperty('--reveal-delay', `${Math.min(idx, 8) * 70}ms`);
    io.observe(node);
  });
}

/* ------------------------------------------------------------ page wiring */

function initFooterYear() {
  document.querySelectorAll('[data-year]').forEach((n) => {
    n.textContent = String(new Date().getFullYear());
  });
}

function skeletonCards(n = 8) {
  return Array.from({ length: n }, () => `
    <div class="skeleton-card">
      <div class="skeleton skeleton--media"></div>
      <div class="skeleton skeleton--line" style="width:70%"></div>
      <div class="skeleton skeleton--line" style="width:40%"></div>
    </div>`).join('');
}

function mediaHtml(item, { alt = '', lazy = true } = {}) {
  if (item.image) {
    return `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(alt || item.name || '')}" ${lazy ? 'loading="lazy"' : ''} decoding="async">`;
  }
  return `<div class="media-fallback" aria-hidden="true"><span>${escapeHtml(initials(item.name) || 'LS')}</span></div>`;
}

/* giá dạng "620.000đ" cho gọn */
function dong(n) {
  return `${fmt.format(Math.round(Number(n) || 0))}đ`;
}

function ratingHtml(p) {
  const r = p.rating;
  if (!r || !r.count) return '';
  return `<span class="star">★</span> ${String(r.average).replace('.', ',')} (${r.count})`;
}

function productCardHtml(p) {
  const href = `/products/${encodeURIComponent(p.slug)}`;
  const soldOut = p.available === false;
  const color = p.categoryColor || catOf(p.category).color;
  const from = p.fromPrice || p.price;
  const orig = p.fromOriginalPrice;
  const showOrig = orig && orig > from;

  return `
    <article class="product-card" data-reveal>
      <a class="product-card__media" href="${href}" style="--c:${escapeHtml(color)}" aria-hidden="true" tabindex="-1">
        <span class="product-card__glyph">${glyphHtml(p)}</span>
      </a>
      <div class="product-card__body">
        <div class="product-card__cat">${escapeHtml(p.category || p.typeLabel || 'Sản phẩm')}${p.rating && p.rating.count ? ' · ' : ''}${ratingHtml(p)}</div>
        <h3 class="product-card__title"><a href="${href}">${escapeHtml(p.name)}</a></h3>
        <p class="product-card__desc">${escapeHtml(p.description || '')}</p>
        <div class="product-card__row">
          <div class="product-card__price${soldOut ? ' dim' : ''}">
            ${
              soldOut
                ? 'Tạm hết hàng'
                : `<span class="ptag">${p.fromVariantName ? '<small>từ</small>' : ''}${dong(from)}</span>${showOrig ? `<s>${dong(orig)}</s>` : ''}`
            }
          </div>
          <a class="product-card__btn" href="${href}" ${soldOut ? 'aria-disabled="true"' : ''}>
            ${soldOut ? 'Chi tiết' : 'Chọn gói'}
          </a>
        </div>
      </div>
    </article>`;
}

/* thẻ "nạp game": cùng khe hàng, tên game thay cho logo */
function gameCardHtml(p) {
  const href = `/products/${encodeURIComponent(p.slug)}`;
  const color = p.categoryColor || catOf(p.category).color;
  const from = p.fromPrice || p.price;
  return `
    <a class="game-card" href="${href}" data-reveal>
      <div class="game-card__top" style="--c:${escapeHtml(color)}">
        <span class="game-card__name">${escapeHtml(p.name)}</span>
        ${p.serviceLabel ? `<span class="game-card__cur">${escapeHtml(p.serviceLabel)}</span>` : ''}
      </div>
      <div class="game-card__body">
        <p class="game-card__desc">${escapeHtml(p.description || '')}</p>
        <div class="game-card__foot">
          <span class="game-card__price"><small>từ</small><span class="ptag">${dong(from)}</span></span>
          <span class="game-card__go">Nạp ngay ${icons.arrow}</span>
        </div>
      </div>
    </a>`;
}

/* thẻ flash sale: một nhãn giảm giá bằng chữ, không huy hiệu */
function flashCardHtml(p) {
  const href = `/products/${encodeURIComponent(p.slug)}`;
  const from = p.fromPrice || p.price;
  const orig = p.fromOriginalPrice;
  const off = orig && orig > from ? Math.round((1 - from / orig) * 100) : null;

  return `
    <article class="flash-card" data-reveal>
      <div class="flash-card__top">
        ${off ? `<span class="flash-card__off">−${off}%</span>` : ''}
        <span class="product-card__cat">${escapeHtml(p.category)}</span>
      </div>
      <h3 class="flash-card__name"><a href="${href}">${escapeHtml(p.name)}</a></h3>
      ${p.fromVariantName ? `<div class="flash-card__pkg">${escapeHtml(p.fromVariantName)}</div>` : ''}
      <p class="flash-card__desc">${escapeHtml(p.description || '')}</p>
      <div class="flash-card__foot">
        <div class="product-card__price"><span class="ptag">${dong(from)}</span>${orig && orig > from ? `<s>${dong(orig)}</s>` : ''}</div>
        <a class="product-card__btn" href="${href}">Chọn gói</a>
      </div>
    </article>`;
}

/* ------------------------------------------------------------------- boot */

/* ------------------------------------------------------------ chuyển cảnh */

const REDUCED = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function initPageTransitions() {
  /* Trình duyệt có View Transition thì tự lo một nhịp mờ 140/200ms. */
  if ('startViewTransition' in document) return;

  /* Fallback: mờ dần sang trang mới */
  const veil = document.createElement('div');
  veil.className = 'page-veil';
  document.body.append(veil);

  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link || link.target || link.hasAttribute('download')) return;
    const url = new URL(link.href, location.href);
    if (url.origin !== location.origin) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

    e.preventDefault();
    veil.setAttribute('data-active', 'true');
    setTimeout(() => {
      location.href = url.href;
    }, 160);
  });

  window.addEventListener('pageshow', () => veil.setAttribute('data-active', 'false'));
}

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  mountBackground();
  mountHeader();
  mountFooter();
  initFooterYear();
  initReveals();
  initPageTransitions();
});
