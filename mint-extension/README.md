# Lens Capture – Chrome Extension

A Chrome Extension that mimics Google Lens: select any area on a webpage, analyze it with OpenAI’s Vision API (GPT-4o-mini), and optionally POST the image and description to your webhook.

## Features

- **Snipping overlay**: Click the extension icon, then click and drag on the page to draw a rectangle. The selected region is captured and analyzed.
- **Vision AI**: Cropped image is sent to **Dedalus Labs** (Google Gemini via Dedalus) or **Google Gemini** directly for a short description.
- **Webhook**: Optional POST of `{ image (base64), description, timestamp }` to a URL you configure.
- **Loading & feedback**: “Analyzing…” state while the AI runs; toast notification on success or error.

## Setup

1. **Load the extension in Chrome**
   - Open `chrome://extensions/`
   - Enable “Developer mode”
   - Click “Load unpacked” and select the `chrome-lens-extension` folder

2. **Configure API keys**
   - Copy `.env.example` to `.env` and add your values.
   - Run `node scripts/build-config.js` to generate `config.js` from `.env`.
   - Both `.env` and `config.js` are gitignored for security.
   - Keys: **VISION_PROVIDER** (`gemini` or `dedalus`), **DEDALUS_API_KEY**, **GEMINI_API_KEY**, **SERPAPI_KEY**, **IMGBB_KEY**, **WEBHOOK_URL**, **WEBHOOK_API_KEY**, **BOOKMARK_API_URL**, **BOOKMARK_TOKEN**
   - **webhookUrl**: optional. The extension will POST JSON:
     ```json
     {
       "image": "<base64 string>",
       "mimeType": "image/png",
       "description": "<AI description>",
       "timestamp": "<ISO date>"
     }
     ```

3. **Use**
   - Go to any webpage
   - Click the extension icon → “Capture area”
   - Drag a rectangle over the region you want to analyze
   - Wait for “Analyzing…” then the success (or error) toast

## Tech stack

- **Manifest V3**: Background service worker for capture, Dedalus/Gemini vision, and webhook.
- **Content script**: Injected on demand; full‑page overlay with a transparent canvas for selection.
- **Image flow**: `chrome.tabs.captureVisibleTab` → crop in content script with a canvas (using device pixel ratio) → base64 to background → Dedalus Labs or Gemini Vision API → optional webhook POST.
- **UI**: Vanilla JS, CSS, async `fetch`; errors handled for missing API key and network failures.

## Optional: custom icons

To set your own icons, add:

- `icons/icon16.png` (16×16)
- `icons/icon32.png` (32×32)
- `icons/icon48.png` (48×48)

Then in `manifest.json` under `"action"` add:

```json
"default_icon": {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png"
}
```

And add an `"icons"` key with the same paths.

## Permissions

- **activeTab**: Capture the current tab and inject the content script.
- **scripting**: Inject the snipping content script.
- **.env**: API keys (gitignored). Run `node scripts/build-config.js` to generate `config.js`.
- **host_permissions**: `https://api.dedaluslabs.ai/*` and `https://generativelanguage.googleapis.com/*` for vision; `<all_urls>` so the webhook can be any HTTPS URL.
