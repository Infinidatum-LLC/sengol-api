/**
 * OpenAI Client Wrapper
 *
 * Provides a Gemini-compatible interface for OpenAI
 * Allows easy switching between OpenAI and Gemini without code changes
 */

import { OpenAI } from 'openai'
import { config } from '../config/env'

// Lazy initialization
let openaiClient: OpenAI | null = null

/**
 * Get or create OpenAI client
 */
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!config.openaiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    console.log('[OpenAI] Initializing client')

    openaiClient = new OpenAI({
      apiKey: config.openaiApiKey,
      timeout: config.openaiTimeout,
      maxRetries: config.openaiMaxRetries,
    })
  }
  return openaiClient
}

/**
 * Message types (compatible with Gemini format)
 */
export interface OpenAIMessage {
  role: 'user' | 'system' | 'assistant'
  content: string
}

/**
 * Completion request options
 */
export interface OpenAICompletionOptions {
  model?: string // Optional: override default model
  messages: OpenAIMessage[]
  temperature?: number // 0-1 (default: 0.7)
  maxTokens?: number // Max output tokens (default: 8192)
  responseFormat?: { type: 'json_object' | 'text' } // JSON mode
}

/**
 * Completion response (compatible with Gemini format)
 */
export interface OpenAICompletionResponse {
  choices: Array<{
    message: {
      content: string | null
      role: 'assistant'
    }
    finishReason: string
  }>
  usage: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

/**
 * Create a chat completion using OpenAI
 *
 * This provides a Gemini-compatible interface for easy switching
 */
export async function createChatCompletion(
  options: OpenAICompletionOptions
): Promise<OpenAICompletionResponse> {
  try {
    const client = getOpenAIClient()

    // Use GPT-4o by default (fast, intelligent, cost-effective)
    const model = options.model || 'gpt-4o'

    // Build request parameters
    const requestParams: any = {
      model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 8192,
    }

    // Enable JSON mode if requested
    if (options.responseFormat?.type === 'json_object') {
      requestParams.response_format = { type: 'json_object' }
    }

    console.log(`[OpenAI] Generating completion (model=${model}, temp=${requestParams.temperature}, max=${requestParams.max_tokens})`)

    // Generate completion
    const response = await client.chat.completions.create(requestParams)

    const choice = response.choices[0]
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    console.log(`[OpenAI] ✅ Completion generated (${usage.total_tokens} tokens: ${usage.prompt_tokens} prompt + ${usage.completion_tokens} completion)`)

    // Return in Gemini-compatible format
    return {
      choices: [
        {
          message: {
            content: choice.message.content,
            role: 'assistant',
          },
          finishReason: choice.finish_reason || 'stop',
        },
      ],
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    }
  } catch (error) {
    console.error('[OpenAI] Failed to generate completion:', error)
    throw new Error(
      'OpenAI completion failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * OpenAI client with Gemini-compatible interface
 *
 * This allows us to do a simple find-and-replace:
 * `gemini.chat.completions.create()` → `openai.chat.completions.create()`
 */
export const openai = {
  chat: {
    completions: {
      create: createChatCompletion,
    },
  },
}

/**
 * Export for backward compatibility
 */
export default openai

/**
 * Export OpenAI client for direct usage
 */
export function getOpenAI(): OpenAI {
  return getOpenAIClient()
}
