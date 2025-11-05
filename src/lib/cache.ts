/**
 * In-Memory Cache with LRU Eviction
 *
 * Provides caching for expensive operations like d-vecDB searches and LLM calls.
 * Uses LRU (Least Recently Used) eviction policy to manage memory.
 */

import crypto from 'crypto'
import { config } from '../config/env'

interface CacheEntry<T> {
  value: T
  expiresAt: number
  lastAccessed: number
  size: number
}

export class Cache<T = any> {
  private cache = new Map<string, CacheEntry<T>>()
  private accessOrder: string[] = [] // For LRU tracking
  private currentSize = 0
  private hits = 0
  private misses = 0

  constructor(
    private readonly maxSize: number = config.cacheMaxSize,
    private readonly defaultTtl: number = config.cacheTtl * 1000 // Convert to ms
  ) {}

  /**
   * Get item from cache
   */
  get(key: string): T | undefined {
    if (!config.cacheEnabled) {
      return undefined
    }

    const entry = this.cache.get(key)

    if (!entry) {
      this.misses++
      return undefined
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.delete(key)
      this.misses++
      return undefined
    }

    // Update access time and order for LRU
    entry.lastAccessed = Date.now()
    this.updateAccessOrder(key)
    this.hits++

    return entry.value
  }

  /**
   * Set item in cache
   */
  set(key: string, value: T, ttl?: number): void {
    if (!config.cacheEnabled) {
      return
    }

    const size = this.estimateSize(value)
    const expiresAt = Date.now() + (ttl || this.defaultTtl)

    // If item already exists, remove it first
    if (this.cache.has(key)) {
      this.delete(key)
    }

    // Evict items if necessary
    while (this.currentSize + size > this.maxSize && this.cache.size > 0) {
      this.evictLRU()
    }

    // Add new entry
    const entry: CacheEntry<T> = {
      value,
      expiresAt,
      lastAccessed: Date.now(),
      size,
    }

    this.cache.set(key, entry)
    this.accessOrder.push(key)
    this.currentSize += size
  }

  /**
   * Delete item from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key)
    if (!entry) {
      return false
    }

    this.cache.delete(key)
    this.currentSize -= entry.size
    this.accessOrder = this.accessOrder.filter(k => k !== key)
    return true
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.accessOrder = []
    this.currentSize = 0
  }

  /**
   * Get cache statistics
   */
  getStats() {
    const total = this.hits + this.misses
    const hitRate = total > 0 ? (this.hits / total) * 100 : 0

    return {
      size: this.cache.size,
      currentSize: this.currentSize,
      maxSize: this.maxSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: hitRate.toFixed(2) + '%',
      enabled: config.cacheEnabled,
    }
  }

  /**
   * Clean up expired entries
   */
  cleanup(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.delete(key)
        cleaned++
      }
    }

    return cleaned
  }

  /**
   * Evict least recently used item
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) {
      return
    }

    const oldestKey = this.accessOrder[0]
    this.delete(oldestKey)
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    this.accessOrder = this.accessOrder.filter(k => k !== key)
    this.accessOrder.push(key)
  }

  /**
   * Estimate size of value in bytes (rough estimate)
   */
  private estimateSize(value: any): number {
    const json = JSON.stringify(value)
    return json.length * 2 // Rough estimate: 2 bytes per char
  }
}

/**
 * Generate cache key from arguments
 */
export function generateCacheKey(prefix: string, ...args: any[]): string {
  const data = JSON.stringify(args)
  const hash = crypto.createHash('md5').update(data).digest('hex')
  return `${prefix}:${hash}`
}

/**
 * Decorator for caching function results
 */
export function cached<T>(
  cache: Cache<T>,
  keyPrefix: string,
  ttl?: number
) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value

    descriptor.value = async function (...args: any[]) {
      const cacheKey = generateCacheKey(keyPrefix, ...args)

      // Try to get from cache
      const cachedResult = cache.get(cacheKey)
      if (cachedResult !== undefined) {
        console.log(`[Cache] HIT: ${keyPrefix}`)
        return cachedResult
      }

      console.log(`[Cache] MISS: ${keyPrefix}`)

      // Execute original method
      const result = await originalMethod.apply(this, args)

      // Store in cache
      cache.set(cacheKey, result, ttl)

      return result
    }

    return descriptor
  }
}

// Global cache instances
export const vectorSearchCache = new Cache(
  config.cacheMaxSize,
  config.cacheTtl * 1000
)

export const llmResponseCache = new Cache(
  Math.floor(config.cacheMaxSize / 2), // Smaller cache for LLM responses
  config.cacheTtl * 1000 * 2 // Longer TTL for LLM (2x)
)

// Start periodic cleanup (every 5 minutes)
setInterval(() => {
  const vectorCleaned = vectorSearchCache.cleanup()
  const llmCleaned = llmResponseCache.cleanup()
  if (vectorCleaned > 0 || llmCleaned > 0) {
    console.log(
      `[Cache] Cleanup: ${vectorCleaned} vector entries, ${llmCleaned} LLM entries`
    )
  }
}, 5 * 60 * 1000)
