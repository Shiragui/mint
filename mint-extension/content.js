/**
 * Lens Capture - Content Script
 * Snipping overlay: transparent full-page canvas, click-and-drag to select rectangle.
 * Captures tab via background, crops to selection, sends for analysis and webhook.
 */

(function () {
  const OVERLAY_ID = 'lens-capture-overlay';
  const STYLE_ID = 'lens-capture-styles';

  function injectStyles() {
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      document.head.appendChild(style);
    }
    style.textContent = `
      #${OVERLAY_ID} {
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: rgba(0, 0, 0, 0.35);
        cursor: crosshair;
        touch-action: none;
      }
      #${OVERLAY_ID} .lens-canvas {
        position: absolute;
        left: 0;
        top: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      }
      #${OVERLAY_ID} .lens-canvas.active {
        pointer-events: auto;
      }
      #${OVERLAY_ID}.loading {
        cursor: wait;
        background: rgba(0, 0, 0, 0.5);
      }
      #${OVERLAY_ID} .lens-loading-msg {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        padding: 12px 20px;
        background: rgba(0,0,0,0.75);
        color: #fff;
        border-radius: 8px;
        font-family: system-ui, sans-serif;
        font-size: 14px;
        pointer-events: none;
        display: none;
      }
      #${OVERLAY_ID}.loading .lens-loading-msg {
        display: block;
      }
      #${OVERLAY_ID} .lens-confirm-bar {
        position: absolute;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 12px;
        padding: 12px 20px;
        background: rgba(0,0,0,0.85);
        border-radius: 12px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10;
        pointer-events: auto;
      }
      #${OVERLAY_ID} .lens-confirm-bar button {
        padding: 10px 24px;
        border: none;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        font-family: system-ui, sans-serif;
      }
      #${OVERLAY_ID} .lens-confirm-bar .lens-btn-search {
        background: #34d399;
        color: #047857;
      }
      #${OVERLAY_ID} .lens-confirm-bar .lens-btn-search:hover { background: #6ee7b7; }
      #${OVERLAY_ID} .lens-confirm-bar .lens-btn-cancel {
        background: #6b7280;
        color: #fff;
      }
      #${OVERLAY_ID} .lens-confirm-bar .lens-btn-cancel:hover { background: #4b5563; }
      #${OVERLAY_ID} .lens-resize-handle {
        position: absolute;
        width: 12px;
        height: 12px;
        background: #34d399;
        border: 2px solid #fff;
        border-radius: 2px;
        cursor: pointer;
        z-index: 10;
        pointer-events: auto;
      }
      #lens-capture-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%);
        z-index: 2147483648;
        padding: 12px 20px;
        border-radius: 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        font-weight: 500;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        max-width: 90vw;
        text-align: center;
        animation: lens-fade-in 0.2s ease;
      }
      #lens-capture-toast.success { background: #0d7a3c; color: #fff; }
      #lens-capture-toast.warning { background: #b45309; color: #fff; }
      #lens-capture-toast.error { background: #b91c1c; color: #fff; }
      @keyframes lens-fade-in { from { opacity: 0; transform: translateX(-50%) translateY(8px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }
      #lens-results-popup {
        position: fixed;
        top: 50%;
        right: 24px;
        transform: translateY(-50%);
        z-index: 2147483649;
        width: min(420px, calc(100vw - 48px));
        max-height: 85vh;
        background: #ffffff !important;
        border-radius: 16px;
        box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(34, 197, 94, 0.2) !important;
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: lens-popup-in 0.2s ease;
      }
      #lens-results-popup.dragging { cursor: move; }
      @keyframes lens-popup-in { from { opacity: 0; transform: translateY(-50%) scale(0.96); } to { opacity: 1; transform: translateY(-50%) scale(1); } }
      #lens-results-popup .lens-results-backdrop {
        position: fixed;
        inset: 0;
        z-index: -1;
        background: rgba(0, 0, 0, 0) !important;
      }
      #lens-results-popup .lens-results-header {
        padding: 16px 20px;
        border-bottom: 1px solid #86efac !important;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
        cursor: move;
        background: #ecfdf5 !important;
        user-select: none;
      }
      #lens-results-popup .lens-results-title { margin: 0; font-size: 16px; font-weight: 600; color: #047857 !important; }
      #lens-results-popup .lens-results-close {
        width: 32px; height: 32px;
        border: none; background: #6ee7b7 !important; color: #047857 !important;
        border-radius: 8px; cursor: pointer; font-size: 18px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0;
      }
      #lens-results-popup .lens-results-close:hover { background: #34d399 !important; }
      #lens-results-popup .lens-results-body { padding: 16px 20px; overflow-y: auto; flex: 1; background: #ffffff !important; }
      #lens-results-popup .lens-results-section { font-size: 12px; font-weight: 600; color: #059669 !important; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px; }
      #lens-results-popup .lens-product-card {
        background: #ecfdf5 !important;
        border-radius: 12px;
        padding: 14px 16px;
        margin-bottom: 16px;
        border: 1px solid #a7f3d0 !important;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        text-decoration: none;
        color: inherit;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      #lens-results-popup .lens-product-card:hover { background: #d1fae5 !important; border-color: #6ee7b7 !important; }
      #lens-results-popup .lens-product-card:last-child { margin-bottom: 0; }
      #lens-results-popup .lens-product-img {
        width: 64px; height: 64px; object-fit: cover; border-radius: 8px; flex-shrink: 0;
      }
      #lens-results-popup .lens-product-img-placeholder {
        width: 64px; height: 64px; background: #a7f3d0 !important; border-radius: 8px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 20px; color: #047857 !important;
      }
      #lens-results-popup .lens-product-info { flex: 1; min-width: 0; overflow: visible; }
      #lens-results-popup .lens-product-name {
        font-weight: 600; font-size: 14px; color: #111; margin-bottom: 6px; line-height: 1.3;
        display: -webkit-box; -webkit-line-clamp: 2; overflow: hidden; -webkit-box-orient: vertical;
      }
      #lens-results-popup .lens-product-meta { font-size: 12px; color: #047857 !important; margin-top: 2px; }
      #lens-results-popup .lens-product-price { font-weight: 600; color: #059669 !important; }
      #lens-results-popup .lens-product-source { color: #6b7280; }
      #lens-results-popup .lens-product-links { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 8px; }
      #lens-results-popup .lens-product-links a {
        font-size: 12px; padding: 6px 12px; border-radius: 6px; text-decoration: none; font-weight: 500;
        background: #0d47a1; color: #fff;
      }
      #lens-results-popup .lens-product-links a:hover { opacity: 0.9; }
      #lens-results-popup .lens-product-links a.lens-link-amazon { background: #232f3e; }
      #lens-results-popup .lens-product-links a.lens-link-google { background: #4285f4; }
      #lens-results-popup .lens-no-products { font-size: 13px; color: #6b7280; padding: 8px 0; }
      #lens-results-popup .lens-results-toolbar { margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      #lens-results-popup .lens-save-bookmark {
        padding: 6px 12px; border-radius: 8px; border: 1px solid #a7f3d0;
        background: #34d399; color: #047857; font-size: 12px; font-weight: 600;
        cursor: pointer;
      }
      #lens-results-popup .lens-save-bookmark:hover:not(:disabled) { background: #6ee7b7; }
      #lens-results-popup .lens-save-bookmark:disabled { opacity: 0.7; cursor: default; }
      #lens-results-popup .lens-sort-select {
        padding: 6px 10px; border-radius: 8px; border: 1px solid #a7f3d0;
        background: #ecfdf5; color: #047857; font-size: 12px; font-weight: 500;
        cursor: pointer;
      }
      #lens-video-bubble {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: #34d399 !important;
        box-shadow: 0 4px 16px rgba(52, 211, 153, 0.4) !important;
        cursor: pointer;
        z-index: 2147483646;
        display: none;
        align-items: center;
        justify-content: center;
        font-size: 22px;
        color: #047857 !important;
        user-select: none;
        border: 2px solid #10b981 !important;
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      #lens-video-bubble.visible { display: flex; animation: lens-bubble-in 0.3s ease; }
      @keyframes lens-bubble-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
      #lens-video-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 20px rgba(52, 211, 153, 0.5) !important; }
    `;
  }

  function createOverlay() {
    if (document.getElementById(OVERLAY_ID)) return document.getElementById(OVERLAY_ID);
    injectStyles();
    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    const canvas = document.createElement('canvas');
    canvas.className = 'lens-canvas active';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    overlay.appendChild(canvas);
    const loadingMsg = document.createElement('div');
    loadingMsg.className = 'lens-loading-msg';
    loadingMsg.textContent = 'Analyzing & finding visually similar products…';
    overlay.appendChild(loadingMsg);
    document.body.appendChild(overlay);
    return { overlay, canvas };
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function showResultsPopup(description, similarProducts, webhookError, opts) {
    opts = opts || {};
    const croppedBase64 = opts.croppedBase64 || '';
    const bookmarkApiUrl = opts.bookmarkApiUrl || '';
    const bookmarkToken = opts.bookmarkToken || '';
    injectStyles();
    const id = 'lens-results-popup';
    let popup = document.getElementById(id);
    if (popup) popup.remove();
    popup = document.createElement('div');
    popup.id = id;

    function closePopup() {
      window.removeEventListener('mousemove', onHeaderMouseMove);
      window.removeEventListener('mouseup', onHeaderMouseUp);
      window.removeEventListener('keydown', onEscape);
      popup.remove();
    }

    function onEscape(e) {
      if (e.key === 'Escape') closePopup();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'lens-results-backdrop';
    backdrop.addEventListener('click', closePopup);

    const header = document.createElement('div');
    header.className = 'lens-results-header';
    header.innerHTML = '<h2 class="lens-results-title">Visually similar products</h2>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lens-results-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closePopup);
    closeBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    header.appendChild(closeBtn);

    let dragStart = null;
    function onHeaderMouseDown(e) {
      if (e.target === closeBtn) return;
      const rect = popup.getBoundingClientRect();
      popup.style.left = rect.left + 'px';
      popup.style.top = rect.top + 'px';
      popup.style.transform = 'none';
      popup.classList.add('dragging');
      dragStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    }
    function onHeaderMouseMove(e) {
      if (!dragStart) return;
      popup.style.left = (e.clientX - dragStart.x) + 'px';
      popup.style.top = (e.clientY - dragStart.y) + 'px';
    }
    function onHeaderMouseUp() {
      if (dragStart) popup.classList.remove('dragging');
      dragStart = null;
    }
    header.addEventListener('mousedown', onHeaderMouseDown);
    window.addEventListener('mousemove', onHeaderMouseMove);
    window.addEventListener('mouseup', onHeaderMouseUp);

    window.addEventListener('keydown', onEscape);

    const body = document.createElement('div');
    body.className = 'lens-results-body';
    body.innerHTML = '<div class="lens-results-section">Products that look like your selection</div><div class="lens-results-toolbar"></div><div class="lens-results-list"></div>';
    const listEl = body.querySelector('.lens-results-list');
    const sectionEl = body.querySelector('.lens-results-section');
    const toolbarEl = body.querySelector('.lens-results-toolbar');
    if (bookmarkApiUrl && bookmarkToken) {
      const saveBtn = document.createElement('button');
      saveBtn.className = 'lens-save-bookmark';
      saveBtn.textContent = 'Save Bookmark';
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        try {
          const res = await fetch((bookmarkApiUrl.replace(/\/$/, '')) + '/api/bookmarks', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + bookmarkToken
            },
            body: JSON.stringify({
              image: croppedBase64,
              description,
              similarProducts: products,
              sourceUrl: window.location.href
            })
          });
          if (!res.ok) throw new Error(await res.text());
          saveBtn.textContent = 'Saved!';
          showToast('Bookmark saved', 'success');
        } catch (e) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Bookmark';
          showToast(e.message || 'Failed to save', 'error');
        }
      });
      toolbarEl.appendChild(saveBtn);
    }
    if (webhookError) {
      const warn = document.createElement('p');
      warn.className = 'lens-no-products';
      warn.style.color = '#b45309';
      warn.textContent = 'Backend: ' + webhookError;
      body.insertBefore(warn, sectionEl);
    }
    const products = Array.isArray(similarProducts) ? similarProducts : [];
    function parsePriceNum(p) {
      if (p.priceNum != null && typeof p.priceNum === 'number') return p.priceNum;
      const s = (p.price || '').toString().replace(/[^0-9.]/g, '');
      const n = parseFloat(s);
      return isNaN(n) ? Infinity : n;
    }
    function sortWithNoPriceLast(arr, asc) {
      const withPrice = arr.filter((p) => parsePriceNum(p) !== Infinity);
      const noPrice = arr.filter((p) => parsePriceNum(p) === Infinity);
      withPrice.sort((a, b) => (asc ? parsePriceNum(a) - parsePriceNum(b) : parsePriceNum(b) - parsePriceNum(a)));
      noPrice.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return [...withPrice, ...noPrice];
    }
    function renderProducts(sorted) {
      listEl.innerHTML = '';
      if (sorted.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'lens-no-products';
        empty.textContent = 'No similar products found.';
        listEl.appendChild(empty);
        return;
      }
      sorted.forEach((p) => {
        const isRealProduct = p.link && !p.fallback;
        const card = document.createElement(isRealProduct ? 'a' : 'div');
        card.className = 'lens-product-card';
        if (isRealProduct) {
          card.href = p.link;
          card.target = '_blank';
          card.rel = 'noopener noreferrer';
        }

        const imgWrap = document.createElement('div');
        if (p.image) {
          const img = document.createElement('img');
          img.className = 'lens-product-img';
          img.src = p.image;
          img.alt = p.name || '';
          img.onerror = () => {
            img.remove();
            const ph = document.createElement('div');
            ph.className = 'lens-product-img-placeholder';
            ph.textContent = '🛒';
            imgWrap.appendChild(ph);
          };
          imgWrap.appendChild(img);
        } else {
          imgWrap.className = 'lens-product-img-placeholder';
          imgWrap.textContent = '🛒';
        }

        const info = document.createElement('div');
        info.className = 'lens-product-info';
        const name = document.createElement('div');
        name.className = 'lens-product-name';
        name.textContent = p.name || 'Product';
        const meta = document.createElement('div');
        meta.className = 'lens-product-meta';
        const parts = [];
        parts.push(`<span class="lens-product-price">${escapeHtml(p.price || 'Price N/A')}</span>`);
        if (p.source) parts.push(`<span class="lens-product-source"> · ${escapeHtml(p.source)}</span>`);
        meta.innerHTML = parts.join('');

        info.append(name, meta);
        card.append(imgWrap, info);

        if (p.fallback && p.search_query) {
          const links = document.createElement('div');
          links.className = 'lens-product-links';
          const q = encodeURIComponent(p.search_query.trim());
          const aGoogle = document.createElement('a');
          aGoogle.href = 'https://www.google.com/search?tbm=shop&q=' + q;
          aGoogle.target = '_blank';
          aGoogle.rel = 'noopener noreferrer';
          aGoogle.className = 'lens-link-google';
          aGoogle.textContent = 'Google Shopping';
          aGoogle.onclick = (e) => e.stopPropagation();
          const aAmazon = document.createElement('a');
          aAmazon.href = 'https://www.amazon.com/s?k=' + q;
          aAmazon.target = '_blank';
          aAmazon.rel = 'noopener noreferrer';
          aAmazon.className = 'lens-link-amazon';
          aAmazon.textContent = 'Amazon';
          aAmazon.onclick = (e) => e.stopPropagation();
          links.append(aGoogle, aAmazon);
          card.append(links);
        }

        listEl.appendChild(card);
      });
    }
    if (products.length > 0) {
      const sortSelect = document.createElement('select');
      sortSelect.className = 'lens-sort-select';
      sortSelect.innerHTML = '<option value="default">Default order</option><option value="price-asc">Price: Low to High</option><option value="price-desc">Price: High to Low</option>';
      sortSelect.addEventListener('change', () => {
        const v = sortSelect.value;
        let sorted = [...products];
        if (v === 'price-asc') sorted = sortWithNoPriceLast(sorted, true);
        else if (v === 'price-desc') sorted = sortWithNoPriceLast(sorted, false);
        else sorted = sortWithNoPriceLast(sorted, true);
        renderProducts(sorted);
      });
      toolbarEl.appendChild(sortSelect);
    }
    renderProducts(sortWithNoPriceLast([...products], true));

    popup.append(backdrop, header, body);
    document.body.appendChild(popup);
  }


  function showToast(message, type = 'success') {
    const id = 'lens-capture-toast';
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.className = type;
    el.style.display = 'block';
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => {
      el.style.display = 'none';
    }, 3500);
  }

  function drawSelection(ctx, rect, clear = true) {
    if (clear) {
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    }
    if (!rect || rect.w <= 0 || rect.h <= 0) return;
    ctx.strokeStyle = '#00aaff';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    ctx.fillStyle = 'rgba(0, 170, 255, 0.08)';
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  function cropImageToSelection(dataUrl, rect, dpr) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const c = document.createElement('canvas');
        const scale = dpr || window.devicePixelRatio || 1;
        const x = Math.round(rect.x * scale);
        const y = Math.round(rect.y * scale);
        const w = Math.round(rect.w * scale);
        const h = Math.round(rect.h * scale);
        if (w <= 0 || h <= 0) {
          reject(new Error('Invalid selection size'));
          return;
        }
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        try {
          const base64 = c.toDataURL('image/png').split(',')[1];
          resolve({ base64, mimeType: 'image/png' });
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Failed to load screenshot'));
      img.src = dataUrl;
    });
  }

  function runSnipping() {
    const { overlay, canvas } = createOverlay();
    const ctx = canvas.getContext('2d');
    let rect = { x: 0, y: 0, w: 0, h: 0 };
    let start = null;
    let editMode = false;
    let dragMode = null;
    let confirmBar = null;
    let handles = [];

    function setRect(from, to) {
      rect = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.max(20, Math.abs(to.x - from.x)),
        h: Math.max(20, Math.abs(to.y - from.y))
      };
    }

    function updateHandles() {
      handles.forEach((h) => {
        if (h.id === 'nw') { h.style.left = rect.x - 6 + 'px'; h.style.top = rect.y - 6 + 'px'; }
        if (h.id === 'ne') { h.style.left = rect.x + rect.w - 6 + 'px'; h.style.top = rect.y - 6 + 'px'; }
        if (h.id === 'sw') { h.style.left = rect.x - 6 + 'px'; h.style.top = rect.y + rect.h - 6 + 'px'; }
        if (h.id === 'se') { h.style.left = rect.x + rect.w - 6 + 'px'; h.style.top = rect.y + rect.h - 6 + 'px'; }
      });
    }

    function enterEditMode() {
      editMode = true;
      confirmBar = document.createElement('div');
      confirmBar.className = 'lens-confirm-bar';
      const btnSearch = document.createElement('button');
      btnSearch.className = 'lens-btn-search';
      btnSearch.textContent = 'Search';
      const btnCancel = document.createElement('button');
      btnCancel.className = 'lens-btn-cancel';
      btnCancel.textContent = 'Cancel';
      btnSearch.addEventListener('click', () => runSearch());
      btnCancel.addEventListener('click', removeOverlay);
      confirmBar.append(btnSearch, btnCancel);
      overlay.appendChild(confirmBar);

      ['nw', 'ne', 'sw', 'se'].forEach((id) => {
        const h = document.createElement('div');
        h.className = 'lens-resize-handle';
        h.id = id;
        h.dataset.corner = id;
        handles.push(h);
        overlay.appendChild(h);
      });
      updateHandles();
    }

    function runSearch() {
      overlay.classList.add('loading');
      (async () => {
        try {
          const captureRes = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'CAPTURE_TAB' }, resolve);
          });
          if (!captureRes?.success || !captureRes.dataUrl) {
            throw new Error(captureRes?.error || 'Screenshot failed');
          }
          const { base64, mimeType } = await cropImageToSelection(
            captureRes.dataUrl,
            rect,
            window.devicePixelRatio
          );
          const analyzeRes = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
              { type: 'ANALYZE_AND_SEND', payload: { croppedBase64: base64, mimeType } },
              resolve
            );
          });
          if (!analyzeRes?.success) {
            throw new Error(analyzeRes?.error || 'Analysis failed');
          }
          showResultsPopup(
            analyzeRes.description,
            analyzeRes.similarProducts || [],
            analyzeRes.webhookError || null,
            {
              croppedBase64: analyzeRes.croppedBase64,
              bookmarkApiUrl: analyzeRes.bookmarkApiUrl,
              bookmarkToken: analyzeRes.bookmarkToken
            }
          );
          let msg = analyzeRes.sentToWebhook
            ? 'Analyzed and sent to your backend.'
            : 'Analyzed.';
          if (analyzeRes.webhookError) {
            showToast('Analyzed. Backend: ' + analyzeRes.webhookError, 'warning');
          } else {
            showToast(msg, 'success');
          }
        } catch (err) {
          showToast(err.message || 'Something went wrong.', 'error');
        } finally {
          overlay.classList.remove('loading');
          removeOverlay();
        }
      })();
    }

    function onEditMouseDown(e) {
      if (overlay.classList.contains('loading')) return;
      if (e.target.tagName === 'BUTTON' || e.target.closest('.lens-confirm-bar')) return;
      const corner = e.target.dataset?.corner;
      const inBox = e.clientX >= rect.x && e.clientX <= rect.x + rect.w &&
        e.clientY >= rect.y && e.clientY <= rect.y + rect.h &&
        !corner;
      if (corner) {
        dragMode = { type: 'resize', corner };
      } else if (inBox) {
        dragMode = { type: 'move', startX: e.clientX - rect.x, startY: e.clientY - rect.y };
      }
    }

    function onEditMouseMove(e) {
      if (!dragMode) return;
      if (dragMode.type === 'move') {
        rect.x = Math.max(0, Math.min(window.innerWidth - rect.w, e.clientX - dragMode.startX));
        rect.y = Math.max(0, Math.min(window.innerHeight - rect.h, e.clientY - dragMode.startY));
      } else {
        const { corner } = dragMode;
        const mx = e.clientX, my = e.clientY;
        if (corner === 'nw') {
          rect.w = rect.x + rect.w - mx;
          rect.h = rect.y + rect.h - my;
          rect.x = mx;
          rect.y = my;
        } else if (corner === 'ne') {
          rect.w = mx - rect.x;
          rect.h = rect.y + rect.h - my;
          rect.y = my;
        } else if (corner === 'sw') {
          rect.w = rect.x + rect.w - mx;
          rect.h = my - rect.y;
          rect.x = mx;
        } else if (corner === 'se') {
          rect.w = mx - rect.x;
          rect.h = my - rect.y;
        }
        if (rect.w < 20) rect.w = 20;
        if (rect.h < 20) rect.h = 20;
        if (rect.x < 0) { rect.w += rect.x; rect.x = 0; }
        if (rect.y < 0) { rect.h += rect.y; rect.y = 0; }
      }
      drawSelection(ctx, rect);
      updateHandles();
    }

    function onEditMouseUp() {
      dragMode = null;
    }

    function onMouseDown(e) {
      if (overlay.classList.contains('loading')) return;
      if (editMode) {
        onEditMouseDown(e);
        return;
      }
      start = { x: e.clientX, y: e.clientY };
      rect = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
      drawSelection(ctx, rect);
    }

    function onMouseMove(e) {
      if (editMode) {
        onEditMouseMove(e);
        return;
      }
      if (!start) return;
      setRect(start, { x: e.clientX, y: e.clientY });
      drawSelection(ctx, rect);
    }

    function onMouseUp(e) {
      if (editMode) {
        onEditMouseUp(e);
        return;
      }
      if (!start) return;
      setRect(start, { x: e.clientX, y: e.clientY });
      if (rect.w < 5 || rect.h < 5) {
        start = null;
        drawSelection(ctx, null);
        return;
      }
      start = null;
      enterEditMode();
      drawSelection(ctx, rect);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') removeOverlay();
    }

    function removeOverlay() {
      overlay.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      if (confirmBar) confirmBar.remove();
      handles.forEach((h) => h.remove());
      const el = document.getElementById(OVERLAY_ID);
      if (el) el.remove();
      const b = document.getElementById('lens-video-bubble');
      if (b) {
        b.classList.add('visible');
        b.style.display = 'flex';
      }
    }

    overlay.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }

  function createVideoBubble() {
    const BUBBLE_ID = 'lens-video-bubble';
    let bubble = document.getElementById(BUBBLE_ID);
    if (bubble) return bubble;

    injectStyles();
    bubble = document.createElement('div');
    bubble.id = BUBBLE_ID;
    bubble.setAttribute('aria-label', 'Find similar products');
    bubble.title = 'Click to select product to search';
    bubble.innerHTML = '🔍';
    bubble.style.display = 'none';

    let dragStart = null;
    let didDrag = false;

    bubble.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      didDrag = false;
      const rect = bubble.getBoundingClientRect();
      bubble.style.left = rect.left + 'px';
      bubble.style.top = rect.top + 'px';
      bubble.style.right = 'auto';
      bubble.style.bottom = 'auto';
      dragStart = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    });

    window.addEventListener('mousemove', (e) => {
      if (!dragStart) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true;
      bubble.style.left = (dragStart.left + dx) + 'px';
      bubble.style.top = (dragStart.top + dy) + 'px';
    });

    window.addEventListener('mouseup', () => { dragStart = null; });

    bubble.addEventListener('click', (e) => {
      if (didDrag) return;
      e.preventDefault();
      e.stopPropagation();
      bubble.classList.remove('visible');
      bubble.style.display = 'none';
      runSnipping();
    });

    document.body.appendChild(bubble);
    return bubble;
  }

  function showVideoBubble() {
    const bubble = createVideoBubble();
    bubble.style.display = 'flex';
    bubble.classList.add('visible');
  }

  function isVideoSite() {
    const host = window.location.hostname.toLowerCase();
    return /youtube\.com|youtu\.be|vimeo\.com|twitch\.tv|dailymotion\.com|bilibili\.com|facebook\.com\/watch|instagram\.com/i.test(host);
  }

  function findVideosIncludingShadow(root, found) {
    try {
      root.querySelectorAll('video').forEach((v) => found.push(v));
      root.querySelectorAll('*').forEach((node) => {
        if (node.shadowRoot) findVideosIncludingShadow(node.shadowRoot, found);
      });
    } catch (_) {}
  }

  function observeVideoPlay() {
    const found = [];
    findVideosIncludingShadow(document.documentElement, found);
    found.forEach((video) => {
      if (video._lensPlayListener) return;
      video._lensPlayListener = true;
      video.addEventListener('play', () => showVideoBubble());
    });
    found.forEach((v) => { if (!v.paused) showVideoBubble(); });
  }

  function initVideoBubble() {
    injectStyles();
    observeVideoPlay();
    if (isVideoSite()) {
      setTimeout(showVideoBubble, 1500);
    }
    const mo = new MutationObserver(() => observeVideoPlay());
    if (document.body) {
      mo.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        mo.observe(document.body, { childList: true, subtree: true });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVideoBubble);
  } else {
    initVideoBubble();
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_LENS_CAPTURE') {
      runSnipping();
    }
  });
})();
