import { FastifyInstance } from 'fastify'
import {
  createAssessmentController,
  getAssessmentController,
  updateAssessmentStep1Controller,
  updateAssessmentStep2Controller,
  updateAssessmentStep3Controller,
  submitAssessmentController,
  getAssessmentScoresController,
  getAssessmentBenchmarkController,
  getAssessmentSimilarCasesController,
} from '../controllers/assessments.controller'

export async function assessmentsRoutes(fastify: FastifyInstance) {
  // Assessment CRUD
  fastify.post('/api/assessments', createAssessmentController)
  fastify.get('/api/assessments/:id', getAssessmentController)

  // Assessment steps
  fastify.put('/api/assessments/:id/step1', updateAssessmentStep1Controller)
  fastify.put('/api/assessments/:id/step2', updateAssessmentStep2Controller)
  fastify.put('/api/assessments/:id/step3', updateAssessmentStep3Controller)

  // Assessment submission
  fastify.post('/api/assessments/:id/submit', submitAssessmentController)

  // Assessment data
  fastify.get('/api/assessments/:id/scores', getAssessmentScoresController)
  fastify.get('/api/assessments/:id/benchmark', getAssessmentBenchmarkController)
  fastify.get('/api/assessments/:id/similar-cases', getAssessmentSimilarCasesController)
}
