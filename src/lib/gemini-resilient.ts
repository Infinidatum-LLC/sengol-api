/**
 * Resilient Gemini Client with:
 * - Retry logic with exponential backoff
 * - Request timeout handling
 * - Rate limit handling
 * - Response caching
 * - Error recovery
 */

import { gemini, GeminiMessage } from './gemini-client'
import { config } from '../config/env'
import { withRetry, withTimeout } from './retry'
import { LLMError } from './errors'
import { llmResponseCache, generateCacheKey } from './cache'

class ResilientGeminiClient {
  private requestCount = 0
  private errorCount = 0
  private lastRateLimitReset = Date.now()

  /**
   * Generate chat completion with full resilience
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
    const {
      model = 'gemini-2.0-flash-exp',
      temperature = 0.3,
      maxTokens,
      responseFormat,
      useCache = true,
      cacheTtl = config.cacheTtl * 1000 * 2, // 2x default TTL for LLM
    } = options

    // Check cache if enabled
    if (useCache) {
      const cacheKey = generateCacheKey('llm-chat', messages, model, temperature)
      const cached = llmResponseCache.get(cacheKey)
      if (cached) {
        console.log('[Gemini] Chat completion cache hit')
        return cached
      }
    }

    try {
      this.requestCount++

      const response = await withRetry(
        async () => {
          return await withTimeout(
            gemini.chat.completions.create({
              messages: messages as GeminiMessage[],
              temperature,
              maxTokens,
              responseFormat,
            }),
            config.openaiTimeout, // Reuse OpenAI timeout config
            'gemini-chat-completion'
          )
        },
        {
          maxRetries: config.openaiMaxRetries,
          initialDelay: 2000,
          maxDelay: 30000,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'rate_limit_exceeded', '429', '503'],
          onRetry: (error, attempt) => {
            console.warn(`[Gemini] Chat completion retry ${attempt}/${config.openaiMaxRetries}`, {
              error: error.message,
              model,
            })

            // If rate limited, wait longer
            if (error.message.includes('rate_limit') || error.message.includes('429')) {
              return Promise.resolve() // The retry logic will handle the delay
            }
          },
        }
      )

      const content = response.choices[0]?.message?.content

      if (!content) {
        throw new LLMError('No content in Gemini response', {
          model,
          finishReason: response.choices[0]?.finishReason,
        })
      }

      // Cache the result
      if (useCache) {
        const cacheKey = generateCacheKey('llm-chat', messages, model, temperature)
        llmResponseCache.set(cacheKey, content, cacheTtl)
      }

      return content
    } catch (error) {
      this.errorCount++
      throw new LLMError(
        `Gemini chat completion failed: ${(error as Error).message}`,
        {
          model,
          messageCount: messages.length,
          requestCount: this.requestCount,
          errorCount: this.errorCount,
        }
      )
    }
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
