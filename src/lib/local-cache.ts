/**
 * Local Memory Cache (LRU)
 *
 * Fast in-memory cache for frequently accessed data.
 * Each backend instance has its own cache (no network overhead).
 *
 * Cache Hierarchy:
 * L1: Local Memory (this file) - 1-5ms latency
 * L2: Redis (redis-cache.ts) - 20-50ms latency
 * L3: Database/Vector DB - 100-5000ms latency
 */

import { LRUCache } from 'lru-cache'
import crypto from 'crypto'

// ============================================================================
// CACHE INSTANCES
// ============================================================================

/**
 * Cache for vector search results
 * - Short TTL (1 minute) since results can change
 * - High access frequency
 */
export const vectorSearchCache = new LRUCache<string, any>({
  max: 1000, // 1000 unique queries
  ttl: 60000, // 1 minute TTL
  ttlAutopurge: true,
  updateAgeOnGet: true, // LRU behavior
  allowStale: false,
})

/**
 * Cache for embeddings
 * - Longer TTL (1 hour) since embeddings are deterministic
 * - Embeddings are expensive to generate
 */
export const embeddingCache = new LRUCache<string, number[]>({
  max: 5000, // 5000 unique texts
  ttl: 3600000, // 1 hour TTL
  ttlAutopurge: true,
  updateAgeOnGet: true,
  allowStale: false,
})

/**
 * Cache for incident metadata
 * - Medium TTL (5 minutes)
 * - Moderate access frequency
 */
export const incidentCache = new LRUCache<string, any>({
  max: 2000,
  ttl: 300000, // 5 minutes TTL
  ttlAutopurge: true,
  updateAgeOnGet: true,
  allowStale: false,
})

/**
 * Cache for user data (subscriptions, tiers, etc.)
 */
export const userDataCache = new LRUCache<string, any>({
  max: 10000, // 10K users
  ttl: 600000, // 10 minutes TTL
  ttlAutopurge: true,
  updateAgeOnGet: true,
  allowStale: false,
})

/**
 * Cache for LLM responses
 * - Long TTL (1 hour) since LLM responses are deterministic for same input
 * - Expensive to regenerate
 */
export const llmResponseCache = new LRUCache<string, any>({
  max: 1000,
  ttl: 3600000, // 1 hour TTL
  ttlAutopurge: true,
  updateAgeOnGet: true,
  allowStale: false,
})

// ============================================================================
// CACHE KEY GENERATION
// ============================================================================

/**
 * Generate cache key from search parameters
 */
export function generateCacheKey(params: {
  query?: string
  vector?: number[]
  filters?: any
  limit?: number
}): string {
  const normalized = {
    query: params.query || '',
    vector: params.vector ? params.vector.slice(0, 10).join(',') : '', // First 10 dimensions for key
    filters: JSON.stringify(params.filters || {}, Object.keys(params.filters || {}).sort()),
    limit: params.limit || 100,
  }

  // Create short hash for efficient key storage
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 16)

  return `vsearch:${hash}`
}

/**
 * Generate cache key for embeddings
 */
export function generateEmbeddingCacheKey(text: string): string {
  const hash = crypto
    .createHash('sha256')
    .update(text.trim().toLowerCase())
    .digest('hex')
    .substring(0, 16)

  return `embed:${hash}`
}

/**
 * Generate cache key for incidents
 */
export function generateIncidentCacheKey(incidentId: string): string {
  return `incident:${incidentId}`
}

/**
 * Generate cache key for user data
 */
export function generateUserCacheKey(userId: string, dataType: string): string {
  return `user:${userId}:${dataType}`
}

// ============================================================================
// CACHE OPERATIONS WITH METRICS
// ============================================================================

interface CacheStats {
  hits: number
  misses: number
  sets: number
}

const cacheStats = new Map<string, CacheStats>()

function initStats(cacheName: string) {
  if (!cacheStats.has(cacheName)) {
    cacheStats.set(cacheName, { hits: 0, misses: 0, sets: 0 })
  }
}

/**
 * Get from cache with metrics tracking
 */
export function getFromLocalCache<T extends {}>(
  cache: LRUCache<string, T>,
  cacheName: string,
  key: string
): T | undefined {
  initStats(cacheName)
  const stats = cacheStats.get(cacheName)!

  const value = cache.get(key)

  if (value !== undefined) {
    stats.hits++
    console.log(`[L1 HIT] ${cacheName}: ${key.substring(0, 40)}...`)
  } else {
    stats.misses++
    console.log(`[L1 MISS] ${cacheName}: ${key.substring(0, 40)}...`)
  }

  return value
}

