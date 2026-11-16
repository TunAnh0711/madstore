# MadStore — bản dựng lại (clone) để nâng cấp

Bản clone chạy được của `https://lumiestore.uk/`: **cùng giao diện, cùng danh mục sản phẩm và giá**,
đã đổi nhận diện thành **MadStore**, kèm một lớp API nội bộ (`/api/v1/...`), đăng nhập, ví, giỏ hàng
và đơn hàng thật (lưu trên máy bạn).

Toàn bộ chạy **offline, không phụ thuộc dịch vụ ngoài**, không cần `npm install`.

---

## Chạy thử

```bash
node server/server.mjs
```

Mở http://localhost:4321

Tài khoản dùng thử (đã có sẵn 500.000 VNĐ trong ví):

| Email | Mật khẩu |
|---|---|
| `demo@madstore.vn` | `123456` |

Đổi cổng: `PORT=5000 node server/server.mjs`

Yêu cầu: Node 18+ (đã test trên Node 22).

---

## Cấu trúc

```
├─ app/                        # front-end tĩnh (không build, không bundler)
│  ├─ index.html               # trang chủ (hero + flash sale + nạp game + premium + VIP + FAQ)
│  ├─ products.html            # cửa hàng (chip danh mục + tìm + sắp xếp)
│  ├─ product.html             # chi tiết sản phẩm (chọn gói, cam kết, hướng dẫn)
│  ├─ cart.html                # giỏ hàng + thanh toán bằng ví
│  ├─ login.html / register.html
│  ├─ account.html             # hồ sơ, số dư, điểm, đơn gần đây
│  ├─ wallet.html              # nạp ví bằng QR / thẻ cào + lịch sử giao dịch
│  ├─ orders.html              # lịch sử đơn, trạng thái từng món
│  ├─ 404.html
│  └─ assets/
│     ├─ css/  fonts.css · theme.css (design token) · app.css (component)
│     ├─ js/   core.js (API client, cart store, header/footer, card render)
│     │        home.js · products.js · product.js · cart.js · auth.js
│     │        account.js · wallet.js · orders.js
│     ├─ data/catalog.json    # bản tĩnh của danh mục, dùng khi không có API
│     ├─ fonts/   Bricolage Grotesque + Be Vietnam Pro + Inter (woff2, subset tiếng Việt)
│     └─ img/
├─ netlify.toml                # cấu hình deploy Netlify (chế độ demo UI)
├─ tools/
│  ├─ import-catalog.mjs       # tools/data/lumie-products.json → server/data/products.json
│  ├─ sync-catalog.mjs         # products.json → app/data/catalog.json
│  ├─ serve-static.mjs         # xem trước bản tĩnh, giả lập rewrite của Netlify
│  └─ data/lumie-products.json # dữ liệu gốc tải từ lumiestore.uk/api/products
├─ server/
│  ├─ server.mjs               # HTTP server + /api/v1/* (zero dependency)
│  └─ data/
│     ├─ products.json         # 28 sản phẩm / 99 gói — nhập từ lumiestore.uk
│     ├─ db.seed.json          # dữ liệu mẫu (tài khoản demo), dùng cho lần chạy đầu
│     └─ db.json               # users / sessions / orders / topups (sinh ra lúc chạy, không commit)
└─ _shots/                     # ảnh chụp từng trang
```

---

## Giao diện — hướng "quầy kiosk 24h"

Sau một lượt unslop, hệ thị giác chuyển từ neo-brutalist ồn ào sang **giấy ấm + mực + một thẻ giá**.
Chrome im (hairline, surface step), màu để dành cho đúng hai chỗ: **thẻ giá** và **logo thương hiệu**.
Token nằm trong `app/assets/css/theme.css`.

