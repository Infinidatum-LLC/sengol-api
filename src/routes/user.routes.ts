import { FastifyInstance } from 'fastify'
import { getUserUsageController } from '../controllers/user.controller'

export async function userRoutes(fastify: FastifyInstance) {
  fastify.get('/api/user/usage', getUserUsageController)
}
