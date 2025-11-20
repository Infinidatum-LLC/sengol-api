/**
 * Trial Expiration Check Middleware
 *
 * Checks if user's trial has expired and marks it if needed.
 * Returns 403 if trial is expired.
 */

import { FastifyRequest, FastifyReply, HookHandlerDoneFunction } from 'fastify'
import { getTrialStatus, expireTrial } from '../lib/subscription-queries'
import { logger } from '../lib/logger'
import { invalidateUserCache } from '../lib/cache'

/**
 * Middleware to check and enforce trial expiration
 */
export async function checkTrialExpiration(
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

    const trialStatus = await getTrialStatus(userId)

    // If user is not on trial, allow request
    if (!trialStatus || !trialStatus.isActive) {
      done()
      return
    }

    // Check if trial is expired
    if (trialStatus.isExpired) {
      // Mark trial as expired if not already
      if (trialStatus.daysRemaining > 0) {
        await expireTrial(userId)
        invalidateUserCache(userId)
        logger.logTrialExpiration(userId, trialStatus.endsAt || new Date())
      }

      reply.code(403).send({
        code: 'TRIAL_EXPIRED',
        message: 'Your trial has expired. Please upgrade to continue.',
        expiredAt: trialStatus.endsAt,
      })
      return
    }

    // Store trial info in request for use in handlers
    (request as any).trialStatus = trialStatus

    done()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.error(`Trial expiration check failed: ${message}`,
      error instanceof Error ? error : undefined,
      { userId: (request as any).user?.id }
    )
    reply.code(500).send({
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    })
  }
}

/**
 * Get days remaining in trial from request
 */
export function getTrialDaysRemaining(request: FastifyRequest): number {
  return (request as any).trialStatus?.daysRemaining ?? 0
}
