import { FastifyRequest, FastifyReply } from 'fastify'
import { ValidationError } from '../lib/errors'
import { getUserUsageSummary } from '../services/feature-gates.service'

// ============================================================================
// GET /api/user/usage - Get user's usage and limits
// ============================================================================

interface GetUserUsageQuery {
  userId: string
}

export async function getUserUsageController(
  request: FastifyRequest<{ Querystring: GetUserUsageQuery }>,
  reply: FastifyReply
) {
  try {
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    request.log.info({ userId }, 'Getting user usage')

    const usageSummary = await getUserUsageSummary(userId)

    return reply.send({
      success: true,
      data: usageSummary,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get user usage')

    if (error instanceof ValidationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to get user usage',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
