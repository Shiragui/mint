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
    await sql`CREATE TABLE IF NOT EXISTS boards (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL DEFAULT 'Saved',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
    await sql`CREATE INDEX IF NOT EXISTS idx_boards_user ON boards(user_id)`
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
    try {
      await sql`ALTER TABLE bookmarks ADD COLUMN IF NOT EXISTS board_id UUID REFERENCES boards(id) ON DELETE SET NULL`
    } catch (_) {}
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_bookmarks_board ON bookmarks(board_id)`
    } catch (_) {}
    await sql`CREATE TABLE IF NOT EXISTS lens_vault (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      image TEXT,
      label TEXT,
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`
    await sql`CREATE TABLE IF NOT EXISTS board_likes (
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      board_id UUID NOT NULL REFERENCES boards(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      PRIMARY KEY (user_id, board_id)
    )`
    await sql`CREATE INDEX IF NOT EXISTS idx_board_likes_board ON board_likes(board_id)`
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

async function getOrCreateDefaultBoard(userId) {
  const [existing] = await sql`
    SELECT id FROM boards WHERE user_id = ${userId} ORDER BY created_at ASC LIMIT 1
  `
  if (existing) return String(existing.id)
  const [row] = await sql`
    INSERT INTO boards (user_id, name) VALUES (${userId}, 'Saved') RETURNING id
  `
  return String(row.id)
}

/**
 * Save a bookmark - Base64 image, AI description, similar products, source URL.
 */
export async function createBookmark(userId, imageBase64, description, results, sourceUrl, boardId) {
  await ensureTables()
  const bid = boardId || await getOrCreateDefaultBoard(userId)
  const resultsJson = JSON.stringify(results || [])
  const [row] = await sql`
    INSERT INTO bookmarks (user_id, board_id, image_base64, description, results_json, source_url)
    VALUES (${userId}, ${bid}, ${imageBase64}, ${description}, ${resultsJson}::jsonb, ${sourceUrl || ''})
    RETURNING id
  `
  return String(row.id)
}

/**
 * Fetch all bookmarks for a user, optionally filtered by board. Ordered by created_at desc.
 */
