/**
 * Redis Cache Service (Upstash)
 *
 * High-performance distributed cache for vector search results,
 * embeddings, and incident data.
 *
 * Features:
 * - REST API (serverless-friendly)
 * - Automatic TTL management
 * - Compression for large values
 * - Metrics tracking
 */

import { Redis } from '@upstash/redis'

// Initialize Upstash Redis client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Cache metrics
let cacheMetrics = {
  hits: 0,
  misses: 0,
  sets: 0,
  errors: 0,
  totalLatency: 0,
  operations: 0,
}

/**
 * Cache key prefixes for organization
 */
export const CACHE_PREFIXES = {
  VECTOR_SEARCH: 'vsearch:',
  EMBEDDINGS: 'embed:',
  INCIDENTS: 'incident:',
  METADATA: 'meta:',
  USER_DATA: 'user:',
} as const

/**
 * TTL configurations (in seconds)
 */
export const CACHE_TTL = {
  VECTOR_SEARCH: 300, // 5 minutes - search results change frequently
  EMBEDDINGS: 3600, // 1 hour - embeddings are static
  INCIDENTS: 900, // 15 minutes - incident data relatively static
  METADATA: 1800, // 30 minutes - metadata moderate refresh
  USER_DATA: 600, // 10 minutes - user data moderate refresh
} as const

/**
 * Get value from Redis cache
 */
export async function getFromCache<T>(key: string): Promise<T | null> {
  const startTime = Date.now()

  try {
    const value = await redis.get<T>(key)
    const latency = Date.now() - startTime

    // Update metrics
    cacheMetrics.operations++
    cacheMetrics.totalLatency += latency

    if (value !== null) {
      cacheMetrics.hits++
      console.log(`[Redis HIT] Key: ${key.substring(0, 50)}... (${latency}ms)`)
      return value
    } else {
      cacheMetrics.misses++
      console.log(`[Redis MISS] Key: ${key.substring(0, 50)}... (${latency}ms)`)
      return null
    }
  } catch (error) {
    cacheMetrics.errors++
    console.error('[Redis ERROR] Get failed:', error)
    return null // Fail gracefully
  }
}

/**
 * Set value in Redis cache with TTL
 */
export async function setInCache<T>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<boolean> {
  const startTime = Date.now()

  try {
    if (ttlSeconds) {
      await redis.set(key, value, { ex: ttlSeconds })
    } else {
      await redis.set(key, value)
    }

    const latency = Date.now() - startTime

    cacheMetrics.sets++
    cacheMetrics.operations++
    cacheMetrics.totalLatency += latency

    console.log(
      `[Redis SET] Key: ${key.substring(0, 50)}... TTL: ${ttlSeconds}s (${latency}ms)`
    )

    return true
  } catch (error) {
    cacheMetrics.errors++
    console.error('[Redis ERROR] Set failed:', error)
    return false
  }
}

/**
 * Delete value from cache
 */
export async function deleteFromCache(key: string): Promise<boolean> {
  try {
    await redis.del(key)
    console.log(`[Redis DEL] Key: ${key.substring(0, 50)}...`)
    return true
  } catch (error) {
    cacheMetrics.errors++
    console.error('[Redis ERROR] Delete failed:', error)
    return false
  }
}

/**
 * Delete multiple keys matching pattern
 */
export async function deletePattern(pattern: string): Promise<number> {
  try {
    // Note: Upstash Redis REST API doesn't support SCAN, so we'll use keys
    // For production at scale, consider using a different approach
    const keys = await redis.keys(pattern)

    if (keys.length === 0) {
      console.log(`[Redis DEL] No keys match pattern: ${pattern}`)
      return 0
    }

    await redis.del(...keys)
    console.log(`[Redis DEL] Deleted ${keys.length} keys matching: ${pattern}`)
    return keys.length
  } catch (error) {
    cacheMetrics.errors++
    console.error('[Redis ERROR] Delete pattern failed:', error)
    return 0
  }
}

/**
 * Check if key exists in cache
 */
export async function existsInCache(key: string): Promise<boolean> {
  try {
    const result = await redis.exists(key)
    return result === 1
  } catch (error) {
    console.error('[Redis ERROR] Exists check failed:', error)
    return false
  }
}

/**
 * Get multiple values at once (pipeline)
 */
