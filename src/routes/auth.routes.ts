import { FastifyInstance } from 'fastify'

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post('/api/auth/login', async (request, reply) => {
    // TODO: Implement login
    return reply.send({ message: 'Login endpoint - to be implemented' })
  })

  fastify.post('/api/auth/register', async (request, reply) => {
    // TODO: Implement registration
    return reply.send({ message: 'Register endpoint - to be implemented' })
  })
}
