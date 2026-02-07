/**
 * Lens Capture - Content Script
 * Snipping overlay: transparent full-page canvas, click-and-drag to select rectangle.
 * Captures tab via background, crops to selection, sends for analysis and webhook.
 */

(function () {
  const OVERLAY_ID = 'lens-capture-overlay';
  const STYLE_ID = 'lens-capture-styles';

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
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
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 2147483649;
        width: min(420px, calc(100vw - 32px));
        max-height: 85vh;
        background: #fff;
        border-radius: 12px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        font-family: system-ui, -apple-system, sans-serif;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: lens-popup-in 0.2s ease;
      }
      @keyframes lens-popup-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.96); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      #lens-results-popup .lens-results-backdrop {
        position: fixed;
        inset: 0;
        z-index: -1;
        background: rgba(0,0,0,0.4);
      }
      #lens-results-popup .lens-results-header {
        padding: 16px 20px;
        border-bottom: 1px solid #e5e7eb;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      #lens-results-popup .lens-results-title { margin: 0; font-size: 16px; font-weight: 600; color: #111; }
      #lens-results-popup .lens-results-close {
        width: 32px; height: 32px;
        border: none; background: #f3f4f6; color: #374151;
        border-radius: 8px; cursor: pointer; font-size: 18px; line-height: 1;
        display: flex; align-items: center; justify-content: center;
      }
      #lens-results-popup .lens-results-close:hover { background: #e5e7eb; }
      #lens-results-popup .lens-results-body { padding: 16px 20px; overflow-y: auto; flex: 1; }
      #lens-results-popup .lens-results-desc { font-size: 14px; color: #374151; line-height: 1.5; margin: 0 0 16px; }
      #lens-results-popup .lens-results-section { font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 10px; }
      #lens-results-popup .lens-product-card {
        background: #f9fafb;
        border-radius: 10px;
        padding: 12px 14px;
        margin-bottom: 10px;
        border: 1px solid #e5e7eb;
        display: flex;
        gap: 12px;
        align-items: flex-start;
        text-decoration: none;
        color: inherit;
        transition: background 0.15s ease, border-color 0.15s ease;
      }
      #lens-results-popup .lens-product-card:hover { background: #f3f4f6; border-color: #d1d5db; }
      #lens-results-popup .lens-product-card:last-child { margin-bottom: 0; }
      #lens-results-popup .lens-product-img {
        width: 64px; height: 64px; object-fit: cover; border-radius: 8px; flex-shrink: 0;
      }
      #lens-results-popup .lens-product-img-placeholder {
        width: 64px; height: 64px; background: #e5e7eb; border-radius: 8px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center; font-size: 20px; color: #9ca3af;
      }
      #lens-results-popup .lens-product-info { flex: 1; min-width: 0; }
      #lens-results-popup .lens-product-name { font-weight: 600; font-size: 14px; color: #111; margin-bottom: 4px; line-height: 1.3; }
      #lens-results-popup .lens-product-meta { font-size: 12px; color: #6b7280; }
      #lens-results-popup .lens-product-price { font-weight: 600; color: #0d7a3c; }
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
    `;
    document.head.appendChild(style);
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
    loadingMsg.textContent = 'Analyzing & finding similar products…';
    overlay.appendChild(loadingMsg);
    document.body.appendChild(overlay);
    return { overlay, canvas };
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  function showResultsPopup(description, similarProducts, webhookError) {
    const id = 'lens-results-popup';
    let popup = document.getElementById(id);
    if (popup) popup.remove();
    popup = document.createElement('div');
    popup.id = id;

    function closePopup() {
      popup.remove();
      window.removeEventListener('keydown', onEscape);
    }

    function onEscape(e) {
      if (e.key === 'Escape') closePopup();
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'lens-results-backdrop';
    backdrop.addEventListener('click', closePopup);

    const header = document.createElement('div');
    header.className = 'lens-results-header';
    header.innerHTML = '<h2 class="lens-results-title">Similar to selection</h2>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'lens-results-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', closePopup);
    header.appendChild(closeBtn);
    window.addEventListener('keydown', onEscape);

    const body = document.createElement('div');
    body.className = 'lens-results-body';
    body.innerHTML = '<p class="lens-results-desc"></p><div class="lens-results-section">Similar products to buy</div><div class="lens-results-list"></div>';
    const descEl = body.querySelector('.lens-results-desc');
    const listEl = body.querySelector('.lens-results-list');
    descEl.textContent = description || 'No description.';
    if (webhookError) {
      const warn = document.createElement('p');
      warn.className = 'lens-no-products';
      warn.style.color = '#b45309';
      warn.textContent = 'Backend: ' + webhookError;
      body.insertBefore(warn, body.querySelector('.lens-results-section'));
    }
    if (Array.isArray(similarProducts) && similarProducts.length > 0) {
      similarProducts.forEach((p) => {
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
        if (p.price) parts.push(`<span class="lens-product-price">${escapeHtml(p.price)}</span>`);
        if (p.source) parts.push(`<span class="lens-product-source"> · ${escapeHtml(p.source)}</span>`);
        meta.innerHTML = parts.join('') || '';

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
    } else {
      const empty = document.createElement('p');
      empty.className = 'lens-no-products';
      empty.textContent = 'No similar products found.';
      listEl.appendChild(empty);
    }

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

    function setRect(from, to) {
      rect = {
        x: Math.min(from.x, to.x),
        y: Math.min(from.y, to.y),
        w: Math.abs(to.x - from.x),
        h: Math.abs(to.y - from.y)
      };
    }

    function onMouseDown(e) {
      if (overlay.classList.contains('loading')) return;
      start = { x: e.clientX, y: e.clientY };
      rect = { x: e.clientX, y: e.clientY, w: 0, h: 0 };
      drawSelection(ctx, rect);
    }

    function onMouseMove(e) {
      if (!start) return;
      setRect(start, { x: e.clientX, y: e.clientY });
      drawSelection(ctx, rect);
    }

    function onMouseUp(e) {
      if (!start) return;
      setRect(start, { x: e.clientX, y: e.clientY });
      if (rect.w < 5 || rect.h < 5) {
        start = null;
        drawSelection(ctx, null);
        return;
      }
      start = null;
      overlay.classList.add('loading');
      drawSelection(ctx, rect);

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
            analyzeRes.webhookError || null
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

    function onKeyDown(e) {
      if (e.key === 'Escape') removeOverlay();
    }

    function removeOverlay() {
      overlay.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('keydown', onKeyDown);
      const el = document.getElementById(OVERLAY_ID);
      if (el) el.remove();
    }

    overlay.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('keydown', onKeyDown);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'START_LENS_CAPTURE') {
      runSnipping();
    }
  });
})();
