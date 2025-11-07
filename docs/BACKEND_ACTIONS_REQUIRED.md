# Backend Actions Required - Quick Reference

**Date**: December 2024
**Status**: 🔴 URGENT - Backend Team Action Required

---

## 🚨 Two Critical Issues

### Issue 1: Question Generation Timeout (90+ seconds)
**Impact**: Users getting stuck on "Generating Questions..." spinner
**Root Cause**: 75 sequential LLM calls taking 75-150 seconds
**Fix**: Make LLM calls parallel

### Issue 2: Frontend Calling VPS Directly
**Impact**: Security risk, no monitoring, hard to debug
**Root Cause**: Frontend has direct d-vecDB VPS credentials
**Fix**: All vector searches through backend API

---

## 🔧 Backend Fixes Required

### Fix 1: Parallel LLM Calls (URGENT - 2-3 hours)

**File**: Backend question generation endpoint

**Change**:
```python
# ❌ CURRENT (Sequential - SLOW)
questions = []
for risk in top_risks:  # 75 iterations
    question = await generate_question_with_llm(risk, context)  # 1-2s each
    questions.append(question)
# Total: 75-150 seconds ❌

# ✅ FIX (Parallel - FAST)
import asyncio

tasks = [
    generate_question_with_llm(risk, context)
    for risk in top_risks
]
questions = await asyncio.gather(*tasks)  # All at once
# Total: 15-25 seconds ✅
```

**Result**: 90s → 30s (3x faster, no more timeouts)

---

### Fix 2: Vector Search API Endpoint (IMPORTANT - 1 day)

**Create New Endpoint**: `POST /api/embeddings/search`

**Quick Implementation**:
```python
@app.post("/api/embeddings/search")
async def search_embeddings(request):
    """
    Proxy for vector search - frontend calls this instead of VPS
    """
    # 1. Generate embedding
    embedding = await generate_embedding(request.queryText)
    
    # 2. Search d-vecDB on VPS (backend-to-VPS, not frontend-to-VPS)
    results = await dvecdb_client.search(
        collection="incidents",
        query_vector=embedding,
        top_k=request.topK
    )
    
    # 3. Return results
    return {
        "success": True,
        "results": results
    }
```

**Result**: Frontend never touches VPS directly

---

## 📋 Quick Action Items

### Today (URGENT)
1. ✅ Implement parallel LLM calls in question generator
2. ✅ Test with 75 questions - should complete in < 60s
3. ✅ Deploy and verify no timeouts

### This Week (IMPORTANT)  
1. ✅ Create `/api/embeddings/search` endpoint
2. ✅ Move d-vecDB operations to backend
3. ✅ Test and deploy

### Next Week (NICE TO HAVE)
1. Add Redis caching for generated questions
2. Cache key: hash of system context
3. 24-hour cache duration

---

## 📊 Expected Results

### Before Fixes
```
User clicks "Save & Continue" in Step 1
    ↓
Spinner shows "Generating Questions..."
    ↓
Waits 90+ seconds
    ↓
❌ TIMEOUT ERROR
```

### After Fixes
```
User clicks "Save & Continue" in Step 1
    ↓
Spinner shows "Generating Questions..."
    ↓
Waits 20-40 seconds
    ↓
✅ SUCCESS - Navigates to Step 2
```

---

## 📄 Detailed Specifications

1. **Performance Fix**: `/docs/BACKEND_FIX_VECTOR_SEARCH_PROXY.md`
   - Parallel LLM implementation
   - Batch processing
   - Caching strategy

2. **Architecture**: `/docs/BACKEND_REDESIGN_QUESTION_GENERATION.md`
   - Multi-factor relevance
   - System context
   - Metadata collection

3. **Question Format**: `/docs/BACKEND_FIX_QUESTION_TEXT_FORMAT.md`
   - Proper question text format
   - Validation rules

---

## 🎯 Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Question generation time | 90-120s ❌ | < 60s ✅ |
| Timeout rate | ~50% ❌ | < 1% ✅ |
| User satisfaction | Low ❌ | High ✅ |
| Frontend→VPS calls | Direct ❌ | Through backend ✅ |

---

## 📞 Contact

Questions? Check:
- `/docs/BACKEND_FIX_VECTOR_SEARCH_PROXY.md` - Full technical spec
- `/docs/ALL_FIXES_SUMMARY.md` - Overall summary

**Priority**: Fix #1 (parallel LLM) is CRITICAL and blocking users!

---

## ✅ Summary

**Backend needs to**:
1. Make LLM calls parallel (fixes timeout) - **URGENT**
2. Create vector search proxy endpoint - **IMPORTANT**
3. Add caching - **NICE TO HAVE**

**Timeline**: 
- Fix 1: 2-3 hours
- Fix 2: 1 day
- Fix 3: 2-3 days

