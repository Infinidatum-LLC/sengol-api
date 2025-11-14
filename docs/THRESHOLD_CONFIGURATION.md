# Threshold Configuration Guide

**Location:** `src/config/thresholds.ts`
**Purpose:** Centralized single source of truth for all question generation thresholds
**Last Updated:** Phase 3 - Refactoring

## Overview

The threshold configuration system provides a centralized, type-safe way to manage all parameters that control how dynamic questions are generated, filtered, and weighted. This eliminates scattered hardcoded values and enables consistent behavior across the system.

## Configuration Structure

### 1. PRE_FILTER_THRESHOLDS

Controls initial filtering of incidents before question generation.

```typescript
PRE_FILTER_THRESHOLDS = {
  minWeight: 0.3,              // Minimum evidence weight (0-1)
  minIncidentCount: 1,          // Minimum incidents to consider a question
  minSimilarity: 0.3            // Minimum vector similarity (0-1)
}
```

**Usage:**
- **minWeight (0.3)**: Filters questions with evidence weight below 30%. Questions with lower weights suggest less incident data support.
- **minIncidentCount (1)**: Requires at least 1 incident match. Prevents questions from being generated with zero supporting evidence.
- **minSimilarity (0.3)**: Vector search cutoff. Only incidents with >30% similarity to the query are considered relevant.

**Impact:**
- Lower values = more questions generated (more lenient)
- Higher values = fewer, higher-quality questions
- Adjusting minSimilarity affects vector search precision vs recall tradeoff

**Example:** A security incident about "credential theft" with minSimilarity=0.3:
```
Query: "user authentication system"
Vector similarity scores:
- "credential theft" → 0.75 ✓ (passes threshold)
- "session hijacking" → 0.68 ✓
- "password reset UI" → 0.45 ✓
- "login failed message" → 0.25 ✗ (filtered out)
```

---

### 2. QUESTION_INTENSITY

Configures three intensity levels for question filtering and generation.

```typescript
QUESTION_INTENSITY = {
  high: {
    minWeight: 0.7,           // 70%+ evidence weight
    priorities: ['security', 'compliance', 'incident-response'],
    maxQuestions: 15          // Maximum high-intensity questions
  },
  medium: {
    minWeight: 0.5,           // 50%+ evidence weight
    priorities: ['risk', 'resilience', 'monitoring'],
    maxQuestions: 20          // Maximum medium-intensity questions
  },
  low: {
    minWeight: 0.3,           // 30%+ evidence weight
    priorities: ['governance', 'awareness', 'process'],
    maxQuestions: 25          // Maximum low-intensity questions
  }
}
```

**Usage:**
```typescript
// In dynamic-question-generator.ts, line 465-466
const rules = QUESTION_INTENSITY
const config = getIntensityConfig('high')
if (weight >= config.minWeight && priorities.includes(category)) {
  // Add to questions
}
```

**Intensity Levels Explained:**

| Level | Weight Range | Focus | Use Case | Example |
|-------|-------------|-------|----------|---------|
| **HIGH** | 70-100% | Critical security/compliance | When many incidents match | "MFA enforcement" (50+ incidents match) |
| **MEDIUM** | 50-70% | Risk mitigation & resilience | Moderate incident frequency | "Incident response plan" (20+ incidents) |
| **LOW** | 30-50% | Governance & awareness | Lower incident frequency | "Security training program" (5+ incidents) |

**Impact:**
- **minWeight**: Filters questions by evidence strength
  - HIGH (0.7): Only well-supported questions
  - LOW (0.3): More diverse questions, even with limited evidence
- **priorities**: Categorizes questions by topic
  - Helps cluster related questions in output
  - Allows filtering by organizational priority
- **maxQuestions**: Limits output per intensity level
  - HIGH: max 15 (detailed, critical)
  - MEDIUM: max 20 (balanced coverage)
  - LOW: max 25 (breadth over depth)

**Total Questions:** Theoretical maximum = 15 + 20 + 25 = 60 questions

---

### 3. WEIGHT_FORMULAS

Defines how component weights combine into final question priority.

```typescript
WEIGHT_FORMULAS = {
  RISK: {
    baseWeight: 0.5,
    evidenceWeight: 0.3,
    industryWeight: 0.2
    // Formula: (base × 0.5) + (evidence × 0.3) + (industry × 0.2)
  },
  COMPLIANCE: {
    baseWeight: 0.4,
    evidenceWeight: 0.35,
    industryWeight: 0.25
    // Formula: (base × 0.4) + (evidence × 0.35) + (industry × 0.25)
  }
}
```

**Usage:**
```typescript
function calculateFinalWeight(
  baseWeight: number,
  evidenceWeight: number,
  industryWeight: number,
  type: QuestionType
): number {
  const formula = WEIGHT_FORMULAS[type]
  return (baseWeight * formula.baseWeight) +
         (evidenceWeight * formula.evidenceWeight) +
         (industryWeight * formula.industryWeight)
}

// Example:
// Risk question with:
// - baseWeight: 0.8 (LLM analysis)
// - evidenceWeight: 0.6 (incident frequency)
// - industryWeight: 0.5 (industry relevance)
// Final = (0.8 × 0.5) + (0.6 × 0.3) + (0.5 × 0.2)
//       = 0.4 + 0.18 + 0.1 = 0.68
```

