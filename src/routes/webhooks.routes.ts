/**
 * Webhook Event Management Routes
 * 
 * Provides endpoints for managing Stripe webhook events
 * Used by frontend for webhook idempotency and retry logic
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Get existing webhook event by Stripe event ID
 * GET /api/v1/webhooks/events/:stripeEventId
 */
async function getWebhookEvent(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { stripeEventId } = request.params as { stripeEventId: string }

    if (!stripeEventId) {
      return reply.status(400).send({
        success: false,
        error: 'Stripe event ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `SELECT 
        "id", "stripeEventId", "eventType", "status", 
        "retryCount", "lastRetryAt", "nextRetryAt",
        "errorMessage", "errorContext", "createdAt", "updatedAt"
      FROM "WebhookEvent"
      WHERE "stripeEventId" = $1 LIMIT 1`,
      [stripeEventId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Webhook event not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const event = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: event.id,
        stripeEventId: event.stripeEventId,
        eventType: event.eventType,
        status: event.status,
        retryCount: event.retryCount,
        lastRetryAt: event.lastRetryAt ? new Date(event.lastRetryAt) : null,
        nextRetryAt: event.nextRetryAt ? new Date(event.nextRetryAt) : null,
        errorMessage: event.errorMessage,
        errorContext: event.errorContext,
        createdAt: new Date(event.createdAt),
        updatedAt: new Date(event.updatedAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get webhook event error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve webhook event',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Create webhook event record
 * POST /api/v1/webhooks/events
 */
async function createWebhookEvent(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as {
      stripeEventId: string
      eventType: string
      status?: string
    }

    if (!body.stripeEventId || !body.eventType) {
      return reply.status(400).send({
        success: false,
        error: 'Stripe event ID and event type are required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    // Check if already exists
    const existing = await query(
      `SELECT "id" FROM "WebhookEvent" WHERE "stripeEventId" = $1 LIMIT 1`,
      [body.stripeEventId]
    )

    if (existing.rows.length > 0) {
      return reply.status(200).send({
        success: true,
        data: {
          id: existing.rows[0].id,
          message: 'Event already exists',
        },
      })
    }

    const result = await query(
      `INSERT INTO "WebhookEvent" (
        "stripeEventId", "eventType", "status", "retryCount", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, 0, NOW(), NOW())
      RETURNING "id", "stripeEventId", "eventType", "status", "createdAt"`,
      [body.stripeEventId, body.eventType, body.status || 'PENDING']
    )

    return reply.status(201).send({
      success: true,
      data: {
        id: result.rows[0].id,
        stripeEventId: result.rows[0].stripeEventId,
        eventType: result.rows[0].eventType,
        status: result.rows[0].status,
        createdAt: new Date(result.rows[0].createdAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Create webhook event error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create webhook event',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Update webhook event status
 * PATCH /api/v1/webhooks/events/:id
 */
async function updateWebhookEvent(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const body = request.body as {
      status?: string
      errorMessage?: string
      errorContext?: string
      retryCount?: number
      lastRetryAt?: Date
      nextRetryAt?: Date
    }

    if (!id) {
      return reply.status(400).send({
        success: false,
        error: 'Webhook event ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const updates: string[] = []
    const params: any[] = []
    let paramCount = 0

    if (body.status !== undefined) {
      paramCount++
      updates.push(`"status" = $${paramCount}`)
      params.push(body.status)
    }

    if (body.errorMessage !== undefined) {
      paramCount++
      updates.push(`"errorMessage" = $${paramCount}`)
      params.push(body.errorMessage)
    }

    if (body.errorContext !== undefined) {
      paramCount++
      updates.push(`"errorContext" = $${paramCount}`)
      params.push(body.errorContext)
    }

    if (body.retryCount !== undefined) {
      paramCount++
      updates.push(`"retryCount" = $${paramCount}`)
      params.push(body.retryCount)
    }

    if (body.lastRetryAt !== undefined) {
      paramCount++
      updates.push(`"lastRetryAt" = $${paramCount}`)
      params.push(body.lastRetryAt)
    }

    if (body.nextRetryAt !== undefined) {
      paramCount++
      updates.push(`"nextRetryAt" = $${paramCount}`)
      params.push(body.nextRetryAt)
    }

    if (updates.length === 0) {
      return reply.status(400).send({
        success: false,
        error: 'No fields to update',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    paramCount++
    updates.push(`"updatedAt" = NOW()`)
    paramCount++
    params.push(id)

    const result = await query(
      `UPDATE "WebhookEvent" 
      SET ${updates.join(', ')}
      WHERE "id" = $${paramCount}
      RETURNING "id", "status", "retryCount", "updatedAt"`,
      params
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Webhook event not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: result.rows[0].id,
        status: result.rows[0].status,
        retryCount: result.rows[0].retryCount,
        updatedAt: new Date(result.rows[0].updatedAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Update webhook event error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to update webhook event',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get pending webhooks for retry
 * GET /api/v1/webhooks/events/pending
 */
async function getPendingWebhooks(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await query(
      `SELECT 
        "id", "stripeEventId", "eventType", "status", 
        "retryCount", "lastRetryAt", "nextRetryAt",
        "errorMessage", "errorContext", "createdAt", "updatedAt"
      FROM "WebhookEvent"
      WHERE "status" = 'PENDING'
        AND "nextRetryAt" IS NOT NULL
        AND "nextRetryAt" <= NOW()
      ORDER BY "nextRetryAt" ASC
      LIMIT 10`
    )

    const webhooks = result.rows.map((row: any) => ({
      id: row.id,
      stripeEventId: row.stripeEventId,
      eventType: row.eventType,
      status: row.status,
      retryCount: row.retryCount,
      lastRetryAt: row.lastRetryAt ? new Date(row.lastRetryAt) : null,
      nextRetryAt: row.nextRetryAt ? new Date(row.nextRetryAt) : null,
      errorMessage: row.errorMessage,
      errorContext: row.errorContext,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))

    return reply.status(200).send({
      success: true,
      data: {
        webhooks,
        total: webhooks.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get pending webhooks error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve pending webhooks',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get webhook statistics
 * GET /api/v1/webhooks/stats
 */
async function getWebhookStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const [pending, processing, completed, failed] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM "WebhookEvent" WHERE "status" = 'PENDING'`),
      query(`SELECT COUNT(*) as count FROM "WebhookEvent" WHERE "status" = 'PROCESSING'`),
      query(`SELECT COUNT(*) as count FROM "WebhookEvent" WHERE "status" = 'COMPLETED'`),
      query(`SELECT COUNT(*) as count FROM "WebhookEvent" WHERE "status" = 'FAILED'`),
    ])

    const stats = {
      pending: parseInt(pending.rows[0].count, 10),
      processing: parseInt(processing.rows[0].count, 10),
      completed: parseInt(completed.rows[0].count, 10),
      failed: parseInt(failed.rows[0].count, 10),
    }

    return reply.status(200).send({
      success: true,
      data: {
        ...stats,
        total: stats.pending + stats.processing + stats.completed + stats.failed,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get webhook stats error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve webhook stats',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register webhook routes
 */
export async function webhooksRoutes(fastify: FastifyInstance) {
  // Protected routes (requires auth)
  fastify.get('/api/v1/webhooks/events/:stripeEventId', { onRequest: jwtAuthMiddleware }, getWebhookEvent)
  fastify.post('/api/v1/webhooks/events', { onRequest: jwtAuthMiddleware }, createWebhookEvent)
  fastify.patch('/api/v1/webhooks/events/:id', { onRequest: jwtAuthMiddleware }, updateWebhookEvent)
  fastify.get('/api/v1/webhooks/events/pending', { onRequest: jwtAuthMiddleware }, getPendingWebhooks)
  fastify.get('/api/v1/webhooks/stats', { onRequest: jwtAuthMiddleware }, getWebhookStats)

  fastify.log.info('Webhook routes registered')
}

