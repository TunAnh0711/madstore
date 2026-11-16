/* auth.js — login / register form */

document.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('[data-auth-form]');
  if (!form) return;

  const mode = form.dataset.mode;
  const errorBox = form.querySelector('[data-error]');
  const submit = form.querySelector('[data-submit]');
  const next = new URLSearchParams(location.search).get('next') || '/account';

  const showError = (message) => {
    errorBox.textContent = message;
    errorBox.setAttribute('data-show', 'true');
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorBox.setAttribute('data-show', 'false');

    const data = Object.fromEntries(new FormData(form).entries());
    const email = String(data.email || '').trim();
    const password = String(data.password || '');

    if (!email || !password) {
      showError('Nhập email và mật khẩu trước khi tiếp tục.');
      return;
    }

    submit.disabled = true;
    submit.textContent = mode === 'login' ? 'Đang đăng nhập…' : 'Đang tạo…';

    try {
      await api.post(`/auth/${mode}`, {
        email,
        password,
        name: data.name,
      });
      clearSession();
      toast(mode === 'login' ? 'Đăng nhập thành công' : 'Tài khoản đã được tạo');
      location.href = next;
    } catch (err) {
      showError(
        err.code === 'demo_mode'
          ? 'Bản demo giao diện chưa có đăng nhập — bạn vẫn xem sản phẩm và đặt hàng thử được.'
          : err.message,
      );
      submit.disabled = false;
      submit.textContent = mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản';
    }
  });
});