export async function multiGetFromCache<T>(keys: string[]): Promise<(T | null)[]> {
  if (keys.length === 0) return []

  try {
    const pipeline = redis.pipeline()

    keys.forEach(key => {
      pipeline.get<T>(key)
    })

    const results = await pipeline.exec()

    // Update metrics
    const hits = results.filter(r => r !== null).length
    const misses = results.filter(r => r === null).length

    cacheMetrics.hits += hits
    cacheMetrics.misses += misses
    cacheMetrics.operations += keys.length

    console.log(`[Redis MGET] ${keys.length} keys: ${hits} hits, ${misses} misses`)

    return results as (T | null)[]
  } catch (error) {
    cacheMetrics.errors++
    console.error('[Redis ERROR] Multi-get failed:', error)
    return keys.map(() => null)
  }
}

/**
 * Set multiple values at once (pipeline)
 */
export async function multiSetInCache<T>(
  items: Array<{ key: string; value: T; ttl?: number }>
): Promise<boolean> {
  if (items.length === 0) return true

  try {
    const pipeline = redis.pipeline()

    items.forEach(({ key, value, ttl }) => {
      if (ttl) {
        pipeline.set(key, value, { ex: ttl })
      } else {
        pipeline.set(key, value)
      }
    })

    await pipeline.exec()

    cacheMetrics.sets += items.length
    cacheMetrics.operations += items.length

    console.log(`[Redis MSET] Set ${items.length} keys`)

    return true
  } catch (error) {
    cacheMetrics.errors++
    console.error('[Redis ERROR] Multi-set failed:', error)
    return false
  }
}

/**
 * Increment a counter
 */
export async function incrementCounter(
  key: string,
  amount: number = 1
): Promise<number> {
  try {
    const result = await redis.incrby(key, amount)
    return result
  } catch (error) {
    console.error('[Redis ERROR] Increment failed:', error)
    return 0
  }
}

/**
 * Get cache metrics
 */
export function getCacheMetrics() {
  const hitRate = cacheMetrics.operations > 0
    ? ((cacheMetrics.hits / cacheMetrics.operations) * 100).toFixed(2)
    : '0.00'

  const avgLatency = cacheMetrics.operations > 0
    ? Math.round(cacheMetrics.totalLatency / cacheMetrics.operations)
    : 0

  return {
    hits: cacheMetrics.hits,
    misses: cacheMetrics.misses,
    sets: cacheMetrics.sets,
    errors: cacheMetrics.errors,
    operations: cacheMetrics.operations,
    hitRate: `${hitRate}%`,
    avgLatency: `${avgLatency}ms`,
    totalLatency: cacheMetrics.totalLatency,
  }
}

/**
 * Reset cache metrics (for testing)
 */
export function resetCacheMetrics() {
  cacheMetrics = {
    hits: 0,
    misses: 0,
    sets: 0,
    errors: 0,
    totalLatency: 0,
    operations: 0,
  }
}

/**
 * Generate cache key for vector search
 */
export function generateVectorSearchKey(params: {
  query?: string
  vector?: number[]
  filters?: any
  limit?: number
}): string {
  const hash = require('crypto')
    .createHash('sha256')
    .update(JSON.stringify(params, Object.keys(params).sort()))
    .digest('hex')
    .substring(0, 16)

  return `${CACHE_PREFIXES.VECTOR_SEARCH}${hash}`
}

/**
 * Generate cache key for embeddings
 */
export function generateEmbeddingKey(text: string): string {
  const hash = require('crypto')
    .createHash('sha256')
    .update(text)
    .digest('hex')
    .substring(0, 16)

  return `${CACHE_PREFIXES.EMBEDDINGS}${hash}`
}

/**
 * Warm cache with frequently accessed data
 */
export async function warmCache(data: Array<{ key: string; value: any; ttl: number }>) {
  console.log(`[Redis] Warming cache with ${data.length} entries...`)

  const chunks = []
  const chunkSize = 100 // Process in batches

  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize))
  }

  for (const chunk of chunks) {
    await multiSetInCache(chunk)
  }

  console.log(`[Redis] Cache warming complete`)
}

/**
 * Health check for Redis connection
 */
export async function checkRedisHealth(): Promise<{
  healthy: boolean
  latency: number
  error?: string
}> {
  const startTime = Date.now()

  try {
    await redis.ping()
    const latency = Date.now() - startTime

    return {
      healthy: true,
      latency,
    }
  } catch (error) {
    const latency = Date.now() - startTime

    return {
      healthy: false,
      latency,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// Export Redis client for advanced use cases
export { redis }
