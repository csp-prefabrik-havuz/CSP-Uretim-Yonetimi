(() => {
  'use strict';
  const root = document.getElementById('csp-production-sketch');
  if (!root) return;

  const rowsSelector = '#stock-list-body tr, #imported-stock-list-body tr, #stock-summary-list-body tr';
  const codePattern = /^(?:LIN|PVC|SAC|PAN|ITH)-[A-Z0-9İŞĞÜÖÇ-]+$/i;
  const productCodes = new Map();
  const normalise = (value) => String(value || '').toLocaleUpperCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '');
  const directCode = (row) => Array.from(row.cells || []).map((cell) => String(cell.textContent || '').trim()).find((value) => codePattern.test(value)) || '';

  const rememberCodes = (row, code) => {
    if (!code) return;
    Array.from(row.cells || []).forEach((cell) => {
      const key = normalise(cell.textContent);
      if (key.length >= 6) productCodes.set(key, code);
    });
  };

  const rowCode = (row) => {
    const code = directCode(row);
    if (code) return code;
    const cells = Array.from(row.cells || []);
    for (let index = cells.length - 1; index >= 1; index -= 1) {
      const known = productCodes.get(normalise(cells[index].textContent));
      if (known) return known;
    }
    return '';
  };

  const imageSources = (code) => {
    const value = String(code || '').trim();
    if (!value) return [];
    const names = [...new Set([value, value.replaceAll('I', 'İ'), value.replaceAll('İ', 'I')])];
    return names.map((name) => new URL(`gorseller/${encodeURIComponent(name)}.png`, document.baseURI).href);
  };

  const addImage = (row, code) => {
    const cell = row.cells?.[0];
    if (!cell || cell.querySelector('.stock-image-button') || row.dataset.githubImageChecked === 'true') return;
    const sources = imageSources(code);
    if (!sources.length) return;
    row.dataset.githubImageChecked = 'true';
    cell.classList.remove('stock-image-empty');
    cell.textContent = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stock-image-button';
    button.dataset.openStockImage = 'true';
    button.dataset.stockImageCode = code;
    button.dataset.stockImageTitle = Array.from(row.cells || []).slice(1).map((item) => item.textContent.trim()).find((text) => text.length > 3) || code;
    button.setAttribute('aria-label', `${button.dataset.stockImageTitle} görselini büyüt`);
    const image = document.createElement('img');
    image.className = 'stock-thumbnail';
    image.alt = `${button.dataset.stockImageTitle} görseli`;
    button.appendChild(image);
    cell.appendChild(button);
    let sourceIndex = 0;
    const loadNext = () => {
      const source = sources[sourceIndex++];
      if (source) { image.src = source; return; }
      button.remove();
      cell.classList.add('stock-image-empty');
      cell.textContent = '—';
    };
    image.addEventListener('error', loadNext);
    loadNext();
  };

  const updateLinkHelp = () => root.querySelectorAll('[data-external-stock-image]').forEach((input) => {
    const field = input.closest('.field');
    const label = field?.querySelector('label');
    const note = field?.querySelector('.muted-note');
    if (label) label.textContent = 'Dış görsel bağlantısı (isteğe bağlı)';
    input.placeholder = 'Boş bırakın: stok koduna ait GitHub görseli otomatik gelir';
    if (note) note.textContent = 'GitHub’a stok koduyla aynı isimde .png yüklediyseniz bağlantı yazmanız gerekmez.';
  });

  const refresh = () => {
    const rows = Array.from(root.querySelectorAll(rowsSelector));
    rows.forEach((row) => rememberCodes(row, directCode(row)));
    rows.forEach((row) => addImage(row, rowCode(row)));
    updateLinkHelp();
  };

  let queued = false;
  new MutationObserver(() => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; refresh(); });
  }).observe(root, { childList: true, subtree: true });
  refresh();
})();


(() => {
  'use strict';
  const root = document.getElementById('csp-production-sketch');
  if (!root) return;
  let hideZeros = false;
  const isStockRow = (row) => row && row.cells && row.cells.length === 5;
  const isZeroStock = (row) => {
    if (!isStockRow(row)) return false;
    const value = String(row.cells[4].textContent || '').trim().replace(/[^0-9,.-]/g, '');
    return Boolean(value) && Number(value.replace(/[.,]/g, '')) === 0;
  };
  const applyZeroStockFilter = () => {
    const rows = Array.from(root.querySelectorAll('#stock-summary-list-body tr'));
    let shown = 0;
    let total = 0;
    rows.forEach((row) => {
      const hidden = hideZeros && isZeroStock(row);
      row.hidden = hidden;
      if (isStockRow(row)) {
        total += 1;
        if (!hidden) shown += 1;
      }
    });
    const status = root.querySelector('#stock-summary-status');
    if (status && hideZeros && total) status.textContent = shown + ' / ' + total + ' stok kartı listeleniyor; sıfır stoklar gizli.';
  };
  const addZeroStockButton = () => {
    const actions = root.querySelector('.stock-summary-report-actions');
    if (!actions || actions.querySelector('[data-toggle-zero-stock-summary]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary-button';
    button.dataset.toggleZeroStockSummary = 'true';
    button.setAttribute('aria-pressed', 'false');
    button.textContent = 'Sıfır stokları gösterme';
    button.addEventListener('click', () => {
      hideZeros = !hideZeros;
      button.setAttribute('aria-pressed', String(hideZeros));
      button.classList.toggle('is-active', hideZeros);
      button.textContent = hideZeros ? 'Sıfır stoklar gizli' : 'Sıfır stokları gösterme';
      applyZeroStockFilter();
    });
    actions.insertBefore(button, actions.querySelector('[data-export-stock-summary-jpg]'));
  };
  const refresh = () => { addZeroStockButton(); applyZeroStockFilter(); };
  new MutationObserver(() => queueMicrotask(refresh)).observe(root, { childList: true, subtree: true });
  refresh();
})();
