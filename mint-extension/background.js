/**
 * Lens Capture - Background Service Worker (Manifest V3)
 * Handles tab capture, Dedalus Labs / Gemini Vision API, and webhook POST.
 */

importScripts('config.js');

const DEDALUS_VISION_MODEL = 'google/gemini-2.0-flash';
const GEMINI_MODEL = 'gemini-2.5-flash';

function getConfig() {
  return {
    visionProvider: (typeof CONFIG !== 'undefined' && CONFIG.visionProvider) || 'dedalus',
    dedalusApiKey: (typeof CONFIG !== 'undefined' && CONFIG.dedalusApiKey) || '',
    geminiApiKey: (typeof CONFIG !== 'undefined' && CONFIG.geminiApiKey) || '',
    webhookUrl: (typeof CONFIG !== 'undefined' && CONFIG.webhookUrl) || '',
    webhookApiKey: (typeof CONFIG !== 'undefined' && CONFIG.webhookApiKey) || '',
    bookmarkApiUrl: (typeof CONFIG !== 'undefined' && CONFIG.bookmarkApiUrl) || '',
    bookmarkToken: (typeof CONFIG !== 'undefined' && CONFIG.bookmarkToken) || '',
    serpapiKey: (typeof CONFIG !== 'undefined' && CONFIG.serpapiKey) || '',
    imgbbApiKey: (typeof CONFIG !== 'undefined' && CONFIG.imgbbApiKey) || ''
  };
}

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

async function handleAnalyzeAndSend(payload) {
  const { croppedBase64, mimeType } = payload;
  if (!croppedBase64) throw new Error('No image data');

  const config = getConfig();
  const provider = config.visionProvider || 'dedalus';

  const apiKey =
    provider === 'gemini'
      ? config.geminiApiKey?.trim()
      : config.dedalusApiKey?.trim();

  if (!apiKey) {
    const name = provider === 'gemini' ? 'Gemini' : 'Dedalus Labs';
    throw new Error(`${name} API key is not set. Edit config.js to add it.`);
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
      throw new Error('Invalid API key. Check your key in config.js.');
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
      }, config.webhookApiKey?.trim());
    } catch (err) {
      webhookError = formatWebhookError(err);
    }
  }

  let similarProducts = [];
  try {
    similarProducts = await getSimilarProducts(
      apiKey,
      provider,
      description,
      config.serpapiKey,
      config.imgbbApiKey,
      croppedBase64,
      mimeType
    );
  } catch (_) {
    // Non-fatal: still return description
  }

  return {
    description,
    sentToWebhook: !webhookError && !!config.webhookUrl?.trim(),
    webhookError,
    similarProducts,
    croppedBase64,
    bookmarkApiUrl: config.bookmarkApiUrl?.trim() || '',
    bookmarkToken: config.bookmarkToken?.trim() || ''
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
 * Find visually similar products via reverse image search (Google Lens).
 * Uses the actual image to find products that look like it, not just same category.
 * Returns array of { name, price, link, image, source }.
 * Falls back to AI-generated search links if keys are not set.
 */
async function getSimilarProducts(apiKey, provider, description, serpapiKey, imgbbApiKey, croppedBase64, mimeType) {
  // Reverse image search: need both SerpAPI + ImgBB to upload image and call Google Lens
  if (serpapiKey?.trim() && imgbbApiKey?.trim() && croppedBase64) {
    try {
      const products = await fetchVisuallySimilarProducts(
        serpapiKey.trim(),
        imgbbApiKey.trim(),
        croppedBase64,
        mimeType
      );
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

async function uploadImageToImgBB(apiKey, base64Image) {
  const form = new FormData();
  form.append('image', base64Image);

  const res = await fetch('https://api.imgbb.com/1/upload?key=' + encodeURIComponent(apiKey), {
    method: 'POST',
    body: form
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error('ImgBB upload failed: ' + (err || res.status));
  }
  const data = await res.json();
  const url = data.data?.url || data.data?.display_url;
  if (!url) throw new Error('ImgBB did not return image URL');
  return url;
}

function extractPriceFromText(text) {
  if (!text || typeof text !== 'string') return { display: '', num: null };
  const match = text.match(/[\$€£¥₹]\s*[\d,]+(?:\.\d{2})?|[\d,]+(?:\.\d{2})?\s*[\$€£¥₹]|USD\s*[\d,]+(?:\.\d{2})?/i);
  if (match) {
    const s = match[0].replace(/[^\d.]/g, '');
    const num = parseFloat(s);
    return { display: match[0].trim(), num: isNaN(num) ? null : num };
  }
  return { display: '', num: null };
}

function parseProductPrice(m) {
  const priceObj = m.price;
  let priceDisplay = priceObj?.value ?? (typeof priceObj === 'string' ? priceObj : '');
  let priceNum = priceObj?.extracted_value ?? (typeof priceObj === 'number' ? priceObj : null);
  if (!priceDisplay && !priceNum && m.title) {
    const fallback = extractPriceFromText(m.title);
    priceDisplay = fallback.display;
    priceNum = fallback.num;
  }
  return { priceDisplay: priceDisplay || '', priceNum };
}

async function fetchVisuallySimilarProducts(serpapiKey, imgbbApiKey, base64Image, mimeType) {
  const imageUrl = await uploadImageToImgBB(imgbbApiKey, base64Image);

  // Try products first (shopping listings with more prices), then visual_matches
  for (const searchType of ['products', 'visual_matches']) {
    const params = new URLSearchParams({
      engine: 'google_lens',
      url: imageUrl,
      type: searchType,
      api_key: serpapiKey
    });
    const res = await fetch('https://serpapi.com/search.json?' + params.toString());
    if (!res.ok) throw new Error(res.status + ' ' + (await res.text()));
    const data = await res.json();
    const matches = data.visual_matches || data.shopping_results || [];

    if (matches.length > 0) {
      return matches.slice(0, 8).map((m) => {
        const { priceDisplay, priceNum } = parseProductPrice(m);
        return {
          name: m.title || 'Similar product',
          price: priceDisplay,
          priceNum: priceNum,
          link: m.link || '',
          image: m.thumbnail || m.image || '',
          source: m.source || ''
        };
      }).filter((p) => p.link);
    }
  }
  return [];
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

async function postToWebhook(url, payload, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['X-API-Key'] = apiKey;
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(res.status + ' ' + (errText || res.statusText));
  }
}
