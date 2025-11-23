# Complete Assessment Flow - End-to-End

## Overview

The assessment flow now uses **multi-provider LLM with automatic fallback** for reliable question generation based on system description.

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    STEP 1: System Description               │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  User Input:                                                  │
│  ├─ System Description (100-5000 chars)                       │
│  ├─ Industry (Technology, Healthcare, etc.)                  │
│  ├─ System Criticality (High, Medium, Low)                  │
│  ├─ Data Types (PII, Financial, Health, etc.)                │
│  ├─ Tech Stack (GPT-4, AWS, PostgreSQL, etc.)                │
│  ├─ Selected Domains (AI, Cyber, Cloud)                      │
│  └─ Jurisdictions (US, EU, etc.)                             │
│                                                               │
│  ↓ Save to Database                                          │
│                                                               │
│  Backend Process:                                             │
│  1. Save system description → Database                        │
│  2. Search 78K+ incidents → Qdrant (100 similar incidents)    │
│  3. LLM System Analysis → Multi-provider LLM                 │
│     ├─ Tries: OpenAI → Anthropic → Gemini                    │
│     ├─ Analyzes: System + Incidents                          │
│     └─ Returns: Primary risks, priorities, compliance reqs   │
│  4. Generate Risk Questions → Multi-provider LLM             │
│     ├─ For each risk area: Question + Priority (0-100)       │
│     ├─ Uses incidents for evidence-based weighting           │
│     └─ Calculates: Base (50%) + Evidence (30%) + Industry (20%)│
│  5. Generate Compliance Questions → Multi-provider LLM       │
│  6. Save Questions → Database (riskNotes, complianceNotes)    │
│  7. Store in localStorage → For fast loading                 │
│                                                               │
│  ↓ Navigate to Step 2                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  STEP 2: Risk Assessment                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Load Questions:                                              │
│  ├─ Priority 1: Database (riskNotes.generatedQuestions)      │
│  ├─ Priority 2: localStorage (fallback)                       │
│  └─ Priority 3: Static questions (if no dynamic)            │
│                                                               │
│  User Actions:                                                │
│  ├─ View dynamic questions (with weights)                    │
│  ├─ Answer questions: addressed/partially/not_addressed    │
│  ├─ Add notes per question                                   │
│  └─ Optionally set custom risk scores                        │
│                                                               │
│  Auto-Save (Debounced 500ms):                                │
│  ├─ riskQuestionResponses → Database                         │
│  ├─ userRiskScores → Database                                │
│  ├─ riskNotes → Database                                     │
│  └─ additionalRiskElements → Database                        │
│                                                               │
│  Validation:                                                   │
│  ├─ System description exists (≥50 chars)                    │
│  ├─ Industry selected                                         │
│  ├─ At least one domain selected                             │
│  └─ At least one question answered                           │
│                                                               │
│  ↓ Navigate to Step 3                                         │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              STEP 3: Compliance Assessment                  │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Load Questions:                                              │
│  ├─ Database (complianceNotes.generatedQuestions)           │
│  └─ localStorage (fallback)                                  │
│                                                               │
│  User Actions:                                                │
│  ├─ View compliance questions (with weights)                  │
│  ├─ Answer questions: addressed/partially/not_addressed      │
│  ├─ Add notes per question                                   │
│  ├─ Select jurisdictions (US, EU, etc.)                       │
│  └─ Optionally set custom compliance scores                  │
│                                                               │
│  Auto-Save (Debounced 500ms):                                │
│  ├─ complianceQuestionResponses → Database                  │
│  ├─ complianceUserScores → Database                          │
│  ├─ complianceNotes → Database                               │
│  ├─ jurisdictions → Database                                 │
│  └─ regulationIds → Database                                 │
│                                                               │
│  Validation:                                                   │
│  ├─ At least one jurisdiction selected                       │
│  └─ At least one question answered                           │
│                                                               │
│  ↓ Submit Assessment                                          │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              STEP 4: Submit & Score Calculation              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Backend Process:                                             │
│                                                               │
│  1. Load All Data:                                            │
│     ├─ Questions from riskNotes + complianceNotes            │
│     ├─ Responses from riskQuestionResponses                  │
│     └─ Responses from complianceQuestionResponses           │
│                                                               │
│  2. Calculate Weighted Risk Score:                            │
│     riskScore = Σ(responseScore × questionWeight) / Σ(weights)│
│     ├─ responseScore: addressed=20, partially=50, not=80     │
│     └─ questionWeight: From LLM + evidence + industry        │
│                                                               │
│  3. Calculate Weighted Compliance Score:                      │
│     complianceScore = Σ(responseScore × questionWeight) / Σ(weights)│
│     ├─ responseScore: addressed=80, partially=50, not=20     │
│     └─ questionWeight: From LLM + evidence + industry        │
│                                                               │
│  4. Calculate Sengol Score:                                   │
│     riskHealth = 100 - riskScore                             │
│     sengolScore = (riskHealth × 0.6) + (complianceScore × 0.4)│
│                                                               │
│  5. Calculate Letter Grade:                                  │
│     A: 90-100, B: 80-89, C: 70-79, D: 60-69, F: 0-59        │
│                                                               │
│  6. Save Scores → Database:                                  │
│     ├─ riskScore (Decimal)                                    │
│     ├─ complianceScore (Decimal)                              │
│     ├─ sengolScore (Decimal)                                  │
│     └─ letterGrade (String)                                  │
│                                                               │
│  ↓ Navigate to Results                                        │
└─────────────────────────────────────────────────────────────┘
```

## Multi-Provider LLM Integration

### How It Works

1. **Provider Detection**: System checks which API keys are configured
2. **Priority Ordering**: OpenAI (1) → Anthropic (2) → Gemini (3)
3. **Automatic Fallback**: If primary fails, tries next provider
4. **Unified Interface**: Same code works with all providers

### Example Logs

**Successful Generation:**
```
[LLM] Available providers: OPENAI, ANTHROPIC
[LLM] Provider fallback order: OPENAI → ANTHROPIC
[LLM] Trying OPENAI...
[LLM] OpenAI: ✅ Success (1234 tokens)
[LLM] ✅ Success with OPENAI
[LLM_QUESTION] Generated: "What MFA..." (Priority: 85, Provider: openai)
```

**Fallback Scenario:**
```
[LLM] Available providers: OPENAI, ANTHROPIC
[LLM] Trying OPENAI...
[LLM] ❌ OPENAI failed: Rate limit exceeded
[LLM] Trying ANTHROPIC...
[LLM] Anthropic: ✅ Success (1234 tokens)
[LLM] ✅ Success with ANTHROPIC
[LLM_QUESTION] Generated: "What MFA..." (Priority: 85, Provider: anthropic)
```

## Data Flow

### Step 1 → Step 2
- Questions generated by LLM → Saved to database
- Questions loaded in Step 2 from database or localStorage
- User answers → Saved to `riskQuestionResponses`

### Step 2 → Step 3
- Risk responses saved → Database
- Validation checks → System description, domains, responses
- Navigate to Step 3 → Load compliance questions

### Step 3 → Submit
- Compliance responses saved → Database
- Submit triggers → Score calculation
- Scores calculated → Using weighted formula with question weights
- Scores saved → Database

### Submit → Results
- Scores loaded → From database
- Results displayed → With breakdown and recommendations

## Key Features

✅ **Multi-Provider LLM**: Automatic fallback ensures reliability
✅ **Evidence-Based Weighting**: Uses 78K+ incidents for accurate weights
✅ **Weighted Scoring**: High-weight questions have more impact
✅ **Data Persistence**: All data saved and reloaded correctly
✅ **Cache Busting**: Fresh data always loaded
✅ **Error Handling**: Graceful fallbacks at every step

## Testing

1. **Step 1**: Enter system description → Verify questions generate
2. **Step 2**: Answer questions → Verify responses save
3. **Step 3**: Answer compliance → Verify responses save
4. **Submit**: Verify scores calculate correctly
5. **Navigate Back**: Verify all data reloads correctly

