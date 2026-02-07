const providerSelect = document.getElementById('vision-provider');
const dedalusInput = document.getElementById('dedalus-api-key');
const geminiInput = document.getElementById('gemini-api-key');
const backendUrlInput = document.getElementById('backend-url');
const authTokenInput = document.getElementById('auth-token');
const webhookInput = document.getElementById('webhook-url');
const saveBtn = document.getElementById('save');
const statusEl = document.getElementById('options-status');
const labelDedalus = document.getElementById('label-dedalus');
const labelGemini = document.getElementById('label-gemini');

function showStatus(text, type = 'success') {
  statusEl.textContent = text;
  statusEl.className = 'status ' + type;
}

function updateKeyLabels() {
  const p = providerSelect.value;
  labelDedalus.style.opacity = p === 'dedalus' ? '1' : '0.6';
  labelGemini.style.opacity = p === 'gemini' ? '1' : '0.6';
}

async function load() {
  const {
    visionProvider = 'dedalus',
    dedalusApiKey = '',
    geminiApiKey = '',
    backendUrl = '',
    authToken = '',
    webhookUrl = ''
  } = await chrome.storage.sync.get([
    'visionProvider',
    'dedalusApiKey',
    'geminiApiKey',
    'backendUrl',
    'authToken',
    'webhookUrl'
  ]);
  providerSelect.value = visionProvider;
  dedalusInput.value = dedalusApiKey;
  geminiInput.value = geminiApiKey;
  backendUrlInput.value = backendUrl;
  authTokenInput.value = authToken;
  webhookInput.value = webhookUrl;
  updateKeyLabels();
}

saveBtn.addEventListener('click', async () => {
  const visionProvider = providerSelect.value;
  const dedalusApiKey = dedalusInput.value.trim();
  const geminiApiKey = geminiInput.value.trim();
  const backendUrl = backendUrlInput.value.trim();
  const authToken = authTokenInput.value.trim();
  const webhookUrl = webhookInput.value.trim();

  const useBackend = !!backendUrl;
  const activeKey = visionProvider === 'gemini' ? geminiApiKey : dedalusApiKey;
  if (!useBackend && !activeKey) {
    const name = visionProvider === 'gemini' ? 'Gemini' : 'Dedalus Labs';
    showStatus('Either set Backend URL or enter the ' + name + ' API key.', 'error');
    return;
  }

  saveBtn.disabled = true;
  try {
    await chrome.storage.sync.set({
      visionProvider,
      dedalusApiKey,
      geminiApiKey,
      backendUrl,
      authToken,
      webhookUrl
    });
    showStatus('Settings saved.');
  } catch (e) {
    showStatus('Failed to save: ' + (e.message || 'unknown'), 'error');
  } finally {
    saveBtn.disabled = false;
  }
});

providerSelect.addEventListener('change', updateKeyLabels);

load();
