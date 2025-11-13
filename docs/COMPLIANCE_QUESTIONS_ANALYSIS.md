# Compliance Questions - Full Analysis & UI/UX Requirements

**Date**: November 12, 2025
**Status**: ✅ COMPLETE ANALYSIS

---

## Executive Summary

I've analyzed the compliance question generation system to verify:
1. ✅ **Question Quality**: Compliance questions ARE fully formed (not one-word)
2. ✅ **Incident Association**: Compliance questions HAVE incident mappings
3. ⚠️ **Database Storage**: Compliance responses CAN be stored, but the workflow needs UI/UX clarification
4. 📋 **UI/UX Requirements**: Specific requirements documented below

---

## 1. Compliance Question Quality ✅

### Current Implementation

Compliance questions are generated using **LLM-powered formalization** at `src/services/dynamic-question-generator.ts:1371-1462`:

```typescript
// ✅ NEW: Generate formalized compliance question using LLM
console.log(`[LLM_COMPLIANCE] Generating formalized compliance question for "${complianceArea}"...`)

const completion = await gemini.chat.completions.create({
  messages: [
    {
      role: 'system',
      content: `You are a compliance and regulatory risk expert. Generate a formal, structured compliance assessment question based on real-world regulatory violations and system context.

The question MUST:
1. Be highly specific to the user's system and regulatory requirements
2. Reference the compliance area: ${complianceArea}
3. Incorporate evidence from ${relatedIncidents.length} real compliance violations
4. Be clear and actionable (answerable with: "addressed", "partially addressed", "not addressed", or "not applicable")
5. Focus on specific compliance controls or requirements
6. Use formal, professional language
7. Be concise (1-2 sentences max)
8. Highlight connections to regulatory frameworks

Format: Return ONLY the question text, nothing else.`
    },
    {
      role: 'user',
      content: complianceEvidenceSummary
    }
  ],
  temperature: 0.7,
  maxTokens: 250
})

complianceQuestionText = completion.choices[0].message.content?.trim() || complianceQuestionText
```

### Validation Logic

Lines 1456-1462 include validation to prevent one-word questions:

```typescript
// ✅ Validate compliance question text
if (complianceQuestionText.length < 20 || complianceQuestionText === complianceArea) {
  console.warn(`[VALIDATION] Invalid compliance question text, using fallback for ${complianceArea}`)
  const regulations = (llmAnalysis.complianceRequirements || []).slice(0, 2).join(' and ')
  const data = (request.dataTypes || [])[0] || 'data'
  complianceQuestionText = `Do you have documented procedures to comply with ${regulations} requirements for ${data} handling in your ${request.deployment || 'system'}?`
}
```

### Example Output

Based on the system prompt and validation, compliance questions will be formatted like:

**Good Examples**:
- "How do you ensure GDPR Article 32 security measures are implemented for PII data processing in your cloud infrastructure, given that 15 similar organizations faced €2.3M average fines for inadequate technical safeguards?"
- "Do you have documented procedures to comply with HIPAA Security Rule requirements for patient health data handling in your AWS deployment?"

**NOT** like:
- ❌ "Data Inventory" (one-word)
- ❌ "Consent Management" (two-word)

### Verdict: ✅ PASS

Compliance questions are fully formed, contextualized, and evidence-based.

---

## 2. Incident Association with Compliance Questions ✅

### Current Implementation

Compliance questions receive the SAME incident array as risk questions via optimized parallel processing (lines 1309-1316):

```typescript
const generatedQuestions = await Promise.all(
  Array.from(complianceAreas).map(async (complianceArea) => {
    try {
      const question = await generateSingleComplianceQuestion(
        complianceArea,
        incidents, // ✅ OPTIMIZED: Pass preloaded incidents
        request,
        llmAnalysis
      )
      return question
    } catch (error) {
      console.error(`[PARALLEL] Failed to generate compliance question for "${complianceArea}":`, error)
      return null
    }
  })
)
```

### Function Signature

Lines 1335-1340 show the incident parameter:

```typescript
async function generateSingleComplianceQuestion(
  complianceArea: string,
  relatedIncidents: IncidentMatch[], // ✅ OPTIMIZED: Now receives preloaded incidents
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis
): Promise<DynamicQuestion> {
```

### Incident Processing

Lines 1344-1365 show that compliance questions use the SAME vector search results as risk questions:

