# Question Intensity Implementation Plan

**Date**: November 7, 2025
**Purpose**: Implement frontend question intensity feature in backend

---

## Overview

The frontend now supports **Question Intensity** (high/medium/low) that filters questions based on weight and priority. The backend must:
1. Accept `questionIntensity` parameter
2. Filter questions according to intensity rules
3. Mark filtered questions as `not_applicable`
4. Ensure data consistency across Steps 2 and 3

---

## Frontend Intensity Rules

| Level  | minWeight | Allowed Priorities              | Max Questions | Notes                           |
|--------|-----------|----------------------------------|---------------|---------------------------------|
| high   | 0.0       | ['critical','high','medium','low'] | 12            | Full set                        |
| medium | 0.4       | ['critical','high','medium']      | 9             | Drops low-priority items        |
| low    | 0.6       | ['critical','high']              | 6             | Only critical/high              |

**Source**: Frontend `lib/assessment/question-intensity.ts`

---

## Backend Changes Required

### 1. Question Generator Service

**File**: `src/services/dynamic-question-generator.ts`

#### 1.1 Add Interface Field
```typescript
export interface QuestionGenerationRequest {
  // ... existing fields

  // NEW: Question intensity control
  questionIntensity?: 'high' | 'medium' | 'low'
}
```

#### 1.2 Create Intensity Filter Function
```typescript
/**
 * Apply question intensity filtering
 * Filters questions based on weight and priority thresholds
 */
function applyIntensityFiltering(
  questions: DynamicQuestion[],
  intensity: 'high' | 'medium' | 'low' = 'high'
): DynamicQuestion[] {
  const rules = {
    high: { minWeight: 0.0, priorities: ['critical', 'high', 'medium', 'low'], maxQuestions: 12 },
    medium: { minWeight: 0.4, priorities: ['critical', 'high', 'medium'], maxQuestions: 9 },
    low: { minWeight: 0.6, priorities: ['critical', 'high'], maxQuestions: 6 },
  }

  const rule = rules[intensity]

  // Filter by weight and priority
  let filtered = questions.filter(q =>
    q.finalWeight >= rule.minWeight &&
    rule.priorities.includes(q.priority)
  )

  // Sort by weight descending
  filtered = filtered.sort((a, b) => b.finalWeight - a.finalWeight)

  // Limit to max questions
  filtered = filtered.slice(0, rule.maxQuestions)

  console.log(`[Intensity] ${intensity.toUpperCase()}: Filtered ${questions.length} → ${filtered.length} questions`)

  return filtered
}
```

#### 1.3 Apply Filter in Main Function
```typescript
export async function generateDynamicQuestions(
  request: QuestionGenerationRequest
): Promise<QuestionGenerationResult> {
  // ... existing generation logic

  // NEW: Apply intensity filtering if specified
  let finalRiskQuestions = deduplicatedRiskQuestions
  let finalComplianceQuestions = deduplicatedComplianceQuestions

  if (request.questionIntensity) {
    console.log(`\n🎚️  Applying question intensity: ${request.questionIntensity}`)
    finalRiskQuestions = applyIntensityFiltering(deduplicatedRiskQuestions, request.questionIntensity)
    finalComplianceQuestions = applyIntensityFiltering(deduplicatedComplianceQuestions, request.questionIntensity)
  }

  return {
    riskQuestions: finalRiskQuestions,
    complianceQuestions: finalComplianceQuestions,
    // ... rest of response
  }
}
```

---

### 2. Assessment Controller Updates

**File**: `src/controllers/assessments.controller.ts`

#### 2.1 Accept Intensity Parameter in Step 1
```typescript
interface CreateAssessmentBody {
  // ... existing fields
  questionIntensity?: 'high' | 'medium' | 'low'
}

export async function createAssessmentController(...) {
  const { questionIntensity, ...otherFields } = request.body

  // Pass to question generator
  const questions = await generateDynamicQuestions({
    ...otherFields,
    questionIntensity: questionIntensity || 'high', // Default to high
  })
}
```

#### 2.2 Normalize Field Names in Responses
```typescript
// Ensure consistent field naming
const responseData = {
  ...assessment,
  riskQuestionResponses: assessment.riskQuestionResponses || {},
  complianceQuestionResponses: assessment.complianceDetails || {},
  selectedDomains: assessment.selectedDomains || [],
  jurisdictions: assessment.jurisdictions || [],
}
```

#### 2.3 Update Step 2/3 to Merge Data
```typescript
export async function updateAssessmentStep2Controller(...) {
  const {
    riskQuestionResponses,
    selectedDomains,
    userRiskScores,
    riskNotes,
    additionalRiskElements,
    ...otherFields
  } = request.body

  // Merge with existing data (don't overwrite Step 1)
  const updated = await prisma.riskAssessment.update({
    where: { id },
    data: {
      riskQuestionResponses: riskQuestionResponses,
      selectedDomains: selectedDomains,
      // Preserve Step 1 data: systemDescription, industry, etc.
      ...otherFields,
    },
  })

  // Return FULL assessment data
  return reply.send({
    success: true,
    data: {
      ...updated,
      // Ensure all fields are present for frontend
      selectedDomains: updated.selectedDomains || [],
      jurisdictions: updated.jurisdictions || [],
    },
  })
}
```

---

### 3. Score Calculation Service

