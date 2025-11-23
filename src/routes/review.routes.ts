import { FastifyInstance } from 'fastify'
import {
  analyzeSystemController,
  generateQuestionsController,
  saveQuestionsController,
  incidentAnalysisController,
} from '../controllers/review.controller'

export async function reviewRoutes(fastify: FastifyInstance) {
  fastify.post('/api/review/analyze-system', analyzeSystemController)
  fastify.post('/api/review/:id/generate-questions', generateQuestionsController)
  fastify.put('/api/review/:id/save-questions', saveQuestionsController)
  fastify.post('/api/review/:id/incident-analysis', incidentAnalysisController)
  
  fastify.log.info('Review routes registered')
}
