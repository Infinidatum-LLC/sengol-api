/**
 * Tool Usage Routes
 * 
 * Provides endpoints for tool usage statistics
 * Used by frontend for usage tracking and limit enforcement
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Get tool usage statistics grouped by usage type
 * GET /api/v1/tool-usage/stats?userId=...&toolSlug=...&startDate=...&endDate=...
 */
async function getToolUsageStats(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { userId, toolSlug, startDate, endDate } = request.query as {
      userId?: string
      toolSlug?: string
      startDate?: string
      endDate?: string
    }

    let queryText = `
      SELECT 
        "usageType",
        COUNT(*) as count
      FROM "ToolUsage"
      WHERE 1=1
    `
    const params: any[] = []
    let paramCount = 0

    if (userId) {
      paramCount++
      queryText += ` AND "userId" = $${paramCount}`
      params.push(userId)
    }

    if (toolSlug) {
      paramCount++
      queryText += ` AND "toolSlug" = $${paramCount}`
      params.push(toolSlug)
    }

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

    queryText += ` GROUP BY "usageType"`

    const result = await query(queryText, params)

    const stats = result.rows.map((row: any) => ({
      usageType: row.usageType,
      _count: parseInt(row.count, 10),
    }))

    return reply.status(200).send({
      success: true,
      data: {
        stats,
        total: stats.reduce((sum, s) => sum + s._count, 0),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get tool usage stats error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve tool usage stats',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register tool usage routes
 */
export async function toolUsageRoutes(fastify: FastifyInstance) {
  // Protected routes (requires auth)
  fastify.get('/api/v1/tool-usage/stats', { onRequest: jwtAuthMiddleware }, getToolUsageStats)

  fastify.log.info('Tool usage routes registered')
}

