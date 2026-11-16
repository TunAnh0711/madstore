/* account.js — profile, wallet snapshot, recent orders */

document.addEventListener('DOMContentLoaded', async () => {
  const host = document.querySelector('[data-account-root]');
  const session = await getSession();

  if (session.demo) {
    host.innerHTML = `
      <div class="empty">
        <strong>Bản demo giao diện</strong>
        <span>Tài khoản, ví và điểm thưởng chưa bật ở bản demo. Bạn vẫn xem sản phẩm và đặt hàng thử được.</span>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;justify-content:center">
          <a class="btn btn--primary btn--sm" href="/products">Xem cửa hàng</a>
          <a class="btn btn--ghost btn--sm" href="/orders">Đơn demo</a>
        </div>
      </div>`;
    return;
  }

  if (!session.authenticated) {
    host.innerHTML = `
      <div class="empty">
        <strong>Bạn chưa đăng nhập</strong>
        <span>Đăng nhập để xem ví, điểm thưởng và đơn hàng.</span>
        <a class="btn btn--primary btn--sm" href="/login?next=/account">Đăng nhập</a>
      </div>`;
    return;
  }

  const user = session.user;
  let orders = [];
  try {
    const res = await api.get('/orders');
    orders = res.data;
  } catch {
    orders = [];
  }

  const spent = orders.reduce((n, o) => n + o.total, 0);

  host.innerHTML = `
    <div class="section-head" style="margin-bottom:24px">
      <div>
        <p class="eyebrow">Tài khoản</p>
        <h1 class="section-head__title">${escapeHtml(user.name)}</h1>
        <p class="section-head__sub">${escapeHtml(user.email)} · tham gia ${dateOnly(user.createdAt)}</p>
      </div>
      <button class="btn btn--ghost btn--sm" data-logout>Đăng xuất</button>
    </div>

    <div class="tiles" style="margin-bottom:24px">
      <div class="stat">
        <div class="stat__label">Số dư ví</div>
        <div class="stat__value">${vnd(user.balance)}</div>
        <a class="section-head__link" href="/wallet" style="margin-top:.5rem">Nạp thêm <span data-icon="arrow"></span></a>
      </div>
      <div class="stat" id="points">
        <div class="stat__label">Điểm thưởng</div>
        <div class="stat__value">${fmt.format(user.points)}</div>
        <span class="dim" style="font-size:.78rem">1 điểm / 10.000 VNĐ</span>
      </div>
      <div class="stat">
        <div class="stat__label">Đơn hàng</div>
        <div class="stat__value">${orders.length}</div>
        <a class="section-head__link" href="/orders" style="margin-top:.5rem">Xem tất cả <span data-icon="arrow"></span></a>
      </div>
      <div class="stat">
        <div class="stat__label">Tổng đã chi</div>
        <div class="stat__value">${vnd(spent)}</div>
      </div>
    </div>

    <div class="cart-layout">
      <section class="card">
        <h2 style="font-size:1.05rem;margin-bottom:1rem">Thông tin cá nhân</h2>
        <form class="auth-form" data-profile>
          <div class="field">
            <label for="name">Tên hiển thị</label>
            <input class="input" id="name" name="name" value="${escapeHtml(user.name)}" required>
          </div>
          <div class="field">
            <label for="phone">Số điện thoại (tuỳ chọn)</label>
            <input class="input" id="phone" name="phone" value="${escapeHtml(user.phone || '')}" placeholder="09xx xxx xxx">
          </div>
          <div class="field">
            <label for="email">Email</label>
            <input class="input" id="email" value="${escapeHtml(user.email)}" disabled>
          </div>
          <div class="form-error" data-error></div>
          <button class="btn btn--primary" type="submit" style="justify-self:start">Lưu thay đổi</button>
        </form>
      </section>

      <aside class="summary">
        <h2>Đơn gần đây</h2>
        ${
          orders.length
            ? orders
                .slice(0, 4)
                .map(
                  (o) => `
              <div class="summary__row">
                <span><span class="mono">${escapeHtml(o.code)}</span><br><span class="dim" style="font-size:.75rem">${shortDate(o.createdAt)}</span></span>
                <span>${vnd(o.total)}</span>
              </div>`,
                )
                .join('')
            : '<p class="dim" style="font-size:.85rem">Chưa có đơn nào. Đơn đầu tiên sẽ hiện ở đây.</p>'
        }
        <a class="btn btn--ghost btn--block" href="/orders">Lịch sử đơn hàng</a>
      </aside>
    </div>`;

  host.querySelectorAll('[data-icon]').forEach((n) => {
    if (icons[n.getAttribute('data-icon')]) n.innerHTML = icons[n.getAttribute('data-icon')];
  });

  host.querySelector('[data-logout]').addEventListener('click', async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    clearSession();
    toast('Đã đăng xuất');
    setTimeout(() => {
      location.href = '/';
    }, 500);
  });

  const form = host.querySelector('[data-profile]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errBox = form.querySelector('[data-error]');
    errBox.setAttribute('data-show', 'false');
    try {
      await api.patch('/users/me', {
        name: form.name.value.trim(),
        phone: form.phone.value.trim(),
      });
      clearSession();
      toast('Đã lưu thông tin');
    } catch (err) {
      errBox.textContent = err.message;
      errBox.setAttribute('data-show', 'true');
    }
  });
});
