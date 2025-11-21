import * as crypto from 'crypto'
import { insertOne, selectOne, updateOne } from './db-queries'

/**
 * JWT Token Management System
 * Uses PostgreSQL for token storage instead of relying on external JWT libraries
 */

interface TokenPayload {
  userId: string
  email: string
  iat: number
  exp: number
}

interface StoredToken {
  id: string
  userId: string
  token: string
  expiresAt: Date
  createdAt: Date
  revokedAt?: Date
}

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000 // 24 hours in milliseconds

/**
 * Create JWT token
 */
export function createToken(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + TOKEN_EXPIRY / 1000

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64').replace(/=/g, '')
  const payload = Buffer.from(
    JSON.stringify({
      userId,
      email,
      iat: now,
      exp,
    }),
  )
    .toString('base64')
    .replace(/=/g, '')

  const signature = crypto
    .createHmac('sha256', JWT_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=/g, '')

  return `${header}.${payload}.${signature}`
}

/**
 * Verify JWT token
 */
export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }

    const [headerB64, payloadB64, signatureB64] = parts

    // Add padding back
    const payloadPadded = payloadB64 + '=='.substring(0, (4 - (payloadB64.length % 4)) % 4)
    const payload = JSON.parse(Buffer.from(payloadPadded, 'base64').toString('utf-8'))

    // Verify signature
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64')
      .replace(/=/g, '')

    if (signatureB64 !== expectedSignature) {
      return null
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && payload.exp < now) {
      return null
    }

    return payload as TokenPayload
  } catch (error) {
    console.error('Token verification failed:', error)
    return null
  }
}

/**
 * Store token in database for audit/revocation purposes
 */
export async function storeToken(userId: string, token: string): Promise<StoredToken> {
  const storedToken = await insertOne<StoredToken>('user_tokens', {
    id: crypto.randomUUID(),
    userId,
    token,
    expiresAt: new Date(Date.now() + TOKEN_EXPIRY),
    createdAt: new Date(),
  })

  return storedToken
}

/**
 * Get token from database
 */
export async function getStoredToken(token: string): Promise<StoredToken | null> {
  return selectOne<StoredToken>('user_tokens', { token })
}

/**
 * Revoke token
 */
export async function revokeToken(token: string): Promise<boolean> {
  const result = await updateOne<StoredToken>(
    'user_tokens',
    { revokedAt: new Date() },
    { token },
  )

  return !!result
}

/**
 * Check if token is revoked
 */
export async function isTokenRevoked(token: string): Promise<boolean> {
  const stored = await getStoredToken(token)
  return !!stored?.revokedAt
}

/**
 * Validate user token with database check
 */
export async function validateUserToken(token: string): Promise<TokenPayload | null> {
  const payload = verifyToken(token)
  if (!payload) {
    return null
  }

  const isRevoked = await isTokenRevoked(token)
  if (isRevoked) {
    return null
  }

  return payload
}
