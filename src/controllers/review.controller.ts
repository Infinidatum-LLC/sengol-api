import { FastifyRequest, FastifyReply } from 'fastify'
import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { generateDynamicQuestions } from '../services/dynamic-question-generator'
import { analyzeSystem } from '../services/system-analysis.service'
import { ValidationError } from '../lib/errors'

// ============================================================================
// POST /api/review/analyze-system
// ============================================================================

interface AnalyzeSystemBody {
  systemDescription: string
}

export async function analyzeSystemController(
  request: FastifyRequest<{ Body: AnalyzeSystemBody }>,
  reply: FastifyReply
) {
  try {
    const { systemDescription } = request.body

    if (!systemDescription || typeof systemDescription !== 'string' || systemDescription.trim().length === 0) {
      throw new ValidationError('systemDescription is required and must be a non-empty string')
    }

    request.log.info({
      descriptionLength: systemDescription.length
    }, 'Analyzing system')

    const suggestions = await analyzeSystem(systemDescription)

    return reply.send({
      success: true,
      suggestions,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to analyze system')

    if (error instanceof ValidationError) {
      return reply.code(400).send({
        success: false,
        error: error.message,
        code: error.code,
        statusCode: 400,
      })
    }

    return reply.code(500).send({
      success: false,
      error: 'Failed to analyze system',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// POST /api/review/:id/generate-questions
// ============================================================================

interface GenerateQuestionsParams {
  id: string
}

interface GenerateQuestionsBody {
  systemDescription?: string
  selectedDomains?: string[]
  jurisdictions?: string[]
  industry?: string
  selectedTech?: string[]
  customTech?: string[]
  questionIntensity?: 'high' | 'medium' | 'low' // Optional intensity filter
  forceRegenerate?: boolean // Force bypass all caches and regenerate from scratch
}

export async function generateQuestionsController(
  request: FastifyRequest<{
    Params: GenerateQuestionsParams
    Body: GenerateQuestionsBody
  }>,
  reply: FastifyReply
) {
  const { id } = request.params
  const {
    systemDescription: requestSystemDescription,
    selectedDomains: requestDomains,
    jurisdictions: requestJurisdictions,
    industry: requestIndustry,
    selectedTech,
    customTech,
    questionIntensity,
    forceRegenerate
  } = request.body

  try {
    // Get assessment
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id }
    })

    if (!assessment) {
      return reply.code(404).send({ error: 'Assessment not found' })
    }

    // TODO: Add auth check when auth is implemented
    // if (assessment.userId !== request.user.userId) {
    //   return reply.code(403).send({ error: 'Forbidden' })
    // }

    // Use request body values if provided, otherwise fall back to database values
    const systemDescription = requestSystemDescription || assessment.systemDescription
    // ✅ FIX: Properly handle empty arrays - check both falsy AND length > 0
    const selectedDomains = (
      requestDomains && requestDomains.length > 0
        ? requestDomains
        : assessment.selectedDomains && assessment.selectedDomains.length > 0
          ? assessment.selectedDomains
          : ['ai', 'cyber', 'cloud'] // Always default to all domains if none specified
    )
    const jurisdictions = requestJurisdictions || assessment.jurisdictions || []
    const industry = requestIndustry || assessment.industry

    // Validate systemDescription exists (either from request or database)
    if (!systemDescription || typeof systemDescription !== 'string' || systemDescription.trim().length === 0) {
      return reply.code(400).send({
        error: 'System description is required',
        message: 'Please provide a system description or ensure the assessment has one saved'
      })
    }

    console.log(`[GENERATE_QUESTIONS] Assessment: ${id}`)
    console.log(`[GENERATE_QUESTIONS] System: ${systemDescription.substring(0, 100)}...`)
    console.log(`[GENERATE_QUESTIONS] Domains: ${selectedDomains.join(', ')}`)
    if (questionIntensity) {
      console.log(`[GENERATE_QUESTIONS] Intensity: ${questionIntensity}`)
    }
    if (forceRegenerate) {
      console.log(`[GENERATE_QUESTIONS] Force Regenerate: ENABLED - Clearing all caches`)

      // Clear database cache (use Prisma.JsonNull for JSONB null values)
      await prisma.riskAssessment.update({
        where: { id },
        data: {
          riskNotes: Prisma.JsonNull,
          complianceNotes: Prisma.JsonNull,
          questionGeneratedAt: null
        }
      })
    }

    // Generate questions
    const result = await generateDynamicQuestions({
      systemDescription,
      selectedDomains,
      jurisdictions,
      industry,
      techStack: [...(selectedTech || []), ...(customTech || [])],
      questionIntensity: questionIntensity || 'high', // Default to high if not specified
      forceRegenerate: forceRegenerate || false // Pass through to service layer
    })

    return reply.send({
      success: true,
      data: {
        riskQuestions: result.riskQuestions,
        complianceQuestions: result.complianceQuestions,
        scoringFormula: result.scoringFormula,
        incidentSummary: result.incidentSummary,
        generationMetadata: result.generationMetadata
      }
    })
  } catch (error) {
    console.error('[GENERATE_QUESTIONS] Error:', error)
    return reply.code(500).send({
      error: 'Failed to generate questions',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

interface SaveQuestionsBody {
  riskQuestions: any[]
  complianceQuestions: any[]
  userId: string
}

export async function saveQuestionsController(
  request: FastifyRequest<{
    Params: GenerateQuestionsParams
    Body: SaveQuestionsBody
  }>,
  reply: FastifyReply
) {
  const { id } = request.params
  const { riskQuestions = [], complianceQuestions = [], userId } = request.body

  try {
    // Verify userId is provided
    if (!userId) {
      return reply.code(400).send({
        error: 'userId is required',
        status: 400
      })
    }

    // Get assessment
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id }
    })

    if (!assessment) {
      return reply.code(404).send({
        error: 'Assessment not found',
        status: 404
      })
    }

    // CRITICAL: Verify ownership
    if (assessment.userId !== userId) {
      return reply.code(403).send({
        error: 'Forbidden - You do not own this assessment',
        status: 403
      })
    }

    // Update assessment with generated questions
    const existingRiskNotes = (assessment.riskNotes as any) || {}
    const existingComplianceNotes = (assessment.complianceNotes as any) || {}

    await prisma.riskAssessment.update({
      where: { id },
      data: {
        riskNotes: {
          ...existingRiskNotes,
          generatedQuestions: riskQuestions,
          savedAt: new Date().toISOString()
        },
        complianceNotes: {
          ...existingComplianceNotes,
          generatedQuestions: complianceQuestions,
          savedAt: new Date().toISOString()
        },
        questionGeneratedAt: new Date(),
        updatedAt: new Date()
      }
    })

    request.log.info({
      assessmentId: id,
      riskCount: riskQuestions.length,
      complianceCount: complianceQuestions.length
    }, 'Questions saved successfully')

    return reply.send({
      success: true,
      message: 'Questions saved successfully',
      counts: {
        risk: riskQuestions.length,
        compliance: complianceQuestions.length
      }
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to save questions')
    return reply.code(500).send({
      error: 'Failed to save questions',
      message: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    })
  }
}
