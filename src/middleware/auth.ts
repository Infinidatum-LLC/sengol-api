/**
 * API Authentication Middleware
 *
 * Validates Bearer token for API access
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { config } from '../config/env'
import { AuthenticationError } from '../lib/errors'

/**
 * Authentication middleware that validates Bearer token
 */
export async function authMiddleware(request: FastifyRequest, reply: FastifyReply) {
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
      throw new AuthenticationError('Missing authentication token')
    }

    // Validate token against API_AUTH_TOKEN environment variable
    const validToken = process.env.API_AUTH_TOKEN

    if (!validToken) {
      request.log.error('API_AUTH_TOKEN not configured in environment')
      throw new AuthenticationError('Authentication not configured')
    }

    if (token !== validToken) {
      throw new AuthenticationError('Invalid authentication token')
    }

    // Token is valid, proceed to route handler
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
    request.log.error({ err: error }, 'Authentication error')
    return reply.code(500).send({
      success: false,
      error: 'Authentication failed',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Optional authentication middleware that allows unauthenticated requests
 * but validates token if provided
 */
export async function optionalAuthMiddleware(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization

  // If no auth header, allow request
  if (!authHeader) {
    return
  }

  // If auth header exists, validate it
  try {
    await authMiddleware(request, reply)
  } catch (error) {
    // Auth failed, but since it's optional, just log and continue
    request.log.warn({ err: error }, 'Optional auth validation failed')
  }
}
