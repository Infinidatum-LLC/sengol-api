# Sengol API Contract

**Version:** v1
**Base URL:** `https://api.sengol.ai` (Production) / `http://localhost:4000` (Development)
**Last Updated:** 2025-01-15

This document defines the data contract between the Sengol Middleware API and frontend clients.

---

## Table of Contents

1. [Response Format](#response-format)
2. [Error Handling](#error-handling)
3. [Authentication](#authentication)
4. [Rate Limiting](#rate-limiting)
5. [API Endpoints](#api-endpoints)
6. [TypeScript Types](#typescript-types)
7. [Error Recovery Strategies](#error-recovery-strategies)

---

## Response Format

### Success Response

All successful API responses follow this structure:

```typescript
{
  "success": true,
  "data": { ... },          // Response data (varies by endpoint)
  "metadata"?: { ... }      // Optional metadata
}
```

### Error Response

All error responses follow this structure:

```typescript
{
  "error": string,          // Human-readable error message
  "code": string,           // Machine-readable error code
  "statusCode": number,     // HTTP status code
  "metadata"?: {            // Optional error context
    [key: string]: any
  }
}
```

---

## Error Handling

### HTTP Status Codes

| Status Code | Meaning | When It Occurs |
|------------|---------|----------------|
| `200` | OK | Request succeeded |
| `201` | Created | Resource created successfully |
| `400` | Bad Request | Validation error or malformed request |
| `401` | Unauthorized | Authentication required or token invalid |
| `403` | Forbidden | Authenticated but insufficient permissions |
| `404` | Not Found | Resource not found |
| `408` | Request Timeout | Request took too long to complete |
| `429` | Too Many Requests | Rate limit exceeded |
| `500` | Internal Server Error | Unexpected server error |
| `503` | Service Unavailable | External service (d-vecDB, OpenAI) is down or circuit breaker is open |

### Error Codes

All errors include a `code` field for programmatic handling:

| Error Code | Status | Description | Retry? |
|-----------|--------|-------------|--------|
| `VALIDATION_ERROR` | 400 | Request validation failed | No - Fix request |
| `AUTHENTICATION_ERROR` | 401 | Authentication required/failed | No - Get new token |
| `AUTHORIZATION_ERROR` | 403 | Insufficient permissions | No - Need different user |
| `NOT_FOUND` | 404 | Resource not found | No |
| `TIMEOUT_ERROR` | 408 | Request timeout | Yes - Retry |
| `RATE_LIMIT_ERROR` | 429 | Too many requests | Yes - Wait and retry |
| `INTERNAL_ERROR` | 500 | Unexpected error | Yes - Retry |
| `DATABASE_ERROR` | 500 | Database operation failed | Yes - Retry |
| `VECTORDB_ERROR` | 503 | d-vecDB operation failed | Yes - Retry |
| `LLM_ERROR` | 503 | OpenAI API failed | Yes - Retry |
| `CIRCUIT_BREAKER_OPEN` | 503 | Service temporarily unavailable | Yes - Wait 60s and retry |

### Error Response Examples

#### Validation Error (400)
```json
{
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "metadata": {
    "errors": [
      {
        "path": "systemDescription",
        "message": "String must contain at least 10 character(s)",
        "code": "too_small"
      }
    ]
  }
}
```

#### Rate Limit Error (429)
```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_ERROR",
  "statusCode": 429,
  "retryAfter": 60
}
```

#### Circuit Breaker Open (503)
```json
{
  "error": "Service dvecdb is temporarily unavailable (circuit breaker open)",
  "code": "CIRCUIT_BREAKER_OPEN",
  "statusCode": 503,
  "metadata": {
    "state": "OPEN",
    "failureCount": 5,
    "nextAttempt": "2025-01-15T10:35:00.000Z"
  }
}
```

#### Timeout Error (408)
```json
{
  "error": "Operation request timed out after 120000ms",
  "code": "TIMEOUT_ERROR",
  "statusCode": 408,
  "metadata": {
    "url": "/api/review/abc123/generate-questions",
    "method": "POST"
  }
}
```

---

## Authentication

### Header Format

```
Authorization: Bearer <JWT_TOKEN>
```

### Authentication Flow

1. Login/Register to get JWT token
2. Include token in `Authorization` header for all authenticated requests
3. Token expires after 7 days (configurable)
4. Refresh token before expiry

### Error Responses

**Missing Token (401):**
```json
{
  "error": "Authentication required",
  "code": "AUTHENTICATION_ERROR",
  "statusCode": 401
}
```

**Invalid Token (401):**
```json
{
  "error": "Invalid or expired token",
  "code": "AUTHENTICATION_ERROR",
  "statusCode": 401
}
```

---

## Rate Limiting

### Limits

- **Default:** 100 requests per minute per IP
- **Authenticated:** Same limit per user
- **Health checks:** Excluded from rate limiting

### Headers

Rate limit information is included in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642253400
```

### Exceeded Response

```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_ERROR",
  "statusCode": 429,
  "retryAfter": 60
}
```

**Frontend should:**
- Check `X-RateLimit-Remaining` header
- Wait for `retryAfter` seconds before retrying
- Show user-friendly message about rate limiting

---

## API Endpoints

### Health Check

#### `GET /health`

Basic health check (fast, for monitoring).

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "v1"
}
```

#### `GET /health/detailed`

Detailed health check with all dependencies.

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "uptime": 3600,
  "version": "v1",
  "checks": {
    "database": {
      "status": "ok",
      "responseTime": 15
    },
    "dvecdb": {
      "status": "ok",
      "responseTime": 234,
      "healthy": true,
      "circuitBreaker": {
        "state": "CLOSED",
        "failureCount": 0
      }
    },
    "openai": {
      "status": "ok",
      "stats": {
        "requestCount": 1234,
        "errorCount": 5,
        "errorRate": "0.40%"
      }
    }
  },
  "cache": {
    "vectorSearch": {
      "size": 45,
      "hitRate": "78.5%",
      "enabled": true
    },
    "llmResponse": {
      "size": 23,
      "hitRate": "82.1%",
      "enabled": true
    }
  },
  "responseTime": 345
}
```

**Status Codes:**
- `200` - All systems healthy
- `503` - One or more systems degraded

### Authentication

#### `POST /api/auth/register`

Register a new user.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!",
  "name": "John Doe",
  "company": "Acme Corp"
}
```

**Validation:**
- `email`: Valid email format (required)
- `password`: Min 8 characters (required)
- `name`: 1-255 characters (optional)
- `company`: Max 255 characters (optional)

**Success Response (201):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx1234567890",
      "email": "user@example.com",
      "name": "John Doe",
      "company": "Acme Corp"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (400):**
```json
{
  "error": "Request validation failed",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "metadata": {
    "errors": [
      {
        "path": "email",
        "message": "Invalid email",
        "code": "invalid_string"
      }
    ]
  }
}
```

#### `POST /api/auth/login`

Login with email and password.

**Request:**
```json
{
  "email": "user@example.com",
  "password": "SecurePassword123!"
}
```

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "id": "clx1234567890",
      "email": "user@example.com",
      "name": "John Doe"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

**Error Response (401):**
```json
{
  "error": "Invalid email or password",
  "code": "AUTHENTICATION_ERROR",
  "statusCode": 401
}
```

### Risk Assessment

#### `POST /api/review/:id/generate-questions`

Generate dynamic risk and compliance questions for an assessment.

**Authentication:** Required

**URL Parameters:**
- `id` (string, required): Assessment ID (CUID format)

**Request Body:**
```json
{
  "systemDescription": "A fintech application that processes payments...",
  "selectedDomains": ["ai", "cyber", "cloud"],
  "jurisdictions": ["US", "EU"],
  "industry": "fintech",
  "companySize": "50-200",
  "budgetRange": "$10k-$50k",
  "selectedTech": ["PostgreSQL", "AWS", "React"],
  "customTech": ["Custom ML Model"],
  "techStack": ["Node.js", "TypeScript"],
  "dataTypes": ["PII", "Financial"],
  "systemCriticality": "high"
}
```

**Validation:**
- `systemDescription`: 10-10000 characters (required)
- `selectedDomains`: Array of 'ai' | 'cyber' | 'cloud' | 'compliance' (optional)
- `jurisdictions`: Array of strings (optional)
- `industry`: String (optional)
- `companySize`: String (optional)
- `budgetRange`: String (optional)
- `selectedTech`: Array of strings (optional)
- `customTech`: Array of strings (optional)
- `techStack`: Array of strings (optional)
- `dataTypes`: Array of strings (optional)
- `systemCriticality`: 'low' | 'medium' | 'high' | 'critical' (optional)

**Success Response (200):**
```json
{
  "success": true,
  "data": {
    "riskQuestions": [
      {
        "id": "dynamic_access_control_1642253400000",
        "label": "Access Control",
        "description": "Risk assessment for access control based on 23 similar incidents",
        "priority": "high",
        "importance": "Critical baseline control. Historical data shows 23 similar incidents with average cost of $450,000.",
        "examples": [
          "Organization A - Data Breach ($500,000)",
          "Organization B - Unauthorized Access ($400,000)"
        ],
        "mitigations": [
          "Implement multi-factor authentication (MFA)",
          "Use role-based access control (RBAC)",
          "Regular access reviews and deprovisioning"
        ],
        "regulations": ["SOC 2", "ISO 27001"],
        "baseWeight": 0.90,
        "evidenceWeight": 0.85,
        "industryWeight": 0.90,
        "finalWeight": 0.88,
        "weightageExplanation": "Question Weight: 88%\n\nCalculation Breakdown:\n- Base Weight (50%): 90% - Critical baseline control\n- Evidence Weight (30%): 85% - Based on high incident frequency\n- Industry Weight (20%): 90% - Industry-specific relevance\n\nFormula: (90% × 0.50) + (85% × 0.30) + (90% × 0.20) = 88%\n\nThis weight means this question has very high impact on your final score.",
        "evidenceQuery": "Access Control",
        "relatedIncidents": [
          {
            "id": "incident_123",
            "incidentId": "INC-2024-001",
            "incidentType": "data_breach",
            "organization": "Organization A",
            "industry": "fintech",
            "severity": "high",
            "estimatedCost": "500000",
            "similarity": 0.89,
            "embeddingText": "Unauthorized access due to weak authentication"
          }
        ],
        "category": "cyber",
        "generatedFrom": "hybrid",
        "confidence": 0.87
      }
    ],
    "complianceQuestions": [
      {
        "id": "compliance_data_inventory_1642253400000",
        "label": "Data Inventory",
        "description": "Compliance assessment for data inventory",
        "priority": "critical",
        "importance": "Required for GDPR, SOC 2. Non-compliance fines average $250,000 based on 12 incidents.",
        "examples": [
          "Organization C - GDPR Fine (Fine: $300,000)"
        ],
        "mitigations": [
          "Create Records of Processing Activities (ROPA)",
          "Implement data discovery and classification tools",
          "Maintain data flow diagrams"
        ],
        "regulations": ["GDPR", "SOC 2"],
        "baseWeight": 0.90,
        "evidenceWeight": 0.75,
        "industryWeight": 0.85,
        "finalWeight": 0.84,
        "weightageExplanation": "...",
        "evidenceQuery": "Data Inventory",
        "relatedIncidents": [],
        "category": "compliance",
        "generatedFrom": "hybrid",
        "confidence": 0.82
      }
    ],
    "metadata": {
      "scoringFormula": {
        "name": "Evidence-Based Weighted Scoring",
        "description": "Dynamic scoring formula that adapts weights based on real incident data and LLM analysis of your specific system",
        "components": [
          {
            "name": "Risk Coverage Score",
            "weight": 0.60,
            "description": "Weighted assessment of risk controls based on incident severity",
            "formula": "Σ(question_score × question_weight) / Σ(question_weight)",
            "justification": "60% weight because historical incidents show avg cost of $450,000..."
          },
          {
            "name": "Compliance Coverage Score",
            "weight": 0.40,
            "description": "Weighted assessment of regulatory compliance based on fine history",
            "formula": "Σ(question_score × question_weight) / Σ(question_weight)",
            "justification": "40% weight because compliance violations average $250,000 in fines..."
          }
        ],
        "formula": "Final Score = (Risk Coverage × 0.60) + (Compliance Coverage × 0.40)\n\n...",
        "exampleCalculation": "...",
        "visualization": "..."
      },
      "incidentSummary": {
        "totalIncidentsAnalyzed": 50,
        "relevantIncidents": 35,
        "avgIncidentCost": 450000,
        "topRisks": ["Data Breach", "Unauthorized Access", "Ransomware"],
        "industryBenchmark": "fintech experiences average incident costs of $450,000 with 45% MFA adoption rate."
      },
      "generationMetadata": {
        "timestamp": "2025-01-15T10:30:00.000Z",
        "llmModel": "gpt-4o",
        "incidentSearchCount": 50,
        "avgSimilarityScore": 0.78,
        "generationTimeMs": 15234
      }
    }
  }
}
```

**Error Responses:**

**404 - Assessment Not Found:**
```json
{
  "error": "Assessment not found",
  "code": "NOT_FOUND",
  "statusCode": 404
}
```

**503 - d-vecDB Unavailable:**
```json
{
  "error": "Service dvecdb is temporarily unavailable (circuit breaker open)",
  "code": "CIRCUIT_BREAKER_OPEN",
  "statusCode": 503,
  "metadata": {
    "state": "OPEN",
    "nextAttempt": "2025-01-15T10:35:00.000Z"
  }
}
```

**503 - OpenAI Error:**
```json
{
  "error": "OpenAI chat completion failed: Rate limit exceeded",
  "code": "LLM_ERROR",
  "statusCode": 503,
  "metadata": {
    "model": "gpt-4o",
    "requestCount": 1234
  }
}
```

**408 - Timeout:**
```json
{
  "error": "Operation request timed out after 120000ms",
  "code": "TIMEOUT_ERROR",
  "statusCode": 408
}
```

---

## TypeScript Types

### Request Types

```typescript
// Generate Questions Request
interface GenerateQuestionsRequest {
  systemDescription: string              // 10-10000 chars, required
  selectedDomains?: ('ai' | 'cyber' | 'cloud' | 'compliance')[]
  jurisdictions?: string[]
  industry?: string
  companySize?: string
  budgetRange?: string
  selectedTech?: string[]
  customTech?: string[]
  techStack?: string[]
  dataTypes?: string[]
  systemCriticality?: 'low' | 'medium' | 'high' | 'critical'
}

// Auth Requests
interface RegisterRequest {
  email: string
  password: string              // Min 8 chars
  name?: string
  company?: string
}

interface LoginRequest {
  email: string
  password: string
}
```

### Response Types

```typescript
// Success Response Wrapper
interface ApiSuccessResponse<T> {
  success: true
  data: T
  metadata?: Record<string, any>
}

// Error Response
interface ApiErrorResponse {
  error: string
  code: ErrorCode
  statusCode: number
  metadata?: Record<string, any>
  retryAfter?: number           // For rate limit errors
}

// Error Codes
type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'AUTHENTICATION_ERROR'
  | 'AUTHORIZATION_ERROR'
  | 'NOT_FOUND'
  | 'TIMEOUT_ERROR'
  | 'RATE_LIMIT_ERROR'
  | 'INTERNAL_ERROR'
  | 'DATABASE_ERROR'
  | 'VECTORDB_ERROR'
  | 'LLM_ERROR'
  | 'CIRCUIT_BREAKER_OPEN'

// Dynamic Question
interface DynamicQuestion {
  id: string
  label: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'

  // Evidence-based context
  importance: string
  examples: string[]
  mitigations: string[]
  regulations: string[]

  // Weightage and scoring
  baseWeight: number              // 0-1
  evidenceWeight: number          // 0-1
  industryWeight: number          // 0-1
  finalWeight: number             // 0-1 (composite)

  // Explainability
  weightageExplanation: string
  evidenceQuery: string
  relatedIncidents: IncidentMatch[]

  // Metadata
  category: 'ai' | 'cyber' | 'cloud' | 'compliance'
  generatedFrom: 'llm' | 'evidence' | 'hybrid'
  confidence: number              // 0-1
}

// Incident Match
interface IncidentMatch {
  id: string
  incidentId: string
  incidentType: string
  organization?: string
  industry?: string
  severity?: string
  incidentDate?: string
  hadMfa?: boolean
  hadBackups?: boolean
  hadIrPlan?: boolean
  estimatedCost?: string
  downtimeHours?: number
  recordsAffected?: number
  similarity: number              // 0-1
  embeddingText: string
}

// Generate Questions Response
interface GenerateQuestionsResponse {
  riskQuestions: DynamicQuestion[]
  complianceQuestions: DynamicQuestion[]
  metadata: {
    scoringFormula: ScoringFormula
    incidentSummary: IncidentSummary
    generationMetadata: GenerationMetadata
  }
}

// Auth Response
interface AuthResponse {
  user: {
    id: string
    email: string
    name?: string
    company?: string
  }
  token: string
}
```

---

## Error Recovery Strategies

### Frontend Error Handling

```typescript
// Recommended error handling approach

async function callApi<T>(
  url: string,
  options: RequestInit
): Promise<T> {
  try {
    const response = await fetch(url, options)

    // Success
    if (response.ok) {
      const data: ApiSuccessResponse<T> = await response.json()
      return data.data
    }

    // Error
    const error: ApiErrorResponse = await response.json()

    // Handle specific error codes
    switch (error.code) {
      case 'RATE_LIMIT_ERROR':
        // Wait and retry
        if (error.retryAfter) {
          await sleep(error.retryAfter * 1000)
          return callApi(url, options) // Retry once
        }
        throw new Error('Rate limit exceeded')

      case 'CIRCUIT_BREAKER_OPEN':
        // Show user-friendly message
        throw new Error(
          'Service temporarily unavailable. Please try again in a few minutes.'
        )

      case 'TIMEOUT_ERROR':
        // Retry once
        return callApi(url, options)

      case 'AUTHENTICATION_ERROR':
        // Redirect to login
        window.location.href = '/login'
        throw new Error('Authentication required')

      case 'VALIDATION_ERROR':
        // Show validation errors to user
        throw new ValidationException(error.metadata?.errors)

      case 'VECTORDB_ERROR':
      case 'LLM_ERROR':
      case 'DATABASE_ERROR':
        // Retry once for transient errors
        return callApi(url, options)

      default:
        // Generic error
        throw new Error(error.error || 'An error occurred')
    }
  } catch (error) {
    // Network error
    if (error instanceof TypeError) {
      throw new Error('Network error. Please check your connection.')
    }
    throw error
  }
}
```

### Retry Logic

```typescript
// Recommended retry strategy

interface RetryConfig {
  maxRetries: number
  retryableErrors: ErrorCode[]
  initialDelay: number
  maxDelay: number
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryableErrors: [
    'TIMEOUT_ERROR',
    'VECTORDB_ERROR',
    'LLM_ERROR',
    'DATABASE_ERROR',
    'RATE_LIMIT_ERROR',
    'CIRCUIT_BREAKER_OPEN'
  ],
  initialDelay: 1000,    // 1 second
  maxDelay: 30000        // 30 seconds
}

async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG
): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error

      // Don't retry on last attempt
      if (attempt === config.maxRetries) {
        break
      }

      // Check if error is retryable
      const isRetryable = config.retryableErrors.includes(error.code)
      if (!isRetryable) {
        throw error
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelay * Math.pow(2, attempt),
        config.maxDelay
      )

      // Add jitter (±30%)
      const jitter = delay * 0.3 * (Math.random() - 0.5)
      const actualDelay = delay + jitter

      console.log(`Retrying in ${Math.round(actualDelay)}ms...`)
      await sleep(actualDelay)
    }
  }

  throw lastError
}
```

### Rate Limit Handling

```typescript
// Track rate limit status

class RateLimitTracker {
  private remaining: number = 100
  private resetTime: number = Date.now()

  updateFromHeaders(headers: Headers) {
    const remaining = headers.get('X-RateLimit-Remaining')
    const reset = headers.get('X-RateLimit-Reset')

    if (remaining) this.remaining = parseInt(remaining)
    if (reset) this.resetTime = parseInt(reset) * 1000
  }

  shouldWait(): boolean {
    return this.remaining === 0 && Date.now() < this.resetTime
  }

  getWaitTime(): number {
    return Math.max(0, this.resetTime - Date.now())
  }
}

const rateLimitTracker = new RateLimitTracker()

// Check before making request
if (rateLimitTracker.shouldWait()) {
  const waitTime = rateLimitTracker.getWaitTime()
  await sleep(waitTime)
}

// Update after request
const response = await fetch(url, options)
rateLimitTracker.updateFromHeaders(response.headers)
```

### User-Friendly Error Messages

```typescript
// Map error codes to user-friendly messages

const ERROR_MESSAGES: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Please check your input and try again.',
  AUTHENTICATION_ERROR: 'Please log in to continue.',
  AUTHORIZATION_ERROR: 'You don\'t have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  TIMEOUT_ERROR: 'Request timed out. Please try again.',
  RATE_LIMIT_ERROR: 'Too many requests. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong. Please try again.',
  DATABASE_ERROR: 'Database error. Please try again.',
  VECTORDB_ERROR: 'Search service temporarily unavailable. Please try again.',
  LLM_ERROR: 'AI service temporarily unavailable. Please try again.',
  CIRCUIT_BREAKER_OPEN: 'Service temporarily unavailable. Please try again in a few minutes.'
}

function getUserFriendlyMessage(error: ApiErrorResponse): string {
  return ERROR_MESSAGES[error.code] || error.error
}
```

---

## Best Practices

### 1. Always Handle Errors

```typescript
// ✅ Good
try {
  const data = await generateQuestions(request)
  setData(data)
} catch (error) {
  if (error.code === 'CIRCUIT_BREAKER_OPEN') {
    showToast('Service temporarily unavailable. Please try again in a few minutes.')
  } else {
    showToast(getUserFriendlyMessage(error))
  }
}

// ❌ Bad
const data = await generateQuestions(request)
setData(data)
```

### 2. Implement Retry Logic

```typescript
// ✅ Good - Retry transient errors
const data = await withRetry(() => generateQuestions(request))

// ❌ Bad - Fail immediately
const data = await generateQuestions(request)
```

### 3. Show Loading States

```typescript
// ✅ Good
setLoading(true)
try {
  const data = await generateQuestions(request)
  setData(data)
} finally {
  setLoading(false)
}

// Show timeout warning after 30 seconds
setTimeout(() => {
  if (loading) {
    showToast('This is taking longer than usual...')
  }
}, 30000)
```

### 4. Cache Responses

```typescript
// ✅ Good - Cache successful responses
const cacheKey = JSON.stringify(request)
const cached = cache.get(cacheKey)
if (cached) return cached

const data = await generateQuestions(request)
cache.set(cacheKey, data, 3600000) // 1 hour
return data
```

### 5. Monitor API Health

```typescript
// Periodically check API health
setInterval(async () => {
  try {
    const health = await fetch('/health/detailed').then(r => r.json())

    if (health.status === 'degraded') {
      console.warn('API is degraded:', health.checks)
      // Optionally show warning to user
    }
  } catch (error) {
    console.error('API health check failed')
  }
}, 60000) // Check every minute
```

---

## Support

For questions or issues with the API contract:
- GitHub Issues: https://github.com/Infinidatum-LLC/sengol-api/issues
- Email: support@sengol.ai

---

**Document Version:** 1.0
**Last Updated:** 2025-01-15
**Maintained By:** Sengol Engineering Team
