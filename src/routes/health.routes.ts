import { FastifyInstance } from 'fastify'
import { resilientPrisma, userTierCache as dbUserTierCache, userAdminCache as dbUserAdminCache, subscriptionCache as dbSubscriptionCache } from '../lib/prisma-resilient'
import { resilientDvecdbClient } from '../lib/dvecdb-resilient'
import { resilientOpenAIClient } from '../lib/openai-resilient'
import { vectorSearchCache, llmResponseCache } from '../lib/cache'
import { config } from '../config/env'

// Week 2 Optimization imports
import { getLocalCacheMetrics, getLocalCacheMemoryUsage } from '../lib/local-cache'
import { getCacheMetrics as getRedisMetrics, checkRedisHealth } from '../lib/redis-cache'
import { requestDeduplicator } from '../lib/request-deduplicator'

// Get raw Prisma client for direct queries
const prisma = resilientPrisma.getRawClient()

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

    // Check database with circuit breaker status
    const dbStart = Date.now()
    try {
      const isHealthy = await resilientPrisma.healthCheck()
      const dbHealth = resilientPrisma.getHealthStatus()

      health.checks.database = {
        status: isHealthy ? 'ok' : 'degraded',
        responseTime: Date.now() - dbStart,
        healthy: dbHealth.healthy,
        lastCheck: dbHealth.lastCheck,
        circuitBreaker: dbHealth.circuitBreaker,
        connections: dbHealth.connections,
        cache: dbHealth.cache,
      }

      if (!isHealthy) {
        health.status = 'degraded'
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

    // Cache statistics (including database caches)
    health.cache = {
      vectorSearch: vectorSearchCache.getStats(),
      llmResponse: llmResponseCache.getStats(),
      database: {
        userTier: dbUserTierCache.getStats(),
        userAdmin: dbUserAdminCache.getStats(),
        subscription: dbSubscriptionCache.getStats(),
      },
    }

    // Circuit breaker states
    health.circuitBreakers = {
      database: resilientPrisma.getStats(),
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
      const dbHealthy = await resilientPrisma.healthCheck()
      const dvecdbHealthy = await resilientDvecdbClient.healthCheck()

      if (!dbHealthy) {
        return reply.code(503).send({
          ready: false,
          reason: 'Database is not healthy',
        })
      }

      if (!dvecdbHealthy) {
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
      database: {
        userTier: dbUserTierCache.getStats(),
        userAdmin: dbUserAdminCache.getStats(),
        subscription: dbSubscriptionCache.getStats(),
      },
    })
  })

  // Circuit breaker status endpoint
  fastify.get('/health/circuit-breakers', async (request, reply) => {
    return reply.send({
      database: resilientPrisma.getStats(),
      dvecdb: resilientDvecdbClient.getStats(),
    })
  })

  // ========================================================================
  // WEEK 2 OPTIMIZATION ENDPOINTS
  // ========================================================================

  /**
   * GET /health/optimizations - Complete optimization metrics
   */
  fastify.get('/health/optimizations', async (request, reply) => {
    // Redis health check
    const redisHealth = await checkRedisHealth()

    return reply.send({
      timestamp: new Date().toISOString(),

      // L1: Local Memory Cache
      localCache: {
        ...getLocalCacheMetrics(),
        memory: getLocalCacheMemoryUsage(),
      },

      // L2: Redis Cache
      redisCache: {
        health: redisHealth,
        metrics: getRedisMetrics(),
      },

      // Request Deduplication
      deduplication: requestDeduplicator.getMetrics(),

      // Overall Performance
      performance: {
        cacheHierarchy: '3-tier (Local → Redis → d-vecDB)',
        expectedLatency: {
          l1Hit: '1-5ms',
          l2Hit: '20-50ms',
          l3Miss: '100-5000ms',
        },
      },
    })
  })

  /**
   * GET /health/cache/local - Local memory cache details
   */
  fastify.get('/health/cache/local', async (request, reply) => {
    return reply.send({
      metrics: getLocalCacheMetrics(),
      memory: getLocalCacheMemoryUsage(),
      timestamp: new Date().toISOString(),
    })
  })

  /**
   * GET /health/cache/redis - Redis cache details
   */
  fastify.get('/health/cache/redis', async (request, reply) => {
    const health = await checkRedisHealth()
    const metrics = getRedisMetrics()

    return reply.send({
      health,
      metrics,
      timestamp: new Date().toISOString(),
    })
  })

  /**
   * GET /health/deduplication - Request deduplication stats
   */
  fastify.get('/health/deduplication', async (request, reply) => {
    const metrics = requestDeduplicator.getMetrics()
    const activeKeys = requestDeduplicator.getActiveKeys()

    return reply.send({
      metrics,
      activeRequests: activeKeys.length,
      activeKeys: activeKeys.map(key => key.substring(0, 50) + '...'),
      timestamp: new Date().toISOString(),
    })
  })

  /**
   * GET /health/performance - Overall performance metrics
   */
  fastify.get('/health/performance', async (request, reply) => {
    const localCacheMetrics = getLocalCacheMetrics()
    const redisMetrics = getRedisMetrics()
    const dedupMetrics = requestDeduplicator.getMetrics()

    // Calculate overall cache hit rate
    const totalLocalOps = Object.values(localCacheMetrics).reduce(
      (sum: number, cache: any) => sum + (cache.hits || 0) + (cache.misses || 0),
      0
    )
    const totalLocalHits = Object.values(localCacheMetrics).reduce(
      (sum: number, cache: any) => sum + (cache.hits || 0),
      0
    )
    const localHitRate = totalLocalOps > 0
      ? ((totalLocalHits / totalLocalOps) * 100).toFixed(2) + '%'
      : '0%'

    const redisHitRate = redisMetrics.hitRate || '0%'

    return reply.send({
      cachePerformance: {
        local: {
          hitRate: localHitRate,
          avgLatency: '1-5ms',
          operations: totalLocalOps,
        },
        redis: {
          hitRate: redisHitRate,
          avgLatency: redisMetrics.avgLatency || '0ms',
          operations: redisMetrics.operations || 0,
        },
      },
      deduplication: {
        dedupRate: dedupMetrics.dedupRate,
        savedRequests: dedupMetrics.savedRequests,
        estimatedTimeSaved: dedupMetrics.estimatedTimeSaved,
      },
      estimatedImprovement: {
        vs_baseline: '50-70% faster',
        throughput: '3-5x improvement',
      },
      timestamp: new Date().toISOString(),
    })
  })
}
