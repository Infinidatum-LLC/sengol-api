import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken'
import { query } from './db'
import { randomUUID } from 'crypto'

// ============================================================================
// TYPES
// ============================================================================

export interface TokenPayload {
  userId: string
  email?: string
  iat?: number
  exp?: number
}

export interface TokenRecord {
  id: string
  userId: string
  token: string
  type: 'access' | 'refresh' | 'reset-password'
  expiresAt: Date
  isRevoked: boolean
  revokedAt?: Date
  userAgent?: string
  ipAddress?: string
  createdAt: Date
  updatedAt: Date
}

export interface TokenResponse {
  accessToken: string
  refreshToken?: string
  expiresIn: number
  tokenType: string
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key'
const ACCESS_TOKEN_EXPIRY = 15 * 60 // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 // 7 days in seconds
const RESET_TOKEN_EXPIRY = 1 * 60 * 60 // 1 hour in seconds

// ============================================================================
// JWT SERVICE
// ============================================================================

/**
 * Generate access and refresh tokens for a user
 */
export async function generateTokens(
  userId: string,
  email?: string,
  userAgent?: string,
  ipAddress?: string
): Promise<TokenResponse> {
  const now = Math.floor(Date.now() / 1000)
  // Create payload (do NOT include exp here - let jwt.sign handle it)
  const payload: TokenPayload = {
    userId,
    email,
  }

  // Sign access token (expiresIn in seconds for jwt.sign)
  const accessToken = jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: Math.floor(ACCESS_TOKEN_EXPIRY / 1000), // Convert ms to seconds for jwt.sign
  })

  // Sign refresh token
  const refreshTokenPayload: TokenPayload = {
    userId,
  }

  const refreshToken = jwt.sign(refreshTokenPayload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: Math.floor(REFRESH_TOKEN_EXPIRY / 1000), // Convert ms to seconds for jwt.sign
  })

  // Store tokens in database
  const accessTokenRecord = await storeToken({
    userId,
    token: accessToken,
    type: 'access',
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_EXPIRY),
    userAgent,
    ipAddress,
  })

  const refreshTokenRecord = await storeToken({
    userId,
    token: refreshToken,
    type: 'refresh',
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY),
    userAgent,
    ipAddress,
  })

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_EXPIRY,
    tokenType: 'Bearer',
  }
}

/**
 * Generate password reset token
 */
export async function generateResetToken(
  userId: string,
  userAgent?: string,
  ipAddress?: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = now + RESET_TOKEN_EXPIRY

  const payload: TokenPayload = {
    userId,
    iat: now,
    exp: expiresAt,
  }

  const token = jwt.sign(payload, JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: RESET_TOKEN_EXPIRY,
  })

  // Store reset token in database
  await storeToken({
    userId,
    token,
    type: 'reset-password',
    expiresAt: new Date(expiresAt * 1000),
    userAgent,
    ipAddress,
  })

  return token
}

/**
 * Verify and decode a token
 */
export async function verifyToken(token: string): Promise<TokenPayload | null> {
  try {
    // Check if token is revoked in database
    const isRevoked = await isTokenRevoked(token)
    if (isRevoked) {
      console.log('[JWT] Token is revoked')
      return null
    }

    // Verify signature
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload

    // Check expiration
    if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
      console.log('[JWT] Token is expired')
      return null
    }

    return decoded
  } catch (error) {
    console.error('[JWT] Token verification failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(
  refreshToken: string,
  userAgent?: string,
  ipAddress?: string
): Promise<TokenResponse | null> {
  try {
    // Verify refresh token
    const payload = await verifyToken(refreshToken)
    if (!payload || !payload.userId) {
      return null
    }

    // Check token type in database
    const tokenRecord = await getTokenRecord(refreshToken)
    if (!tokenRecord || tokenRecord.type !== 'refresh') {
      return null
    }

    // Generate new access token
    const response = await generateTokens(
      payload.userId,
      payload.email,
      userAgent,
      ipAddress
    )

    return response
  } catch (error) {
    console.error('[JWT] Token refresh failed:', error instanceof Error ? error.message : error)
    return null
  }
}

/**
 * Revoke a token
 */
export async function revokeToken(token: string): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE "user_tokens" SET "isRevoked" = true, "revokedAt" = NOW() WHERE "token" = $1`,
      [token]
    )

    return result.rowCount > 0
  } catch (error) {
    console.error('[JWT] Token revocation failed:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Revoke all tokens for a user
 */
export async function revokeUserTokens(userId: string): Promise<boolean> {
  try {
    const result = await query(
      `UPDATE "user_tokens" SET "isRevoked" = true, "revokedAt" = NOW() WHERE "userId" = $1`,
      [userId]
    )

    return result.rowCount > 0
  } catch (error) {
    console.error('[JWT] User token revocation failed:', error instanceof Error ? error.message : error)
    return false
  }
}

/**
 * Store a token in the database
 */
async function storeToken(data: {
  userId: string
  token: string
  type: 'access' | 'refresh' | 'reset-password'
  expiresAt: Date
  userAgent?: string
  ipAddress?: string
}): Promise<TokenRecord> {
  const tokenId = randomUUID()

  const result = await query(
    `INSERT INTO "user_tokens" (
      "id",
      "userId",
      "token",
      "type",
      "expiresAt",
      "userAgent",
      "ipAddress",
      "isRevoked",
      "createdAt",
      "updatedAt"
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, false, NOW(), NOW())
    RETURNING *`,
    [
      tokenId,
      data.userId,
      data.token,
      data.type,
      data.expiresAt.toISOString(),
      data.userAgent || null,
      data.ipAddress || null,
    ]
  )

  if (result.rows.length === 0) {
    throw new Error('Failed to store token')
  }

  const row = result.rows[0]
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    expiresAt: new Date(row.expiresAt),
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
  } as TokenRecord
}

/**
 * Get token record from database
 */
async function getTokenRecord(token: string): Promise<TokenRecord | null> {
  const result = await query(
    `SELECT * FROM "user_tokens" WHERE "token" = $1 LIMIT 1`,
    [token]
  )

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    expiresAt: new Date(row.expiresAt),
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
  } as TokenRecord
}

/**
 * Check if a token is revoked
 */
async function isTokenRevoked(token: string): Promise<boolean> {
  const result = await query(
    `SELECT "isRevoked" FROM "user_tokens" WHERE "token" = $1 LIMIT 1`,
    [token]
  )

  if (result.rows.length === 0) {
    return true // Token not found = treat as revoked
  }

  return result.rows[0].isRevoked === true
}

/**
 * Clean up expired tokens (maintenance task)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  try {
    const result = await query(
      `DELETE FROM "user_tokens" WHERE "expiresAt" < NOW()`
    )

    console.log(`[JWT] Cleaned up ${result.rowCount} expired tokens`)
    return result.rowCount || 0
  } catch (error) {
    console.error('[JWT] Token cleanup failed:', error instanceof Error ? error.message : error)
    return 0
  }
}

/**
 * Get user tokens
 */
export async function getUserTokens(userId: string): Promise<TokenRecord[]> {
  const result = await query(
    `SELECT * FROM "user_tokens" WHERE "userId" = $1 AND "isRevoked" = false AND "expiresAt" > NOW() ORDER BY "createdAt" DESC`,
    [userId]
  )

  return result.rows.map((row: any) => ({
    ...row,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
    expiresAt: new Date(row.expiresAt),
    revokedAt: row.revokedAt ? new Date(row.revokedAt) : undefined,
  })) as TokenRecord[]
}
