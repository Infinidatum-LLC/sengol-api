# Frontend Integration Guide

**Location:** Frontend documentation for integrating with Sengol API
**Purpose:** Guide frontend developers on API contracts, data formats, and threshold behavior
**Last Updated:** Phase 4 - Documentation

---

## Overview

This guide explains how the frontend should interact with the Sengol API for dynamic risk question generation, including:

- Request/response formats
- Data fields to send and receive
- Question intensity levels and weights
- Threshold behavior and tuning
- Error handling patterns
- Cache optimization

---

## Core Concept: Evidence-Based Question Generation

The Sengol API generates **dynamic risk assessment questions** based on:

1. **System description** (what you're assessing)
2. **Historical incident data** (78,767+ real security incidents)
3. **Configurable thresholds** (how strict to be)
4. **Weight formulas** (how to prioritize)

**Result:** Questions are NOT generic templates—they're tailored to your system with real evidence and explainable weights.

---

## API Endpoints

### 1. Generate Questions

**Endpoint:** `POST /api/review/:id/generate-questions`

**Request Body:**
```json
{
  "systemDescription": "Payment processing API that handles credit card transactions...",
  "industryType": "finance",
  "assessmentId": "cmhxtdd490001qiverq62l7rm",
  "includeEvidence": true,
  "intensityLevel": "medium"
}
```

**Request Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| `systemDescription` | string | Yes | Detailed description of the system being assessed | "Online banking platform with user authentication, transaction processing, and data storage" |
| `industryType` | string | Yes | Industry classification for relevance weighting | `"finance"`, `"healthcare"`, `"technology"`, `"retail"` |
| `assessmentId` | string | Yes | Unique assessment ID for persistence | UUID or database ID |
| `includeEvidence` | boolean | No (default: true) | Include incident evidence with questions | `true` or `false` |
| `intensityLevel` | string | No (default: "medium") | Question filtering intensity | `"high"`, `"medium"`, `"low"` |

**Response Format:**
```json
{
  "assessmentId": "cmhxtdd490001qiverq62l7rm",
  "status": "success",
  "metadata": {
    "generatedAt": "2025-11-13T10:30:00Z",
    "systemDescription": "Payment processing API...",
    "industryType": "finance",
    "generationTimeMs": 2450,
    "incidentsSearched": 60,
    "incidentsUsed": 45
  },
  "questions": {
    "high": [
      {
        "id": "q-1",
        "category": "security",
        "question": "Is MFA enabled for all user authentication?",
        "weight": 0.85,
        "intensity": "high",
        "evidence": {
          "incidentCount": 47,
          "incidentSeverity": "high",
          "adoptionRate": 0.23,
          "costWithout": "$2.3M",
          "costWith": "$150K"
        },
        "explanation": "MFA adoption in finance is critical. 47 incidents match this query...",
        "relatedIncidents": [
          {
            "id": "inc-12345",
            "title": "Credential theft in payment processor",
            "severity": "high",
            "year": 2023,
            "similarityScore": 0.87
          }
        ]
      }
    ],
    "medium": [...],
    "low": [...]
  },
  "scoringFormula": {
    "explanation": "Questions are weighted by evidence, base importance, and industry relevance",
    "formula": "(baseWeight × 0.5) + (evidenceWeight × 0.3) + (industryWeight × 0.2)",
    "components": {
      "baseWeight": "LLM analysis of system description importance (0-1)",
      "evidenceWeight": "Historical incident frequency (0-1)",
      "industryWeight": "Industry-specific relevance (0-1)"
    }
  }
}
```

---

## Question Intensity Levels

### Understanding Intensity

The backend uses **three intensity levels** to filter questions by evidence strength and priority:

```
HIGH    → Only questions with 70%+ confidence + critical priorities
MEDIUM  → Questions with 50%+ confidence + risk/resilience focus
LOW     → Questions with 30%+ confidence + governance/awareness focus
```

### Frontend Mapping

**High Intensity** (`intensityLevel: "high"`)
- **Use case:** Executive summaries, compliance audits
- **Response:** 10-15 questions maximum
- **Weight threshold:** ≥ 0.7

**Medium Intensity** (`intensityLevel: "medium"`)
- **Use case:** Standard risk assessments (most common)
- **Response:** 15-25 questions maximum
- **Weight threshold:** ≥ 0.5

**Low Intensity** (`intensityLevel: "low"`)
- **Use case:** Discovery phase, comprehensive frameworks
- **Response:** 20-35 questions maximum
- **Weight threshold:** ≥ 0.3

---

## Weight Components and Interpretation

### Three-Component Weight Formula

```
finalWeight = (baseWeight × 0.5) + (evidenceWeight × 0.3) + (industryWeight × 0.2)
```

### 1. Base Weight (0.5 coefficient)

**What it is:** LLM analysis of how important this topic is for your system

**Example:**
- System: "Payment processor with card storage"
- Question: "PCI-DSS compliance?"
- Base weight: 0.95 (clearly critical)

### 2. Evidence Weight (0.3 coefficient)

**What it is:** How frequently this issue occurs in real incidents

**Example:**
- Question: "MFA enforcement?"
- Matching incidents: 47 (high frequency)
- Evidence weight: 0.85 (strong evidence)

### 3. Industry Weight (0.2 coefficient)

**What it is:** How relevant this is to your specific industry

**Example:**
- Industry: "finance"
- Question: "PCI-DSS compliance?"
- Industry weight: 0.95 (critical for payments)

---

## Saving Questions to Backend

### Endpoint: Save Completed Assessment

**Endpoint:** `POST /api/review/:id/save-questions`

**Request Body:**
```json
{
  "assessmentId": "cmhxtdd490001qiverq62l7rm",
  "questions": [
    {
      "id": "q-1",
      "question": "Is MFA enabled for all authentication?",
      "category": "security",
      "weight": 0.85,
      "intensity": "high",
      "userAnswer": "partial",
      "answerDetails": "MFA enabled for admin accounts, not all users",
      "notes": "Need to evaluate cost-benefit of full deployment"
    }
  ],
  "completedAt": "2025-11-13T14:30:00Z",
  "status": "completed"
}
```

---

## Question Categories

Supported categories:

- `security` - Security controls & architecture
- `compliance` - Regulatory & standards compliance  
- `incident-response` - Incident detection & response
- `resilience` - Business continuity & disaster recovery
- `monitoring` - Logging, monitoring, alerting
- `risk` - Risk assessment & management
- `governance` - Policies, procedures, oversight
- `awareness` - Training & security awareness
- `process` - Documented processes & procedures

---

## Error Handling

### Common Error Scenarios

**Invalid System Description (400)**
```json
{
  "error": "Invalid system description",
  "code": "VALIDATION_ERROR",
  "statusCode": 400,
  "details": "System description must be at least 50 characters"
}
```

**Vector Database Timeout (503)**
```json
{
  "error": "Vector database search failed",
  "code": "VECTOR_DB_ERROR",
  "statusCode": 503,
  "details": "Search operation timed out after 30 seconds"
}
```

**Rate Limiting (429)**
```json
{
  "error": "Too many requests",
  "code": "RATE_LIMIT_ERROR",
  "statusCode": 429,
  "details": "Maximum 10 assessments per hour",
  "retryAfter": 300
}
```

---

## Response Time Expectations

**Typical timeline:**
- Vector search: 500-1000ms
- LLM analysis: 1000-2000ms
- Post-processing: 200-500ms
- **Total: 2-4 seconds typical**

**Timeout:** Implement 10 second max timeout, with exponential backoff retry strategy.

---

## Best Practices

### 1. Validate System Description

```typescript
const validateSystemDescription = (text) => {
  const minLength = 50
  const minWords = 10
  const words = text.trim().split(/\s+/).length

  if (text.length < minLength || words < minWords) {
    return 'Please provide at least 50 characters (10+ words)'
  }
  return null
}
```

### 2. Show Generation Progress

```typescript
// 0-30%: Initialization
// 30-60%: Vector search
// 60-90%: LLM analysis
// 90-100%: Post-processing
```

### 3. Display Evidence Gracefully

```typescript
const EvidenceDisplay = ({ evidence }) => {
  if (!evidence || evidence.incidentCount === 0) {
    return <Note>Limited historical data available</Note>
  }
  
  return (
    <div>
      <Stat label="Related Incidents" value={evidence.incidentCount} />
      <Stat label="Adoption Rate" value={`${(evidence.adoptionRate * 100).toFixed(0)}%`} />
    </div>
  )
}
```

### 4. Track User Answers Locally

```typescript
// Auto-save answers to localStorage before submitting
useEffect(() => {
  localStorage.setItem('assessment-draft', JSON.stringify(answers))
}, [answers])
```

---

## Caching Strategy

**Backend caches:**
- Vector search results: 1 hour TTL
- LLM responses: 2 hours TTL
- Embeddings: 1 hour TTL

**Check response metadata for cache hits:**
```typescript
if (response.metadata.cached) {
  showInfo('Loaded from cache (faster)')
}
```

---

## Testing Integration

### Mock Response

```typescript
export const mockGenerateQuestionsResponse = {
  assessmentId: 'test-123',
  status: 'success',
  questions: {
    high: [...],
    medium: [...],
    low: [...]
  }
}
```

---

## Troubleshooting

### Questions too generic?
- Add more detail to system description (min 50 chars)
- Lower intensity level to "low"

### No questions generated?
- Check API response status code
- Verify assessment ID exists
- Check browser console for errors

### Response taking > 5 seconds?
- Use fallback to cached questions if available
- Implement retry logic with exponential backoff

---

## References

- **Backend Configuration:** `/sengol-api/src/config/thresholds.ts`
- **Generation Logic:** `/sengol-api/src/services/dynamic-question-generator.ts`
- **API Controller:** `/sengol-api/src/controllers/review.controller.ts`
- **Database Schema:** `/sengol-api/prisma/schema.prisma` (RiskAssessment model)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-13 | Initial frontend integration documentation (Phase 4) |
