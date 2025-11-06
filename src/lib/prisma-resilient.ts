/**
 * Resilient Prisma Client Wrapper with:
 * - Circuit breaker pattern for database operations
 * - Retry logic with exponential backoff
 * - Connection health monitoring
 * - Transaction retry support
 * - Database-specific caching for hot data
 */

import { PrismaClient } from '@prisma/client'
import { CircuitBreaker } from './circuit-breaker'
import { withRetry } from './retry'
import { DatabaseError } from './errors'
import { Cache, generateCacheKey } from './cache'

// Database-specific cache for hot data (shorter TTL, frequently accessed)
export const userTierCache = new Cache<string>(
  500, // Max 500 entries
  5 * 60 * 1000 // 5 minute TTL
)

export const userAdminCache = new Cache<boolean>(
  500, // Max 500 entries
  10 * 60 * 1000 // 10 minute TTL
)

export const subscriptionCache = new Cache<any>(
  1000, // Max 1000 entries
  5 * 60 * 1000 // 5 minute TTL
)

class ResilientPrismaClient {
  private client: PrismaClient
  private circuitBreaker: CircuitBreaker
  private isHealthy: boolean = true
  private lastHealthCheck: number = 0
  private readonly healthCheckInterval = 30000 // 30 seconds
  private connectionAttempts = 0
  private successfulConnections = 0
  private failedConnections = 0

  constructor(client: PrismaClient) {
    this.client = client

    this.circuitBreaker = new CircuitBreaker('database', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 30000, // 30 seconds before retry
      monitoringPeriod: 60000, // 1 minute window
    })

