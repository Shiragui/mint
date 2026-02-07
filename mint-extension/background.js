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
    'webhookUrl',
    'serpapiKey'
  ]);
  return {
    visionProvider: out.visionProvider || 'dedalus',
    dedalusApiKey: out.dedalusApiKey || '',
    geminiApiKey: out.geminiApiKey || '',
    webhookUrl: out.webhookUrl || '',
    serpapiKey: out.serpapiKey || ''
  };
}

async function handleAnalyzeAndSend(payload) {
  const { croppedBase64, mimeType } = payload;
  if (!croppedBase64) throw new Error('No image data');

  const config = await getStoredConfig();
  const provider = config.visionProvider || 'dedalus';

  const apiKey =
    provider === 'gemini'
      ? config.geminiApiKey?.trim()
      : config.dedalusApiKey?.trim();

  if (!apiKey) {
    const name = provider === 'gemini' ? 'Gemini' : 'Dedalus Labs';
    throw new Error(`${name} API key is not set. Open extension options to add it.`);
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
    similarProducts = await getSimilarProducts(apiKey, provider, description, config.serpapiKey);
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
 * Fetch real similar products from Google Shopping via SerpAPI.
 * Returns array of { name, price, link, image, source }.
 * Falls back to AI-generated search links if SerpAPI key is not set.
 */
async function getSimilarProducts(apiKey, provider, description, serpapiKey) {
  // If SerpAPI key is set, fetch real product data from Google Shopping
  if (serpapiKey && serpapiKey.trim()) {
    try {
      const products = await fetchShoppingProducts(serpapiKey.trim(), description, apiKey, provider);
      if (products.length > 0) return products;
    } catch (err) {
      // Fall through to AI fallback on error
    }
  }

  // Fallback: AI-generated search queries + generic search links
  const prompt = `The user selected an image region that was described as: "${description}". Suggest a single concise search query (2-5 keywords) to find similar products on shopping sites. Reply with ONLY a valid JSON object: {"search_query": "your search terms"}. No other text or markdown.`;
  let rawText;
  if (provider === 'gemini') {
    rawText = await callGeminiText(apiKey, prompt);
  } else {
    rawText = await callDedalusText(apiKey, prompt);
  }
  const searchQuery = parseSearchQuery(rawText);
  if (!searchQuery) return [];

  // Return fallback format for content.js to render as search links
  return [{ name: 'Search similar products', search_query: searchQuery, fallback: true }];
}

async function fetchShoppingProducts(serpapiKey, description, apiKey, provider) {
  const prompt = `The user selected an image region described as: "${description}". Reply with ONLY a short 2-5 word search query to find similar products to buy (e.g. "wireless bluetooth mouse" or "ceramic coffee mug"). No other text.`;
  let searchQuery;
  if (provider === 'gemini') {
    searchQuery = (await callGeminiText(apiKey, prompt)).trim();
  } else {
    searchQuery = (await callDedalusText(apiKey, prompt)).trim();
  }
  if (!searchQuery) searchQuery = description.split(/[.!?]/)[0].trim().slice(0, 50) || 'similar product';

  const params = new URLSearchParams({
    engine: 'google_shopping',
    q: searchQuery,
    api_key: serpapiKey
  });
  const res = await fetch('https://serpapi.com/search.json?' + params.toString());
  if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
  const data = await res.json();
  const results = data.shopping_results || [];

  return results.slice(0, 8).map((p) => ({
    name: p.title || 'Product',
    price: p.price || '',
    link: p.product_link || p.link || '',
    image: p.thumbnail || p.serpapi_thumbnail || '',
    source: p.source || 'Google Shopping'
  })).filter((p) => p.link);
}

function parseSearchQuery(text) {
  if (!text || typeof text !== 'string') return null;
  const trimmed = text.trim();
  let jsonStr = trimmed;
  const codeMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeMatch) jsonStr = codeMatch[1].trim();
  else {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}') + 1;
    if (start !== -1 && end > start) jsonStr = trimmed.slice(start, end);
  }
  try {
    const parsed = JSON.parse(jsonStr);
    if (parsed && typeof parsed.search_query === 'string') return parsed.search_query.trim();
  } catch (_) {}
  return trimmed.replace(/^["']|["']$/g, '').slice(0, 80) || null;
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
