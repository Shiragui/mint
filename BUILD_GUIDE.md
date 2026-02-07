# Build Guide: Entertainment Media Scanner (Product & Location Discovery)

**Product idea:** Website + browser extension that scans on-screen media (YouTube, movies, shows) for **objects, clothing, locations**, then finds **product listings** or **place info** so users can save and review later (“What lipstick is that? Where is this filmed?”).

**Constraints:** Dedalus Labs ADK + Dedalus Auth, OpenRouter, 4-person team, real user need, end-to-end MVP.

---

## 1. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  USER                                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Browser Extension (Lens Capture)     │  Website (dashboard)                 │
│  • Select frame/region on YT, etc.   │  • Sign up / Sign in (Dedalus Auth)  │
│  • Capture screenshot → send to API  │  • View / manage saved items          │
│  • Show results + “Save”              │  • Collections, filters, links       │
└──────────────┬───────────────────────┴────────────────┬─────────────────────┘
               │                                        │
               ▼                                        ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  BACKEND (Your API)                                                            │
│  • REST/API routes: analyze, save, list, delete                                │
│  • Auth: Dedalus Auth (DAuth) — validate tokens, multi-tenant user identity   │
│  • Persistence: DB for users + saved items                                     │
└──────────────┬────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  DEDALUS ADK AGENT (production agent)                                          │
│  • Input: image (base64) + optional “find products” vs “find location”        │
│  • Step 1 (Vision): Describe objects/clothing/locations in the image          │
│  • Step 2 (Tools): Call MCP / tools to “scour the internet”                    │
│    - e.g. Brave Search MCP, Exa MCP → product listings, location articles      │
│  • Step 3: Structured output → product matches (name, brand, price, link)      │
│            or location (name, description, links)                             │
│  • Dedalus Auth: used to secure MCP credentials (e.g. search API keys)        │
│    per tenant if you add BYOK search later                                    │
└──────────────────────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  EXTERNAL                                                                      │
│  • Dedalus API (vision + chat + MCP routing)                                   │
│  • OpenRouter (optional: alternate vision model or fallback)                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Data flow (MVP):**

1. User selects region in extension → capture → POST to your backend with auth token.
2. Backend runs **Dedalus ADK agent**: vision on image → then MCP (e.g. Brave/Exa) to search for products or locations.
3. Backend returns structured results; extension shows them and offers “Save”.
4. “Save” writes to your DB (user id from Dedalus Auth).
5. Website reads saved items for the logged-in user.

---

## 2. Technology & Framework Choices

| Layer | Technology | Why |
|-------|------------|-----|
| **Browser extension** | Keep existing **Lens Capture** (Manifest V3, content + background) | You already have capture + Dedalus vision; extend with “Save” and optional video-frame capture. |
| **Backend API** | **Node.js (Express/Fastify)** or **Python (FastAPI)** | Easy to call Dedalus SDK (TypeScript or Python). Fast to ship. |
| **Dedalus agent** | **Dedalus SDK** (TypeScript or Python) with **DedalusRunner** | Official way to build the “production agent”: vision + tools + MCP. Fits contest. |
| **Auth** | **Dedalus Auth (DAuth)** | Required for contest; multi-tenant, good for securing MCP/API keys per user later. |
| **Database** | **PostgreSQL** (e.g. Supabase/Neon) or **SQLite** for MVP | Users, saved items (type: product vs location), metadata, links. |
| **Website** | **React** (Vite) or **Next.js** | Dashboard: login, list saved items, open product/location links. |
| **Vision** | **Dedalus API** (e.g. `google/gemini-2.0-flash` or `openai/gpt-4.1`) | You already use it in the extension; keep one stack. |
| **Web search / “scour internet”** | **Dedalus MCP** (e.g. `windsor/brave-search-mcp`, `tsion/exa`) | Fits “Dedalus quality” and solves “find product listings / locations”. |
| **OpenRouter** | Optional: **vision fallback** or **product-description model** | Use where it adds value (e.g. different vision model or cost balance). |

**Suggested stack for a 4-person team:**

- **Backend + Agent:** Python (FastAPI) + `dedalus-labs` SDK → one repo or service.
- **Extension:** Current `mint-extension` (rename to e.g. `extension` or `lens-capture`) — add “Save” and API client.
- **Website:** Next.js (React) — auth UI, dashboard, API client to your backend.
- **DB:** Supabase (Postgres + optional Supabase Auth if you need email/password in addition to DAuth) or Neon + your own schema.

---

## 3. Dedalus ADK + Auth — How They Fit

### 3.1 Production agent (ADK)