export async function getBookmarks(userId, boardId = null) {
  await ensureTables()
  const defaultBoardId = await getOrCreateDefaultBoard(userId)
  let rows
  if (boardId) {
    if (boardId === defaultBoardId) {
      rows = await sql`
        SELECT id, board_id, image_base64, description, results_json, source_url, created_at
        FROM bookmarks WHERE user_id = ${userId} AND (board_id = ${boardId} OR board_id IS NULL)
        ORDER BY created_at DESC
      `
    } else {
      rows = await sql`
        SELECT id, board_id, image_base64, description, results_json, source_url, created_at
        FROM bookmarks WHERE user_id = ${userId} AND board_id = ${boardId}
        ORDER BY created_at DESC
      `
    }
  } else {
    rows = await sql`
      SELECT id, board_id, image_base64, description, results_json, source_url, created_at
      FROM bookmarks WHERE user_id = ${userId}
      ORDER BY created_at DESC
    `
  }
  return rows.map(r => ({
    id: String(r.id),
    board_id: r.board_id ? String(r.board_id) : defaultBoardId,
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
    SELECT id, board_id, image_base64, description, results_json, source_url, created_at
    FROM bookmarks
    WHERE id = ${bookmarkId} AND user_id = ${userId}
  `
  if (!row) return null
  const defaultBoardId = row.board_id ? String(row.board_id) : await getOrCreateDefaultBoard(userId)
  return {
    id: String(row.id),
    board_id: defaultBoardId,
    image_base64: row.image_base64,
    description: row.description,
    results: Array.isArray(row.results_json) ? row.results_json : [],
    source_url: row.source_url,
    created_at: row.created_at,
  }
}

export async function getBoards(userId) {
  await ensureTables()
  await getOrCreateDefaultBoard(userId)
  const rows = await sql`
    SELECT id, name FROM boards WHERE user_id = ${userId} ORDER BY created_at ASC
  `
  return rows.map(r => ({ id: String(r.id), name: r.name }))
}

export async function createBoard(userId, name) {
  await ensureTables()
  const [row] = await sql`
    INSERT INTO boards (user_id, name) VALUES (${userId}, ${(name || 'Untitled').trim()})
    RETURNING id, name
  `
  return { id: String(row.id), name: row.name }
}

export async function updateBookmarkBoard(bookmarkId, userId, boardId) {
  await ensureTables()
  const result = await sql`
    UPDATE bookmarks SET board_id = ${boardId}
    WHERE id = ${bookmarkId} AND user_id = ${userId}
    RETURNING id
  `
  return result.length > 0
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

export async function deleteBoard(boardId, userId) {
  await ensureTables()
  const defaultBoardId = await getOrCreateDefaultBoard(userId)
  if (boardId === defaultBoardId) return { ok: false, reason: 'cannot_delete_default' }
  await sql`UPDATE bookmarks SET board_id = ${defaultBoardId} WHERE board_id = ${boardId}`
  const result = await sql`
    DELETE FROM boards WHERE id = ${boardId} AND user_id = ${userId} RETURNING id
  `
  return { ok: result.length > 0 }
}

/**
 * Public feed: all boards from all users with owner username, first bookmark image, like count.
 * If userId provided, includes is_liked for each board.
 */
export async function getPublicBoards(userId = null) {
  await ensureTables()
  const rows = await sql`
    SELECT b.id, b.name, b.created_at, u.username as owner_name,
      (SELECT image_base64 FROM bookmarks WHERE board_id = b.id ORDER BY created_at DESC LIMIT 1) as preview_image,
      (SELECT COUNT(*)::int FROM board_likes WHERE board_id = b.id) as like_count
    FROM boards b
    JOIN users u ON b.user_id = u.id
    ORDER BY b.created_at DESC
  `
  let result = rows.map(r => ({
    id: String(r.id),
    name: r.name,
    owner_name: r.owner_name,
    created_at: r.created_at,
    preview_image: r.preview_image || null,
    like_count: r.like_count || 0,
  }))

  if (userId) {
    const liked = await sql`
      SELECT board_id FROM board_likes WHERE user_id = ${userId}
    `
    const likedSet = new Set(liked.map(r => String(r.board_id)))
    result = result.map(b => ({ ...b, is_liked: likedSet.has(b.id) }))
  }
  return result
}

/**
 * Like a board (user must be authenticated).
 */
export async function likeBoard(userId, boardId) {
  await ensureTables()
  const [board] = await sql`SELECT id FROM boards WHERE id = ${boardId}`
  if (!board) return false
  try {
    await sql`
      INSERT INTO board_likes (user_id, board_id) VALUES (${userId}, ${boardId})
      ON CONFLICT (user_id, board_id) DO NOTHING
    `
    return true
  } catch {
    return false
  }
}

/**
 * Unlike a board.
 */
export async function unlikeBoard(userId, boardId) {
  await ensureTables()
  const result = await sql`
    DELETE FROM board_likes WHERE user_id = ${userId} AND board_id = ${boardId}
    RETURNING 1
  `
  return result.length > 0
}

/**
 * Get boards liked by the current user (for Liked tab).
 */
export async function getLikedBoards(userId) {
  await ensureTables()
  const rows = await sql`
    SELECT b.id, b.name, b.created_at, u.username as owner_name,
      (SELECT image_base64 FROM bookmarks WHERE board_id = b.id ORDER BY created_at DESC LIMIT 1) as preview_image,
      (SELECT COUNT(*)::int FROM board_likes WHERE board_id = b.id) as like_count
    FROM board_likes bl
    JOIN boards b ON b.id = bl.board_id
    JOIN users u ON b.user_id = u.id
    WHERE bl.user_id = ${userId}
    ORDER BY bl.created_at DESC
  `
  return rows.map(r => ({
    id: String(r.id),
    name: r.name,
    owner_name: r.owner_name,
    created_at: r.created_at,
    preview_image: r.preview_image || null,
    like_count: r.like_count || 0,
    is_liked: true,
  }))
}

/**
 * Public: get bookmarks for a board (read-only, any user can view).
 */
export async function getBoardBookmarksPublic(boardId) {
  await ensureTables()
  const [board] = await sql`
    SELECT b.id, b.name, u.username as owner_name
    FROM boards b
    JOIN users u ON b.user_id = u.id
    WHERE b.id = ${boardId}
  `
  if (!board) return null
  const rows = await sql`
    SELECT id, image_base64, description, results_json, source_url, created_at
    FROM bookmarks
    WHERE board_id = ${boardId}
    ORDER BY created_at DESC
  `
  return {
    board: { id: String(board.id), name: board.name, owner_name: board.owner_name },
    bookmarks: rows.map(r => ({
      id: String(r.id),
      image_base64: r.image_base64,
      description: r.description,
      results: Array.isArray(r.results_json) ? r.results_json : [],
      source_url: r.source_url,
      created_at: r.created_at,
    })),
  }
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
