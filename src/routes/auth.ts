/**
 * Authentication Routes - Stub
 */

import { FastifyInstance } from 'fastify'

export async function authRoutes(fastify: FastifyInstance) {
  // Auth routes will be implemented here
  fastify.post('/auth/login', async (request, reply) => {
    reply.send({ message: 'Login endpoint' })
  })

  fastify.post('/auth/register', async (request, reply) => {
    reply.send({ message: 'Register endpoint' })
  })
}
