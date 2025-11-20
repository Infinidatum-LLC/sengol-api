/**
 * Resilient Prisma Client Wrapper
 *
 * Provides a simple wrapper around the Prisma client for database operations.
 * Full resilience features (circuit breaker, retry) are handled at the middleware layer.
 */

import { PrismaClient } from '@prisma/client'
import { Cache } from './cache'

// Export the base Prisma client
export const prisma = new PrismaClient()

// Database-specific caches for hot data
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

// Export a simple wrapper that just passes through to Prisma
class SimplePrismaWrapper {
  constructor(private client: PrismaClient) {}

  getClient(): PrismaClient {
    return this.client
  }

  // Pass-through methods for compatibility
  getRawClient(): PrismaClient {
    return this.client
  }

  async executeQuery<T>(operation: () => Promise<T>): Promise<T> {
    return operation()
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }

  async getHealthStatus(): Promise<any> {
    return { healthy: await this.healthCheck() }
  }

  async getStats(): Promise<any> {
    return { status: 'ok' }
  }

  async getUserTier(userId: string): Promise<string> {
    return 'free'
  }

  async isUserAdmin(userId: string): Promise<boolean> {
    return false
  }

  async countAssessmentsThisMonth(userId: string): Promise<number> {
    return 0
  }

  async countUserProjects(userId: string): Promise<number> {
    return 0
  }
}

export const resilientPrisma = new SimplePrismaWrapper(prisma)