**File**: `src/services/score-calculator.ts` (create if doesn't exist)

#### 3.1 Calculate Letter Grade
```typescript
export function calculateLetterGrade(sengolScore: number): string {
  if (sengolScore >= 90) return 'A+'
  if (sengolScore >= 85) return 'A'
  if (sengolScore >= 80) return 'A-'
  if (sengolScore >= 75) return 'B+'
  if (sengolScore >= 70) return 'B'
  if (sengolScore >= 65) return 'B-'
  if (sengolScore >= 60) return 'C+'
  if (sengolScore >= 55) return 'C'
  if (sengolScore >= 50) return 'C-'
  if (sengolScore >= 45) return 'D+'
  if (sengolScore >= 40) return 'D'
  return 'F'
}
```

#### 3.2 Calculate Risk Coverage Score
```typescript
export function calculateRiskCoverageScore(
  responses: Record<string, any>,
  totalQuestions: number
): number {
  const answeredCount = Object.keys(responses).filter(
    id => responses[id]?.status === 'completed'
  ).length

  return Math.round((answeredCount / totalQuestions) * 100)
}
```

#### 3.3 Calculate Sengol Score
```typescript
export function calculateSengolScore(
  riskScore: number,
  complianceScore: number
): number {
  // Weighted average: 60% risk, 40% compliance
  const sengolScore = (riskScore * 0.6) + (complianceScore * 0.4)
  return Math.round(sengolScore)
}
```

---

### 4. Not Applicable Status Handling

**Database Schema** (if needed):
```prisma
// Ensure questionResponses support 'not_applicable' status
// No schema change needed if using JSON field
```

**Controller Validation**:
```typescript
// Accept not_applicable status in validation
const validStatuses = ['completed', 'in_progress', 'not_started', 'not_applicable']

if (response.status && !validStatuses.includes(response.status)) {
  throw new ValidationError(`Invalid status: ${response.status}`)
}
```

---

## Implementation Steps

1. ✅ **Create implementation plan** (this document)
2. ⏳ **Update question generator service**
   - Add `questionIntensity` to interface
   - Implement `applyIntensityFiltering()` function
   - Apply filter in main generation function
3. ⏳ **Update assessment controller**
   - Accept `questionIntensity` in Step 1
   - Normalize field names in responses
   - Merge data properly in Step 2/3 updates
4. ⏳ **Create score calculator service**
   - Implement letter grade calculation
   - Implement risk coverage score
   - Implement Sengol score calculation
5. ⏳ **Add not_applicable status support**
   - Update validation logic
   - Handle in score calculations
6. ⏳ **Test changes**
   - Test intensity filtering (high/medium/low)
   - Test data normalization
   - Test score calculations
7. ⏳ **Deploy to production**

---

## Testing Scenarios

### Test 1: High Intensity
**Input**: `questionIntensity: 'high'`
**Expected**: All questions (0.0+ weight, all priorities)
**Max**: 12 questions

### Test 2: Medium Intensity
**Input**: `questionIntensity: 'medium'`
**Expected**: Filtered to 0.4+ weight, critical/high/medium only
**Max**: 9 questions

### Test 3: Low Intensity
**Input**: `questionIntensity: 'low'`
**Expected**: Filtered to 0.6+ weight, critical/high only
**Max**: 6 questions

### Test 4: No Intensity (Default)
**Input**: No `questionIntensity` provided
**Expected**: Default to 'high' intensity
**Max**: 12 questions

### Test 5: Data Preservation
**Action**: Update Step 2
**Expected**: Step 1 data (systemDescription, industry) preserved

### Test 6: Score Calculations
**Action**: Complete assessment
**Expected**: sengolScore, letterGrade, riskCoverageScore returned

---

## API Contract Changes

### POST /api/assessments (Step 1)
**New Field**:
```json
{
  "questionIntensity": "medium"
}
```

### GET /api/assessments/:id
**Response**:
```json
{
  "success": true,
  "data": {
    "id": "...",
    "riskQuestionResponses": {},
    "complianceQuestionResponses": {},
    "selectedDomains": ["ai", "cyber"],
    "jurisdictions": ["US", "EU"],
    "sengolScore": 75,
    "letterGrade": "B",
    "riskCoverageScore": 85
  }
}
```

### PUT /api/assessments/:id/step2
**Request**:
```json
{
  "riskQuestionResponses": {
    "q1": { "status": "completed", "notes": "..." },
    "q2": { "status": "not_applicable" }
  },
  "selectedDomains": ["ai", "cyber"],
  "userRiskScores": { "q1": 70 },
  "riskNotes": {},
  "additionalRiskElements": []
}
```

---

## Rollout Plan

1. **Development**: Implement all changes in feature branch
2. **Testing**: Test locally with frontend integration
3. **Staging**: Deploy to staging environment
4. **Verification**: Frontend team validates behavior
5. **Production**: Deploy to production with monitoring

---

## Success Criteria

- ✅ Backend accepts `questionIntensity` parameter
- ✅ Questions filtered according to intensity rules
- ✅ Data normalized (consistent field names)
- ✅ Step 1 data preserved through Step 2/3
- ✅ Scores calculated and returned properly
- ✅ `not_applicable` status supported
- ✅ No breaking changes to existing assessments

---

**Next Step**: Begin implementation starting with question generator service.
