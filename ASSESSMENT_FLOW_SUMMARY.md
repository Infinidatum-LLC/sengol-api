# Complete Assessment Flow with Multi-Provider LLM

## Overview

The assessment flow now uses a **multi-provider LLM client** with automatic fallback for reliable question generation.

## Complete Flow

### Step 1: System Description & Question Generation

**User Input:**
- System description (100-5000 chars)
- Industry selection
- System criticality (High/Medium/Low)
- Data types (PII, Financial, Health, etc.)
- Tech stack (GPT-4, AWS, PostgreSQL, etc.)
- Selected domains (AI, Cyber, Cloud)
- Jurisdictions (US, EU, etc.)

**Backend Process:**
1. **Save System Description** → Database (`systemDescription`, `industry`, `systemCriticality`, etc.)
2. **Search 78K+ Incidents** → Qdrant vector database (100 similar incidents)
3. **LLM System Analysis** → Multi-provider LLM analyzes system + incidents
   - Tries: OpenAI → Anthropic → Gemini (automatic fallback)
   - Returns: Primary risks, compliance requirements, recommended priorities
4. **Generate Risk Questions** → Multi-provider LLM generates questions with weights
   - For each risk area: LLM generates question + priority (0-100) + reasoning
   - Uses incidents for evidence-based weighting
5. **Generate Compliance Questions** → Multi-provider LLM generates compliance questions
6. **Save Questions** → Database (`riskNotes.generatedQuestions`, `complianceNotes.generatedQuestions`)
7. **Store in localStorage** → For fast loading in Step 2

**LLM Provider Fallback:**
```
[LLM] Available providers: OPENAI, ANTHROPIC
[LLM] Attempting providers in order: openai → anthropic
[LLM] Trying OPENAI...
[LLM] OpenAI: ✅ Success (1234 tokens)
```

If OpenAI fails:
```
[LLM] Trying OPENAI...
[LLM] ❌ OPENAI failed: Rate limit exceeded
[LLM] Trying ANTHROPIC...
[LLM] Anthropic: ✅ Success (1234 tokens)
[LLM] ✅ Success with ANTHROPIC
```

### Step 2: Risk Assessment

**User Actions:**
- View dynamic questions (loaded from database or localStorage)
- Answer questions with status: `addressed`, `partially_addressed`, `not_addressed`, `not_applicable`
- Add notes for each question
- Optionally set custom risk scores

**Backend Process:**
1. **Load Questions** → From database (`riskNotes.generatedQuestions`) or localStorage
2. **Auto-save Responses** → Debounced (500ms) saves to database
   - Saves: `riskQuestionResponses`, `userRiskScores`, `riskNotes`, `additionalRiskElements`
3. **Validation** → Checks system description exists, at least one question answered
4. **Navigate to Step 3** → When validation passes

**Data Saved:**
- `riskQuestionResponses`: `{questionId: {status, notes, lastUpdated}}`
- `userRiskScores`: `{questionId: number}` (optional)
- `riskNotes`: `{questionId: string}` (optional)
- `additionalRiskElements`: Custom risk items

### Step 3: Compliance Assessment

**User Actions:**
- View compliance questions (loaded from database)
- Answer questions with status
- Add notes
- Select jurisdictions

**Backend Process:**
1. **Load Questions** → From database (`complianceNotes.generatedQuestions`)
2. **Auto-save Responses** → Debounced saves to database
   - Saves: `complianceQuestionResponses`, `complianceUserScores`, `complianceNotes`, `jurisdictions`
3. **Validation** → Checks at least one jurisdiction selected, questions answered
4. **Submit Assessment** → When user clicks "Submit"

**Data Saved:**
- `complianceQuestionResponses`: `{questionId: {status, notes, lastUpdated}}`
- `complianceUserScores`: `{questionId: number}` (optional)
- `complianceNotes`: `{questionId: string}` (optional)
- `jurisdictions`: `['US', 'EU']`
- `regulationIds`: `['GDPR', 'SOC2']`

### Step 4: Submit & Score Calculation

**Backend Process:**
1. **Load All Data** → Questions + responses from database
2. **Calculate Weighted Risk Score**:
   ```
   riskScore = Σ(responseScore × questionWeight) / Σ(questionWeight)
   
   Where:
   - responseScore: addressed=20, partially_addressed=50, not_addressed=80
   - questionWeight: From LLM + evidence + industry (0-1 scale)
   ```
3. **Calculate Weighted Compliance Score**:
   ```
   complianceScore = Σ(responseScore × questionWeight) / Σ(questionWeight)
   
   Where:
   - responseScore: addressed=80, partially_addressed=50, not_addressed=20 (inverted)
   - questionWeight: From LLM + evidence + industry
   ```