| Token | Light (mặc định) | Dark |
|---|---|---|
| `--paper` nền | `#f7f3ea` | `#14110e` |
| `--card` khối | `#fffdf8` | `#1c1814` |
| `--ink` chữ | `#1b1815` | `#f0e9dd` |
| `--ink-2` / `--ink-3` | `#56504a` / `#857d72` | `#b3a99b` / `#8a8175` |
| `--accent` | `#b4460d` (ember, 5.6:1 trên nền) | `#f08a3c` |
| `--line` | ink 10% | ink 10% |
| bo góc | tag 6 · control 10 · card 14 · panel 18 | nt |
| bóng | `0 1px 2px` / `0 8px 24px` | đen, đậm hơn |

**Dấu hiệu riêng (signature):** mọi giá đều là mono, `tabular-nums`, có **gạch chân 2px màu accent**
dưới đúng con số mới — đọc như thẻ giá trên kệ. Không chỗ nào khác dùng accent.

Chi tiết đã dựng:

- **Header**: wordmark chữ "MadStore" một màu, nav chữ thường (mục đang xem có gạch chân accent 2px),
  ô tìm kiếm 36px, icon 16px màu muted. Ẩn ô tìm kiếm ở trang `/products` vì trang đó đã có ô riêng.
- **Hero** 2 cột: tiêu đề 44px weight 600, lede 17px, hai nút (chính = mực đặc), dải số liệu mono.
  Cột phải là **hoá đơn của đơn gần nhất** — sản phẩm làm ra thứ này nên hero cho xem nó:
  mép trên răng cưa, dòng kẻ đứt, giá có gạch accent, "Đã giao 00:47" màu accent, "Đã hoàn tất" màu xanh.
- **Khe hàng (card)**: nền pha 5% màu thương hiệu, logo giữ màu thật, hairline, bo 14. Không huy hiệu,
  không dải màu đặc, không bóng cứng.
- **Card nạp game**: cùng khe hàng, tên game thay cho logo.
- **Flash sale**: nhãn `−87%` bằng chữ accent, không chip nền.
- **VIP**: một dải hairline, không còn khối vàng.
- **Cam kết**: 4 cột ngăn bằng hairline, không 4 cái hộp.
- **FAQ**: hàng hairline + dấu cộng xoay, không hộp.
- Font self-host: **Bricolage Grotesque** (display, 600) + **Be Vietnam Pro** (body, 400/500).

---

## Chuyển cảnh & animation

Một đường cong duy nhất `cubic-bezier(.22, 1, .36, 1)`, ba nhịp: 140ms hover, 180ms mở/đóng, 400ms vào trang.

- **Chuyển trang**: `@view-transition` chỉ **mờ** 140ms → 200ms, không trượt, không phóng. Fallback Firefox/Safari:
  `.page-veil` mờ dần.
- **Vào trang**: mỗi khối `[data-reveal]` mờ dần + nhích lên **8px**, so le 50ms, tối đa 6 nhịp.
  Dùng `@keyframes` + `fill-mode: backwards` để không đè transition hover của card.
- **Hover**: chỉ đổi màu nền / viền / màu chữ. Card nhích lên **1px** và hiện bóng nhẹ — không scale, không xoay.
- **Bấm**: `scale(.985)`, 140ms.
- Bỏ hết: gợn nước, lò xo nảy, logo phóng to, nhãn tự xoay, chấm thở.
- `prefers-reduced-motion: reduce` tắt sạch animation và chuyển cảnh.

---

## Danh mục (nhập từ lumiestore.uk)

**28 sản phẩm / 99 gói**, đúng tên, đúng giá, đúng mô tả, cam kết và hướng dẫn của site gốc.

| Danh mục | Sản phẩm | Ví dụ |
|---|---|---|
| Discord | 8 | Nitro Boost, Dec0 Login, Dec0 Link Gift, Boost Server, Badge quà tặng |
| Game | 5 | Robux, Liên Quân, Free Fire, Genshin, PUBG (bảo trì) |
| Chat AI | 2 | GPT Plus, Gemini Pro |
| Netflix / Spotify / YouTube | 4 | Netflix Premium, Spotify Premium, YouTube Premium |
| Canva / CapCut | 2 | Canva Edu, Capcut Pro |
| Buff mxh | 5 | Facebook, TikTok, Instagram, YouTube, Shopee |
| Khác | 2 | Hỗ Trợ Rank |

