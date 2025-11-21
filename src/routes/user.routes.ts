/**
 * Protected User Routes
 *
 * Example routes demonstrating JWT authentication and protected endpoints.
 * All routes require valid JWT bearer tokens in the Authorization header.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError } from '../lib/errors'

/**
 * Get authenticated user profile
 *
 * GET /api/user/profile
 *
 * Returns the profile of the authenticated user.
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
 *   "data": {
 *     "id": "user-uuid",
 *     "email": "user@example.com",
 *     "name": "John Doe",
 *     "createdAt": "2024-01-01T00:00:00Z",
 *     "updatedAt": "2024-01-01T00:00:00Z"
 *   }
 * }
 * ```
 */
async function getUserProfile(request: FastifyRequest, reply: FastifyReply) {
  try {
    // JWT middleware has already validated the token and attached userId to request
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Fetch user profile from database
    const result = await query(
      `SELECT "id", "email", "name", "createdAt", "updatedAt" FROM "User" WHERE "id" = $1 LIMIT 1`,
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

    request.log.info({ userId }, 'User profile retrieved')

    return reply.status(200).send({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      },
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

    request.log.error({ err: error }, 'Get profile error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve profile',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get user's active sessions (tokens)
 *
 * GET /api/user/sessions
 *
 * Returns all active (non-revoked, non-expired) sessions for the authenticated user.
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
 *   "data": {
 *     "sessions": [
 *       {
 *         "id": "token-id",
 *         "type": "access",
 *         "userAgent": "Mozilla/5.0...",
 *         "ipAddress": "127.0.0.1",
 *         "createdAt": "2024-01-01T00:00:00Z",
 *         "expiresAt": "2024-01-01T00:15:00Z"
 *       }
 *     ],
 *     "total": 1
 *   }
 * }
 * ```
 */
async function getUserSessions(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Fetch all active sessions (tokens) for user
    const result = await query(
      `SELECT "id", "type", "userAgent", "ipAddress", "createdAt", "expiresAt"
       FROM "user_tokens"
       WHERE "userId" = $1 AND "isRevoked" = false AND "expiresAt" > NOW()
       ORDER BY "createdAt" DESC`,
      [userId]
    )

    const sessions = result.rows.map((row: any) => ({
      id: row.id,
      type: row.type,
      userAgent: row.userAgent,
      ipAddress: row.ipAddress,
      createdAt: new Date(row.createdAt),
      expiresAt: new Date(row.expiresAt),
    }))

    request.log.info({ userId, sessionCount: sessions.length }, 'User sessions retrieved')

    return reply.status(200).send({
      success: true,
      data: {
        sessions,
        total: sessions.length,
      },
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

    request.log.error({ err: error }, 'Get sessions error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve sessions',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Revoke a specific session
 *
 * DELETE /api/user/sessions/:sessionId
 *
 * Revokes a specific session by ID. User can revoke any of their own sessions.
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
 *   "message": "Session revoked"
 * }
 * ```
 */
async function revokeSession(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const { sessionId } = request.params as { sessionId: string }

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    if (!sessionId) {
      return reply.status(400).send({
        success: false,
        error: 'Session ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    // Verify the session belongs to the user
    const sessionResult = await query(
      `SELECT "id" FROM "user_tokens" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
      [sessionId, userId]
    )

    if (sessionResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Session not found',
        code: 'SESSION_NOT_FOUND',
        statusCode: 404,
      })
    }

    // Revoke the session
    await query(
      `UPDATE "user_tokens" SET "isRevoked" = true, "revokedAt" = NOW() WHERE "id" = $1`,
      [sessionId]
    )

    request.log.info({ userId, sessionId }, 'Session revoked')

    return reply.status(200).send({
      success: true,
      message: 'Session revoked',
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

    request.log.error({ err: error }, 'Revoke session error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to revoke session',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all user routes
 */
export async function userRoutes(fastify: FastifyInstance) {
  // All routes require JWT authentication via middleware
  fastify.get('/api/user/profile', { onRequest: jwtAuthMiddleware }, getUserProfile)
  fastify.get('/api/user/sessions', { onRequest: jwtAuthMiddleware }, getUserSessions)
  fastify.delete('/api/user/sessions/:sessionId', { onRequest: jwtAuthMiddleware }, revokeSession)

  fastify.log.info('User routes registered')
}