**Weight Component Breakdown:**

1. **baseWeight (0.5/0.4)**: LLM analysis of system description
   - How important is this topic for the system?
   - Set by GPT-4o analysis, typically 0.0-1.0
   - RISK values it higher (0.5) than COMPLIANCE (0.4)

2. **evidenceWeight (0.3/0.35)**: Historical incident data
   - How frequently does this issue occur?
   - Calculated from d-vecDB search results
   - How many incidents match: 0 incidents = 0.0, 50+ = 1.0
   - COMPLIANCE values this more (0.35) for regulatory alignment

3. **industryWeight (0.2/0.25)**: Industry benchmarking
   - Relevance to the specific industry
   - Finance, Healthcare, Tech, etc.
   - Derived from incident metadata
   - COMPLIANCE values this higher (0.25) for sector-specific regulation

**Real Example: PCI-DSS Compliance Question**
```
System: "Payment processing API"

baseWeight: 0.9
  → LLM rates this highly important for payments

evidenceWeight: 0.85
  → 80+ card-related security incidents found

industryWeight: 0.95
  → Critical for finance/payments industry

COMPLIANCE formula:
  (0.9 × 0.4) + (0.85 × 0.35) + (0.95 × 0.25)
  = 0.36 + 0.2975 + 0.2375
  = 0.895 (96% confidence)

Result: High-priority question generated
```

---

### 4. VECTOR_SEARCH_CONFIG

Optimizes semantic search across incident database.

```typescript
VECTOR_SEARCH_CONFIG = {
  incidentsPerQuestion: 20,     // Incidents to fetch per question
  maxEvidenceIncidents: 15,     // Maximum incidents used for evidence
  fetchMultiplier: 3            // Fetch 3× then filter to handle d-vecDB limitations
}
```

**Usage:**
```typescript
// Line 1011-1013 in dynamic-question-generator.ts
const incidents = await findSimilarIncidents(
  questionDraft,
  VECTOR_SEARCH_CONFIG.incidentsPerQuestion  // 20
)

// Fetch strategy
const toFetch = questionType === 'risk'
  ? VECTOR_SEARCH_CONFIG.incidentsPerQuestion
  : VECTOR_SEARCH_CONFIG.incidentsPerQuestion * VECTOR_SEARCH_CONFIG.fetchMultiplier
```

**Performance Tuning:**

1. **incidentsPerQuestion (20)**
   - Incidents fetched per question from d-vecDB
   - Balance: More = better evidence, slower response
   - For 50 questions × 20 incidents = 1,000 API calls
   - Typical latency: 20-50ms per incident search

2. **maxEvidenceIncidents (15)**
   - Maximum incidents retained for weight calculation
   - Prevents outliers from skewing weights
   - Example: 20 incidents fetched, top 15 used for statistics

3. **fetchMultiplier (3)**
   - d-vecDB doesn't support complex filters
   - Fetch 3× more, then post-filter in application
   - Example: Fetch 60 incidents, filter to 20 by domain/severity
   - Cost: ~3× network overhead, cleaner application code

**d-vecDB Limitations Context:**
```
LIMITATION: d-vecDB cannot filter by multiple conditions
  - ✗ severity: ['high', 'critical'] AND domain: 'finance'
  - ✗ incidentType: ['breach', 'ransomware'] OR year > 2023

SOLUTION: fetchMultiplier
  1. Fetch 60 incidents (top by similarity)
  2. Filter locally to 20 by domain + severity
  3. Use 15 for statistics calculation

This maintains relevance while working around API constraints
```

---

## How Thresholds Flow Through Question Generation

### Step 1: Vector Search
```
Input: System description
  ↓
Vectorize description (Vertex AI)
  ↓
Query d-vecDB with threshold PRE_FILTER_THRESHOLDS.minSimilarity (0.3)
  ↓
Fetch VECTOR_SEARCH_CONFIG.incidentsPerQuestion (20) × fetchMultiplier (3)
  ↓
Output: 60 potential incidents
```

### Step 2: Pre-filtering
```
60 incidents
  ↓
Filter by minSimilarity: Keep only >0.3 similarity
  ↓
Filter by minIncidentCount: Ensure at least 1 match per question
  ↓
Output: 40-50 qualified incidents
```

### Step 3: Weight Calculation
```
For each question candidate:
  1. LLM generates baseWeight (0.0-1.0)
  2. Count qualified incidents → evidenceWeight
  3. Check industry relevance → industryWeight
  4. Apply WEIGHT_FORMULAS[type]
  ↓
finalWeight = (base × 0.5) + (evidence × 0.3) + (industry × 0.2)
  ↓
Output: Questions with weights
```

