/**
 * AI Risk Council Routes
 * 
 * Provides endpoints for council feature counts (policies, vendors, schedules)
 * Used by frontend for license limit checking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Get product access for user
 * GET /api/v1/council/product-access?userId=...&productSlug=...
 */
async function getProductAccess(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId, productSlug } = request.query as {
      userId?: string
      productSlug?: string
    }

    if (!userId || !productSlug) {
      return reply.status(400).send({
        success: false,
        error: 'User ID and product slug are required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `SELECT 
        "id", "userId", "productSlug", "status", 
        "expiresAt", "grantedAt", "createdAt", "updatedAt"
      FROM "ProductAccess"
      WHERE "userId" = $1 
        AND "productSlug" IN ($2, 'ai-council-complete')
        AND "status" = 'active'
        AND ("expiresAt" IS NULL OR "expiresAt" >= NOW())
      ORDER BY "grantedAt" DESC
      LIMIT 1`,
      [userId, productSlug]
    )

    if (result.rows.length === 0) {
      return reply.status(200).send({
        success: true,
        data: {
          hasAccess: false,
        },
      })
    }

    const access = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        hasAccess: true,
        productSlug: access.productSlug,
        expiresAt: access.expiresAt ? new Date(access.expiresAt) : null,
        status: access.status,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get product access error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve product access',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get feature counts for geography account
 * GET /api/v1/council/counts?geographyAccountId=...&feature=...
 */
async function getFeatureCounts(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { geographyAccountId, feature } = request.query as {
      geographyAccountId?: string
      feature?: 'policies' | 'vendors' | 'schedules'
    }

    if (!geographyAccountId || !feature) {
      return reply.status(400).send({
        success: false,
        error: 'Geography account ID and feature are required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    let count = 0
    let queryText = ''

    if (feature === 'policies') {
      queryText = `
        SELECT COUNT(*) as count
        FROM "Policy"
        WHERE "geographyAccountId" = $1 AND "status" != 'ARCHIVED'
      `
    } else if (feature === 'vendors') {
      queryText = `
        SELECT COUNT(*) as count
        FROM "Vendor"
        WHERE "geographyAccountId" = $1
      `
    } else if (feature === 'schedules') {
      queryText = `
        SELECT COUNT(*) as count
        FROM "AssessmentSchedule"
        WHERE "geographyAccountId" = $1 AND "status" != 'COMPLETED'
      `
    } else {
      return reply.status(400).send({
        success: false,
        error: 'Invalid feature. Must be policies, vendors, or schedules',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(queryText, [geographyAccountId])
    count = parseInt(result.rows[0].count, 10)

    return reply.status(200).send({
      success: true,
      data: {
        feature,
        geographyAccountId,
        count,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get feature counts error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve feature counts',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register council routes
 */
export async function councilRoutes(fastify: FastifyInstance) {
  // Protected routes (requires auth)
  fastify.get('/api/v1/council/product-access', { onRequest: jwtAuthMiddleware }, getProductAccess)
  fastify.get('/api/v1/council/counts', { onRequest: jwtAuthMiddleware }, getFeatureCounts)

  fastify.log.info('Council routes registered')
}

