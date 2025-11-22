/**
 * Assessment Routes
 *
 * Implements risk assessment endpoints for creating, fetching, and progressing through assessments.
 * Assessments are the core feature - users describe their AI system and get a risk score.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { ValidationError, DatabaseError } from '../lib/errors'

/**
 * Get assessment by ID endpoint
 *
 * GET /api/assessments/:id
 *
 * Retrieves a single assessment with all its questions, answers, and metadata.
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "assessment-uuid",
 *     "userId": "user-uuid",
 *     "projectId": "project-uuid",
 *     "status": "in_progress",
 *     "riskScore": null,
 *     "complianceScore": null,
 *     "sengolScore": null,
 *     "riskNotes": { "questions": [...] },
 *     "createdAt": "2024-01-01T00:00:00Z",
 *     "updatedAt": "2024-01-01T00:00:00Z"
 *   }
 * }
 * ```
 */
async function getAssessmentById(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }

    // Validate input
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Assessment ID is required', 'INVALID_INPUT')
    }

    // Fetch assessment from database
    const result = await query(
      `SELECT "id", "userId", "projectId", "status", "riskScore", "complianceScore",
              "sengolScore", "riskNotes", "createdAt", "updatedAt"
       FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const assessment = result.rows[0]

    request.log.info({ assessmentId: id, userId: assessment.userId }, 'Assessment retrieved')

    return reply.status(200).send({
      success: true,
      data: {
        id: assessment.id,
        userId: assessment.userId,
        projectId: assessment.projectId || null,
        status: assessment.status || 'draft',
        riskScore: assessment.riskScore || null,
        complianceScore: assessment.complianceScore || null,
        sengolScore: assessment.sengolScore || null,
        riskNotes: assessment.riskNotes || {},
        createdAt: assessment.createdAt,
        updatedAt: assessment.updatedAt,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Get assessment error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch assessment',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Save assessment progress endpoint
 *
 * POST /api/assessments/:id/save-progress
 *
 * Saves user's progress on an assessment. Updates answers, risk notes, and assessment status.
 *
 * Request:
 * ```json
 * {
 *   "riskNotes": { "questions": [...], "answers": {...] },
 *   "status": "in_progress",
 *   "riskScore": 65.5,
 *   "complianceScore": 78.0,
 *   "sengolScore": 70.0
 * }
 * ```
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "message": "Assessment progress saved",
 *     "id": "assessment-uuid"
 *   }
 * }
 * ```
 */
async function saveAssessmentProgress(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const { riskNotes, status, riskScore, complianceScore, sengolScore } = request.body as {
      riskNotes?: Record<string, any>
      status?: string
      riskScore?: number | null
      complianceScore?: number | null
      sengolScore?: number | null
    }

    // Validate input
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Assessment ID is required', 'INVALID_INPUT')
    }

    // Validate status if provided
    const validStatuses = ['draft', 'in_progress', 'completed', 'archived']
    if (status && !validStatuses.includes(status)) {
      throw new ValidationError(
        `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
        'INVALID_STATUS'
      )
    }

    // Validate scores if provided
    if (riskScore !== undefined && riskScore !== null && (riskScore < 0 || riskScore > 100)) {
      throw new ValidationError('Risk score must be between 0 and 100', 'INVALID_SCORE')
    }

    if (complianceScore !== undefined && complianceScore !== null && (complianceScore < 0 || complianceScore > 100)) {
      throw new ValidationError('Compliance score must be between 0 and 100', 'INVALID_SCORE')
    }

    if (sengolScore !== undefined && sengolScore !== null && (sengolScore < 0 || sengolScore > 100)) {
      throw new ValidationError('Sengol score must be between 0 and 100', 'INVALID_SCORE')
    }

    // Check if assessment exists
    const checkResult = await query(
      `SELECT "id" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    // Update assessment with progress
    const updateQuery = `
      UPDATE "RiskAssessment"
      SET "riskNotes" = COALESCE($1, "riskNotes"),
          "status" = COALESCE($2, "status"),
          "riskScore" = COALESCE($3, "riskScore"),
          "complianceScore" = COALESCE($4, "complianceScore"),
          "sengolScore" = COALESCE($5, "sengolScore"),
          "updatedAt" = NOW()
      WHERE "id" = $6
    `

    await query(updateQuery, [
      riskNotes ? JSON.stringify(riskNotes) : null,
      status || null,
      riskScore ?? null,
      complianceScore ?? null,
      sengolScore ?? null,
      id,
    ])

    request.log.info({ assessmentId: id, status }, 'Assessment progress saved')

    return reply.status(200).send({
      success: true,
      data: {
        message: 'Assessment progress saved',
        id,
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Save progress error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to save assessment progress',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get assessment progress endpoint
 *
 * GET /assessments/:id/progress
 *
 * Retrieves the current progress and completion status of an assessment.
 * Returns percentage complete and sections status.
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "data": {
 *     "id": "assessment-uuid",
 *     "status": "in_progress",
 *     "percentComplete": 45,
 *     "totalQuestions": 20,
 *     "answeredQuestions": 9,
 *     "sections": [
 *       {
 *         "name": "System Description",
 *         "status": "completed",
 *         "progress": 100
 *       }
 *     ]
 *   }
 * }
 * ```
 */
async function getAssessmentProgress(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }

    // Validate input
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Assessment ID is required', 'INVALID_INPUT')
    }

    // Fetch assessment
    const result = await query(
      `SELECT "id", "status", "riskNotes" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
      [id]
    )

    if (result.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const assessment = result.rows[0]
    const riskNotes = assessment.riskNotes || {}

    // Calculate progress
    // This is a simplified calculation; real implementation would analyze riskNotes structure
    const questions = riskNotes.questions || []
    const answers = riskNotes.answers || {}

    const totalQuestions = questions.length || 0
    const answeredQuestions = Object.keys(answers).length || 0
    const percentComplete = totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0

    request.log.info({ assessmentId: id }, 'Assessment progress retrieved')

    return reply.status(200).send({
      success: true,
      data: {
        id: assessment.id,
        status: assessment.status || 'draft',
        percentComplete,
        totalQuestions,
        answeredQuestions,
        sections: [
          {
            name: 'System Description',
            status: answeredQuestions > 0 ? 'in_progress' : 'pending',
            progress: answeredQuestions > 0 ? Math.round((answeredQuestions / Math.max(totalQuestions, 1)) * 100) : 0,
          },
        ],
      },
    })

  } catch (error) {
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code || 'VALIDATION_ERROR',
        statusCode: 400,
      })
    }

    request.log.error({ err: error }, 'Get progress error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch assessment progress',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all assessment routes
 */
export async function assessmentsRoutes(fastify: FastifyInstance) {
  fastify.get('/assessments/:id', getAssessmentById)
  fastify.post('/assessments/:id/save-progress', saveAssessmentProgress)
  fastify.get('/assessments/:id/progress', getAssessmentProgress)

  fastify.log.info('Assessment routes registered')
}
