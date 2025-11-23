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
    // ✅ FIX: Removed "status" column - it doesn't exist in RiskAssessment table
    // ✅ FIX: Added all Step 2 and Step 3 fields for complete data loading
    const result = await query(
      `SELECT "id", "userId", "projectId", "riskScore", "complianceScore",
              "sengolScore", "riskNotes", "systemDescription", "industry", 
              "systemCriticality", "dataTypes", "dataSources", "technologyStack",
              "selectedDomains", "jurisdictions", "riskQuestionResponses",
              "userRiskScores", "additionalRiskElements", "complianceQuestionResponses",
              "complianceUserScores", "complianceNotes", "complianceCoverageScore",
              "complianceCoverageDetails", "regulationIds", "createdAt", "updatedAt"
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
        // ✅ FIX: Removed status field - it doesn't exist in RiskAssessment table
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
        // ✅ FIX: Added Step 2 fields for complete data loading
        riskQuestionResponses: assessment.riskQuestionResponses || {},
        userRiskScores: assessment.userRiskScores || {},
        additionalRiskElements: assessment.additionalRiskElements || [],
        // ✅ FIX: Added Step 3 fields for complete data loading
        complianceQuestionResponses: assessment.complianceQuestionResponses || {},
        complianceUserScores: assessment.complianceUserScores || {},
        complianceNotes: assessment.complianceNotes || {},
        complianceCoverageScore: assessment.complianceCoverageScore || null,
        complianceCoverageDetails: assessment.complianceCoverageDetails || null,
        regulationIds: assessment.regulationIds || [],
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
    // ✅ FIX: Removed "status" column - it doesn't exist in RiskAssessment table
    const result = await query(
      `SELECT "id", "riskNotes" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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
        // ✅ FIX: Removed status field - it doesn't exist in RiskAssessment table
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

    // Verify assessment exists and belongs to user, and load all data for score calculation
    const checkResult = await query(
      // ✅ FIX: Load all necessary data for score calculation
      `SELECT "id", "userId", "riskQuestionResponses", "complianceQuestionResponses",
              "riskScore", "complianceScore", "sengolScore", "riskNotes"
       FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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

    // ✅ FIX: Calculate scores before submitting
    let riskScore = assessment.riskScore
    let complianceScore = assessment.complianceScore
    let sengolScore = assessment.sengolScore

    try {
      const { calculateSengolScore, calculateLetterGrade } = await import('../services/score-calculator')

      // Helper function to convert status to score (0-100, where 0 = best, 100 = worst)
      const statusToRiskScore = (status: string): number | null => {
        switch (status) {
          case 'addressed': return 20 // Low risk (20%)
          case 'partially_addressed': return 50 // Medium risk (50%)
          case 'not_addressed': return 80 // High risk (80%)
          case 'not_applicable': return null // Exclude from calculation
          default: return null
        }
      }

      // Calculate risk score from Step 2 responses
      const riskResponses = assessment.riskQuestionResponses || {}
      let parsedRiskResponses: Record<string, any> = {}
      
      if (typeof riskResponses === 'string') {
        try {
          parsedRiskResponses = JSON.parse(riskResponses)
        } catch (e) {
          request.log.warn({ assessmentId: id, error: e }, 'Failed to parse riskQuestionResponses')
        }
      } else if (riskResponses && typeof riskResponses === 'object') {
        parsedRiskResponses = riskResponses
      }

      // Calculate average risk score from responses
      const riskScores: number[] = []
      for (const [questionId, response] of Object.entries(parsedRiskResponses)) {
        if (!response) continue
        
        // Use userRiskScores if available, otherwise calculate from status
        if (response.riskScore !== undefined && response.riskScore !== null) {
          riskScores.push(response.riskScore)
        } else if (response.status) {
          const score = statusToRiskScore(response.status)
          if (score !== null) {
            riskScores.push(score)
          }
        }
      }
      
      if (riskScores.length > 0) {
        riskScore = Math.round(riskScores.reduce((a, b) => a + b, 0) / riskScores.length)
      }

      // Calculate compliance score from Step 3 responses
      const complianceResponses = assessment.complianceQuestionResponses || {}
      let parsedComplianceResponses: Record<string, any> = {}
      
      if (typeof complianceResponses === 'string') {
        try {
          parsedComplianceResponses = JSON.parse(complianceResponses)
        } catch (e) {
          request.log.warn({ assessmentId: id, error: e }, 'Failed to parse complianceQuestionResponses')
        }
      } else if (complianceResponses && typeof complianceResponses === 'object') {
        parsedComplianceResponses = complianceResponses
      }

      // Calculate average compliance score from responses (inverted: higher status = better compliance)
      const complianceScores: number[] = []
      for (const [questionId, response] of Object.entries(parsedComplianceResponses)) {
        if (!response) continue
        
        // Use userScores if available, otherwise calculate from status
        if (response.userScore !== undefined && response.userScore !== null) {
          complianceScores.push(response.userScore)
        } else if (response.status) {
          // For compliance, invert the risk score (addressed = 100, not_addressed = 0)
          const riskScore = statusToRiskScore(response.status)
          if (riskScore !== null) {
            complianceScores.push(100 - riskScore) // Invert: 20 -> 80, 50 -> 50, 80 -> 20
          }
        }
      }
      
      if (complianceScores.length > 0) {
        complianceScore = Math.round(complianceScores.reduce((a, b) => a + b, 0) / complianceScores.length)
      }

      // Calculate Sengol score (weighted combination: 60% risk health, 40% compliance)
      // Risk health = 100 - riskScore (invert so higher is better)
      if (riskScore !== null && riskScore !== undefined && 
          complianceScore !== null && complianceScore !== undefined) {
        const riskHealth = 100 - riskScore
        sengolScore = Math.round((riskHealth * 0.6) + (complianceScore * 0.4))
      }

      request.log.info({ 
        assessmentId: id, 
        riskScore, 
        complianceScore, 
        sengolScore,
        riskResponseCount: Object.keys(parsedRiskResponses).length,
        complianceResponseCount: Object.keys(parsedComplianceResponses).length
      }, 'Scores calculated for submission')
    } catch (scoreError) {
      request.log.error({ err: scoreError, assessmentId: id }, 'Failed to calculate scores, using existing values')
      // Continue with existing scores if calculation fails
    }

    // Calculate letter grade
    const letterGrade = sengolScore !== null && sengolScore !== undefined
      ? (sengolScore >= 90 ? 'A' : sengolScore >= 80 ? 'B' : sengolScore >= 70 ? 'C' : sengolScore >= 60 ? 'D' : 'F')
      : null

    // Update assessment with scores and completion status
    // ✅ FIX: Removed status column update - it doesn't exist
    await query(
      `UPDATE "RiskAssessment" 
       SET "riskScore" = $1, 
           "complianceScore" = $2, 
           "sengolScore" = $3,
           "letterGrade" = $4,
           "updatedAt" = NOW()
       WHERE "id" = $5`,
      [riskScore, complianceScore, sengolScore, letterGrade, id]
    )

    request.log.info({ assessmentId: id, userId, riskScore, complianceScore, sengolScore, letterGrade }, 'Assessment submitted with scores')

    return reply.status(200).send({
      success: true,
      data: {
        id,
        riskScore,
        complianceScore,
        sengolScore,
        letterGrade,
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
    // ✅ FIX: Removed "status" column - it doesn't exist in RiskAssessment table
    const result = await query(
      `SELECT "id", "riskScore", "complianceScore", "sengolScore"
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
        // ✅ FIX: Removed status field - it doesn't exist in RiskAssessment table
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

    request.log.info({
      assessmentId: id,
      step,
      hasUserId: !!userId,
      requestBodyKeys: Object.keys(request.body as Record<string, any> || {})
    }, 'Save assessment step request received')

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    const body = request.body as Record<string, any>
    
    if (step === '1') {
      request.log.info({
        assessmentId: id,
        step,
        hasSystemDescription: !!body.systemDescription,
        systemDescriptionLength: body.systemDescription?.length || 0,
        hasIndustry: !!body.industry,
        hasSystemCriticality: !!body.systemCriticality,
        hasDataTypes: !!body.dataTypes,
        hasDataSources: !!body.dataSources,
        hasTechnologyStack: !!body.technologyStack
      }, 'Step1 save request body details')
    }

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
      // ✅ CRITICAL: Always save systemDescription if provided (even empty string to clear it)
      if (body.systemDescription !== undefined && body.systemDescription !== null) {
        updateFields.push(`"systemDescription" = $${paramIndex}`)
        updateValues.push(body.systemDescription || '') // Ensure it's a string, not null
        paramIndex++
        request.log.info({
          assessmentId: id,
          systemDescriptionLength: body.systemDescription?.length || 0,
          systemDescriptionPreview: body.systemDescription?.substring(0, 100) || 'empty'
        }, 'Adding systemDescription to update')
      } else {
        request.log.warn({
          assessmentId: id,
          systemDescriptionValue: body.systemDescription,
          systemDescriptionType: typeof body.systemDescription,
          bodyKeys: Object.keys(body)
        }, 'systemDescription is undefined or null - NOT saving')
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
        // Add id to the end of updateValues for WHERE clause
        updateValues.push(id)
        // Use the length of updateValues as the parameter index for WHERE clause
        const whereParamIndex = updateValues.length
        
        request.log.info({
          assessmentId: id,
          updateFieldsCount: updateFields.length,
          updateFields: updateFields,
          updateValuesCount: updateValues.length,
          whereParamIndex,
          hasSystemDescription: updateFields.some(f => f.includes('systemDescription')),
          systemDescriptionValue: body.systemDescription?.substring(0, 100) || 'N/A'
        }, 'Executing UPDATE query for step1')
        
        const updateResult = await query(
          `UPDATE "RiskAssessment" 
           SET ${updateFields.join(', ')}
           WHERE "id" = $${whereParamIndex}`,
          updateValues
        )
        
        request.log.info({
          assessmentId: id,
          rowCount: updateResult.rowCount || 0,
          command: updateResult.command || 'N/A'
        }, 'UPDATE query executed - checking if rows were affected')
        
        // Fetch the updated assessment to return saved data
        const updatedResult = await query(
          `SELECT "id", "userId", "projectId", "systemDescription", "industry", 
                  "systemCriticality", "dataTypes", "dataSources", "technologyStack",
                  "selectedDomains", "jurisdictions", "createdAt", "updatedAt"
           FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
          [id]
        )
        
        if (updatedResult.rows.length > 0) {
          const updatedAssessment = updatedResult.rows[0]
          request.log.info({ 
            assessmentId: id, 
            hasSystemDescription: !!updatedAssessment.systemDescription,
            systemDescriptionLength: updatedAssessment.systemDescription?.length || 0,
            systemDescriptionPreview: updatedAssessment.systemDescription?.substring(0, 100) || 'N/A'
          }, 'Step1 data saved successfully')
          
          return reply.status(200).send({
            success: true,
            data: {
              id: updatedAssessment.id,
              userId: updatedAssessment.userId,
              projectId: updatedAssessment.projectId || null,
              systemDescription: updatedAssessment.systemDescription || null,
              industry: updatedAssessment.industry || null,
              systemCriticality: updatedAssessment.systemCriticality || null,
              dataTypes: updatedAssessment.dataTypes || [],
              dataSources: updatedAssessment.dataSources || [],
              technologyStack: updatedAssessment.technologyStack || [],
              selectedDomains: updatedAssessment.selectedDomains || [],
              jurisdictions: updatedAssessment.jurisdictions || [],
              createdAt: updatedAssessment.createdAt,
              updatedAt: updatedAssessment.updatedAt,
            },
          })
        } else {
          request.log.error({ assessmentId: id }, 'Failed to retrieve updated assessment after save')
          return reply.status(500).send({
            success: false,
            error: 'Failed to retrieve saved assessment',
            code: 'RETRIEVAL_ERROR',
            statusCode: 500,
          })
        }
      } else {
        request.log.warn({ assessmentId: id, bodyKeys: Object.keys(body) }, 'No fields to update in step1')
        return reply.status(400).send({
          success: false,
          error: 'No fields provided to update',
          code: 'NO_FIELDS',
          statusCode: 400,
        })
      }
    } else if (step === '2') {
      // For step2, save risk assessment data to actual database columns
      const updateFields: string[] = []
      const updateValues: any[] = []
      let paramIndex = 1

      // Save selectedDomains array
      if (body.selectedDomains !== undefined) {
        updateFields.push(`"selectedDomains" = $${paramIndex}`)
        updateValues.push(Array.isArray(body.selectedDomains) ? body.selectedDomains : [])
        paramIndex++
      }

      // Save riskQuestionResponses (from riskQuestionResponses or riskResponses)
      const riskResponses = body.riskQuestionResponses || body.riskResponses
      if (riskResponses !== undefined) {
        updateFields.push(`"riskQuestionResponses" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(riskResponses))
        paramIndex++
      }

      // Save userRiskScores if provided
      if (body.userRiskScores !== undefined) {
        updateFields.push(`"userRiskScores" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(body.userRiskScores))
        paramIndex++
      }

      // Save riskNotes if provided
      if (body.riskNotes !== undefined) {
        updateFields.push(`"riskNotes" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(body.riskNotes))
        paramIndex++
      }

      // Save additionalRiskElements if provided
      if (body.additionalRiskElements !== undefined) {
        updateFields.push(`"additionalRiskElements" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(body.additionalRiskElements))
        paramIndex++
      }

      // Also save to riskNotes for backward compatibility
      const currentNotes = assessment.riskNotes || {}
      const updatedNotes = {
        ...currentNotes,
        step2: {
          ...body,
          savedAt: new Date().toISOString(),
        },
      }

      // Only update riskNotes if we haven't already updated it above
      if (body.riskNotes === undefined) {
        updateFields.push(`"riskNotes" = $${paramIndex}::jsonb`)
        updateValues.push(JSON.stringify(updatedNotes))
        paramIndex++
      }

      // Always update updatedAt
      updateFields.push(`"updatedAt" = NOW()`)

      if (updateFields.length > 0) {
        // Add id to the end of updateValues for WHERE clause
        updateValues.push(id)
        // Use the length of updateValues as the parameter index for WHERE clause
        const whereParamIndex = updateValues.length
        
        request.log.info({
          assessmentId: id,
          updateFieldsCount: updateFields.length,
          hasRiskResponses: !!riskResponses,
          riskResponseCount: riskResponses ? Object.keys(riskResponses).length : 0,
        }, 'Executing UPDATE query for step2')
        
        await query(
          `UPDATE "RiskAssessment" 
           SET ${updateFields.join(', ')}
           WHERE "id" = $${whereParamIndex}`,
          updateValues
        )
        
        // Fetch the updated assessment to return saved data
        const updatedResult = await query(
          `SELECT "id", "userId", "projectId", "systemDescription", "industry", 
                  "systemCriticality", "dataTypes", "dataSources", "technologyStack",
                  "selectedDomains", "jurisdictions", "riskQuestionResponses",
                  "userRiskScores", "riskNotes", "additionalRiskElements",
                  "createdAt", "updatedAt"
           FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
          [id]
        )
        
        if (updatedResult.rows.length > 0) {
          const updatedAssessment = updatedResult.rows[0]
          request.log.info({ 
            assessmentId: id, 
            hasRiskResponses: !!updatedAssessment.riskQuestionResponses,
            riskResponseCount: updatedAssessment.riskQuestionResponses ? Object.keys(updatedAssessment.riskQuestionResponses).length : 0
          }, 'Step2 data saved successfully')
          
          return reply.status(200).send({
            success: true,
            data: {
              id: updatedAssessment.id,
              userId: updatedAssessment.userId,
              projectId: updatedAssessment.projectId || null,
              systemDescription: updatedAssessment.systemDescription || null,
              industry: updatedAssessment.industry || null,
              systemCriticality: updatedAssessment.systemCriticality || null,
              selectedDomains: updatedAssessment.selectedDomains || [],
              riskQuestionResponses: updatedAssessment.riskQuestionResponses || {},
              userRiskScores: updatedAssessment.userRiskScores || {},
              riskNotes: updatedAssessment.riskNotes || {},
              additionalRiskElements: updatedAssessment.additionalRiskElements || [],
              createdAt: updatedAssessment.createdAt,
              updatedAt: updatedAssessment.updatedAt,
            },
          })
        }
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
        // Add id to the end of updateValues for WHERE clause
        updateValues.push(id)
        // Use the length of updateValues as the parameter index for WHERE clause
        const whereParamIndex = updateValues.length
        await query(
          `UPDATE "RiskAssessment" 
           SET ${updateFields.join(', ')}
           WHERE "id" = $${whereParamIndex}`,
          updateValues
        )
        
        // Fetch the updated assessment to return saved data
        const updatedResult = await query(
          `SELECT "id", "userId", "projectId", "systemDescription", "industry", 
                  "systemCriticality", "dataTypes", "dataSources", "technologyStack",
                  "selectedDomains", "jurisdictions", "complianceQuestionResponses",
                  "complianceScore", "complianceCoverageScore", "complianceCoverageDetails",
                  "complianceUserScores", "complianceNotes", "regulationIds",
                  "createdAt", "updatedAt"
           FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
          [id]
        )
        
        if (updatedResult.rows.length > 0) {
          const updatedAssessment = updatedResult.rows[0]
          request.log.info({ 
            assessmentId: id, 
            hasComplianceResponses: !!updatedAssessment.complianceQuestionResponses,
            complianceScore: updatedAssessment.complianceScore
          }, 'Step3 data saved successfully')
          
          return reply.status(200).send({
            success: true,
            data: {
              id: updatedAssessment.id,
              userId: updatedAssessment.userId,
              projectId: updatedAssessment.projectId || null,
              systemDescription: updatedAssessment.systemDescription || null,
              industry: updatedAssessment.industry || null,
              systemCriticality: updatedAssessment.systemCriticality || null,
              complianceQuestionResponses: updatedAssessment.complianceQuestionResponses || {},
              complianceScore: updatedAssessment.complianceScore || null,
              complianceCoverageScore: updatedAssessment.complianceCoverageScore || null,
              complianceCoverageDetails: updatedAssessment.complianceCoverageDetails || null,
              complianceUserScores: updatedAssessment.complianceUserScores || {},
              complianceNotes: updatedAssessment.complianceNotes || {},
              jurisdictions: updatedAssessment.jurisdictions || [],
              regulationIds: updatedAssessment.regulationIds || [],
              createdAt: updatedAssessment.createdAt,
              updatedAt: updatedAssessment.updatedAt,
            },
          })
        }
      }
    }

    // If we reach here, step was not 1, 2, or 3 - return generic success
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
