import { FastifyInstance } from 'fastify'

export async function reviewRoutes(fastify: FastifyInstance) {
  fastify.post('/api/review/:id/generate-questions', async (request, reply) => {
    // TODO: Implement question generation
    return reply.send({ message: 'Generate questions - to be implemented' })
  })
}
