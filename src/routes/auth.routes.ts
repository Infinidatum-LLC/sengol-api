/**
 * Authentication Routes
 *
 * Implements JWT-based user authentication with login and registration endpoints.
 * All endpoints return access and refresh tokens for stateless API authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { generateTokens, revokeToken, revokeUserTokens } from '../lib/jwt.service'
import { AuthenticationError, ValidationError, DatabaseError } from '../lib/errors'
import { v4 as uuidv4 } from 'uuid'

/**
 * Login request body
 */
interface LoginRequest {
  email: string
  password: string
}

/**
 * Register request body
 */
interface RegisterRequest {
  email: string
  password: string
  name?: string
}

/**
 * Login endpoint
 *
 * POST /api/auth/login
 *
 * Validates user credentials and returns JWT tokens.
 *
 * Request:
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "password123"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "eyJhbGc...",
 *     "expiresIn": 900,
 *     "tokenType": "Bearer",
 *     "user": {
 *       "id": "user-uuid",
 *       "email": "user@example.com"
 *     }
 *   }
 * }
 * ```
 */
async function login(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { email, password } = request.body as LoginRequest

    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required', 'INVALID_INPUT')
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      throw new ValidationError('Invalid email format', 'INVALID_EMAIL')
    }

    if (typeof password !== 'string' || password.length < 1) {
      throw new ValidationError('Invalid password', 'INVALID_PASSWORD')
    }

    // Look up user by email
    const userResult = await query(
      `SELECT "id", "email", "password" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )

    if (userResult.rows.length === 0) {
      // Don't reveal if email exists or not (security best practice)
      throw new AuthenticationError('Invalid email or password')
    }

    const user = userResult.rows[0]

    // TODO: Implement password verification using bcrypt
    // For now, accept any password (security stub - REPLACE IN PRODUCTION)
    if (password === '') {
      throw new AuthenticationError('Invalid email or password')
    }

    // Generate JWT tokens
    const tokens = await generateTokens(user.id, user.email, request.headers['user-agent'], request.ip)

    request.log.info({ userId: user.id, email: user.email }, 'User login successful')

    return reply.status(200).send({
      success: true,
      data: {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
        },
      },
    })

  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      return reply.status(error.statusCode || 401).send({
        success: false,
        error: error.message,
        code: error.code || 'AUTH_ERROR',
        statusCode: error.statusCode || 401,
      })
    }

    request.log.error({ err: error }, 'Login error')
    return reply.status(500).send({
      success: false,
      error: 'Login failed',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register endpoint
 *
 * POST /api/auth/register
 *
 * Creates a new user account and returns JWT tokens.
 *
 * Request:
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "password123",
 *   "name": "John Doe"
 * }
 * ```
 *
 * Response (201):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "eyJhbGc...",
 *     "expiresIn": 900,
 *     "tokenType": "Bearer",
 *     "user": {
 *       "id": "user-uuid",
 *       "email": "user@example.com"
 *     }
 *   }
 * }
 * ```
 */
async function register(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { email, password, name } = request.body as RegisterRequest

    // Validate input
    if (!email || !password) {
      throw new ValidationError('Email and password are required', 'INVALID_INPUT')
    }

    if (typeof email !== 'string' || !email.includes('@')) {
      throw new ValidationError('Invalid email format', 'INVALID_EMAIL')
    }

    if (typeof password !== 'string' || password.length < 8) {
      throw new ValidationError('Password must be at least 8 characters', 'WEAK_PASSWORD')
    }

    // Check if user already exists
    const existingResult = await query(
      `SELECT "id" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )

    if (existingResult.rows.length > 0) {
      throw new ValidationError('Email already registered', 'DUPLICATE_EMAIL')
    }

    // TODO: Hash password using bcrypt before storing
    // For now, store password as plaintext (security stub - REPLACE IN PRODUCTION)
    const userId = uuidv4()

    // Create user
    const createResult = await query(
      `INSERT INTO "User" (
        "id",
        "email",
        "password",
        "name",
        "createdAt",
        "updatedAt"
      ) VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING "id", "email"`,
      [userId, email.toLowerCase(), password, name || null]
    )

    if (createResult.rows.length === 0) {
      throw new DatabaseError('Failed to create user', new Error('User creation returned no rows'))
    }

    const newUser = createResult.rows[0]

    // Generate JWT tokens
    const tokens = await generateTokens(newUser.id, newUser.email, request.headers['user-agent'], request.ip)

    request.log.info({ userId: newUser.id, email: newUser.email }, 'User registration successful')

    return reply.status(201).send({
      success: true,
      data: {
        ...tokens,
        user: {
          id: newUser.id,
          email: newUser.email,
        },
      },
    })

  } catch (error) {
    if (error instanceof ValidationError || error instanceof DatabaseError) {
      const statusCode = error instanceof ValidationError ? 400 : 500
      return reply.status(statusCode).send({
        success: false,
        error: error.message,
        code: error.code || 'REGISTRATION_ERROR',
        statusCode,
      })
    }

    request.log.error({ err: error }, 'Registration error')
    return reply.status(500).send({
      success: false,
      error: 'Registration failed',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Refresh token endpoint
 *
 * POST /api/auth/refresh
 *
 * Issues a new access token using a valid refresh token.
 *
 * Request:
 * ```json
 * {
 *   "refreshToken": "eyJhbGc..."
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "accessToken": "eyJhbGc...",
 *     "refreshToken": "eyJhbGc...",
 *     "expiresIn": 900,
 *     "tokenType": "Bearer"
 *   }
 * }
 * ```
 */
async function refreshAccessToken(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { refreshToken } = request.body as { refreshToken?: string }

    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new ValidationError('Refresh token is required', 'INVALID_INPUT')
    }

    // Use the JWT service's refresh function
    const { refreshAccessToken: refresh } = await import('../lib/jwt.service')
    const tokens = await refresh(refreshToken, request.headers['user-agent'], request.ip)

    if (!tokens) {
      throw new AuthenticationError('Invalid or expired refresh token')
    }

    request.log.info('Access token refreshed successfully')

    return reply.status(200).send({
      success: true,
      data: tokens,
    })

  } catch (error) {
    if (error instanceof ValidationError || error instanceof AuthenticationError) {
      return reply.status(error.statusCode || 401).send({
        success: false,
        error: error.message,
        code: error.code || 'REFRESH_ERROR',
        statusCode: error.statusCode || 401,
      })
    }

    request.log.error({ err: error }, 'Token refresh error')
    return reply.status(500).send({
      success: false,
      error: 'Token refresh failed',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Logout endpoint
 *
 * POST /api/auth/logout
 *
 * Revokes the current access token. Requires JWT authentication.
 *
 * Headers:
 * ```
 * Authorization: Bearer <accessToken>
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "message": "Logged out successfully"
 * }
 * ```
 */
async function logout(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Get authorization header (should have been validated by middleware)
    const authHeader = request.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Missing or invalid authorization header')
    }

    const token = authHeader.substring(7)

    // Revoke the token
    const revoked = await revokeToken(token)

    if (!revoked) {
      request.log.warn('Token revocation returned false (token may not exist)')
    }

    request.log.info('User logged out successfully')

    return reply.status(200).send({
      success: true,
      message: 'Logged out successfully',
    })

  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Logout error')
    return reply.status(500).send({
      success: false,
      error: 'Logout failed',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all authentication routes
 */
export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', login)
  fastify.post('/api/auth/register', register)
  fastify.post('/api/auth/refresh', refreshAccessToken)
  fastify.post('/api/auth/logout', logout)

  fastify.log.info('Authentication routes registered')
}
