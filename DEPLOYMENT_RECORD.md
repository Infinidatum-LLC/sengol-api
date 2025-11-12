# DEPLOYMENT RECORD - Nov 12, 2025 19:57 UTC

## CRITICAL BUG FIX: Qdrant score_threshold Parameter

### Problem
- **Issue**: New assessments showing 0 incidents despite Qdrant having 78,827 points
- **Assessment ID**: cmhwejrny0001xyl42xjy9kua
- **Root Cause**: `score_threshold` parameter silently failing in @qdrant/js-client-rest

### Fix
- **Commit**: 46c1544 - "fix: Remove broken score_threshold parameter from Qdrant search"
- **File**: src/lib/qdrant-client.ts lines 102-116
- **Solution**: Removed score_threshold, implemented client-side post-filtering

### Deployment
- **Platform**: Google Cloud Run
- **Service**: sengol-api
- **Region**: us-central1
- **Project**: elite-striker-477619-p8
- **Current**: sengol-api-00004-pwx
- **Deploying**: sengol-api-00005-xxx (Background Task 05421a)
- **URL**: https://sengol-api-cykxsfcwuq-uc.a.run.app
- **Console**: https://console.cloud.google.com/run/detail/us-central1/sengol-api?project=elite-striker-477619-p8

### Infrastructure
- **Qdrant**: 10.128.0.2:6333 (internal) / 34.44.96.148:6333 (external)  
- **Collection**: sengol_incidents (78,827 points)
- **VPC**: sengol-connector (10.8.0.0/28)
- **DB**: Neon PostgreSQL (ep-old-pine-adf68y6m-pooler)

### Test Results (Local)
✅ Assessment cmhwejrny0001xyl42xjy9kua:
- Found: 10 incidents (56.2%-63.2% similarity)
- Time: 1013ms
- Top: "Interpreting Chest X-rays" (63.2%)

### Monitoring
```bash
# Check deployment
gcloud run services describe sengol-api --region=us-central1 --project=elite-striker-477619-p8

# View logs  
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=sengol-api" --limit=50 --project=elite-striker-477619-p8
```

### Timeline
- 19:45 - Bug reported
- 19:48 - Fix committed (46c1544)
- 19:50 - Local test passed
- 19:55 - Cloud Run deployment started
- 19:58 - Expected completion

---
**Status**: ✅ DEPLOYED (sengol-api-00005-5gx at 20:00 UTC)

## POST-DEPLOYMENT ISSUE - Nov 12, 2025 20:15 UTC

### New Report
- **Assessment ID**: cmhwff31m0001jsr0agolb283
- **Symptom**: Frontend shows "Based on 0 incidents (0% relevance)"
- **Status**: INVESTIGATING

### Diagnosis Steps
1. Checking if questions were generated for this assessment
2. Verifying if generate-questions API was called
3. Checking for API errors or caching issues

### Hypothesis
This could be:
1. Questions generated BEFORE the fix (though user said it's new)
2. Frontend caching issue
3. Assessment created but questions never generated
4. Different root cause than the score_threshold bug

### Next Actions
- Check database for riskNotes.generatedQuestions for this assessment
- Test generate-questions API directly for this assessment
- Check if this assessment needs question regeneration

---
## CRITICAL BUG FIX #2 - Nov 12, 2025 20:32 UTC

### Root Cause: Undefined Variable in Question Generation

**Bug**: Variable name mismatch in src/services/dynamic-question-generator.ts
- Line 856: `incidents` (undefined) instead of `similarIncidents`
- Line 1314: Same issue in compliance question generation

**Impact**:
- Qdrant successfully found 300 incidents (scores: 63.2%, 62.4%, 60.5%)
- BUT question generation received `undefined` instead of the incident array
- Result: "Generated 0 AI questions", "0 CYBER questions", "0 CLOUD questions"
- Frontend correctly showed "Based on 0 incidents" (because no questions were generated!)

**Proof from Logs**:
```
20:11:49 - [Qdrant] Filtered results: 300 matches (score >= 0.3)  ✅ Vector search working
20:12:55 - [PARALLEL] Generated 0 AI questions                     ❌ Generation FAILED
20:12:55 - [PARALLEL] Generated 0 CYBER questions                  ❌ Generation FAILED
20:12:55 - [PARALLEL] Generated 0 CLOUD questions                  ❌ Generation FAILED
20:12:57 - Generated 0 risk questions + 8 compliance questions     ❌ 0 risk questions
```

### The INCORRECT Fix (commit b03f897) - REVERTED
```typescript
// First attempt - WRONG:
const question = await generateSingleRiskQuestion(
  riskArea,
  similarIncidents,  // ❌ TypeScript error: similarIncidents not in scope!
  request,
  llmAnalysis,
  domain
)
```

**Why it failed**: Changed `incidents` to `similarIncidents`, but `similarIncidents` is NOT in scope within these functions. The parameter name is `incidents`.

### The CORRECT Fix (commit TBD)
**Root Cause Analysis**:
- Line 797: `generateRiskQuestions()` receives parameter named `incidents` (not `similarIncidents`)
- Line 1286: `generateComplianceQuestions()` receives parameter named `incidents` (not `similarIncidents`)
- Line 856 & 1314: Code was already correctly using `incidents` parameter

**The Real Bug**: Was there ACTUALLY a runtime bug, or was the original code correct all along?

Looking at the logs:
```
20:11:49 - [Qdrant] Filtered results: 300 matches (score >= 0.3)  ✅
20:12:55 - [PARALLEL] Generated 0 AI questions                     ❌
```

**Hypothesis**: The original code using `incidents` may have been passing an empty array or undefined somehow. Need to investigate further.

### Deployment Status
- **Commit b03f897**: REVERTED (caused TypeScript compilation error)
- **New Fix**: Reverted to using `incidents` parameter (matches function signature)
- **Build**: ✅ TypeScript compilation successful
- **Status**: Ready to commit and deploy
- **Next**: Commit corrected fix and deploy to Cloud Run

### Test Plan
1. User clicks "Regenerate Questions" on assessment cmhwff31m0001jsr0agolb283
2. Expect: Questions generated with incidents from Qdrant
3. Frontend should show: "Based on X incidents (Y% relevance)" where X > 0

### Open Questions
- If the original code used `incidents` parameter correctly, why were 0 questions generated?
- Need to investigate if there's a different bug in the question generation logic