/**
 * Set in cache with metrics tracking
 */
export function setInLocalCache<T extends {}>(
  cache: LRUCache<string, T>,
  cacheName: string,
  key: string,
  value: T
): void {
  initStats(cacheName)
  const stats = cacheStats.get(cacheName)!

  cache.set(key, value)
  stats.sets++

  console.log(`[L1 SET] ${cacheName}: ${key.substring(0, 40)}...`)
}

// ============================================================================
// CACHE METRICS
// ============================================================================

/**
 * Get cache metrics for monitoring
 */
export function getLocalCacheMetrics() {
  const metrics: any = {}

  // Vector Search Cache
  const vsStats = cacheStats.get('vectorSearch') || { hits: 0, misses: 0, sets: 0 }
  const vsTotal = vsStats.hits + vsStats.misses
  metrics.vectorSearch = {
    size: vectorSearchCache.size,
    calculatedSize: vectorSearchCache.calculatedSize,
    max: vectorSearchCache.max,
    ttl: 60000,
    hits: vsStats.hits,
    misses: vsStats.misses,
    sets: vsStats.sets,
    hitRate: vsTotal > 0 ? ((vsStats.hits / vsTotal) * 100).toFixed(2) + '%' : '0%',
  }

  // Embedding Cache
  const embStats = cacheStats.get('embeddings') || { hits: 0, misses: 0, sets: 0 }
  const embTotal = embStats.hits + embStats.misses
  metrics.embeddings = {
    size: embeddingCache.size,
    calculatedSize: embeddingCache.calculatedSize,
    max: embeddingCache.max,
    ttl: 3600000,
    hits: embStats.hits,
    misses: embStats.misses,
    sets: embStats.sets,
    hitRate: embTotal > 0 ? ((embStats.hits / embTotal) * 100).toFixed(2) + '%' : '0%',
  }

  // Incident Cache
  const incStats = cacheStats.get('incidents') || { hits: 0, misses: 0, sets: 0 }
  const incTotal = incStats.hits + incStats.misses
  metrics.incidents = {
    size: incidentCache.size,
    calculatedSize: incidentCache.calculatedSize,
    max: incidentCache.max,
    ttl: 300000,
    hits: incStats.hits,
    misses: incStats.misses,
    sets: incStats.sets,
    hitRate: incTotal > 0 ? ((incStats.hits / incTotal) * 100).toFixed(2) + '%' : '0%',
  }

  // User Data Cache
  const userStats = cacheStats.get('userData') || { hits: 0, misses: 0, sets: 0 }
  const userTotal = userStats.hits + userStats.misses
  metrics.userData = {
    size: userDataCache.size,
    calculatedSize: userDataCache.calculatedSize,
    max: userDataCache.max,
    ttl: 600000,
    hits: userStats.hits,
    misses: userStats.misses,
    sets: userStats.sets,
    hitRate: userTotal > 0 ? ((userStats.hits / userTotal) * 100).toFixed(2) + '%' : '0%',
  }

  return metrics
}

/**
 * Reset cache metrics (for testing)
 */
export function resetLocalCacheMetrics() {
  cacheStats.clear()
}

/**
 * Clear all local caches
 */
export function clearAllLocalCaches() {
  vectorSearchCache.clear()
  embeddingCache.clear()
  incidentCache.clear()
  userDataCache.clear()
  console.log('[L1] All local caches cleared')
}

/**
 * Get memory usage estimate
 */
export function getLocalCacheMemoryUsage(): {
  totalBytes: number
  totalMB: number
  breakdown: any
} {
  const breakdown = {
    vectorSearch: vectorSearchCache.calculatedSize || 0,
    embeddings: embeddingCache.calculatedSize || 0,
    incidents: incidentCache.calculatedSize || 0,
    userData: userDataCache.calculatedSize || 0,
  }

  const totalBytes =
    breakdown.vectorSearch +
    breakdown.embeddings +
    breakdown.incidents +
    breakdown.userData

  const totalMB = (totalBytes / 1024 / 1024).toFixed(2)

  return {
    totalBytes,
    totalMB: parseFloat(totalMB),
    breakdown,
  }
}
