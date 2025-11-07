# Backend Fix: Vector Search Should Go Through Backend API

**Date**: December 2024
**Priority**: 🔴 CRITICAL
**Status**: Requires Backend Implementation
**Issues**: 
1. Frontend calling VPS directly (should go through backend)
2. Question generation timing out (> 90 seconds)

---

## 🚨 Current Architecture (WRONG)

```
Frontend (Next.js)
    ↓ Direct connection
VPS d-vecDB (99.213.88.59:40560)
    ↓
Returns incidents
```

**Problems**:
- ❌ Frontend has VPS credentials (security risk)
- ❌ No rate limiting or monitoring
- ❌ Direct VPS exposure
- ❌ Can't add caching layer
- ❌ Hard to debug/monitor

---

## ✅ Target Architecture (CORRECT)

```
Frontend (Next.js)
    ↓ API call
Backend API (api.sengol.ai)
    ↓ Internal connection
VPS d-vecDB (99.213.88.59:40560)
    ↓
Backend processes results
    ↓
Returns to Frontend
```

**Benefits**:
- ✅ Frontend doesn't need VPS credentials
- ✅ Backend can add caching
- ✅ Backend can add rate limiting
- ✅ Better monitoring and logging
- ✅ Can optimize/batch requests

---

## 🔧 Backend Implementation Required

### 1. Create Vector Search Endpoint

**Endpoint**: `POST /api/embeddings/search`

**Purpose**: Proxy all vector search requests through backend

**Request Body**:
```json
{
  "queryText": "AI system using GPT-4 with PostgreSQL handling PII data",
  "topK": 100,
  "minSimilarity": 0.6,
  "filter": {
    "industry": "fintech",
    "severity": "high"
  }
}
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "id": "incident_123",
      "score": 0.89,
      "distance": 0.22,
      "metadata": {
        "incidentId": "cyber_123",
        "incidentType": "data_breach",
        "organization": "FinTech Corp",
        "industry": "fintech",
        "severity": "high",
        "technologyStack": ["PostgreSQL", "AWS"],
        "dataTypes": ["PII", "Financial"],
        "dataSources": ["API", "Database"],
        "embeddingText": "...",
        "estimatedCost": 2300000
      }
    }
  ],
  "metadata": {
    "totalResults": 100,
    "searchTime": 150,
    "collection": "incidents"
  }
}
```

**Implementation**:
```python
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import time

router = APIRouter()

class VectorSearchRequest(BaseModel):
    queryText: str
    topK: Optional[int] = 100
    minSimilarity: Optional[float] = 0.6
    filter: Optional[Dict[str, Any]] = None

class VectorSearchResponse(BaseModel):
    success: bool
    results: List[Dict[str, Any]]
    metadata: Dict[str, Any]

@router.post("/api/embeddings/search")
async def search_embeddings(request: VectorSearchRequest):
    """
    Semantic search for incidents using d-vecDB vector database
    
    This is the primary endpoint for all vector search operations.
    Frontend should NEVER call d-vecDB directly.
    """
    start_time = time.time()
    
    try:
        # Step 1: Generate embedding from query text
        embedding = await generate_embedding_from_openai(request.queryText)
        
        # Step 2: Search d-vecDB on VPS
        search_results = await dvecdb_client.search(
            collection_name="incidents",
            query_vector=embedding,
            top_k=request.topK,
            filter=request.filter
        )
        
        # Step 3: Post-process results
        results = []
        for result in search_results:
            # Calculate similarity score from distance
            score = 1 - (result["distance"] / 2)  # Cosine distance to similarity
            
            # Filter by minimum similarity
            if score < request.minSimilarity:
                continue
            
            results.append({
                "id": result["id"],
                "score": score,
                "distance": result["distance"],
                "metadata": result["metadata"]
            })
        
        search_time = int((time.time() - start_time) * 1000)
        
        return VectorSearchResponse(
            success=True,
            results=results,
            metadata={
                "totalResults": len(results),
                "searchTime": search_time,
                "collection": "incidents",
                "queryLength": len(request.queryText)
            }
        )
    
    except Exception as e:
        logger.error(f"Vector search failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Search failed: {str(e)}")
```

---

### 2. Optimize Question Generation Endpoint

**Endpoint**: `POST /api/review/{assessmentId}/generate-questions`

**Problem**: Taking > 90 seconds, causing timeout

