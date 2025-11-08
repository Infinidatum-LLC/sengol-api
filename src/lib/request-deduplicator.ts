/**
 * Request Deduplication Service
 *
 * Merges identical in-flight requests to prevent duplicate work.
 * Especially useful for popular queries that multiple users search simultaneously.
 *
 * Example:
 * - 10 users search "AI bias" within 1 second
 * - Without dedup: 10 d-vecDB queries
 * - With dedup: 1 d-vecDB query (other 9 wait for result)
 */

import crypto from 'crypto'

interface InFlightRequest<T> {
  promise: Promise<T>
  createdAt: number
  requestCount: number
  resolvers: Array<{
    resolve: (value: T) => void
    reject: (error: any) => void
  }>
}

class RequestDeduplicator {
  private inFlight = new Map<string, InFlightRequest<any>>()
  private metrics = {
    totalRequests: 0,
    dedupedRequests: 0,
    savedRequests: 0,
    activeRequests: 0,
  }

  /**
   * Execute function with deduplication
   *
   * If an identical request is already in flight, wait for it instead of executing again.
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options: { ttl?: number } = {}
  ): Promise<T> {
    const ttl = options.ttl || 5000 // 5 seconds default dedup window

    this.metrics.totalRequests++

    // Check if request is already in flight
    const existing = this.inFlight.get(key)

    if (existing) {
      // Don't dedupe if request is too old (might have timed out)
      const age = Date.now() - existing.createdAt
      if (age < ttl) {
        existing.requestCount++
        this.metrics.dedupedRequests++
        this.metrics.savedRequests++

        console.log(
          `[Dedup] Merging request #${existing.requestCount} for key: ${key.substring(0, 50)}...`
        )

        // Wait for the in-flight request
        return existing.promise
      } else {
        // Request too old, remove it
        console.log(`[Dedup] Request expired (${age}ms > ${ttl}ms), executing new request`)
        this.inFlight.delete(key)
      }
    }

    // Execute new request
    console.log(`[Dedup] Starting new request for key: ${key.substring(0, 50)}...`)

    const startTime = Date.now()
    const promise = fn()

    // Store in-flight request
    this.inFlight.set(key, {
      promise,
      createdAt: Date.now(),
      requestCount: 1,
      resolvers: [],
    })

    this.metrics.activeRequests++

    // Clean up after completion
    promise
      .then(result => {
        const request = this.inFlight.get(key)
        if (request) {
          const duration = Date.now() - startTime
          if (request.requestCount > 1) {
            console.log(
              `[Dedup] ✅ Completed request served ${request.requestCount} callers in ${duration}ms (saved ${request.requestCount - 1} duplicate requests)`
            )
          } else {
            console.log(`[Dedup] ✅ Completed unique request in ${duration}ms`)
          }
        }
      })
      .catch(error => {
        const request = this.inFlight.get(key)
        if (request) {
          console.log(
            `[Dedup] ❌ Request failed after serving ${request.requestCount} callers`
          )
        }
      })
      .finally(() => {
        this.inFlight.delete(key)
        this.metrics.activeRequests--
      })

    return promise
  }

  /**
   * Generate hash key from object (deterministic)
   */
  hash(obj: any): string {
    // Sort keys for consistent hashing
    const sortedObj = JSON.stringify(obj, Object.keys(obj).sort())
    return crypto.createHash('sha256').update(sortedObj).digest('hex')
  }

  /**
   * Generate hash key from string
   */
  hashString(str: string): string {
    return crypto.createHash('sha256').update(str).digest('hex')
  }

  /**
   * Get metrics for monitoring
   */
  getMetrics() {
    const dedupRate =
      this.metrics.totalRequests > 0
        ? ((this.metrics.dedupedRequests / this.metrics.totalRequests) * 100).toFixed(2)
        : '0.00'

    const savingsRate =
      this.metrics.totalRequests > 0
        ? ((this.metrics.savedRequests / this.metrics.totalRequests) * 100).toFixed(2)
        : '0.00'

    return {
      totalRequests: this.metrics.totalRequests,
      dedupedRequests: this.metrics.dedupedRequests,
      savedRequests: this.metrics.savedRequests,
      activeRequests: this.metrics.activeRequests,
      inFlightCount: this.inFlight.size,
      dedupRate: `${dedupRate}%`,
      savingsRate: `${savingsRate}%`,
      estimatedTimeSaved:
        this.metrics.savedRequests > 0
          ? `~${Math.round(this.metrics.savedRequests * 2.5)} seconds` // Assuming 2.5s avg per request
          : '0 seconds',
    }
  }

  /**
   * Reset metrics (for testing)
   */
  resetMetrics() {
    this.metrics = {
      totalRequests: 0,
      dedupedRequests: 0,
      savedRequests: 0,
      activeRequests: 0,
    }
  }

  /**
   * Clear all in-flight requests (for testing/maintenance)
   */
  clear() {
    this.inFlight.clear()
    this.metrics.activeRequests = 0
    console.log('[Dedup] All in-flight requests cleared')
  }

  /**
   * Get list of active request keys (for debugging)
   */
  getActiveKeys(): string[] {
    return Array.from(this.inFlight.keys())
  }

  /**
   * Get detailed info about a specific in-flight request
   */
  getRequestInfo(key: string): {
    exists: boolean
    requestCount?: number
    age?: number
  } | null {
    const request = this.inFlight.get(key)

    if (!request) {
      return { exists: false }
    }

    return {
      exists: true,
      requestCount: request.requestCount,
      age: Date.now() - request.createdAt,
    }
  }
}

// Singleton instance
export const requestDeduplicator = new RequestDeduplicator()

/**
 * Convenience wrapper for common use case
 */
export async function deduplicate<T>(
  key: string,
  fn: () => Promise<T>,
  ttl?: number
): Promise<T> {
  return requestDeduplicator.execute(key, fn, { ttl })
}
