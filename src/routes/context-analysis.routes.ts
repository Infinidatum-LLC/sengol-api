/**
 * Context Analysis Cache Routes
 * 
 * Provides endpoints for caching and retrieving context analysis results
 * Used by frontend for AI-powered project context analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Get cached context analysis
 * GET /api/v1/context-analysis/cache?descriptionHash=...
 */
async function getCachedAnalysis(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { descriptionHash } = request.query as { descriptionHash?: string }

    if (!descriptionHash) {
      return reply.status(400).send({
        success: false,
        error: 'Description hash is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    // Check for recent analysis (within 24 hours)
    const result = await query(
      `SELECT 
        "id", "descriptionHash", "projectDescription", "analysis", "createdAt"
      FROM "ContextAnalysisCache"
      WHERE "descriptionHash" = $1
        AND "createdAt" >= NOW() - INTERVAL '24 hours'
      ORDER BY "createdAt" DESC
      LIMIT 1`,
      [descriptionHash]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Cached analysis not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const cached = result.rows[0]

    return reply.status(200).send({
      success: true,
      data: {
        id: cached.id,
        descriptionHash: cached.descriptionHash,
        projectDescription: cached.projectDescription,
        analysis: typeof cached.analysis === 'string' 
          ? JSON.parse(cached.analysis) 
          : cached.analysis,
        createdAt: new Date(cached.createdAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get cached analysis error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve cached analysis',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Cache context analysis result
 * POST /api/v1/context-analysis/cache
 */
async function cacheAnalysis(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as {
      descriptionHash: string
      projectDescription: string
      analysis: Record<string, any>
    }

    if (!body.descriptionHash || !body.projectDescription || !body.analysis) {
      return reply.status(400).send({
        success: false,
        error: 'Description hash, project description, and analysis are required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `INSERT INTO "ContextAnalysisCache" (
        "descriptionHash", "projectDescription", "analysis", "createdAt"
      ) VALUES ($1, $2, $3, NOW())
      RETURNING "id", "descriptionHash", "createdAt"`,
      [
        body.descriptionHash,
        body.projectDescription,
        JSON.stringify(body.analysis),
      ]
    )

    return reply.status(201).send({
      success: true,
      data: {
        id: result.rows[0].id,
        descriptionHash: result.rows[0].descriptionHash,
        createdAt: new Date(result.rows[0].createdAt),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Cache analysis error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to cache analysis',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register context analysis routes
 */
export async function contextAnalysisRoutes(fastify: FastifyInstance) {
  // Protected routes (requires auth)
  fastify.get('/api/v1/context-analysis/cache', { onRequest: jwtAuthMiddleware }, getCachedAnalysis)
  fastify.post('/api/v1/context-analysis/cache', { onRequest: jwtAuthMiddleware }, cacheAnalysis)

  fastify.log.info('Context analysis routes registered')
}

