/**
 * AI Risk Council - Status Routes
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { AuthenticationError } from '../lib/errors'
import {
  AuthenticatedRequest,
  GeographyRequest,
  getUserId,
  getGeographyAccountId,
} from '../types/request'
import {
  sendSuccess,
  sendUnauthorized,
  sendInternalError,
} from '../lib/response-helpers'

async function getCouncilStatus(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = getUserId(request as AuthenticatedRequest)
    const geographyAccountId = getGeographyAccountId(request as GeographyRequest)

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
    } catch (e: unknown) {
      const error = e as Error
      if (error.message && error.message.includes('does not exist')) {
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

    sendSuccess(reply, status)
  } catch (error) {
    if (error instanceof AuthenticationError) {
      sendUnauthorized(reply, error.message)
      return
    }

    request.log.error({ err: error }, 'Get council status error')
    sendInternalError(reply, 'Failed to retrieve council status', error)
  }
}

export async function councilStatusRoutes(fastify: FastifyInstance) {
  fastify.get('/api/council/status', { onRequest: jwtAuthMiddleware }, getCouncilStatus)

  fastify.log.info('Council status routes registered')
}
