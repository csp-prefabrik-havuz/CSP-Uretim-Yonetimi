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

  // Her aktif kullanıcı, kendi yetkili olduğu bölümlerdeki mevcut kayıtları
  // tek düğmeyle ortak panele yeniden gönderebilir.
  const cloudConfig = {
    url: 'https://dmyvfcxirwecnupgsdtg.supabase.co',
    publishableKey: 'sb_publishable_pxzY9XruTUBYKDRmYhTzjw_hu4mvA-K',
    stateKey: 'csp-production-management-state-v2'
  };

  const syncErrorText = async (error, data) => {
    if (data?.error) return data.error;
    try {
      const payload = await error?.context?.clone?.().json();
      if (payload?.error) return payload.error;
    } catch (_) {
      // Yanıt ayrıntısı bulunamazsa aşağıdaki güvenli genel ileti kullanılır.
    }
    return error?.message || 'Aktarım tamamlanamadı.';
  };

  const installManualCloudSync = async () => {
    if (location.hostname !== 'csp-prefabrik-havuz.github.io' || !window.supabase?.createClient) return;
    const root = document.getElementById('csp-production-sketch');
    const actions = root?.querySelector('.top-actions');
    if (!root || !actions || root.dataset.manualCloudSyncInstalled) return;

    const cloud = window.supabase.createClient(cloudConfig.url, cloudConfig.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
    const sessionResult = await cloud.auth.getSession();
    const session = sessionResult.data.session;
    if (!session) return;

    const profileResult = await cloud.from('profiles')
      .select('role, is_active')
      .eq('id', session.user.id)
      .maybeSingle();
    if (profileResult.error || !profileResult.data?.is_active) return;

    root.dataset.manualCloudSyncInstalled = 'true';
    const status = document.createElement('span');
    status.setAttribute('aria-live', 'polite');
    status.style.cssText = 'font-size:12px;color:#d8eef5;max-width:190px;text-align:right';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'top-button';
    button.textContent = 'Buluta aktar';
    button.title = 'Bu bilgisayardaki kayıtları ortak panele aktarır';
    actions.prepend(status);
    actions.prepend(button);

    button.addEventListener('click', async () => {
      let state;
      try {
        state = JSON.parse(window.localStorage.getItem(cloudConfig.stateKey) || 'null');
      } catch (_) {
        state = null;
      }
      const hasRecords = state && [
        'orders', 'stockCards', 'importedStockCards', 'importedStockMovements', 'importedSalesOrders', 'workorderRecords'
      ].some((key) => Array.isArray(state[key]) && state[key].length);
      if (!hasRecords) {
        status.textContent = 'Bu bilgisayarda aktarılacak kayıt bulunamadı.';
        return;
      }

      button.disabled = true;
      status.textContent = 'Aktarılıyor…';
      try {
        const freshSession = (await cloud.auth.getSession()).data.session;
        if (!freshSession?.access_token) throw new Error('Oturum bulunamadı. Lütfen yeniden giriş yapın.');
        const result = await cloud.functions.invoke('panel-state', {
          body: { action: 'push', state },
          headers: { Authorization: 'Bearer ' + freshSession.access_token }
        });
        if (result.error || result.data?.error) throw Object.assign(result.error || new Error(result.data.error), { panelData: result.data });
        status.textContent = 'Aktarım tamamlandı. Diğer kullanıcılar sayfayı yenileyebilir.';
      } catch (error) {
        status.textContent = 'Aktarım hatası: ' + await syncErrorText(error, error?.panelData);
      } finally {
        button.disabled = false;
      }
    });
  };

  // Ana uygulama kendi yetki menüsünü ve şifre değiştirme formunu yönetir.
  // Burada yalnızca herkese açık stok özetinin masaüstü yerleşimi düzeltilir.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyPublicStockLayout, { once: true });
  } else {
    applyPublicStockLayout();
  }

  window.addEventListener('load', () => { void installManualCloudSync(); }, { once: true });
})();
