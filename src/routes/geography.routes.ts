/**
 * Geography Account Routes
 * 
 * Provides endpoints for geography account management
 * Used by frontend for Stripe subscription management per geography
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Get geography account by ID
 * GET /api/v1/geography-accounts/:id
 */
async function getGeographyAccount(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const requestingUserId = (request as any).userId

    if (!id) {
      return reply.status(400).send({
        success: false,
        error: 'Geography account ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `SELECT 
        "id", "userId", "jurisdiction", "stripeCustomerId", 
        "stripeSubId", "billingStatus", "tier", 
        "currentPeriodEnd", "createdAt", "updatedAt"
      FROM "GeographyAccount"
      WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Geography account not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const geography = result.rows[0]

    // Check if user owns this geography account or is admin
    if (geography.userId !== requestingUserId) {
      const adminCheck = await query(
        `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
        [requestingUserId]
      )
      
      if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: Cannot access this geography account',
          code: 'FORBIDDEN',
          statusCode: 403,
        })
      }
    }

    return reply.status(200).send({
      success: true,
      data: {
        id: geography.id,
        userId: geography.userId,
        jurisdiction: geography.jurisdiction,
        stripeCustomerId: geography.stripeCustomerId,
        stripeSubId: geography.stripeSubId,
        billingStatus: geography.billingStatus,
        tier: geography.tier,
        currentPeriodEnd: geography.currentPeriodEnd ? new Date(geography.currentPeriodEnd) : null,
        createdAt: new Date(geography.createdAt),
        updatedAt: new Date(geography.updatedAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get geography account error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve geography account',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Update geography account
 * PATCH /api/v1/geography-accounts/:id
 */
async function updateGeographyAccount(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const body = request.body as {
      stripeCustomerId?: string
      stripeSubId?: string
      billingStatus?: string
      tier?: string
      currentPeriodEnd?: Date
    }
    const requestingUserId = (request as any).userId

    if (!id) {
      return reply.status(400).send({
        success: false,
        error: 'Geography account ID is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    // Verify ownership or admin
    const geographyCheck = await query(
      `SELECT "userId" FROM "GeographyAccount" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (geographyCheck.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Geography account not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    if (geographyCheck.rows[0].userId !== requestingUserId) {
      const adminCheck = await query(
        `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
        [requestingUserId]
      )
      
      if (adminCheck.rows.length === 0 || adminCheck.rows[0].role !== 'admin') {
        return reply.status(403).send({
          success: false,
          error: 'Forbidden: Cannot update this geography account',
          code: 'FORBIDDEN',
          statusCode: 403,
        })
      }
    }

    const updates: string[] = []
    const params: any[] = []
    let paramCount = 0

    if (body.stripeCustomerId !== undefined) {
      paramCount++
      updates.push(`"stripeCustomerId" = $${paramCount}`)
      params.push(body.stripeCustomerId)
    }

    if (body.stripeSubId !== undefined) {
      paramCount++
      updates.push(`"stripeSubId" = $${paramCount}`)
      params.push(body.stripeSubId)
    }

    if (body.billingStatus !== undefined) {
      paramCount++
      updates.push(`"billingStatus" = $${paramCount}`)
      params.push(body.billingStatus)
    }

    if (body.tier !== undefined) {
      paramCount++
      updates.push(`"tier" = $${paramCount}`)
      params.push(body.tier)
    }

    if (body.currentPeriodEnd !== undefined) {
      paramCount++
      updates.push(`"currentPeriodEnd" = $${paramCount}`)
      params.push(body.currentPeriodEnd)
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
      `UPDATE "GeographyAccount" 
      SET ${updates.join(', ')}
      WHERE "id" = $${paramCount}
      RETURNING "id", "stripeCustomerId", "stripeSubId", "billingStatus", "tier", "updatedAt"`,
      params
    )

    return reply.status(200).send({
      success: true,
      data: {
        id: result.rows[0].id,
        stripeCustomerId: result.rows[0].stripeCustomerId,
        stripeSubId: result.rows[0].stripeSubId,
        billingStatus: result.rows[0].billingStatus,
        tier: result.rows[0].tier,
        updatedAt: new Date(result.rows[0].updatedAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Update geography account error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to update geography account',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register geography routes
 */
export async function geographyRoutes(fastify: FastifyInstance) {
  // Protected routes (requires auth)
  fastify.get('/api/v1/geography-accounts/:id', { onRequest: jwtAuthMiddleware }, getGeographyAccount)
  fastify.patch('/api/v1/geography-accounts/:id', { onRequest: jwtAuthMiddleware }, updateGeographyAccount)

  fastify.log.info('Geography routes registered')
}

