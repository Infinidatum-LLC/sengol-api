/**
 * Request Logging Middleware
 *
 * Structured logging for all incoming requests
 */

import { FastifyRequest, FastifyReply } from 'fastify'

export async function requestLoggingMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const start = Date.now()

  // Log request
  request.log.info({
    type: 'request',
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  })

  // Log response when complete
  reply.raw.on('finish', () => {
    const duration = Date.now() - start

    request.log.info({
      type: 'response',
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration,
    })

    // Warn on slow requests
    if (duration > 5000) {
      request.log.warn({
        type: 'slow_request',
        method: request.method,
        url: request.url,
        duration,
        message: `Request took ${duration}ms`,
      })
    }
  })
}
