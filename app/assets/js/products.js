/* products.js — shop page: một lưới sản phẩm + chip danh mục + tìm + sắp xếp */

const CAT_ORDER = ['Discord', 'Netflix', 'Spotify', 'YouTube', 'Chat AI', 'Canva', 'CapCut', 'Buff mxh', 'Khác', 'Game'];

const params0 = new URLSearchParams(location.search);

const state = {
  category: params0.get('category') || '',
  q: params0.get('q') || '',
  sort: '',
  rows: [],
  loading: true,
};

function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((node) => {
    const name = node.getAttribute('data-icon');
    if (icons[name]) node.innerHTML = icons[name];
  });
}

function syncUrl() {
  const params = new URLSearchParams();
  if (state.category) params.set('category', state.category);
  if (state.q) params.set('q', state.q);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `/products?${qs}` : '/products');
}

function showEmpty({ title, sub, reset = true }) {
  const empty = document.querySelector('[data-empty]');
  empty.querySelector('[data-empty-title]').textContent = title;
  empty.querySelector('[data-empty-sub]').textContent = sub;
  empty.querySelector('[data-reset]').hidden = !reset;
  empty.hidden = false;
}

function render() {
  const host = document.querySelector('[data-groups]');
  const empty = document.querySelector('[data-empty]');

  if (state.loading) {
    host.innerHTML = `<div class="product-grid">${skeletonCards(9)}</div>`;
    empty.hidden = true;
    return;
  }

  if (!state.rows.length) {
    host.innerHTML = '';
    showEmpty({
      title: state.q ? 'Không tìm thấy sản phẩm' : 'Danh mục này đang trống',
      sub: state.q ? 'Thử từ khoá khác, hoặc xoá bộ lọc.' : 'Sản phẩm mới sẽ lên kệ trong thời gian tới.',
      reset: true,
    });
    return;
  }

  empty.hidden = true;
  const label = state.q ? `Kết quả cho “${state.q}”` : state.category || '';
  host.innerHTML = `
    <div class="grid-meta">
      <span>${escapeHtml(label)}</span>
      <span>${state.rows.length} sản phẩm</span>
    </div>
    <div class="product-grid">${state.rows.map(productCardHtml).join('')}</div>`;

  initReveals(host);
}

async function load() {
  state.loading = true;
  render();

  const params = new URLSearchParams({ limit: '200', light: '1' });
  if (state.category) params.set('category', state.category);
  if (state.q) params.set('q', state.q);
  if (state.sort) params.set('sort', state.sort);

  try {
    const { data } = await api.get(`/products?${params.toString()}`);
    state.rows = [...data].sort(
      (a, b) => (CAT_ORDER.indexOf(a.category) + 1 || 99) - (CAT_ORDER.indexOf(b.category) + 1 || 99),
    );
  } catch (err) {
    toast(err.message, 'error');
    state.rows = [];
  }

  state.loading = false;
  render();
}

function wire() {
  const chips = document.querySelectorAll('[data-category-chips] .chip');
  chips.forEach((chip) => {
    chip.setAttribute('aria-pressed', String(chip.dataset.category === state.category));
    chip.addEventListener('click', () => {
      state.category = chip.dataset.category;
      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
      syncUrl();
      load();
    });
  });

  const search = document.querySelector('[data-search]');
  search.value = state.q;
  search.addEventListener(
    'input',
    debounce(() => {
      state.q = search.value.trim();
      syncUrl();
      load();
    }, 260),
  );

  document.querySelector('[data-sort]').addEventListener('change', (e) => {
    state.sort = e.target.value;
    load();
  });

  document.querySelector('[data-reset]').addEventListener('click', () => {
    state.category = '';
    state.q = '';
    state.sort = '';
    search.value = '';
    document.querySelector('[data-sort]').value = '';
    chips.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.category === '')));
    syncUrl();
    load();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  paintIcons();
  wire();
  load();
});
