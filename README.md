# devfest2026 — Lens Capture

Entertainment media scanner: select a region on any page (e.g. YouTube, shows), get a vision description and similar products, **save items** to your list, and review them on the website.

## Stack

- **mint-extension/** — Chrome extension (capture area → analyze → save).
- **backend/** — FastAPI: `POST /analyze` (Dedalus vision + product suggestions), `POST /items`, `GET /items`.
- **web/** — Next.js dashboard: login with token, view saved items.

## Quick start

### 1. Backend

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
# Set DEDALUS_API_KEY in .env. For local dev without auth set REQUIRE_AUTH=0.
uvicorn main:app --reload
```

Runs at http://localhost:8000. Docs: http://localhost:8000/docs.

### 2. Extension

1. In Chrome go to `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, select the `mint-extension` folder.
2. Open the extension **Options**.
3. Set **Backend URL** to `http://localhost:8000` and **Auth token** to any string (e.g. `dev-token`). Save.
4. (Optional) If you leave Backend URL empty, the extension uses your Dedalus or Gemini API key directly and won’t have “Save” to the backend.)

Use the extension: click the icon → **Capture area** → draw a rectangle on the page. You’ll get a description and similar products; click **Save** on a product to add it to your list.

### 3. Website

```bash
cd web
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

Open http://localhost:3000 → **Log in** with the same token you set in the extension → **Dashboard** to see saved items.

## Project plan

See [BUILD_GUIDE.md](./BUILD_GUIDE.md) for architecture, Dedalus ADK + Auth integration, phased plan, and team roles.
