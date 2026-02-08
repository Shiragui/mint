const API_BASE = window.location.origin;

function getToken() {
  return localStorage.getItem('lens_token');
}

function setToken(token) {
  if (token) localStorage.setItem('lens_token', token);
  else localStorage.removeItem('lens_token');
}

function showView(id) {
  document.querySelectorAll('.view').forEach(el => el.classList.add('hidden'));
  const v = document.getElementById(id);
  if (v) v.classList.remove('hidden');
}

function showError(elId, msg) {
  const el = document.getElementById(elId);
  if (!el) return;
  el.textContent = msg || '';
  el.classList.toggle('hidden', !msg);
}

async function fetchApi(path, opts = {}) {
  const token = getToken();
  const headers = { ...opts.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && typeof opts.body === 'object' && !(opts.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(opts.body);
  }
  const res = await fetch(API_BASE + path, { ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    showView('login-view');
    throw new Error('Session expired');
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || err.message || 'Request failed');
  }
  return res.json().catch(() => ({}));
}

async function login(username, password) {
  const body = new URLSearchParams();
  body.append('username', username);
  body.append('password', password);
  const res = await fetch(API_BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Login failed');
  }
  const data = await res.json();
  setToken(data.access_token);
}

async function register(username, password) {
  const data = await fetch(API_BASE + '/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || 'Registration failed');
    }
    return res.json();
  });
  setToken(data.access_token);
}

function renderBookmark(b) {
  const card = document.createElement('div');
  card.className = 'bookmark-card';
  card.dataset.id = b.id;

  const thumb = b.image_base64
    ? `<img class="bookmark-thumb" src="data:image/png;base64,${b.image_base64}" alt="">`
    : '<div class="bookmark-thumb-placeholder">🛒</div>';

  const count = Array.isArray(b.results) ? b.results.length : 0;
  card.innerHTML = `
    <button class="bookmark-delete" title="Delete" aria-label="Delete bookmark" style="position:absolute;top:8px;right:8px;background:none;border:none;cursor:pointer;padding:4px;font-size:18px;color:#9ca3af;line-height:1;z-index:1">×</button>
    ${thumb}
    <div class="bookmark-info">
      <p class="bookmark-desc">${escapeHtml(b.description || 'No description')}</p>
      <p class="bookmark-meta">
        <span class="bookmark-results-count">${count} similar product${count !== 1 ? 's' : ''}</span>
        · ${new Date(b.created_at).toLocaleDateString()}
      </p>
    </div>
  `;
  card.style.position = 'relative';
  card.querySelector('.bookmark-delete').addEventListener('click', (e) => {
    e.stopPropagation();
    deleteBookmark(b.id);
  });
  return card;
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

async function deleteBookmark(id) {
  await fetchApi(`/api/bookmarks/${id}`, { method: 'DELETE' });
  closeModal();
  loadBookmarks();
}

function renderDetail(b) {
  const body = document.getElementById('detail-body');
  const img = b.image_base64
    ? `<img class="detail-img" src="data:image/png;base64,${b.image_base64}" alt="">`
    : '';
  const results = (b.results || []).map(r => `
    <a href="${escapeHtml(r.link || '#')}" target="_blank" rel="noopener" class="result-item">
      ${r.image ? `<img src="${escapeHtml(r.image)}" alt="">` : '<div style="width:48px;height:48px;background:var(--mint-pale);border-radius:8px;display:flex;align-items:center;justify-content:center">🛒</div>'}
      <div class="result-item-info">
        <div class="result-item-name">${escapeHtml(r.name || 'Product')}</div>
        <div class="result-item-price">${escapeHtml(r.price || 'Price N/A')}</div>
      </div>
    </a>
  `).join('');
  body.innerHTML = `
    ${img}
    <p class="detail-desc">${escapeHtml(b.description || 'No description')}</p>
    <div class="detail-products">
      <h3>Similar products</h3>
      ${results.length ? results : '<p style="color:#6b7280;font-size:14px">No results saved.</p>'}
    </div>
    <button id="detail-delete-btn" class="btn-danger" style="margin-top:16px;padding:8px 16px;background:#b91c1c;color:white;border:none;border-radius:8px;cursor:pointer">Delete bookmark</button>
  `;
  document.getElementById('detail-delete-btn').addEventListener('click', () => deleteBookmark(b.id));
}

async function loadBookmarks() {
  const data = await fetchApi('/api/bookmarks');
  const list = document.getElementById('bookmarks-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';
  if (!data.bookmarks || data.bookmarks.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  data.bookmarks.forEach(b => {
    const card = renderBookmark(b);
    card.addEventListener('click', () => openDetail(b.id));
    list.appendChild(card);
  });
}

async function openDetail(id) {
  const b = await fetchApi(`/api/bookmarks/${id}`);
  renderDetail(b);
  document.getElementById('detail-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    showView('dashboard-view');
    loadBookmarks();
  } else {
    showView('login-view');
  }

  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('login-error');
    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    if (!username || !password) {
      showError('login-error', 'Enter username and password');
      return;
    }
    try {
      await login(username, password);
      showView('dashboard-view');
      loadBookmarks();
    } catch (err) {
      showError('login-error', err.message);
    }
  });

  document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    showError('signup-error');
    const username = document.getElementById('signup-username').value.trim();
    const password = document.getElementById('signup-password').value;
    if (!username || !password) {
      showError('signup-error', 'Enter username and password');
      return;
    }
    if (username.length < 2) {
      showError('signup-error', 'Username must be at least 2 characters');
      return;
    }
    if (password.length < 4) {
      showError('signup-error', 'Password must be at least 4 characters');
      return;
    }
    try {
      await register(username, password);
      showView('dashboard-view');
      loadBookmarks();
    } catch (err) {
      showError('signup-error', err.message);
    }
  });

  document.getElementById('link-to-signup').addEventListener('click', (e) => {
    e.preventDefault();
    showError('login-error');
    showView('signup-view');
  });

  document.getElementById('link-to-login').addEventListener('click', (e) => {
    e.preventDefault();
    showError('signup-error');
    showView('login-view');
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    setToken(null);
    showView('login-view');
  });

  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.querySelector('.modal-close').addEventListener('click', closeModal);
});
