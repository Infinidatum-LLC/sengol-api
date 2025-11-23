/**
 * AI Risk Council - Status Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError } from '../lib/errors'

async function getCouncilStatus(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId
    const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const [policiesCount, vendorsCount, schedulesCount, violationsCount] = await Promise.all([
      query(
        `SELECT COUNT(*) as count FROM "Policy" 
         WHERE "geographyAccountId" = $1 AND "status" != 'ARCHIVED'`,
        [geographyAccountId]
      ),
      query(
        `SELECT COUNT(*) as count FROM "Vendor" 
         WHERE "geographyAccountId" = $1`,
        [geographyAccountId]
      ),
      query(
        `SELECT COUNT(*) as count FROM "AssessmentSchedule" 
         WHERE "geographyAccountId" = $1 AND "status" != 'COMPLETED'`,
        [geographyAccountId]
      ),
      query(
        `SELECT COUNT(*) as count FROM "PolicyViolation" 
         WHERE "geographyAccountId" = $1 AND "status" != 'resolved'`,
        [geographyAccountId]
      ),
    ])

    let hasAccess = false
    try {
      const accessResult = await query(
        `SELECT "id" FROM "ProductAccess" 
         WHERE "userId" = $1 
           AND "productSlug" IN ('ai-council-complete', 'ai-council')
           AND "status" = 'active'
           AND ("expiresAt" IS NULL OR "expiresAt" >= NOW())
         LIMIT 1`,
        [userId]
      )
      hasAccess = accessResult.rows.length > 0
    } catch (e: any) {
      if (e.message && e.message.includes('does not exist')) {
        request.log.debug('ProductAccess table does not exist')
      } else {
        throw e
      }
    }

    const status = {
      hasAccess,
      features: {
        policies: {
          count: parseInt(policiesCount.rows[0]?.count || '0', 10),
          limit: -1,
        },
        vendors: {
          count: parseInt(vendorsCount.rows[0]?.count || '0', 10),
          limit: -1,
        },
        schedules: {
          count: parseInt(schedulesCount.rows[0]?.count || '0', 10),
          limit: -1,
        },
        violations: {
          count: parseInt(violationsCount.rows[0]?.count || '0', 10),
          open: parseInt(violationsCount.rows[0]?.count || '0', 10),
        },
      },
    }

    return reply.status(200).send({
      success: true,
      data: status,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Get council status error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve council status',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

export async function councilStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/status', { onRequest: jwtAuthMiddleware }, getCouncilStatus)

  fastify.log.info('Council status routes registered')
}

