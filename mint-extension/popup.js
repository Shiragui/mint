document.getElementById('start-capture').addEventListener('click', async () => {
  const btn = document.getElementById('start-capture');
  btn.disabled = true;
  btn.textContent = 'Opening…';
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab');
    }
    try {
      await chrome.tabs.sendMessage(tab.id, { type: 'START_LENS_CAPTURE' });
    } catch (e) {
      if (e.message && e.message.includes('Receiving end does not exist')) {
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
        await chrome.tabs.sendMessage(tab.id, { type: 'START_LENS_CAPTURE' });
      } else throw e;
    }
    window.close();
  } catch (e) {
    btn.disabled = false;
    btn.textContent = 'Capture area';
    if (e.message && e.message.includes('Receiving end does not exist')) {
      alert('Please refresh the current page and try again.');
    } else {
      alert('Error: ' + (e.message || 'Could not start capture'));
    }
  }
});

document.getElementById('open-options').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