- **Where it runs:** In your **backend** (e.g. FastAPI or Express). The extension does **not** run the agent; it sends the image and intent to your API.
- **What it does:**
  1. **Vision:** Receive image (base64), call Dedalus chat completions with a vision model to get a structured description (objects, clothing, possible brands, or location cues).
  2. **Tools / MCP:** Use **DedalusRunner** with MCP servers like:
     - `windsor/brave-search-mcp` or similar for “product listing” and “location” searches.
     - Optionally `tsion/exa` for semantic search.
  3. **Structured output:** Return a fixed schema (e.g. list of products with `name`, `brand`, `price`, `url`, or locations with `name`, `description`, `url`) so the extension and website can display and save them.

Example (Python) shape — run this from your backend:

```python
# Pseudocode in your backend
from dedalus_labs import AsyncDedalus, DedalusRunner

async def run_discovery_agent(image_base64: str, intent: str) -> dict:
    client = AsyncDedalus()  # uses DEDALUS_API_KEY from env
    runner = DedalusRunner(client)
    result = await runner.run(
        input=f"User intent: {intent}. Image (attached). Describe then search for product listings or location info.",
        model="anthropic/claude-sonnet-4" or "google/gemini-2.0-flash",
        mcp_servers=["windsor/brave-search-mcp"],  # or tsion/exa
        # attach image via messages with image_url
    )
    return parse_structured_output(result.final_output)
```

Use **structured outputs** (Dedalus SDK) so the agent returns JSON that matches your “saved item” schema.

### 3.2 Dedalus Auth (DAuth)

- **Purpose:** Multi-tenant auth so each user (or tenant) has secure credentials; required for contest “correct auth integration”.
- **Where to use it:**
  - **Option A:** Backend validates **JWT or session** from your own login (e.g. Supabase Auth or custom) and then **calls Dedalus API with your server’s Dedalus API key**. No user-specific Dedalus keys in the MVP.
  - **Option B (stronger Dedalus showcase):** Use DAuth so that **per-user or per-tenant credentials** (e.g. a search API key for MCP) are stored and passed securely when your backend runs the agent. That way “auth” is clearly Dedalus Auth, not just “we have login.”
- **Practical MVP:** Implement **login/signup on the website** and issue your own JWTs (or use Supabase). Then add **Dedalus Auth** for the agent path: e.g. register each user as a tenant in DAuth and pass tenant context when invoking the agent so that MCP tools can use user-specific secrets (document this in the submission).

