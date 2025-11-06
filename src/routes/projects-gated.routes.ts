import { FastifyInstance } from 'fastify'
import {
  listProjectsController,
  createProjectController,
  getProjectController,
  updateProjectController,
  deleteProjectController,
} from '../controllers/projects-gated.controller'

export async function projectsGatedRoutes(fastify: FastifyInstance) {
  fastify.get('/api/projects-list', listProjectsController)
  fastify.post('/api/projects-create', createProjectController)
  fastify.get('/api/projects-get/:id', getProjectController)
  fastify.put('/api/projects-update/:id', updateProjectController)
  fastify.delete('/api/projects-delete/:id', deleteProjectController)
}