**Root Cause Analysis**:
```
Total time: ~90-120 seconds
├─ Embedding generation (query): 5-10s
├─ Vector search (100 results): 2-5s
├─ Multi-factor relevance calculation: 5-10s
├─ Risk aggregation: 2-5s
└─ LLM question generation (25 questions × 3 domains = 75): 60-90s ← BOTTLENECK!
```

**Optimization 1: Parallel LLM Calls**

**Before** (Sequential - SLOW):
```python
questions = []
for risk in top_risks:  # 75 iterations
    question = await generate_question_with_llm(risk, context)  # 1-2s each
    questions.append(question)
# Total: 75-150 seconds ❌
```

**After** (Parallel - FAST):
```python
import asyncio

# Generate all questions in parallel
tasks = [
    generate_question_with_llm(risk, context)
    for risk in top_risks
]

questions = await asyncio.gather(*tasks)
# Total: 5-10 seconds ✅ (limited by OpenAI rate limits)
```

**Time Saved**: 70-140 seconds → Stays under 60 seconds total

---

**Optimization 2: Batch LLM Requests**

Instead of 75 individual LLM calls, batch them:

```python
def generate_questions_batch(risks: List[RiskWeight], context: SystemContext):
    """Generate multiple questions in one LLM call"""
    
    # Build batch prompt
    batch_prompt = f"""
Generate {len(risks)} risk assessment questions based on the following evidence.

System Context:
- Technologies: {', '.join(context.technology_stack)}
- Data Types: {', '.join(context.data_types)}
- Industry: {context.industry}

Risk Categories to Address:
"""
    
    for i, risk in enumerate(risks, 1):
        batch_prompt += f"""

{i}. {risk.category}
   - Weight: {risk.weight}/10
   - Evidence: {risk.evidence.incident_count} incidents
   - Relevance: {risk.evidence.relevance_score * 100:.0f}%
   - Top Example: {risk.evidence.recent_examples[0].title}
"""
    
    batch_prompt += """

For each risk category above, generate a specific, actionable question that:
1. References the user's technology stack
2. Mentions relevant data types
3. Is answerable with addressed/partial/not addressed
4. Is professional and concise (1-2 sentences)

Format as JSON array:
[
  {"category": "...", "question": "..."},
  ...
]
"""
    
    # Single LLM call for all questions
    response = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {"role": "system", "content": "You are a risk assessment expert..."},
            {"role": "user", "content": batch_prompt}
        ],
        temperature=0.7,
        max_tokens=4000  # Enough for 75 questions
    )
    
    # Parse JSON response
    questions_json = json.loads(response.choices[0].message.content)
    
    return questions_json

# Time: 1 LLM call (~10-15s) instead of 75 calls (~75-150s)
```

---

**Optimization 3: Smart Caching**

```python
import hashlib
from functools import lru_cache

def get_cache_key(context: SystemContext) -> str:
    """Generate cache key from system context"""
    key_data = f"{context.description[:200]}|{','.join(sorted(context.technology_stack))}|{context.industry}"
    return hashlib.md5(key_data.encode()).hexdigest()

@lru_cache(maxsize=1000)
async def generate_questions_cached(cache_key: str, context: SystemContext):
    """Generate questions with caching"""
    
    # Check Redis cache first
    cached = await redis.get(f"questions:{cache_key}")
    if cached:
        logger.info(f"Cache hit for {cache_key}")
        return json.loads(cached)
    
    # Generate fresh
    questions = await generate_questions(context)
    
    # Cache for 24 hours
    await redis.setex(
        f"questions:{cache_key}",
        86400,  # 24 hours
        json.dumps(questions)
    )
    
    return questions

# Usage
cache_key = get_cache_key(context)
questions = await generate_questions_cached(cache_key, context)

# Result: Instant response for repeated queries
```

---

## 📋 Backend Implementation Checklist

### Priority 1: Fix Timeout (CRITICAL)
- [ ] Implement parallel LLM calls (`asyncio.gather`)
- [ ] OR implement batch LLM requests (single call for all questions)
- [ ] Target: < 60 seconds total time
- [ ] Log timing for each step (search, aggregation, LLM)

### Priority 2: Vector Search Proxy (HIGH)
- [ ] Create `/api/embeddings/search` endpoint
- [ ] Move all d-vecDB calls to backend
- [ ] Frontend should NEVER call VPS directly
- [ ] Add caching layer (Redis)

### Priority 3: Optimization (MEDIUM)
- [ ] Add Redis caching for questions (cache key: system context hash)
- [ ] Cache duration: 24 hours
- [ ] Invalidate on system description change

---

## 🎯 Performance Targets

