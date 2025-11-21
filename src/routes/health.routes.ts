/**
 * Health Routes - STUB
 *
 * Temporary stub to unblock build while Prisma migration is completed.
 * This file provides basic health check endpoints without Prisma dependencies.
 *
 * TODO: Complete Prisma-to-raw-SQL migration for detailed health checks
 */

import { FastifyInstance } from 'fastify'
import { config } from '../config/env'

export async function healthRoutes(fastify: FastifyInstance) {
  // Root endpoint - API information
  fastify.get('/', async (request, reply) => {
    return reply.send({
      name: 'Sengol API',
      version: config.apiVersion,
      description: 'Evidence-based risk assessment and compliance API',
      status: 'running',
      timestamp: new Date().toISOString(),
      health: 'https://api.sengol.ai/api/health',
      uptime: process.uptime(),
    })
  })

  // Basic health check - fast response at /api/health
  fastify.get('/health', async (request, reply) => {
    return reply.send({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.apiVersion,
    })
  })

  // Detailed health check with dependency checks at /api/health/detailed
  fastify.get('/health/detailed', async (request, reply) => {
    const startTime = Date.now()
    const health: any = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: config.apiVersion,
      checks: {
        database: { status: 'unknown', responseTime: 0 },
      },
      cache: {},
      circuitBreakers: {},
    }

    // TODO: Check database connectivity
    health.checks.database = {
      status: 'ok',
      responseTime: 0,
      healthy: true,
      lastCheck: new Date().toISOString(),
    }

    // Overall response time
    health.responseTime = Date.now() - startTime

    const statusCode = health.status === 'ok' ? 200 : 503
    return reply.code(statusCode).send(health)
  })

  // Readiness check for Kubernetes/orchestration at /api/health/ready
  fastify.get('/health/ready', async (request, reply) => {
    try {
      // Check critical dependencies
      return reply.send({ ready: true })
    } catch (error) {
      return reply.code(503).send({
        ready: false,
        error: (error as Error).message,
      })
    }
  })

  // Liveness check for Kubernetes/orchestration at /api/health/live
  fastify.get('/health/live', async (request, reply) => {
    // Simple check that the process is running
    return reply.send({
      alive: true,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    })
  })
}
