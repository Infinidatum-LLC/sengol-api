import { FastifyRequest, FastifyReply } from 'fastify'
import { ValidationError } from '../lib/errors'
import { generateQuickAssessment } from '../services/quick-assessment.service'
import { prisma } from '../lib/prisma'

// ============================================================================
// POST /api/projects/:projectId/quick-assessment
// ============================================================================

interface QuickAssessmentParams {
  projectId: string
}

interface QuickAssessmentBody {
  systemDescription: string
  type: 'risk' | 'compliance'
}

export async function quickAssessmentController(
  request: FastifyRequest<{ Params: QuickAssessmentParams; Body: QuickAssessmentBody }>,
  reply: FastifyReply
) {
  try {
    const { projectId } = request.params
    const { systemDescription, type } = request.body

    if (!systemDescription || typeof systemDescription !== 'string' || systemDescription.trim().length === 0) {
      throw new ValidationError('systemDescription is required and must be a non-empty string')
    }

    if (!type || !['risk', 'compliance'].includes(type)) {
      throw new ValidationError('type must be either "risk" or "compliance"')
    }

    request.log.info({
      projectId,
      type,
      descriptionLength: systemDescription.length
    }, 'Generating quick assessment')

    // Try to get project name from database
    let projectName = 'Project'
    try {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true }
      })
      if (project) {
        projectName = project.name
      }
    } catch (error) {
      // Project not found or DB error, use default name
      request.log.warn({ projectId }, 'Could not fetch project name')
    }

    const assessment = await generateQuickAssessment(systemDescription, type)

    // Count words in assessment
    const wordCount = assessment.split(/\s+/).length

    return reply.send({
      success: true,
      assessment,
      wordCount,
      projectName,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to generate quick assessment')

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
      error: 'Failed to generate quick assessment',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
