/**
 * Assessment Routes
 *
 * Implements risk assessment endpoints for creating, fetching, and progressing through assessments.
 * Assessments are the core feature - users describe their AI system and get a risk score.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { query } from '../lib/db'
import { ValidationError, DatabaseError } from '../lib/errors'
import { randomUUID } from 'crypto'

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
              "sengolScore", "riskNotes", "systemDescription", "industry", 
              "systemCriticality", "dataTypes", "dataSources", "technologyStack",
              "selectedDomains", "jurisdictions", "createdAt", "updatedAt"
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

    // Log what we're returning for debugging
    request.log.info({
      assessmentId: id,
      hasSystemDescription: !!assessment.systemDescription,
      systemDescriptionLength: assessment.systemDescription?.length || 0,
      hasIndustry: !!assessment.industry,
      hasSystemCriticality: !!assessment.systemCriticality
    }, 'Returning assessment data')

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
        systemDescription: assessment.systemDescription || null,
        industry: assessment.industry || null,
        systemCriticality: assessment.systemCriticality || null,
        dataTypes: assessment.dataTypes || [],
        dataSources: assessment.dataSources || [],
        technologyStack: assessment.technologyStack || [],
        selectedDomains: assessment.selectedDomains || [],
        jurisdictions: assessment.jurisdictions || [],
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
 * Submit assessment for analysis
 *
 * POST /api/assessments/:id/submit
 */
