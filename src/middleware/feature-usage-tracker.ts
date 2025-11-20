/**
 * Feature Usage Tracker Middleware
 *
 * Increments feature usage after successful request.
 * Used with reply hooks to track usage after handler completes.
 */

import { FastifyReply } from 'fastify'
import { incrementFeatureUsage } from '../lib/subscription-queries'
import { logger } from '../lib/logger'
import { invalidateUserCache } from '../lib/cache'
import { FeatureType } from '../config/trial'

/**
 * Factory to create usage tracker for a specific feature
 * Should be used as onResponse hook
 */
export function createUsageTracker(feature: FeatureType) {
  return async (reply: FastifyReply) => {
    try {
      // Only track on successful responses (2xx status)
      if (reply.statusCode >= 200 && reply.statusCode < 300) {
        const request = reply.request
        const userId = (request as any).user?.id

        if (userId) {
          // Increment feature usage
          await incrementFeatureUsage(userId, feature)

          // Invalidate cache to reflect new usage count
          invalidateUserCache(userId)

          // Get new usage for logging
          const usage = await (await import('../lib/subscription-queries')).getFeatureUsage(userId, feature)
          logger.logFeatureUsage(userId, feature, usage.used)
        }
      }
    } catch (error) {
      // Log error but don't fail the request (usage tracking is non-critical)
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Feature usage tracking failed: ${message}`,
        error instanceof Error ? error : undefined,
        { feature }
      )
    }
  }
}

/**
 * Middleware to check usage before operation
 * Stores feature in request so tracker can access it
 */
export function trackFeatureUsage(feature: FeatureType) {
  return async (reply: FastifyReply) => {
    // Store feature in reply context for tracker
    const req = reply.request
    (req as any).feature = feature
  }
}