```typescript
// ✅ OPTIMIZATION: Skip per-question vector search if incidents are provided
// This eliminates 10+ vector searches for compliance questions

// Use all preloaded incidents (already semantically relevant from initial search)
const relevantIncidents = relatedIncidents.slice(0, 15) // Take top 15

console.log(`[OPTIMIZED] Using ${relevantIncidents.length} preloaded incidents for compliance: "${complianceArea}"`)

// ✅ Calculate multi-factor relevance for filtered incidents
const incidentsWithRelevance = relevantIncidents.map(incident => ({
  incident,
  multiFactorRelevance: calculateMultiFactorRelevance(incident, request),
  technologyScore: calculateTechnologyMatch(incident, request.techStack || []),
  dataTypeScore: calculateDataTypeMatch(incident, request.dataTypes || []),
  sourceScore: calculateDataSourceMatch(incident, request.dataSources || [])
}))

// Sort by relevance
const filteredIncidents = incidentsWithRelevance
  .sort((a, b) => b.multiFactorRelevance - a.multiFactorRelevance)
  .slice(0, 10)

// Use filtered incidents
relatedIncidents = filteredIncidents.map(i => i.incident)
```

### Evidence in LLM Prompt

Lines 1401-1410 show that incidents are explicitly referenced in the compliance question generation:

```typescript
Evidence from Compliance Violations Database:
- ${relatedIncidents.length} relevant compliance incidents found
- Average severity: ${avgSeverity.toFixed(1)}/10
- Multi-factor relevance: ${(avgMultiFactorRelevance * 100).toFixed(0)}%
- Average fine: $${(avgFine / 1000).toFixed(0)}K per violation

Recent Examples (Top 3):
${relatedIncidents.slice(0, 3).map((ex, i) =>
  `${i + 1}. ${ex.organization || 'Organization'} - ${ex.incidentType} (${ex.incidentDate ? new Date(ex.incidentDate).toISOString().split('T')[0] : 'Recent'}, fine: $${ex.estimatedCost ? (Number(ex.estimatedCost) / 1000).toFixed(0) + 'K' : 'Unknown'})`
).join('\n')}
```

### Returned Data Structure

The `DynamicQuestion` interface includes `relatedIncidents` for ALL questions (both risk and compliance):

```typescript
export interface DynamicQuestion {
  // ... other fields
  relatedIncidents: IncidentMatch[]  // ← PRIMARY MAPPING: Full incident array
  similarIncidents?: IncidentMatch[] // Alias for relatedIncidents
  evidence: IncidentEvidence {
    incidentCount: number
    avgSeverity: number
    relevanceScore: number
    recentExamples: Array<{
      id: string
      title: string
      organization: string
      date: string
      severity: number
      incidentType: string
      category: string
      description: string
      estimatedCost: number
      cost: number
      similarity: number
      relevanceScore: number
    }>
  }
}
```

### Verdict: ✅ PASS

Compliance questions have FULL incident association, identical to risk questions. The optimization in November 2025 eliminated redundant vector searches by passing the same incident array to all question generators.

---

## 3. Database Storage for Compliance Responses ⚠️

### Schema Analysis

`prisma/schema.prisma` lines 275-283 show THREE fields for compliance data:

```prisma
model RiskAssessment {
  // ... other fields

  // Compliance Coverage Metrics (for unified review flow)
  complianceCoverageScore      Decimal? @db.Decimal(5, 2) // 0-100 percentage covered
  complianceCoverageDetails    Json? // {byJurisdiction: {EU: {covered: 8, total: 10}}}
  complianceQuestionResponses  Json? // {data_inventory: {status: "addressed", answer: "..."}}
  complianceUserScores         Json? // User scores: {data_inventory: 90}
  complianceNotes              Json? // Notes: {data_inventory: "Automated scanning"}
  additionalComplianceElements Json? // Custom items: [{id: "custom_1", requirement: "..."}}]
}
```

### Expected Data Format

Based on the schema comment, `complianceQuestionResponses` should store:

```json
{
  "data_inventory": {
    "status": "addressed",
    "answer": "We maintain a comprehensive data inventory using Collibra, updated quarterly..."
  },
  "consent_management": {
    "status": "partially_addressed",
    "answer": "We have consent management for EU users via OneTrust, but not for APAC..."
  },
  "security_measures": {
    "status": "not_addressed",
    "answer": "We are currently implementing ISO 27001 controls..."
  }
}
```

