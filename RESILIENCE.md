# Resilience & Scalability Guide

This document describes the resilience and scalability improvements made to the Sengol API.

## Overview

The API has been enhanced with comprehensive resilience patterns to handle failures gracefully, prevent cascading failures, and ensure high availability in production environments.

## Key Features

### 1. Circuit Breaker Pattern

**Location:** `src/lib/circuit-breaker.ts`

Prevents cascading failures by stopping requests to failing services temporarily.

**How it works:**
- **CLOSED** state: Normal operation, requests pass through
- **OPEN** state: Service is failing, requests are rejected immediately
- **HALF_OPEN** state: Testing if service has recovered

**Configuration:**
- Failure threshold: 5 failures before opening
- Success threshold: 2 successes to close from half-open
- Timeout: 60 seconds before attempting recovery
- Monitoring period: 120 seconds window for failure tracking

**Example:**
```typescript
import { resilientDvecdbClient } from './lib/dvecdb-resilient'

// Circuit breaker is automatically applied
const results = await resilientDvecdbClient.searchByText(query, filter, limit)
```

### 2. Retry Logic with Exponential Backoff

**Location:** `src/lib/retry.ts`

Automatically retries failed requests with increasing delays.

**Features:**
- Exponential backoff with jitter (prevents thundering herd)
- Configurable retry attempts (default: 3)
- Configurable timeout per attempt
- Smart detection of retryable errors (timeouts, connection resets, rate limits)

**Example:**
```typescript
import { withRetry } from './lib/retry'

const result = await withRetry(
  async () => await someApiCall(),
  {
    maxRetries: 3,
    initialDelay: 1000,     // 1 second
    maxDelay: 10000,        // 10 seconds max
    backoffMultiplier: 2,   // Double delay each retry
  }
)
```

### 3. Response Caching

**Location:** `src/lib/cache.ts`

In-memory LRU cache to reduce load on expensive operations.

**Features:**
- LRU (Least Recently Used) eviction policy
- Configurable TTL per cache entry
- Separate caches for different data types
- Cache statistics and monitoring
- Automatic cleanup of expired entries

**Cache Types:**
- **Vector Search Cache:** For d-vecDB queries (default: 1 hour TTL)
- **LLM Response Cache:** For OpenAI responses (default: 2 hour TTL)

**Configuration:**
```bash
CACHE_ENABLED=true
CACHE_TTL=3600          # 1 hour
CACHE_MAX_SIZE=1000     # 1000 entries
```

**Example:**
```typescript
import { vectorSearchCache, generateCacheKey } from './lib/cache'

const cacheKey = generateCacheKey('search', query, filter)
const cached = vectorSearchCache.get(cacheKey)
if (cached) {
  return cached
}

// ... perform expensive operation ...

vectorSearchCache.set(cacheKey, result)
```

### 4. Resilient d-vecDB Client

**Location:** `src/lib/dvecdb-resilient.ts`

Wrapper around d-vecDB client with full resilience features.

**Features:**
- Circuit breaker for fault tolerance
- Automatic retry with exponential backoff
- Request timeout handling
- Health monitoring
- Batch search optimization

**Example:**
```typescript
import { resilientDvecdbClient } from './lib/dvecdb-resilient'

// Single search with automatic resilience
const results = await resilientDvecdbClient.searchByText(
  query,
  filter,
  limit,
  {
    timeout: 30000,
    maxRetries: 3,
  }
)

// Batch search (processes multiple queries in parallel)
const batchResults = await resilientDvecdbClient.batchSearchByText(
  ['query1', 'query2', 'query3'],
  filter,
  limit
)

// Health check
const isHealthy = await resilientDvecdbClient.healthCheck()
const healthStatus = resilientDvecdbClient.getHealthStatus()
```

### 5. Resilient OpenAI Client

**Location:** `src/lib/openai-resilient.ts`

Wrapper around OpenAI client with resilience and caching.

**Features:**
- Automatic retry with rate limit handling
- Request timeout handling
- Response caching
- Batch embedding generation with concurrency control

**Example:**
```typescript
import { resilientOpenAIClient } from './lib/openai-resilient'

// Chat completion with caching
const response = await resilientOpenAIClient.chatCompletion(
  messages,
  {
    model: 'gpt-4o',
    temperature: 0.3,
    useCache: true,
  }
)

// Generate embedding with caching
const embedding = await resilientOpenAIClient.generateEmbedding(text)

// Batch generate embeddings with controlled concurrency
const embeddings = await resilientOpenAIClient.batchGenerateEmbeddings(
  texts,
  {
    batchSize: 20,
    concurrency: 3,
  }
)
```

### 6. Custom Error Classes

**Location:** `src/lib/errors.ts`

Structured error handling for better monitoring and debugging.

