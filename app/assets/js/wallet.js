/* wallet.js — balance, QR top-up flow, transaction history */

const PRESETS = [20000, 50000, 100000, 200000, 500000, 1000000];

let wallet = null;
let pendingTopup = null;

function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (icons[name]) node.innerHTML = icons[name];
  });
}

const STATUS_LABEL = {
  pending: { text: 'Chờ xử lý', cls: 'badge--info' },
  paid: { text: 'Thành công', cls: 'badge--success' },
  processing: { text: 'Đang xử lý', cls: 'badge--info' },
  delivered: { text: 'Hoàn tất', cls: 'badge--success' },
  cancelled: { text: 'Đã huỷ', cls: 'badge--neutral' },
};

function historyRows(history) {
  if (!history.length) return '<tr><td colspan="5" class="dim">Chưa có giao dịch nào.</td></tr>';
  return history
    .map((h) => {
      const st = STATUS_LABEL[h.status] || STATUS_LABEL.processing;
      return `
    <tr>
      <td class="mono">${escapeHtml(h.id.slice(0, 8))}</td>
      <td>${escapeHtml(h.note)}</td>
      <td class="${h.amount > 0 ? 'amount-pos' : 'amount-neg'}">${h.amount > 0 ? '+' : ''}${vnd(h.amount)}</td>
      <td><span class="badge ${st.cls}">${st.text}</span></td>
      <td class="dim">${shortDate(h.createdAt)}</td>
    </tr>`;
    })
    .join('');
}

function render() {
  const host = document.querySelector('[data-wallet-root]');
  host.innerHTML = `
    <div class="section-head" style="margin-bottom:1.5rem">
      <div>
        <p class="eyebrow">Ví của tôi</p>
        <h1 class="section-head__title">Số dư ${vnd(wallet.balance)}</h1>
        <p class="section-head__sub">Nạp bằng mã QR ngân hàng hoặc thẻ cào. Tiền vào ví ngay sau khi hệ thống đối soát.</p>
      </div>
      <a class="btn btn--ghost btn--sm" href="/account">Về tài khoản</a>
    </div>

    <div class="tiles" style="margin-bottom:1.5rem">
      <div class="stat">
        <div class="stat__label">Số dư khả dụng</div>
        <div class="stat__value">${vnd(wallet.balance)}</div>
      </div>
      <div class="stat">
        <div class="stat__label">Điểm thưởng</div>
        <div class="stat__value">${fmt.format(wallet.points || 0)}</div>
      </div>
      <div class="stat">
        <div class="stat__label">Giao dịch</div>
        <div class="stat__value">${wallet.history.length}</div>
      </div>
    </div>

    <div class="wallet-layout">
    <section class="card wallet-form">
      <h2 style="font-size:1.05rem;margin-bottom:1rem">Nạp tiền</h2>
      <div class="field" style="margin-bottom:1rem">
        <label>Số tiền</label>
        <div class="chip-row">
          ${PRESETS.map((p) => `<button class="chip" type="button" data-preset="${p}">${vnd(p)}</button>`).join('')}
        </div>
      </div>

      <div class="field" style="margin-bottom:1rem">
        <label for="amount">Hoặc nhập số khác</label>
        <input class="input" id="amount" type="number" min="10000" max="20000000" step="1000" value="100000" data-amount>
      </div>

      <div class="field" style="margin-bottom:1.25rem">
        <label>Phương thức</label>
        <div class="chip-row">
          <button class="chip" type="button" data-method="qr" aria-pressed="true">Chuyển khoản QR</button>
          <button class="chip" type="button" data-method="card" aria-pressed="false">Thẻ cào</button>
        </div>
      </div>

      <button class="btn btn--primary btn--lg" data-create-topup>Tạo lệnh nạp</button>
      <div class="form-error" data-error style="margin-top:.75rem"></div>

      <div data-topup-panel></div>
    </section>

    <section class="wallet-history">
      <div class="section-head" style="margin-bottom:1rem">
        <h2 class="section-head__title" style="font-size:1.25rem">Lịch sử giao dịch</h2>
      </div>
      <div style="overflow-x:auto">
        <table class="table">
          <thead><tr><th>Mã</th><th>Nội dung</th><th>Số tiền</th><th>Trạng thái</th><th>Thời gian</th></tr></thead>
          <tbody>${historyRows(wallet.history)}</tbody>
        </table>
      </div>
    </section>
    </div>`;

  wire();
}

