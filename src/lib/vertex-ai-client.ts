/**
 * Google Vertex AI RAG Client
 *
 * Replaces d-vecDB VPS with Google Vertex AI for:
 * - Vector embeddings (text-embedding-004 model)
 * - Semantic search using RAG (Retrieval-Augmented Generation)
 * - Cloud Storage integration for incident data
 *
 * MAINTAINS SAME INTERFACE as d-vecDB for zero frontend changes
 */

import { VertexAI } from '@google-cloud/vertexai'
import { Storage } from '@google-cloud/storage'
import { PredictionServiceClient } from '@google-cloud/aiplatform'
import { getGoogleAuth } from './google-auth'

// Lazy initialization
let vertexAI: VertexAI | null = null
let storageClient: Storage | null = null
let predictionClient: PredictionServiceClient | null = null

/**
 * Get or create Vertex AI client with lazy initialization
 */
function getVertexAI(): VertexAI {
  if (!vertexAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT?.trim()
    const location = (process.env.VERTEX_AI_LOCATION || 'us-central1').trim()

    if (!project) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT environment variable is not set. ' +
        'Please set it in .env (e.g., GOOGLE_CLOUD_PROJECT=sengolvertexapi)'
      )
    }

    console.log(`[Vertex AI] Initializing client: project=${project}, location=${location}`)

    // Initialize credentials (writes temp file if needed)
    getGoogleAuth()

    vertexAI = new VertexAI({
      project,
      location,
    })
  }
  return vertexAI
}

/**
 * Get or create Google Cloud Storage client
 */
function getStorageClient(): Storage {
  if (!storageClient) {
    const project = process.env.GOOGLE_CLOUD_PROJECT?.trim()

    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set')
    }

    console.log(`[Cloud Storage] Initializing client: project=${project}`)

    // Initialize credentials (writes temp file if needed)
    getGoogleAuth()

    // Storage client will automatically use GOOGLE_APPLICATION_CREDENTIALS
    storageClient = new Storage({
      projectId: project,
    })
  }
  return storageClient
}

/**
 * Get or create Prediction Service client for embeddings
 */
function getPredictionClient(): PredictionServiceClient {
  if (!predictionClient) {
    const location = (process.env.VERTEX_AI_LOCATION || 'us-central1').trim()

    console.log(`[Prediction Service] Initializing client: location=${location}`)

    // Initialize credentials (writes temp file if needed)
    getGoogleAuth()

    predictionClient = new PredictionServiceClient({
      apiEndpoint: `${location}-aiplatform.googleapis.com`,
    })
  }
  return predictionClient
}

/**
 * Configuration
 */
function getBucketName(): string {
  return process.env.GCS_BUCKET_NAME || 'sengol-incidents'
}

function getCorpusName(): string {
  return process.env.VERTEX_AI_CORPUS || 'incidents-corpus'
}

// Vertex AI models
const EMBEDDING_MODEL = 'text-embedding-004' // Latest Vertex AI embedding model
const EMBEDDING_DIMENSION = 768 // Vertex AI text-embedding-004 dimension

/**
 * Metadata structure for incident embeddings (same as d-vecDB)
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
 * Search result (same interface as d-vecDB)
 */
export interface SearchResult {
  id: string
  distance: number // Cosine distance (0-2, lower is more similar)
  score: number // Similarity score (0-1, higher is more similar)
  metadata: IncidentMetadata
}

/**
 * Generate embedding using Vertex AI text-embedding-004 model
 *
 * @param text - Text to embed
 * @returns 768-dimensional embedding vector
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const client = getPredictionClient()
    const project = process.env.GOOGLE_CLOUD_PROJECT?.trim()
    const location = (process.env.VERTEX_AI_LOCATION || 'us-central1').trim()

    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT not set')
    }

    // Vertex AI text-embedding-004 endpoint
    const endpoint = `projects/${project}/locations/${location}/publishers/google/models/text-embedding-004`

    // Make prediction request
    const [response] = await client.predict({
      endpoint,
      instances: [
        {
          structValue: {
            fields: {
              content: { stringValue: text },
            },
          },
        },
      ],
    })

    // Extract embedding from response
    const predictions = response.predictions
    if (!predictions || predictions.length === 0) {
      throw new Error('No embedding data returned from Vertex AI')
    }

    const prediction = predictions[0]

    // Try different possible response formats
    let embedding: number[] | undefined

    // Format 1: Direct embeddings array
    if ((prediction as any).embeddings?.values) {
      embedding = (prediction as any).embeddings.values
    }
    // Format 2: In structValue
    else if ((prediction as any).structValue?.fields?.embeddings?.listValue?.values) {
      const values = (prediction as any).structValue.fields.embeddings.listValue.values
      embedding = values.map((v: any) => v.numberValue || v)
    }
    // Format 3: Direct array
    else if (Array.isArray(prediction)) {
      embedding = prediction
    }

    if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
      console.error('[Vertex AI] Raw prediction response:', JSON.stringify(prediction, null, 2))
      throw new Error('Invalid embedding format from Vertex AI')
    }

    console.log(`[Vertex AI] Generated embedding: ${embedding.length} dimensions`)

    return embedding
  } catch (error) {
    console.error('[Vertex AI] Failed to generate embedding:', error)
    throw new Error(
      'Vertex AI embedding generation failed: ' +
        (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Generate multiple embeddings in batch
 *
 * @param texts - Array of texts to embed
 * @returns Array of embedding vectors
 */
