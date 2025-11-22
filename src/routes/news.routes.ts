/**
 * News Management Routes
 * 
 * Provides endpoints for RSS news item management
 * Used by frontend for news feed operations
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query, transaction } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'

/**
 * Create or update news item
 * POST /api/v1/news
 * 
 * Creates a new news item or updates existing one by link
 */
async function createOrUpdateNews(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as {
      title: string
      description?: string
      content?: string
      author?: string
      link: string
      image?: string
      category?: string
      pubDate: Date
      source?: string
    }

    if (!body.title || !body.link) {
      return reply.status(400).send({
        success: false,
        error: 'Title and link are required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await transaction(async (client) => {
      // Check if news item exists
      const existing = await client.query(
        `SELECT "id" FROM "NewsItem" WHERE "link" = $1 LIMIT 1`,
        [body.link]
      )

      if (existing.rows.length > 0) {
        // Update existing
        const updateResult = await client.query(
          `UPDATE "NewsItem" SET
            "title" = $1,
            "description" = $2,
            "content" = $3,
            "author" = $4,
            "image" = $5,
            "category" = $6,
            "pubDate" = $7,
            "fetchedAt" = NOW(),
            "updatedAt" = NOW()
          WHERE "link" = $8
          RETURNING "id", "title", "link", "createdAt", "updatedAt"`,
          [
            body.title,
            body.description || null,
            body.content || null,
            body.author || null,
            body.image || null,
            body.category || 'general',
            body.pubDate,
            body.link,
          ]
        )
        return { ...updateResult.rows[0], action: 'updated' }
      } else {
        // Create new
        const createResult = await client.query(
          `INSERT INTO "NewsItem" (
            "title", "description", "content", "author", "link", 
            "image", "category", "pubDate", "source", "createdAt", "updatedAt"
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
          RETURNING "id", "title", "link", "createdAt", "updatedAt"`,
          [
            body.title,
            body.description || null,
            body.content || null,
            body.author || null,
            body.link,
            body.image || null,
            body.category || 'general',
            body.pubDate,
            body.source || 'sengol',
          ]
        )
        return { ...createResult.rows[0], action: 'created' }
      }
    })

    return reply.status(200).send({
      success: true,
      data: result,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Create/update news error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create/update news item',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get recent news items
 * GET /api/v1/news?limit=20&category=tech
 */
async function getRecentNews(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { limit = '20', category } = request.query as { limit?: string; category?: string }

    const limitNum = parseInt(limit, 10) || 20
    const limitClause = limitNum > 100 ? 100 : limitNum

    let queryText = `
      SELECT 
        "id", "title", "description", "content", "author", 
        "link", "image", "category", "pubDate", "source", 
        "createdAt", "updatedAt"
      FROM "NewsItem"
      WHERE 1=1
    `
    const params: any[] = []
    let paramCount = 0

    if (category) {
      paramCount++
      queryText += ` AND "category" = $${paramCount}`
      params.push(category)
    }

    queryText += ` ORDER BY "pubDate" DESC LIMIT $${paramCount + 1}`
    params.push(limitClause)

    const result = await query(queryText, params)

    const news = result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      author: row.author,
      link: row.link,
      image: row.image,
      category: row.category,
      pubDate: new Date(row.pubDate),
      source: row.source,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))

    return reply.status(200).send({
      success: true,
      data: {
        news,
        total: news.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get recent news error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve news',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get news by category
 * GET /api/v1/news/category/:category
 */
async function getNewsByCategory(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { category } = request.params as { category: string }

    if (!category) {
      return reply.status(400).send({
        success: false,
        error: 'Category is required',
        code: 'INVALID_INPUT',
        statusCode: 400,
      })
    }

    const result = await query(
      `SELECT 
        "id", "title", "description", "content", "author", 
        "link", "image", "category", "pubDate", "source", 
        "createdAt", "updatedAt"
      FROM "NewsItem"
      WHERE "category" = $1
      ORDER BY "pubDate" DESC
      LIMIT 50`,
      [category]
    )

    const news = result.rows.map((row: any) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      content: row.content,
      author: row.author,
      link: row.link,
      image: row.image,
      category: row.category,
      pubDate: new Date(row.pubDate),
      source: row.source,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }))

    return reply.status(200).send({
      success: true,
      data: {
        news,
        total: news.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get news by category error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve news by category',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get all unique news categories
 * GET /api/v1/news/categories
 */
async function getNewsCategories(request: FastifyRequest, reply: FastifyReply) {
  try {
    const result = await query(
      `SELECT DISTINCT "category"
      FROM "NewsItem"
      WHERE "category" IS NOT NULL AND "category" != ''
      ORDER BY "category" ASC`
    )

    const categories = result.rows.map((row: any) => row.category).filter(Boolean)

    return reply.status(200).send({
      success: true,
      data: {
        categories,
        total: categories.length,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get news categories error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve categories',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all news routes
 */
export async function newsRoutes(fastify: FastifyInstance) {
  // Public routes (no auth required for reading)
  fastify.get('/api/v1/news', getRecentNews)
  fastify.get('/api/v1/news/category/:category', getNewsByCategory)
  fastify.get('/api/v1/news/categories', getNewsCategories)
  
  // Protected route for creating/updating (requires auth)
  fastify.post('/api/v1/news', { onRequest: jwtAuthMiddleware }, createOrUpdateNews)

  fastify.log.info('News routes registered')
}

