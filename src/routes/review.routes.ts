import { FastifyInstance } from 'fastify'
import {
  analyzeSystemController,
  generateQuestionsController,
  saveQuestionsController,
  incidentAnalysisController,
} from '../controllers/review.controller'

export async function reviewRoutes(fastify: FastifyInstance) {
  fastify.post('/review/analyze-system', analyzeSystemController)
  fastify.post('/review/:id/generate-questions', generateQuestionsController)
  fastify.put('/review/:id/save-questions', saveQuestionsController)
  fastify.post('/review/:id/incident-analysis', incidentAnalysisController)
}
