/**
 * d-vecDB Embeddings Service (RESILIENT VERSION)
 *
 * Integrates d-vecDB vector database with OpenAI embeddings for incident RAG system.
 *
 * Resilience Features:
 * - Circuit breaker pattern for fault tolerance
 * - Automatic retry with exponential backoff
 * - Request timeout handling
 * - Response caching for performance
 * - Health monitoring
 * - Graceful degradation
 *
 * Original Features:
 * - OpenAI text-embedding-3-small (1536 dimensions)
 * - d-vecDB for vector storage and search
 * - Metadata filtering for industry, severity, incident type
 * - Batch operations for efficient embedding generation
 */

import { VectorDBClient, DistanceMetric } from 'd-vecdb'
import OpenAI from 'openai'
import { resilientDvecdbClient } from '../lib/dvecdb-resilient'
import { vectorSearchCache, llmResponseCache, generateCacheKey } from '../lib/cache'
import { withRetry, withTimeout } from '../lib/retry'
import { LLMError, VectorDBError } from '../lib/errors'
import { config } from '../config/env'

// Lazy initialization to ensure environment variables are loaded
// (module-level init runs before Next.js loads .env.local)
let dvecdbClient: VectorDBClient | null = null
let openaiClient: OpenAI | null = null

/**
 * Get or create d-vecDB client with lazy initialization
 * This ensures process.env is fully loaded before accessing values
 */
function getDvecdbClient(): VectorDBClient {
  if (!dvecdbClient) {
    const host = process.env.DVECDB_HOST
    const port = process.env.DVECDB_PORT

    if (!host) {
      throw new Error(
        'DVECDB_HOST environment variable is not set. ' +
        'Please set it in .env.local (e.g., DVECDB_HOST=99.213.88.59)'
      )
    }

    console.log(`[d-vecDB] Initializing client: ${host}:${port || '8080'}`)

    dvecdbClient = new VectorDBClient({
      host,
      port: parseInt(port || '8080'),
      timeout: 30000, // 30 second timeout
    })
  }
  return dvecdbClient
}

/**
 * Get or create OpenAI client with lazy initialization
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY

    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY environment variable is not set. ' +
        'Please set it in .env.local'
      )
    }

    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

// Configuration
function getCollectionName(): string {
  return process.env.DVECDB_COLLECTION || 'incidents'
}

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSION = 1536

/**
 * Metadata structure for incident embeddings
 */
export interface IncidentMetadata {
  incidentId: string
  incidentType: string // 'cyber', 'failure_pattern', 'regulation_violation'
  organization?: string
  industry?: string
  severity?: string
  incidentDate?: string // ISO date string

  // Security controls (for ROI analysis)
  hadMfa?: boolean
  hadBackups?: boolean
  hadIrPlan?: boolean

  // Financial impact
  estimatedCost?: number
  downtimeHours?: number
  recordsAffected?: number

  // Additional context
  attackType?: string
  attackVector?: string
  failureType?: string
  rootCause?: string
  tags?: string // Comma-separated tags

  // Source text (for display in results)
  embeddingText: string
}

/**
 * Search result from d-vecDB
 */
export interface SearchResult {
  id: string
  distance: number // Cosine distance (0-2, lower is more similar)
  score: number // Similarity score (0-1, higher is more similar)
  metadata: IncidentMetadata
}

/**
 * Initialize d-vecDB connection and collection
 */
export async function initializeCollection(): Promise<void> {
  try {
    // Check if server is reachable
    const isAlive = await getDvecdbClient().ping()
    if (!isAlive) {
      throw new Error('d-vecDB server is not reachable')
    }

    // Check if collection exists by directly calling the API
    // (client's listCollections has parsing issues)
    try {
      await getDvecdbClient().getCollectionStats(getCollectionName())
      console.log(`✅ Collection exists: ${getCollectionName()}`)
    } catch (error) {
      // Collection doesn't exist, create it
      console.log(`Creating collection: ${getCollectionName()}`)
      await getDvecdbClient().createCollectionSimple(
        getCollectionName(),
        EMBEDDING_DIMENSION,
        DistanceMetric.COSINE
      )
      console.log(`✅ Collection created: ${getCollectionName()}`)
    }

    // Get collection stats
    const stats = await getDvecdbClient().getCollectionStats(getCollectionName())
    console.log(`📊 Collection stats:`)
    console.log(`   Vectors: ${stats.vectorCount}`)
    console.log(`   Dimension: ${stats.dimension}`)
    console.log(`   Memory: ${(stats.memoryUsage / 1024 / 1024).toFixed(2)} MB`)
  } catch (error) {
    console.error('Failed to initialize d-vecDB collection:', error)
    throw error
  }
}

