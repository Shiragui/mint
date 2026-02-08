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

async function fetchPublic(path) {
  const res = await fetch(API_BASE + path);
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

let state = { boards: [], bookmarks: [], selectedBoardId: null, currentTab: 'profile' };

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

function showProfileTab() {
  state.currentTab = 'profile';
  document.getElementById('profile-main').classList.remove('hidden');
  document.getElementById('feed-main').classList.add('hidden');
  document.getElementById('nav-profile').classList.add('active');
  document.getElementById('nav-feed').classList.remove('active');
}

function showFeedTab() {
  state.currentTab = 'feed';
  document.getElementById('profile-main').classList.add('hidden');
  document.getElementById('feed-main').classList.remove('hidden');
  document.getElementById('nav-profile').classList.remove('active');
  document.getElementById('nav-feed').classList.add('active');
  document.getElementById('feed-board-view').classList.add('hidden');
  document.getElementById('feed-boards-list').classList.remove('hidden');
  loadFeed();
}

function renderBoards() {
  const list = document.getElementById('boards-list');
  const createForm = document.getElementById('create-board-form');
  const newBoardBtn = document.getElementById('btn-new-board');
  list.innerHTML = '';
  state.boards.forEach((b) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'board-tab' + (state.selectedBoardId === b.id ? ' active' : '');
    btn.textContent = b.name;
    btn.dataset.boardId = b.id;
    btn.addEventListener('click', () => {
      state.selectedBoardId = b.id;
      renderBoards();
      renderBookmarks();
    });
    list.appendChild(btn);
  });
  newBoardBtn.classList.toggle('hidden', !createForm.classList.contains('hidden'));
}

function renderBookmark(b, isFeed = false) {
  const card = document.createElement('div');
  card.className = 'bookmark-card';
  card.dataset.id = b.id;

  const thumb = b.image_base64
    ? `<img class="bookmark-thumb" src="data:image/png;base64,${b.image_base64}" alt="">`
    : '<div class="bookmark-thumb-placeholder">🛒</div>';

  const count = Array.isArray(b.results) ? b.results.length : 0;
  const defaultBoardId = state.boards[0]?.id || '';
  const boardId = b.board_id || defaultBoardId;

  const moveSection = isFeed ? '' : `
    <div class="bookmark-move">
      <label>Move to:</label>
      <select class="bookmark-board-select" data-id="${escapeHtml(b.id)}">
        ${state.boards.map((br) => `<option value="${br.id}" ${br.id === boardId ? 'selected' : ''}>${escapeHtml(br.name)}</option>`).join('')}
      </select>
    </div>
  `;

  const deleteBtn = isFeed ? '' : '<button class="bookmark-delete" title="Delete" aria-label="Delete bookmark">×</button>';

  card.innerHTML = `
    ${deleteBtn}
    ${thumb}
    <div class="bookmark-info">
      <p class="bookmark-desc">${escapeHtml(b.description || 'No description')}</p>
      <p class="bookmark-meta">
        <span class="bookmark-results-count">${count} similar product${count !== 1 ? 's' : ''}</span>
        · ${new Date(b.created_at).toLocaleDateString()}
      </p>
      ${moveSection}
    </div>
  `;
  card.style.position = 'relative';
  if (!isFeed) {
    const delBtn = card.querySelector('.bookmark-delete');
    if (delBtn) delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteBookmark(b.id); });
    const sel = card.querySelector('.bookmark-board-select');
    if (sel) sel.addEventListener('change', (e) => { e.stopPropagation(); moveBookmark(b.id, e.target.value); });
  }
  card.addEventListener('click', (e) => {
    if (isFeed || !e.target.closest('.bookmark-delete, .bookmark-board-select')) {
      openDetail(b, isFeed);
    }
  });
  return card;
}

async function deleteBookmark(id) {
  await fetchApi(`/api/bookmarks/${id}`, { method: 'DELETE' });
  closeModal();
  loadAll();
}

async function moveBookmark(id, boardId) {
  await fetchApi(`/api/bookmarks/${id}`, {
    method: 'PATCH',
    body: { board_id: boardId },
  });
  const b = state.bookmarks.find((x) => x.id === id);
  if (b) b.board_id = boardId;
  if (state.selectedBoardId !== boardId) {
    renderBookmarks();
  }
}

function renderDetail(b, isReadOnly = false) {
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
  const deleteBtn = isReadOnly ? '' : `
    <button id="detail-delete-btn" class="btn-danger" style="margin-top:16px;padding:8px 16px;background:#b91c1c;color:white;border:none;border-radius:8px;cursor:pointer">Delete bookmark</button>
  `;
  body.innerHTML = `
    ${img}
    <p class="detail-desc">${escapeHtml(b.description || 'No description')}</p>
    <div class="detail-products">
      <h3>Similar products</h3>
      ${results.length ? results : '<p style="color:#6b7280;font-size:14px">No results saved.</p>'}
    </div>
    ${deleteBtn}
  `;
  const delBtn = document.getElementById('detail-delete-btn');
  if (delBtn) delBtn.addEventListener('click', () => deleteBookmark(b.id));
}

