/**
 * SIMPLIFIED Qdrant Client - Rewritten from scratch
 * Based on successful Python tests that proved the data works
 *
 * Supports both:
 * - Self-hosted Qdrant (HTTP, no auth)
 * - Qdrant Cloud (HTTPS, API key auth)
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import { OpenAI } from 'openai'

// Configuration
const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost'
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333')
const QDRANT_API_KEY = process.env.QDRANT_API_KEY
const QDRANT_USE_HTTPS = process.env.QDRANT_USE_HTTPS === 'true'
const COLLECTION_NAME = 'sengol_incidents'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

// Determine if using Qdrant Cloud or self-hosted
const IS_QDRANT_CLOUD = !!QDRANT_API_KEY

console.log(`[Qdrant] Configuration:`)
console.log(`  Mode: ${IS_QDRANT_CLOUD ? 'QDRANT CLOUD (HTTPS + API Key)' : 'Self-Hosted (HTTP)'}`)
console.log(`  Host: ${QDRANT_HOST}`)
if (!IS_QDRANT_CLOUD) {
  console.log(`  Port: ${QDRANT_PORT}`)
}
console.log(`  Collection: ${COLLECTION_NAME}`)
console.log(`  Model: ${EMBEDDING_MODEL}`)

// Singleton clients
let qdrantClient: QdrantClient | null = null
let openaiClient: OpenAI | null = null

/**
 * Get Qdrant client
 * Automatically configures for Qdrant Cloud or self-hosted based on env vars
 */
function getQdrantClient(): QdrantClient {
  if (!qdrantClient) {
    const clientConfig: any = {}

    if (IS_QDRANT_CLOUD) {
      // Qdrant Cloud: Use HTTPS with API key
      // Host format: "xxxxx.qdrant.io" (already includes domain)
      clientConfig.url = `https://${QDRANT_HOST}`
      clientConfig.apiKey = QDRANT_API_KEY
      console.log(`[Qdrant] Using Qdrant Cloud at: https://${QDRANT_HOST}`)
    } else {
      // Self-hosted: Use HTTP with host and port
      const protocol = QDRANT_USE_HTTPS ? 'https' : 'http'
      clientConfig.url = `${protocol}://${QDRANT_HOST}:${QDRANT_PORT}`
      console.log(`[Qdrant] Using self-hosted at: ${protocol}://${QDRANT_HOST}:${QDRANT_PORT}`)
    }

    qdrantClient = new QdrantClient(clientConfig)
    console.log(`[Qdrant] Client initialized`)
  }
  return qdrantClient
}

/**
 * Get OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY required')
    }
    openaiClient = new OpenAI({ apiKey })
    console.log(`[OpenAI] Client initialized`)
  }
  return openaiClient
}

/**
 * Generate embedding (matches Python test exactly)
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const startTime = Date.now()
  const client = getOpenAIClient()

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  const latency = Date.now() - startTime
  console.log(`[OpenAI] Generated embedding in ${latency}ms`)

  return response.data[0].embedding
}

/**
 * Search incidents (simplified - no complex filtering)
 */
export async function searchIncidents(
  query: string,
  limit: number = 20,
  minScore: number = 0.3
): Promise<any[]> {
  console.log(`\n[Qdrant] === NEW SEARCH ===`)
  console.log(`[Qdrant] Query: "${query.substring(0, 80)}..."`)
  console.log(`[Qdrant] Limit: ${limit}`)
  console.log(`[Qdrant] Min Score: ${minScore}`)

  try {
    // Step 1: Generate embedding
    const embeddingStart = Date.now()
    const queryVector = await generateEmbedding(query)
    const embeddingTime = Date.now() - embeddingStart
    console.log(`[Qdrant] Embedding generated in ${embeddingTime}ms (${queryVector.length} dims)`)

    // Step 2: Search Qdrant
    const searchStart = Date.now()
    const client = getQdrantClient()

    console.log(`[Qdrant] Executing search...`)
    console.log(`[Qdrant]   Collection: ${COLLECTION_NAME}`)
    console.log(`[Qdrant]   Min score (post-filter): ${minScore}`)
    console.log(`[Qdrant]   Limit: ${limit}`)

    // FIX: Remove score_threshold from search params - do post-filtering instead
    // The score_threshold parameter was silently failing and returning 0 results
    const rawResults = await client.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: limit * 3,  // Get more results to filter
      with_payload: true,
    })

    const searchTime = Date.now() - searchStart
    console.log(`[Qdrant] Search completed in ${searchTime}ms`)
    console.log(`[Qdrant] Raw results: ${rawResults.length} matches (before filtering)`)

    // Post-filter by score
    const results = rawResults.filter(r => r.score >= minScore).slice(0, limit)
    console.log(`[Qdrant] Filtered results: ${results.length} matches (score >= ${minScore})`)

    if (results.length > 0) {
      const topScore = results[0].score
      const lowScore = results[results.length - 1].score
      console.log(`[Qdrant] Score range: ${lowScore.toFixed(3)} - ${topScore.toFixed(3)}`)

      // Log top 3 results
      console.log(`[Qdrant] Top 3 results:`)
      results.slice(0, 3).forEach((r, i) => {
        const content = (r.payload?.content || 'N/A').toString().substring(0, 60)
        console.log(`[Qdrant]   ${i+1}. Score ${r.score.toFixed(3)}: ${content}...`)
      })
    } else {
      console.warn(`[Qdrant] WARNING: 0 results returned`)
      console.warn(`[Qdrant] This should NOT happen with score threshold ${minScore}`)
    }

    const totalTime = Date.now() - embeddingStart
    console.log(`[Qdrant] Total search time: ${totalTime}ms`)

    return results

  } catch (error) {
    console.error(`[Qdrant] ERROR:`, error)
    throw error
  }
}

/**
 * Health check
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const client = getQdrantClient()
    const collections = await client.getCollections()

    const hasCollection = collections.collections.some(
      (c: any) => c.name === COLLECTION_NAME
    )

    if (!hasCollection) {
      console.error(`[Qdrant] Collection "${COLLECTION_NAME}" not found`)
      return false
    }

    const info = await client.getCollection(COLLECTION_NAME)
    console.log(`[Qdrant] Health check passed:`)
    console.log(`  Points: ${info.points_count}`)
    console.log(`  Status: ${info.status}`)

    return true
  } catch (error) {
    console.error(`[Qdrant] Health check failed:`, error)
    return false
  }
}
