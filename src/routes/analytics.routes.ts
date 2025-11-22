/**
 * Analytics Routes
 * 
 * Provides endpoints for pricing analytics event tracking
 * Used by frontend for conversion funnel analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Create pricing analytics event
 * POST /api/v1/analytics/pricing-events
 */
async function createPricingEvent(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as {
      userId?: string
      sessionId?: string
      eventType: string
      eventCategory: string
      assessmentType?: string
      currentTier?: string
      targetTier?: string
      subscriptionPlan?: string
      price?: number
      metadata?: Record<string, any>
      userAgent?: string
      referrer?: string
    }

    if (!body.eventType || !body.eventCategory) {
      return reply.status(400).send({
        success: false,
        error: 'Event type and category are required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `INSERT INTO "PricingAnalyticsEvent" (
        "userId", "sessionId", "eventType", "eventCategory", 
        "assessmentType", "currentTier", "targetTier", "subscriptionPlan",
        "price", "metadata", "userAgent", "referrer", "createdAt"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING "id", "eventType", "eventCategory", "createdAt"`,
      [
        body.userId || null,
        body.sessionId || null,
        body.eventType,
        body.eventCategory,
        body.assessmentType || null,
        body.currentTier || null,
        body.targetTier || null,
        body.subscriptionPlan || null,
        body.price || null,
        JSON.stringify(body.metadata || {}),
        body.userAgent || null,
        body.referrer || null,
      ]
    )

    return reply.status(201).send({
      success: true,
      data: {
        id: result.rows[0].id,
        eventType: result.rows[0].eventType,
        eventCategory: result.rows[0].eventCategory,
        createdAt: new Date(result.rows[0].createdAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Create pricing event error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create pricing event',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get pricing analytics events
 * GET /api/v1/analytics/pricing-events?startDate=...&endDate=...
 */
async function getPricingEvents(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { startDate, endDate, eventType } = request.query as {
      startDate?: string
      endDate?: string
      eventType?: string
    }

    let queryText = `
      SELECT 
        "id", "userId", "sessionId", "eventType", "eventCategory",
        "assessmentType", "currentTier", "targetTier", "subscriptionPlan",
        "price", "metadata", "userAgent", "referrer", "createdAt"
      FROM "PricingAnalyticsEvent"
      WHERE 1=1
    `
    const params: any[] = []
    let paramCount = 0

    if (startDate) {
      paramCount++
      queryText += ` AND "createdAt" >= $${paramCount}`
      params.push(startDate)
    }

    if (endDate) {
      paramCount++
      queryText += ` AND "createdAt" <= $${paramCount}`
      params.push(endDate)
    }

    if (eventType) {
      paramCount++
      queryText += ` AND "eventType" = $${paramCount}`
      params.push(eventType)
    }

    queryText += ` ORDER BY "createdAt" DESC LIMIT 1000`

    const result = await query(queryText, params)

    const events = result.rows.map((row: any) => ({
      id: row.id,
      userId: row.userId,
      sessionId: row.sessionId,
      eventType: row.eventType,
      eventCategory: row.eventCategory,
      assessmentType: row.assessmentType,
      currentTier: row.currentTier,
      targetTier: row.targetTier,
      subscriptionPlan: row.subscriptionPlan,
      price: row.price,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      userAgent: row.userAgent,
      referrer: row.referrer,
      createdAt: new Date(row.createdAt),
    }))

    return reply.status(200).send({
      success: true,
      data: {
        events,
        total: events.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get pricing events error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve pricing events',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get subscription events for tier distribution
 * GET /api/v1/analytics/subscription-events?startDate=...&endDate=...
 */
async function getSubscriptionEvents(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { startDate, endDate } = request.query as {
      startDate?: string
      endDate?: string
    }

    let queryText = `
      SELECT 
        "subscriptionPlan", "price"
      FROM "PricingAnalyticsEvent"
      WHERE "eventType" = 'subscription_created'
    `
    const params: any[] = []
    let paramCount = 0

    if (startDate) {
      paramCount++
      queryText += ` AND "createdAt" >= $${paramCount}`
      params.push(startDate)
    }

    if (endDate) {
      paramCount++
      queryText += ` AND "createdAt" <= $${paramCount}`
      params.push(endDate)
    }

    const result = await query(queryText, params)

    const subscriptions = result.rows.map((row: any) => ({
      subscriptionPlan: row.subscriptionPlan,
      price: row.price,
    }))

    return reply.status(200).send({
      success: true,
      data: {
        subscriptions,
        total: subscriptions.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get subscription events error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve subscription events',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register analytics routes
 */
export async function analyticsRoutes(fastify: FastifyInstance) {
  // Protected routes (requires auth)
  fastify.post('/api/v1/analytics/pricing-events', { onRequest: jwtAuthMiddleware }, createPricingEvent)
  fastify.get('/api/v1/analytics/pricing-events', { onRequest: jwtAuthMiddleware }, getPricingEvents)
  fastify.get('/api/v1/analytics/subscription-events', { onRequest: jwtAuthMiddleware }, getSubscriptionEvents)

  fastify.log.info('Analytics routes registered')
}

