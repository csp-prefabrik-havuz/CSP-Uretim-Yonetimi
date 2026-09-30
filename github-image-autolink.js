(() => {
  'use strict';
  const root = document.getElementById('csp-production-sketch');
  if (!root) return;
  const tableSelector = '#stock-list-body tr, #imported-stock-list-body tr, #stock-summary-list-body tr';
  const codePattern = /^(?:LIN|PVC|SAC|PAN|ITH)-[A-Z0-9İŞĞÜÖÇ-]+$/i;
  const findCode = (row) => Array.from(row.cells || []).map((cell) => String(cell.textContent || '').trim()).find((value) => codePattern.test(value)) || '';
  const codeForRow = (row) => {
    const storedCode = String(row.dataset.stockCode || '').trim();
    return codePattern.test(storedCode) ? storedCode : findCode(row);
  };
  const imageCandidates = (code) => {
    const safeCode = String(code || '').trim();
    if (!safeCode) return [];
    return [...new Set([safeCode, safeCode.replaceAll('I', 'İ'), safeCode.replaceAll('İ', 'I')])].map((name) => new URL('gorseller/' + encodeURIComponent(name) + '.png', document.baseURI).href);
  };
  const addImage = (row, code) => {
    const cell = row.cells?.[0];
    if (!cell || cell.querySelector('.stock-image-button') || row.dataset.githubImageChecked === 'true') return;
    const sources = imageCandidates(code);
    if (!sources.length) return;
    row.dataset.githubImageChecked = 'true';
    cell.classList.remove('stock-image-empty');
    cell.textContent = '';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'stock-image-button';
    button.dataset.openStockImage = 'true';
    button.dataset.stockImageCode = code;
    button.dataset.stockImageTitle = row.dataset.stockImageTitle || Array.from(row.cells || []).slice(1).map((item) => item.textContent.trim()).find((text) => text.length > 3) || code;
    button.setAttribute('aria-label', button.dataset.stockImageTitle + ' görselini büyüt');
    const image = document.createElement('img');
    image.className = 'stock-thumbnail';
    image.alt = button.dataset.stockImageTitle + ' görseli';
    button.appendChild(image);
    cell.appendChild(button);
    let sourceIndex = 0;
    const loadNextSource = () => {
      const source = sources[sourceIndex++];
      if (source) { image.src = source; return; }
      button.remove();
      cell.classList.add('stock-image-empty');
      cell.textContent = '—';
    };
    image.addEventListener('error', loadNextSource);
    loadNextSource();
  };
  const refreshImages = () => Array.from(root.querySelectorAll(tableSelector)).forEach((row) => addImage(row, codeForRow(row)));
  const showOptionalLinkHelp = () => root.querySelectorAll('[data-external-stock-image]').forEach((input) => {
    const field = input.closest('.field');
    const label = field?.querySelector('label');
    const note = field?.querySelector('.muted-note');
    if (label) label.textContent = 'Dış görsel bağlantısı (isteğe bağlı)';
    input.placeholder = 'Boş bırakın: stok koduna ait GitHub görseli otomatik gelir';
    if (note) note.textContent = 'GitHub’a stok koduyla aynı isimde .png yüklediyseniz bağlantı yazmanız gerekmez.';
  });
  let zeroStockRowsHidden = false;
  const isZeroStockRow = (row) => {
    if (!row || row.cells?.length !== 5) return false;
    const value = String(row.cells[4]?.textContent || '').trim().replace(/[^0-9,.-]/g, '');
    return value && Number(value.replace(/[.,]/g, '')) === 0;
  };
  const applyZeroStockFilter = () => {
    const rows = Array.from(root.querySelectorAll('#stock-summary-list-body tr'));
    let shown = 0; let stockRows = 0;
    rows.forEach((row) => {
      const hide = zeroStockRowsHidden && isZeroStockRow(row);
      if (row.cells?.length === 5) stockRows += 1;
      row.hidden = hide;
      if (!hide && row.cells?.length === 5) shown += 1;
    });
    const status = root.querySelector('#stock-summary-status');
    if (status && zeroStockRowsHidden && stockRows) status.textContent = shown + ' / ' + stockRows + ' stok kartı listeleniyor; sıfır stoklar gizli.';
  };
  const addZeroStockToggle = () => {
    const actions = root.querySelector('.stock-summary-report-actions');
    if (!actions || actions.querySelector('[data-toggle-zero-stock-summary]')) return;
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'secondary-button'; button.dataset.toggleZeroStockSummary = 'true'; button.setAttribute('aria-pressed', 'false'); button.textContent = 'Sıfır stokları gösterme';
    button.addEventListener('click', () => {
      zeroStockRowsHidden = !zeroStockRowsHidden;
      button.setAttribute('aria-pressed', String(zeroStockRowsHidden));
      button.classList.toggle('is-active', zeroStockRowsHidden);
      button.textContent = zeroStockRowsHidden ? 'Sıfır stoklar gizli' : 'Sıfır stokları gösterme';
      applyZeroStockFilter();
    });
    actions.insertBefore(button, actions.querySelector('[data-export-stock-summary-jpg]') || null);
  };
  const observeStockTable = (selector) => {
    const body = root.querySelector(selector);
    if (!body || body.dataset.githubImageObserved === 'true') return;
    body.dataset.githubImageObserved = 'true';
    new MutationObserver(() => { refreshImages(); addZeroStockToggle(); applyZeroStockFilter(); }).observe(body, { childList: true });
  };
  showOptionalLinkHelp(); refreshImages(); addZeroStockToggle(); applyZeroStockFilter();
  ['#stock-list-body', '#imported-stock-list-body', '#stock-summary-list-body'].forEach(observeStockTable);
})();
