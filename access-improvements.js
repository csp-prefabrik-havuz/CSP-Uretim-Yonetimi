(() => {
  const isPublicStockPage = () =>
    location.hostname === 'csp-prefabrik-havuz.github.io'
    && ['stok-ozeti', 'genel-stok'].includes(new URLSearchParams(location.search).get('sayfa'));

  const applyPublicStockLayout = () => {
    if (!isPublicStockPage()) return;
    const root = document.getElementById('csp-production-sketch');
    if (!root) return;
    root.classList.add('public-stock-mode');
    root.querySelector('.side-nav')?.setAttribute('hidden', '');
  };

  // Ana uygulama kendi yetki menüsünü ve şifre değiştirme formunu yönetir.
  // Burada yalnızca herkese açık stok özetinin masaüstü yerleşimi düzeltilir.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPublicStockLayout, { once: true });
  } else {
    applyPublicStockLayout();
  }
})();
