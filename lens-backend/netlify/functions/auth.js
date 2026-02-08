/**
 * Auth helpers: JWT and bcrypt for Netlify Functions.
 */
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'

const ALGORITHM = 'HS256'
const ACCESS_TOKEN_EXPIRE_MINUTES = 60

export function hashPassword(password) {
  return bcrypt.hashSync(password, 10)
}

export function verifyPassword(plain, hashed) {
  return bcrypt.compareSync(plain, hashed)
}

export function createAccessToken(data, secret, expiresMinutes = ACCESS_TOKEN_EXPIRE_MINUTES) {
  const expiresIn = expiresMinutes * 60
  return jwt.sign(
    { ...data, exp: Math.floor(Date.now() / 1000) + expiresIn },
    secret,
    { algorithm: ALGORITHM }
  )
}

export function decodeToken(token, secret) {
  try {
    return jwt.verify(token, secret, { algorithms: [ALGORITHM] })
  } catch {
    return null
  }
}
