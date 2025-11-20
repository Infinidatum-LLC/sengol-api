/**
 * Request Timeout Middleware
 *
 * Ensures all requests complete within a reasonable timeframe
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { TimeoutError } from '../lib/errors'
import { config } from '../config/env'

export async function requestTimeoutMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const timeout = config.requestTimeout

  // Skip timeout for health checks
  if (request.url.startsWith('/health')) {
    return
  }

  const timer = setTimeout(() => {
    if (!reply.sent) {
      const error = new TimeoutError('request', timeout, {
        url: request.url,
        method: request.method,
      })

      reply.code(error.statusCode).send({
        error: error.message,
        code: error.code,
        metadata: error.metadata,
      })
    }
  }, timeout)

  // Clean up timer when request completes
  reply.raw.on('finish', () => {
    clearTimeout(timer)
  })
}
