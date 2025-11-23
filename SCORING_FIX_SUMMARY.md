# Scoring Fix Summary

## Problem Identified

The submit endpoint was **NOT using question weights** when calculating scores. It was just averaging response scores without considering the importance of each question.

### Previous (Broken) Logic:
```typescript
// Simple average - ignores question weights
riskScore = average(all_response_scores)
```

### Issue:
- LLM generates questions with weights based on:
  - Base Weight (50%): LLM-analyzed importance
  - Evidence Weight (30%): Incident frequency/severity from 78K+ incidents
  - Industry Weight (20%): Industry-specific relevance
- But these weights were **completely ignored** in score calculation
- Critical questions (high weight) had same impact as minor questions (low weight)

## Solution Implemented

### Weighted Scoring Formula:
```typescript
// Weighted average - uses question weights
riskScore = Σ(responseScore × questionWeight) / Σ(questionWeight)
```

### Implementation Details:

1. **Load Questions from Database**
   - Load `riskNotes.generatedQuestions` and `complianceNotes.generatedQuestions`
   - Extract question weights (normalize to 0-1 scale)

2. **Calculate Weighted Scores**
   - For each question with a response:
     - Get question weight (normalize if needed: 0-10 → 0-1)
     - Get response score (status → score conversion)
     - Multiply: `score × weight`
     - Sum all weighted scores
     - Divide by sum of weights

3. **Status to Score Conversion**
   - `addressed` → 20 (low risk)
   - `partially_addressed` → 50 (medium risk)
   - `not_addressed` → 80 (high risk)
   - `not_applicable` → excluded

4. **Compliance Score**
   - Same weighted formula
   - Scores inverted: `100 - riskScore` (addressed = 80, not_addressed = 20)

5. **Sengol Score**
   - `(riskHealth × 0.6) + (complianceScore × 0.4)`
   - Where `riskHealth = 100 - riskScore`

## Flow Verification

### Step 1: Question Generation
- ✅ LLM generates questions with weights
- ✅ Questions saved to `riskNotes.generatedQuestions` and `complianceNotes.generatedQuestions`
- ✅ Weights preserved: `finalWeight`, `weight`, `baseWeight`, `evidenceWeight`, `industryWeight`

### Step 2: User Responses
- ✅ User answers questions
- ✅ Responses saved to `riskQuestionResponses`
- ✅ Questions loaded from database with weights

### Step 3: Compliance Responses
- ✅ User answers compliance questions
- ✅ Responses saved to `complianceQuestionResponses`
- ✅ Questions loaded from database with weights

### Submit: Score Calculation
- ✅ Load questions from `riskNotes` and `complianceNotes`
- ✅ Load responses from `riskQuestionResponses` and `complianceQuestionResponses`
- ✅ Calculate weighted scores using formula
- ✅ Save scores to database

## Testing Checklist

- [ ] Step 1: Generate questions → Verify weights are saved
- [ ] Step 2: Answer questions → Verify responses are saved
- [ ] Step 3: Answer compliance → Verify responses are saved
- [ ] Submit: Verify weighted scores are calculated correctly
- [ ] Verify high-weight questions have more impact than low-weight questions
- [ ] Verify scores match expected values based on question weights

## Example Calculation

**Questions:**
- Q1: "Access Control" (weight: 0.91, status: `addressed` → score: 20)
- Q2: "Data Encryption" (weight: 0.85, status: `partially_addressed` → score: 50)
- Q3: "Monitoring" (weight: 0.65, status: `not_addressed` → score: 80)

**Weighted Calculation:**
```
weightedSum = (20 × 0.91) + (50 × 0.85) + (80 × 0.65)
            = 18.2 + 42.5 + 52.0
            = 112.7

totalWeight = 0.91 + 0.85 + 0.65
            = 2.41

riskScore = 112.7 / 2.41
          = 46.7 (rounded to 47)
```

**Without Weights (Simple Average):**
```
average = (20 + 50 + 80) / 3
        = 50
```

**Difference:** Weighted score (47) is lower than simple average (50) because the high-weight question (Q1) was addressed (low risk), reducing the overall risk score.

