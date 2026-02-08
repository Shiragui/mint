# Lens Capture Webhook Backend

FastAPI backend that receives data from the Lens Capture Chrome extension and stores it in Snowflake via the SQL API (REST).

## Features

- **POST /api/lens** – Webhook endpoint (requires `X-API-Key` header)
- **POST /auth/login** – Username/password login (returns JWT)
- Snowflake SQL API (REST) – no heavy connector
- Snowflake key-pair authentication (JWT from private key)
- Base64 image handled via bind variables (no SQL injection)

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Snowflake key-pair auth

Generate an RSA key pair:

```bash
openssl genrsa 2048 | openssl pkcs8 -topk8 -inform PEM -out rsa_key.p8 -nocrypt
```

Assign the public key to your Snowflake user:

```sql
ALTER USER my_user SET RSA_PUBLIC_KEY='<paste public key content>';
```

### 3. Create the table

Run `sql/create_table.sql` in your Snowflake worksheet.

### 4. Environment variables

Copy `.env.example` to `.env` and configure:

| Variable | Description |
|----------|-------------|
| `LENS_API_KEY` | Optional. If set, extension must send X-API-Key. Leave empty to skip. |
| `LENS_SECRET_KEY` | JWT secret for login tokens |
| `LENS_ADMIN_USER` | Login username |
| `LENS_ADMIN_PASSWORD` | Login password (or bcrypt hash) |
| `SNOWFLAKE_ACCOUNT` | Account identifier (e.g. xy12345) |
| `SNOWFLAKE_USER` | Snowflake user |
| `SNOWFLAKE_PRIVATE_KEY_PATH` | Path to rsa_key.p8 |
| `SNOWFLAKE_PRIVATE_KEY_PASSPHRASE` | Passphrase if key is encrypted |
| `SNOWFLAKE_WAREHOUSE` | Warehouse name |
| `SNOWFLAKE_DATABASE` | Database name |
| `SNOWFLAKE_SCHEMA` | Schema (default: PUBLIC) |
| `SNOWFLAKE_ROLE` | Role (optional) |

### 5. Run

```bash
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Extension configuration

In your extension's `config.js`, set:

```js
webhookUrl: 'https://your-backend.com/api/lens'
```

And send the `X-API-Key` header with the same value as `LENS_API_KEY`. Update the extension's `background.js` to include this header when posting to the webhook.

## API

### POST /api/lens

**Headers:** `X-API-Key: <your-api-key>`

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

Form data: `username`, `password`

Returns: `{ "access_token": "...", "token_type": "bearer" }`

## JWT helper

Use `snowflake_jwt.generate_snowflake_jwt()` to generate tokens for Snowflake:

```python
from snowflake_jwt import generate_snowflake_jwt

token = generate_snowflake_jwt(
    account_identifier="xy12345",
    user="MY_USER",
    private_key_path="rsa_key.p8",
    passphrase=None,
)
```
