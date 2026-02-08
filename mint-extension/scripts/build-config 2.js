#!/usr/bin/env node
/**
 * Reads .env and generates config.js for the Chrome extension.
 * Run: node scripts/build-config.js
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const envPath = path.join(root, '.env');
const outPath = path.join(root, 'config.js');

function parseEnv(content) {
  const vars = {};
  for (const line of content.split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) {
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1).replace(/\\"/g, '"');
      else if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1).replace(/\\'/g, "'");
      vars[m[1]] = val;
    }
  }
  return vars;
}

function escapeJs(s) {
  if (s == null || s === '') return "''";
  return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
}

let envContent;
try {
  envContent = fs.readFileSync(envPath, 'utf8');
} catch (e) {
  console.error('No .env file found. Copy .env.example to .env and add your keys.');
  process.exit(1);
}

const vars = parseEnv(envContent);

const config = `/**
 * Auto-generated from .env – do not edit. Run: node scripts/build-config.js
 */
const CONFIG = {
  visionProvider: ${escapeJs(vars.VISION_PROVIDER || 'dedalus')},
  dedalusApiKey: ${escapeJs(vars.DEDALUS_API_KEY || '')},
  geminiApiKey: ${escapeJs(vars.GEMINI_API_KEY || '')},
  serpapiKey: ${escapeJs(vars.SERPAPI_KEY || '')},
  imgbbApiKey: ${escapeJs(vars.IMGBB_KEY || '')},
  webhookUrl: ${escapeJs(vars.WEBHOOK_URL || '')},
  webhookApiKey: ${escapeJs(vars.WEBHOOK_API_KEY || '')},
  bookmarkApiUrl: ${escapeJs(vars.BOOKMARK_API_URL || '')},
  bookmarkToken: ${escapeJs(vars.BOOKMARK_TOKEN || '')}
};
`;

fs.writeFileSync(outPath, config);
console.log('Generated config.js from .env');
