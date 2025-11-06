import { FastifyRequest, FastifyReply } from 'fastify'
import { ValidationError } from '../lib/errors'
import { calculateRiskWeights, generateEvidenceBasedAnalysis } from '../services/risk.service'

// ============================================================================
// POST /api/risk/calculate-weights
// ============================================================================

interface CalculateRiskWeightsBody {
  systemDescription: string
  technologyStack: string[]
  industry: string
  deployment: 'cloud' | 'on-prem' | 'hybrid'
}

export async function calculateRiskWeightsController(
  request: FastifyRequest<{ Body: CalculateRiskWeightsBody }>,
  reply: FastifyReply
) {
  try {
    const { systemDescription, technologyStack, industry, deployment } = request.body

    if (!systemDescription || typeof systemDescription !== 'string' || systemDescription.trim().length === 0) {
      throw new ValidationError('systemDescription is required and must be a non-empty string')
    }

    if (!technologyStack || !Array.isArray(technologyStack)) {
      throw new ValidationError('technologyStack must be an array')
    }

    if (!industry || typeof industry !== 'string') {
      throw new ValidationError('industry is required and must be a string')
    }

    if (!deployment || !['cloud', 'on-prem', 'hybrid'].includes(deployment)) {
      throw new ValidationError('deployment must be one of: cloud, on-prem, hybrid')
    }

    request.log.info({
      industry,
      deployment,
      techStackSize: technologyStack.length,
      descriptionLength: systemDescription.length
    }, 'Calculating risk weights')

    const result = await calculateRiskWeights({
      systemDescription,
      technologyStack,
      industry,
      deployment,
    })

    return reply.send({
      success: true,
      ...result,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to calculate risk weights')

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
      error: 'Failed to calculate risk weights',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// POST /api/risk/evidence-based-analysis
// ============================================================================

interface EvidenceBasedAnalysisBody {
  systemDescription: string
  riskCategory: string
  industry: string
  maxExamples?: number
}

export async function evidenceBasedAnalysisController(
  request: FastifyRequest<{ Body: EvidenceBasedAnalysisBody }>,
  reply: FastifyReply
) {
  try {
    const { systemDescription, riskCategory, industry, maxExamples = 5 } = request.body

    if (!systemDescription || typeof systemDescription !== 'string' || systemDescription.trim().length === 0) {
      throw new ValidationError('systemDescription is required and must be a non-empty string')
    }

    if (!riskCategory || typeof riskCategory !== 'string') {
      throw new ValidationError('riskCategory is required and must be a string')
    }

    if (!industry || typeof industry !== 'string') {
      throw new ValidationError('industry is required and must be a string')
    }

    if (maxExamples && (typeof maxExamples !== 'number' || maxExamples < 1 || maxExamples > 20)) {
      throw new ValidationError('maxExamples must be a number between 1 and 20')
    }

    request.log.info({
      riskCategory,
      industry,
      maxExamples,
      descriptionLength: systemDescription.length
    }, 'Generating evidence-based analysis')

    const analysis = await generateEvidenceBasedAnalysis({
      systemDescription,
      riskCategory,
      industry,
      maxExamples,
    })

    return reply.send({
      success: true,
      analysis,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to generate evidence-based analysis')

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
      error: 'Failed to generate evidence-based analysis',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
