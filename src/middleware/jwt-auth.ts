/**
 * JWT Authentication Middleware
 *
 * Validates JWT tokens from Authorization header and attaches decoded payload
 * to the request context for use in protected routes.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { verifyToken, TokenPayload } from '../lib/jwt.service'
import { AuthenticationError } from '../lib/errors'

/**
 * Extended Fastify Request with JWT payload
 */
declare global {
  namespace FastifyInstance {
    interface FastifyRequest {
      tokenPayload?: TokenPayload
      userId?: string
    }
  }
}

/**
 * JWT authentication middleware
 *
 * Validates JWT token from Authorization header (Bearer scheme)
 * and attaches decoded payload to request for use in handlers.
 *
 * Usage:
 * ```typescript
 * fastify.get('/protected', { onRequest: jwtAuthMiddleware }, async (request, reply) => {
 *   const userId = request.tokenPayload?.userId
 *   // ...
 * })
 * ```
 */
export async function jwtAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Get authorization header
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new AuthenticationError('Missing authorization header')
    }

    // Check Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      throw new AuthenticationError('Invalid authorization format. Use: Bearer <token>')
    }

    // Extract token
    const token = authHeader.substring(7) // Remove 'Bearer ' prefix

    if (!token || token.trim().length === 0) {
      throw new AuthenticationError('Missing JWT token')
    }

    // Verify JWT token using jwt.service
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      throw new AuthenticationError('Invalid or expired JWT token')
    }

    // Attach decoded payload to request for use in route handlers
    ;(request as any).tokenPayload = payload
    ;(request as any).userId = payload.userId

    // Log successful authentication
    request.log.info({
      userId: payload.userId,
      email: payload.email,
    }, 'JWT authentication successful')

  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.code(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Unexpected error
    request.log.error({ err: error }, 'JWT authentication error')
    return reply.code(500).send({
      success: false,
      error: 'Authentication failed',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Optional JWT authentication middleware
 *
 * Allows unauthenticated requests but validates JWT token if provided.
 * Attaches payload to request if token is valid.
 *
 * Usage:
 * ```typescript
 * fastify.get('/semi-protected', { onRequest: optionalJwtAuthMiddleware }, async (request, reply) => {
 *   const userId = request.tokenPayload?.userId // May be undefined
 *   // ...
 * })
 * ```
 */
export async function optionalJwtAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  // If no auth header, allow request without token
  if (!authHeader) {
    return
  }

  // If auth header exists, validate it
  try {
    // Check Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      request.log.warn('Invalid authorization format in optional auth')
      return // Silently skip invalid format
    }

    // Extract token
    const token = authHeader.substring(7)

    if (!token || token.trim().length === 0) {
      return // Silently skip empty token
    }

    // Verify JWT token
    const payload = await verifyToken(token)

    if (!payload || !payload.userId) {
      request.log.warn('Invalid or expired token in optional auth')
      return // Silently skip invalid token
    }

    // Attach decoded payload to request
    ;(request as any).tokenPayload = payload
    ;(request as any).userId = payload.userId

    request.log.debug({
      userId: payload.userId,
      email: payload.email,
    }, 'Optional JWT authentication successful')

  } catch (error) {
    // Silently log and continue for optional auth
    request.log.debug({ err: error }, 'Optional JWT validation failed')
  }
}

/**
 * Helper to get user ID from request
 *
 * Returns userId from JWT payload if authenticated, undefined otherwise.
 */
export function getUserId(request: FastifyRequest): string | undefined {
  return (request as any).userId
}

/**
 * Helper to get full token payload from request
 *
 * Returns full JWT payload if authenticated, undefined otherwise.
 */
export function getTokenPayload(request: FastifyRequest): TokenPayload | undefined {
  return (request as any).tokenPayload
}

/**
 * Helper to verify user owns a resource
 *
 * Throws AuthenticationError if user ID doesn't match
 */
export function requireResourceOwnership(userId: string | undefined, resourceOwnerId: string) {
  if (!userId) {
    throw new AuthenticationError('User not authenticated')
  }

  if (userId !== resourceOwnerId) {
    throw new AuthenticationError('User does not have access to this resource')
  }
}