/**
 * Generate OpenAI embedding for text with caching and retry logic
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Check cache first
  const cacheKey = generateCacheKey('embedding', text)
  const cached = llmResponseCache.get(cacheKey)
  if (cached) {
    console.log('[Embedding] Cache hit')
    return cached
  }

  try {
    const embedding = await withRetry(
      async () => {
        return await withTimeout(
          (async () => {
            const response = await getOpenAIClient().embeddings.create({
              model: EMBEDDING_MODEL,
              input: text,
              encoding_format: 'float',
            })

            if (!response.data || response.data.length === 0) {
              throw new LLMError('No embedding data returned from OpenAI')
            }

            return response.data[0].embedding
          })(),
          config.openaiTimeout,
          'openai-embedding'
        )
      },
      {
        maxRetries: config.openaiMaxRetries,
        initialDelay: 1000,
        maxDelay: 10000,
        onRetry: (error, attempt) => {
          console.warn(`[Embedding] Retry attempt ${attempt}/${config.openaiMaxRetries}`, {
            error: error.message,
          })
        },
      }
    )

    // Cache the result
    llmResponseCache.set(cacheKey, embedding)

    return embedding
  } catch (error) {
    console.error('Failed to generate embedding:', error)
    throw new LLMError(
      'Embedding generation failed: ' +
        (error instanceof Error ? error.message : 'Unknown error'),
      { text: text.substring(0, 100) }
    )
  }
}

/**
 * Generate multiple embeddings in batch (more efficient than individual calls)
 * OpenAI supports up to 2048 texts per request
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length > 2048) {
    throw new Error('Batch size cannot exceed 2048 texts (OpenAI limit)')
  }

  try {
    const embeddings = await withRetry(
      async () => {
        return await withTimeout(
          (async () => {
            const response = await getOpenAIClient().embeddings.create({
              model: EMBEDDING_MODEL,
              input: texts,
              encoding_format: 'float',
            })

            if (!response.data || response.data.length === 0) {
              throw new LLMError('No embedding data returned from OpenAI')
            }

            return response.data.map(item => item.embedding)
          })(),
          config.openaiTimeout * 2, // Double timeout for batch operations
          'openai-batch-embedding'
        )
      },
      {
        maxRetries: config.openaiMaxRetries,
        initialDelay: 1000,
        maxDelay: 10000,
        onRetry: (error, attempt) => {
          console.warn(`[BatchEmbedding] Retry attempt ${attempt}/${config.openaiMaxRetries}`, {
            error: error.message,
            batchSize: texts.length,
          })
        },
      }
    )

    return embeddings
  } catch (error) {
    console.error('Failed to generate batch embeddings:', error)
    throw new LLMError(
      'Batch embedding generation failed: ' +
        (error instanceof Error ? error.message : 'Unknown error'),
      { batchSize: texts.length }
    )
  }
}

/**
 * Upsert a single embedding to d-vecDB
 */
export async function upsertEmbedding(params: {
  id: string
  embedding: number[]
  metadata: IncidentMetadata
}): Promise<void> {
  try {
    await getDvecdbClient().insertSimple(
      getCollectionName(),
      params.id,
      params.embedding,
      params.metadata as any // Cast to match d-vecDB's Record<string, string | number | boolean>
    )
  } catch (error) {
    console.error(`Failed to upsert embedding ${params.id}:`, error)
    throw error
  }
}

/**
 * Batch upsert embeddings to d-vecDB
 *
 * @param records - Array of embeddings to upsert
 * @param batchSize - Number of records per batch (default: 100)
 * @returns Summary of processed and error counts
 */
