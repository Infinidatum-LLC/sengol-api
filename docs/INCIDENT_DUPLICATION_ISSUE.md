# Incident Duplication Issue - Root Cause Analysis

**Date**: November 12, 2025
**Issue**: All risk questions are showing the same incidents
**Status**: Identified - Fix Required

---

## Problem Statement

Users are seeing **duplicate incidents across all questions** - the same 15-20 incidents appear for every risk question, regardless of the question's topic (AI security vs. network security vs. data encryption, etc.).

## Root Cause

**Location**: `src/services/dynamic-question-generator.ts`

- **Line 1015** (Risk Questions): `const relevantIncidents = relatedIncidents.slice(0, 20)`
- **Line 1345** (Compliance Questions): `const relevantIncidents = relatedIncidents.slice(0, 15)`

**What's Happening**:
1. The system performs ONE initial vector search based on the system description
2. This returns 100 incidents that are generally relevant to the system
3. **Every question** (both risk and compliance) receives the SAME top 20 incidents from this pool
4. No question-specific filtering is performed

**Example**:
```
Initial search: "AI-powered healthcare app with patient data"
Returns: 100 incidents (mix of AI, healthcare, data breach, etc.)

Question 1: "AI Model Security" → Gets incidents [1-20] (same for all)
Question 2: "Network Firewall" → Gets incidents [1-20] (same for all)
Question 3: "Data Encryption" → Gets incidents [1-20] (same for all)
```

## Why This Was Implemented

This was an **intentional optimization** (see comments on lines 1010-1011):

```typescript
// ✅ OPTIMIZATION: Skip per-question vector search if incidents are provided
// This eliminates 36+ vector searches and speeds up generation by 40-60%
```

**Benefits**:
- **Fast**: Eliminates 30+ individual vector searches per assessment
- **Scalable**: Reduced API costs and latency
- **Performance**: Generation time reduced from ~60s to ~25s

**Trade-offs**:
- **Less accurate**: Questions get generic incidents instead of topic-specific ones
- **Poor UX**: Users see the same incidents repeated for every question
- **Reduced trust**: Appears non-evidence-based when incidents don't match question topics

---

## Solution Options

###  Option 1: Per-Question Vector Search (Most Accurate, Slowest)

**Approach**: Perform a separate Qdrant vector search for each question based on its topic.

**Code Change** (`generateSingleRiskQuestion`):
```typescript
async function generateSingleRiskQuestion(
  priorityArea: { area: string; priority: number; reasoning: string },
  allIncidents: IncidentMatch[], // Rename to clarify it's the full pool
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis,
  domain?: 'ai' | 'cyber' | 'cloud'
): Promise<DynamicQuestion> {

  // 🔍 NEW: Perform question-specific vector search
  console.log(`[VECTOR_SEARCH] Searching for incidents specific to "${priorityArea.area}"...`)

  const questionSpecificIncidents = await findSimilarIncidents({
    query: `${priorityArea.area} security incident vulnerability breach ${request.systemDescription}`,
    limit: 20,
    filters: {
      // Same filters as before
      industry: request.industry,
      techStack: request.techStack,
      dataTypes: request.dataTypes
    }
  })

  // Use question-specific incidents instead of shared pool
  const relevantIncidents = questionSpecificIncidents

  // Rest of the function remains the same...
}
```

**Pros**:
- ✅ Highly accurate - each question gets its most relevant incidents
- ✅ Better user trust - incidents clearly match question topics
- ✅ More diverse incident coverage across questions

**Cons**:
- ❌ Slower: ~40-60 seconds total (vs. current ~25 seconds)
- ❌ Higher costs: 30+ additional Qdrant searches per assessment
- ❌ Higher API latency during peak times

**Estimated Impact**:
- Speed: +40-60 seconds per assessment generation
- Cost: +$0.05-0.10 per assessment (Qdrant API calls)
- Accuracy: +80% question-incident relevance

---

### Option 2: Keyword-Based Filtering (Balanced)

**Approach**: Filter the shared incident pool based on keyword matching against the question topic.

