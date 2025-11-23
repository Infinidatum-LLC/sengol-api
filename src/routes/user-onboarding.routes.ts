/**
 * User Onboarding Routes
 *
 * Handles user onboarding status and completion
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { ValidationError, AuthenticationError } from '../lib/errors'

/**
 * Get onboarding status
 *
 * GET /api/user/onboarding
 *
 * Returns the onboarding status for the authenticated user.
 */
async function getOnboardingStatus(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    // Fetch user onboarding status
    const result = await query(
      `SELECT 
        "id", "email", "emailVerified", 
        "eulaAccepted", "onboardingCompleted", "onboardingCompletedAt"
       FROM "User"
       WHERE "id" = $1 LIMIT 1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      })
    }

    const user = result.rows[0]

    // Determine what's required
    const requiresEmailVerification = !user.emailVerified
    const requiresEulaAcceptance = !(user.eulaAccepted || false)
    const onboardingCompleted = user.onboardingCompleted || false

    request.log.info({ userId }, 'Onboarding status retrieved')

    return reply.status(200).send({
      success: true,
      emailVerified: !!user.emailVerified,
      eulaAccepted: user.eulaAccepted || false,
      onboardingCompleted,
      onboardingCompletedAt: user.onboardingCompletedAt || null,
      requiresEmailVerification,
      requiresEulaAcceptance,
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Get onboarding status error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to retrieve onboarding status',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Complete onboarding
 *
 * POST /api/user/onboarding
 *
 * Marks onboarding as completed for the authenticated user.
 */
async function completeOnboarding(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const body = request.body as {
      eulaAccepted?: boolean
      emailVerified?: boolean
    }

    // Update user onboarding status
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    if (body.emailVerified !== undefined) {
      updateFields.push(`"emailVerified" = $${paramIndex}`)
      updateValues.push(body.emailVerified ? new Date().toISOString() : null)
      paramIndex++
    }

    if (body.eulaAccepted !== undefined) {
      updateFields.push(`"eulaAccepted" = $${paramIndex}`)
      updateValues.push(body.eulaAccepted)
      paramIndex++
    }

    // Always mark onboarding as completed when this endpoint is called
    updateFields.push(`"onboardingCompleted" = true`)
    updateFields.push(`"onboardingCompletedAt" = NOW()`)
    updateFields.push(`"updatedAt" = NOW()`)

    updateValues.push(userId)

    const updateQuery = `
      UPDATE "User"
      SET ${updateFields.join(', ')}
      WHERE "id" = $${paramIndex}
    `

    await query(updateQuery, updateValues)

    request.log.info({ userId }, 'Onboarding completed')

    return reply.status(200).send({
      success: true,
      onboardingCompleted: true,
      onboardingCompletedAt: new Date().toISOString(),
    })
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return reply.status(401).send({
        success: false,
        error: error.message,
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    request.log.error({ err: error }, 'Complete onboarding error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to complete onboarding',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register onboarding routes
 */
export async function userOnboardingRoutes(fastify: FastifyInstance) {
  fastify.get('/api/user/onboarding', { onRequest: jwtAuthMiddleware }, getOnboardingStatus)
  fastify.post('/api/user/onboarding', { onRequest: jwtAuthMiddleware }, completeOnboarding)

  fastify.log.info('User onboarding routes registered')
}

