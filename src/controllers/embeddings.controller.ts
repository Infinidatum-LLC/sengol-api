import { FastifyRequest, FastifyReply } from 'fastify'
import { ValidationError } from '../lib/errors'
import { generateEmbedding, generateBatchEmbeddings } from '../services/dvecdb-embeddings'
import { searchByText } from '../services/dvecdb-embeddings'

// ============================================================================
// POST /api/embeddings/generate
// ============================================================================

interface GenerateEmbeddingBody {
  text: string
}

export async function generateEmbeddingController(
  request: FastifyRequest<{ Body: GenerateEmbeddingBody }>,
  reply: FastifyReply
) {
  try {
    const { text } = request.body

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      throw new ValidationError('Text is required and must be a non-empty string')
    }

    request.log.info({ textLength: text.length }, 'Generating embedding')

    const embedding = await generateEmbedding(text)

    return reply.send({
      success: true,
      embedding,
      model: 'text-embedding-3-small',
      dimension: embedding.length,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to generate embedding')

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
      error: 'Failed to generate embedding',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// POST /api/embeddings/search
// ============================================================================

interface SearchEmbeddingsBody {
  queryText: string
  filter?: {
    industry?: string
    incidentType?: string
    severity?: string
    [key: string]: any
  }
  topK?: number
  minSimilarity?: number
}

export async function searchEmbeddingsController(
  request: FastifyRequest<{ Body: SearchEmbeddingsBody }>,
  reply: FastifyReply
) {
  try {
    const { queryText, filter = {}, topK = 10, minSimilarity = 0.6 } = request.body

    if (!queryText || typeof queryText !== 'string' || queryText.trim().length === 0) {
      throw new ValidationError('queryText is required and must be a non-empty string')
    }

    if (topK && (typeof topK !== 'number' || topK < 1 || topK > 100)) {
      throw new ValidationError('topK must be a number between 1 and 100')
    }

    if (minSimilarity && (typeof minSimilarity !== 'number' || minSimilarity < 0 || minSimilarity > 1)) {
      throw new ValidationError('minSimilarity must be a number between 0 and 1')
    }

    request.log.info({
      queryText: queryText.substring(0, 100),
      topK,
      minSimilarity,
      filter
    }, 'Searching embeddings')

    const results = await searchByText(queryText, filter, topK)

    // Filter by minimum similarity
    const filteredResults = results.filter(r => r.score >= minSimilarity)

    const formattedResults = filteredResults.map(result => ({
      id: result.id,
      score: result.score,
      distance: result.distance,
      metadata: {
        incidentId: result.metadata.incidentId,
        incidentType: result.metadata.incidentType,
        organization: result.metadata.organization,
        industry: result.metadata.industry,
        severity: result.metadata.severity,
        incidentDate: result.metadata.incidentDate,
        embeddingText: result.metadata.embeddingText,
        estimatedCost: result.metadata.estimatedCost,
        recordsAffected: result.metadata.recordsAffected,
      },
    }))

    return reply.send({
      success: true,
      results: formattedResults,
      queryText,
      topK,
      totalResults: filteredResults.length,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to search embeddings')

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
      error: 'Failed to search embeddings',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}

// ============================================================================
// POST /api/embeddings/batch-generate
// ============================================================================

interface BatchGenerateEmbeddingsBody {
  texts: string[]
}

export async function batchGenerateEmbeddingsController(
  request: FastifyRequest<{ Body: BatchGenerateEmbeddingsBody }>,
  reply: FastifyReply
) {
  try {
    const { texts } = request.body

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      throw new ValidationError('texts is required and must be a non-empty array')
    }

    if (texts.length > 2048) {
      throw new ValidationError('texts array must not exceed 2048 items (OpenAI limit)')
    }

    // Validate all texts are strings
    if (!texts.every(t => typeof t === 'string' && t.trim().length > 0)) {
      throw new ValidationError('All texts must be non-empty strings')
    }

    request.log.info({ count: texts.length }, 'Generating batch embeddings')

    const embeddings = await generateBatchEmbeddings(texts)

    return reply.send({
      success: true,
      embeddings,
      model: 'text-embedding-3-small',
      dimension: embeddings[0]?.length || 1536,
      count: embeddings.length,
    })
  } catch (error) {
    request.log.error({ err: error }, 'Failed to generate batch embeddings')

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
      error: 'Failed to generate batch embeddings',
      details: error instanceof Error ? error.message : 'Unknown error',
      code: 'INTERNAL_ERROR',
      statusCode: 500,
    })
  }
}
