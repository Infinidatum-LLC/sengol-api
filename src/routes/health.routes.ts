/**
 * Health Routes
 *
 * Provides health check endpoints for monitoring and orchestration.
 * Uses raw SQL queries for database connectivity checks.
 */

import { FastifyInstance } from 'fastify'
import { config } from '../config/env'
import { query } from '../lib/db'

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

    // Check database connectivity
    const dbStartTime = Date.now()
    try {
      await query('SELECT 1 as health_check')
      const dbResponseTime = Date.now() - dbStartTime
      health.checks.database = {
        status: 'ok',
        responseTime: dbResponseTime,
        healthy: true,
        lastCheck: new Date().toISOString(),
      }
    } catch (error) {
      const dbResponseTime = Date.now() - dbStartTime
      health.checks.database = {
        status: 'error',
        responseTime: dbResponseTime,
        healthy: false,
        lastCheck: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Database connection failed',
      }
      health.status = 'degraded'
    }

    // Overall response time
    health.responseTime = Date.now() - startTime

    const statusCode = health.status === 'ok' ? 200 : 503
    return reply.code(statusCode).send(health)
  })

  // Readiness check for Kubernetes/orchestration at /api/health/ready
  fastify.get('/health/ready', async (request, reply) => {
    try {
      // Check critical dependencies - database connectivity
      await query('SELECT 1 as health_check')
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
