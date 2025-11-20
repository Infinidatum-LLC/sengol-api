/**
 * Cache Invalidation Middleware
 *
 * Invalidates user cache after operations that change subscription/trial state.
 * Used with reply hooks to invalidate cache after handler completes.
 */

import { FastifyReply } from 'fastify'
import { invalidateUserCache } from '../lib/cache'
import { logger } from '../lib/logger'

/**
 * Invalidate user's cache after successful response
 * Should be used as onResponse hook
 */
export async function invalidateCacheOnSuccess(reply: FastifyReply) {
  try {
    // Only invalidate on successful responses (2xx status)
    if (reply.statusCode >= 200 && reply.statusCode < 300) {
      const request = reply.request
      const userId = (request as any).user?.id

      if (userId) {
        invalidateUserCache(userId)
        logger.logCacheOperation('invalidate', `user:${userId}`, false)
      }
    }
  } catch (error) {
    // Log error but don't fail the request (cache invalidation is non-critical)
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Cache invalidation failed: ${message}`,
      error instanceof Error ? error : undefined,
      { operation: 'invalidate' }
    )
  }
}

/**
 * Invalidate specific user's cache by ID
 */
export async function invalidateUserCacheById(userId: string) {
  try {
    invalidateUserCache(userId)
    logger.logCacheOperation('invalidate', `user:${userId}`, false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Cache invalidation failed: ${message}`,
      error instanceof Error ? error : undefined,
      { userId, operation: 'invalidate' }
    )
  }
}

/**
 * Invalidate cache for multiple users
 */
export async function invalidateUsersCacheByIds(userIds: string[]) {
  try {
    for (const userId of userIds) {
      invalidateUserCache(userId)
    }
    logger.logCacheOperation('invalidate', `users:${userIds.length}`, false)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Cache invalidation failed: ${message}`,
      error instanceof Error ? error : undefined,
      { count: userIds.length, operation: 'invalidate' }
    )
  }
}

/**
 * Get cache invalidation factory for specific operation types
 */
export function createCacheInvalidator(operationType: 'subscription' | 'trial' | 'usage') {
  return async (reply: FastifyReply) => {
    try {
      if (reply.statusCode >= 200 && reply.statusCode < 300) {
        const request = reply.request
        const userId = (request as any).user?.id

        if (userId) {
          invalidateUserCache(userId)
          logger.logCacheOperation(`invalidate-${operationType}`, `user:${userId}`, false)
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Cache invalidation (${operationType}) failed: ${message}`,
        error instanceof Error ? error : undefined,
        { operationType }
      )
    }
  }
}
