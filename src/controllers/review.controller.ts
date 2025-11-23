import { FastifyRequest, FastifyReply } from 'fastify'
import { selectOne, updateOne } from '../lib/db-queries'
import { generateDynamicQuestions } from '../services/dynamic-question-generator'
import { analyzeSystem } from '../services/system-analysis.service'
import { ValidationError, AuthenticationError } from '../lib/errors'
import { getUserId, requireResourceOwnership } from '../middleware/jwt-auth'

// ============================================================================
// TYPES
// ============================================================================

interface RiskAssessment {
  id: string
  userId: string
  systemDescription: string
  selectedDomains?: any
  jurisdictions?: any
  industry?: string
  riskNotes?: any
  complianceNotes?: any
  questionGeneratedAt?: Date
  updatedAt?: Date
  [key: string]: any
}

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
  skipIncidentSearch?: boolean // NEW: Skip incident search for faster generation (5-10s vs 30-120s)
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
    forceRegenerate,
    skipIncidentSearch = false
  } = request.body

  try {
    // Get assessment
    const assessment = await selectOne<RiskAssessment>('RiskAssessment', { id })

    if (!assessment) {
      return reply.code(404).send({ error: 'Assessment not found' })
    }

    // Auth check - verify user owns this assessment
    const userId = getUserId(request)
    if (!userId) {
      return reply.code(401).send({ 
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401
      })
    }

    try {
      requireResourceOwnership(userId, assessment.userId)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return reply.code(403).send({ 
          success: false,
          error: error.message,
          code: 'FORBIDDEN',
          statusCode: 403
        })
      }
      throw error
    }

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
      request.log.error({
        assessmentId: id,
        hasRequestSystemDescription: !!requestSystemDescription,
        hasDbSystemDescription: !!assessment.systemDescription,
        requestSystemDescriptionLength: requestSystemDescription?.length || 0,
        dbSystemDescriptionLength: assessment.systemDescription?.length || 0
      }, 'System description validation failed')
      return reply.code(400).send({
        success: false,
        error: 'System description is required',
        message: 'Please provide a system description in the request body or ensure the assessment has one saved. The system description must be at least 50 characters.',
        code: 'MISSING_SYSTEM_DESCRIPTION',
        statusCode: 400
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

      // Clear database cache
      await updateOne<RiskAssessment>('RiskAssessment', {
        riskNotes: null,
        complianceNotes: null,
        questionGeneratedAt: null
      }, { id })
    }

    if (skipIncidentSearch) {
      console.log(`[GENERATE_QUESTIONS] Skip Incident Search: ENABLED - Questions will be generated without incident analysis`)
    }

    // Generate questions
    request.log.info({
      assessmentId: id,
      systemDescriptionLength: systemDescription.length,
      selectedDomains,
      jurisdictions,
      industry,
      questionIntensity: questionIntensity || 'high',
      skipIncidentSearch
    }, 'Starting question generation')

    let result
    try {
      result = await generateDynamicQuestions({
        systemDescription,
        selectedDomains,
        jurisdictions,
        industry,
        techStack: [...(selectedTech || []), ...(customTech || [])],
        questionIntensity: questionIntensity || 'high', // Default to high if not specified
        skipIncidentSearch: skipIncidentSearch // Pass through the parameter to control incident search behavior
      })
      request.log.info({
        assessmentId: id,
        riskQuestionsCount: result.riskQuestions?.length || 0,
        complianceQuestionsCount: result.complianceQuestions?.length || 0
      }, 'Question generation completed successfully')
    } catch (error) {
      request.log.error({
        err: error,
        assessmentId: id,
        systemDescriptionLength: systemDescription.length,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Question generation failed')
      throw error
    }

    // Build response based on whether incidents were included
    const responseData: any = {
      riskQuestions: result.riskQuestions,
      complianceQuestions: result.complianceQuestions,
      scoringFormula: result.scoringFormula,
      generationMetadata: result.generationMetadata
    }

    // Only include incident summary if NOT skipped
    if (!skipIncidentSearch && result.incidentSummary) {
      responseData.incidentSummary = result.incidentSummary
    }

    return reply.send({
      success: true,
      data: responseData
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
  const { riskQuestions = [], complianceQuestions = [] } = request.body

  try {
    // Auth check - verify user is authenticated
    // Get userId from header (x-user-id) or from JWT if available
    const userId = (request.headers['x-user-id'] as string) || getUserId(request)
    if (!userId) {
      request.log.warn({
        hasXUserId: !!request.headers['x-user-id'],
        hasJwtUserId: !!getUserId(request)
      }, 'Missing userId in save questions request')
      return reply.code(401).send({ 
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401
      })
    }

    // Get assessment
    const assessment = await selectOne<RiskAssessment>('RiskAssessment', { id })

    if (!assessment) {
      return reply.code(404).send({
        success: false,
        error: 'Assessment not found',
        code: 'NOT_FOUND',
        statusCode: 404
      })
    }

    // CRITICAL: Verify ownership
    try {
      requireResourceOwnership(userId, assessment.userId)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return reply.code(403).send({
          success: false,
          error: error.message,
          code: 'FORBIDDEN',
          statusCode: 403
        })
      }
      throw error
    }

    // Update assessment with generated questions
    const existingRiskNotes = (assessment.riskNotes as any) || {}
    const existingComplianceNotes = (assessment.complianceNotes as any) || {}

    const updatedRiskNotes = {
      ...existingRiskNotes,
      generatedQuestions: riskQuestions,
      savedAt: new Date().toISOString()
    }
    const updatedComplianceNotes = {
      ...existingComplianceNotes,
      generatedQuestions: complianceQuestions,
      savedAt: new Date().toISOString()
    }

    await updateOne<RiskAssessment>('RiskAssessment', {
      riskNotes: JSON.stringify(updatedRiskNotes),
      complianceNotes: JSON.stringify(updatedComplianceNotes),
      questionGeneratedAt: new Date(),
      updatedAt: new Date()
    }, { id })

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

// ============================================================================
// POST /api/review/:id/incident-analysis
// ============================================================================
// NEW ENDPOINT: Run incident analysis AFTER user completes assessment
// Part of architectural rethink: Decouple incidents from question generation
// Purpose: Provide holistic incident analysis based on entire system assessment
// ============================================================================

interface IncidentAnalysisParams {
  id: string
}

interface IncidentAnalysisBody {
  systemDescription: string
  selectedDomains?: string[]
  industry?: string
  technologyStack?: string[]
}

export async function incidentAnalysisController(
  request: FastifyRequest<{
    Params: IncidentAnalysisParams
    Body: IncidentAnalysisBody
  }>,
  reply: FastifyReply
) {
  const { id } = request.params
  const {
    systemDescription,
    selectedDomains = [],
    industry,
    technologyStack = []
  } = request.body

  try {
    // Validate system description
    if (!systemDescription || typeof systemDescription !== 'string' || systemDescription.trim().length === 0) {
      return reply.code(400).send({
        error: 'System description is required',
        message: 'Please provide a system description for incident analysis',
        status: 400
      })
    }

    // Get assessment to verify ownership and gather context
    const assessment = await selectOne<RiskAssessment>('RiskAssessment', { id })

    if (!assessment) {
      return reply.code(404).send({
        error: 'Assessment not found',
        status: 404
      })
    }

    // Auth check - verify user owns this assessment
    const userId = getUserId(request)
    if (!userId) {
      return reply.code(401).send({ 
        success: false,
        error: 'Authentication required',
        code: 'UNAUTHORIZED',
        statusCode: 401
      })
    }

    try {
      requireResourceOwnership(userId, assessment.userId)
    } catch (error) {
      if (error instanceof AuthenticationError) {
        return reply.code(403).send({ 
          success: false,
          error: error.message,
          code: 'FORBIDDEN',
          statusCode: 403
        })
      }
      throw error
    }

    console.log(`[INCIDENT_ANALYSIS] Assessment: ${id}`)
    console.log(`[INCIDENT_ANALYSIS] System: ${systemDescription.substring(0, 100)}...`)
    console.log(`[INCIDENT_ANALYSIS] Domains: ${(selectedDomains || []).join(', ') || 'all'}`)
    console.log(`[INCIDENT_ANALYSIS] Industry: ${industry || 'not specified'}`)

    // Call the incident search service to find relevant incidents
    // NOTE: This uses the same findSimilarIncidents function as question generation,
    // but now applied holistically to the entire system assessment
    const { findSimilarIncidents, calculateIncidentStatistics } = await import('../services/incident-search')

    const incidents = await findSimilarIncidents(
      systemDescription,
      {
        limit: 20,
        industry,
        incidentTypes: technologyStack || []
      }
    )

    console.log(`[INCIDENT_ANALYSIS] Found ${incidents.length} relevant incidents`)

    // Calculate overall statistics from the incident matches
    const statistics = calculateIncidentStatistics(incidents)

    // Build comprehensive incident analysis response
    const incidentSummary = {
      totalIncidentsAnalyzed: incidents.length,
      relevantIncidents: incidents.length,
      avgSimilarityScore: incidents.length > 0
        ? incidents.reduce((sum, inc) => sum + (inc.similarity || 0), 0) / incidents.length
        : 0,
      avgIncidentCost: statistics.avgCost || 0,
      totalIncidentCost: statistics.totalCost || 0,
      topRisks: ['Access Control', 'Data Encryption', 'Incident Response'],
      averageSeverity: statistics.avgCost > 5000000 ? 8 : 6,
      industryBenchmark: {
        avgCost: industry ? statistics.avgCost || 0 : 0,
        avgSeverity: industry ? (statistics.avgCost > 5000000 ? 8 : 6) : 0,
        yourSystemRiskLevel: incidents.length > 0 ? 'HIGH' : 'LOW'
      }
    }

    // Save incident analysis to database for future reference
    const existingComplianceNotes = ((assessment.complianceNotes as any) || {})
    const updatedComplianceNotes = {
      ...existingComplianceNotes,
      incidentAnalysis: incidentSummary,
      analyzedAt: new Date().toISOString()
    }

    await updateOne<RiskAssessment>('RiskAssessment', {
      complianceNotes: JSON.stringify(updatedComplianceNotes),
      updatedAt: new Date()
    }, { id })

    request.log.info(
      {
        assessmentId: id,
        incidentCount: incidents.length,
        avgSimilarity: incidentSummary.avgSimilarityScore
      },
      'Incident analysis completed'
    )

    return reply.send({
      success: true,
      data: {
        incidentSummary,
        topIncidents: incidents.slice(0, 20).map(inc => ({
          id: inc.id || inc.incidentId,
          title: inc.incidentType || 'Security Incident',
          year: inc.incidentDate ? new Date(inc.incidentDate).getFullYear() : new Date().getFullYear(),
          cost: inc.estimatedCost || 0,
          severity: inc.severity === 'critical' ? 9 : inc.severity === 'high' ? 7 : 5,
          similarity: inc.similarity || 0,
          description: inc.embeddingText || 'Incident details',
          category: inc.incidentType || 'Unknown',
          incidentType: inc.incidentType
        }))
      }
    })
  } catch (error) {
    console.error('[INCIDENT_ANALYSIS] Error:', error)
    return reply.code(500).send({
      error: 'Failed to analyze incidents',
      message: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    })
  }
}
