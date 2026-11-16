/* product.js — product detail: variants, quantity, cart hand-off */

const pdp = {
  product: null,
  variantId: null,
  qty: 1,
};

function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (icons[name]) node.innerHTML = icons[name];
  });
}

function currentVariant() {
  if (!pdp.product) return null;
  return pdp.product.variants.find((v) => v.id === pdp.variantId) || pdp.product.variants[0] || null;
}

function unitPrice() {
  const v = currentVariant();
  return v ? v.price : pdp.product.price;
}

function lineTotal() {
  return unitPrice() * pdp.qty;
}

function syncTotals() {
  document.querySelectorAll('[data-line-total]').forEach((n) => {
    n.textContent = dong(lineTotal());
  });
  const sticky = document.querySelector('[data-sticky-total]');
  if (sticky) sticky.textContent = dong(lineTotal());
  const price = document.querySelector('[data-price]');
  if (price) price.textContent = dong(unitPrice());
}

function render(product) {
  pdp.product = product;
  const soldOut = product.available === false;
  const firstAvailable = product.variants.find((v) => v.available !== false) || product.variants[0];
  pdp.variantId = firstAvailable ? firstAvailable.id : null;

  const deliveryBadge =
    product.deliveryType === 'MANUAL'
      ? '<span class="badge badge--outline">Xử lý thủ công</span>'
      : '<span class="badge badge--solid">Giao tự động</span>';

  const typeBadge = `<span class="badge">${escapeHtml(product.typeLabel)}</span>`;
  const ratingBadge =
    product.rating && product.rating.count
      ? `<span class="badge">★ ${String(product.rating.average).replace('.', ',')} (${product.rating.count})</span>`
      : '';

  const variants = product.variants.length
    ? `
      <div class="pdp__block">
        <div class="pdp__block-label">
          <span>Chọn gói</span>
          <span>${product.variants.length} lựa chọn</span>
        </div>
        <div class="variant-list" role="group" aria-label="Chọn gói">
          ${product.variants
            .map((v) => {
              const off = v.available === false;
              const orig = v.originalPrice && v.originalPrice > v.price ? `<s>${dong(v.originalPrice)}</s>` : '';
              return `
            <button class="variant" type="button" data-variant="${escapeHtml(v.id)}"
              aria-pressed="${v.id === pdp.variantId}" ${off ? 'disabled' : ''}>
              <span class="variant__name">${escapeHtml(v.name)}</span>
              <span class="variant__price">${off ? 'Hết hàng' : `${dong(v.price)} ${orig}`}</span>
            </button>`;
            })
            .join('')}
        </div>
      </div>`
    : '';

  const color = product.categoryColor || catOf(product.category).color;

  document.querySelector('[data-breadcrumb]').innerHTML = `
    <a href="/">Trang chủ</a><span>/</span>
    <a href="/products">Sản phẩm</a><span>/</span>
    <a href="/products?category=${encodeURIComponent(product.category)}">${escapeHtml(product.category)}</a><span>/</span>
    <span class="dim">${escapeHtml(product.name)}</span>`;

  document.querySelector('[data-pdp]').innerHTML = `
    <div class="pdp">
      <div class="pdp__media" style="--c:${escapeHtml(color)}">
        <span class="pdp__glyph">${glyphHtml(product, { size: 96 })}</span>
        <span class="pdp__media-cap">${escapeHtml(product.category)} · ${product.deliveryType === 'MANUAL' ? 'xử lý thủ công' : 'giao tự động'}</span>
      </div>

      <div>
        <div class="pdp__badges">${deliveryBadge}${typeBadge}${ratingBadge}</div>
        <h1 class="pdp__title">${escapeHtml(product.name)}</h1>
        <div class="pdp__price">${
          soldOut ? '<span class="dim" style="font-size:.62em">Tạm hết hàng</span>' : `<span data-price>${dong(unitPrice())}</span>`
        }</div>

        ${variants}

        <div class="pdp__block">
          <div class="pdp__block-label"><span>Số lượng</span><span>Mỗi đơn: 1 – 20</span></div>
          <div class="qty">
            <button type="button" data-qty="-1" aria-label="Giảm" ${soldOut ? 'disabled' : ''}>−</button>
            <input type="number" value="1" min="1" max="20" data-qty-input aria-label="Số lượng" ${soldOut ? 'disabled' : ''}>
            <button type="button" data-qty="1" aria-label="Tăng" ${soldOut ? 'disabled' : ''}>+</button>
          </div>
        </div>

        <div class="pdp__actions">
          ${
            soldOut
              ? `<button class="btn btn--ghost btn--lg" type="button" disabled>Thêm vào giỏ</button>
                 <button class="btn btn--primary btn--lg" type="button" disabled>Tạm hết hàng</button>`
              : `<button class="btn btn--ghost btn--lg" data-add>Thêm vào giỏ</button>
                 <button class="btn btn--primary btn--lg" data-buy>Mua ngay</button>`
          }
        </div>

        <dl class="pdp__facts">
          ${soldOut ? '' : `<div class="pdp__fact"><dt>Tạm tính</dt><dd data-line-total>${dong(lineTotal())}</dd></div>`}
          <div class="pdp__fact">
            <dt>Hình thức giao</dt>
            <dd>${product.deliveryType === 'MANUAL' ? 'Nhân viên xử lý tay' : 'Hệ thống tự động'}</dd>
          </div>
          <div class="pdp__fact"><dt>Thời gian xử lý</dt><dd>${product.deliveryType === 'MANUAL' ? '24 – 48 giờ' : 'Vài phút'}</dd></div>
          <div class="pdp__fact"><dt>Bảo hành</dt><dd>${product.deliveryType === 'MANUAL' ? 'Theo từng món' : 'Không bảo hành'}</dd></div>
        </dl>

        <div class="pdp__desc">
          <h3>Mô tả sản phẩm</h3>
          <p>${escapeHtml(product.description || 'Sản phẩm chưa có mô tả chi tiết.')}</p>
        </div>

        ${
          product.guarantees && product.guarantees.length
            ? `<div class="pdp__desc">
                 <h3>${escapeHtml(product.guaranteesTitle || 'Cam kết')}</h3>
                 <ul class="checklist">${product.guarantees.map((g) => `<li>${escapeHtml(g)}</li>`).join('')}</ul>
               </div>`
            : ''
        }

        ${
          product.instructions
            ? `<div class="pdp__desc">
                 <h3>Hướng dẫn</h3>
                 <p>${escapeHtml(product.instructions)}</p>
               </div>`
            : ''
        }
      </div>
    </div>`;

  paintIcons();
  wire();

  document.title = `${product.name} — MadStore`;
}

