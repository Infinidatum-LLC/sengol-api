import { FastifyInstance } from 'fastify'
import {
  generateEmbeddingController,
  searchEmbeddingsController,
  batchGenerateEmbeddingsController,
} from '../controllers/embeddings.controller'

export async function embeddingsRoutes(fastify: FastifyInstance) {
  fastify.post('/api/embeddings/generate', generateEmbeddingController)
  fastify.post('/api/embeddings/search', searchEmbeddingsController)
  fastify.post('/api/embeddings/batch-generate', batchGenerateEmbeddingsController)
}
