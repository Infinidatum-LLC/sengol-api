# Compliance Questions - Quick Summary

**Full Analysis**: [COMPLIANCE_QUESTIONS_ANALYSIS.md](./COMPLIANCE_QUESTIONS_ANALYSIS.md)
**Date**: November 12, 2025

---

## TL;DR

| Question | Answer | Status |
|----------|--------|--------|
| Are compliance questions fully formed? | ✅ YES | LLM-generated, contextualized, 1-2 sentence questions |
| Do compliance questions have incident mappings? | ✅ YES | Same incident array as risk questions via `relatedIncidents` field |
| Can compliance responses be stored in database? | ⚠️ SCHEMA EXISTS | `complianceQuestionResponses` field exists but NOT implemented |
| What does UI/UX team need to do? | 📋 SEE BELOW | Full requirements documented |

---

## Key Findings

### 1. Question Quality: ✅ PASS

Compliance questions are generated using **GPT-4 with specialized prompts** at `src/services/dynamic-question-generator.ts:1371-1462`.

**Example Output**:
```
"How do you ensure GDPR Article 32 security measures are implemented for PII data processing in your cloud infrastructure, given that 15 similar organizations faced €2.3M average fines for inadequate technical safeguards?"
```

**NOT**:
- ❌ "Data Inventory" (one-word)
- ❌ "Consent Management" (two-word)

### 2. Incident Association: ✅ PASS

Compliance questions receive the SAME incident array as risk questions.

**Data Structure** (already documented in `INCIDENT_QUESTION_MAPPING.md`):
```typescript
interface DynamicQuestion {
  relatedIncidents: IncidentMatch[]  // ← 3-15 incidents
  evidence: IncidentEvidence {
    incidentCount: number
    avgSeverity: number
    relevanceScore: number
    recentExamples: Array<{
      id, title, organization, date,
      severity, cost, similarity
    }>
  }
}
```

### 3. Database Storage: ⚠️ NOT IMPLEMENTED

**Schema** (`prisma/schema.prisma` lines 278-283):
```prisma
model RiskAssessment {
  complianceCoverageScore      Decimal? // 0-100 percentage
  complianceCoverageDetails    Json?    // {byJurisdiction: {...}}
  complianceQuestionResponses  Json?    // {q_id: {status, answer}}
  complianceUserScores         Json?    // {q_id: 90}
  complianceNotes              Json?    // {q_id: "notes"}
}
```

**Status**: Fields exist but NO backend code to write to them.

---

## What UI/UX Team Needs to Implement

### A. Display Compliance Questions

Use the **same incident display component** as risk questions (see `INCIDENT_QUESTION_MAPPING.md`).

```tsx
<ComplianceQuestionCard question={question}>
  <Badge>Compliance</Badge>
  <h3>{question.label}</h3>
  <EvidenceBadge>
    Based on {question.evidence.incidentCount} violations
  </EvidenceBadge>
</ComplianceQuestionCard>
```

### B. Capture Compliance Responses

Implement a 4-option status selector:

```tsx
<RadioGroup>
  <Radio value="addressed">✅ Addressed</Radio>
  <Radio value="partially_addressed">⚠️ Partially Addressed</Radio>
  <Radio value="not_addressed">❌ Not Addressed</Radio>
  <Radio value="not_applicable">N/A</Radio>
</RadioGroup>

<TextArea
  placeholder="Explain your compliance measures..."
  rows={4}
/>

<NumberInput
  label="Self-Assessment Score (0-100)"
  optional
/>
```

### C. API Integration

**Endpoint Needed** (backend must implement):
```
POST /api/review/:id/compliance-responses
```

**Request Body**:
```json
{
  "responses": {
    "q_data_inventory": {
      "status": "addressed",
      "answer": "We maintain a comprehensive data inventory...",
      "score": 85
    },
    "q_consent_management": {
      "status": "partially_addressed",
      "answer": "OneTrust for EU, working on APAC...",
      "score": 60
    }
  }
}
```

**Response**:
```json
{
  "success": true,
  "complianceCoverageScore": 72.5,
  "complianceCoverageDetails": {
    "byJurisdiction": {
      "GDPR": { "covered": 8, "total": 10, "percentage": 80 },
      "HIPAA": { "covered": 3, "total": 5, "percentage": 60 }
    }
  }
}
```

---

## What Backend Team Needs to Implement

### Required Files

1. **Controller**: `src/controllers/compliance.controller.ts`
   - `saveComplianceResponses()` function
   - `calculateComplianceCoverage()` function

2. **Route**: `src/routes/compliance.routes.ts`
   - `POST /api/review/:id/compliance-responses`
   - `GET /api/review/:id/compliance-responses` (optional)

3. **Registration**: Update `src/app.ts`
   ```typescript
   import { complianceRoutes } from './routes/compliance.routes'
   await fastify.register(complianceRoutes)
   ```

### Estimated Time
- Backend: 4-6 hours
- Frontend: 8-12 hours
- Testing: 4 hours
- **Total**: 2-3 days

---

## Questions for Product Team

1. Should responses be saved incrementally or in bulk?
2. Is answer text required for all statuses?
3. Is the 0-100 score optional or required?
4. Can users edit responses after submission?
5. Do we need audit trail (change history)?
6. Export to PDF/CSV for auditors?

---

## Documentation Links

- **Full Analysis**: [COMPLIANCE_QUESTIONS_ANALYSIS.md](./COMPLIANCE_QUESTIONS_ANALYSIS.md)
- **Incident Mapping**: [INCIDENT_QUESTION_MAPPING.md](./INCIDENT_QUESTION_MAPPING.md)
- **Backend Code**: `src/services/dynamic-question-generator.ts` lines 1280-1520

---

**Status**: Analysis complete, ready for implementation.