**Error Types:**
- `AppError` - Base error class
- `ValidationError` - Request validation failures (400)
- `DatabaseError` - Database operation failures (500)
- `VectorDBError` - d-vecDB operation failures (503)
- `LLMError` - OpenAI operation failures (503)
- `CircuitBreakerError` - Circuit breaker open (503)
- `TimeoutError` - Operation timeout (408)
- `NotFoundError` - Resource not found (404)
- `AuthenticationError` - Auth required (401)
- `AuthorizationError` - Insufficient permissions (403)
- `RateLimitError` - Too many requests (429)

**Example:**
```typescript
import { VectorDBError, NotFoundError } from './lib/errors'

// Throw structured error
throw new VectorDBError('d-vecDB search failed', {
  query: query.substring(0, 100),
  limit,
})

// Error is automatically formatted in response
// {
//   "error": "d-vecDB search failed",
//   "code": "VECTORDB_ERROR",
//   "statusCode": 503,
//   "metadata": { "query": "...", "limit": 20 }
// }
```

### 7. Request Validation

**Location:** `src/middleware/validation.ts`

Zod-based request validation middleware.

**Features:**
- Type-safe validation with Zod schemas
- Automatic error formatting
- Reusable validation schemas

**Example:**
```typescript
import { validateBody, schemas } from '../middleware/validation'

// In route handler
fastify.post('/api/review/:id/generate-questions',
  {
    preHandler: validateBody(schemas.generateQuestions)
  },
  async (request, reply) => {
    // request.body is now type-safe and validated
  }
)
```

### 8. Health Check Endpoints

**Location:** `src/routes/health.routes.ts`

Comprehensive health checks for monitoring and orchestration.

**Endpoints:**

#### `GET /health`
Basic health check (fast response for load balancers)
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "v1"
}
```

#### `GET /health/detailed`
Detailed health check with all dependencies
```json
{
  "status": "ok",
  "checks": {
    "database": { "status": "ok", "responseTime": 15 },
    "dvecdb": {
      "status": "ok",
      "responseTime": 234,
      "circuitBreaker": { "state": "CLOSED", "failureCount": 0 }
    },
    "openai": { "status": "ok", "stats": { ... } }
  },
  "cache": {
    "vectorSearch": { "size": 45, "hitRate": "78.5%" },
    "llmResponse": { "size": 23, "hitRate": "82.1%" }
  },
  "circuitBreakers": { ... },
  "responseTime": 345
}
```

#### `GET /health/ready`
Kubernetes readiness probe (checks critical dependencies)

#### `GET /health/live`
Kubernetes liveness probe (checks if process is alive)

#### `GET /health/cache`
Cache statistics only

#### `GET /health/circuit-breakers`
Circuit breaker states only

### 9. Request Timeout & Logging

**Location:** `src/middleware/request-timeout.ts`, `src/middleware/request-logging.ts`

**Request Timeout:**
- Global timeout for all requests (default: 2 minutes)
- Configurable via `REQUEST_TIMEOUT` environment variable
- Health checks are excluded from timeout

**Request Logging:**
- Structured logging for all requests
- Request duration tracking
- Slow request warnings (> 5 seconds)
- Error logging with full context

### 10. Graceful Shutdown

**Location:** `src/app.ts`

Handles shutdown signals gracefully to avoid dropping requests.

**Features:**
- Handles SIGTERM and SIGINT signals
- Closes server and stops accepting new requests
- Waits for in-flight requests to complete
- Closes database connections
- Configurable shutdown timeout (default: 30 seconds)

**Signals handled:**
- `SIGTERM` - Termination signal (from Kubernetes, Docker, etc.)
- `SIGINT` - Interrupt signal (Ctrl+C)
- `uncaughtException` - Unhandled exceptions
- `unhandledRejection` - Unhandled promise rejections

## Configuration

All resilience features are configurable via environment variables:

```bash
# d-vecDB Configuration
DVECDB_TIMEOUT=30000                    # Request timeout (ms)
DVECDB_MAX_RETRIES=3                    # Max retry attempts

# OpenAI Configuration
OPENAI_TIMEOUT=60000                    # Request timeout (ms)
OPENAI_MAX_RETRIES=3                    # Max retry attempts

# Caching
CACHE_ENABLED=true                      # Enable/disable caching
CACHE_TTL=3600                          # Cache TTL (seconds)
CACHE_MAX_SIZE=1000                     # Max cache entries

