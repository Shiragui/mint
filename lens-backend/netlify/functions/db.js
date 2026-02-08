/**
 * Database layer using @netlify/neon - reads from NETLIFY_DATABASE_URL
 * Save and fetch functions for users, bookmarks, and lens_vault.
 */
import { neon } from '@netlify/neon'

const sql = neon()

let initPromise = null

async function ensureTables() {
  if (initPromise) return initPromise
  initPromise = (async () => {
    await sql`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      username VARCHAR(255) UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
    await sql`CREATE TABLE IF NOT EXISTS bookmarks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      image_base64 TEXT,
      description TEXT,
      results_json JSONB DEFAULT '[]',
      source_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
    await sql`CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id)`
    await sql`CREATE TABLE IF NOT EXISTS lens_vault (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      image TEXT,
      label TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
  })().catch((err) => { initPromise = null; throw err })
  return initPromise
}

export async function createUser(username, passwordHash) {
  await ensureTables()
  const [row] = await sql`
    INSERT INTO users (username, password_hash)
    VALUES (${username.toLowerCase()}, ${passwordHash})
    RETURNING id
  `
  return String(row.id)
}

export async function getUserByUsername(username) {
  await ensureTables()
  const [row] = await sql`
    SELECT id, username, password_hash
    FROM users
    WHERE username = ${username.toLowerCase()}
  `
  return row ? { id: row.id, username: row.username, password_hash: row.password_hash } : null
}

/**
 * Save a bookmark - Base64 image, AI description, similar products, source URL.
 */
export async function createBookmark(userId, imageBase64, description, results, sourceUrl) {
  await ensureTables()
  const resultsJson = JSON.stringify(results || [])
  const [row] = await sql`
    INSERT INTO bookmarks (user_id, image_base64, description, results_json, source_url)
    VALUES (${userId}, ${imageBase64}, ${description}, ${resultsJson}::jsonb, ${sourceUrl || ''})
    RETURNING id
  `
  return String(row.id)
}

/**
 * Fetch all bookmarks for a user, ordered by created_at desc.
 * Returns objects with image_base64, description, results (parsed), source_url, created_at.
 */
export async function getBookmarks(userId) {
  await ensureTables()
  const rows = await sql`
    SELECT id, image_base64, description, results_json, source_url, created_at
    FROM bookmarks
    WHERE user_id = ${userId}
    ORDER BY created_at DESC
  `
  return rows.map(r => ({
    id: String(r.id),
    image_base64: r.image_base64,
    description: r.description,
    results: Array.isArray(r.results_json) ? r.results_json : [],
    source_url: r.source_url,
    created_at: r.created_at,
  }))
}

/**
 * Fetch a single bookmark by id and user_id.
 */
export async function getBookmark(bookmarkId, userId) {
  await ensureTables()
  const [row] = await sql`
    SELECT id, image_base64, description, results_json, source_url, created_at
    FROM bookmarks
    WHERE id = ${bookmarkId} AND user_id = ${userId}
  `
  if (!row) return null
  return {
    id: String(row.id),
    image_base64: row.image_base64,
    description: row.description,
    results: Array.isArray(row.results_json) ? row.results_json : [],
    source_url: row.source_url,
    created_at: row.created_at,
  }
}

export async function deleteBookmark(bookmarkId, userId) {
  await ensureTables()
  const result = await sql`
    DELETE FROM bookmarks
    WHERE id = ${bookmarkId} AND user_id = ${userId}
    RETURNING id
  `
  return result.length > 0
}

/**
 * Save lens capture from webhook - Base64 image + AI description.
 */
export async function insertLensVault(imageBase64, label, metadata = {}) {
  await ensureTables()
  const [row] = await sql`
    INSERT INTO lens_vault (image, label, metadata)
    VALUES (${imageBase64}, ${label}, ${JSON.stringify(metadata)}::jsonb)
    RETURNING id
  `
  return String(row.id)
}
