/**
 * Standalone Question Generation Controller
 *
 * Provides a simple API endpoint for generating dynamic questions
 * without requiring a full review workflow.
 */

import { FastifyRequest, FastifyReply } from 'fastify'
import { generateDynamicQuestions } from '../services/dynamic-question-generator'

interface GenerateQuestionsRequest {
  scenario: string
  industry?: string
  count?: number
  domains?: string[]
  jurisdictions?: string[]
  techStack?: string[]
  questionIntensity?: 'low' | 'medium' | 'high'
}

export async function generateQuestionsController(
  request: FastifyRequest<{ Body: GenerateQuestionsRequest }>,
  reply: FastifyReply
) {
  try {
    const {
      scenario,
      industry,
      count = 10,
      domains,
      jurisdictions,
      techStack,
      questionIntensity = 'high'
    } = request.body

    if (!scenario || !scenario.trim()) {
      return reply.code(400).send({
        error: 'Scenario is required',
        code: 'VALIDATION_ERROR',
        statusCode: 400
      })
    }

    console.log(`[QUESTIONS] Generating ${count} questions for scenario: ${scenario.substring(0, 100)}...`)
    if (industry) {
      console.log(`[QUESTIONS] Industry: ${industry}`)
    }
    if (domains && domains.length > 0) {
      console.log(`[QUESTIONS] Domains: ${domains.join(', ')}`)
    }

    // Generate questions
    const result = await generateDynamicQuestions({
      systemDescription: scenario,
      selectedDomains: domains,
      jurisdictions,
      industry,
      techStack: techStack || [],
      questionIntensity
    })

    // Combine and limit questions if count is specified
    const allQuestions = [
      ...result.riskQuestions,
      ...result.complianceQuestions
    ]

    const limitedQuestions = count > 0
      ? allQuestions.slice(0, count)
      : allQuestions

    return reply.send({
      success: true,
      questions: limitedQuestions,
      metadata: {
        totalGenerated: allQuestions.length,
        returned: limitedQuestions.length,
        riskCount: result.riskQuestions.length,
        complianceCount: result.complianceQuestions.length,
        incidentSummary: result.incidentSummary,
        generationMetadata: result.generationMetadata
      }
    })
  } catch (error) {
    console.error('[QUESTIONS] Error generating questions:', error)
    return reply.code(500).send({
      error: 'Failed to generate questions',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
