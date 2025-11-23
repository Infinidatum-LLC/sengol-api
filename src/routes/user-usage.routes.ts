/**
 * User Usage Routes
 *
 * Handles user usage statistics and tracking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'

/**
 * Get user usage statistics
 *
 * GET /api/user/usage
 *
 * Returns usage statistics for the authenticated user.
 */
async function getUserUsage(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Get userId from query params if provided (for admin access)
    const queryParams = request.query as { userId?: string }
    const targetUserId = queryParams.userId || userId

    // Verify user exists
    const userResult = await query(
      `SELECT "id" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [targetUserId]
    )

    if (userResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      })
    }

    // Get usage statistics
    const [projectsCount, assessmentsCount, calculationsCount, frameworksCount] = await Promise.all([
      // Projects count
      query(`SELECT COUNT(*) as count FROM "Project" WHERE "userId" = $1`, [targetUserId]),
      // Assessments count
      query(`SELECT COUNT(*) as count FROM "RiskAssessment" WHERE "userId" = $1`, [targetUserId]),
      // Calculations count
      query(`SELECT COUNT(*) as count FROM "Calculation" WHERE "userId" = $1`, [targetUserId]),
      // Frameworks count
      query(`SELECT COUNT(*) as count FROM "FrameworkAnalysis" WHERE "userId" = $1`, [targetUserId]),
    ])

    // Get recent activity (last 30 days)
    const recentActivityResult = await query(
      `SELECT 
        COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '30 days') as last30Days,
        COUNT(*) FILTER (WHERE "createdAt" >= NOW() - INTERVAL '7 days') as last7Days
      FROM "RiskAssessment"
      WHERE "userId" = $1`,
      [targetUserId]
    )

    const usage = {
      projects: parseInt(projectsCount.rows[0]?.count || '0', 10),
      assessments: parseInt(assessmentsCount.rows[0]?.count || '0', 10),
      calculations: parseInt(calculationsCount.rows[0]?.count || '0', 10),
      frameworks: parseInt(frameworksCount.rows[0]?.count || '0', 10),
      activity: {
        last30Days: parseInt(recentActivityResult.rows[0]?.last30Days || '0', 10),
        last7Days: parseInt(recentActivityResult.rows[0]?.last7Days || '0', 10),
      },
    }

    request.log.info({ userId: targetUserId }, 'User usage retrieved')

    return reply.status(200).send({
      success: true,
      data: usage,
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

    request.log.error({ err: error }, 'Get user usage error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve user usage',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register user usage routes
 */
export async function userUsageRoutes(fastify: FastifyInstance) {
  fastify.get('/api/user/usage', { onRequest: jwtAuthMiddleware }, getUserUsage)

  fastify.log.info('User usage routes registered')
}

