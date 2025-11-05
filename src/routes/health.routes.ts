import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { dvecdbClient } from '../lib/dvecdb'

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get('/health', async (request, reply) => {
    const health = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      checks: {
        database: 'unknown',
        dvecdb: 'unknown'
      }
    }

    // Check database
    try {
      await prisma.$queryRaw`SELECT 1`
      health.checks.database = 'ok'
    } catch (error) {
      health.checks.database = 'error'
      health.status = 'degraded'
    }

    // Check d-vecDB
    try {
      const isAlive = await dvecdbClient.ping()
      health.checks.dvecdb = isAlive ? 'ok' : 'error'
    } catch (error) {
      health.checks.dvecdb = 'error'
      health.status = 'degraded'
    }

    const statusCode = health.status === 'ok' ? 200 : 503
    return reply.code(statusCode).send(health)
  })
}
