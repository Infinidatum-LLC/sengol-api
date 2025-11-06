/**
 * Vector Search API Routes
 *
 * Implements semantic search endpoints from VECTOR_SEARCH_API_SPECIFICATION.md
 */

import { FastifyInstance } from 'fastify'
import {
  vectorSearchController,
  vectorSearchHealthController,
} from '../controllers/vector-search.controller'
import { validateBody } from '../middleware/validation'
import { schemas } from '../middleware/validation'

export async function vectorSearchRoutes(fastify: FastifyInstance) {
  // POST /api/v1/vector-search - Semantic search across vector database
  fastify.post(
    '/api/v1/vector-search',
    {
      preHandler: validateBody(schemas.vectorSearch),
    },
    vectorSearchController
  )

  // GET /api/v1/vector-search/health - Health check for vector search components
  fastify.get('/api/v1/vector-search/health', vectorSearchHealthController)
}
