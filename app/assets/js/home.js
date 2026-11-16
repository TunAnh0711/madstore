/* home.js — hoá đơn ở hero, flash sale, nạp game, tài khoản premium, FAQ */

const FAQS = [
  {
    q: 'Thanh toán xong thì nhận hàng ở đâu',
    a: 'Mở Lịch sử đơn hàng, chọn đơn vừa mua là thấy thông tin nhận hàng. Đơn giao tự động còn được gửi thêm qua email hoặc Discord đã liên kết.',
  },
  {
    q: 'Bao lâu thì đơn được xử lý',
    a: 'Đơn giao tự động có hàng ngay sau khi thanh toán. Đơn làm thủ công như buff hoặc dịch vụ đặc biệt ghi rõ thời gian xử lý ngay trên trang sản phẩm.',
  },
  {
    q: 'Tôi cần cung cấp thông tin gì',
    a: 'Mỗi sản phẩm có danh sách trường riêng: UID game, tên tài khoản hoặc thông tin đăng nhập. Chỉ nhập đúng những gì sản phẩm yêu cầu, ngay ở bước thanh toán.',
  },
  {
    q: 'Nạp ví bằng cách nào',
    a: 'Vào Ví của tôi, chọn số tiền rồi quét mã QR bằng app ngân hàng bất kỳ. Tiền vào ví ngay sau khi hệ thống đối soát, dùng để thanh toán mọi đơn.',
  },
  {
    q: 'Hàng lỗi thì sao',
    a: 'Mỗi sản phẩm ghi rõ thời hạn bảo hành. Trong thời hạn đó, hàng lỗi được đổi mới hoặc hoàn về ví. Mở yêu cầu ngay trong chi tiết đơn.',
  },
];

const CHECK_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12.5 9.5 18 20 6.5"/></svg>';

function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (icons[name]) node.innerHTML = icons[name];
  });
}

function discountOf(p) {
  if (!p.fromOriginalPrice || p.fromOriginalPrice <= p.fromPrice) return 0;
  return 1 - p.fromPrice / p.fromOriginalPrice;
}

/* hoá đơn của đơn gần nhất — sản phẩm làm ra thứ này, nên hero cho xem nó */
function receiptHtml(p) {
  return `
    <div class="receipt" data-reveal>
      <div class="receipt__head"><b>MADSTORE</b><span>đơn gần nhất</span></div>
      <div class="receipt__item">
        <div class="receipt__name">${escapeHtml(p.name)}</div>
        ${p.fromVariantName ? `<div class="receipt__pkg">${escapeHtml(p.fromVariantName)}</div>` : ''}
        <div class="receipt__price">${dong(p.fromPrice || p.price)}</div>
      </div>
      <div class="receipt__divider"></div>
      <div class="receipt__row"><span>Đã giao</span><span class="receipt__time">00:47</span></div>
      <div class="receipt__row"><span>Thanh toán</span><span>Ví MadStore</span></div>
      <div class="receipt__row"><span>Mã đơn</span><span>#MS-8842</span></div>
      <div class="receipt__foot">${CHECK_SVG} Đã hoàn tất</div>
    </div>`;
}

async function loadHome() {
  let data = [];
  try {
    ({ data } = await api.get('/products?limit=200&light=1'));
  } catch (err) {
    const host = document.querySelector('[data-featured]');
    if (host) host.innerHTML = `<div class="empty" style="grid-column:1/-1">Không tải được sản phẩm. ${escapeHtml(err.message)}</div>`;
    return;
  }

  const live = data.filter((p) => p.available !== false);

  /* --- hoá đơn ở hero --- */
  const receiptHost = document.querySelector('[data-receipt]');
  const pick =
    [...live].sort((a, b) => discountOf(b) - discountOf(a))[0] ||
    [...live].sort((a, b) => (b.rating?.count || 0) - (a.rating?.count || 0))[0];
  if (receiptHost) {
    receiptHost.innerHTML = pick ? receiptHtml(pick) : '';
  }

  /* --- giảm giá: 3 mức giảm sâu nhất --- */
  const flashHost = document.querySelector('[data-flash]');
  if (flashHost) {
    const flash = [...live].sort((a, b) => discountOf(b) - discountOf(a)).slice(0, 3);
    flashHost.innerHTML = flash.length
      ? flash.map(flashCardHtml).join('')
      : '<div class="empty" style="grid-column:1/-1">Chưa có chương trình giảm giá</div>';
  }

  /* --- nạp game --- */
  const gameHost = document.querySelector('[data-games]');
  if (gameHost) {
    const games = live.filter((p) => p.category === 'Game');
    gameHost.innerHTML = games.length
      ? games.map(gameCardHtml).join('')
      : '<div class="empty" style="grid-column:1/-1">Danh mục nạp game đang cập nhật</div>';
  }

  /* --- tài khoản premium --- */
  const featHost = document.querySelector('[data-featured]');
  if (featHost) {
    const premium = live.filter((p) => p.category !== 'Game').slice(0, 9);
    featHost.innerHTML = premium.length
      ? premium.map(productCardHtml).join('')
      : '<div class="empty" style="grid-column:1/-1">Cửa hàng đang được cập nhật</div>';
  }

  initReveals();
}

function renderFaq() {
  const host = document.querySelector('[data-faq]');
  if (!host) return;
  host.innerHTML = FAQS.map(
    (f, i) => `
    <div class="faq__item" data-open="false">
      <button class="faq__q" type="button" aria-expanded="false" aria-controls="faq-a-${i}">
        <span>${escapeHtml(f.q)}</span>
        <span class="faq__sign" aria-hidden="true"></span>
      </button>
      <div class="faq__a" id="faq-a-${i}"><div><p>${escapeHtml(f.a)}</p></div></div>
    </div>`,
  ).join('');

  host.addEventListener('click', (e) => {
    const btn = e.target.closest('.faq__q');
    if (!btn) return;
    const item = btn.parentElement;
    const open = item.getAttribute('data-open') === 'true';
    host.querySelectorAll('.faq__item').forEach((n) => {
      n.setAttribute('data-open', 'false');
      n.querySelector('.faq__q').setAttribute('aria-expanded', 'false');
    });
    if (!open) {
      item.setAttribute('data-open', 'true');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  paintIcons();
  renderFaq();
  initReveals();
  loadHome();
});
