/**
 * Resilient Gemini Client with:
 * - Retry logic with exponential backoff
 * - Request timeout handling
 * - Rate limit handling
 * - Response caching
 * - Error recovery
 */

import { config } from '../config/env'
import { retryWithBackoff } from './retry'
import { LLMError } from './errors'
import { llmResponseCache, generateCacheKey } from './cache'

// NOTE: Gemini integration has been removed - this file is kept for interface compatibility
// All methods will throw errors indicating the service is not available

class ResilientGeminiClient {
  private requestCount = 0
  private errorCount = 0
  private lastRateLimitReset = Date.now()

  /**
   * Generate chat completion - DISABLED (Gemini client removed)
   */
  async chatCompletion(
    messages: Array<{ role: 'user' | 'system' | 'assistant'; content: string }>,
    options: {
      model?: string
      temperature?: number
      maxTokens?: number
      responseFormat?: { type: 'json_object' } | { type: 'text' }
      useCache?: boolean
      cacheTtl?: number
    } = {}
  ): Promise<string> {
    throw new LLMError('Gemini integration has been removed from this system. Please use alternative LLM providers.')
  }

  /**
   * Generate embeddings - NOT SUPPORTED BY GEMINI
   * Use Vertex AI embeddings instead
   */
  async generateEmbedding(
    text: string,
    options: {
      model?: string
      useCache?: boolean
    } = {}
  ): Promise<number[]> {
    throw new LLMError('Embeddings not supported by Gemini - use Vertex AI text-embedding-004 instead')
  }

  /**
   * Batch generate embeddings - NOT SUPPORTED BY GEMINI
   * Use Vertex AI embeddings instead
   */
  async batchGenerateEmbeddings(
    texts: string[],
    options: {
      model?: string
      batchSize?: number
      concurrency?: number
    } = {}
  ): Promise<number[][]> {
    throw new LLMError('Embeddings not supported by Gemini - use Vertex AI text-embedding-004 instead')
  }

  /**
   * Get client statistics
   */
  getStats() {
    const errorRate = this.requestCount > 0 ? (this.errorCount / this.requestCount) * 100 : 0

    return {
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      errorRate: errorRate.toFixed(2) + '%',
      lastRateLimitReset: new Date(this.lastRateLimitReset).toISOString(),
    }
  }

  /**
   * Reset statistics
   */
  resetStats() {
    this.requestCount = 0
    this.errorCount = 0
    this.lastRateLimitReset = Date.now()
  }
}

// Export singleton instance
export const resilientGeminiClient = new ResilientGeminiClient()

// Export class for testing
export { ResilientGeminiClient }
