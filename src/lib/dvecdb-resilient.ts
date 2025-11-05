/**
 * Resilient d-vecDB Client with:
 * - Circuit breaker pattern
 * - Retry logic with exponential backoff
 * - Connection pooling simulation
 * - Request timeout handling
 * - Error recovery
 * - Health monitoring
 */

import { VectorDBClient } from 'd-vecdb'
import { config } from '../config/env'
import { CircuitBreaker } from './circuit-breaker'
import { withRetry, withTimeout } from './retry'
import { VectorDBError } from './errors'

export interface SearchOptions {
  timeout?: number
  maxRetries?: number
  skipCache?: boolean
}

class ResilientVectorDBClient {
  private client: VectorDBClient
  private circuitBreaker: CircuitBreaker
  private isHealthy: boolean = true
  private lastHealthCheck: number = 0
  private readonly healthCheckInterval = 30000 // 30 seconds

  constructor() {
    this.client = new VectorDBClient({
      host: config.dvecdbHost,
      port: config.dvecdbPort,
      timeout: config.dvecdbTimeout || 30000,
    })

    this.circuitBreaker = new CircuitBreaker('dvecdb', {
      failureThreshold: 5,
      successThreshold: 2,
      timeout: 60000, // 1 minute before retry
      monitoringPeriod: 120000, // 2 minute window
    })

    // Start periodic health checks
    this.startHealthMonitoring()
  }

  /**
   * Search by vector with full resilience
   */
  async searchByVector(
    vector: number[],
    filter?: Record<string, any>,
    limit: number = 20,
    options: SearchOptions = {}
  ): Promise<any[]> {
    const { timeout = 30000, maxRetries = 3 } = options

    try {
      return await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            return await withTimeout(
              this.client.searchSimple(
                config.dvecdbCollection,
                vector,
                limit,
                undefined, // efSearch
                filter
              ),
              timeout,
              'dvecdb-search-vector'
            )
          },
          {
            maxRetries,
            initialDelay: 1000,
            maxDelay: 10000,
            timeout,
            onRetry: (error, attempt) => {
              console.warn(
                `[d-vecDB] Vector search retry attempt ${attempt}/${maxRetries}`,
                { error: error.message, limit }
              )
            },
          }
        )
      })
    } catch (error) {
      this.isHealthy = false
      const wrappedError = new VectorDBError(
        `d-vecDB vector search failed: ${(error as Error).message}`,
        {
          operation: 'searchByVector',
          limit,
          circuitBreakerState: this.circuitBreaker.getState(),
        }
      )
      console.error('[d-vecDB] Vector search error:', wrappedError.toJSON())
      throw wrappedError
    }
  }

  /**
   * Search by text with full resilience
   * Note: d-vecDB doesn't have searchByText, so we need to generate embedding first
   */
  async searchByText(
    query: string,
    filter?: Record<string, any>,
    limit: number = 20,
    options: SearchOptions = {}
  ): Promise<any[]> {
    const { timeout = 30000, maxRetries = 3 } = options

    // Import generateEmbedding from dvecdb-embeddings
    const { generateEmbedding } = await import('../services/dvecdb-embeddings')

    try {
      // Generate embedding first
      const embedding = await generateEmbedding(query)

      // Then search with vector
      return await this.circuitBreaker.execute(async () => {
        return await withRetry(
          async () => {
            return await withTimeout(
              this.client.searchSimple(
                config.dvecdbCollection,
                embedding,
                limit,
                undefined, // efSearch
                filter
              ),
              timeout,
              'dvecdb-search-text'
            )
          },
          {
            maxRetries,
            initialDelay: 1000,
            maxDelay: 10000,
            timeout,
            onRetry: (error, attempt) => {
              console.warn(
                `[d-vecDB] Text search retry attempt ${attempt}/${maxRetries}`,
                { error: error.message, query: query.substring(0, 50), limit }
              )
            },
          }
        )
      })
    } catch (error) {
      this.isHealthy = false
      const wrappedError = new VectorDBError(
        `d-vecDB text search failed: ${(error as Error).message}`,
        {
          operation: 'searchByText',
          query: query.substring(0, 100),
          limit,
          circuitBreakerState: this.circuitBreaker.getState(),
        }
      )
      console.error('[d-vecDB] Text search error:', wrappedError.toJSON())
      throw wrappedError
    }
  }

  /**
   * Batch search optimization - search multiple queries in parallel
   */
  async batchSearchByText(
    queries: string[],
    filter?: Record<string, any>,
    limit: number = 20,
    options: SearchOptions = {}
  ): Promise<any[][]> {
    console.log(`[d-vecDB] Batch search for ${queries.length} queries`)

    // Use Promise.allSettled to handle partial failures gracefully
    const results = await Promise.allSettled(
      queries.map(query => this.searchByText(query, filter, limit, options))
    )

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value
      } else {
        console.error(
          `[d-vecDB] Batch query ${index} failed:`,
          result.reason.message
        )
        // Return empty array for failed queries instead of failing entire batch
        return []
      }
    })
  }

  /**
   * Health check for monitoring
   */
  async healthCheck(): Promise<boolean> {
    try {
      // Perform a ping to test connectivity
      await withTimeout(
        this.client.ping(),
        5000,
        'dvecdb-health-check'
      )
      this.isHealthy = true
      this.lastHealthCheck = Date.now()
      return true
    } catch (error) {
      this.isHealthy = false
      this.lastHealthCheck = Date.now()
      console.error('[d-vecDB] Health check failed:', (error as Error).message)
      return false
    }
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    return {
      healthy: this.isHealthy,
      lastCheck: new Date(this.lastHealthCheck).toISOString(),
      circuitBreaker: this.circuitBreaker.getStats(),
    }
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring() {
    setInterval(async () => {
      await this.healthCheck()
    }, this.healthCheckInterval)
  }

  /**
   * Reset circuit breaker (for manual intervention)
   */
  resetCircuitBreaker() {
    this.circuitBreaker.reset()
    console.log('[d-vecDB] Circuit breaker manually reset')
  }

  /**
   * Get statistics
   */
  getStats() {
    return {
      circuitBreaker: this.circuitBreaker.getStats(),
      health: {
        isHealthy: this.isHealthy,
        lastHealthCheck: new Date(this.lastHealthCheck).toISOString(),
      },
    }
  }
}

// Export singleton instance
export const resilientDvecdbClient = new ResilientVectorDBClient()

// Export class for testing
export { ResilientVectorDBClient }
