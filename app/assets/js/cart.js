/* cart.js — cart page, checkout against the wallet */

let session = null;

function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (icons[name]) node.innerHTML = icons[name];
  });
}

function rowHtml(item) {
  return `
    <article class="cart-row" data-key="${escapeHtml(item.key)}">
      <a class="cart-row__media" href="/products/${encodeURIComponent(item.slug)}">
        ${mediaHtml(item)}
      </a>
      <div style="min-width:0">
        <div class="cart-row__name"><a href="/products/${encodeURIComponent(item.slug)}">${escapeHtml(item.name)}</a></div>
        ${item.variantName ? `<div class="cart-row__variant">${escapeHtml(item.variantName)}</div>` : ''}
        <div class="cart-row__price">${vnd(item.unitPrice)} × ${item.qty}</div>
      </div>
      <div class="cart-row__side">
        <div class="qty">
          <button type="button" data-step="-1" aria-label="Giảm">−</button>
          <input type="number" value="${item.qty}" min="1" max="99" data-qty aria-label="Số lượng">
          <button type="button" data-step="1" aria-label="Tăng">+</button>
        </div>
        <button class="link-btn" data-remove>Xoá</button>
      </div>
    </article>`;
}

function render() {
  const host = document.querySelector('[data-cart-root]');
  const items = cart.read();

  if (!items.length) {
    host.innerHTML = `
      <div class="empty">
        <strong>Giỏ hàng đang trống</strong>
        <span>Chọn vài món trong cửa hàng rồi quay lại đây.</span>
        <a class="btn btn--primary btn--sm" href="/products">Xem cửa hàng</a>
      </div>`;
    return;
  }

  const subtotal = cart.total();
  const demo = Boolean(session && session.demo);
  const balance = !demo && session && session.authenticated ? session.user.balance : null;
  const enough = balance === null || balance >= subtotal;
  const checkoutLabel = demo
    ? 'Đặt hàng (demo)'
    : session && session.authenticated
      ? 'Thanh toán bằng ví'
      : 'Đăng nhập để thanh toán';

  host.innerHTML = `
    <div class="cart-layout">
      <div class="cart-list">${items.map(rowHtml).join('')}</div>
      <aside class="summary">
        <h2>Tóm tắt đơn</h2>
        <div class="summary__row"><span>Tạm tính (${cart.count()} món)</span><span>${vnd(subtotal)}</span></div>
        <div class="summary__row"><span>Phí xử lý</span><span>Miễn phí</span></div>
        ${
          balance !== null
            ? `<div class="summary__row"><span>Số dư ví</span><span class="${enough ? '' : 'amount-pos'}">${vnd(balance)}</span></div>`
            : ''
        }
        <div class="summary__total"><span>Tổng cộng</span><span>${vnd(subtotal)}</span></div>

        ${
          !enough
            ? `<div class="form-error" data-show="true">Số dư ví không đủ. Nạp thêm ${vnd(subtotal - balance)} để thanh toán.</div>
               <a class="btn btn--ghost btn--block" href="/wallet">Nạp ví</a>`
            : ''
        }

        <button class="btn btn--primary btn--lg btn--block" data-checkout>${checkoutLabel}</button>

        <div class="hint-box">
          <span>${
            demo
              ? 'Bản demo giao diện: đơn hàng chỉ được ghi lại trên máy bạn để xem luồng, không có giao dịch thật.'
              : 'Đơn thủ công được nhân viên xử lý trong 24–48 giờ và cập nhật tiến độ trong chi tiết đơn.'
          }</span>
        </div>
      </aside>
    </div>`;

  wireRows(host);
  host.querySelector('[data-checkout]').addEventListener('click', checkout);
}

function wireRows(host) {
  host.querySelectorAll('.cart-row').forEach((row) => {
    const key = row.dataset.key;
    const input = row.querySelector('[data-qty]');

    const apply = (value) => {
      cart.setQty(key, value);
      render();
    };

    row.querySelectorAll('[data-step]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = cart.read().find((i) => i.key === key);
        apply((item ? item.qty : 1) + Number(btn.dataset.step));
      });
    });
    input.addEventListener('change', () => apply(Number(input.value) || 1));
    row.querySelector('[data-remove]').addEventListener('click', () => {
      cart.remove(key);
      render();
      toast('Đã xoá khỏi giỏ');
    });
  });
}

async function checkout() {
  const demo = Boolean(session && session.demo);
  if (!demo && (!session || !session.authenticated)) {
    location.href = '/login?next=/cart';
    return;
  }

  const btn = document.querySelector('[data-checkout]');
  btn.disabled = true;
  btn.textContent = 'Đang xử lý…';

  try {
    const items = cart.read().map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      qty: i.qty,
    }));
    const { data } = await api.post('/orders', { items });
    cart.clear();
    if (demo) {
      toast(`Đã tạo đơn demo · ${data.code}`);
      location.href = `/orders?new=${encodeURIComponent(data.code)}`;
      return;
    }
    clearSession();
    session = await getSession(true);
    toast(`Đặt hàng thành công · ${data.code}`);
    location.href = `/orders?new=${encodeURIComponent(data.code)}`;
  } catch (err) {
    toast(err.message, 'error');
    if (err.code === 'insufficient_balance') {
      setTimeout(() => {
        location.href = '/wallet';
      }, 900);
    }
    btn.disabled = false;
    btn.textContent = demo ? 'Đặt hàng (demo)' : 'Thanh toán bằng ví';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  paintIcons();
  session = await getSession();
  render();
});
