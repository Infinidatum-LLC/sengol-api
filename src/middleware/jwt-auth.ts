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
    const userIdHeader = request.headers['x-user-id'] as string | undefined
    const apiAuthToken = process.env.API_AUTH_TOKEN

    // Debug logging
    request.log.debug({
      hasAuthHeader: !!authHeader,
      authHeaderPrefix: authHeader?.substring(0, 20),
      hasUserIdHeader: !!userIdHeader,
      userIdHeaderValue: userIdHeader?.substring(0, 20),
      hasApiAuthToken: !!apiAuthToken,
      apiAuthTokenPrefix: apiAuthToken?.substring(0, 10),
    }, 'JWT auth middleware - incoming request')

    // Support two authentication methods:
    // 1. API_AUTH_TOKEN + x-user-id header (internal API calls from Next.js) - CHECK FIRST
    // 2. JWT token in Authorization header (user authentication)

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim() // Remove 'Bearer ' prefix

      if (!token || token.length === 0) {
        throw new AuthenticationError('Missing authorization token')
      }

      // Method 1: Check if token matches API_AUTH_TOKEN (for internal API calls)
      if (apiAuthToken && userIdHeader) {
        // Trim both tokens for comparison (in case of whitespace issues)
        const trimmedToken = token.trim()
        const trimmedApiToken = apiAuthToken.trim()
        const tokenMatches = trimmedToken === trimmedApiToken
        
        request.log.info({
          tokenMatches,
          tokenLength: trimmedToken.length,
          apiTokenLength: trimmedApiToken.length,
          tokenPrefix: trimmedToken.substring(0, 10),
          apiTokenPrefix: trimmedApiToken.substring(0, 10),
          hasUserIdHeader: !!userIdHeader,
        }, 'API token comparison')
        
        if (tokenMatches) {
          // Validate userId header is present
          if (!userIdHeader || userIdHeader.trim().length === 0) {
            throw new AuthenticationError('Missing x-user-id header for API authentication')
          }

          // Attach userId from header to request
          ;(request as any).userId = userIdHeader
          ;(request as any).tokenPayload = {
            userId: userIdHeader,
            email: request.headers['x-user-email'] as string | undefined,
          }

          // Log successful API authentication
          request.log.info({
            userId: userIdHeader,
            email: request.headers['x-user-email'],
            authMethod: 'API_TOKEN',
          }, 'API token authentication successful')

          return // Successfully authenticated
        }
      }

      // Method 2: Try JWT token authentication (for user tokens)
      try {
        const payload = await verifyToken(token)

        if (payload && payload.userId) {
          // Attach decoded payload to request for use in route handlers
          ;(request as any).tokenPayload = payload
          ;(request as any).userId = payload.userId

          // Log successful authentication
          request.log.info({
            userId: payload.userId,
            email: payload.email,
          }, 'JWT authentication successful')

          return // Successfully authenticated
        }
      } catch (jwtError) {
        // JWT verification failed, but this is expected if it's not a JWT token
        // Continue to check other authentication methods
        request.log.debug({ err: jwtError }, 'JWT verification failed, trying other methods')
      }
    }

    // No valid authentication method found
    request.log.warn({
      hasAuthHeader: !!authHeader,
      hasUserIdHeader: !!userIdHeader,
      hasApiAuthToken: !!apiAuthToken,
      authHeaderType: authHeader ? (authHeader.startsWith('Bearer ') ? 'Bearer' : 'other') : 'none',
    }, 'No valid authentication method found')
    
    throw new AuthenticationError('Missing or invalid authorization. Provide JWT token or API token with x-user-id header')

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
