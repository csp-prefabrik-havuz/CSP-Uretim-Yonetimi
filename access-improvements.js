(() => {
  const publicStockPage = location.hostname === 'csp-prefabrik-havuz.github.io' && ['stok-ozeti', 'genel-stok'].includes(new URLSearchParams(location.search).get('sayfa'));
  if (publicStockPage) {
    const style = document.createElement('style');
    style.textContent = [
      '#csp-production-sketch.public-stock-mode{max-width:1320px;margin:0 auto;border-radius:0 0 16px 16px}',
      '#csp-production-sketch.public-stock-mode .shell{display:block!important;min-height:0}',
      '#csp-production-sketch.public-stock-mode .main{padding:clamp(20px,3vw,38px)}',
      '#csp-production-sketch.public-stock-mode [data-page="stock-summary"]{max-width:1240px;margin:0 auto}',
      '#csp-production-sketch.public-stock-mode .stock-summary-filters{max-width:860px}',
      '#csp-production-sketch.public-stock-mode .stock-scroll-window{max-height:none}',
      '#csp-production-sketch.public-stock-mode #stock-summary-table{min-width:760px}',
      '#csp-production-sketch.public-stock-mode .app-topbar{padding-inline:clamp(18px,3vw,38px)}'
    ].join('');
    (document.head || document.documentElement).appendChild(style);
    const applyPublicStockLayout = () => {
      const root = document.getElementById('csp-production-sketch');
      if (!root) return;
      root.classList.add('public-stock-mode');
      root.querySelector('.side-nav')?.setAttribute('hidden', '');
    };
    document.addEventListener('DOMContentLoaded', applyPublicStockLayout, { once: true });
    window.setTimeout(applyPublicStockLayout, 250);
  }

  const root = document.getElementById('csp-production-sketch');
  if (!root) return;

  const hideEmptyHeadings = () => {
    root.querySelectorAll('.side-nav .nav-label').forEach((label) => {
      let next = label.nextElementSibling;
      let hasPage = false;
      while (next && !next.classList.contains('nav-label')) {
        if (next.matches('.nav-button[data-view]') && !next.hidden) hasPage = true;
        next = next.nextElementSibling;
      }
      label.hidden = !hasPage;
    });
  };

  const installPasswordForm = () => {
    const menu = root.querySelector('#cloud-user-menu');
    if (!menu || root.querySelector('#self-password-panel')) return;
    const style = document.createElement('style');
    style.textContent = '#csp-production-sketch #self-password-panel{display:grid;gap:9px;padding:12px;background:#f5fafb;border:1px solid #d5e5e9;border-radius:9px}#csp-production-sketch #self-password-panel strong{color:#0b536e;font-size:13px}#csp-production-sketch #self-password-panel label{display:grid;gap:4px;font-size:13px;color:#344858}';
    document.head.append(style);
    const form = document.createElement('form');
    form.id = 'self-password-panel';
    form.noValidate = true;
    form.innerHTML = '<strong>Şifremi değiştir</strong><label>Yeni şifre<input name="password" type="password" autocomplete="new-password" placeholder="En az 8 karakter" required></label><label>Yeni şifre tekrar<input name="confirmation" type="password" autocomplete="new-password" placeholder="Şifreyi tekrar yazın" required></label><button class="secondary-button" type="submit">Şifremi güncelle</button><p class="cloud-auth-status" aria-live="polite"></p>';
    menu.insertBefore(form, root.querySelector('#cloud-close-session'));
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = form.elements.password.value;
      const confirmation = form.elements.confirmation.value;
      const status = form.querySelector('p');
      status.classList.remove('is-ok');
      if (password.length < 8) { status.textContent = 'Yeni şifre en az 8 karakter olmalıdır.'; return; }
      if (password !== confirmation) { status.textContent = 'Yeni şifreler aynı değil.'; return; }
      if (!window.supabase?.createClient) { status.textContent = 'Şifre hizmeti hazır değil.'; return; }
      status.textContent = 'Şifre güncelleniyor…';
      const cloud = window.supabase.createClient('https://dmyvfcxirwecnupgsdtg.supabase.co', 'sb_publishable_pxzY9XruTUBYKDRmYhTzjw_hu4mvA-K', { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
      const result = await cloud.auth.updateUser({ password });
      if (result.error) { status.textContent = result.error.message || 'Şifre güncellenemedi.'; return; }
      form.reset();
      status.textContent = 'Şifreniz güncellendi.';
      status.classList.add('is-ok');
    });
  };

  hideEmptyHeadings();
  installPasswordForm();
  new MutationObserver(() => { hideEmptyHeadings(); installPasswordForm(); }).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
})();
