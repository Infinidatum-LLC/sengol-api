# Multi-Provider LLM Setup with Automatic Fallback

## Overview

The system now supports multiple LLM providers with automatic fallback:
1. **OpenAI** (GPT-4o) - Primary
2. **Anthropic** (Claude Sonnet 4) - Secondary
3. **Google Gemini** (via OpenAI-compatible API) - Tertiary

## Configuration

### Environment Variables

Set at least one of these API keys:

```bash
# Primary (recommended)
OPENAI_API_KEY=sk-...

# Secondary fallback
ANTHROPIC_API_KEY=sk-ant-...

# Tertiary fallback (optional)
GEMINI_API_KEY=...
```

### Provider Priority

The system automatically tries providers in this order:
1. OpenAI (if `OPENAI_API_KEY` is set)
2. Anthropic (if `ANTHROPIC_API_KEY` is set)
3. Gemini (if `GEMINI_API_KEY` is set)

If the primary provider fails, it automatically falls back to the next available provider.

## Usage

### In Code

```typescript
import { callLLM } from '../lib/multi-llm-client'

const response = await callLLM({
  messages: [
    { role: 'system', content: 'You are a risk assessment expert.' },
    { role: 'user', content: 'Analyze this system...' }
  ],
  model: 'gpt-4o', // Optional - uses provider default if not specified
  temperature: 0.7,
  maxTokens: 4096,
  responseFormat: { type: 'json_object' }
})

console.log(response.content) // LLM response
console.log(response.provider) // 'openai' | 'anthropic' | 'gemini'
console.log(response.model) // Model used
```

### Backward Compatibility

The existing code using `gemini.chat.completions.create()` will automatically use the multi-provider client:

```typescript
import { gemini } from '../lib/multi-llm-client'

// This now uses multi-provider with fallback
const response = await gemini.chat.completions.create({
  messages: [...],
  model: 'gpt-4o',
  temperature: 0.7
})
```

## How It Works

1. **Provider Detection**: System checks which API keys are configured
2. **Priority Ordering**: Providers are sorted by priority (OpenAI → Anthropic → Gemini)
3. **Automatic Fallback**: If a provider fails, automatically tries the next one
4. **Error Handling**: All errors are logged, final error includes all provider failures
5. **Unified Response**: Same response format regardless of provider used

## Benefits

✅ **High Availability**: System continues working even if one provider is down
✅ **Cost Optimization**: Can use cheaper providers as fallback
✅ **Rate Limit Handling**: Automatically switches if hitting rate limits
✅ **Zero Code Changes**: Existing code works without modification
✅ **Transparent**: Logs show which provider was used

## Monitoring

Check provider status:

```typescript
import { getProviderStatus } from '../lib/multi-llm-client'

const status = getProviderStatus()
console.log(status)
// {
//   openai: { enabled: true, priority: 1 },
//   anthropic: { enabled: true, priority: 2 },
//   gemini: { enabled: false, priority: 3 }
// }
```

## Logs

The system logs:
- Which providers are available
- Which provider is being tried
- Success/failure for each provider
- Final provider used

Example logs:
```
[LLM] Available providers: openai, anthropic
[LLM] Attempting providers in order: openai → anthropic
[LLM] Trying OPENAI...
[LLM] OpenAI: Generating completion (model=gpt-4o)
[LLM] OpenAI: ✅ Success (1234 tokens)
[LLM] ✅ Success with OPENAI
```

If OpenAI fails:
```
[LLM] Trying OPENAI...
[LLM] ❌ OPENAI failed: Rate limit exceeded
[LLM] Trying ANTHROPIC...
[LLM] Anthropic: Generating completion (model=claude-sonnet-4-20250514)
[LLM] Anthropic: ✅ Success (1234 tokens)
[LLM] ✅ Success with ANTHROPIC
```

## Testing

To test fallback behavior:

1. **Disable primary provider**: Remove or invalidate `OPENAI_API_KEY`
2. **Enable secondary**: Set `ANTHROPIC_API_KEY`
3. **Make a request**: System should automatically use Anthropic

## Production Recommendations

1. **Set all three API keys** for maximum reliability
2. **Monitor logs** to see which provider is used most
3. **Set up alerts** if all providers fail
4. **Configure rate limits** appropriately for each provider

