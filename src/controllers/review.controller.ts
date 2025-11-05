import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'
import { generateDynamicQuestions } from '../services/dynamic-question-generator'

interface GenerateQuestionsParams {
  id: string
}

interface GenerateQuestionsBody {
  systemDescription: string
  selectedDomains: string[]
  jurisdictions: string[]
  industry: string
  selectedTech: string[]
  customTech: string[]
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
    systemDescription,
    selectedDomains,
    jurisdictions,
    industry,
    selectedTech,
    customTech
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

    console.log(`[GENERATE_QUESTIONS] Assessment: ${id}`)
    console.log(`[GENERATE_QUESTIONS] System: ${systemDescription.substring(0, 100)}...`)
    console.log(`[GENERATE_QUESTIONS] Domains: ${selectedDomains.join(', ')}`)

    // Generate questions
    const result = await generateDynamicQuestions({
      systemDescription,
      selectedDomains,
      jurisdictions,
      industry,
      selectedTech: [...selectedTech, ...customTech]
    })

    return reply.send({
      success: true,
      data: {
        riskQuestions: result.riskQuestions,
        complianceQuestions: result.complianceQuestions,
        metadata: result.metadata
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

export async function saveQuestionsController(
  request: FastifyRequest<{
    Params: GenerateQuestionsParams
    Body: any
  }>,
  reply: FastifyReply
) {
  const { id } = request.params
  const { riskQuestions, complianceQuestions } = request.body

  try {
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id }
    })

    if (!assessment) {
      return reply.code(404).send({ error: 'Assessment not found' })
    }

    // Update assessment with generated questions
    const existingNotes = (assessment.riskNotes as any) || {}

    await prisma.riskAssessment.update({
      where: { id },
      data: {
        riskNotes: {
          ...existingNotes,
          generatedQuestions: riskQuestions,
          complianceQuestions: complianceQuestions
        }
      }
    })

    return reply.send({ success: true })
  } catch (error) {
    console.error('[SAVE_QUESTIONS] Error:', error)
    return reply.code(500).send({
      error: 'Failed to save questions',
      message: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
