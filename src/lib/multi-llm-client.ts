/**
 * Multi-Provider LLM Client with Automatic Fallback
 * 
 * Supports multiple LLM providers with automatic fallback:
 * 1. OpenAI (GPT-4o, GPT-4-turbo)
 * 2. Anthropic (Claude Sonnet 4)
 * 3. Google Gemini (via OpenAI-compatible API if available)
 * 
 * Features:
 * - Automatic fallback if primary provider fails
 * - Configurable provider priority
 * - Unified interface across all providers
 * - Retry logic with exponential backoff
 * - Detailed logging for debugging
 */

import { OpenAI } from 'openai'
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config/env'

// ============================================================================
// TYPES
// ============================================================================

export interface LLMMessage {
  role: 'user' | 'system' | 'assistant'
  content: string
}

export interface LLMCompletionOptions {
  messages: LLMMessage[]
  model?: string
  temperature?: number
  maxTokens?: number
  responseFormat?: { type: 'json_object' | 'text' }
  timeout?: number
}

export interface LLMCompletionResponse {
  content: string
  provider: 'openai' | 'anthropic' | 'gemini'
  model: string
  usage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
  }
}

export type LLMProvider = 'openai' | 'anthropic' | 'gemini'

// ============================================================================
// PROVIDER CONFIGURATION
// ============================================================================

interface ProviderConfig {
  enabled: boolean
  priority: number // Lower = higher priority
  apiKey?: string
  defaultModel: string
  timeout: number
  maxRetries: number
}

const PROVIDER_CONFIG: Record<LLMProvider, ProviderConfig> = {
  openai: {
    enabled: !!process.env.OPENAI_API_KEY,
    priority: 1, // Primary provider
    apiKey: process.env.OPENAI_API_KEY,
    defaultModel: 'gpt-4o',
    timeout: 60000, // 60 seconds
    maxRetries: 3,
  },
  anthropic: {
    enabled: !!process.env.ANTHROPIC_API_KEY,
    priority: 2, // Secondary provider
    apiKey: process.env.ANTHROPIC_API_KEY,
    defaultModel: 'claude-sonnet-4-20250514',
    timeout: 60000,
    maxRetries: 3,
  },
  gemini: {
    enabled: !!process.env.GEMINI_API_KEY,
    priority: 3, // Tertiary provider
    apiKey: process.env.GEMINI_API_KEY,
    defaultModel: 'gemini-2.0-flash-exp',
    timeout: 60000,
    maxRetries: 2,
  },
}

// ============================================================================
// CLIENT SINGLETONS
// ============================================================================

let openaiClient: OpenAI | null = null
let anthropicClient: Anthropic | null = null

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!PROVIDER_CONFIG.openai.apiKey) {
      throw new Error('OPENAI_API_KEY not configured')
    }
    openaiClient = new OpenAI({
      apiKey: PROVIDER_CONFIG.openai.apiKey,
      timeout: PROVIDER_CONFIG.openai.timeout,
      maxRetries: PROVIDER_CONFIG.openai.maxRetries,
    })
  }
  return openaiClient
}

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    if (!PROVIDER_CONFIG.anthropic.apiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }
    anthropicClient = new Anthropic({
      apiKey: PROVIDER_CONFIG.anthropic.apiKey,
      timeout: PROVIDER_CONFIG.anthropic.timeout,
      maxRetries: PROVIDER_CONFIG.anthropic.maxRetries,
    })
  }
  return anthropicClient
}

// ============================================================================
// PROVIDER IMPLEMENTATIONS
// ============================================================================

async function callOpenAI(
  options: LLMCompletionOptions
): Promise<LLMCompletionResponse> {
  const client = getOpenAIClient()
  const model = options.model || PROVIDER_CONFIG.openai.defaultModel

  const requestParams: any = {
    model,
    messages: options.messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    temperature: options.temperature ?? 0.7,
    max_tokens: options.maxTokens ?? 4096,
  }

  if (options.responseFormat?.type === 'json_object') {
    requestParams.response_format = { type: 'json_object' }
  }

  console.log(`[LLM] OpenAI: Generating completion (model=${model})`)

  const response = await client.chat.completions.create(requestParams)
  const choice = response.choices[0]
  const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

  if (!choice.message.content) {
    throw new Error('OpenAI returned empty content')
  }

  console.log(`[LLM] OpenAI: ✅ Success (${usage.total_tokens} tokens)`)

  return {
    content: choice.message.content,
    provider: 'openai',
    model,
    usage: {
      promptTokens: usage.prompt_tokens,
      completionTokens: usage.completion_tokens,
      totalTokens: usage.total_tokens,
    },
  }
}

async function callAnthropic(
  options: LLMCompletionOptions
): Promise<LLMCompletionResponse> {
  const client = getAnthropicClient()
  const model = options.model || PROVIDER_CONFIG.anthropic.defaultModel

  // Separate system message from user messages
  const systemMessage = options.messages.find((m) => m.role === 'system')?.content || ''
  const userMessages = options.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content,
    }))

  console.log(`[LLM] Anthropic: Generating completion (model=${model})`)

  const requestParams: any = {
    model,
    messages: userMessages as any,
    max_tokens: options.maxTokens ?? 4096,
    temperature: options.temperature ?? 0.7,
  }

  if (systemMessage) {
    requestParams.system = systemMessage
  }

  // Anthropic doesn't support JSON mode directly, but we can request it in the prompt
  if (options.responseFormat?.type === 'json_object') {
    // Add JSON format instruction to system message
    if (!requestParams.system) {
      requestParams.system = 'You must respond with valid JSON only. No markdown, no code blocks.'
    } else {
      requestParams.system += '\n\nYou must respond with valid JSON only. No markdown, no code blocks.'
    }
  }

  const response = await client.messages.create(requestParams)
  const content = response.content[0]

  if (content.type !== 'text') {
    throw new Error('Anthropic returned non-text content')
  }

  const text = content.text
  const usage = response.usage

  console.log(`[LLM] Anthropic: ✅ Success (${usage.input_tokens + usage.output_tokens} tokens)`)

  return {
    content: text,
    provider: 'anthropic',
    model,
    usage: {
      promptTokens: usage.input_tokens,
      completionTokens: usage.output_tokens,
      totalTokens: usage.input_tokens + usage.output_tokens,
    },
  }
}

