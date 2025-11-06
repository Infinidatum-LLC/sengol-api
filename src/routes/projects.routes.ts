import { FastifyInstance } from 'fastify'
import { quickAssessmentController } from '../controllers/projects.controller'

export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.post('/api/projects/:projectId/quick-assessment', quickAssessmentController)
}