4. **Calculate Sengol Score**:
   ```
   riskHealth = 100 - riskScore
   sengolScore = (riskHealth × 0.6) + (complianceScore × 0.4)
   ```
5. **Calculate Letter Grade**:
   ```
   A: 90-100, B: 80-89, C: 70-79, D: 60-69, F: 0-59
   ```
6. **Save Scores** → Database (`riskScore`, `complianceScore`, `sengolScore`, `letterGrade`)
7. **Navigate to Results** → `/review/${id}/results`

## Data Persistence

### Step 1 Data
- `systemDescription` (Text)
- `industry` (String)
- `systemCriticality` (String)
- `dataTypes` (String[])
- `dataSources` (String[])
- `technologyStack` (String[])
- `selectedDomains` (String[])
- `jurisdictions` (String[])
- `riskNotes.generatedQuestions` (JSON) - Risk questions with weights
- `complianceNotes.generatedQuestions` (JSON) - Compliance questions with weights

### Step 2 Data
- `riskQuestionResponses` (JSON) - User answers
- `userRiskScores` (JSON) - Optional custom scores
- `riskNotes` (JSON) - User notes per question
- `additionalRiskElements` (JSON) - Custom risk items

### Step 3 Data
- `complianceQuestionResponses` (JSON) - User answers
- `complianceUserScores` (JSON) - Optional custom scores
- `complianceNotes` (JSON) - User notes per question
- `jurisdictions` (String[]) - Selected jurisdictions
- `regulationIds` (String[]) - Applicable regulations

### Submit Data
- `riskScore` (Decimal) - Weighted risk score (0-100)
- `complianceScore` (Decimal) - Weighted compliance score (0-100)
- `sengolScore` (Decimal) - Final composite score (0-100)
- `letterGrade` (String) - A, B, C, D, F

## LLM Provider Configuration

### Required Environment Variables

Set at least one (more = better reliability):

```bash
# Primary (recommended)
OPENAI_API_KEY=sk-...

# Secondary fallback
ANTHROPIC_API_KEY=sk-ant-...

# Tertiary fallback (optional)
GEMINI_API_KEY=...
```

### Provider Priority

1. **OpenAI** (Priority 1) - Fast, reliable, cost-effective
2. **Anthropic** (Priority 2) - High quality, good for complex analysis
3. **Gemini** (Priority 3) - Alternative option

### Automatic Fallback

- If OpenAI fails → Tries Anthropic
- If Anthropic fails → Tries Gemini
- If all fail → Returns detailed error with all provider errors

## Error Handling

### LLM Failures

**Single Provider Failure:**
- Automatically tries next provider
- Logs which provider was used
- User sees no interruption

**All Providers Fail:**
- Returns detailed error message
- Lists all provider errors
- Frontend shows user-friendly message
- User can continue with static questions (fallback)

### Question Generation Failures

**Partial Failure:**
- Some questions generated, some failed
- Returns successfully generated questions
- Logs failures for debugging

**Complete Failure:**
- Frontend falls back to static questions
- User can still complete assessment
- Error logged for monitoring

## Monitoring

### Logs to Watch

1. **Provider Status:**
   ```
   [LLM] Available providers: OPENAI, ANTHROPIC
   ```

2. **Provider Selection:**
   ```
   [LLM] Trying OPENAI...
   [LLM] OpenAI: ✅ Success (1234 tokens)
   ```

3. **Fallback Events:**
   ```
   [LLM] ❌ OPENAI failed: Rate limit exceeded
   [LLM] Trying ANTHROPIC...
   ```

4. **Question Generation:**
   ```
   [LLM_QUESTION] Generated: "..." (Priority: 85, Provider: openai)
   ```

5. **Score Calculation:**
   ```
   [WEIGHT_CALC] "Access Control": base=85%, evidence=78%, industry=90%, final=84%
   ```

## Testing Checklist

- [ ] Step 1: System description saves correctly
- [ ] Step 1: Questions generate using multi-provider LLM
- [ ] Step 1: Questions saved to database with weights
- [ ] Step 2: Questions load from database
- [ ] Step 2: Responses save correctly
- [ ] Step 2: Validation works (system description check)
- [ ] Step 3: Compliance questions load
- [ ] Step 3: Compliance responses save correctly
- [ ] Submit: Weighted scores calculate correctly
- [ ] Submit: Scores saved to database
- [ ] Results: Scores display correctly
- [ ] Fallback: Works when primary provider fails
- [ ] Data persistence: All data reloads when navigating back

