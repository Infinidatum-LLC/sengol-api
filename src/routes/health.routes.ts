import { FastifyInstance } from 'fastify'
import { prisma } from '../lib/prisma'
import { resilientDvecdbClient } from '../lib/dvecdb-resilient'
import { resilientOpenAIClient } from '../lib/openai-resilient'
import { vectorSearchCache, llmResponseCache } from '../lib/cache'
import { config } from '../config/env'

export async function healthRoutes(fastify: FastifyInstance) {
  // Basic health check - fast response
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.apiVersion,
    })
  })

  // Detailed health check with dependency checks
  fastify.get('/health/detailed', async (request, reply) => {
    const startTime = Date.now()
    const health: any = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.apiVersion,
      checks: {
        database: { status: 'unknown', responseTime: 0 },
        dvecdb: { status: 'unknown', responseTime: 0 },
        openai: { status: 'unknown' },
      },
      cache: {},
      circuitBreakers: {},
    }

    // Check database
    const dbStart = Date.now()
    try {
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 5000)
        ),
      ])
      health.checks.database = {
        status: 'ok',
        responseTime: Date.now() - dbStart,
      }
    } catch (error) {
      health.checks.database = {
        status: 'error',
        error: (error as Error).message,
        responseTime: Date.now() - dbStart,
      }
      health.status = 'degraded'
    }

    // Check d-vecDB with circuit breaker status
    const dvecdbStart = Date.now()
    try {
      const isHealthy = await resilientDvecdbClient.healthCheck()
      const dvecdbHealth = resilientDvecdbClient.getHealthStatus()

      health.checks.dvecdb = {
        status: isHealthy ? 'ok' : 'degraded',
        responseTime: Date.now() - dvecdbStart,
        healthy: dvecdbHealth.healthy,
        lastCheck: dvecdbHealth.lastCheck,
        circuitBreaker: dvecdbHealth.circuitBreaker,
      }

      if (!isHealthy) {
        health.status = 'degraded'
      }
    } catch (error) {
      health.checks.dvecdb = {
        status: 'error',
        error: (error as Error).message,
        responseTime: Date.now() - dvecdbStart,
      }
      health.status = 'degraded'
    }

    // OpenAI stats (no actual check to avoid API costs)
    health.checks.openai = {
      status: 'ok',
      stats: resilientOpenAIClient.getStats(),
    }

    // Cache statistics
    health.cache = {
      vectorSearch: vectorSearchCache.getStats(),
      llmResponse: llmResponseCache.getStats(),
    }

    // Circuit breaker states
    health.circuitBreakers = {
      dvecdb: resilientDvecdbClient.getStats(),
    }

    // Overall response time
    health.responseTime = Date.now() - startTime

    const statusCode = health.status === 'ok' ? 200 : 503
    return reply.code(statusCode).send(health)
  })

  // Readiness check for Kubernetes/orchestration
  fastify.get('/health/ready', async (request, reply) => {
    try {
      // Check critical dependencies only
      await Promise.race([
        prisma.$queryRaw`SELECT 1`,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 3000)
        ),
      ])

      const isHealthy = await resilientDvecdbClient.healthCheck()

      if (!isHealthy) {
        return reply.code(503).send({
          ready: false,
          reason: 'd-vecDB is not healthy',
        })
      }

      return reply.send({ ready: true })
    } catch (error) {
      return reply.code(503).send({
        ready: false,
        error: (error as Error).message,
      })
    }
  })

  // Liveness check for Kubernetes/orchestration
  fastify.get('/health/live', async (request, reply) => {
    // Simple check that the process is running
    return reply.send({
      alive: true,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    })
  })

  // Cache statistics endpoint
  fastify.get('/health/cache', async (request, reply) => {
    return reply.send({
      vectorSearch: vectorSearchCache.getStats(),
      llmResponse: llmResponseCache.getStats(),
    })
  })

  // Circuit breaker status endpoint
  fastify.get('/health/circuit-breakers', async (request, reply) => {
    return reply.send({
      dvecdb: resilientDvecdbClient.getStats(),
    })
  })
}
