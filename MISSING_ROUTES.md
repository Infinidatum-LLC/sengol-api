# Missing Backend Routes

This document tracks routes that the frontend calls but don't exist in the backend yet.

## Critical Missing Routes (High Priority)

### 1. Project Routes ✅ FIXED
- ✅ GET `/api/projects/:id` - Get single project
- ✅ PUT `/api/projects/:id` - Update project
- ✅ DELETE `/api/projects/:id` - Already exists

### 2. Subscription Routes
- ❌ GET `/api/subscription/user/:userId` - Frontend calls this, backend has `/api/auth/subscription/:userId`
  - **Action**: Add alias route or update frontend

### 3. Council Vendor Sub-routes
- ❌ POST `/api/council/vendors/:id/assess` - Trigger vendor assessment
- ❌ GET `/api/council/vendors/:id/scorecard` - Get vendor risk scorecard
- ❌ GET `/api/council/vendors/:id/assessments` - List vendor assessments

### 4. Council Policies Routes
- ❌ GET `/api/council/policies` - List policies
- ❌ POST `/api/council/policies` - Create policy
- ❌ GET `/api/council/policies/:id` - Get policy
- ❌ PUT `/api/council/policies/:id` - Update policy
- ❌ DELETE `/api/council/policies/:id` - Delete policy
- ❌ POST `/api/council/policies/:id/evaluate` - Evaluate policy
- ❌ POST `/api/council/policies/evaluate-all` - Evaluate all policies

### 5. Council Schedules Routes
- ❌ GET `/api/council/schedules` - List schedules
- ❌ POST `/api/council/schedules` - Create schedule
- ❌ GET `/api/council/schedules/:id` - Get schedule
- ❌ PUT `/api/council/schedules/:id` - Update schedule
- ❌ DELETE `/api/council/schedules/:id` - Delete schedule
- ❌ POST `/api/council/schedules/:id/run-now` - Run schedule now

### 6. Council Violations Routes
- ❌ GET `/api/council/violations` - List violations
- ❌ PATCH `/api/council/violations/:id` - Update violation status

### 7. Council Status Route
- ❌ GET `/api/council/status` - Get council module status

## Medium Priority Routes

### 8. Compliance Routes (May be handled by frontend stubs)
- ❌ GET `/api/compliance/jurisdictions`
- ❌ POST `/api/compliance/jurisdictions`
- ❌ GET `/api/compliance/regulations`
- ❌ POST `/api/compliance/regulations`
- ❌ GET `/api/compliance/assessments`
- ❌ POST `/api/compliance/assessments`
- ❌ GET `/api/compliance/assessments/:id`
- ❌ PATCH `/api/compliance/assessments/:id`
- ❌ GET `/api/compliance/profile`
- ❌ POST `/api/compliance/profile`
- ❌ PATCH `/api/compliance/profile`
- ❌ GET `/api/compliance/playbooks`
- ❌ POST `/api/compliance/playbooks`
- ❌ GET `/api/compliance/playbooks/:id`
- ❌ PATCH `/api/compliance/playbooks/:id`
- ❌ GET `/api/compliance/intelligence`
- ❌ GET `/api/compliance/alerts`
- ❌ POST `/api/compliance/alerts`
- ❌ PATCH `/api/compliance/alerts/:id`
- ❌ GET `/api/compliance/[id]/checklist`
- ❌ POST `/api/compliance/[id]/checklist`

### 9. Monitoring Routes (May be handled by frontend stubs)
- ❌ GET `/api/monitoring/alerts`
- ❌ POST `/api/monitoring/alerts`
- ❌ Various monitoring endpoints

### 10. Admin Routes
- ✅ GET `/api/admin/pricing` - Exists
- ✅ POST `/api/admin/pricing/*` - Exists
- ❌ GET `/api/admin/users` - List users
- ❌ GET `/api/admin/regulatory-signals` - List signals
- ❌ POST `/api/admin/regulatory-signals` - Create signal
- ❌ PUT `/api/admin/regulatory-signals` - Update signal
- ❌ DELETE `/api/admin/regulatory-signals` - Delete signal
- ❌ POST `/api/admin/regulatory-signals/bulk` - Bulk operations
- ❌ GET `/api/admin/regulations` - List regulations
- ❌ POST `/api/admin/regulations` - Create regulation

### 11. Analytics Routes
- ❌ POST `/api/analytics/track-upgrade-click` - Track upgrade clicks

## Low Priority / Optional Routes

### 12. Assessment Sub-routes
- ✅ GET `/api/assessments/:id` - Exists
- ✅ POST `/api/assessments/:id/save-progress` - Exists
- ✅ GET `/api/assessments/:id/progress` - Exists
- ❌ POST `/api/assessments/:id/submit` - Submit assessment
- ❌ GET `/api/assessments/:id/scores` - Get scores
- ❌ GET `/api/assessments/:id/benchmark` - Get benchmark
- ❌ GET `/api/assessments/:id/similar-cases` - Get similar cases
- ❌ POST `/api/assessments/:id/step1` - Save step 1
- ❌ POST `/api/assessments/:id/step2` - Save step 2
- ❌ POST `/api/assessments/:id/step3` - Save step 3

### 13. Review Routes
- ✅ POST `/review/analyze-system` - Exists (no /api prefix)
- ✅ POST `/review/:id/generate-questions` - Exists (no /api prefix)
- ✅ PUT `/review/:id/save-questions` - Exists (no /api prefix)
- ❌ POST `/review/:id/incident-analysis` - Get incident analysis
- ❌ POST `/review/start` - Start new assessment

## Implementation Priority

1. **Critical**: Project GET/PUT routes ✅
2. **High**: Council vendor sub-routes (assess, scorecard, assessments)
3. **High**: Council policies routes (full CRUD + evaluate)
4. **High**: Council schedules routes (full CRUD + run-now)
5. **High**: Council violations routes
6. **High**: Council status route
7. **Medium**: Subscription route alias
8. **Medium**: Assessment sub-routes
9. **Low**: Compliance routes (may be frontend-only)
10. **Low**: Monitoring routes (may be frontend-only)
11. **Low**: Admin routes (may be frontend-only)