async function openDetail(b, isReadOnly = false) {
  if (!isReadOnly && typeof b === 'string') {
    b = await fetchApi(`/api/bookmarks/${b}`);
  }
  renderDetail(b, isReadOnly);
  document.getElementById('detail-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('detail-modal').classList.add('hidden');
}

function renderBookmarks() {
  const list = document.getElementById('bookmarks-list');
  const empty = document.getElementById('empty-state');
  list.innerHTML = '';
  const filtered = state.selectedBoardId
    ? state.bookmarks.filter((b) => (b.board_id || state.boards[0]?.id) === state.selectedBoardId)
    : state.bookmarks;
  if (filtered.length === 0) {
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  filtered.forEach((b) => {
    list.appendChild(renderBookmark(b, false));
  });
}

async function loadAll() {
  try {
    const [boardsData, bookmarksData] = await Promise.all([
      fetchApi('/api/boards'),
      fetchApi('/api/bookmarks'),
    ]);
    state.boards = boardsData.boards || [];
    state.bookmarks = bookmarksData.bookmarks || [];
    if (state.boards.length > 0 && !state.selectedBoardId) {
      state.selectedBoardId = state.boards[0].id;
    }
    renderBoards();
    renderBookmarks();
  } catch (err) {
    console.error(err);
  }
}

async function loadFeed() {
  try {
    const data = await fetchPublic('/api/feed/boards');
    const boards = data.boards || [];
    const list = document.getElementById('feed-boards-list');
    const empty = document.getElementById('feed-empty');
    list.innerHTML = '';
    if (boards.length === 0) {
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    boards.forEach((board) => {
      const card = document.createElement('div');
      card.className = 'feed-board-card';
      card.innerHTML = `
        <h3 class="feed-board-card-title">${escapeHtml(board.name)}</h3>
        <p class="feed-board-card-owner">by ${escapeHtml(board.owner_name)}</p>
      `;
      card.addEventListener('click', () => openFeedBoard(board.id));
      list.appendChild(card);
    });
  } catch (err) {
    console.error(err);
  }
}

async function openFeedBoard(boardId) {
  try {
    const data = await fetchPublic(`/api/feed/boards/${boardId}`);
    document.getElementById('feed-boards-list').classList.add('hidden');
    document.getElementById('feed-empty').classList.add('hidden');
    const view = document.getElementById('feed-board-view');
    view.classList.remove('hidden');
    document.getElementById('feed-board-title').textContent = data.board.name;
    document.getElementById('feed-board-owner').textContent = `by ${data.board.owner_name}`;
    const list = document.getElementById('feed-board-bookmarks');
    list.innerHTML = '';
    (data.bookmarks || []).forEach((b) => {
      list.appendChild(renderBookmark(b, true));
    });
  } catch (err) {
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (getToken()) {
    showView('dashboard-view');
    showProfileTab();
    loadAll();
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
      showProfileTab();
      loadAll();
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
      showProfileTab();
      loadAll();
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

  document.getElementById('nav-profile').addEventListener('click', (e) => {
    e.preventDefault();
    showProfileTab();
  });

  document.getElementById('nav-feed').addEventListener('click', (e) => {
    e.preventDefault();
    showFeedTab();
  });

  document.getElementById('feed-back-btn').addEventListener('click', () => {
    document.getElementById('feed-board-view').classList.add('hidden');
    document.getElementById('feed-boards-list').classList.remove('hidden');
  });

  document.getElementById('btn-new-board').addEventListener('click', () => {
    document.getElementById('create-board-form').classList.remove('hidden');
    document.getElementById('btn-new-board').classList.add('hidden');
    document.getElementById('new-board-name').value = '';
    document.getElementById('new-board-name').focus();
  });

  document.getElementById('btn-cancel-board').addEventListener('click', () => {
    document.getElementById('create-board-form').classList.add('hidden');
    document.getElementById('btn-new-board').classList.remove('hidden');
  });

  document.getElementById('btn-create-board').addEventListener('click', async () => {
    const name = document.getElementById('new-board-name').value.trim();
    if (!name) return;
    try {
      const board = await fetchApi('/api/boards', {
        method: 'POST',
        body: { name },
      });
      state.boards.push(board);
      state.selectedBoardId = board.id;
      document.getElementById('create-board-form').classList.add('hidden');
      document.getElementById('btn-new-board').classList.remove('hidden');
      renderBoards();
      renderBookmarks();
    } catch (err) {
      console.error(err);
    }
  });

  document.getElementById('new-board-name').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('btn-create-board').click();
  });

  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.querySelector('.modal-close').addEventListener('click', closeModal);
});