export async function batchUpsertEmbeddings(
  records: Array<{
    id: string
    embedding: number[]
    metadata: IncidentMetadata
  }>,
  batchSize: number = 100
): Promise<{ processed: number; errors: number }> {
  let processed = 0
  let errors = 0

  try {
    // Prepare batches
    const vectorBatches: Array<[string, number[], any][]> = []
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize).map((record) => [
        record.id,
        record.embedding,
        record.metadata as any,
      ] as [string, number[], any])
      vectorBatches.push(batch)
    }

    // Process batches
    for (let i = 0; i < vectorBatches.length; i++) {
      const batch = vectorBatches[i]
      try {
        await getDvecdbClient().batchInsertSimple(getCollectionName(), batch, batchSize)
        processed += batch.length

        // Log progress
        if ((i + 1) % 10 === 0 || i === vectorBatches.length - 1) {
          console.log(`  Upserted ${processed}/${records.length} embeddings...`)
        }
      } catch (error) {
        console.error(`Error upserting batch at index ${i}:`, error)
        errors += batch.length
      }
    }

    return { processed, errors }
  } catch (error) {
    console.error('Fatal error in batch upsert:', error)
    throw error
  }
}

/**
 * Search for similar incidents using vector similarity
 *
 * @param queryEmbedding - The embedding to search for (1536-dim vector)
 * @param filter - Metadata filters (e.g., { industry: 'fintech', severity: 'high' })
 * @param topK - Number of results to return (default: 10)
 * @returns Array of search results with similarity scores
 */