Docs: [Dedalus Auth](https://www.dedaluslabs.ai/blog/dedalus-auth-launch), [Dedalus SDK](https://docs.dedaluslabs.ai/sdk/quickstart).

---

## 4. OpenRouter

- Use for **vision** (image → description) or **text** (product/location summary) if you want a second provider or cost optimization.
- OpenRouter supports **image inputs** (URL or base64) on `/api/v1/chat/completions`; you can call it from your backend when you want an alternative to Dedalus vision.
- **Suggestion:** Use **Dedalus as primary** (vision + MCP) for contest “Dedalus quality”; add OpenRouter as **optional fallback or for a specific model** so the submission clearly uses both.

---

## 5. Step-by-Step Implementation (Phased)

### Phase 1 — Foundation (Week 1)

| Step | Who | Task |
|------|-----|------|
| 1.1 | Backend owner | Create backend repo (e.g. FastAPI): health check, env for `DEDALUS_API_KEY`. |
| 1.2 | Backend | Add **Dedalus SDK**: one endpoint `POST /analyze` that accepts `image` (base64), `intent` (e.g. "product" \| "location"). Call Dedalus vision only; return a short description. |
| 1.3 | Extension owner | Point extension to your backend: replace or complement current “webhook” with `POST /analyze`; send captured image + intent; display description. |
| 1.4 | Full-stack | Design **DB schema**: `users` (id, email or dedalus_tenant_id, created_at), `saved_items` (id, user_id, type product \| location, title, description, metadata JSON, source_url, created_at). |
| 1.5 | Full-stack | Add **auth**: simple JWT sign-in (or Supabase Auth) so extension and website can send `Authorization: Bearer <token>`. |

**Outcome:** User can select region → see AI description; backend and DB exist; auth in place.

---

### Phase 2 — Dedalus Agent + “Scour the Internet” (Week 2)

| Step | Who | Task |
|------|-----|------|
| 2.1 | Backend | Implement **DedalusRunner** agent: vision on image → then call **MCP** (e.g. Brave Search, Exa) with queries derived from the description (e.g. “red lipstick MAC buy”, “filming location XYZ”). |
| 2.2 | Backend | Define **structured output** (e.g. Pydantic/Zod): list of products (name, brand, price, url) or locations (name, description, url). Parse agent output into this schema. |
| 2.3 | Backend | Add **Dedalus Auth**: integrate DAuth so agent runs in a tenant context (even if you start with a single server API key; document tenant flow for judges). |
| 2.4 | Extension | Update UI: show “Products” / “Locations” from `/analyze` and add **“Save”** button per item (or “Save all”). |
| 2.5 | Backend | Add **POST /items** (save item), **GET /items** (list for user). Persist to DB. |

**Outcome:** Full flow: capture → vision → MCP search → structured results → save to DB.

---

### Phase 3 — Website + Polish (Week 3)

| Step | Who | Task |
|------|-----|------|
| 3.1 | Frontend | Create **website** (Next.js/Vite): login/signup (connected to your auth), redirect after login to dashboard. |
| 3.2 | Frontend | **Dashboard:** list saved items (cards with title, type, link); filter by product vs location; open links in new tab. |
| 3.3 | Full-stack | Ensure extension “Save” and website use same **GET /items** and **POST /items**; same JWT. |
| 3.4 | All | **OpenRouter:** add one path (e.g. optional header or param) that uses OpenRouter for vision or for a second model; document in README. |
| 3.5 | All | **Docs & demo:** README (how to run extension + backend + website), 1–2 min video: capture on YT → see products → save → view on website. |

**Outcome:** End-to-end usable product; judges can run it and see Dedalus + Auth + OpenRouter.

---

### Phase 4 — Contest Tuning (Week 4)

| Step | Task |
|------|------|
| 4.1 | **Need:** Add 2–3 clear “user stories” in README (e.g. “I see a lipstick in a video → I get brand/shade/price and can save it”). |
| 4.2 | **Dedalus quality:** Ensure agent uses **MCP for search**, **structured output**, and **Dedalus Auth**; add a short “Dedalus integration” section in README. |
| 4.3 | **Ship quality:** One-command or few-command run (e.g. `docker-compose up` or `npm run dev` for web + `python run_backend.py`), and extension load unpacked. |

---

## 6. Team of 4 — Role Split

| Role | Responsibilities |
|------|------------------|
| **Extension (1)** | Capture flow, UI (results, Save), API client, optional video-frame capture for YT. |
| **Backend + Agent (1)** | FastAPI (or Node) routes, DedalusRunner agent, MCP config, Dedalus Auth, DB access. |
| **Website (1)** | Next.js (or Vite) app, login/dashboard, list saved items, API client. |
| **Full-stack / DevOps (1)** | DB schema, auth (JWT/Supabase), deployment, docs, and wiring extension ↔ backend ↔ website. |

Sync points: agree on **API contract** (request/response for `/analyze`, `/items`) and **auth format** (header, token shape) in Phase 1.

---

## 7. API Contract (Suggested)

- **POST /auth/login** (or use Supabase) → `{ "token": "..." }`
- **POST /analyze**  
  - Headers: `Authorization: Bearer <token>`  
  - Body: `{ "image": "<base64>", "intent": "product" | "location" }`  
  - Response: `{ "description": "...", "results": [ { "type": "product"|"location", "name", "brand?", "price?", "url", "description?" } ] }`
- **POST /items**  
  - Body: `{ "type", "title", "description", "metadata", "source_url" }`  
  - Response: `{ "id": "..." }`
- **GET /items**  
  - Response: `{ "items": [ ... ] }`

---

## 8. Judging Criteria — Quick Checklist

| Criterion | How you address it |
|-----------|---------------------|
| **Need** | Real use case: “What’s that product / where is that?” while watching content; save and review later. Clear user stories in README. |
| **Dedalus quality** | Production agent with DedalusRunner, vision + MCP (Brave/Exa), structured output, Dedalus Auth for tenant/credentials. |
| **Ship quality** | One place (README) to run backend + website; load extension; short video showing full flow. |

---

## 9. Repo Structure Suggestion

```
devfest2026/
├── README.md                 # Project overview + how to run
├── BUILD_GUIDE.md           # This file
├── extension/                # Renamed mint-extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.js / popup.html
│   └── options.js / options.html
├── backend/                  # FastAPI or Node
│   ├── main.py or src/
│   ├── agent/                # DedalusRunner + tools
│   ├── routes/
│   └── requirements.txt or package.json
└── web/                      # Next.js or Vite
    ├── src/
    ├── package.json
    └── ...
```

---

## 10. Summary

- **Extension:** Keep and extend Lens Capture: capture → call your backend → show results → Save.
- **Backend:** REST API + **Dedalus ADK agent** (vision + MCP search) + **Dedalus Auth** + DB for saved items.
- **Website:** Login + dashboard to view and open saved products/locations.
- **OpenRouter:** Use as alternate or fallback for vision/model to satisfy “use OpenRouter.”
- **Team:** Extension, Backend+Agent, Website, Full-stack/DevOps; agree API and auth in Phase 1 and iterate in 3–4 weeks to a demo-ready MVP.

If you want, next we can turn Phase 1 into concrete tasks in your repo (e.g. add `backend/` with a minimal FastAPI + Dedalus vision endpoint and update the extension to call it).