async function submitAssessment(request: FastifyRequest, reply: FastifyReply) {
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

    // Update assessment status to completed
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
 */
async function getAssessmentScores(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = (request.query as { userId?: string }).userId || request.headers['x-user-id'] as string

    if (!userId) {
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
      [id, userId]
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
 */
async function getAssessmentBenchmark(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const userId = (request.query as { userId?: string }).userId || request.headers['x-user-id'] as string

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Verify assessment exists
    const checkResult = await query(
      `SELECT "id", "riskScore" FROM "RiskAssessment" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
      [id, userId]
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
    const riskScore = assessment.riskScore || 0

    // Return benchmark data (simplified - would calculate from industry data)
    return reply.status(200).send({
      success: true,
      data: {
        assessmentId: id,
        industryAverage: 65.5,
        percentile: riskScore > 65.5 ? 75 : 50,
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
 */
async function getSimilarCases(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const queryParams = request.query as { userId?: string; limit?: string }
    const userId = queryParams.userId || request.headers['x-user-id'] as string

    if (!userId) {
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
      [id, userId]
    )

    if (checkResult.rows.length === 0) {
      return reply.status(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404,
      })
    }

    const limit = Math.min(parseInt(queryParams.limit || '10', 10), 50)

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
 * Save assessment step
 *
 * PUT /api/assessments/:id/step1, step2, step3
 */
async function saveAssessmentStep(request: FastifyRequest, reply: FastifyReply) {
  try {
    const { id } = request.params as { id: string }
    const step = (request.url.match(/step(\d+)/) || [])[1] || '1'
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

    // For step1, save system description and other fields to actual database columns
    if (step === '1') {
      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramIndex = 1

      // Save systemDescription to actual column
      if (body.systemDescription !== undefined) {
        updateFields.push(`"systemDescription" = $${paramIndex}`)
        updateValues.push(body.systemDescription)
        paramIndex++
      }

      // Save industry to actual column
      if (body.industry !== undefined) {
        updateFields.push(`"industry" = $${paramIndex}`)
        updateValues.push(body.industry)
        paramIndex++
      }

      // Save systemCriticality to actual column
      if (body.systemCriticality !== undefined) {
        updateFields.push(`"systemCriticality" = $${paramIndex}`)
        updateValues.push(body.systemCriticality)
        paramIndex++
      }

      // Save dataTypes array
      if (body.dataTypes !== undefined) {
        updateFields.push(`"dataTypes" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.dataTypes) ? body.dataTypes : [])
        paramIndex++
      }

      // Save dataSources array
      if (body.dataSources !== undefined) {
        updateFields.push(`"dataSources" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.dataSources) ? body.dataSources : [])
        paramIndex++
      }

      // Save technologyStack array
      if (body.technologyStack !== undefined) {
        updateFields.push(`"technologyStack" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.technologyStack) ? body.technologyStack : [])
        paramIndex++
      }

      // Save selectedDomains array
      if (body.selectedDomains !== undefined) {
        updateFields.push(`"selectedDomains" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.selectedDomains) ? body.selectedDomains : [])
        paramIndex++
      }

      // Save jurisdictions array
      if (body.jurisdictions !== undefined) {
        updateFields.push(`"jurisdictions" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.jurisdictions) ? body.jurisdictions : [])
        paramIndex++
      }

      // Also save to riskNotes for backward compatibility and additional metadata
      const currentNotes = assessment.riskNotes || {}
      const updatedNotes = {
        ...currentNotes,
        step1: {
          ...body,
          savedAt: new Date().toISOString(),
        },
      }

      updateFields.push(`"riskNotes" = $${paramIndex}`)
      updateValues.push(JSON.stringify(updatedNotes))
      paramIndex++

      // Always update updatedAt
      updateFields.push(`"updatedAt" = NOW()`)

      if (updateFields.length > 0) {
        updateValues.push(id)
        await query(
          `UPDATE "RiskAssessment" 
           SET ${updateFields.join(', ')}
           WHERE "id" = $${paramIndex}`,
          updateValues
        )
      }
    } else if (step === '3') {
      // For step3, save compliance data to actual database columns
      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramIndex = 1

      // Save complianceQuestionResponses (from questionResponses or complianceResponses)
      const complianceResponses = body.complianceResponses || body.questionResponses
      if (complianceResponses !== undefined) {
        updateFields.push(`"complianceQuestionResponses" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(complianceResponses))
        paramIndex++
      }

      // Save complianceScore if provided
      if (body.complianceScore !== undefined) {
        updateFields.push(`"complianceScore" = $${paramIndex}`)
        updateValues.push(body.complianceScore)
        paramIndex++
      }

      // Save complianceCoverageScore if provided
      if (body.complianceCoverageScore !== undefined) {
        updateFields.push(`"complianceCoverageScore" = $${paramIndex}`)
        updateValues.push(body.complianceCoverageScore)
        paramIndex++
      }

      // Save complianceCoverageDetails if provided
      if (body.complianceCoverageDetails !== undefined) {
        updateFields.push(`"complianceCoverageDetails" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(body.complianceCoverageDetails))
        paramIndex++
      }

      // Save complianceUserScores if provided
      if (body.userScores !== undefined || body.complianceUserScores !== undefined) {
        updateFields.push(`"complianceUserScores" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(body.userScores || body.complianceUserScores))
        paramIndex++
      }

      // Save complianceNotes if provided
      if (body.notes !== undefined || body.complianceNotes !== undefined) {
        updateFields.push(`"complianceNotes" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(body.notes || body.complianceNotes))
        paramIndex++
      }

      // Save jurisdictions if provided
      if (body.jurisdictions !== undefined) {
        updateFields.push(`"jurisdictions" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.jurisdictions) ? body.jurisdictions : [])
        paramIndex++
      }

      // Save regulationIds if provided
      if (body.regulationIds !== undefined) {
        updateFields.push(`"regulationIds" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.regulationIds) ? body.regulationIds : [])
        paramIndex++
      }

      // Also save to riskNotes for backward compatibility
      const currentNotes = assessment.riskNotes || {}
      const updatedNotes = {
        ...currentNotes,
        step3: {
          ...body,
          savedAt: new Date().toISOString(),
        },
      }

      updateFields.push(`"riskNotes" = $${paramIndex}::jsonb`)
      updateValues.push(JSON.stringify(updatedNotes))
      paramIndex++

      // Always update updatedAt
      updateFields.push(`"updatedAt" = NOW()`)

      if (updateFields.length > 0) {
        updateValues.push(id)
        await query(
          `UPDATE "RiskAssessment" 
           SET ${updateFields.join(', ')}
           WHERE "id" = $${paramIndex}`,
          updateValues
        )
      }
    }

    request.log.info({ assessmentId: id, step, userId }, 'Assessment step saved')

    return reply.status(200).send({
      success: true,
      data: {
        id,
        step: parseInt(step, 10),
        message: `Step ${step} saved successfully`,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Save assessment step error')
    return reply.status(500).send({
      success: false,
      error: 'Failed to save assessment step',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

/**
 * Create new assessment
 *
 * POST /api/assessments
 */
async function createAssessment(request: FastifyRequest, reply: FastifyReply) {
  try {
    const body = request.body as { userId?: string; projectId?: string; name?: string }
    const userId = request.headers['x-user-id'] as string || body.userId

    request.log.info({ 
      hasUserId: !!userId,
      userIdFromHeader: !!request.headers['x-user-id'],
      userIdFromBody: !!body.userId,
      projectId: body.projectId,
      name: body.name
    }, 'Create assessment request received')

    if (!userId) {
      request.log.warn({ headers: Object.keys(request.headers) }, 'Missing userId in create assessment')
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Validate userId format - allow UUID or any non-empty string
    // Log the actual format for debugging
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    request.log.info({ 
      userId, 
      userIdLength: userId.length,
      isUUID,
      firstChars: userId.substring(0, 10)
    }, 'UserId format check')
    
    // Only validate that userId is not empty - database will handle format validation
    if (!userId || userId.trim().length === 0) {
      request.log.warn({ userId }, 'Empty userId')
      return reply.status(400).send({
        success: false,
        error: 'User ID is required',
        code: 'INVALID_USER_ID',
        statusCode: 400,
      })
    }

    // Validate projectId if provided (must exist in Project table)
    if (body.projectId) {
      const projectCheck = await query(
        `SELECT "id" FROM "Project" WHERE "id" = $1 AND "userId" = $2 LIMIT 1`,
        [body.projectId, userId]
      )
      if (projectCheck.rows.length === 0) {
        request.log.warn({ projectId: body.projectId, userId }, 'Project not found or does not belong to user')
        return reply.status(404).send({
          success: false,
          error: 'Project not found or you do not have access to it',
          code: 'PROJECT_NOT_FOUND',
          statusCode: 404,
        })
      }
    }

    // Create assessment
    const assessmentId = randomUUID()
    const now = new Date()
    const assessmentName = body.name || 'Untitled Assessment'

    request.log.info({ assessmentId, userId, projectId: body.projectId, name: assessmentName }, 'Creating assessment in database')

    try {
      await query(
        `INSERT INTO "RiskAssessment" (
          "id", "userId", "projectId", "name", "industry", "companySize", 
          "budgetRange", "timeline", "teamSize", "overallRiskScore", 
          "businessImpact", "createdAt", "updatedAt"
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          assessmentId,
          userId,
          body.projectId || null,
          assessmentName,
          '', // industry - default empty
          'small', // companySize - default
          '0-10k', // budgetRange - default
          '1-3 months', // timeline - default
          1, // teamSize - default
          0, // overallRiskScore - default
          JSON.stringify({}), // businessImpact - default empty object
          now.toISOString(),
          now.toISOString(),
        ]
      )
    } catch (dbError: any) {
      request.log.error({ 
        dbError: dbError.message,
        dbErrorCode: dbError.code,
        dbErrorDetail: dbError.detail,
        dbErrorTable: dbError.table,
        dbErrorConstraint: dbError.constraint,
        userId,
        projectId: body.projectId,
        assessmentId
      }, 'Database error creating assessment')
      
      // Check for specific database errors
      if (dbError.code === '23503') { // Foreign key violation
        if (dbError.message?.includes('userId') || dbError.detail?.includes('userId') || dbError.constraint?.includes('userId')) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid user ID',
            code: 'INVALID_USER_ID',
            statusCode: 400,
            details: 'User does not exist in database. Please ensure you are logged in with a valid account.'
          })
        }
        if (dbError.message?.includes('projectId') || dbError.detail?.includes('projectId') || dbError.constraint?.includes('projectId')) {
          return reply.status(400).send({
            success: false,
            error: 'Invalid project ID',
            code: 'INVALID_PROJECT_ID',
            statusCode: 400,
            details: 'Project does not exist or does not belong to user'
          })
        }
        // Generic foreign key error
        return reply.status(400).send({
          success: false,
          error: 'Database constraint violation',
          code: 'FOREIGN_KEY_VIOLATION',
          statusCode: 400,
          details: dbError.detail || dbError.message || 'Invalid reference in database'
        })
      }
      
      if (dbError.code === '42P01') { // Table does not exist
        return reply.status(500).send({
          success: false,
          error: 'Database table not found',
          code: 'TABLE_NOT_FOUND',
          statusCode: 500,
          details: 'RiskAssessment table does not exist. Please run database migrations.'
        })
      }
      
      // Re-throw to be caught by outer catch block
      throw dbError
    }

    request.log.info({ assessmentId, userId }, 'Assessment created successfully')

    return reply.status(201).send({
      success: true,
      data: {
        id: assessmentId,
        userId,
        projectId: body.projectId || null,
        name: assessmentName,
        industry: '',
        companySize: 'small',
        budgetRange: '0-10k',
        timeline: '1-3 months',
        teamSize: 1,
        overallRiskScore: 0,
        businessImpact: {},
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    })
  } catch (error) {
    request.log.error({ 
      err: error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    }, 'Create assessment error')
    
    // Check if it's a database constraint error
    if (error instanceof Error) {
      if (error.message.includes('foreign key') || error.message.includes('constraint')) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid project ID or user ID',
          code: 'INVALID_REFERENCE',
          statusCode: 400,
        })
      }
      if (error.message.includes('duplicate key') || error.message.includes('unique constraint')) {
        return reply.status(409).send({
          success: false,
          error: 'Assessment already exists',
          code: 'DUPLICATE_ASSESSMENT',
          statusCode: 409,
        })
      }
    }
    
    return reply.status(500).send({
      success: false,
      error: 'Failed to create assessment',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      details: error instanceof Error ? error.message : String(error)
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
  fastify.put('/api/assessments/:id/step1', saveAssessmentStep)
  fastify.put('/api/assessments/:id/step2', saveAssessmentStep)
  fastify.put('/api/assessments/:id/step3', saveAssessmentStep)

  fastify.log.info('Assessment routes registered')
}
