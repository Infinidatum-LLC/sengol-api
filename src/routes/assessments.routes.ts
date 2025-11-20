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
import {
  generateQuestionsController,
  saveQuestionsController,
} from '../controllers/review.controller'

export async function assessmentsRoutes(fastify: FastifyInstance) {
  // Assessment CRUD
  fastify.post('/assessments', createAssessmentController)
  fastify.get('/assessments/:id', getAssessmentController)

  // Assessment steps
  fastify.put('/assessments/:id/step1', updateAssessmentStep1Controller)
  fastify.put('/assessments/:id/step2', updateAssessmentStep2Controller)
  fastify.put('/assessments/:id/step3', updateAssessmentStep3Controller)

  // Question generation and saving
  fastify.post('/assessments/:id/generate-questions', generateQuestionsController)
  fastify.put('/assessments/:id/save-questions', saveQuestionsController)

  // Assessment submission
  fastify.post('/assessments/:id/submit', submitAssessmentController)

  // Assessment data
  fastify.get('/assessments/:id/scores', getAssessmentScoresController)
  fastify.get('/assessments/:id/benchmark', getAssessmentBenchmarkController)
  fastify.get('/assessments/:id/similar-cases', getAssessmentSimilarCasesController)
}
