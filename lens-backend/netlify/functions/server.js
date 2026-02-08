/**
 * Netlify Function - API server using Neon PostgreSQL.
 * All routes: auth, bookmarks, lens webhook, health.
 */
import express from 'express'
import serverless from 'serverless-http'
import {
  createUser,
  getUserByUsername,
  createBookmark,
  getBookmarks,
  getBookmark,
  deleteBookmark,
  getBoards,
  createBoard,
  updateBookmarkBoard,
  insertLensVault,
} from './db.js'
import { hashPassword, verifyPassword, createAccessToken, decodeToken } from './auth.js'

const app = express()
// Allow large payloads (base64 images) – Netlify limit is 6MB
app.use(express.json({ limit: 6 * 1024 * 1024 }))
app.use(express.urlencoded({ extended: true, limit: 6 * 1024 * 1024 }))

// CORS: allow extension content scripts and web frontend
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-API-Key')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})

const API_KEY = process.env.LENS_API_KEY || ''
const SECRET_KEY = process.env.LENS_SECRET_KEY || 'change-me-in-production'
const ADMIN_USER = process.env.LENS_ADMIN_USER || 'admin'
const ADMIN_PASSWORD = process.env.LENS_ADMIN_PASSWORD || 'admin'

function requireApiKey(req, res, next) {
  if (!API_KEY || !API_KEY.trim()) return next()
  const key = req.headers['x-api-key']
  if (!key || key.trim() !== API_KEY.trim()) {
    return res.status(401).json({ detail: 'Invalid or missing API key. Provide X-API-Key header.' })
  }
  next()
}

function requireToken(req, res, next) {
  const auth = req.headers.authorization
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token) {
    return res.status(401).json({ detail: 'Not authenticated' })
  }
  const payload = decodeToken(token, SECRET_KEY)
  if (!payload || !payload.sub) {
    return res.status(401).json({ detail: 'Invalid token' })
  }
  req.auth = payload
  next()
}

// --- Auth ---
app.post('/auth/register', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || username.length < 2) return res.status(400).json({ detail: 'Username too short' })
    if (!password || password.length < 4) return res.status(400).json({ detail: 'Password too short' })
    const existing = await getUserByUsername(username)
    if (existing) return res.status(400).json({ detail: 'Username already taken' })
    await createUser(username, hashPassword(password))
    const token = createAccessToken({ sub: username }, SECRET_KEY)
    return res.json({ access_token: token, token_type: 'bearer' })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {}
    if (!username || !password) return res.status(401).json({ detail: 'Incorrect username or password' })

    const user = await getUserByUsername(username)
    if (user) {
      if (!verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ detail: 'Incorrect username or password' })
      }
      const token = createAccessToken({ sub: user.username }, SECRET_KEY)
      return res.json({ access_token: token, token_type: 'bearer' })
    }

    if (username !== ADMIN_USER) return res.status(401).json({ detail: 'Incorrect username or password' })
    const ok = ADMIN_PASSWORD.startsWith('$2')
      ? verifyPassword(password, ADMIN_PASSWORD)
      : password === ADMIN_PASSWORD
    if (!ok) return res.status(401).json({ detail: 'Incorrect username or password' })
    const token = createAccessToken({ sub: username }, SECRET_KEY)
    return res.json({ access_token: token, token_type: 'bearer' })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

// --- Lens webhook (Neon) ---
app.post('/api/lens', requireApiKey, async (req, res) => {
  try {
    const { image, description, timestamp, mimeType, ...extra } = req.body || {}
    if (!image || !description) return res.status(400).json({ detail: 'image and description required' })
    const metadata = { timestamp, mimeType, ...extra }
    const id = await insertLensVault(image, description, metadata)
    return res.json({ id, status: 'saved' })
  } catch (err) {
    return res.status(502).json({ detail: err.message })
  }
})

// --- Boards ---
app.get('/api/boards', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const boards = await getBoards(user.id)
    return res.json({ boards })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.post('/api/boards', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const { name } = req.body || {}
    const board = await createBoard(user.id, name)
    return res.json(board)
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

// --- Bookmarks ---
app.post('/api/bookmarks', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const { image, description, similarProducts, sourceUrl, boardId } = req.body || {}
    if (!image || !description) return res.status(400).json({ detail: 'image and description required' })
    const bid = await createBookmark(user.id, image, description, similarProducts || [], sourceUrl, boardId)
    return res.json({ id: bid, status: 'saved' })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.get('/api/bookmarks', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const boardId = req.query.board_id || null
    const bookmarks = await getBookmarks(user.id, boardId)
    return res.json({ bookmarks })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.get('/api/bookmarks/:bookmarkId', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const b = await getBookmark(req.params.bookmarkId, user.id)
    if (!b) return res.status(404).json({ detail: 'Bookmark not found' })
    return res.json(b)
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.patch('/api/bookmarks/:bookmarkId', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const { board_id } = req.body || {}
    if (!board_id) return res.status(400).json({ detail: 'board_id required' })
    const ok = await updateBookmarkBoard(req.params.bookmarkId, user.id, board_id)
    if (!ok) return res.status(404).json({ detail: 'Bookmark not found' })
    return res.json({ status: 'moved' })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.delete('/api/bookmarks/:bookmarkId', requireToken, async (req, res) => {
  try {
    const user = await getUserByUsername(req.auth.sub)
    if (!user) return res.status(401).json({ detail: 'User not found' })
    const ok = await deleteBookmark(req.params.bookmarkId, user.id)
    if (!ok) return res.status(404).json({ detail: 'Bookmark not found' })
    return res.json({ status: 'deleted' })
  } catch (err) {
    return res.status(500).json({ detail: err.message })
  }
})

app.get('/health', (req, res) => res.json({ status: 'ok' }))

export const handler = serverless(app)