export async function generateBatchEmbeddings(texts: string[]): Promise<number[][]> {
  console.log(`[Vertex AI] Generating ${texts.length} embeddings in batch...`)

  try {
    // Vertex AI batching - process in chunks of 100
    const BATCH_SIZE = 100
    const embeddings: number[][] = []

    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      const batch = texts.slice(i, i + BATCH_SIZE)
      const batchEmbeddings = await Promise.all(
        batch.map(text => generateEmbedding(text))
      )
      embeddings.push(...batchEmbeddings)

      console.log(`[Vertex AI] Processed ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length} embeddings`)
    }

    return embeddings
  } catch (error) {
    console.error('[Vertex AI] Failed to generate batch embeddings:', error)
    throw error
  }
}

/**
 * Search for similar incidents using Vertex AI RAG
 *
 * This reads processed incidents with embeddings from Cloud Storage and performs
 * similarity search using vector similarity.
 *
 * @param queryText - Text to search for
 * @param filter - Metadata filters (same as d-vecDB)
 * @param topK - Number of results to return
 * @returns Array of search results with similarity scores
 */
export async function searchByText(
  queryText: string,
  filter?: Partial<IncidentMetadata>,
  topK: number = 10
): Promise<SearchResult[]> {
  try {
    console.log(`[Vertex AI] Searching for: "${queryText.substring(0, 100)}..."`)
    console.log(`[Vertex AI] Filters:`, filter)

    // Step 1: Generate query embedding
    const queryEmbedding = await generateEmbedding(queryText)

    // Step 2: Read processed incidents from Cloud Storage
    const storage = getStorageClient()
    const bucketName = getBucketName()
    const bucket = storage.bucket(bucketName)

    // List all processed incident files
    const [files] = await bucket.getFiles({ prefix: 'incidents/embeddings/' })

    if (files.length === 0) {
      console.warn('[Vertex AI] ⚠️ No processed incidents found in Cloud Storage')
      console.warn('[Vertex AI] ⚠️ Run crawler and embedding pipeline to populate data')
      return []
    }

    console.log(`[Vertex AI] Found ${files.length} embedding files`)

    // Step 3: Read and parse incidents
    const allIncidents: Array<{
      incident: any
      similarity: number
    }> = []

    for (const file of files) {
      try {
        const [content] = await file.download()
        const lines = content.toString().split('\n')

        for (const line of lines) {
          if (!line.trim()) continue

          const incident = JSON.parse(line)

          // Apply filters
          if (filter) {
            if (filter.industry && incident.metadata?.industry !== filter.industry) continue
            if (filter.severity && incident.metadata?.severity !== filter.severity) continue
            if (filter.incidentType && incident.metadata?.incidentType !== filter.incidentType) continue
          }

          // Calculate cosine similarity
          const similarity = cosineSimilarity(queryEmbedding, incident.embedding)

          allIncidents.push({ incident, similarity })
        }
      } catch (err) {
        console.error(`[Vertex AI] Error processing file ${file.name}:`, err)
        continue
      }
    }

    // Step 4: Sort by similarity and take top K
    allIncidents.sort((a, b) => b.similarity - a.similarity)
    const topResults = allIncidents.slice(0, topK)

    // Step 5: Convert to SearchResult format
    const results: SearchResult[] = topResults.map(({ incident, similarity }) => ({
      id: incident.id,
      distance: (1 - similarity) * 2, // Convert similarity to distance (0-2)
      score: similarity,
      metadata: incident.metadata as IncidentMetadata,
    }))

    console.log(`[Vertex AI] Found ${results.length} matching incidents (top ${topK})`)
    if (results.length > 0) {
      console.log(`[Vertex AI] Similarity range: ${results[results.length - 1].score.toFixed(3)} - ${results[0].score.toFixed(3)}`)
    }

    return results
  } catch (error) {
    console.error('[Vertex AI] Search failed:', error)
    throw new Error(
      'Vertex AI search failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Vectors must have the same length')
  }

  let dotProduct = 0
  let normA = 0
  let normB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Search by pre-computed embedding vector
 *
 * @param queryEmbedding - Pre-computed embedding vector
 * @param filter - Metadata filters
 * @param topK - Number of results to return
 * @returns Array of search results
 */
export async function searchSimilar(
  queryEmbedding: number[],
  filter?: Partial<IncidentMetadata>,
  topK: number = 10
): Promise<SearchResult[]> {
  console.log(`[Vertex AI] Searching by embedding vector (${queryEmbedding.length} dimensions)`)

  // TODO: Implement direct vector search using Vertex AI Vector Search API
  // For now, this is a placeholder
  console.warn('[Vertex AI] ⚠️ Direct vector search not yet implemented')

  return []
}

/**
 * Upload incident data to Cloud Storage bucket
 *
 * This function is used by crawlers to upload processed incident data
 * to the GCS bucket for Vertex AI to index and search.
 *
 * @param incidents - Array of incident documents with metadata
 * @returns Upload summary
 */
export async function uploadIncidentsToStorage(
  incidents: Array<{
    id: string
    text: string
    metadata: IncidentMetadata
  }>
): Promise<{ uploaded: number; failed: number }> {
  try {
    const storage = getStorageClient()
    const bucketName = getBucketName()
    const bucket = storage.bucket(bucketName)

    console.log(`[Cloud Storage] Uploading ${incidents.length} incidents to ${bucketName}...`)

    let uploaded = 0
    let failed = 0

    for (const incident of incidents) {
      try {
        // Create JSONL format for Vertex AI RAG
        const jsonl = JSON.stringify({
          id: incident.id,
          content: incident.text,
          metadata: incident.metadata,
        })

        // Upload to bucket
        const fileName = `incidents/${incident.id}.jsonl`
        const file = bucket.file(fileName)

        await file.save(jsonl, {
          contentType: 'application/jsonl',
          metadata: {
            metadata: incident.metadata,
          },
        })

        uploaded++

        if (uploaded % 100 === 0) {
          console.log(`[Cloud Storage] Uploaded ${uploaded}/${incidents.length} incidents...`)
        }
      } catch (error) {
        console.error(`[Cloud Storage] Failed to upload incident ${incident.id}:`, error)
        failed++
      }
    }

    console.log(`[Cloud Storage] ✅ Upload complete: ${uploaded} succeeded, ${failed} failed`)

    return { uploaded, failed }
  } catch (error) {
    console.error('[Cloud Storage] Upload failed:', error)
    throw error
  }
}

/**
 * Health check for Vertex AI and Cloud Storage
 */
export async function healthCheck(): Promise<{
  configured: boolean
  vertexAIReachable: boolean
  storageReachable: boolean
  bucketExists: boolean
  error?: string
}> {
  try {
    // Check if environment variables are set
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      return {
        configured: false,
        vertexAIReachable: false,
        storageReachable: false,
        bucketExists: false,
        error: 'GOOGLE_CLOUD_PROJECT not set in environment',
      }
    }

    // Check Vertex AI
    try {
      const vertexai = getVertexAI()
      console.log('[Vertex AI] Health check: Client initialized')
    } catch (err) {
      return {
        configured: true,
        vertexAIReachable: false,
        storageReachable: false,
        bucketExists: false,
        error: `Vertex AI client initialization failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }

    // Check Cloud Storage bucket
    try {
      const storage = getStorageClient()
      const bucketName = getBucketName()
      const [exists] = await storage.bucket(bucketName).exists()

      return {
        configured: true,
        vertexAIReachable: true,
        storageReachable: true,
        bucketExists: exists,
        error: exists ? undefined : `Bucket ${bucketName} does not exist`,
      }
    } catch (err) {
      return {
        configured: true,
        vertexAIReachable: true,
        storageReachable: false,
        bucketExists: false,
        error: `Cloud Storage health check failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }
    }
  } catch (error) {
    return {
      configured: true,
      vertexAIReachable: false,
      storageReachable: false,
      bucketExists: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

/**
 * Get Cloud Storage statistics
 */
export async function getStorageStats(): Promise<{
  bucketName: string
  incidentCount: number
  totalSize: number
}> {
  try {
    const storage = getStorageClient()
    const bucketName = getBucketName()
    const bucket = storage.bucket(bucketName)

    const [files] = await bucket.getFiles({ prefix: 'incidents/' })

    let totalSize = 0
    for (const file of files) {
      const [metadata] = await file.getMetadata()
      totalSize += parseInt(String(metadata.size || 0), 10)
    }

    return {
      bucketName,
      incidentCount: files.length,
      totalSize,
    }
  } catch (error) {
    console.error('[Cloud Storage] Failed to get stats:', error)
    throw error
  }
}