function renderTopupPanel(topup) {
  const panel = document.querySelector('[data-topup-panel]');
  const isQr = topup.method === 'qr';

  panel.innerHTML = `
    <div class="qr-panel" style="margin-top:1.5rem">
      ${
        isQr
          ? `<img src="/api/v1/qr?amount=${topup.amount}&code=${encodeURIComponent(topup.code)}" alt="Mã QR nạp ${vnd(topup.amount)}" width="180" height="180">`
          : `<div class="hero-tile__icon" style="width:96px;height:96px;border-radius:20px">${icons.qr}</div>`
      }
      <div>
        <div class="eyebrow">${isQr ? 'Quét mã để chuyển khoản' : 'Nhập mã thẻ cào'}</div>
        <div style="font-family:var(--font-display);font-size:1.4rem;font-weight:600;margin:.35rem 0">${vnd(topup.amount)}</div>
        <div class="dim" style="font-size:.82rem">
          Nội dung chuyển khoản: <span class="mono">${escapeHtml(topup.code)}</span><br>
          ${
            isQr
              ? 'Mở app ngân hàng bất kỳ, quét mã và giữ nguyên nội dung. Hệ thống đối soát tự động trong vài giây.'
              : 'Gửi mã thẻ cho nhân viên trong ticket Discord, hệ thống cộng ví ngay khi xác thực xong.'
          }
        </div>
        <button class="btn btn--primary btn--sm" data-confirm-topup style="margin-top:1rem">
          ${isQr ? 'Tôi đã chuyển khoản' : 'Tôi đã gửi mã thẻ'}
        </button>
      </div>
    </div>`;

  panel.querySelector('[data-confirm-topup]').addEventListener('click', async () => {
    try {
      await api.post(`/wallet/topup/${topup.id}/confirm`);
      clearSession();
      toast(`Đã cộng ${vnd(topup.amount)} vào ví`);
      await load();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
}

function wire() {
  let method = 'qr';
  const amountInput = document.querySelector('[data-amount]');
  const errorBox = document.querySelector('[data-error]');

  document.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      amountInput.value = btn.dataset.preset;
      document.querySelectorAll('[data-preset]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  document.querySelectorAll('[data-method]').forEach((btn) => {
    btn.addEventListener('click', () => {
      method = btn.dataset.method;
      document.querySelectorAll('[data-method]').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  document.querySelector('[data-create-topup]').addEventListener('click', async (e) => {
    errorBox.setAttribute('data-show', 'false');
    const amount = Number(amountInput.value);
    if (!amount || amount < 10000) {
      errorBox.textContent = 'Số tiền nạp tối thiểu 10.000 VNĐ.';
      errorBox.setAttribute('data-show', 'true');
      return;
    }
    e.currentTarget.disabled = true;
    try {
      const { data } = await api.post('/wallet/topup', { amount, method });
      pendingTopup = data;
      renderTopupPanel(data);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.setAttribute('data-show', 'true');
    }
    e.currentTarget.disabled = false;
  });
}

async function load() {
  try {
    const { data } = await api.get('/wallet');
    wallet = data;
    render();
    if (pendingTopup) renderTopupPanel(pendingTopup);
  } catch (err) {
    document.querySelector('[data-wallet-root]').innerHTML = `
      <div class="empty">
        <strong>Không tải được ví</strong>
        <span>${escapeHtml(err.message)}</span>
        <a class="btn btn--primary btn--sm" href="/login?next=/wallet">Đăng nhập</a>
      </div>`;
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  paintIcons();
  const session = await getSession();
  if (session.demo) {
    document.querySelector('[data-wallet-root]').innerHTML = `
      <div class="empty">
        <strong>Bản demo giao diện</strong>
        <span>Ví điện tử chưa bật ở bản demo. Bạn vẫn xem sản phẩm và đặt hàng thử được.</span>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center">
          <a class="btn btn--primary btn--sm" href="/products">Xem cửa hàng</a>
          <a class="btn btn--ghost btn--sm" href="/orders">Đơn demo</a>
        </div>
      </div>`;
    return;
  }
  if (!session.authenticated) {
    document.querySelector('[data-wallet-root]').innerHTML = `
      <div class="empty">
        <strong>Bạn chưa đăng nhập</strong>
        <span>Đăng nhập để xem số dư và nạp tiền vào ví.</span>
        <a class="btn btn--primary btn--sm" href="/login?next=/wallet">Đăng nhập</a>
      </div>`;
    return;
  }
  await load();
});
