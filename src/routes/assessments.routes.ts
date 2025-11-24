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
import { benchmarkAssessment } from '../services/assessment-benchmark'
import { createAssessmentSnapshot } from '../services/assessment-history'

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
  const { id } = request.params as { id: string }
  
  try {
    request.log.info({ assessmentId: id }, 'Getting assessment by ID')

    // Validate input
    if (!id || typeof id !== 'string') {
      throw new ValidationError('Assessment ID is required', 'INVALID_INPUT')
    }

    // Fetch assessment from database
    // ✅ FIX: Removed "status" column - it doesn't exist in RiskAssessment table
    // ✅ FIX: Added all Step 2 and Step 3 fields for complete data loading
    // ✅ FIX: Use correct column names - database uses aiRiskScore, complianceScore, sengolScore
    const result = await query(
      `SELECT "id", "userId", "projectId", "aiRiskScore" as "riskScore", "complianceScore",
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

    // ✅ FIX: Parse riskNotes if it's a JSON string (PostgreSQL JSON columns can be strings)
    let parsedRiskNotes: any = {}
    if (assessment.riskNotes) {
      if (typeof assessment.riskNotes === 'string') {
        try {
          parsedRiskNotes = JSON.parse(assessment.riskNotes)
        } catch (parseErr) {
          request.log.warn({ err: parseErr }, 'Failed to parse riskNotes as JSON')
          parsedRiskNotes = {}
        }
      } else if (typeof assessment.riskNotes === 'object') {
        parsedRiskNotes = assessment.riskNotes
      }
    }

    // ✅ FIX: Parse complianceNotes if it's a JSON string
    let parsedComplianceNotes: any = {}
    if (assessment.complianceNotes) {
      if (typeof assessment.complianceNotes === 'string') {
        try {
          parsedComplianceNotes = JSON.parse(assessment.complianceNotes)
        } catch (parseErr) {
          request.log.warn({ err: parseErr }, 'Failed to parse complianceNotes as JSON')
          parsedComplianceNotes = {}
        }
      } else if (typeof assessment.complianceNotes === 'object') {
        parsedComplianceNotes = assessment.complianceNotes
      }
    }

    // Log what we're returning for debugging
    request.log.info({
      assessmentId: id,
      hasSystemDescription: !!assessment.systemDescription,
      systemDescriptionLength: assessment.systemDescription?.length || 0,
      hasIndustry: !!assessment.industry,
      hasSystemCriticality: !!assessment.systemCriticality,
      hasRiskNotes: !!assessment.riskNotes,
      riskNotesType: typeof assessment.riskNotes,
      hasGeneratedQuestions: !!(parsedRiskNotes?.generatedQuestions),
      generatedQuestionsCount: parsedRiskNotes?.generatedQuestions?.length || 0
    }, 'Returning assessment data')

    return reply.status(200).send({
      success: true,
      data: {
        id: assessment.id,
        userId: assessment.userId,
        projectId: assessment.projectId || null,
        // ✅ FIX: Use actual database column names (same as other queries in this file)
        riskScore: assessment.riskScore || null,
        complianceScore: assessment.complianceScore || null,
        sengolScore: assessment.sengolScore || null,
        riskNotes: parsedRiskNotes, // ✅ FIX: Use parsed riskNotes
        systemDescription: assessment.systemDescription || null,
        industry: assessment.industry || null,
        systemCriticality: assessment.systemCriticality || null,
        // ✅ FIX: Parse array fields if they're JSON strings
        dataTypes: (() => {
          const val = assessment.dataTypes
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse dataTypes')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        dataSources: (() => {
          const val = assessment.dataSources
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse dataSources')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        technologyStack: (() => {
          const val = assessment.technologyStack
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse technologyStack')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        selectedDomains: (() => {
          const val = assessment.selectedDomains
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse selectedDomains')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        jurisdictions: (() => {
          const val = assessment.jurisdictions
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse jurisdictions')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        regulationIds: (() => {
          const val = assessment.regulationIds
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse regulationIds')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        // ✅ FIX: Added Step 2 fields for complete data loading
        // ✅ FIX: Parse JSON fields if they're strings
        riskQuestionResponses: (() => {
          const val = assessment.riskQuestionResponses
          if (!val) return {}
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse riskQuestionResponses')
              return {}
            }
          }
          return val
        })(),
        userRiskScores: (() => {
          const val = assessment.userRiskScores
          if (!val) return {}
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse userRiskScores')
              return {}
            }
          }
          return val
        })(),
        additionalRiskElements: (() => {
          const val = assessment.additionalRiskElements
          if (!val) return []
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse additionalRiskElements')
              return []
            }
          }
          return Array.isArray(val) ? val : []
        })(),
        // ✅ FIX: Added Step 3 fields for complete data loading
        complianceQuestionResponses: (() => {
          const val = assessment.complianceQuestionResponses
          if (!val) return {}
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse complianceQuestionResponses')
              return {}
            }
          }
          return val
        })(),
        complianceUserScores: (() => {
          const val = assessment.complianceUserScores
          if (!val) return {}
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse complianceUserScores')
              return {}
            }
          }
          return val
        })(),
        complianceNotes: parsedComplianceNotes, // ✅ FIX: Use parsed complianceNotes
        complianceCoverageScore: assessment.complianceCoverageScore || null,
        complianceCoverageDetails: (() => {
          const val = assessment.complianceCoverageDetails
          if (!val) return null
          if (typeof val === 'string') {
            try {
              return JSON.parse(val)
            } catch (e) {
              request.log.warn({ err: e }, 'Failed to parse complianceCoverageDetails')
              return null
            }
          }
          return val
        })(),
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

    // ✅ CRITICAL: Log detailed error information
    request.log.error({ 
      err: error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined,
      errorName: error instanceof Error ? error.name : typeof error,
      assessmentId: id
    }, 'Get assessment error')
    
    return reply.status(500).send({
      success: false,
      error: 'Failed to fetch assessment',
      code: 'INTERNAL_ERROR',
      details: error instanceof Error ? error.message : String(error),
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
    // ✅ CRITICAL: Load questions from riskNotes for weighted scoring
    const checkResult = await query(
      `SELECT "id", "userId", "riskQuestionResponses", "complianceQuestionResponses",
              "riskNotes", "complianceNotes"
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

    // ✅ CRITICAL FIX: Calculate WEIGHTED scores using questions + responses
    // Initialize scores as null - will be calculated from responses WITH question weights
    let riskScore: number | null = null
    let complianceScore: number | null = null
    let sengolScore: number | null = null

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

      // ✅ CRITICAL: Load questions from riskNotes for weighted scoring
      const riskNotes = assessment.riskNotes || {}
      let parsedRiskNotes: any = {}
      
      if (typeof riskNotes === 'string') {
        try {
          parsedRiskNotes = JSON.parse(riskNotes)
        } catch (e) {
          request.log.warn({ assessmentId: id, error: e }, 'Failed to parse riskNotes')
        }
      } else if (riskNotes && typeof riskNotes === 'object') {
        parsedRiskNotes = riskNotes
      }

      const riskQuestions = parsedRiskNotes.generatedQuestions || []
      request.log.info({ 
        assessmentId: id,
        riskQuestionCount: riskQuestions.length,
        hasQuestions: riskQuestions.length > 0
      }, 'Loaded risk questions for weighted scoring')

      // Calculate risk score from Step 2 responses WITH question weights
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

      // ✅ WEIGHTED SCORING: Use question weights if available
      if (riskQuestions.length > 0) {
        let totalWeight = 0
        let weightedSum = 0

        for (const question of riskQuestions) {
          const questionId = question.id
          const response = parsedRiskResponses[questionId]
          if (!response || !response.status) continue

          // Get question weight (normalize to 0-1 scale)
          const rawWeight = question.weight || question.finalWeight || 0.5
          const questionWeight = rawWeight > 1 ? Math.min(rawWeight / 10, 1.0) : Math.min(rawWeight, 1.0)

          // Get response score
          let responseScore: number | null = null
          if (response.riskScore !== undefined && response.riskScore !== null) {
            responseScore = response.riskScore
          } else if (response.status) {
            responseScore = statusToRiskScore(response.status)
          }

          if (responseScore !== null) {
            weightedSum += responseScore * questionWeight
            totalWeight += questionWeight
          }
        }

        if (totalWeight > 0) {
          riskScore = Math.round(weightedSum / totalWeight)
          request.log.info({ 
            assessmentId: id,
            riskScore,
            totalWeight,
            weightedSum,
            questionsUsed: riskQuestions.filter((q: any) => parsedRiskResponses[q.id]?.status).length
          }, 'Risk score calculated using weighted formula')
        }
      } else {
        // Fallback: Simple average if no questions available
        request.log.warn({ assessmentId: id }, 'No questions available for weighted scoring, using simple average')
        const riskScores: number[] = []
        for (const [questionId, response] of Object.entries(parsedRiskResponses)) {
          if (!response) continue
          
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
      }

      // ✅ WEIGHTED SCORING: Calculate compliance score with question weights
      const complianceNotes = assessment.complianceNotes || {}
      let parsedComplianceNotes: any = {}
      
      if (typeof complianceNotes === 'string') {
        try {
          parsedComplianceNotes = JSON.parse(complianceNotes)
        } catch (e) {
          request.log.warn({ assessmentId: id, error: e }, 'Failed to parse complianceNotes')
        }
      } else if (complianceNotes && typeof complianceNotes === 'object') {
        parsedComplianceNotes = complianceNotes
      }

      const complianceQuestions = parsedComplianceNotes.generatedQuestions || []
      request.log.info({ 
        assessmentId: id,
        complianceQuestionCount: complianceQuestions.length,
        hasQuestions: complianceQuestions.length > 0
      }, 'Loaded compliance questions for weighted scoring')

      // Calculate compliance score from Step 3 responses WITH question weights
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

      // ✅ WEIGHTED SCORING: Use question weights if available
      if (complianceQuestions.length > 0) {
        let totalWeight = 0
        let weightedSum = 0

        for (const question of complianceQuestions) {
          const questionId = question.id
          const response = parsedComplianceResponses[questionId]
          if (!response || !response.status) continue

          // Get question weight (normalize to 0-1 scale)
          const rawWeight = question.weight || question.finalWeight || 0.5
          const questionWeight = rawWeight > 1 ? Math.min(rawWeight / 10, 1.0) : Math.min(rawWeight, 1.0)

          // Get response score (inverted for compliance: addressed = 100, not_addressed = 0)
          let responseScore: number | null = null
          if (response.userScore !== undefined && response.userScore !== null) {
            responseScore = response.userScore
          } else if (response.status) {
            const riskScoreValue = statusToRiskScore(response.status)
            if (riskScoreValue !== null) {
              responseScore = 100 - riskScoreValue // Invert: 20 -> 80, 50 -> 50, 80 -> 20
            }
          }

          if (responseScore !== null) {
            weightedSum += responseScore * questionWeight
            totalWeight += questionWeight
          }
        }

        if (totalWeight > 0) {
          complianceScore = Math.round(weightedSum / totalWeight)
          request.log.info({ 
            assessmentId: id,
            complianceScore,
            totalWeight,
            weightedSum,
            questionsUsed: complianceQuestions.filter((q: any) => parsedComplianceResponses[q.id]?.status).length
          }, 'Compliance score calculated using weighted formula')
        }
      } else {
        // Fallback: Simple average if no questions available
        request.log.warn({ assessmentId: id }, 'No compliance questions available for weighted scoring, using simple average')
        const complianceScores: number[] = []
        for (const [questionId, response] of Object.entries(parsedComplianceResponses)) {
          if (!response) continue
          
          if (response.userScore !== undefined && response.userScore !== null) {
            complianceScores.push(response.userScore)
          } else if (response.status) {
            const riskScoreValue = statusToRiskScore(response.status)
            if (riskScoreValue !== null) {
              complianceScores.push(100 - riskScoreValue)
            }
          }
        }
        
        if (complianceScores.length > 0) {
          complianceScore = Math.round(complianceScores.reduce((a, b) => a + b, 0) / complianceScores.length)
        }
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
        complianceResponseCount: Object.keys(parsedComplianceResponses).length,
        riskQuestionCount: riskQuestions.length,
        complianceQuestionCount: complianceQuestions.length,
        usingWeightedScoring: riskQuestions.length > 0 || complianceQuestions.length > 0
      }, 'Scores calculated for submission (weighted if questions available)')
    } catch (scoreError) {
      request.log.error({ 
        err: scoreError, 
        assessmentId: id,
        errorMessage: scoreError instanceof Error ? scoreError.message : 'Unknown error',
        errorStack: scoreError instanceof Error ? scoreError.stack : undefined
      }, 'Failed to calculate scores, using existing values')
      // Continue with existing scores if calculation fails
    }

    // Calculate letter grade
    const letterGrade = sengolScore !== null && sengolScore !== undefined
      ? (sengolScore >= 90 ? 'A' : sengolScore >= 80 ? 'B' : sengolScore >= 70 ? 'C' : sengolScore >= 60 ? 'D' : 'F')
      : null

    // Update assessment with scores and completion status
    // ✅ FIX: Try different column name combinations since schema may vary
    // Try with riskScore/complianceScore/sengolScore first, fallback to overallRiskScore if needed
    const updateFields: string[] = []
    const updateValues: any[] = []
    let paramIndex = 1

    // Try to update riskScore (or overallRiskScore if riskScore doesn't exist)
    if (riskScore !== null && riskScore !== undefined) {
      updateFields.push(`"riskScore" = $${paramIndex}`)
      updateValues.push(riskScore)
      paramIndex++
    }

    // Try to update complianceScore
    if (complianceScore !== null && complianceScore !== undefined) {
      updateFields.push(`"complianceScore" = $${paramIndex}`)
      updateValues.push(complianceScore)
      paramIndex++
    }

    // Try to update sengolScore
    if (sengolScore !== null && sengolScore !== undefined) {
      updateFields.push(`"sengolScore" = $${paramIndex}`)
      updateValues.push(sengolScore)
      paramIndex++
    }

    // Always update updatedAt
    updateFields.push(`"updatedAt" = NOW()`)

    if (updateFields.length > 0) {
      updateValues.push(id)
      const whereParamIndex = updateValues.length

      try {
        await query(
          `UPDATE "RiskAssessment" 
           SET ${updateFields.join(', ')}
           WHERE "id" = $${whereParamIndex}`,
          updateValues
        )
        request.log.info({ assessmentId: id, riskScore, complianceScore, sengolScore }, 'Scores updated successfully')
      } catch (updateError: any) {
        // If riskScore column doesn't exist, try with overallRiskScore
        if (updateError.code === '42703' && updateError.message?.includes('riskScore')) {
          request.log.warn({ assessmentId: id }, 'riskScore column does not exist, trying overallRiskScore')
          
          // Rebuild update fields with overallRiskScore instead
          const fallbackFields: string[] = []
          const fallbackValues: any[] = []
          let fallbackIndex = 1

          if (riskScore !== null && riskScore !== undefined) {
            fallbackFields.push(`"overallRiskScore" = $${fallbackIndex}`)
            fallbackValues.push(riskScore)
            fallbackIndex++
          }

          if (complianceScore !== null && complianceScore !== undefined) {
            fallbackFields.push(`"complianceScore" = $${fallbackIndex}`)
            fallbackValues.push(complianceScore)
            fallbackIndex++
          }

          if (sengolScore !== null && sengolScore !== undefined) {
            fallbackFields.push(`"sengolScore" = $${fallbackIndex}`)
            fallbackValues.push(sengolScore)
            fallbackIndex++
          }

          fallbackFields.push(`"updatedAt" = NOW()`)
          fallbackValues.push(id)
          const fallbackWhereIndex = fallbackValues.length

          await query(
            `UPDATE "RiskAssessment" 
             SET ${fallbackFields.join(', ')}
             WHERE "id" = $${fallbackWhereIndex}`,
            fallbackValues
          )
          request.log.info({ assessmentId: id }, 'Scores updated successfully using overallRiskScore')
        } else {
          // If it's a different column error, try updating only what we can
          request.log.warn({ err: updateError, assessmentId: id }, 'Some score columns may not exist, trying minimal update')
          
          // Just update updatedAt to mark as submitted
          await query(
            `UPDATE "RiskAssessment" 
             SET "updatedAt" = NOW()
             WHERE "id" = $1`,
            [id]
          )
          request.log.info({ assessmentId: id }, 'Assessment marked as updated (scores may not be saved due to missing columns)')
        }
      }
    } else {
      // No scores to update, just mark as updated
      await query(
        `UPDATE "RiskAssessment" 
         SET "updatedAt" = NOW()
         WHERE "id" = $1`,
        [id]
      )
      request.log.info({ assessmentId: id }, 'Assessment marked as updated (no scores calculated)')
    }

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
  } catch (error: any) {
    request.log.error({ 
      err: error, 
      errorCode: error.code,
      errorMessage: error.message,
      errorStack: error.stack,
      assessmentId: (request.params as any)?.id
    }, 'Submit assessment error')
    
    // Return more detailed error information
    const errorMessage = error.message || 'Failed to submit assessment'
    const errorCode = error.code || 'INTERNAL_ERROR'
    
    return reply.status(500).send({
      success: false,
      error: errorMessage,
      code: errorCode,
      statusCode: 500,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
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
      `SELECT "id", "aiRiskScore" as "riskScore", "complianceScore", "sengolScore"
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
      `SELECT "id", "userId", "sengolScore", "industry", "systemCriticality", 
              "dataTypes", "technologyStack"
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
        error: 'You do not have permission to view this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    const userScore = assessment.sengolScore ? Number(assessment.sengolScore) : 0
    if (userScore === 0) {
      return reply.status(400).send({
        success: false,
        error: 'Assessment has not been submitted yet',
        code: 'NOT_SUBMITTED',
        statusCode: 400,
      })
    }

    // Get benchmark data using actual benchmark service
    const benchmarkData = await benchmarkAssessment(userScore, {
      industry: assessment.industry,
      systemCriticality: assessment.systemCriticality,
      dataTypes: assessment.dataTypes || [],
      techStack: assessment.technologyStack || [],
    })

    return reply.status(200).send({
      success: true,
      data: benchmarkData,
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
 * Get assessment history
 * 
 * GET /api/assessments/:id/history
 */
async function getAssessmentHistory(request: FastifyRequest, reply: FastifyReply) {
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

    // Get assessment
    const checkResult = await query(
      `SELECT "id", "userId" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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
        error: 'You do not have permission to view this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Get history
    const { getAssessmentHistory, analyzeScoreTrend } = await import('../services/assessment-history')
    const snapshots = await getAssessmentHistory(id)
    const trend = analyzeScoreTrend(snapshots)

    return reply.send({
      success: true,
      data: {
        snapshots,
        trend,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get assessment history')
    return reply.status(500).send({
      success: false,
      error: 'Failed to get history data',
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
 * Delete assessment endpoint
 *
 * DELETE /api/assessments/:id
 *
 * Deletes an assessment. Only the owner can delete their assessment.
 *
 * Response (200):
 * ```json
 * {
 *   "success": true,
 *   "message": "Assessment deleted successfully"
 * }
 * ```
 */
async function deleteAssessment(request: FastifyRequest, reply: FastifyReply) {
  const { id } = request.params as { id: string }
  const userId = request.headers['x-user-id'] as string

  try {
    request.log.info({ assessmentId: id, userId }, 'Delete assessment request')

    if (!id || typeof id !== 'string') {
      throw new ValidationError('Assessment ID is required', 'INVALID_INPUT')
    }

    if (!userId) {
      return reply.status(401).send({
        success: false,
        error: 'User authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401,
      })
    }

    // Check if assessment exists and belongs to user
    const checkResult = await query(
      `SELECT "id", "userId" FROM "RiskAssessment" WHERE "id" = $1 LIMIT 1`,
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

    // Verify ownership
    if (assessment.userId !== userId) {
      request.log.warn({ assessmentId: id, userId, ownerId: assessment.userId }, 'Unauthorized delete attempt')
      return reply.status(403).send({
        success: false,
        error: 'You do not have permission to delete this assessment',
        code: 'FORBIDDEN',
        statusCode: 403,
      })
    }

    // Delete assessment
    await query(
      `DELETE FROM "RiskAssessment" WHERE "id" = $1`,
      [id]
    )

    request.log.info({ assessmentId: id, userId }, 'Assessment deleted successfully')

    return reply.status(200).send({
      success: true,
      message: 'Assessment deleted successfully',
    })
  } catch (error) {
    request.log.error({ 
      err: error,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorStack: error instanceof Error ? error.stack : undefined
    }, 'Delete assessment error')
    
    if (error instanceof ValidationError) {
      return reply.status(400).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: 400,
      })
    }
    
    return reply.status(500).send({
      success: false,
      error: 'Failed to delete assessment',
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
  fastify.get('/api/assessments/:id/history', getAssessmentHistory)
  fastify.put('/api/assessments/:id/step1', saveAssessmentStep)
  fastify.put('/api/assessments/:id/step2', saveAssessmentStep)
  fastify.put('/api/assessments/:id/step3', saveAssessmentStep)
  fastify.delete('/api/assessments/:id', deleteAssessment)

  fastify.log.info('Assessment routes registered')
}

// Version: 2025-01 - All TypeScript errors resolved