### Current Status: ⚠️ NOT IMPLEMENTED

#### Evidence 1: Assessment Check

Running `npx tsx check-assessment-cmhwff31m.ts` on a recent assessment shows:

```
Assessment ID: cmhwff31m0001jsr0agolb283
Industry: Healthcare & Life Sciences
Created: 2025-11-12T20:02:05.480Z
Updated: 2025-11-12T21:05:09.115Z

Questions found in riskNotes.generatedQuestions

Question counts:
  Risk questions: 0
  Compliance questions: 0
  Total: 0
```

This assessment has NO questions at all (due to the earlier bug), so we can't verify compliance response storage.

#### Evidence 2: Code Search

Searching for compliance response storage:

```bash
grep -r "complianceQuestionResponses" src/
```

**Result**: No results found.

This means the backend does NOT currently save compliance responses to the database field.

### Verdict: ⚠️ SCHEMA EXISTS, IMPLEMENTATION MISSING

The database schema HAS the field `complianceQuestionResponses`, but:
1. No backend code currently writes to it
2. No API endpoint exists to save compliance responses
3. The frontend would need to implement the submission flow

---

## 4. UI/UX Requirements for Compliance Questions

### 4.1. Display Requirements

#### A. Question List View

Display compliance questions alongside risk questions with distinction:

```tsx
interface ComplianceQuestionCardProps {
  question: DynamicQuestion
  category: 'compliance' // vs 'ai' | 'cyber' | 'cloud'
}

function ComplianceQuestionCard({ question }: ComplianceQuestionCardProps) {
  return (
    <div className="question-card compliance">
      <div className="question-header">
        <span className="badge badge-compliance">Compliance</span>
        <span className="evidence-count">
          Based on {question.evidence.incidentCount} incidents
        </span>
      </div>

      <h3>{question.label}</h3>

      <p className="description">{question.description}</p>

      <div className="incident-summary">
        <div className="stat">
          <label>Avg Fine:</label>
          <span>${(question.evidence.statistics.avgCost / 1000).toFixed(0)}K</span>
        </div>
        <div className="stat">
          <label>Avg Severity:</label>
          <span>{question.evidence.avgSeverity.toFixed(1)}/10</span>
        </div>
        <div className="stat">
          <label>Relevance:</label>
          <span>{(question.evidence.relevanceScore * 100).toFixed(0)}%</span>
        </div>
      </div>
    </div>
  )
}
```

#### B. Incident Association Display

Use the **same component** as risk questions (already documented in `docs/INCIDENT_QUESTION_MAPPING.md`):

```tsx
// Display incidents for compliance questions
function ComplianceQuestionDetails({ question }: { question: DynamicQuestion }) {
  const topIncidents = question.evidence.recentExamples.slice(0, 3)

  return (
    <div className="compliance-question-details">
      <h3>{question.label}</h3>

      <div className="compliance-evidence">
        <h4>Regulatory Violations Database ({question.evidence.incidentCount} incidents):</h4>
        {topIncidents.map((incident) => (
          <div key={incident.id} className="incident-card">
            <div className="incident-header">
              <strong>{incident.organization}</strong>
              <span className="fine">
                ${(incident.cost / 1000).toFixed(0)}K fine
              </span>
              <span className="date">
                {new Date(incident.date).toLocaleDateString()}
              </span>
            </div>
            <p>{incident.title}</p>
            <div className="incident-meta">
              <span className="type">{incident.incidentType}</span>
              <span className="similarity">
                {(incident.similarity * 100).toFixed(0)}% similar to your system
              </span>
            </div>
          </div>
        ))}

        <button onClick={() => showAllIncidents(question.relatedIncidents)}>
          View all {question.evidence.incidentCount} violations
        </button>
      </div>
    </div>
  )
}
```

### 4.2. Response Capture Requirements

#### A. Response Format

Compliance questions should accept structured responses with 4 options:

```typescript
type ComplianceStatus = 'addressed' | 'partially_addressed' | 'not_addressed' | 'not_applicable'

interface ComplianceResponse {
  questionId: string
  status: ComplianceStatus
  answer: string // Free text explanation
  score?: number // Optional 0-100 score
  notes?: string // Optional additional notes
  lastUpdated: Date
}
```

#### B. UI Component

