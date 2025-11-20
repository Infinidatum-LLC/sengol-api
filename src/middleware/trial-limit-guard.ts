/**
 * Trial Limit Guard Middleware
 *
 * Checks if user has reached their feature limit before allowing operation.
 * Returns 429 (Too Many Requests) if limit exceeded.
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
import { hasReachedTrialLimit, getUserSubscription } from '../lib/subscription-queries'
import { logger } from '../lib/logger'
import { FeatureType } from '../config/trial'

/**
 * Factory function to create trial limit guard for a specific feature
 */
export function createTrialLimitGuard(feature: FeatureType) {
  return async (
    request: FastifyRequest,
    reply: FastifyReply,
    done: HookHandlerDoneFunction
  ) => {
    try {
      // Get user ID from request (set by auth middleware)
      const userId = (request as any).user?.id
      if (!userId) {
        reply.code(401).send({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        })
        return
      }

      // Get user's subscription tier
      const { tier, status } = await getUserSubscription(userId)

      // Check if user has reached trial limit
      const hasLimit = await hasReachedTrialLimit(userId, feature)

      if (hasLimit) {
        logger.logTrialLimitViolation(userId, feature, 0, 0)
        reply.code(429).send({
          code: 'TRIAL_LIMIT_EXCEEDED',
          message: 'Feature not available for your tier',
          tier,
        })
        return
      }

      // Store tier and feature in request for later use
      (request as any).tier = tier
      (request as any).feature = feature
      done()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error(`Trial limit guard failed: ${message}`,
        error instanceof Error ? error : undefined,
        { feature, userId: (request as any).user?.id }
      )
      reply.code(500).send({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      })
    }
  }
}

/**
 * Middleware to check if user is on trial
 */
export async function isOnTrial(
  request: FastifyRequest,
  reply: FastifyReply,
  done: HookHandlerDoneFunction
) {
  try {
    const userId = (request as any).user?.id
    if (!userId) {
      reply.code(401).send({
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      })
      return
    }

    const { tier } = await getUserSubscription(userId)
    if (tier !== 'trial') {
      reply.code(403).send({
        code: 'NOT_ON_TRIAL',
        message: 'This feature is only available during trial',
      })
      return
    }

    done()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Trial check failed: ${message}`,
      error instanceof Error ? error : undefined,
      { userId: (request as any).user?.id }
    )
    reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    })
  }
}
