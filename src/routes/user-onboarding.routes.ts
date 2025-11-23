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
    // Note: eulaAccepted, onboardingCompleted fields may not exist in schema
    // We'll check what columns exist and handle gracefully
    const result = await query(
      `SELECT 
        "id", "email", "emailVerified"
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

    // Try to fetch optional onboarding fields if they exist
    let eulaAccepted = false
    let onboardingCompleted = false
    let onboardingCompletedAt = null

    try {
      const onboardingResult = await query(
        `SELECT 
          COALESCE("eulaAccepted", false) as "eulaAccepted",
          COALESCE("onboardingCompleted", false) as "onboardingCompleted",
          "onboardingCompletedAt"
         FROM "User"
         WHERE "id" = $1 LIMIT 1`,
        [userId]
      )
      if (onboardingResult.rows.length > 0) {
        eulaAccepted = onboardingResult.rows[0].eulaAccepted || false
        onboardingCompleted = onboardingResult.rows[0].onboardingCompleted || false
        onboardingCompletedAt = onboardingResult.rows[0].onboardingCompletedAt || null
      }
    } catch (e) {
      // Columns don't exist, use defaults
      request.log.debug('Onboarding fields not found in User table, using defaults')
    }

    // Determine what's required
    const requiresEmailVerification = !user.emailVerified
    const requiresEulaAcceptance = !eulaAccepted

    request.log.info({ userId }, 'Onboarding status retrieved')

    return reply.status(200).send({
      success: true,
      emailVerified: !!user.emailVerified,
      eulaAccepted,
      onboardingCompleted,
      onboardingCompletedAt,
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
    // Build update query dynamically based on what columns exist
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    if (body.emailVerified !== undefined) {
      updateFields.push(`"emailVerified" = $${paramIndex}`)
      updateValues.push(body.emailVerified ? new Date().toISOString() : null)
      paramIndex++
    }

    // Always update updatedAt
    updateFields.push(`"updatedAt" = NOW()`)
    updateValues.push(userId)

    // Try to update optional fields if they exist
    let updateQuery = `
      UPDATE "User"
      SET ${updateFields.join(', ')}
      WHERE "id" = $${paramIndex}
    `

    await query(updateQuery, updateValues)

    // Try to update eulaAccepted if column exists
    if (body.eulaAccepted !== undefined) {
      try {
        await query(
          `UPDATE "User" SET "eulaAccepted" = $1 WHERE "id" = $2`,
          [body.eulaAccepted, userId]
        )
      } catch (e: any) {
        // Column may not exist, log and continue
        if (e.message && !e.message.includes('column "eulaAccepted" does not exist')) {
          throw e // Re-throw if it's a different error
        }
        request.log.debug('eulaAccepted column does not exist, skipping update')
      }
    }

    // Try to update onboarding fields if columns exist
    try {
      await query(
        `UPDATE "User" 
         SET "onboardingCompleted" = true, "onboardingCompletedAt" = NOW()
         WHERE "id" = $1`,
        [userId]
      )
    } catch (e: any) {
      // Columns may not exist, log and continue
      if (e.message && !e.message.includes('column "onboardingCompleted" does not exist')) {
        throw e // Re-throw if it's a different error
      }
      request.log.debug('onboardingCompleted columns do not exist, skipping update')
    }

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

