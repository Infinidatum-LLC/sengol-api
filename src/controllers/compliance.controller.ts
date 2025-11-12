/**
 * Compliance Response Controller
 *
 * Handles saving and retrieving compliance question responses.
 * Calculates compliance coverage scores and jurisdiction breakdowns.
 *
 * Created: November 12, 2025
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'

// ============================================================================
// TYPES
// ============================================================================

type ComplianceStatus = 'addressed' | 'partially_addressed' | 'not_addressed' | 'not_applicable'

interface ComplianceResponse {
  status: ComplianceStatus
  answer: string
  score?: number
  notes?: string
}

interface SaveComplianceResponsesBody {
  responses: Record<string, ComplianceResponse>
}

interface ComplianceCoverageDetails {
  byJurisdiction: Record<string, {
    covered: number
    total: number
    percentage: number
  }>
  byStatus: {
    addressed: number
    partially_addressed: number
    not_addressed: number
    not_applicable: number
  }
}

// ============================================================================
// CONTROLLER FUNCTIONS
// ============================================================================

/**
 * Save compliance question responses
 *
 * POST /api/review/:id/compliance-responses
 */
export async function saveComplianceResponses(
  request: FastifyRequest<{
    Params: { id: string }
    Body: SaveComplianceResponsesBody
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { responses } = request.body

    console.log(`[Compliance] Saving responses for assessment ${id}`)
    console.log(`[Compliance] Response count: ${Object.keys(responses).length}`)

    // Validate request body
    if (!responses || typeof responses !== 'object') {
      return reply.status(400).send({
        error: 'Invalid request body',
        message: 'responses must be an object'
      })
    }

    // Validate each response
    for (const [questionId, response] of Object.entries(responses)) {
      if (!response.status || !['addressed', 'partially_addressed', 'not_addressed', 'not_applicable'].includes(response.status)) {
        return reply.status(400).send({
          error: 'Invalid response status',
          message: `Question ${questionId} has invalid status: ${response.status}`
        })
      }

      if (response.score !== undefined && (response.score < 0 || response.score > 100)) {
        return reply.status(400).send({
          error: 'Invalid score',
          message: `Question ${questionId} score must be between 0-100`
        })
      }

      // Validate answer length
      if (response.answer && response.answer.length > 5000) {
        return reply.status(400).send({
          error: 'Answer too long',
          message: `Question ${questionId} answer must be less than 5000 characters`
        })
      }
    }

    // Fetch assessment
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
      select: {
        id: true,
        riskNotes: true
      }
    })

    if (!assessment) {
      return reply.status(404).send({ error: 'Assessment not found' })
    }

    // Extract generated questions
    const riskNotes = assessment.riskNotes as any
    const generatedQuestions = riskNotes?.generatedQuestions
    const complianceQuestions = generatedQuestions?.complianceQuestions || []

    if (complianceQuestions.length === 0) {
      return reply.status(400).send({
        error: 'No compliance questions found',
        message: 'Generate questions first before saving responses'
      })
    }

    console.log(`[Compliance] Found ${complianceQuestions.length} compliance questions`)

    // Calculate coverage
    const coverage = calculateComplianceCoverage(complianceQuestions, responses)

    console.log(`[Compliance] Coverage score: ${coverage.score.toFixed(2)}%`)
    console.log(`[Compliance] Jurisdiction breakdown:`, coverage.details.byJurisdiction)

    // Calculate individual question scores
    const complianceUserScores: Record<string, number> = {}
    for (const [questionId, response] of Object.entries(responses)) {
      if (response.score !== undefined) {
        complianceUserScores[questionId] = response.score
      }
    }

    // Save to database
    const updated = await prisma.riskAssessment.update({
      where: { id },
      data: {
        complianceQuestionResponses: responses,
        complianceCoverageScore: coverage.score,
        complianceCoverageDetails: coverage.details as any,
        complianceUserScores: Object.keys(complianceUserScores).length > 0 ? complianceUserScores : undefined,
        updatedAt: new Date()
      }
    })

    console.log(`[Compliance] Successfully saved responses for assessment ${id}`)

    return reply.send({
      success: true,
      assessmentId: id,
      complianceCoverageScore: coverage.score,
      complianceCoverageDetails: coverage.details,
      responseCount: Object.keys(responses).length,
      questionCount: complianceQuestions.length
    })
  } catch (error) {
    console.error('[Compliance] Error saving responses:', error)
    return reply.status(500).send({
      error: 'Failed to save compliance responses',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

/**
 * Retrieve compliance question responses
 *
 * GET /api/review/:id/compliance-responses
 */
export async function getComplianceResponses(
  request: FastifyRequest<{
    Params: { id: string }
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
      select: {
        id: true,
        complianceQuestionResponses: true,
        complianceCoverageScore: true,
        complianceCoverageDetails: true,
        complianceUserScores: true,
        complianceNotes: true,
        updatedAt: true
      }
    })

    if (!assessment) {
      return reply.status(404).send({ error: 'Assessment not found' })
    }

    return reply.send({
      assessmentId: id,
      responses: assessment.complianceQuestionResponses || {},
      coverageScore: assessment.complianceCoverageScore
        ? Number(assessment.complianceCoverageScore)
        : null,
      coverageDetails: assessment.complianceCoverageDetails || null,
      userScores: assessment.complianceUserScores || {},
      notes: assessment.complianceNotes || {},
      lastUpdated: assessment.updatedAt
    })
  } catch (error) {
    console.error('[Compliance] Error retrieving responses:', error)
    return reply.status(500).send({
      error: 'Failed to retrieve compliance responses',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate compliance coverage score and breakdown
 */
function calculateComplianceCoverage(
  questions: any[],
  responses: Record<string, ComplianceResponse>
): { score: number; details: ComplianceCoverageDetails } {
  if (questions.length === 0) {
    return {
      score: 0,
      details: {
        byJurisdiction: {},
        byStatus: {
          addressed: 0,
          partially_addressed: 0,
          not_addressed: 0,
          not_applicable: 0
        }
      }
    }
  }

  // Initialize jurisdiction tracking
  const byJurisdiction: Record<string, { covered: number; total: number }> = {}

  // Initialize status tracking
  const byStatus = {
    addressed: 0,
    partially_addressed: 0,
    not_addressed: 0,
    not_applicable: 0
  }

  // Calculate weighted coverage
  let totalWeight = 0
  let coveredWeight = 0

  questions.forEach((question) => {
    const response = responses[question.id]
    const weight = question.finalWeight || question.weight || 1

    totalWeight += weight

    // Count by status
    if (response?.status) {
      byStatus[response.status]++

      // Calculate coverage
      if (response.status === 'addressed') {
        coveredWeight += weight
      } else if (response.status === 'partially_addressed') {
        coveredWeight += weight * 0.5 // Partial credit
      }
      // not_addressed and not_applicable get 0 coverage
    }

    // Extract jurisdiction from question
    const jurisdiction = extractJurisdiction(question)
    if (jurisdiction) {
      if (!byJurisdiction[jurisdiction]) {
        byJurisdiction[jurisdiction] = { covered: 0, total: 0 }
      }
      byJurisdiction[jurisdiction].total += 1

      if (response?.status === 'addressed' || response?.status === 'partially_addressed') {
        byJurisdiction[jurisdiction].covered += 1
      }
    }
  })

  // Calculate overall score
  const score = totalWeight > 0 ? (coveredWeight / totalWeight) * 100 : 0

  // Add percentages to jurisdiction breakdown
  const jurisdictionDetails: Record<string, { covered: number; total: number; percentage: number }> = {}
  for (const [jurisdiction, data] of Object.entries(byJurisdiction)) {
    jurisdictionDetails[jurisdiction] = {
      ...data,
      percentage: data.total > 0 ? (data.covered / data.total) * 100 : 0
    }
  }

  return {
    score,
    details: {
      byJurisdiction: jurisdictionDetails,
      byStatus
    }
  }
}

/**
 * Extract jurisdiction from question label or description
 *
 * Looks for common regulatory frameworks:
 * - GDPR (EU)
 * - HIPAA (US Healthcare)
 * - CCPA (California)
 * - SOC 2 (General)
 * - ISO 27001 (International)
 * - PCI DSS (Payment Card)
 */
function extractJurisdiction(question: any): string | null {
  const text = `${question.label || ''} ${question.description || ''}`.toLowerCase()

  const jurisdictions = [
    { pattern: /gdpr|general data protection regulation|eu data/i, name: 'GDPR' },
    { pattern: /hipaa|health insurance portability|phi|protected health/i, name: 'HIPAA' },
    { pattern: /ccpa|california consumer privacy/i, name: 'CCPA' },
    { pattern: /soc 2|soc2|service organization control/i, name: 'SOC 2' },
    { pattern: /iso 27001|iso27001|information security management/i, name: 'ISO 27001' },
    { pattern: /pci dss|pcidss|payment card industry/i, name: 'PCI DSS' },
    { pattern: /ferpa|family educational rights/i, name: 'FERPA' },
    { pattern: /coppa|children's online privacy/i, name: 'COPPA' },
    { pattern: /glba|gramm-leach-bliley/i, name: 'GLBA' },
    { pattern: /fisma|federal information security/i, name: 'FISMA' }
  ]

  for (const { pattern, name } of jurisdictions) {
    if (pattern.test(text)) {
      return name
    }
  }

  // Default to "General Compliance" if no specific jurisdiction found
  return 'General Compliance'
}