```tsx
function ComplianceQuestionInput({ question }: { question: DynamicQuestion }) {
  const [status, setStatus] = useState<ComplianceStatus | null>(null)
  const [answer, setAnswer] = useState('')
  const [score, setScore] = useState<number | null>(null)

  return (
    <div className="compliance-input">
      <h3>{question.label}</h3>
      <p className="description">{question.description}</p>

      {/* Status Selection */}
      <div className="status-selector">
        <label>Compliance Status:</label>
        <div className="radio-group">
          <label>
            <input
              type="radio"
              value="addressed"
              checked={status === 'addressed'}
              onChange={(e) => setStatus(e.target.value as ComplianceStatus)}
            />
            ✅ Addressed
          </label>
          <label>
            <input
              type="radio"
              value="partially_addressed"
              checked={status === 'partially_addressed'}
              onChange={(e) => setStatus(e.target.value as ComplianceStatus)}
            />
            ⚠️ Partially Addressed
          </label>
          <label>
            <input
              type="radio"
              value="not_addressed"
              checked={status === 'not_addressed'}
              onChange={(e) => setStatus(e.target.value as ComplianceStatus)}
            />
            ❌ Not Addressed
          </label>
          <label>
            <input
              type="radio"
              value="not_applicable"
              checked={status === 'not_applicable'}
              onChange={(e) => setStatus(e.target.value as ComplianceStatus)}
            />
            N/A
          </label>
        </div>
      </div>

      {/* Free Text Answer */}
      <div className="answer-input">
        <label>Explanation:</label>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          placeholder="Describe your compliance measures, documentation, or implementation plans..."
          rows={4}
        />
      </div>

      {/* Optional Score */}
      {status !== 'not_applicable' && (
        <div className="score-input">
          <label>Self-Assessment Score (0-100):</label>
          <input
            type="number"
            min="0"
            max="100"
            value={score || ''}
            onChange={(e) => setScore(Number(e.target.value))}
            placeholder="Optional"
          />
        </div>
      )}

      {/* Evidence Reference */}
      <div className="evidence-reference">
        <details>
          <summary>
            Why is this important? (Based on {question.evidence.incidentCount} real violations)
          </summary>
          <div className="incident-summary">
            {question.evidence.recentExamples.slice(0, 3).map((incident) => (
              <div key={incident.id} className="mini-incident">
                <strong>{incident.organization}</strong>:
                ${(incident.cost / 1000).toFixed(0)}K fine for {incident.incidentType}
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  )
}
```

### 4.3. API Requirements

#### Backend Endpoint Needed

```typescript
// POST /api/review/:id/compliance-responses
interface SaveComplianceResponsesRequest {
  assessmentId: string
  responses: {
    [questionId: string]: {
      status: 'addressed' | 'partially_addressed' | 'not_addressed' | 'not_applicable'
      answer: string
      score?: number
      notes?: string
    }
  }
}

interface SaveComplianceResponsesResponse {
  success: boolean
  assessmentId: string
  complianceCoverageScore: number // Calculated 0-100 percentage
  complianceCoverageDetails: {
    byJurisdiction: {
      [jurisdiction: string]: {
        covered: number
        total: number
        percentage: number
      }
    }
  }
}
```

#### Example API Call

```typescript
const response = await fetch('/api/review/cmhwff31m0001jsr0agolb283/compliance-responses', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    assessmentId: 'cmhwff31m0001jsr0agolb283',
    responses: {
      'q_data_inventory': {
        status: 'addressed',
        answer: 'We maintain a comprehensive data inventory using Collibra...',
        score: 85,
        notes: 'Quarterly reviews scheduled'
      },
      'q_consent_management': {
        status: 'partially_addressed',
        answer: 'OneTrust for EU, working on APAC coverage...',
        score: 60
      },
      'q_security_measures': {
        status: 'not_addressed',
        answer: 'ISO 27001 implementation in progress, expected Q2 2026',
        score: 20,
        notes: 'Budget approved, vendor selected'
      }
    }
  })
})
```

### 4.4. Scoring and Coverage Calculation

The backend should calculate:

1. **Coverage Score**: Percentage of compliance questions addressed or partially addressed
2. **Coverage by Jurisdiction**: Breakdown by GDPR, HIPAA, CCPA, etc.
3. **Weighted Score**: Higher weight for critical compliance areas