    // Start periodic health checks
    this.startHealthMonitoring()
  }

  /**
   * Execute query with full resilience (retry + circuit breaker)
   */
  async executeQuery<T>(
    operation: () => Promise<T>,
    options: {
      operationName: string
      maxRetries?: number
      timeout?: number
      skipCircuitBreaker?: boolean
    }
  ): Promise<T> {
    const {
      operationName,
      maxRetries = 3,
      timeout = 10000,
      skipCircuitBreaker = false
    } = options

    try {
      // For health checks, skip circuit breaker
      if (skipCircuitBreaker) {
        return await withRetry(
          operation,
          {
            maxRetries,
            initialDelay: 500,
            maxDelay: 5000,
            timeout,
            retryableErrors: [
              'P1001', // Can't reach database server
              'P1002', // Database server timeout
              'P1008', // Operations timed out
              'P1017', // Server has closed the connection
              'P2024', // Timed out fetching a connection
            ],
            onRetry: (error, attempt) => {
              console.warn(
                `[Database] ${operationName} retry attempt ${attempt}/${maxRetries}`,
                { error: error.message }
              )
            },
          }
        )
      }

      // Normal operations go through circuit breaker
      return await this.circuitBreaker.execute(async () => {
        return await withRetry(
          operation,
          {
            maxRetries,
            initialDelay: 500,
            maxDelay: 5000,
            timeout,
            retryableErrors: [
              'P1001', // Can't reach database server
              'P1002', // Database server timeout
              'P1008', // Operations timed out
              'P1017', // Server has closed the connection
              'P2024', // Timed out fetching a connection
            ],
            onRetry: (error, attempt) => {
              console.warn(
                `[Database] ${operationName} retry attempt ${attempt}/${maxRetries}`,
                { error: error.message }
              )
            },
          }
        )
      })
    } catch (error) {
      this.failedConnections++
      this.isHealthy = false

      const wrappedError = new DatabaseError(
        `Database operation '${operationName}' failed: ${(error as Error).message}`,
        {
          operation: operationName,
          circuitBreakerState: this.circuitBreaker.getState(),
          errorCode: (error as any).code,
        }
      )

      console.error('[Database] Operation error:', wrappedError.toJSON())
      throw wrappedError
    }
  }

  /**
   * Execute transaction with retry support
   */
  async executeTransaction<T>(
    transaction: (tx: any) => Promise<T>,
    options: {
      operationName: string
      maxRetries?: number
      timeout?: number
    }
  ): Promise<T> {
    const { operationName, maxRetries = 2, timeout = 15000 } = options

    return await this.executeQuery(
      async () => {
        return await this.client.$transaction(transaction, {
          timeout,
          maxWait: timeout,
        })
      },
      {
        operationName: `transaction:${operationName}`,
        maxRetries,
        timeout,
      }
    )
  }

  /**
   * Get user tier with caching
   */
  async getUserTier(userId: string): Promise<string> {
    const cacheKey = generateCacheKey('user-tier', userId)

    // Check cache first
    const cached = userTierCache.get(cacheKey)
    if (cached !== undefined) {
      console.log('[Database Cache] User tier HIT:', userId)
      return cached
    }

    console.log('[Database Cache] User tier MISS:', userId)

    // Fetch from database
    const tier = await this.executeQuery(
      async () => {
        const subscription = await this.client.toolSubscription.findFirst({
          where: {
            userId,
            status: 'active',
          },
          orderBy: {
            createdAt: 'desc',
          },
          select: {
            planId: true,
          },
        })

        if (!subscription || !subscription.planId) {
          return 'free'
        }

        const planId = subscription.planId.toLowerCase()
        if (!['free', 'consultant', 'professional', 'enterprise'].includes(planId)) {
          console.warn(`Invalid plan ID: ${subscription.planId}, defaulting to free`)
          return 'free'
        }

        return planId
      },
      {
        operationName: 'getUserTier',
        maxRetries: 3,
        timeout: 5000,
      }
    )

    // Cache the result
    userTierCache.set(cacheKey, tier)

    return tier
  }

  /**
   * Check if user is admin with caching
   */
  async isUserAdmin(userId: string): Promise<boolean> {
    const cacheKey = generateCacheKey('user-admin', userId)

    // Check cache first
    const cached = userAdminCache.get(cacheKey)
    if (cached !== undefined) {
      console.log('[Database Cache] User admin status HIT:', userId)
      return cached
    }

    console.log('[Database Cache] User admin status MISS:', userId)

    // Fetch from database
    const isAdmin = await this.executeQuery(
      async () => {
        const user = await this.client.user.findUnique({
          where: { id: userId },
          select: { role: true },
        })

        return user?.role === 'admin'
      },
      {
        operationName: 'isUserAdmin',
        maxRetries: 3,
        timeout: 5000,
      }
    )

    // Cache the result
    userAdminCache.set(cacheKey, isAdmin)

    return isAdmin
  }

  /**
   * Count assessments this month with optional caching
   */
  async countAssessmentsThisMonth(userId: string, useCache: boolean = false): Promise<number> {
    const cacheKey = generateCacheKey('assessments-count', userId, new Date().getMonth())

    if (useCache) {
      const cached = subscriptionCache.get(cacheKey)
      if (cached !== undefined) {
        console.log('[Database Cache] Assessment count HIT:', userId)
        return cached
      }
    }

    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const count = await this.executeQuery(
      async () => {
        return await this.client.riskAssessment.count({
          where: {
            userId,
            createdAt: {
              gte: startOfMonth,
            },
          },
        })
      },
      {
        operationName: 'countAssessmentsThisMonth',
        maxRetries: 3,
        timeout: 5000,
      }
    )

    if (useCache) {
      // Short TTL for counts (1 minute)
      subscriptionCache.set(cacheKey, count, 60 * 1000)
    }

    return count
  }

  /**
   * Count user projects with optional caching
   */
  async countUserProjects(userId: string, useCache: boolean = false): Promise<number> {
    const cacheKey = generateCacheKey('projects-count', userId)

    if (useCache) {
      const cached = subscriptionCache.get(cacheKey)
      if (cached !== undefined) {
        console.log('[Database Cache] Project count HIT:', userId)
        return cached
      }
    }

    const count = await this.executeQuery(
      async () => {
        return await this.client.project.count({
          where: { userId },
        })
      },
      {
        operationName: 'countUserProjects',
        maxRetries: 3,
        timeout: 5000,
      }
    )

    if (useCache) {
      // Short TTL for counts (1 minute)
      subscriptionCache.set(cacheKey, count, 60 * 1000)
    }

    return count
  }

  /**
   * Invalidate user cache (call when subscription/role changes)
   */
  invalidateUserCache(userId: string): void {
    const tierKey = generateCacheKey('user-tier', userId)
    const adminKey = generateCacheKey('user-admin', userId)
    const assessmentKey = generateCacheKey('assessments-count', userId, new Date().getMonth())
    const projectKey = generateCacheKey('projects-count', userId)

    userTierCache.delete(tierKey)
    userAdminCache.delete(adminKey)
    subscriptionCache.delete(assessmentKey)
    subscriptionCache.delete(projectKey)

    console.log('[Database Cache] Invalidated cache for user:', userId)
  }

  /**
   * Get raw Prisma client (use with caution - bypasses resilience)
   */
  getRawClient(): PrismaClient {
    return this.client
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<boolean> {
    try {
      await this.executeQuery(
        async () => {
          // Simple query to test connectivity
          await this.client.$queryRaw`SELECT 1`
        },
        {
          operationName: 'health-check',
          maxRetries: 1,
          timeout: 5000,
          skipCircuitBreaker: true, // Don't let health check trip the breaker
        }
      )

      this.isHealthy = true
      this.lastHealthCheck = Date.now()
      this.successfulConnections++
      return true
    } catch (error) {
      this.isHealthy = false
      this.lastHealthCheck = Date.now()
      console.error('[Database] Health check failed:', (error as Error).message)
      return false
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const totalAttempts = this.successfulConnections + this.failedConnections
    const successRate = totalAttempts > 0
      ? ((this.successfulConnections / totalAttempts) * 100).toFixed(2) + '%'
      : 'N/A'

    return {
      healthy: this.isHealthy,
      lastCheck: new Date(this.lastHealthCheck).toISOString(),
      circuitBreaker: this.circuitBreaker.getStats(),
      connections: {
        successful: this.successfulConnections,
        failed: this.failedConnections,
        total: totalAttempts,
        successRate,
      },
      cache: {
        userTier: userTierCache.getStats(),
        userAdmin: userAdminCache.getStats(),
        subscription: subscriptionCache.getStats(),
      },
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring() {
    setInterval(async () => {
      await this.healthCheck()
    }, this.healthCheckInterval)
  }

  /**
   * Reset circuit breaker (for manual intervention)
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset()
    console.log('[Database] Circuit breaker manually reset')
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      circuitBreaker: this.circuitBreaker.getStats(),
      health: {
        isHealthy: this.isHealthy,
        lastHealthCheck: new Date(this.lastHealthCheck).toISOString(),
      },
      connections: {
        successful: this.successfulConnections,
        failed: this.failedConnections,
        total: this.successfulConnections + this.failedConnections,
      },
      cache: {
        userTier: userTierCache.getStats(),
        userAdmin: userAdminCache.getStats(),
        subscription: subscriptionCache.getStats(),
      },
    }
  }
}

// Import the existing prisma client
import { prisma as rawPrismaClient } from './prisma'

// Create and export singleton resilient instance
export const resilientPrisma = new ResilientPrismaClient(rawPrismaClient)

// Export the class for testing
export { ResilientPrismaClient }

// Export the raw client for backward compatibility (but prefer resilient version)
export { rawPrismaClient as prisma }
