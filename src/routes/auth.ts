/**
 * Authentication Routes - Stub
 */

import { FastifyInstance } from 'fastify'

export async function authRoutes(fastify: FastifyInstance) {
  // Auth routes will be implemented here
  fastify.post('/api/auth/login', async (request, reply) => {
    reply.send({ message: 'Login endpoint' })
  })

  fastify.post('/api/auth/register', async (request, reply) => {
    reply.send({ message: 'Register endpoint' })
  })
}
