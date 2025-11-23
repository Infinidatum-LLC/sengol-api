/**
 * User Change Password Routes
 *
 * Handles password changes for authenticated users
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { jwtAuthMiddleware } from '../middleware/jwt-auth'
import { hashPassword, verifyPassword, validatePasswordStrength } from '../lib/password.service'
import { ValidationError, AuthenticationError } from '../lib/errors'

/**
 * Change user password
 *
 * POST /api/user/change-password
 *
 * Changes the password for the authenticated user.
 */
async function changePassword(request: FastifyRequest, reply: FastifyReply) {
  try {
    const userId = (request as any).userId

    if (!userId) {
      throw new AuthenticationError('User ID not found in token')
    }

    const { currentPassword, newPassword, confirmPassword } = request.body as {
      currentPassword?: string
      newPassword?: string
      confirmPassword?: string
    }

    // Validate input
    if (!currentPassword || !newPassword || !confirmPassword) {
      throw new ValidationError('All fields are required', 'INVALID_INPUT')
    }

    if (newPassword !== confirmPassword) {
      throw new ValidationError('New password and confirmation do not match', 'PASSWORD_MISMATCH')
    }

    if (currentPassword === newPassword) {
      throw new ValidationError('New password must be different from current password', 'PASSWORD_SAME')
    }

    // Validate password strength
    const strengthCheck = validatePasswordStrength(newPassword)
    if (!strengthCheck.isValid) {
      throw new ValidationError(
        `Password does not meet requirements: ${strengthCheck.feedback.join(', ')}`,
        'WEAK_PASSWORD'
      )
    }

    // Fetch current user password
    const userResult = await query(
      `SELECT "id", "password" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )

    if (userResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
        statusCode: 404,
      })
    }

    const user = userResult.rows[0]

    // Verify current password
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password)
    if (!isCurrentPasswordValid) {
      return reply.status(401).send({
        success: false,
        error: 'Current password is incorrect',
        code: 'INVALID_PASSWORD',
        statusCode: 401,
      })
    }

    // Hash new password
    const hashedNewPassword = await hashPassword(newPassword)

    // Update password
    await query(
      `UPDATE "User" SET "password" = $1, "updatedAt" = NOW() WHERE "id" = $2`,
      [hashedNewPassword, userId]
    )

    request.log.info({ userId }, 'Password changed')

    return reply.status(200).send({
      success: true,
      message: 'Password changed successfully',
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

    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Change password error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to change password',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register change password routes
 */
export async function userChangePasswordRoutes(fastify: FastifyInstance) {
  fastify.post('/api/user/change-password', { onRequest: jwtAuthMiddleware }, changePassword)

  fastify.log.info('User change password routes registered')
}