**Code Change**:
```typescript
function filterIncidentsByTopic(
  incidents: IncidentMatch[],
  topic: string
): IncidentMatch[] {
  // Extract keywords from topic
  const keywords = topic.toLowerCase().split(/\s+/).filter(word => word.length > 3)

  // Score each incident based on keyword matches
  const scoredIncidents = incidents.map(incident => {
    const text = `${incident.incidentType} ${incident.attackType} ${incident.embeddingText}`.toLowerCase()
    const matchCount = keywords.filter(keyword => text.includes(keyword)).length

    return {
      incident,
      relevanceScore: matchCount / keywords.length
    }
  })

  // Return top matches (at least 20% keyword match)
  return scoredIncidents
    .filter(item => item.relevanceScore >= 0.2)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 15)
    .map(item => item.incident)
}

// In generateSingleRiskQuestion:
const relevantIncidents = filterIncidentsByTopic(relatedIncidents, priorityArea.area)
```

**Pros**:
- ✅ Fast: No additional vector searches
- ✅ Better than current: Questions get topic-filtered incidents
- ✅ Low cost: No additional API calls

**Cons**:
- ⚠️ Less accurate than full vector search
- ⚠️ Keyword matching can miss semantic relevance
- ⚠️ May return too few incidents for niche topics

**Estimated Impact**:
- Speed: +1-2 seconds (filtering overhead)
- Cost: $0 (no additional API calls)
- Accuracy: +40% question-incident relevance

---

### Option 3: Hybrid Approach (Recommended)

**Approach**: Combine keyword filtering with strategic vector searches for top questions only.

**Code Change**:
```typescript
async function generateSingleRiskQuestion(
  priorityArea: { area: string; priority: number; reasoning: string },
  allIncidents: IncidentMatch[],
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis,
  domain?: 'ai' | 'cyber' | 'cloud',
  questionIndex?: number, // NEW: Track question priority
  totalQuestions?: number  // NEW: Total count
): Promise<DynamicQuestion> {

  // HYBRID: Vector search for top 5 questions, keyword filtering for rest
  const isTopPriority = questionIndex !== undefined && questionIndex < 5

  let relevantIncidents: IncidentMatch[]

  if (isTopPriority) {
    // High-priority questions: Perform dedicated vector search
    console.log(`[HYBRID] Top ${questionIndex + 1} question - performing vector search for "${priorityArea.area}"`)
    relevantIncidents = await findSimilarIncidents({
      query: `${priorityArea.area} ${request.systemDescription}`,
      limit: 20
    })
  } else {
    // Lower-priority questions: Use keyword filtering
    console.log(`[HYBRID] Question ${questionIndex + 1} - using filtered incidents for "${priorityArea.area}"`)
    relevantIncidents = filterIncidentsByTopic(allIncidents, priorityArea.area)
  }

  // Rest remains the same...
}
```

**Pros**:
- ✅ Balanced: Top questions get best accuracy, rest get good-enough filtering
- ✅ Moderate speed: Only 5 additional vector searches
- ✅ Cost-effective: Minimal additional API costs
- ✅ Good UX: Most important questions have perfect incident matches

**Cons**:
- ⚠️ Complexity: More code to maintain
- ⚠️ Inconsistency: Top questions have better incidents than lower questions

**Estimated Impact**:
- Speed: +10-15 seconds (5 vector searches)
- Cost: +$0.01-0.02 per assessment
- Accuracy: +70% for top questions, +40% for others

---

## Recommendation

**Option 3: Hybrid Approach** is recommended because:

1. **Best Balance**: Provides accuracy where it matters most (top 5 questions) without major speed impact
2. **User Experience**: Users see the most critical questions with perfect incident matches
3. **Cost-Effective**: Only 5 additional searches vs. 30+ for full per-question search
4. **Progressive Enhancement**: Can adjust threshold (top 3, top 7, etc.) based on feedback

### Implementation Priority

1. **Quick Win** (1-2 hours): Implement Option 2 (keyword filtering) first
2. **Refinement** (3-4 hours): Upgrade to Option 3 (hybrid) based on results
3. **Future** (optional): Add caching layer to make Option 1 feasible

---

## Testing Recommendations

After implementing the fix:

1. **Generate 3-5 test assessments** with diverse system types
2. **Manually review incident-question mappings** for logical coherence
3. **Measure generation time** before/after
4. **Get user feedback** on incident relevance

---

## Files to Modify

- `src/services/dynamic-question-generator.ts` (lines 1003-1050, 1335-1380)
- Potentially add new helper function in `src/services/incident-search.ts` for filtering

---

## Questions for Product/Engineering

1. What is the acceptable slowdown for improved accuracy? (10s? 20s? 60s?)
2. Is a 5-question hybrid approach sufficient, or should we do all questions?
3. Should we add a feature flag to A/B test different approaches?
4. Do we need to notify users that "question generation may take longer"?