async function callGemini(
  options: LLMCompletionOptions
): Promise<LLMCompletionResponse> {
  // Gemini via OpenAI-compatible API (if using Google's API)
  // For now, we'll use OpenAI client with Gemini model if available
  // This requires Google to provide OpenAI-compatible endpoint
  
  // Fallback: Use OpenAI client with gemini model name
  // This assumes Google provides OpenAI-compatible API
  const client = getOpenAIClient()
  const model = options.model || PROVIDER_CONFIG.gemini.defaultModel

  console.log(`[LLM] Gemini: Attempting via OpenAI-compatible API (model=${model})`)

  try {
    const requestParams: any = {
      model,
      messages: options.messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
    }

    if (options.responseFormat?.type === 'json_object') {
      requestParams.response_format = { type: 'json_object' }
    }

    const response = await client.chat.completions.create(requestParams)
    const choice = response.choices[0]
    const usage = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

    if (!choice.message.content) {
      throw new Error('Gemini returned empty content')
    }

    console.log(`[LLM] Gemini: ✅ Success (${usage.total_tokens} tokens)`)

    return {
      content: choice.message.content,
      provider: 'gemini',
      model,
      usage: {
        promptTokens: usage.prompt_tokens,
        completionTokens: usage.completion_tokens,
        totalTokens: usage.total_tokens,
      },
    }
  } catch (error) {
    // If Gemini fails, it will be caught by fallback mechanism
    throw new Error(`Gemini API error: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// ============================================================================
// MAIN CLIENT WITH FALLBACK
// ============================================================================

/**
 * Get available providers sorted by priority
 */
function getAvailableProviders(): LLMProvider[] {
  return (Object.keys(PROVIDER_CONFIG) as LLMProvider[])
    .filter((provider) => PROVIDER_CONFIG[provider].enabled)
    .sort((a, b) => PROVIDER_CONFIG[a].priority - PROVIDER_CONFIG[b].priority)
}

/**
 * Call LLM with automatic fallback
 */
export async function callLLM(
  options: LLMCompletionOptions
): Promise<LLMCompletionResponse> {
  const availableProviders = getAvailableProviders()

  if (availableProviders.length === 0) {
    throw new Error(
      'No LLM providers configured. Please set at least one of: OPENAI_API_KEY, ANTHROPIC_API_KEY, or GEMINI_API_KEY'
    )
  }

  console.log(`[LLM] Available providers: ${availableProviders.join(', ')}`)
  console.log(`[LLM] Attempting providers in order: ${availableProviders.join(' → ')}`)

  const errors: Array<{ provider: LLMProvider; error: Error }> = []

  for (const provider of availableProviders) {
    try {
      console.log(`[LLM] Trying ${provider.toUpperCase()}...`)

      let response: LLMCompletionResponse

      switch (provider) {
        case 'openai':
          response = await callOpenAI(options)
          break
        case 'anthropic':
          response = await callAnthropic(options)
          break
        case 'gemini':
          response = await callGemini(options)
          break
        default:
          throw new Error(`Unknown provider: ${provider}`)
      }

      console.log(`[LLM] ✅ Success with ${provider.toUpperCase()}`)
      return response
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      console.error(`[LLM] ❌ ${provider.toUpperCase()} failed: ${errorMessage}`)
      errors.push({ provider, error: error instanceof Error ? error : new Error(String(error)) })

      // Continue to next provider
      continue
    }
  }

  // All providers failed
  const errorMessages = errors.map((e) => `${e.provider}: ${e.error.message}`).join('; ')
  throw new Error(
    `All LLM providers failed. Errors: ${errorMessages}. Please check your API keys and network connection.`
  )
}

/**
 * Get provider status
 */
export function getProviderStatus(): Record<LLMProvider, { enabled: boolean; priority: number }> {
  return {
    openai: {
      enabled: PROVIDER_CONFIG.openai.enabled,
      priority: PROVIDER_CONFIG.openai.priority,
    },
    anthropic: {
      enabled: PROVIDER_CONFIG.anthropic.enabled,
      priority: PROVIDER_CONFIG.anthropic.priority,
    },
    gemini: {
      enabled: PROVIDER_CONFIG.gemini.enabled,
      priority: PROVIDER_CONFIG.gemini.priority,
    },
  }
}

/**
 * Gemini-compatible interface for backward compatibility
 * Returns response with provider information for logging
 */
export const gemini = {
  chat: {
    completions: {
      create: async (options: any) => {
        const response = await callLLM({
          messages: options.messages || [],
          model: options.model,
          temperature: options.temperature,
          maxTokens: options.max_tokens || options.maxTokens,
          responseFormat: options.response_format || options.responseFormat,
        })

        // Return in OpenAI-compatible format with provider info
        const result = {
          choices: [
            {
              message: {
                content: response.content,
                role: 'assistant' as const,
              },
              finish_reason: 'stop',
            },
          ],
          usage: response.usage || {
            prompt_tokens: 0,
            completion_tokens: 0,
            total_tokens: 0,
          },
          // Add provider info for logging/debugging
          provider: response.provider,
          model: response.model,
        }
        
        return result
      },
    },
  },
}

export default { callLLM, getProviderStatus, gemini }

