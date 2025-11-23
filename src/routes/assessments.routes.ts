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
 * Submit assessment
 *
 * POST /api/assessments/:id/submit
 *
 * Submits a completed assessment for analysis.
 */
async function submitAssessment(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const body = request.body as { userId?: string }
    const userId = request.headers['x-user-id'] as string || body.userId

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Verify assessment exists and belongs to user
    const checkResult = await query(
      `SELECT "id", "userId", "status" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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

    const assessment = checkResult.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to submit this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Update assessment status to submitted
    await query(
      `UPDATE "RiskAssessment" 
       SET "status" = 'completed', "updatedAt" = NOW()
       WHERE "id" = $1`,
      [id]
    )

    request.log.info({ assessmentId: id, userId }, 'Assessment submitted')

    return reply.status(200).send({
      success: true,
      data: {
        id,
        status: 'completed',
        message: 'Assessment submitted successfully',
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Submit assessment error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to submit assessment',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get assessment scores
 *
 * GET /api/assessments/:id/scores
 *
 * Returns assessment scores and metrics.
 */
async function getAssessmentScores(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.query as { userId?: string }

    if (!userId.userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Fetch assessment with scores
    const result = await query(
      `SELECT "id", "riskScore", "complianceScore", "sengolScore", "status"
       FROM "RiskAssessment" 
       WHERE "id" = $1 AND "userId" = $2
       LIMIT 1`,
      [id, userId.userId]
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

    return reply.status(200).send({
      success: true,
      data: {
        id: assessment.id,
        riskScore: assessment.riskScore || null,
        complianceScore: assessment.complianceScore || null,
        sengolScore: assessment.sengolScore || null,
        status: assessment.status || 'draft',
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get assessment scores error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch assessment scores',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get assessment benchmark
 *
 * GET /api/assessments/:id/benchmark
 *
 * Returns industry benchmark data for the assessment.
 */
async function getAssessmentBenchmark(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.query as { userId?: string }

    if (!userId.userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Verify assessment exists
    const checkResult = await query(
      `SELECT "id" FROM "RiskAssessment" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
      [id, userId.userId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    // Return benchmark data (placeholder - would calculate from industry data)
    return reply.status(200).send({
      success: true,
      data: {
        assessmentId: id,
        industryAverage: 65.5,
        percentile: 75,
        benchmark: {
          low: 40,
          medium: 60,
          high: 80,
        },
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get assessment benchmark error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch benchmark',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Get similar cases
 *
 * GET /api/assessments/:id/similar-cases
 *
 * Returns similar case studies for the assessment.
 */
async function getSimilarCases(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.query as { userId?: string; limit?: string }

    if (!userId.userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Verify assessment exists
    const checkResult = await query(
      `SELECT "id" FROM "RiskAssessment" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
      [id, userId.userId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const limit = Math.min(parseInt(userId.limit || '10', 10), 50)

    // Return similar cases (placeholder - would use vector search)
    return reply.status(200).send({
      success: true,
      data: {
        assessmentId: id,
        cases: [],
        total: 0,
        limit,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Get similar cases error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch similar cases',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Save assessment step 1
 *
 * PUT /api/assessments/:id/step1
 *
 * Saves progress for step 1 of the assessment.
 */
async function saveAssessmentStep1(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.headers['x-user-id'] as string

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    const body = request.body as Record<string, any>

    const body = request.body as Record<string, any>

    // Verify assessment exists
    const checkResult = await query(
      `SELECT "id", "userId", "riskNotes" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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

    const assessment = checkResult.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to update this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Update riskNotes with step 1 data
    const currentNotes = assessment.riskNotes || {}
    const updatedNotes = {
      ...currentNotes,
      step1: body,
    }

    await query(
      `UPDATE "RiskAssessment" 
       SET "riskNotes" = $1, "updatedAt" = NOW()
       WHERE "id" = $2`,
      [JSON.stringify(updatedNotes), id]
    )

    request.log.info({ assessmentId: id, step: 1, userId }, 'Assessment step 1 saved')

    return reply.status(200).send({
      success: true,
      data: {
        id,
        step: 1,
        message: 'Step 1 saved successfully',
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Save assessment step 1 error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to save assessment step 1',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Save assessment step 2
 *
 * PUT /api/assessments/:id/step2
 *
 * Saves progress for step 2 of the assessment.
 */
async function saveAssessmentStep2(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.headers['x-user-id'] as string

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    const body = request.body as Record<string, any>

    // Verify assessment exists
    const checkResult = await query(
      `SELECT "id", "userId", "riskNotes" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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

    const assessment = checkResult.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to update this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Update riskNotes with step 2 data
    const currentNotes = assessment.riskNotes || {}
    const updatedNotes = {
      ...currentNotes,
      step2: body,
    }

    await query(
      `UPDATE "RiskAssessment" 
       SET "riskNotes" = $1, "updatedAt" = NOW()
       WHERE "id" = $2`,
      [JSON.stringify(updatedNotes), id]
    )

    request.log.info({ assessmentId: id, step: 2, userId }, 'Assessment step 2 saved')

    return reply.status(200).send({
      success: true,
      data: {
        id,
        step: 2,
        message: 'Step 2 saved successfully',
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Save assessment step 2 error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to save assessment step 2',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Save assessment step 3
 *
 * PUT /api/assessments/:id/step3
 *
 * Saves progress for step 3 of the assessment.
 */
async function saveAssessmentStep3(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = request.headers['x-user-id'] as string

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    const body = request.body as Record<string, any>

    // Verify assessment exists
    const checkResult = await query(
      `SELECT "id", "userId", "riskNotes" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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

    const assessment = checkResult.rows[0]
    if (assessment.userId !== userId) {
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to update this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Update riskNotes with step 3 data
    const currentNotes = assessment.riskNotes || {}
    const updatedNotes = {
      ...currentNotes,
      step3: body,
    }

    await query(
      `UPDATE "RiskAssessment" 
       SET "riskNotes" = $1, "updatedAt" = NOW()
       WHERE "id" = $2`,
      [JSON.stringify(updatedNotes), id]
    )

    request.log.info({ assessmentId: id, step: 3, userId }, 'Assessment step 3 saved')

    return reply.status(200).send({
      success: true,
      data: {
        id,
        step: 3,
        message: 'Step 3 saved successfully',
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Save assessment step 3 error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to save assessment step 3',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Create new assessment
 *
 * POST /api/assessments
 *
 * Creates a new risk assessment.
 */
async function createAssessment(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as {
      userId?: string
      projectId?: string
      name?: string
    }
    const userId = request.headers['x-user-id'] as string || body.userId

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Create assessment
    const assessmentId = randomUUID()
    const now = new Date()

    await query(
      `INSERT INTO "RiskAssessment" (
        "id", "userId", "projectId", "status", "createdAt", "updatedAt"
      ) VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        assessmentId,
        userId,
        body.projectId || null,
        'draft',
        now.toISOString(),
        now.toISOString(),
      ]
    )

    request.log.info({ assessmentId, userId }, 'Assessment created')

    return reply.status(201).send({
      success: true,
      data: {
        id: assessmentId,
        userId,
        projectId: body.projectId || null,
        status: 'draft',
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Create assessment error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to create assessment',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Register all assessment routes
 */
export async function assessmentsRoutes(fastify: FastifyInstance) {
  fastify.get('/api/assessments/:id', getAssessmentById)
  fastify.post('/api/assessments', createAssessment)
  fastify.post('/api/assessments/:id/save-progress', saveAssessmentProgress)
  fastify.get('/api/assessments/:id/progress', getAssessmentProgress)
  fastify.post('/api/assessments/:id/submit', submitAssessment)
  fastify.get('/api/assessments/:id/scores', getAssessmentScores)
  fastify.get('/api/assessments/:id/benchmark', getAssessmentBenchmark)
  fastify.get('/api/assessments/:id/similar-cases', getSimilarCases)
  fastify.put('/api/assessments/:id/step1', saveAssessmentStep1)
  fastify.put('/api/assessments/:id/step2', saveAssessmentStep2)
  fastify.put('/api/assessments/:id/step3', saveAssessmentStep3)

  fastify.log.info('Assessment routes registered')
}