### Step 4: Intensity Filtering
```
30 weighted questions
  ↓
HIGH intensity filter:
  - Keep: finalWeight ≥ 0.7 AND priority in ['security', 'compliance']
  - Max 15 questions
  ↓
MEDIUM intensity filter:
  - Keep: finalWeight ≥ 0.5 AND priority in ['risk', 'resilience']
  - Max 20 questions
  ↓
LOW intensity filter:
  - Keep: finalWeight ≥ 0.3 (everything else)
  - Max 25 questions
  ↓
Output: 15-60 final questions
```

---

## Modifying Thresholds

### Common Scenarios

#### 1. Generate More Questions
**Current:** Getting 20 questions, want 50

**Changes:**
```typescript
QUESTION_INTENSITY = {
  high: { minWeight: 0.5, maxQuestions: 25 },    // ↑ from 15
  medium: { minWeight: 0.3, maxQuestions: 35 },  // ↑ from 20
  low: { minWeight: 0.1, maxQuestions: 40 }      // ↑ from 25
}

PRE_FILTER_THRESHOLDS = {
  minSimilarity: 0.2  // ↓ from 0.3 (more lenient)
}
```

#### 2. Higher Quality Questions Only
**Current:** Getting low-confidence questions, want top-tier only

**Changes:**
```typescript
QUESTION_INTENSITY = {
  high: { minWeight: 0.8, maxQuestions: 20 },    // ↑ from 0.7
  medium: { minWeight: 0.6, maxQuestions: 15 },  // ↑ from 0.5
  low: { minWeight: 0.5, maxQuestions: 10 }      // ↑ from 0.3
}

PRE_FILTER_THRESHOLDS = {
  minSimilarity: 0.5,     // ↑ from 0.3 (stricter)
  minIncidentCount: 5     // ↑ from 1 (more evidence required)
}
```

#### 3. Faster Response Time
**Current:** Questions taking 30 seconds, want <10 seconds

**Changes:**
```typescript
VECTOR_SEARCH_CONFIG = {
  incidentsPerQuestion: 10,   // ↓ from 20 (fewer DB calls)
  maxEvidenceIncidents: 8,    // ↓ from 15
  fetchMultiplier: 1          // ↓ from 3 (single fetch)
}

// Side effect: May reduce question diversity
// Mitigation: Slightly lower minSimilarity to 0.25
```

#### 4. Focus on Specific Industry
**Current:** Questions for all industries, want finance-focused

**Changes:**
```typescript
WEIGHT_FORMULAS = {
  RISK: {
    baseWeight: 0.4,
    evidenceWeight: 0.2,
    industryWeight: 0.4   // ↑ from 0.2 (emphasize industry match)
  }
}

QUESTION_INTENSITY = {
  high: { minWeight: 0.6, priorities: ['finance', 'security'] },
  // ... etc
}
```

### Implementation Pattern

```typescript
// File: src/config/thresholds.ts

export const PRE_FILTER_THRESHOLDS = {
  minWeight: 0.3,
  minIncidentCount: 1,
  minSimilarity: 0.3
}

export function getIntensityConfig(
  intensity: QuestionIntensity
): IntensityConfig {
  return QUESTION_INTENSITY[intensity]
}

export function calculateFinalWeight(
  baseWeight: number,
  evidenceWeight: number,
  industryWeight: number,
  type: 'RISK' | 'COMPLIANCE'
): number {
  const formula = WEIGHT_FORMULAS[type]
  return (
    baseWeight * formula.baseWeight +
    evidenceWeight * formula.evidenceWeight +
    industryWeight * formula.industryWeight
  )
}
```

---

## Environment-Specific Recommendations

### Development
```typescript
// Lower thresholds for testing all code paths
minSimilarity: 0.1
minIncidentCount: 0
```

### Staging
```typescript
// Moderate thresholds for realistic testing
minSimilarity: 0.3
minIncidentCount: 1
```

### Production
```typescript
// Higher thresholds for quality
minSimilarity: 0.4
minIncidentCount: 2
```

---

## Monitoring & Metrics

Track these metrics to understand threshold effectiveness:

```typescript
interface ThresholdMetrics {
  questionsGenerated: number          // Total questions
  questionsByIntensity: {
    high: number
    medium: number
    low: number
  }
  averageWeight: number              // Mean finalWeight
  averageEvidence: number            // Mean incident count
  responseTimeMs: number             // Generation duration
}
```

**Healthy Metrics:**
- Questions: 30-50 total
- HIGH: 10-15 questions
- MEDIUM: 10-15 questions
- LOW: 10-20 questions
- Average weight: 0.5-0.7
- Response time: <5 seconds

---

## References

- **Implementation:** `src/services/dynamic-question-generator.ts:465`
- **Usage:** `src/controllers/review.controller.ts`
- **Database:** `prisma/schema.prisma` (riskNotes JSONB storage)
- **Vector DB:** `src/lib/vertex-ai-client.ts`

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-13 | Initial centralized config (Phase 3) |

