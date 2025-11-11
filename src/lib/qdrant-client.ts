/**
 * Qdrant Vector Database Client
 *
 * Connects to the deployed Qdrant instance for semantic incident search.
 * The Qdrant database is populated by the automated crawler system.
 *
 * Infrastructure:
 * - VM: sengol-vector-db (10.128.0.2:6333)
 * - Collection: sengol_incidents_full
 * - Dimensions: 1536 (OpenAI text-embedding-3-small)
 * - Distance Metric: COSINE
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import { OpenAI } from 'openai'

const QDRANT_HOST = (process.env.QDRANT_HOST || '10.128.0.2').trim()
const QDRANT_PORT = parseInt((process.env.QDRANT_PORT || '6333').trim())
const COLLECTION_NAME = 'sengol_incidents_full'
const EMBEDDING_DIMENSIONS = 1536

// Singleton clients
let qdrantClient: QdrantClient | null = null
let openaiClient: OpenAI | null = null

/**
 * Get or create Qdrant client instance
 */
export function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    console.log(`[Qdrant] Connecting to Qdrant at ${QDRANT_HOST}:${QDRANT_PORT}`)
    qdrantClient = new QdrantClient({
      url: `http://${QDRANT_HOST}:${QDRANT_PORT}`,
    })
  }
  return qdrantClient
}

/**
 * Get or create OpenAI client for embedding generation
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required')
    }
    openaiClient = new OpenAI({ apiKey })
  }
  return openaiClient
}

/**
 * Generate embedding for a text query
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const client = getOpenAIClient()

  const response = await client.embeddings.create({
    model: 'text-embedding-3-small',
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return response.data[0].embedding
}

/**
 * Incident metadata stored in Qdrant payload
 */
export interface QdrantIncidentMetadata {
  embedding_id: string
  embedding_text: string
  content: string
  source_file: string
  category: string
  metadata: {
    title?: string
    severity?: string
    organization?: string
    incident_date?: string
    attack_type?: string
    industry?: string
    had_mfa?: boolean
    had_backups?: boolean
    had_ir_plan?: boolean
    estimated_cost?: number
    downtime_hours?: number
    records_affected?: number
  }
}

/**
 * Search result from Qdrant
 */
export interface QdrantSearchResult {
  id: string | number
  score: number
  payload: QdrantIncidentMetadata
}

/**
 * Search options for Qdrant queries
 */
export interface QdrantSearchOptions {
  limit?: number
  scoreThreshold?: number
  category?: string
  severity?: string[]
  industry?: string
  requireMfaData?: boolean
  requireBackupData?: boolean
  requireIrPlanData?: boolean
}

/**
 * Search for similar incidents in Qdrant using vector similarity
 */
export async function searchIncidents(
  query: string,
  options: QdrantSearchOptions = {}
): Promise<QdrantSearchResult[]> {
  const {
    limit = 20,
    scoreThreshold = 0.3, // ✅ LOWERED from 0.7 to 0.3 to get more results
    category,
    severity,
    industry,
    requireMfaData = false,
    requireBackupData = false,
    requireIrPlanData = false,
  } = options

  console.log(`[Qdrant] Searching for: "${query.substring(0, 100)}..."`)
  console.log(`[Qdrant] Filters: limit=${limit}, threshold=${scoreThreshold}, category=${category || 'all'}`)

  // Step 1: Generate embedding for query
  const startEmbedding = Date.now()
  const queryVector = await generateEmbedding(query)
  const embeddingTime = Date.now() - startEmbedding
  console.log(`[Qdrant] Generated query embedding in ${embeddingTime}ms`)

  // Step 2: Build filter conditions
  const filter: any = { must: [] }

  if (category) {
    filter.must.push({ key: 'category', match: { value: category } })
  }

  if (industry) {
    filter.must.push({ key: 'metadata.industry', match: { value: industry } })
  }

  if (severity && severity.length > 0) {
    filter.must.push({ key: 'metadata.severity', match: { any: severity } })
  }

  if (requireMfaData) {
    filter.must.push({ key: 'metadata.had_mfa', match: { value: null }, should_not: true })
  }

  if (requireBackupData) {
    filter.must.push({ key: 'metadata.had_backups', match: { value: null }, should_not: true })
  }

  if (requireIrPlanData) {
    filter.must.push({ key: 'metadata.had_ir_plan', match: { value: null }, should_not: true })
  }

  // Step 3: Execute vector search
  const client = getQdrantClient()
  const startSearch = Date.now()

  const searchParams: any = {
    vector: queryVector,
    limit,
    score_threshold: scoreThreshold,
    with_payload: true,
  }

  if (filter.must.length > 0) {
    searchParams.filter = filter
  }

  const searchResults = await client.search(COLLECTION_NAME, searchParams)

  const searchTime = Date.now() - startSearch
  console.log(`[Qdrant] Search completed in ${searchTime}ms (${searchResults.length} results)`)

  if (searchResults.length > 0) {
    const minScore = searchResults[searchResults.length - 1].score.toFixed(3)
    const maxScore = searchResults[0].score.toFixed(3)
    console.log(`[Qdrant] Score range: ${minScore} - ${maxScore}`)
  }

  // Step 4: Format results
  return searchResults.map(result => ({
    id: result.id,
    score: result.score,
    payload: result.payload as unknown as QdrantIncidentMetadata
  }))
}

/**
 * Get collection info
 */
export async function getCollectionInfo() {
  const client = getQdrantClient()

  try {
    const info = await client.getCollection(COLLECTION_NAME)
    console.log(`[Qdrant] Collection "${COLLECTION_NAME}" info:`)
    console.log(`  - Vectors: ${info.points_count}`)
    console.log(`  - Dimensions: ${info.config.params.vectors?.size || 'N/A'}`)
    console.log(`  - Distance: ${info.config.params.vectors?.distance || 'N/A'}`)
    return info
  } catch (error) {
    console.error(`[Qdrant] Failed to get collection info:`, error)
    throw error
  }
}

/**
 * Health check for Qdrant connection
 */
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    const client = getQdrantClient()
    const collections = await client.getCollections()

    const hasCollection = collections.collections.some(
      (c: any) => c.name === COLLECTION_NAME
    )

    if (!hasCollection) {
      console.warn(`[Qdrant] Collection "${COLLECTION_NAME}" not found`)
      return false
    }

    console.log(`[Qdrant] Health check passed`)
    return true
  } catch (error) {
    console.error(`[Qdrant] Health check failed:`, error)
    return false
  }
}
