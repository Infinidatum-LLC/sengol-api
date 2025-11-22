/**
 * Authentication Routes
 *
 * Implements JWT-based user authentication with login and registration endpoints.
 * All endpoints return access and refresh tokens for stateless API authentication.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { randomUUID } from 'crypto'
import { query } from '../lib/db'
import { generateTokens, revokeToken, revokeUserTokens } from '../lib/jwt.service'
import { hashPassword, verifyPassword, validatePasswordStrength } from '../lib/password.service'
import { AuthenticationError, ValidationError, DatabaseError } from '../lib/errors'

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

    // Verify password against stored hash
    const isPasswordValid = await verifyPassword(password, user.password)
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid email or password')
    }

    // Generate JWT tokens
    const tokens = await generateTokens(user.id, user.email, request.headers['user-agent'], request.ip)

    request.log.info({ userId: user.id, email: user.email }, 'User login successful')

    return reply.status(200).send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        emailVerified: user.emailVerified || null,
        role: user.role || 'user',
        ...tokens,
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

    // Validate password strength
    const strengthResult = validatePasswordStrength(password)
    if (!strengthResult.isValid) {
      throw new ValidationError(
        `Password is too weak: ${strengthResult.feedback.join(', ')}`,
        'WEAK_PASSWORD'
      )
    }

    // Check if user already exists
    const existingResult = await query(
      `SELECT "id" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )

    if (existingResult.rows.length > 0) {
      throw new ValidationError('Email already registered', 'DUPLICATE_EMAIL')
    }

    // Hash password before storing
    const hashedPassword = await hashPassword(password)
    const userId = randomUUID()

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
      [userId, email.toLowerCase(), hashedPassword, name || null]
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
        id: newUser.id,
        email: newUser.email,
        name: name || '',
        emailVerified: false,
        role: 'user',
        ...tokens,
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
 * Get user profile by ID (for JWT enrichment)
 *
 * GET /api/auth/user/:userId
 *
 * Returns user profile data needed for JWT token enrichment after login.
 * Used by frontend auth-client.ts enrichJWTToken() to fetch user details.
 *
 * Params:
 * ```
 * userId: User ID (UUID)
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "user-uuid",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "emailVerified": true,
 *     "role": "user",
 *     "currentGeographyId": "geo-uuid"
 *   }
 * }
 * ```
 */
