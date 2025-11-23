/**
 * Cron Archive Articles Routes
 *
 * Handles automated archiving of old news articles
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { AuthenticationError } from '../lib/errors'

/**
 * Archive old articles
 *
 * GET /api/cron/archive-articles
 *
 * Archives news articles older than 90 days.
 * Requires CRON_SECRET for authentication.
 */
async function archiveArticles(request: FastifyRequest, reply: FastifyReply) {
  try {
    // Verify cron secret
    const authHeader = request.headers.authorization
    const cronSecret = process.env.CRON_SECRET

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return reply.status(401).send({
        success: false,
        error: 'Unauthorized',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Archive articles older than 90 days
    const archiveDate = new Date()
    archiveDate.setDate(archiveDate.getDate() - 90)

    const result = await query(
      `UPDATE "NewsArticle"
       SET "status" = 'archived', "updatedAt" = NOW()
       WHERE "status" = 'active' 
         AND "createdAt" < $1
       RETURNING "id"`,
      [archiveDate.toISOString()]
    )

    const archivedCount = result.rows.length

    request.log.info({ archivedCount }, 'Articles archived')

    return reply.status(200).send({
      success: true,
      message: `Archived ${archivedCount} articles`,
      archivedCount,
      archiveDate: archiveDate.toISOString(),
    })
  } catch (error) {
    request.log.error({ err: error }, 'Archive articles error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to archive articles',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register cron routes
 */
export async function cronArchiveArticlesRoutes(fastify: FastifyInstance) {
  fastify.get('/api/cron/archive-articles', archiveArticles)

  fastify.log.info('Cron archive articles routes registered')
}