export async function searchSimilar(
  queryEmbedding: number[],
  filter?: Partial<IncidentMetadata>,
  topK: number = 10
): Promise<SearchResult[]> {
  try {
    const results = await getDvecdbClient().searchSimple(
      getCollectionName(),
      queryEmbedding,
      topK,
      undefined, // efSearch (use collection default)
      filter as any
    )

    // Convert cosine distance to similarity score (0-1)
    return results.map((result) => {
      const rawMetadata = result.metadata as any

      // Map d-vecDB metadata to our expected IncidentMetadata structure
      const mappedMetadata: IncidentMetadata = {
        incidentId: rawMetadata.source_id || rawMetadata.original_id || result.id,
        incidentType: rawMetadata.source || rawMetadata.incidentType || 'unknown',
        organization: rawMetadata.org || rawMetadata.organization || '',
        industry: rawMetadata.industry || '',
        severity: rawMetadata.severity || 'medium',
        incidentDate: rawMetadata.date || rawMetadata.incidentDate || '',
        embeddingText: rawMetadata.content_preview || rawMetadata.embeddingText || rawMetadata.title || '',

        // Financial impact
        estimatedCost: rawMetadata.estimatedCost || rawMetadata.cost,
        downtimeHours: rawMetadata.downtimeHours || rawMetadata.downtime,
        recordsAffected: rawMetadata.recordsAffected || rawMetadata.records,

        // Security controls
        hadMfa: rawMetadata.hadMfa,
        hadBackups: rawMetadata.hadBackups,
        hadIrPlan: rawMetadata.hadIrPlan,

        // Additional context
        attackType: rawMetadata.attackType || rawMetadata.attack_type,
        attackVector: rawMetadata.attackVector || rawMetadata.attack_vector,
        failureType: rawMetadata.failureType || rawMetadata.failure_type,
        rootCause: rawMetadata.rootCause || rawMetadata.root_cause,
        tags: rawMetadata.tags,
      }

      return {
        id: result.id,
        distance: result.distance,
        score: 1 - result.distance / 2, // Cosine distance is 0-2, convert to similarity 0-1
        metadata: mappedMetadata,
      }
    })
  } catch (error) {
    console.error('Vector search failed:', error)
    throw new Error(
      'Search failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Search by text query using resilient client with caching
 *
 * @param queryText - Text to search for
 * @param filter - Metadata filters
 * @param topK - Number of results to return
 * @returns Array of search results
 */
export async function searchByText(
  queryText: string,
  filter?: Partial<IncidentMetadata>,
  topK: number = 10
): Promise<SearchResult[]> {
  // Check cache first
  const cacheKey = generateCacheKey('search', queryText, filter, topK)
  const cached = vectorSearchCache.get(cacheKey)
  if (cached) {
    console.log('[d-vecDB] Search cache hit')
    return cached
  }

  try {
    // Generate embedding with retry logic
    const queryEmbedding = await generateEmbedding(queryText)

    // Use resilient client for search
    const rawResults = await resilientDvecdbClient.searchByVector(
      queryEmbedding,
      filter as any,
      topK,
      {
        timeout: config.dvecdbTimeout,
        maxRetries: config.dvecdbMaxRetries,
      }
    )

    // Map results to our format
    const results: SearchResult[] = rawResults.map((result: any) => {
      const rawMetadata = result.metadata as any

      // Map d-vecDB metadata to our expected IncidentMetadata structure
      const mappedMetadata: IncidentMetadata = {
        incidentId: rawMetadata.source_id || rawMetadata.original_id || result.id,
        incidentType: rawMetadata.source || rawMetadata.incidentType || 'unknown',
        organization: rawMetadata.org || rawMetadata.organization || '',
        industry: rawMetadata.industry || '',
        severity: rawMetadata.severity || 'medium',
        incidentDate: rawMetadata.date || rawMetadata.incidentDate || '',
        embeddingText: rawMetadata.content_preview || rawMetadata.embeddingText || rawMetadata.title || '',

        // Financial impact
        estimatedCost: rawMetadata.estimatedCost || rawMetadata.cost,
        downtimeHours: rawMetadata.downtimeHours || rawMetadata.downtime,
        recordsAffected: rawMetadata.recordsAffected || rawMetadata.records,

        // Security controls
        hadMfa: rawMetadata.hadMfa,
        hadBackups: rawMetadata.hadBackups,
        hadIrPlan: rawMetadata.hadIrPlan,

        // Additional context
        attackType: rawMetadata.attackType || rawMetadata.attack_type,
        attackVector: rawMetadata.attackVector || rawMetadata.attack_vector,
        failureType: rawMetadata.failureType || rawMetadata.failure_type,
        rootCause: rawMetadata.rootCause || rawMetadata.root_cause,
        tags: rawMetadata.tags,
      }

      return {
        id: result.id,
        distance: result.distance,
        score: 1 - result.distance / 2, // Cosine distance is 0-2, convert to similarity 0-1
        metadata: mappedMetadata,
      }
    })

    // Cache the results
    vectorSearchCache.set(cacheKey, results)

    return results
  } catch (error) {
    console.error('[d-vecDB] Search by text failed:', error)
    throw error
  }
}

/**
 * Delete embeddings by ID
 */
export async function deleteEmbeddings(ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await getDvecdbClient().deleteVector(getCollectionName(), id)
    } catch (error) {
      console.error(`Failed to delete embedding ${id}:`, error)
    }
  }
}

/**
 * Get collection statistics
 */
export async function getCollectionStats(): Promise<{
  totalVectors: number
  dimension: number
  memoryUsage: number
}> {
  try {
    const stats = await getDvecdbClient().getCollectionStats(getCollectionName())
    return {
      totalVectors: stats.vectorCount,
      dimension: stats.dimension,
      memoryUsage: stats.memoryUsage,
    }
  } catch (error) {
    console.error('Failed to get collection stats:', error)
    throw error
  }
}

/**
 * Health check for d-vecDB
 */
export async function healthCheck(): Promise<{
  configured: boolean
  serverReachable: boolean
  collectionExists: boolean
  error?: string
}> {
  try {
    // Check if environment variables are set
    if (!process.env.OPENAI_API_KEY) {
      return {
        configured: false,
        serverReachable: false,
        collectionExists: false,
        error: 'OPENAI_API_KEY not set in environment',
      }
    }

    // Check if server is reachable
    const isAlive = await getDvecdbClient().ping()
    if (!isAlive) {
      return {
        configured: true,
        serverReachable: false,
        collectionExists: false,
        error: 'd-vecDB server not reachable',
      }
    }

    // Check if collection exists
    try {
      const collections = await getDvecdbClient().listCollections()
      console.log('Collections response:', JSON.stringify(collections, null, 2))

      // d-vecdb@0.2.2+ returns proper collection data with name field
      const exists = collections.collections && Array.isArray(collections.collections)
        ? collections.collections.some((c) => c.name === getCollectionName())
        : false

      return {
        configured: true,
        serverReachable: true,
        collectionExists: exists,
      }
    } catch (err) {
      console.error('Error listing collections:', err)
      return {
        configured: true,
        serverReachable: true,
        collectionExists: false,
        error: `Failed to list collections: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }
  } catch (error) {
    return {
      configured: true,
      serverReachable: false,
      collectionExists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Close d-vecDB client connection
 */
export function closeConnection(): void {
  getDvecdbClient().close()
}
