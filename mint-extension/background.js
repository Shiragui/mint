/**
 * Lens Capture - Background Service Worker (Manifest V3)
 * Handles tab capture, Dedalus Labs / Gemini Vision API, and webhook POST.
 */

const DEDALUS_VISION_MODEL = 'google/gemini-2.0-flash';
const GEMINI_MODEL = 'gemini-2.5-flash';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CAPTURE_TAB') {
    handleCaptureTab(sender.tab?.id)
      .then((dataUrl) => sendResponse({ success: true, dataUrl }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'ANALYZE_AND_SEND') {
    handleAnalyzeAndSend(message.payload)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
  if (message.type === 'SAVE_ITEM') {
    handleSaveItem(message.payload)
      .then((result) => sendResponse({ success: true, ...result }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function handleCaptureTab(tabId) {
  if (!tabId) throw new Error('No tab id');
  try {
    const dataUrl = await chrome.tabs.captureVisibleTab(null, { format: 'png' });
    return dataUrl;
  } catch (err) {
    throw new Error('Screenshot failed: ' + (err.message || 'unknown'));
  }
}

async function getStoredConfig() {
  const out = await chrome.storage.sync.get([
    'visionProvider',
    'dedalusApiKey',
    'geminiApiKey',
    'backendUrl',
    'authToken',
    'webhookUrl'
  ]);
  return {
    visionProvider: out.visionProvider || 'dedalus',
    dedalusApiKey: out.dedalusApiKey || '',
    geminiApiKey: out.geminiApiKey || '',
    backendUrl: (out.backendUrl || '').trim(),
    authToken: (out.authToken || '').trim(),
    webhookUrl: out.webhookUrl || ''
  };
}

async function handleAnalyzeAndSend(payload) {
  const { croppedBase64, mimeType, intent = 'product' } = payload;
  if (!croppedBase64) throw new Error('No image data');

  const config = await getStoredConfig();

  // Prefer backend when configured
  if (config.backendUrl) {
    const base = config.backendUrl.replace(/\/$/, '');
    const url = base + '/analyze';
    const headers = { 'Content-Type': 'application/json' };
    if (config.authToken) headers['Authorization'] = 'Bearer ' + config.authToken;
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        image: croppedBase64,
        mimeType: mimeType || 'image/png',
        intent
      })
    });
    if (!res.ok) {
      const errText = await res.text();
      if (res.status === 401) throw new Error('Invalid or missing auth token. Check extension options.');
      throw new Error(res.status + ' ' + (errText || res.statusText));
    }
    const data = await res.json();
    return {
      description: data.description || '',
      similarProducts: data.similarProducts || data.results || [],
      sentToWebhook: false,
      webhookError: null
    };
  }

  const provider = config.visionProvider || 'dedalus';
  const apiKey =
    provider === 'gemini'
      ? config.geminiApiKey?.trim()
      : config.dedalusApiKey?.trim();

  if (!apiKey) {
    const name = provider === 'gemini' ? 'Gemini' : 'Dedalus Labs';
    throw new Error(`${name} API key is not set. Or set Backend URL in extension options.`);
  }

  let description;
  try {
    if (provider === 'gemini') {
      description = await callGeminiVision(apiKey, croppedBase64, mimeType);
    } else {
      description = await callDedalusVision(apiKey, croppedBase64, mimeType);
    }
  } catch (err) {
    if (err.message && err.message.includes('401')) {
      throw new Error('Invalid API key. Check your key in extension options.');
    }
    if (err.message && (err.message.includes('403') || err.message.includes('429'))) {
      throw new Error(err.message);
    }
    if (err.message && (err.message.includes('network') || err.message.includes('fetch'))) {
      throw new Error('Network error. Check your connection.');
    }
    throw err;
  }

  let webhookError = null;
  if (config.webhookUrl && config.webhookUrl.trim()) {
    try {
      await postToWebhook(config.webhookUrl.trim(), {
        image: croppedBase64,
        mimeType: mimeType || 'image/png',
        description,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      webhookError = formatWebhookError(err);
    }
  }

  let similarProducts = [];
  try {
    similarProducts = await getSimilarProducts(apiKey, provider, description);
  } catch (_) {
    // Non-fatal: still return description
  }

  return {
    description,
    sentToWebhook: !webhookError && !!config.webhookUrl?.trim(),
    webhookError,
    similarProducts
  };
}

async function handleSaveItem(payload) {
  const config = await getStoredConfig();
  if (!config.backendUrl) throw new Error('Backend URL is not set. Open extension options.');
  const base = config.backendUrl.replace(/\/$/, '');
  const url = base + '/items';
  const headers = { 'Content-Type': 'application/json' };
  if (config.authToken) headers['Authorization'] = 'Bearer ' + config.authToken;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      type: payload.type || 'product',
      title: payload.title || '',
      description: payload.description || '',
      metadata: payload.metadata || {},
      source_url: payload.source_url || ''
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error('Invalid or missing auth token.');
    throw new Error(res.status + ' ' + (errText || res.statusText));
  }
  return await res.json();
}

function formatWebhookError(err) {
  const msg = err.message || '';
  if (msg.startsWith('404')) {
    return '404 — URL or path not found. Check the webhook URL in options and that your backend has this endpoint.';
  }
  if (msg.startsWith('401') || msg.startsWith('403')) {
    return msg.slice(0, 3) + ' — Backend rejected the request (auth or permission).';
  }
  if (msg.startsWith('5')) {
    return msg.split(' ')[0] + ' — Server error on your backend.';
  }
  return msg || 'Request failed. Check URL and network.';
}

/**
 * Dedalus Labs: OpenAI-compatible chat completions with vision.
 * https://docs.dedaluslabs.ai/api/v1/create-chat-completion
 */
async function callDedalusVision(apiKey, base64Image, mimeType) {
  const body = {
    model: DEDALUS_VISION_MODEL,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Identify and briefly describe what is in this image in one or two sentences. Be concise (object/scene and key details).'
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType || 'image/png'};base64,${base64Image}`,
              detail: 'low'
            }
          }
        ]
      }
    ]
  };

  const res = await fetch('https://api.dedaluslabs.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401) throw new Error('401');
    throw new Error(res.status + ' ' + (errText || res.statusText));
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== 'string') throw new Error('Invalid response from Dedalus');
  return content.trim();
}

/**
 * Google Gemini: generateContent with inline image.
 * https://ai.google.dev/gemini-api/docs/vision
 */
async function callGeminiVision(apiKey, base64Image, mimeType) {
  const body = {
    contents: [
      {
        parts: [
          {
            inline_data: {
              mime_type: mimeType || 'image/png',
              data: base64Image
            }
          },
          {
            text: 'Identify and briefly describe what is in this image in one or two sentences. Be concise (object/scene and key details).'
          }
        ]
      }
    ],
    generationConfig: {
      maxOutputTokens: 300
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url + '?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    if (res.status === 401 || res.status === 403) throw new Error('401');
    throw new Error(res.status + ' ' + (errText || res.statusText));
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') throw new Error('Invalid response from Gemini');
  return text.trim();
}

/**
 * Ask AI for similar purchasable products given the image description.
 * Returns array of { name, search_query }.
 */
async function getSimilarProducts(apiKey, provider, description) {
  const prompt = `The user selected an image region that was described as: "${description}". Suggest 3 to 5 similar or related products that could be purchased online. For each product provide a short name and a search query (keywords) to find it on shopping sites. Reply with ONLY a valid JSON array of objects, each with exactly two keys: "name" (string) and "search_query" (string). No other text or markdown. Example: [{"name": "Wireless Mouse", "search_query": "wireless bluetooth mouse"}]`;

  let rawText;
  if (provider === 'gemini') {
    rawText = await callGeminiText(apiKey, prompt);
  } else {
    rawText = await callDedalusText(apiKey, prompt);
  }

  const parsed = parseSimilarProductsJson(rawText);
  return Array.isArray(parsed) ? parsed.filter((p) => p && p.name && p.search_query) : [];
}

function parseSimilarProductsJson(text) {
  if (!text || typeof text !== 'string') return [];
  const trimmed = text.trim();
  // Strip markdown code block if present
  let jsonStr = trimmed;
  const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();
  else {
    const start = trimmed.indexOf('[');
    const end = trimmed.lastIndexOf(']') + 1;
    if (start !== -1 && end > start) jsonStr = trimmed.slice(start, end);
  }
  try {
    return JSON.parse(jsonStr);
  } catch (_) {
    return [];
  }
}

async function callDedalusText(apiKey, prompt) {
  const res = await fetch('https://api.dedaluslabs.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey
    },
    body: JSON.stringify({
      model: DEDALUS_VISION_MODEL,
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }]
    })
  });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content.trim() : '';
}

async function callGeminiText(apiKey, prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const res = await fetch(url + '?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 500 }
    })
  });
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === 'string' ? text.trim() : '';
}

async function postToWebhook(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(res.status + ' ' + (errText || res.statusText));
  }
}
