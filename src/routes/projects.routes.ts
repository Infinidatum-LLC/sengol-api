import { FastifyInstance } from 'fastify'
import { quickAssessmentController } from '../controllers/projects.controller'

export async function projectsRoutes(fastify: FastifyInstance) {
  fastify.post('/projects/:projectId/quick-assessment', quickAssessmentController)
}