```typescript
function calculateComplianceCoverage(
  questions: DynamicQuestion[],
  responses: Record<string, ComplianceResponse>
): { score: number; details: ComplianceCoverageDetails } {

  const byJurisdiction: Record<string, { covered: number; total: number }> = {}

  let totalWeight = 0
  let coveredWeight = 0

  questions.forEach((question) => {
    const response = responses[question.id]
    const weight = question.finalWeight || 1

    totalWeight += weight

    if (response?.status === 'addressed') {
      coveredWeight += weight
    } else if (response?.status === 'partially_addressed') {
      coveredWeight += weight * 0.5
    }

    // Track by jurisdiction
    const jurisdiction = extractJurisdiction(question) // Extract from question text
    if (!byJurisdiction[jurisdiction]) {
      byJurisdiction[jurisdiction] = { covered: 0, total: 0 }
    }
    byJurisdiction[jurisdiction].total += 1
    if (response?.status === 'addressed' || response?.status === 'partially_addressed') {
      byJurisdiction[jurisdiction].covered += 1
    }
  })

  const score = (coveredWeight / totalWeight) * 100

  return {
    score,
    details: {
      byJurisdiction: Object.entries(byJurisdiction).reduce((acc, [key, val]) => {
        acc[key] = {
          ...val,
          percentage: (val.covered / val.total) * 100
        }
        return acc
      }, {} as any)
    }
  }
}
```

### 4.5. Validation Requirements

**Frontend Validation**:
- Require status selection before submission
- Require answer text if status is 'addressed' or 'partially_addressed'
- Warn if score is <50 but status is 'addressed'
- Validate score is 0-100

**Backend Validation**:
- Validate assessmentId exists
- Validate all question IDs match the assessment's generated questions
- Validate status is one of the 4 allowed values
- Sanitize answer text (max 5000 chars)
- Validate score is 0-100 if provided

### 4.6. Display After Submission

After compliance responses are saved, display:

```tsx
function ComplianceReviewSummary({ assessment }: { assessment: RiskAssessment }) {
  const { complianceCoverageScore, complianceCoverageDetails } = assessment

  return (
    <div className="compliance-summary">
      <h2>Compliance Coverage: {complianceCoverageScore.toFixed(1)}%</h2>

      <div className="coverage-breakdown">
        {Object.entries(complianceCoverageDetails.byJurisdiction).map(([jurisdiction, data]) => (
          <div key={jurisdiction} className="jurisdiction-coverage">
            <label>{jurisdiction}:</label>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${data.percentage}%` }}
              />
            </div>
            <span>{data.covered}/{data.total} ({data.percentage.toFixed(0)}%)</span>
          </div>
        ))}
      </div>

      <div className="response-list">
        {Object.entries(assessment.complianceQuestionResponses || {}).map(([questionId, response]) => (
          <div key={questionId} className="response-item">
            <div className="status-badge" data-status={response.status}>
              {response.status === 'addressed' && '✅ Addressed'}
              {response.status === 'partially_addressed' && '⚠️ Partially Addressed'}
              {response.status === 'not_addressed' && '❌ Not Addressed'}
              {response.status === 'not_applicable' && 'N/A'}
            </div>
            <p className="answer">{response.answer}</p>
            {response.score && <span className="score">Score: {response.score}/100</span>}
          </div>
        ))}
      </div>
    </div>
  )
}
```

---

## 5. Backend Implementation Checklist

To fully support compliance response storage, the backend needs:

### 5.1. New Controller

Create `src/controllers/compliance.controller.ts`:

```typescript
import { FastifyRequest, FastifyReply } from 'fastify'
import { prisma } from '../lib/prisma'

interface ComplianceResponse {
  status: 'addressed' | 'partially_addressed' | 'not_addressed' | 'not_applicable'
  answer: string
  score?: number
  notes?: string
}

interface SaveComplianceResponsesBody {
  responses: Record<string, ComplianceResponse>
}

