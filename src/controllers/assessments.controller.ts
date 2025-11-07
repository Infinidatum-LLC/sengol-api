import { FastifyRequest, FastifyReply } from 'fastify'
import { resilientPrisma } from '../lib/prisma-resilient'
import { ValidationError, NotFoundError, AuthorizationError } from '../lib/errors'
import { checkAssessmentLimit, getUserTier } from '../services/feature-gates.service'
import { findSimilarIncidents, calculateIncidentStatistics } from '../services/incident-search'

// Get raw Prisma client for operations (wrapped with resilient patterns)
const prisma = resilientPrisma.getRawClient()

// ============================================================================
// POST /api/assessments - Create new assessment
// ============================================================================

interface CreateAssessmentBody {
  name: string
  projectId: string
  userId: string // Passed from auth middleware
}

export async function createAssessmentController(
  request: FastifyRequest<{ Body: CreateAssessmentBody }>,
  reply: FastifyReply
) {
  try {
    const { name, projectId, userId } = request.body

    if (!name || !projectId || !userId) {
      throw new ValidationError('name, projectId, and userId are required')
    }

    request.log.info({ userId, projectId, name }, 'Creating assessment')

    // Check assessment limit
    const limitCheck = await checkAssessmentLimit(userId)

    if (!limitCheck.allowed) {
      return reply.code(403).send({
        success: false,
        ...limitCheck.error,
      })
    }

    // Verify project exists and belongs to user (with retry)
    const project = await resilientPrisma.executeQuery(
      async () => {
        return await prisma.project.findUnique({
          where: { id: projectId },
        })
      },
      {
        operationName: 'findProject',
        maxRetries: 2,
        timeout: 5000,
      }
    )

    if (!project) {
      throw new NotFoundError('Project not found')
    }

    if (project.userId !== userId) {
      throw new AuthorizationError('You do not have access to this project')
    }

    // Create assessment with required fields (with retry)
    const assessment = await resilientPrisma.executeQuery(
      async () => {
        return await prisma.riskAssessment.create({
          data: {
            name,
            userId,
            projectId,
            analysisStatus: 'draft',
            industry: '',
            companySize: 'small',
            businessImpact: {},
            budgetRange: '0-10k',
            timeline: '1-3 months',
            teamSize: 1,
            overallRiskScore: 0,
          },
        })
      },
      {
        operationName: 'createAssessment',
        maxRetries: 2,
        timeout: 8000,
      }
    )

    request.log.info({ assessmentId: assessment.id }, 'Assessment created')

    return reply.send({
      success: true,
      data: assessment,
      usage: {
        current: limitCheck.current! + 1,
        limit: limitCheck.limit,
        remaining: limitCheck.remaining! - 1,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to create assessment')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to create assessment',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// GET /api/assessments/:id - Get assessment
// ============================================================================

interface GetAssessmentParams {
  id: string
}

interface GetAssessmentQuery {
  userId: string
}

export async function getAssessmentController(
  request: FastifyRequest<{ Params: GetAssessmentParams; Querystring: GetAssessmentQuery }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
      include: {
        project: true,
      },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    return reply.send({
      success: true,
      data: assessment,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get assessment')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to get assessment',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// PUT /api/assessments/:id/step1 - Update step 1 (system description)
// ============================================================================

interface UpdateStep1Body {
  userId: string
  systemDescription: string
  selectedDomains?: string[]
  jurisdictions?: string[]
  industry?: string
  deployment?: string
  systemCriticality?: string
  dataTypes?: string[]
  techStack?: string[]
}

export async function updateAssessmentStep1Controller(
  request: FastifyRequest<{ Params: GetAssessmentParams; Body: UpdateStep1Body }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId, systemDescription, selectedDomains, jurisdictions, industry, deployment, systemCriticality, dataTypes, techStack } = request.body

    if (!userId || !systemDescription) {
      throw new ValidationError('userId and systemDescription are required')
    }

    // Verify ownership
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    // Update assessment with all Step 1 fields
    const updated = await prisma.riskAssessment.update({
      where: { id },
      data: {
        systemDescription,
        jurisdictions: jurisdictions || [],
        industry: industry || assessment.industry,
        systemCriticality: systemCriticality || assessment.systemCriticality,
        dataTypes: dataTypes || [],
        techStack: techStack || [],
        ...(deployment && { deploymentEnv: deployment }),
      },
    })

    return reply.send({
      success: true,
      data: updated,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to update step 1')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to update step 1',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// PUT /api/assessments/:id/step2 - Update step 2 (risk questions)
// ============================================================================

interface UpdateStep2Body {
  userId: string
  riskResponses: Record<string, any>
  riskScore?: number
}

export async function updateAssessmentStep2Controller(
  request: FastifyRequest<{ Params: GetAssessmentParams; Body: UpdateStep2Body }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId, riskResponses, riskScore } = request.body

    if (!userId || !riskResponses) {
      throw new ValidationError('userId and riskResponses are required')
    }

    // Verify ownership
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    // Update assessment with risk responses
    const updated = await prisma.riskAssessment.update({
      where: { id },
      data: {
        riskQuestionResponses: riskResponses,
        aiRiskScore: riskScore || null,
      },
    })

    return reply.send({
      success: true,
      data: updated,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to update step 2')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to update step 2',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// PUT /api/assessments/:id/step3 - Update step 3 (compliance questions)
// ============================================================================

interface UpdateStep3Body {
  userId: string
  complianceResponses: Record<string, any>
  complianceScore?: number
}

export async function updateAssessmentStep3Controller(
  request: FastifyRequest<{ Params: GetAssessmentParams; Body: UpdateStep3Body }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId, complianceResponses, complianceScore } = request.body

    if (!userId || !complianceResponses) {
      throw new ValidationError('userId and complianceResponses are required')
    }

    // Verify ownership
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    // Update assessment with compliance responses
    const updated = await prisma.riskAssessment.update({
      where: { id },
      data: {
        complianceDetails: complianceResponses,
        complianceScore: complianceScore || null,
      },
    })

    return reply.send({
      success: true,
      data: updated,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to update step 3')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to update step 3',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// POST /api/assessments/:id/submit - Submit assessment
// ============================================================================

interface SubmitAssessmentBody {
  userId: string
  finalSengolScore?: number
}

export async function submitAssessmentController(
  request: FastifyRequest<{ Params: GetAssessmentParams; Body: SubmitAssessmentBody }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId, finalSengolScore } = request.body

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    // Verify ownership
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    // Update assessment as completed
    const updated = await prisma.riskAssessment.update({
      where: { id },
      data: {
        analysisStatus: 'complete',
        sengolScore: finalSengolScore || null,
        analysisCompletedAt: new Date(),
      },
    })

    request.log.info({ assessmentId: id }, 'Assessment submitted')

    return reply.send({
      success: true,
      data: updated,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to submit assessment')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to submit assessment',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// GET /api/assessments/:id/scores - Get scores
// ============================================================================

export async function getAssessmentScoresController(
  request: FastifyRequest<{ Params: GetAssessmentParams; Querystring: GetAssessmentQuery }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
      select: {
        id: true,
        aiRiskScore: true,
        cyberRiskScore: true,
        cloudRiskScore: true,
        complianceScore: true,
        sengolScore: true,
        overallRiskScore: true,
        userId: true,
      },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    // If sengolScore is null but overallRiskScore exists, use it
    const sengolScore = assessment.sengolScore ?? (
      assessment.overallRiskScore ? Math.round(Number(assessment.overallRiskScore)) : null
    )

    // Provide default values if scores are null to prevent frontend errors
    return reply.send({
      success: true,
      data: {
        aiRiskScore: assessment.aiRiskScore ?? null,
        cyberRiskScore: assessment.cyberRiskScore ?? null,
        cloudRiskScore: assessment.cloudRiskScore ?? null,
        complianceScore: assessment.complianceScore ?? null,
        sengolScore: sengolScore,
        overallRiskScore: assessment.overallRiskScore ? Number(assessment.overallRiskScore) : null,
      },
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get scores')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to get scores',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// GET /api/assessments/:id/benchmark - Get industry benchmark
// ============================================================================

export async function getAssessmentBenchmarkController(
  request: FastifyRequest<{ Params: GetAssessmentParams; Querystring: GetAssessmentQuery }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        overallRiskScore: true,
        sengolScore: true,
        industry: true,
        systemDescription: true,
        name: true,
      },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    // Use sengolScore if available, otherwise use overallRiskScore
    // Convert Float to integer for consistency with frontend
    const userScore = assessment.sengolScore
      ? Number(assessment.sengolScore)
      : assessment.overallRiskScore
      ? Math.round(Number(assessment.overallRiskScore))
      : 0

    if (userScore === 0) {
      // No score available yet
      return reply.send({
        userScore: 0,
        benchmark: null,
        comparison: null,
        isFallback: false,
        fallbackMessage: null,
        message: 'Assessment score not yet calculated. Please complete and submit the assessment.',
      })
    }

    // Get industry and system description (required for benchmarking)
    const industry = assessment.industry || 'Technology'
    const systemDescription = assessment.systemDescription || assessment.name || 'AI System'
    // Infer AI system type from name or description (simplified for now)
    const aiSystemType = assessment.name || 'AI System'

    // Get benchmark data using the new service
    const { getBenchmarkData } = await import('../services/benchmark.service')
    const benchmarkData = await getBenchmarkData({
      userScore,
      industry,
      systemDescription,
      aiSystemType,
    })

    return reply.send(benchmarkData)
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get benchmark')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(503).send({
      error: 'Benchmark service unavailable',
      details: error instanceof Error ? error.message : 'Unknown error',
    })
  }
}

// ============================================================================
// GET /api/assessments/:id/similar-cases - Get similar incidents
// ============================================================================

export async function getAssessmentSimilarCasesController(
  request: FastifyRequest<{ Params: GetAssessmentParams; Querystring: GetAssessmentQuery & { limit?: string } }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { userId, limit: limitStr } = request.query

    if (!userId) {
      throw new ValidationError('userId is required')
    }

    const limit = limitStr ? parseInt(limitStr) : 20

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
    })

    if (!assessment) {
      throw new NotFoundError('Assessment not found')
    }

    if (assessment.userId !== userId) {
      throw new AuthorizationError('You do not have access to this assessment')
    }

    if (!assessment.systemDescription) {
      throw new ValidationError('Assessment must have system description')
    }

    // Find similar incidents
    const incidents = await findSimilarIncidents(assessment.systemDescription, {
      limit,
      minSimilarity: 0.7,
      industry: assessment.industry || undefined,
    })

    return reply.send({
      success: true,
      data: incidents.map(incident => ({
        id: incident.incidentId,
        type: incident.incidentType,
        organization: incident.organization,
        industry: incident.industry,
        severity: incident.severity,
        date: incident.incidentDate,
        similarity: incident.similarity,
        description: incident.embeddingText,
        estimatedCost: incident.estimatedCost ? Number(incident.estimatedCost) : null,
        recordsAffected: incident.recordsAffected,
      })),
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to get similar cases')

    if (error instanceof ValidationError || error instanceof NotFoundError || error instanceof AuthorizationError) {
      return reply.code(error.statusCode).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: error.statusCode,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to get similar cases',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
