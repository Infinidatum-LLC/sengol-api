/**
 * Standalone Question Generation Routes
 */

import { FastifyInstance } from 'fastify'
import { generateQuestionsController } from '../controllers/questions.controller'

export async function questionsRoutes(fastify: FastifyInstance) {
  // POST /api/questions/generate - Generate dynamic questions without a review
  fastify.post('/api/questions/generate', generateQuestionsController)
}
