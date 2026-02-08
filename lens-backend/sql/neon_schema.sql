-- Run this in your Neon SQL Editor to create the schema
-- Uses NETLIFY_DATABASE_URL (set by Netlify when Neon is connected)

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_base64 TEXT,
  description TEXT,
  results_json JSONB DEFAULT '[]',
  source_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);

-- LENS_VAULT: for webhook captures (Base64 image + AI description)
CREATE TABLE IF NOT EXISTS lens_vault (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image TEXT,
  label TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
