# Lens Capture Backend

Netlify Functions + Neon PostgreSQL backend for the Lens Capture Chrome extension. Handles auth, bookmarks (Base64 images + AI descriptions), and the lens webhook.

## Features

- **POST /api/lens** – Webhook endpoint (requires `X-API-Key` header); saves to Neon `lens_vault`
- **POST /auth/register** – Create account, returns JWT
- **POST /auth/login** – Username/password login (returns JWT)
- **POST /api/bookmarks** – Save bookmark (Base64 image, AI description, similar products)
- **GET /api/bookmarks** – List user's bookmarks
- **GET /api/bookmarks/:id** – Get a single bookmark
- **DELETE /api/bookmarks/:id** – Delete a bookmark

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Connect Neon to Netlify

```bash
netlify db init
```

Or manually add `NETLIFY_DATABASE_URL` in Netlify: Site settings → Environment variables. The `@netlify/neon` package reads this automatically.

### 3. Create the schema

Run `sql/neon_schema.sql` in your Neon SQL Editor (or via `psql`).

### 4. Environment variables

| Variable | Description |
|----------|-------------|
| `NETLIFY_DATABASE_URL` | Set by Netlify when Neon is connected |
| `LENS_API_KEY` | Optional. If set, extension must send X-API-Key. Leave empty to skip. |
| `LENS_SECRET_KEY` | JWT secret for login tokens |
| `LENS_ADMIN_USER` | Fallback admin username |
| `LENS_ADMIN_PASSWORD` | Fallback admin password |

### 5. Run locally

```bash
netlify dev
```

## Deploy to Netlify

1. Push to GitHub and connect to Netlify.
2. Connect Neon: `netlify db init` or add `NETLIFY_DATABASE_URL` in Site settings.
3. Run `sql/neon_schema.sql` in Neon SQL Editor.
4. Set `LENS_SECRET_KEY`, `LENS_ADMIN_USER`, `LENS_ADMIN_PASSWORD` in env vars.

## API

### POST /api/lens

**Headers:** `X-API-Key: <your-api-key>` (if `LENS_API_KEY` is set)

**Body:**
```json
{
  "image": "base64EncodedImageString...",
  "description": "AI-generated product description",
  "timestamp": "2024-01-15T12:00:00Z",
  "mimeType": "image/png"
}
```

### POST /auth/login

Form data (`application/x-www-form-urlencoded`): `username`, `password`

Returns: `{ "access_token": "...", "token_type": "bearer" }`

### POST /api/bookmarks

**Headers:** `Authorization: Bearer <token>`

**Body:**
```json
{
  "image": "base64...",
  "description": "AI description",
  "similarProducts": [{ "name": "...", "link": "...", "price": "...", "image": "..." }],
  "sourceUrl": "https://..."
}
```

## Extension configuration

In your extension's `config.js`:

```js
webhookUrl: 'https://your-site.netlify.app/api/lens'
```

Send the `X-API-Key` header when posting to the webhook if `LENS_API_KEY` is set.
