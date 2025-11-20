/**
 * Simple In-Memory Cache with TTL
 *
 * Provides LRU cache for subscription and trial data.
 * Automatically invalidates entries after TTL expires.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
  hits: number
  created: number
}

export interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
  entries: Array<{
    key: string
    age: number
    ttl: number
    hits: number
  }>
}

export class Cache<T = unknown> {
  private store = new Map<string, CacheEntry<T>>()
  private hits = 0
  private misses = 0

  constructor(private maxSize: number = 1000) {}

  /**
   * Get value from cache
   * Returns undefined if not found or expired
   */
  get(key: string): T | undefined {
    const entry = this.store.get(key)

    if (!entry) {
      this.misses++
      return undefined
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      this.misses++
      return undefined
    }

    entry.hits++
    this.hits++
    return entry.value
  }

  /**
   * Set value in cache with TTL (milliseconds)
   */
  set(key: string, value: T, ttlMs: number): void {
    // Remove oldest entry if at capacity
    if (this.store.size >= this.maxSize && !this.store.has(key)) {
      let oldestKey: string | null = null
      let oldestTime = Infinity

      for (const [k, entry] of this.store.entries()) {
        if (entry.created < oldestTime) {
          oldestTime = entry.created
          oldestKey = k
        }
      }

      if (oldestKey) {
        this.store.delete(oldestKey)
      }
    }

    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      hits: 0,
      created: Date.now(),
    })
  }

  /**
   * Delete specific key
   */
  delete(key: string): boolean {
    return this.store.delete(key)
  }

  /**
   * Clear all entries matching pattern
   */
  deletePattern(pattern: RegExp | string): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern
    let deleted = 0

    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key)
        deleted++
      }
    }

    return deleted
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    this.store.clear()
    this.hits = 0
    this.misses = 0
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const now = Date.now()
    const entries = Array.from(this.store.entries()).map(([key, entry]) => ({
      key,
      age: now - entry.created,
      ttl: entry.expiresAt - now,
      hits: entry.hits,
    }))

    const total = this.hits + this.misses
    const hitRate = total === 0 ? 0 : (this.hits / total) * 100

    return {
      size: this.store.size,
      hits: this.hits,
      misses: this.misses,
      hitRate,
      entries,
    }
  }

  /**
   * Get hit rate percentage
   */
  getHitRate(): number {
    const total = this.hits + this.misses
    return total === 0 ? 0 : (this.hits / total) * 100
  }
}

/**
 * Global cache instances
 */
export const subscriptionCache = new Cache<{ tier: string; status: string }>(1000)
export const trialStatusCache = new Cache<any>(1000)
export const featureUsageCache = new Cache<{ used: number; limit: number }>(2000)

/**
 * Cache key builders
 */
export const cacheKeys = {
  subscription: (userId: string) => `sub:${userId}`,
  trialStatus: (userId: string) => `trial:${userId}`,
  featureUsage: (userId: string, feature: string) => `usage:${userId}:${feature}`,
}

/**
 * Invalidate user's cached data
 */
export function invalidateUserCache(userId: string): void {
  subscriptionCache.delete(cacheKeys.subscription(userId))
  trialStatusCache.delete(cacheKeys.trialStatus(userId))
  featureUsageCache.deletePattern(new RegExp(`^usage:${userId}:`))
}

/**
 * Clear all caches
 */
export function clearAllCaches(): void {
  subscriptionCache.clear()
  trialStatusCache.clear()
  featureUsageCache.clear()
}

/**
 * LLM Response Cache - for caching expensive LLM calls
 */
export const llmResponseCache = new Cache<any>(500)

/**
 * Generate cache key for LLM responses
 * Combines model, prompt hash, and parameters
 */
export function generateCacheKey(
  model: string,
  input: string,
  params?: Record<string, unknown>
): string {
  const paramsStr = params ? JSON.stringify(params) : ''
  // Simple hash-like key based on input content
  const inputHash = input.substring(0, 50).replace(/\s+/g, '_')
  return `llm:${model}:${inputHash}:${paramsStr.length}`
}
