const API_BASE = 'https://mintgreen.netlify.app';

const loginView = document.getElementById('login-view');
const loggedInView = document.getElementById('logged-in-view');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const loginError = document.getElementById('login-error');
const signInBtn = document.getElementById('sign-in-btn');

async function checkAuth() {
  const { bookmarkToken } = await chrome.storage.local.get(['bookmarkToken']);
  if (bookmarkToken) {
    loginView.style.display = 'none';
    loggedInView.style.display = 'block';
  } else {
    loginView.style.display = 'block';
    loggedInView.style.display = 'none';
  }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username || !password) {
    loginError.textContent = 'Please enter username and password.';
    loginError.style.display = 'block';
    return;
  }

  signInBtn.disabled = true;
  signInBtn.textContent = 'Signing in…';
  loginError.style.display = 'none';

  try {
    const baseUrl = (await chrome.storage.local.get(['bookmarkApiUrl'])).bookmarkApiUrl || API_BASE;
    const url = baseUrl.replace(/\/$/, '') + '/auth/login';
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
      throw new Error(res.status === 404 ? 'Backend not found. Set the correct URL in Options.' : 'Invalid response from server');
    }

    if (!res.ok) {
      throw new Error(data.detail || 'Sign in failed');
    }

    await chrome.storage.local.set({
      bookmarkApiUrl: baseUrl.replace(/\/$/, ''),
      bookmarkToken: data.access_token
    });
    passwordInput.value = '';
    window.close();
  } catch (err) {
    loginError.textContent = err.message || 'Sign in failed';
    loginError.style.display = 'block';
  } finally {
    signInBtn.disabled = false;
    signInBtn.textContent = 'Sign in';
  }
});

document.getElementById('sign-out').addEventListener('click', async () => {
  await chrome.storage.local.remove(['bookmarkApiUrl', 'bookmarkToken']);
  await checkAuth();
});

document.getElementById('start-capture').addEventListener('click', async () => {
  const btn = document.getElementById('start-capture');
  btn.disabled = true;
  btn.textContent = 'Opening…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
    await chrome.tabs.sendMessage(tab.id, { type: 'START_LENS_CAPTURE' });
    window.close();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Capture area';
    const msg = e?.message || 'Could not start capture';
    if (msg.includes('Receiving end does not exist') || msg.includes('Extension context invalidated')) {
      alert('Please refresh the current page and try again.');
    } else {
      alert('Error: ' + msg);
    }
  }
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

checkAuth();
