/**
 * Resilient OpenAI Client with:
 * - Retry logic with exponential backoff
 * - Request timeout handling
 * - Rate limit handling
 * - Response caching
 * - Error recovery
 */

import OpenAI from 'openai'
import { config } from '../config/env'
import { withRetry, withTimeout } from './retry'
import { LLMError } from './errors'
import { llmResponseCache, generateCacheKey } from './cache'

class ResilientOpenAIClient {
  private client: OpenAI
  private requestCount = 0
  private errorCount = 0
  private lastRateLimitReset = Date.now()

  constructor() {
    this.client = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: config.openaiTimeout,
      maxRetries: 0, // We handle retries ourselves
    })
  }

  /**
   * Generate chat completion with full resilience
   */
  async chatCompletion(
    messages: OpenAI.ChatCompletionMessageParam[],
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
      model = 'gpt-4o',
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
        console.log('[OpenAI] Chat completion cache hit')
        return cached
      }
    }

    try {
      this.requestCount++

      const response = await withRetry(
        async () => {
          return await withTimeout(
            this.client.chat.completions.create({
              model,
              messages,
              temperature,
              max_tokens: maxTokens,
              response_format: responseFormat,
            }),
            config.openaiTimeout,
            'openai-chat-completion'
          )
        },
        {
          maxRetries: config.openaiMaxRetries,
          initialDelay: 2000,
          maxDelay: 30000,
          retryableErrors: ['ECONNRESET', 'ETIMEDOUT', 'rate_limit_exceeded', '429', '503'],
          onRetry: (error, attempt) => {
            console.warn(`[OpenAI] Chat completion retry ${attempt}/${config.openaiMaxRetries}`, {
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
        throw new LLMError('No content in OpenAI response', {
          model,
          finishReason: response.choices[0]?.finish_reason,
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
        `OpenAI chat completion failed: ${(error as Error).message}`,
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
   * Generate embeddings with full resilience
   */
  async generateEmbedding(
    text: string,
    options: {
      model?: string
      useCache?: boolean
    } = {}
  ): Promise<number[]> {
    const { model = 'text-embedding-3-small', useCache = true } = options

    // Check cache if enabled
    if (useCache) {
      const cacheKey = generateCacheKey('embedding', text, model)
      const cached = llmResponseCache.get(cacheKey)
      if (cached) {
        console.log('[OpenAI] Embedding cache hit')
        return cached
      }
    }

    try {
      this.requestCount++

      const embedding = await withRetry(
        async () => {
          return await withTimeout(
            (async () => {
              const response = await this.client.embeddings.create({
                model,
                input: text,
                encoding_format: 'float',
              })

              if (!response.data || response.data.length === 0) {
                throw new LLMError('No embedding data returned from OpenAI')
              }

              return response.data[0].embedding
            })(),
            config.openaiTimeout,
            'openai-embedding'
          )
        },
        {
          maxRetries: config.openaiMaxRetries,
          initialDelay: 1000,
          maxDelay: 10000,
          onRetry: (error, attempt) => {
            console.warn(`[OpenAI] Embedding retry ${attempt}/${config.openaiMaxRetries}`, {
              error: error.message,
            })
          },
        }
      )

      // Cache the result
      if (useCache) {
        const cacheKey = generateCacheKey('embedding', text, model)
        llmResponseCache.set(cacheKey, embedding)
      }

      return embedding
    } catch (error) {
      this.errorCount++
      throw new LLMError(
        `OpenAI embedding generation failed: ${(error as Error).message}`,
        {
          model,
          textLength: text.length,
          requestCount: this.requestCount,
          errorCount: this.errorCount,
        }
      )
    }
  }

  /**
   * Batch generate embeddings with concurrency control
   */
  async batchGenerateEmbeddings(
    texts: string[],
    options: {
      model?: string
      batchSize?: number
      concurrency?: number
    } = {}
  ): Promise<number[][]> {
    const { model = 'text-embedding-3-small', batchSize = 20, concurrency = 3 } = options

    console.log(`[OpenAI] Batch generating ${texts.length} embeddings (batch size: ${batchSize}, concurrency: ${concurrency})`)

    // Split into batches
    const batches: string[][] = []
    for (let i = 0; i < texts.length; i += batchSize) {
      batches.push(texts.slice(i, i + batchSize))
    }

    // Process batches with controlled concurrency
    const results: number[][] = []
    for (let i = 0; i < batches.length; i += concurrency) {
      const batchPromises = batches.slice(i, i + concurrency).map(async (batch) => {
        return await Promise.all(
          batch.map((text) => this.generateEmbedding(text, { model }))
        )
      })

      const batchResults = await Promise.all(batchPromises)
      results.push(...batchResults.flat())

      console.log(`[OpenAI] Processed ${Math.min((i + concurrency) * batchSize, texts.length)}/${texts.length} embeddings`)
    }

    return results
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
export const resilientOpenAIClient = new ResilientOpenAIClient()

// Export class for testing
export { ResilientOpenAIClient }