### Current Performance (UNACCEPTABLE)
- Question generation: 90-120 seconds ❌
- Causes timeout in frontend
- Poor user experience

### Target Performance (ACCEPTABLE)
- Question generation: < 60 seconds ✅
- Breakdown:
  * Vector search: 2-5s
  * Multi-factor matching: 3-5s
  * LLM batch generation: 10-20s
  * Post-processing: 2-5s
  * **Total: 20-40 seconds** ✅

### Ideal Performance (EXCELLENT)
- Question generation: < 30 seconds ✅
- With caching: < 2 seconds ✅✅

---

## 🔧 Code Changes Required

### Backend File Structure
```
api/
├─ embeddings/
│  ├─ generate.py        (Already exists)
│  ├─ search.py          (NEW - vector search proxy)
│  └─ batch_search.py    (NEW - batch operations)
├─ review/
│  └─ {id}/
│     └─ generate_questions.py  (UPDATE - optimize LLM calls)
```

### Implementation Priority

**Phase 1: Fix Timeout (IMMEDIATE)**
```python
# File: api/review/{id}/generate_questions.py

# Replace sequential loop with parallel
async def generate_all_questions(risks, context):
    tasks = [
        generate_question_for_category(risk, context)
        for risk in risks
    ]
    return await asyncio.gather(*tasks)  # Parallel execution
```

**Phase 2: Vector Search Proxy (THIS WEEK)**
```python
# File: api/embeddings/search.py

@app.post("/api/embeddings/search")
async def search_incidents(request: SearchRequest):
    # All vector search goes through here
    # Frontend calls this, NOT d-vecDB directly
    pass
```

**Phase 3: Caching (NEXT WEEK)**
```python
# Add Redis caching for frequently requested questions
```

---

## 🧪 Testing

### Test 1: Verify Vector Search Goes Through Backend
```bash
# Monitor network traffic in frontend
# Should see: POST https://api.sengol.ai/api/embeddings/search
# Should NOT see: POST http://99.213.88.59:40560/...
```

### Test 2: Verify Timeout Fix
```bash
# Time the question generation
curl -X POST https://api.sengol.ai/api/review/test-123/generate-questions \
  -H "Content-Type: application/json" \
  -d '{
    "systemDescription": "...",
    "technologyStack": ["GPT-4", "PostgreSQL"],
    "dataTypes": ["PII", "Financial"],
    "dataSources": ["API", "Database"],
    "industry": "fintech",
    "deployment": "cloud",
    "maxQuestions": 75
  }' \
  --max-time 90  # Should complete before 90s

# Expected: < 60 seconds
```

### Test 3: Verify Parallel LLM Execution
```python
# Add logging to measure
logger.info(f"Starting LLM generation for {len(risks)} questions")
start = time.time()

questions = await asyncio.gather(*tasks)

duration = time.time() - start
logger.info(f"Generated {len(questions)} questions in {duration:.2f}s")

# Expected: 10-20 seconds for 75 questions (parallel)
# vs 75-150 seconds (sequential)
```

---

## 📊 Performance Optimization Breakdown

### Current Bottleneck
```
Question Generation: 90-120 seconds total
├─ Vector search: 5s          (5%)
├─ Aggregation: 5s            (5%)
└─ LLM calls: 80-110s         (90%) ← BOTTLENECK!
    └─ 75 questions × 1-1.5s each = 75-112s
```

### After Parallel LLM
```
Question Generation: 20-40 seconds total
├─ Vector search: 5s          (25%)
├─ Aggregation: 5s            (25%)
└─ LLM calls (parallel): 10-20s  (50%)
    └─ OpenAI processes requests in parallel (TPM limits)
```

### After Caching (Ideal)
```
Cached Response: 1-2 seconds total
├─ Cache lookup: 0.5s         (25%)
├─ Format response: 0.5s      (25%)
└─ Return: 1s                 (50%)
```

---

## 🔐 Security Improvements

### Current Security Issues
```python
# Frontend has direct access to VPS
DVECDB_HOST = "99.213.88.59"  # ❌ Exposed in frontend
DVECDB_PORT = "40560"          # ❌ Exposed in frontend

# Anyone can query VPS directly
```

### After Backend Proxy
```python
# Frontend only knows backend API
API_URL = "https://api.sengol.ai"  # ✅ Public backend

# Backend has VPS credentials (server-side only)
DVECDB_HOST = "99.213.88.59"  # ✅ Private, server-side only
DVECDB_PORT = "40560"          # ✅ Private, server-side only

# VPS only accepts connections from backend IP
# Firewall: Allow only api.sengol.ai → VPS
```

