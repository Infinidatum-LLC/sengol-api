/**
 * Google Gemini Client (Vertex AI)
 *
 * Replaces OpenAI for question generation and system analysis
 * Uses Gemini 2.0 Flash model for high-performance, low-cost inference
 *
 * Key Benefits over OpenAI:
 * - 60-80% cost reduction
 * - Same quality responses
 * - Integrated with Google Cloud (same auth as Vertex AI embeddings)
 * - No separate API key management
 */

import { VertexAI, GenerativeModel } from '@google-cloud/vertexai'
import { getGoogleAuth } from './google-auth'

// Lazy initialization
let vertexAI: VertexAI | null = null
let geminiModel: GenerativeModel | null = null

/**
 * Get or create Vertex AI client
 */
function getVertexAI(): VertexAI {
  if (!vertexAI) {
    const project = process.env.GOOGLE_CLOUD_PROJECT
    const location = process.env.VERTEX_AI_LOCATION || 'us-central1'

    if (!project) {
      throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set')
    }

    // Initialize auth
    getGoogleAuth()

    console.log(`[Gemini] Initializing Vertex AI client: project=${project}, location=${location}`)

    vertexAI = new VertexAI({
      project,
      location,
    })
  }
  return vertexAI
}

/**
 * Get or create Gemini model instance
 */
function getGeminiModel(): GenerativeModel {
  if (!geminiModel) {
    const vertexai = getVertexAI()

    // Use Gemini 2.0 Flash for best performance/cost ratio
    // - 2M context window
    // - Multimodal support
    // - Fast inference
    // - Low cost ($0.075 per 1M input tokens, $0.30 per 1M output tokens)
    geminiModel = vertexai.getGenerativeModel({
      model: 'gemini-2.0-flash-exp',
    })

    console.log('[Gemini] Model initialized: gemini-2.0-flash-exp')
  }
  return geminiModel
}

/**
 * Message types (compatible with OpenAI format)
 */
export interface GeminiMessage {
  role: 'user' | 'system' | 'assistant'
  content: string
}

/**
 * Completion request options
 */
export interface GeminiCompletionOptions {
  model?: string // Optional: override default model
  messages: GeminiMessage[]
  temperature?: number // 0-1 (default: 0.7)
  maxTokens?: number // Max output tokens (default: 8192)
  responseFormat?: { type: 'json_object' | 'text' } // JSON mode
}

/**
 * Completion response
 */
export interface GeminiCompletionResponse {
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
 * Create a chat completion using Gemini
 *
 * This is a drop-in replacement for OpenAI's chat.completions.create()
 * with the same API surface for minimal code changes
 */
export async function createChatCompletion(
  options: GeminiCompletionOptions
): Promise<GeminiCompletionResponse> {
  try {
    const model = getGeminiModel()

    // Combine system and user messages into a single prompt
    // Gemini doesn't have a separate "system" role, so we prepend system messages
    let fullPrompt = ''
    const systemMessages = options.messages.filter((m) => m.role === 'system')
    const conversationMessages = options.messages.filter((m) => m.role !== 'system')

    if (systemMessages.length > 0) {
      fullPrompt = systemMessages.map((m) => m.content).join('\n\n') + '\n\n'
    }

    // Add conversation history
    fullPrompt += conversationMessages.map((m) => {
      const roleLabel = m.role === 'user' ? 'User' : 'Assistant'
      return `${roleLabel}: ${m.content}`
    }).join('\n\n')

    // Configure generation
    const generationConfig: any = {
      temperature: options.temperature ?? 0.7,
      maxOutputTokens: options.maxTokens ?? 8192,
    }

    // Enable JSON mode if requested
    if (options.responseFormat?.type === 'json_object') {
      generationConfig.responseMimeType = 'application/json'
    }

    console.log(`[Gemini] Generating completion (temp=${generationConfig.temperature}, max=${generationConfig.maxOutputTokens})`)

    // Generate content
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: fullPrompt }] }],
      generationConfig,
    })

    const response = result.response
    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || ''

    // Extract usage metadata
    const usageMetadata = response.usageMetadata || {}
    const promptTokens = usageMetadata.promptTokenCount || 0
    const completionTokens = usageMetadata.candidatesTokenCount || 0
    const totalTokens = usageMetadata.totalTokenCount || promptTokens + completionTokens

    console.log(`[Gemini] ✅ Completion generated (${totalTokens} tokens: ${promptTokens} prompt + ${completionTokens} completion)`)

    // Return in OpenAI-compatible format
    return {
      choices: [
        {
          message: {
            content: text,
            role: 'assistant',
          },
          finishReason: 'stop',
        },
      ],
      usage: {
        promptTokens,
        completionTokens,
        totalTokens,
      },
    }
  } catch (error) {
    console.error('[Gemini] Failed to generate completion:', error)
    throw new Error(
      'Gemini completion failed: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Gemini client with OpenAI-compatible interface
 *
 * This allows us to do a simple find-and-replace:
 * `openai.chat.completions.create()` → `gemini.chat.completions.create()`
 */
export const gemini = {
  chat: {
    completions: {
      create: createChatCompletion,
    },
  },
}

/**
 * Export for backward compatibility
 */
export default gemini

/**
 * Export Gemini model client for direct usage
 */
export function getGeminiClient(): GenerativeModel {
  return getGeminiModel()
}