function wire() {
  document.querySelectorAll('[data-variant]:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', () => {
      pdp.variantId = btn.dataset.variant;
      document.querySelectorAll('[data-variant]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b === btn));
      });
      syncTotals();
    });
  });

  const input = document.querySelector('[data-qty-input]');
  document.querySelectorAll('[data-qty]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = Number(btn.dataset.qty);
      pdp.qty = Math.min(20, Math.max(1, pdp.qty + delta));
      input.value = String(pdp.qty);
      syncTotals();
    });
  });
  input.addEventListener('change', () => {
    pdp.qty = Math.min(20, Math.max(1, Number(input.value) || 1));
    input.value = String(pdp.qty);
    syncTotals();
  });

  const addToCart = () => {
    const variant = currentVariant();
    cart.add(
      {
        key: `${pdp.product.id}::${variant ? variant.id : ''}`,
        productId: pdp.product.id,
        variantId: variant ? variant.id : null,
        name: pdp.product.name,
        variantName: variant ? variant.name : null,
        slug: pdp.product.slug,
        image: pdp.product.image,
        unitPrice: variant ? variant.price : pdp.product.price,
      },
      pdp.qty,
    );
    toast(`Đã thêm “${pdp.product.name}” vào giỏ`);
  };

  const addBtn = document.querySelector('.pdp__actions [data-add]');
  const buyBtn = document.querySelector('.pdp__actions [data-buy]');
  if (addBtn) addBtn.addEventListener('click', addToCart);
  if (buyBtn)
    buyBtn.addEventListener('click', () => {
      addToCart();
      location.href = '/cart';
    });
  const stickyBtn = document.querySelector('.sticky-buy [data-add]');
  if (stickyBtn) {
    if (pdp.product.available === false) stickyBtn.disabled = true;
    else stickyBtn.addEventListener('click', addToCart);
  }
}

async function boot() {
  const slug = decodeURIComponent(location.pathname.replace(/^\/products\//, '').replace(/\/$/, ''));
  if (!slug) {
    location.replace('/products');
    return;
  }
  try {
    const { data } = await api.get(`/products/${encodeURIComponent(slug)}`);
    render(data);
  } catch (err) {
    document.querySelector('[data-pdp]').innerHTML = `
      <div class="empty">
        <strong>Không tìm thấy sản phẩm</strong>
        <span>${escapeHtml(err.message)}</span>
        <a class="btn btn--ghost btn--sm" href="/products">Về cửa hàng</a>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', boot);
