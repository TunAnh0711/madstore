# ANALYSIS — những gì lấy được từ lumiestore.uk

Ghi chú kỹ thuật của bản dựng lại. Toàn bộ dữ liệu dưới đây đến từ **nội dung công khai**:
trang HTML trả về, bundle CSS/JS tải được và các endpoint không cần đăng nhập. Không có bước nào
thử vượt qua xác thực, không gọi endpoint admin, không dò mật khẩu.

Ảnh chụp giao diện bản dựng: `_shots/`.

---

## 1. Nền tảng

| Lớp | Nhận định | Căn cứ |
|---|---|---|
| Kiểu app | SPA, Vite + React | `index.html` chỉ có `<div id="root">`, nạp `/assets/index-*.js` (module) |
| Style | Tailwind v4 + CSS component tự viết | `@layer theme`, biến `--color-*`, class riêng `.lm .pcard`, `.lmh-*`, `.lmf-*` |
| Font | Google Fonts | **Bricolage Grotesque** (display) + **Be Vietnam Pro** (body) |
| Tĩnh | `translate="no"` trên `<html>` | tránh Chrome tự dịch làm React không cập nhật được text |
| Theme | `theme-init.js` set `data-theme` trước paint | chống nháy màu; mặc định sáng |

## 2. Design token (trích từ `index-*.css`)

Hai bộ token chạy song song: bộ cũ "Aurora" (`--color-canvas` …) đã bị vô hiệu hoá, và bộ **v2**
đang dùng thật:

```
light (mặc định)                 dark
--paper   #fff5e4                #16130e
--card    #fffdf8                #221c15
--ink     #211a12                #f2e9d8
--ink-soft#6b5b45                #b3a793
--amber   #ff9d1e                #ff9d1e   (nhấn chính)
--gold    #ffca3a                #ffca3a   (nút mua)
--coral   #ff5d73                #ff6d81
--mint    #18c088                #22cf97
--grape   #7048e8                #8a6bf0
--bw      2.5px                  nt        (độ dày viền)
--r       16px  --r-sm 11px      nt
--sh      4px 4px 0 ink          #0000008c
--sh-h    7px 7px 0 ink          nt        (hover: nhích -2px,-2px)
--marker  #ecd6a8                #3a3226   (nét dạ quang sau chữ)
```

Bố cục component (đọc từ CSS): `.lm .card`, `.lm .pcard/.ptop/.pbody/.pcat/.pname/.pdesc/.prow/.pprice/.pbtn`,
`.lm .gcard/.gtop/.gname/.gcur`, `.lm .pill`, `.lm .chip`, `.lm .vipstrip`, `.lm .hero-l`,
`.lmh-*` (header), `.lmf-*` (footer). Card sản phẩm = dải màu `--c` + chấm bi + logo + nhãn xoay 5°.

## 3. Hợp đồng API (công khai, không cần đăng nhập)

```
GET /api/products     → mảng 28 sản phẩm, kèm packages (gói), rating, guarantees, instructions
GET /api/catalog      → { categories: [{key,name,kind,color,icon_path}], products: [...] }
```

Schema một sản phẩm (rút gọn):

```jsonc
{
  "id": 45, "slug": "roblox-ban-sao", "category": "Game", "name": "Robux",
  "description": "...", "service_label": "name game",
  "guarantees_title": "Cam kết từ Lumie:", "guarantees": ["..."],
  "credential_fields": [{ "key": "mat_khau", "label": "Tên acc", "type": "password" }],
  "instructions": "1. Nhập UID\n2. Thêm vào giỏ hàng...",
  "image_url": "", "icon_path": null, "color": "#FF9D1E",
  "maintenance": false, "discount_pct": 0, "sort_order": 1,
  "packages": [{ "id": 270, "label": "1K Robux", "price": 249000,
                 "original_price": 280000, "badge": "Best seller", "sold_out": false }],
  "usage_period": "none", "no_warranty": false, "image_fit": "frame",
  "rating": { "average": 5, "count": 2 }
}
```

Phân bố: Discord 8 · Game 5 · Buff mxh 5 · Chat AI 2 · Netflix 2 · Spotify 2 · YouTube 2 ·
Canva 1 · CapCut 1 · Khác 2. Tổng 99 gói.

## 4. Ánh xạ sang schema nội bộ

`tools/import-catalog.mjs` đọc `tools/data/lumie-products.json` và sinh `server/data/products.json`:

| Gốc | Nội bộ |
|---|---|
| `name`, `slug`, `description` | giữ nguyên |
| `packages[].label / price / original_price` | `variants[].name / price / originalPrice` |
| `price` (sản phẩm) | giá thấp nhất trong các gói còn bán |
| `category` | `category` + `productType` (`Game` → `GAME_TOPUP`, còn lại `GENERAL`) |
| `color` | `categoryColor` (dải màu trên card) |
| `rating`, `badge`, `guarantees`, `instructions`, `discount_pct` | giữ nguyên để hiển thị |
| `maintenance` | `available: false` (card khoá, hiện "Tạm xử lý") |
| `sold_out` của gói | `variants[].available: false` |

Hai trường `fromOriginalPrice` / `fromVariantName` được server tính thêm để card hiện được
"từ 100.000đ ~~149.000đ~~" mà không phải gửi cả mảng variants xuống client.

## 5. Khác biệt so với bản gốc (cố ý)

| | Gốc | Bản này |
|---|---|---|
| Backend | ẩn, có đơn hàng thật | Node `http` thuần + JSON file, session cookie + scrypt |
| Thanh toán | cổng thật | QR vẽ bằng SVG, nút xác nhận tay |
| Chat trực tuyến | widget chat | khung FAQ + link hỗ trợ |
| VIP | trang riêng + tính hạng | dải nhắc trên trang chủ, chưa có logic hạng |
| Admin | có | không dựng |

## 6. Điều chưa xác định được

- Nội dung trang `/vip`, `/tos`, `/privacy` (SPA render sau khi đăng nhập hoặc tải động).
- Logic tính hạng VIP và giảm giá theo hạng.
- Payload đặt hàng thật (chỉ suy ra từ UI).
