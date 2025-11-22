/**
 * Marketing Events Routes
 * 
 * Provides endpoints for tracking marketing events
 * Used by frontend for event tracking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Create marketing event
 * POST /api/v1/marketing/events
 */
async function createMarketingEvent(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as {
      event: string
      userId?: string
      email?: string
      properties?: Record<string, any>
      timestamp?: Date
    }

    if (!body.event) {
      return reply.status(400).send({
        success: false,
        error: 'Event name is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `INSERT INTO "MarketingEvent" (
        "event", "userId", "email", "properties", "timestamp", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING "id", "event", "userId", "email", "properties", "timestamp", "createdAt"`,
      [
        body.event,
        body.userId || null,
        body.email || null,
        JSON.stringify(body.properties || {}),
        body.timestamp ? new Date(body.timestamp).toISOString() : new Date().toISOString(),
      ]
    )

    return reply.status(201).send({
      success: true,
      data: {
        id: result.rows[0].id,
        event: result.rows[0].event,
        userId: result.rows[0].userId,
        email: result.rows[0].email,
        properties: typeof result.rows[0].properties === 'string' 
          ? JSON.parse(result.rows[0].properties) 
          : result.rows[0].properties,
        timestamp: new Date(result.rows[0].timestamp),
        createdAt: new Date(result.rows[0].createdAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Create marketing event error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create marketing event',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register marketing routes
 */
export async function marketingRoutes(fastify: FastifyInstance) {
  // Protected route (requires auth)
  fastify.post('/api/v1/marketing/events', { onRequest: jwtAuthMiddleware }, createMarketingEvent)

  fastify.log.info('Marketing routes registered')
}