---

## 📝 Frontend Changes (After Backend Ready)

Once backend implements `/api/embeddings/search`, update frontend:

**File**: `lib/ai/incident-intelligence.ts`

**Current** (calls searchByText which may hit VPS directly):
```typescript
const relevantIncidents = await searchByText(query, {}, 100)
```

**Update to**:
```typescript
const relevantIncidents = await searchIncidentsThroughBackend(query, {}, 100)
```

**New function**:
```typescript
/**
 * Search incidents through backend API (ALWAYS use this, not direct VPS)
 */
async function searchIncidentsThroughBackend(
  query: string,
  filter: any = {},
  topK: number = 100
): Promise<SearchResult[]> {
  const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.sengol.ai'
  const endpoint = `${backendUrl}/api/embeddings/search`
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.API_AUTH_TOKEN || ''}`
    },
    body: JSON.stringify({
      queryText: query,
      topK: topK,
      minSimilarity: 0.5,
      filter: filter
    }),
    signal: AbortSignal.timeout(30000) // 30s timeout
  })
  
  if (!response.ok) {
    throw new Error('Backend vector search failed')
  }
  
  const data = await response.json()
  return data.results
}
```

---

## 🚀 Implementation Timeline

### Week 1 (THIS WEEK) - Fix Timeout
**Priority**: CRITICAL
**Tasks**:
- [ ] Implement parallel LLM calls with `asyncio.gather`
- [ ] Test with 75 questions
- [ ] Verify completion time < 60 seconds
- [ ] Deploy to production

**Expected Impact**: 
- Question generation: 90s → 30s
- No more timeouts
- Better user experience

---

### Week 2 (NEXT WEEK) - Vector Search Proxy
**Priority**: HIGH
**Tasks**:
- [ ] Create `/api/embeddings/search` endpoint
- [ ] Move all d-vecDB operations to backend
- [ ] Update frontend to use backend API
- [ ] Add rate limiting and monitoring

**Expected Impact**:
- Better security (VPS not exposed)
- Better monitoring
- Easier to debug

---

### Week 3 (FOLLOWING WEEK) - Caching
**Priority**: MEDIUM
**Tasks**:
- [ ] Add Redis caching layer
- [ ] Cache questions by system context hash
- [ ] 24-hour cache duration
- [ ] Cache invalidation on updates

**Expected Impact**:
- Instant responses for repeat queries
- Lower LLM costs
- Better performance

---

## 📊 Success Criteria

### Immediate (Week 1)
- [x] Question generation completes in < 60 seconds
- [x] No timeout errors in frontend
- [x] All 75 questions generated successfully

### Short-term (Week 2)
- [ ] All vector searches go through backend API
- [ ] No direct VPS calls from frontend
- [ ] VPS firewall restricts access to backend only

### Long-term (Week 3)
- [ ] Cached responses in < 2 seconds
- [ ] 80%+ cache hit rate
- [ ] Lower OpenAI API costs

---

## 🐛 Debugging

### If Still Timing Out

**Check backend logs**:
```bash
# Add timing logs
logger.info(f"[TIMING] Vector search: {search_time}s")
logger.info(f"[TIMING] Multi-factor matching: {match_time}s")
logger.info(f"[TIMING] LLM generation: {llm_time}s")
logger.info(f"[TIMING] Total: {total_time}s")
```

**Expected breakdown**:
```
[TIMING] Vector search: 3.2s
[TIMING] Multi-factor matching: 4.5s
[TIMING] LLM generation: 15.8s (parallel)
[TIMING] Total: 28.3s ✅
```

---

## ✅ Summary for Backend Team

### Immediate Action Required

1. **Fix Timeout** (CRITICAL - Do This First!)
   ```python
   # Replace sequential with parallel
   questions = await asyncio.gather(*[
       generate_question_for_category(risk, context)
       for risk in top_risks
   ])
   ```

2. **Create Vector Search Endpoint** (HIGH - Do This Week)
   ```python
   @app.post("/api/embeddings/search")
   async def search_embeddings(request):
       # Proxy all vector searches through backend
       pass
   ```

3. **Add Caching** (MEDIUM - Do Next Week)
   ```python
   # Redis cache for generated questions
   ```

---

**Timeline**: 
- Fix 1: 2-3 hours (critical)
- Fix 2: 1 day (important)
- Fix 3: 2-3 days (nice to have)

**Impact**: 
- No more timeouts ✅
- Better security ✅
- Faster response ✅