# Resilience
REQUEST_TIMEOUT=120000                  # Global request timeout (ms)
SHUTDOWN_TIMEOUT=30000                  # Graceful shutdown timeout (ms)
```

## Monitoring & Observability

### Circuit Breaker Monitoring

Check circuit breaker states:
```bash
curl http://localhost:4000/health/circuit-breakers
```

Monitor for:
- Circuit breaker state (CLOSED, OPEN, HALF_OPEN)
- Failure count and recent failures
- Next attempt time when OPEN

### Cache Monitoring

Check cache performance:
```bash
curl http://localhost:4000/health/cache
```

Monitor for:
- Cache hit rate (should be > 70% for optimal performance)
- Cache size vs max size
- Memory usage

### Error Monitoring

All errors are logged with structured data:
- Error type and code
- HTTP status code
- Metadata (query, parameters, etc.)
- Request context (method, URL, headers)

Use log aggregation tools (ELK, Datadog, etc.) to:
- Alert on high error rates
- Track error patterns
- Identify failing dependencies

## Performance Best Practices

### 1. Use Caching Effectively

```typescript
// Disable cache for real-time data
const results = await resilientDvecdbClient.searchByText(
  query,
  filter,
  limit,
  { skipCache: true }
)

// Use longer TTL for stable data
llmResponseCache.set(key, value, 7200000) // 2 hours
```

### 2. Batch Operations

```typescript
// Instead of sequential calls
for (const query of queries) {
  await searchByText(query) // ❌ Slow
}

// Use batch operations
const results = await resilientDvecdbClient.batchSearchByText(queries) // ✅ Fast
```

### 3. Monitor Circuit Breakers

- If a circuit breaker opens frequently, investigate the underlying service
- Check logs for error patterns
- Consider increasing timeout or retry limits if legitimate traffic is being rejected

### 4. Tune Timeouts

- Set appropriate timeouts based on expected operation duration
- d-vecDB searches: 30 seconds default
- OpenAI completions: 60 seconds default
- Increase for complex operations, decrease for simple ones

## Deployment Considerations

### Kubernetes/Docker

Use the readiness and liveness probes:
```yaml
livenessProbe:
  httpGet:
    path: /health/live
    port: 4000
  initialDelaySeconds: 30
  periodSeconds: 10

readinessProbe:
  httpGet:
    path: /health/ready
    port: 4000
  initialDelaySeconds: 10
  periodSeconds: 5
```

### Load Balancer Health Checks

Configure your load balancer to use `/health` endpoint for fast health checks.

### Graceful Shutdown

Ensure your orchestration platform sends SIGTERM and waits for graceful shutdown:
```yaml
# Kubernetes
terminationGracePeriodSeconds: 60
```

### Horizontal Scaling

The API is stateless and can be horizontally scaled. Cache is per-instance (not shared), which is acceptable for the current use case.

For shared caching, consider:
- Redis for distributed caching
- Update cache configuration to use Redis adapter

## Troubleshooting

### Circuit Breaker is Open

**Symptom:** Getting 503 errors with "circuit breaker open"

**Solutions:**
1. Check the underlying service health:
   ```bash
   curl http://localhost:4000/health/detailed
   ```
2. Check service logs for errors
3. If service is healthy, manually reset circuit breaker (requires admin endpoint)
4. Wait for automatic recovery (60 seconds by default)

### High Error Rates

**Symptom:** Many 5xx errors in logs

**Solutions:**
1. Check dependency health (`/health/detailed`)
2. Review error logs for patterns
3. Check if rate limits are being hit
4. Verify environment configuration
5. Increase timeout values if operations are timing out

### Low Cache Hit Rate

**Symptom:** Cache hit rate < 50%

**Solutions:**
1. Increase cache size (`CACHE_MAX_SIZE`)
2. Increase cache TTL (`CACHE_TTL`)
3. Review query patterns - high variance in queries reduces cache effectiveness
4. Check if cache is being cleared too frequently

### Slow Requests

**Symptom:** Requests taking > 5 seconds

**Solutions:**
1. Check d-vecDB performance
2. Enable caching if disabled
3. Use batch operations where possible
4. Review query complexity
5. Check network latency to external services

## Migration Guide

If you're migrating from the old version without resilience:

1. Update environment variables (see `.env.example`)
2. Update imports to use resilient clients:
   ```typescript
   // Old
   import { dvecdbClient } from './lib/dvecdb'

   // New
   import { resilientDvecdbClient } from './lib/dvecdb-resilient'
   ```
3. Test circuit breaker behavior in staging
4. Monitor health endpoints after deployment
5. Tune configuration based on production metrics

## Future Enhancements

Potential improvements for even better resilience:

1. **Distributed Caching:** Redis for shared cache across instances
2. **Rate Limiting per User:** Currently global rate limiting only
3. **Request Prioritization:** Prioritize critical requests during high load
4. **Adaptive Timeouts:** Automatically adjust timeouts based on P95 latency
5. **Bulkhead Pattern:** Isolate resources for different operation types
6. **Metrics Export:** Prometheus metrics for monitoring
7. **Distributed Tracing:** OpenTelemetry for request tracing
