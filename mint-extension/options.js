// Options page – config is in config.js
// Bookmark login: store JWT in chrome.storage for saving bookmarks

const STORAGE_KEYS = { bookmarkApiUrl: 'bookmarkApiUrl', bookmarkToken: 'bookmarkToken' };

async function loadStored() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.bookmarkApiUrl, STORAGE_KEYS.bookmarkToken]);
  const urlInput = document.getElementById('bookmarkApiUrl');
  if (urlInput) urlInput.value = data.bookmarkApiUrl || '';
  updateStatus();
}

async function updateStatus() {
  const data = await chrome.storage.local.get([STORAGE_KEYS.bookmarkToken]);
  const statusEl = document.getElementById('bookmarkStatus');
  if (!statusEl) return;
  if (data.bookmarkToken) {
    statusEl.textContent = 'Logged in. You can save bookmarks from the extension.';
    statusEl.className = 'status success';
  } else {
    statusEl.textContent = 'Not logged in. Log in to save bookmarks.';
    statusEl.className = 'status';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadStored();

  document.getElementById('bookmarkLoginBtn')?.addEventListener('click', async () => {
    const baseUrl = document.getElementById('bookmarkApiUrl')?.value?.trim();
    const username = document.getElementById('bookmarkUsername')?.value?.trim();
    const password = document.getElementById('bookmarkPassword')?.value;

    const statusEl = document.getElementById('bookmarkStatus');
    if (!baseUrl || !username || !password) {
      statusEl.textContent = 'Please fill in all fields.';
      statusEl.className = 'status error';
      return;
    }

    const url = baseUrl.replace(/\/$/, '') + '/auth/login';
    statusEl.textContent = 'Logging in…';
    statusEl.className = 'status';

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ username, password }).toString()
      });
      const text = await res.text();
      let data;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        throw new Error(res.status === 404
          ? 'Backend not found (404). Check the URL is correct (e.g. https://mintgreen.netlify.app)'
          : text || 'Invalid response from server');
      }

      if (!res.ok) {
        throw new Error(data.detail || 'Login failed');
      }

      await chrome.storage.local.set({
        [STORAGE_KEYS.bookmarkApiUrl]: baseUrl,
        [STORAGE_KEYS.bookmarkToken]: data.access_token
      });
      statusEl.textContent = 'Logged in successfully.';
      statusEl.className = 'status success';
      document.getElementById('bookmarkPassword').value = '';
    } catch (e) {
      statusEl.textContent = e.message || 'Login failed';
      statusEl.className = 'status error';
    }
  });

  document.getElementById('bookmarkLogoutBtn')?.addEventListener('click', async () => {
    await chrome.storage.local.remove([STORAGE_KEYS.bookmarkApiUrl, STORAGE_KEYS.bookmarkToken]);
    document.getElementById('bookmarkApiUrl').value = '';
    document.getElementById('bookmarkUsername').value = '';
    document.getElementById('bookmarkPassword').value = '';
    updateStatus();
  });
});