export async function saveComplianceResponses(
  request: FastifyRequest<{
    Params: { id: string }
    Body: SaveComplianceResponsesBody
  }>,
  reply: FastifyReply
) {
  try {
    const { id } = request.params
    const { responses } = request.body

    // Validate assessment exists
    const assessment = await prisma.riskAssessment.findUnique({
      where: { id }
    })

    if (!assessment) {
      return reply.status(404).send({ error: 'Assessment not found' })
    }

    // Calculate coverage
    const generatedQuestions = (assessment.riskNotes as any)?.generatedQuestions
    const complianceQuestions = generatedQuestions?.complianceQuestions || []

    const coverage = calculateComplianceCoverage(complianceQuestions, responses)

    // Save to database
    const updated = await prisma.riskAssessment.update({
      where: { id },
      data: {
        complianceQuestionResponses: responses,
        complianceCoverageScore: coverage.score,
        complianceCoverageDetails: coverage.details
      }
    })

    return reply.send({
      success: true,
      assessmentId: id,
      complianceCoverageScore: coverage.score,
      complianceCoverageDetails: coverage.details
    })
  } catch (error) {
    console.error('[Compliance] Save responses error:', error)
    return reply.status(500).send({ error: 'Failed to save compliance responses' })
  }
}

function calculateComplianceCoverage(
  questions: any[],
  responses: Record<string, ComplianceResponse>
) {
  // Implementation from section 4.4
  // ...
}
```

### 5.2. New Route

Add to `src/routes/compliance.routes.ts`:

```typescript
import { FastifyInstance } from 'fastify'
import { saveComplianceResponses } from '../controllers/compliance.controller'

export async function complianceRoutes(fastify: FastifyInstance) {
  fastify.post('/api/review/:id/compliance-responses', saveComplianceResponses)

  // Optional: GET endpoint to retrieve saved responses
  fastify.get('/api/review/:id/compliance-responses', async (request, reply) => {
    const { id } = request.params as { id: string }

    const assessment = await prisma.riskAssessment.findUnique({
      where: { id },
      select: {
        complianceQuestionResponses: true,
        complianceCoverageScore: true,
        complianceCoverageDetails: true
      }
    })

    if (!assessment) {
      return reply.status(404).send({ error: 'Assessment not found' })
    }

    return reply.send(assessment)
  })
}
```

### 5.3. Register Route

In `src/app.ts`, add:

```typescript
import { complianceRoutes } from './routes/compliance.routes'

// ... in build() function
await fastify.register(complianceRoutes)
```

---

## 6. Summary of Findings

| Aspect | Status | Details |
|--------|--------|---------|
| **Question Quality** | ✅ PASS | Compliance questions are fully formed, LLM-generated, contextualized |
| **Incident Association** | ✅ PASS | Full incident mapping via `relatedIncidents` and `evidence` fields |
| **Database Schema** | ✅ EXISTS | `complianceQuestionResponses`, `complianceCoverageScore`, `complianceCoverageDetails` fields exist |
| **Backend Storage** | ❌ NOT IMPLEMENTED | No controller/route to save compliance responses |
| **Frontend UI** | ❌ NOT IMPLEMENTED | No UI to capture compliance responses |
| **API Endpoint** | ❌ MISSING | Need `POST /api/review/:id/compliance-responses` |

---

## 7. Next Steps

### Immediate Actions Needed

1. **Backend Team**: Implement compliance response storage
   - Create `src/controllers/compliance.controller.ts`
   - Create `src/routes/compliance.routes.ts`
   - Add route registration in `src/app.ts`
   - Implement coverage calculation logic

2. **Frontend Team**: Implement compliance response UI
   - Design compliance question input form
   - Implement status selector (4 options)
   - Add free-text answer field
   - Add optional score input (0-100)
   - Display incident evidence for each question
   - Implement API integration for saving responses
   - Display compliance coverage summary after submission

3. **Testing**: End-to-end workflow testing
   - Generate questions for test assessment
   - Submit compliance responses via UI
   - Verify data saved to database
   - Verify coverage score calculated correctly
   - Test jurisdiction breakdown

### Estimated Implementation Time

- Backend: 4-6 hours
- Frontend: 8-12 hours
- Testing: 4 hours
- **Total**: 2-3 days

---

## 8. Questions for Product/Design Team

1. **Workflow**: Should compliance responses be:
   - Saved incrementally (one question at a time)?
   - Saved in bulk (submit all at once)?
   - Auto-saved as user types?

2. **Required Fields**: Should answer text be required for all statuses, or only for 'addressed' and 'partially_addressed'?

3. **Scoring**: Is the 0-100 self-assessment score optional or required?

4. **Editing**: Can users edit compliance responses after submission?

5. **Audit Trail**: Do we need to track change history for compliance responses (for regulatory audits)?

6. **Notifications**: Should users receive notifications when compliance coverage is below threshold (e.g., <80%)?

7. **Export**: Do we need to export compliance responses to PDF/CSV for auditors?

---

**End of Analysis**
