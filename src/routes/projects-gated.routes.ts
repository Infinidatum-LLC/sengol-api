import { FastifyInstance } from 'fastify'
import {
  listProjectsController,
  createProjectController,
  getProjectController,
  updateProjectController,
  deleteProjectController,
} from '../controllers/projects-gated.controller'

export async function projectsGatedRoutes(fastify: FastifyInstance) {
  // Spec-compliant routes (BACKEND_API_IMPLEMENTATION_CHECKLIST.md)
  fastify.get('/projects', listProjectsController)
  fastify.post('/projects', createProjectController)

  // Legacy routes (for backward compatibility)
  fastify.get('/projects-list', listProjectsController)
  fastify.post('/projects-create', createProjectController)
  fastify.get('/projects-get/:id', getProjectController)
  fastify.put('/projects-update/:id', updateProjectController)
  fastify.delete('/projects-delete/:id', deleteProjectController)
}