Nhập lại từ dữ liệu gốc bất cứ lúc nào:

```bash
node tools/import-catalog.mjs   # tools/data/lumie-products.json → server/data/products.json
node tools/sync-catalog.mjs     # → app/data/catalog.json (cho chế độ demo)
```

Mỗi sản phẩm giữ thêm: `badge`, `rating`, `categoryColor`, `guarantees`, `instructions`,
`discountPct`, và mỗi gói giữ `originalPrice` (giá gốc để gạch ngang).

---

## Cần biết trước khi dùng thật

Đây là **bản dựng lại phục vụ học tập và để bạn nâng cấp tiếp**, không phải bản sao chạy production.

| Hạng mục | Trạng thái |
|---|---|
| Backend | Mô phỏng. Dữ liệu trong `server/data/db.json`, không có DB thật, không có phân quyền admin. |
| Thanh toán | Giả lập. Mã QR là hình vẽ (không quét được). Nút "Tôi đã chuyển khoản" tự cộng tiền. |
| Đăng nhập | Email + mật khẩu cục bộ. Site gốc dùng tài khoản riêng. |
| Ảnh sản phẩm | Phần lớn trỏ CDN gốc; sản phẩm không có ảnh thì hiện logo thương hiệu hoặc chữ viết tắt. |
| Đơn thật | Không có. Không có tồn kho, không có giao hàng thật. |

**Về bản quyền:** cấu trúc, CSS, component thì thoải mái dùng làm nền. Nhưng **tên "Lumie Store",
logo, ảnh sản phẩm, mô tả và cam kết là của họ** — trước khi đưa lên công khai, thay bằng nội dung
của bạn. Nếu đây là site của chính bạn thì bỏ qua ghi chú này.

---

## Nâng cấp tiếp — gợi ý chỗ nên sửa

- **Đổi nhận diện**: sửa token trong `app/assets/css/theme.css`.
- **Đổi tên/logo**: `SPARK_SVG` + `.brand__word` trong `app/assets/js/core.js`.
- **Thêm trang mới**: copy một `*.html`, nhớ `<header data-header>` + `<footer data-footer>` và nạp `core.js`;
  thêm route vào `PAGE_ROUTES` trong `server/server.mjs` nếu muốn URL sạch.
- **Nối backend thật**: giữ nguyên `api.get/post/patch` trong `core.js`, chỉ đổi `API_BASE` hoặc viết adapter.
- **Thay dữ liệu**: `server/data/products.json` cùng schema, hoặc thay `listProducts()` bằng truy vấn DB.

---

## Hai chế độ chạy

Front-end tự dò `/api/v1/health` lúc khởi động và chọn chế độ:

| | **Live** (có server Node) | **Demo UI** (host tĩnh như Netlify) |
|---|---|---|
| Sản phẩm | `/api/v1/products` | `app/data/catalog.json` |
| Giỏ hàng | localStorage | localStorage |
| Đặt hàng | Trừ ví thật, lưu `db.json` | Giả lập, lưu localStorage |
| Đăng nhập / ví | Có | Không (báo "bản demo giao diện") |

### Deploy Netlify (demo UI)

1. Sửa `server/data/products.json` nếu cần → `node tools/sync-catalog.mjs`
   (Netlify cũng tự chạy bước này trong build command).
2. Đẩy thư mục lên Git, nối repo với Netlify — `netlify.toml` đã khai báo `publish = "app"`, URL sạch
   và rewrite `/products/<slug>`.
3. Hoặc kéo thả **thư mục `app/`** vào Netlify Drop.

Xem trước bản tĩnh trên máy: `node tools/serve-static.mjs` → http://localhost:4330

### Deploy đầy đủ chức năng

Cần host chạy Node thường trực (Render / Railway / Fly.io / VPS):

```
Start command: node server/server.mjs
```

Không có dependency nào nên không cần `npm install`. Lưu ý `db.json` ghi ra đĩa — trên host miễn phí
ổ đĩa là tạm, restart sẽ mất đơn hàng; muốn bền phải chuyển sang database.