async function getUserProfileById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId } = request.params as { userId: string }

    // Validate input
    if (!userId) {
      throw new ValidationError('User ID is required', 'INVALID_INPUT')
    }

    // Fetch user profile from database
    const result = await query(
      `SELECT "id", "email", "name", "emailVerified", "role", "currentGeographyId" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      })
    }

    const user = result.rows[0]

    request.log.info({ userId }, 'User profile retrieved for JWT enrichment')

    return reply.status(200).send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name || '',
        emailVerified: user.emailVerified || false,
        role: user.role || 'user',
        currentGeographyId: user.currentGeographyId || null,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Get user profile error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve user profile',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get user subscription data (for JWT enrichment)
 *
 * GET /api/auth/subscription/:userId
 *
 * Returns user subscription tier and status needed for JWT token enrichment.
 * Used by frontend auth-client.ts enrichJWTToken() to fetch subscription details.
 * Can fail gracefully - returns free tier default on error.
 *
 * Params:
 * ```
 * userId: User ID (UUID)
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "status": "active",
 *     "planId": "free",
 *     "tier": "free",
 *     "remaining": null
 *   }
 * }
 * ```
 */
async function getUserSubscription(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId } = request.params as { userId: string }

    // Validate input
    if (!userId) {
      throw new ValidationError('User ID is required', 'INVALID_INPUT')
    }

    // Fetch subscription data from database
    // This will be the user's subscription info
    const result = await query(
      `SELECT "id", "userId", "status", "planId", "tier"
       FROM "Subscription"
       WHERE "userId" = $1
       ORDER BY "createdAt" DESC
       LIMIT 1`,
      [userId]
    )

    // If user has a subscription, return it; otherwise return free tier
    if (result.rows.length > 0) {
      const subscription = result.rows[0]

      request.log.info({ userId }, 'User subscription retrieved')

      return reply.status(200).send({
        success: true,
        data: {
          status: subscription.status || 'active',
          planId: subscription.planId || 'free',
          tier: subscription.tier || 'free',
          remaining: null,
        },
      })
    }

    // No subscription found - return free tier default
    request.log.info({ userId }, 'No subscription found, returning free tier default')

    return reply.status(200).send({
      success: true,
      data: {
        status: 'active',
        planId: 'free',
        tier: 'free',
        remaining: null,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Get subscription error')

    // Gracefully return free tier on error instead of failing
    // This ensures login doesn't break if subscription service has issues
    return reply.status(200).send({
      success: true,
      data: {
        status: 'active',
        planId: 'free',
        tier: 'free',
        remaining: null,
      },
    })
  }
}

/**
 * Check if email is already registered
 *
 * POST /api/auth/check-email
 *
 * Checks whether an email address is already registered in the system.
 * Used by frontend during registration form to provide real-time feedback.
 *
 * Request:
 * ```json
 * {
 *   "email": "user@example.com"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "exists": false
 *   }
 * }
 * ```
 */
async function checkEmailExists(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { email } = request.body as { email?: string }

    // Validate input
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required', 'INVALID_INPUT')
    }

    if (!email.includes('@')) {
      throw new ValidationError('Invalid email format', 'INVALID_EMAIL')
    }

    // Check if email exists
    const result = await query(
      `SELECT "id" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )

    const exists = result.rows.length > 0

    request.log.info({ email, exists }, 'Email existence check')

    return reply.status(200).send({
      success: true,
      data: {
        exists,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Check email error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to check email',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Verify email with token (from email link)
 *
 * POST /api/auth/verify-email
 *
 * Verifies an email address using a verification token sent to the user's email.
 * Used when user clicks the verification link in their email.
 *
 * Request:
 * ```json
 * {
 *   "token": "email-verification-token"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "message": "Email verified successfully",
 *     "verified": true
 *   }
 * }
 * ```
 */
async function verifyEmailToken(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { token } = request.body as { token?: string }

    // Validate input
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Verification token is required', 'INVALID_INPUT')
    }

    // Find email verification record by token
    const result = await query(
      `SELECT "id", "userId", "email", "expiresAt" FROM "EmailVerification"
       WHERE "token" = $1 AND "expiresAt" > NOW() LIMIT 1`,
      [token]
    )

    if (result.rows.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid or expired verification token',
        code: 'INVALID_TOKEN',
        statusCode: 400,
      })
    }

    const verification = result.rows[0]

    // Mark email as verified in user record
    await query(
      `UPDATE "User" SET "emailVerified" = true, "updatedAt" = NOW() WHERE "id" = $1`,
      [verification.userId]
    )

    // Delete the verification record
    await query(
      `DELETE FROM "EmailVerification" WHERE "id" = $1`,
      [verification.id]
    )

    request.log.info({ userId: verification.userId, email: verification.email }, 'Email verified')

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Email verified successfully',
        verified: true,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Verify email error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to verify email',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Forgot password endpoint
 *
 * POST /api/auth/forgot-password
 *
 * Initiates password reset by sending reset token to user's email.
 *
 * Request:
 * ```json
 * {
 *   "email": "user@example.com"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "message": "Password reset instructions sent to your email"
 *   }
 * }
 * ```
 */
async function forgotPassword(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { email } = request.body as { email?: string }

    // Validate input
    if (!email || typeof email !== 'string') {
      throw new ValidationError('Email is required', 'INVALID_INPUT')
    }

    if (!email.includes('@')) {
      throw new ValidationError('Invalid email format', 'INVALID_EMAIL')
    }

    // Check if user exists
    const userResult = await query(
      `SELECT "id", "email" FROM "User" WHERE "email" = $1 LIMIT 1`,
      [email.toLowerCase()]
    )

    // Security: Always return success message even if email doesn't exist
    // This prevents email enumeration attacks
    if (userResult.rows.length === 0) {
      return reply.status(200).send({
        success: true,
        data: {
          message: 'If that email exists, we sent a password reset link',
        },
      })
    }

    const user = userResult.rows[0]

    // Generate reset token (valid for 1 hour)
    const resetToken = randomUUID()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000) // 1 hour from now

    // Store reset token in database
    await query(
      `INSERT INTO "PasswordResetToken" ("id", "userId", "token", "expiresAt", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      [randomUUID(), user.id, resetToken, expiresAt]
    )

    request.log.info({ userId: user.id, email: user.email }, 'Password reset token created')

    // TODO: Send email with reset link
    // The frontend will construct the reset URL: /auth/reset-password?token={resetToken}
    // Backend should send this token to the user's email with the reset link

    return reply.status(200).send({
      success: true,
      data: {
        message: 'If that email exists, we sent a password reset link',
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Forgot password error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to process password reset request',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Reset password endpoint
 *
 * POST /api/auth/reset-password
 *
 * Validates reset token and updates user's password.
 *
 * Request:
 * ```json
 * {
 *   "token": "reset-token-from-email",
 *   "password": "newPassword123"
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "message": "Password reset successfully"
 *   }
 * }
 * ```
 */
async function resetPassword(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { token, password } = request.body as { token?: string; password?: string }

    // Validate input
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Reset token is required', 'INVALID_INPUT')
    }

    if (!password || typeof password !== 'string') {
      throw new ValidationError('Password is required', 'INVALID_INPUT')
    }

    // Validate password strength
    try {
      validatePasswordStrength(password)
    } catch (error) {
      throw new ValidationError(
        error instanceof Error ? error.message : 'Password does not meet requirements',
        'WEAK_PASSWORD'
      )
    }

    // Find valid reset token
    const tokenResult = await query(
      `SELECT "id", "userId", "expiresAt" FROM "PasswordResetToken"
       WHERE "token" = $1 AND "expiresAt" > NOW() LIMIT 1`,
      [token]
    )

    if (tokenResult.rows.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN',
        statusCode: 400,
      })
    }

    const resetTokenRecord = tokenResult.rows[0]

    // Hash new password
    const hashedPassword = await hashPassword(password)

    // Update user password
    await query(
      `UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [hashedPassword, resetTokenRecord.userId]
    )

    // Delete the reset token (one-time use)
    await query(
      `DELETE FROM "PasswordResetToken" WHERE "id" = $1`,
      [resetTokenRecord.id]
    )

    // Optionally: Revoke all existing tokens for this user to force re-login
    // This ensures old sessions become invalid after password reset
    await revokeUserTokens(resetTokenRecord.userId)

    request.log.info({ userId: resetTokenRecord.userId }, 'Password reset successfully')

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Password reset successfully',
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Reset password error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to reset password',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all authentication routes
 */
export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/auth/login', login)
  fastify.post('/auth/register', register)
  fastify.post('/auth/refresh', refreshAccessToken)
  fastify.post('/auth/logout', logout)
  fastify.get('/auth/user/:userId', getUserProfileById)
  fastify.get('/auth/subscription/:userId', getUserSubscription)
  fastify.post('/auth/check-email', checkEmailExists)
  fastify.post('/auth/verify-email', verifyEmailToken)
  fastify.post('/auth/forgot-password', forgotPassword)
  fastify.post('/auth/reset-password', resetPassword)

  fastify.log.info('Authentication routes registered')
}
