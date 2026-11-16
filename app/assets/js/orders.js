/* orders.js — order history with per-item delivery info */

const STATUS = {
  processing: { label: 'Đang xử lý', cls: 'badge--info' },
  delivered: { label: 'Đã giao', cls: 'badge--success' },
  cancelled: { label: 'Đã huỷ', cls: 'badge--neutral' },
  refunded: { label: 'Đã hoàn tiền', cls: 'badge--danger' },
};

function orderCard(order, highlight) {
  const status = STATUS[order.status] || STATUS.processing;
  return `
    <article class="card" style="margin-bottom:.85rem;${highlight ? 'border-color:var(--border-strong);box-shadow:var(--shadow-soft)' : ''}" data-reveal>
      <div style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;justify-content:space-between;margin-bottom:1rem">
        <div>
          <div style="font-family:var(--font-mono);font-size:.9rem;font-weight:600">${escapeHtml(order.code)}</div>
          <div class="dim" style="font-size:.78rem">${shortDate(order.createdAt)} · ${order.items.length} món</div>
        </div>
        <div style="display:flex;align-items:center;gap:.6rem">
          <span class="badge ${status.cls}"><span class="dot"></span>${status.label}</span>
          <span style="font-family:var(--font-display);font-size:1.05rem;font-weight:600">${vnd(order.total)}</span>
        </div>
      </div>

      <div class="cart-list">
        ${order.items
          .map(
            (i) => `
          <div class="cart-row">
            <div class="cart-row__media">${mediaHtml(i)}</div>
            <div style="min-width:0">
              <div class="cart-row__name">${escapeHtml(i.name)}</div>
              ${i.variantName ? `<div class="cart-row__variant">${escapeHtml(i.variantName)}</div>` : ''}
              <div class="cart-row__price">${vnd(i.unitPrice)} × ${i.qty}</div>
            </div>
            <div class="cart-row__side">
              <span class="badge ${i.deliveryType === 'MANUAL' ? 'badge--outline' : 'badge--solid'}">
                ${i.deliveryType === 'MANUAL' ? 'Thủ công' : 'Tự động'}
              </span>
            </div>
          </div>`,
          )
          .join('')}
      </div>

      ${
        order.note
          ? `<p class="dim" style="font-size:.8rem;margin-top:.75rem">Ghi chú: ${escapeHtml(order.note)}</p>`
          : ''
      }
    </article>`;
}

document.addEventListener('DOMContentLoaded', async () => {
  const host = document.querySelector('[data-orders-root]');
  const session = await getSession();

  const demo = Boolean(session.demo);
  if (!session.authenticated && !demo) {
    host.innerHTML = `
      <div class="empty">
        <strong>Bạn chưa đăng nhập</strong>
        <span>Đăng nhập để xem lịch sử đơn hàng.</span>
        <a class="btn btn--primary btn--sm" href="/login?next=/orders">Đăng nhập</a>
      </div>`;
    return;
  }

  let orders = [];
  try {
    const res = await api.get('/orders');
    orders = res.data;
  } catch (err) {
    host.innerHTML = `<div class="empty">${escapeHtml(err.message)}</div>`;
    return;
  }

  const highlight = new URLSearchParams(location.search).get('new');

  host.innerHTML = `
    <div class="section-head" style="margin-bottom:1.5rem">
      <div>
        <p class="eyebrow">Đơn hàng</p>
        <h1 class="section-head__title">Lịch sử đơn của bạn</h1>
        <p class="section-head__sub">${
          demo
            ? 'Bản demo giao diện — đơn dưới đây chỉ lưu trên máy bạn, không có giao dịch thật.'
            : 'Mở đơn để xem hàng đã giao, tiến độ xử lý và hạn bảo hành từng món.'
        }</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="/products">Mua thêm</a>
    </div>
    ${
      orders.length
        ? orders.map((o) => orderCard(o, highlight && o.code === highlight)).join('')
        : `<div class="empty">
             <strong>Chưa có đơn nào</strong>
             <span>Đơn đầu tiên của bạn sẽ hiện ở đây ngay sau khi thanh toán.</span>
             <a class="btn btn--primary btn--sm" href="/products">Xem cửa hàng</a>
           </div>`
    }`;

  initReveals(host);
});
