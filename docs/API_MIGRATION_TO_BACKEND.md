# API Migration to Backend - Clean Codebase Analysis

**Date**: December 2024  
**Goal**: Identify all API routes that should be moved to `api.sengol.ai` backend for a clean UX-only frontend codebase

---

## Executive Summary

**Current State**: ~50+ API routes in Next.js layer doing business logic, database operations, and calculations  
**Target State**: UX-only frontend with all business logic in `api.sengol.ai` backend  
**Migration Opportunity**: **High** - Significant opportunity to clean up codebase

---

## Categories of API Routes

### 1. ✅ Already Proxying to Backend (Keep as-is)

These routes already proxy to `api.sengol.ai` and should remain as thin proxies:

| Route | Status | Notes |
|-------|--------|-------|
| `POST /api/review/analyze-system` | ✅ Proxying | Thin proxy, keep as-is |
| `POST /api/review/[id]/generate-questions` | ✅ Proxying | Thin proxy, keep as-is |
| `POST /api/review/[id]/save-questions` | ✅ Proxying | Thin proxy, keep as-is |
| `POST /api/embeddings/generate` | ✅ Proxying | Thin proxy, keep as-is |
| `POST /api/embeddings/batch-generate` | ✅ Proxying | Thin proxy, keep as-is |
| `POST /api/embeddings/search` | ✅ Proxying | Thin proxy, keep as-is |
| `POST /api/projects/[id]/quick-assessment` | ✅ Proxying | Thin proxy, keep as-is |

**Action**: No changes needed - these are already clean proxies.

---

### 2. 🔴 High Priority - Move to Backend (Core Business Logic)

These routes contain **critical business logic** and should be moved to backend:

#### Assessment Management

| Route | Current Logic | Should Move To |
|-------|--------------|----------------|
| `POST /api/review/start` | Creates assessment, checks limits, validates project | `POST /api/assessments` |
| `GET /api/review/[id]` | Fetches assessment with all data | `GET /api/assessments/[id]` |
| `PUT /api/review/[id]/step1` | Saves system description, validates data | `PUT /api/assessments/[id]/step1` |
| `PUT /api/review/[id]/step2` | **Calculates risk scores**, saves responses | `PUT /api/assessments/[id]/step2` |
| `PUT /api/review/[id]/step3` | **Calculates compliance scores**, saves responses | `PUT /api/assessments/[id]/step3` |
| `POST /api/review/[id]/submit` | **Calculates final Sengol score**, finds incidents | `POST /api/assessments/[id]/submit` |
| `GET /api/review/[id]/scores` | Fetches risk/compliance scores | `GET /api/assessments/[id]/scores` |

**Why Move**: These contain core product features (score calculation, assessment management) that belong in backend.

#### Score Calculations

| Route | Current Logic | Should Move To |
|-------|--------------|----------------|
| `POST /api/risk/calculate-weighted-score` | Calculates weighted risk scores | `POST /api/scores/risk/calculate` |
| `POST /api/risk/assess` | Creates risk assessment, checks limits | `POST /api/risk-assessments` |
| `POST /api/compliance/assessments` | Creates compliance assessment, checks limits | `POST /api/compliance-assessments` |

**Why Move**: Core scoring logic should be in backend for consistency and testability.

#### Evidence & Intelligence

| Route | Current Logic | Should Move To |
|-------|--------------|----------------|
| `GET /api/assessment/[id]/benchmark` | **Calculates industry benchmarks** from d-vecDB | `GET /api/assessments/[id]/benchmark` |
| `GET /api/assessment/[id]/similar-cases` | **Finds similar incidents** from d-vecDB | `GET /api/assessments/[id]/similar-cases` |
| `GET /api/risk/evidence` | Searches incident evidence | `GET /api/evidence/risk` |
| `POST /api/risk/search` | Searches risk intelligence | `POST /api/intelligence/risk/search` |

**Why Move**: These use d-vecDB and LLM calls that should be centralized in backend.

---

### 3. 🟡 Medium Priority - Move to Backend (Data Management)

These routes do CRUD operations and should be moved:

#### Projects

| Route | Current Logic | Should Move To |
|-------|--------------|----------------|
| `GET /api/projects` | Lists projects, calculates Sengol scores | `GET /api/projects` |
| `POST /api/projects` | Creates project, checks limits | `POST /api/projects` |
| `GET /api/projects/[id]` | Gets project details | `GET /api/projects/[id]` |
| `PUT /api/projects/[id]` | Updates project | `PUT /api/projects/[id]` |
| `DELETE /api/projects/[id]` | Deletes project | `DELETE /api/projects/[id]` |

**Why Move**: Standard CRUD operations belong in backend.

#### Calculations & Frameworks

| Route | Current Logic | Should Move To |
|-------|--------------|----------------|
| `GET /api/calculations` | Lists ROI calculations | `GET /api/calculations` |
| `POST /api/calculations` | Creates ROI calculation, checks limits | `POST /api/calculations` |
| `GET /api/calculations/[id]` | Gets calculation details | `GET /api/calculations/[id]` |
| `GET /api/frameworks` | Lists Build vs Buy frameworks | `GET /api/frameworks` |
| `POST /api/frameworks` | Creates framework, checks limits | `POST /api/frameworks` |
| `GET /api/frameworks/[id]` | Gets framework details | `GET /api/frameworks/[id]` |

**Why Move**: Data management operations belong in backend.

#### User Management

| Route | Current Logic | Should Move To |
|-------|--------------|----------------|
| `GET /api/user/usage` | **Counts usage**, calculates limits | `GET /api/user/usage` |
| `GET /api/user/subscription` | Gets subscription details | `GET /api/user/subscription` |
| `GET /api/user/subscription-status` | Gets subscription status | `GET /api/user/subscription-status` |

**Why Move**: Usage tracking and subscription management belong in backend.

---

### 4. 🟢 Low Priority - Keep in Frontend (UX/Proxy Only)

These routes are fine to keep in frontend as they're purely UX or thin proxies:

| Route | Purpose | Keep? |
|-------|---------|-------|
| `POST /api/stripe/checkout` | Stripe checkout session | ✅ Keep (frontend proxy) |
| `POST /api/stripe/webhook` | Stripe webhook handler | ✅ Keep (frontend proxy) |
| `POST /api/stripe/portal` | Stripe billing portal | ✅ Keep (frontend proxy) |
| `GET /api/auth/[...nextauth]` | NextAuth handlers | ✅ Keep (frontend auth) |
| `POST /api/auth/register` | User registration | ✅ Keep (or move if backend handles auth) |
| `POST /api/newsletter/subscribe` | Newsletter subscription | ✅ Keep (frontend proxy) |
| `GET /api/health` | Health check | ✅ Keep (frontend monitoring) |

**Why Keep**: These are frontend-specific or already thin proxies.

---

## Migration Plan

### Phase 1: Core Assessment Flow (High Priority)

**Target**: Move all assessment creation, saving, and scoring to backend

1. **Assessment CRUD**
   - `POST /api/review/start` → `POST /api/assessments`
   - `GET /api/review/[id]` → `GET /api/assessments/[id]`
   - `PUT /api/review/[id]/step1` → `PUT /api/assessments/[id]/step1`
   - `PUT /api/review/[id]/step2` → `PUT /api/assessments/[id]/step2`
   - `PUT /api/review/[id]/step3` → `PUT /api/assessments/[id]/step3`
   - `POST /api/review/[id]/submit` → `POST /api/assessments/[id]/submit`

2. **Score Calculations**
   - `POST /api/risk/calculate-weighted-score` → `POST /api/scores/risk/calculate`
   - Move risk/compliance scoring logic to backend

3. **Evidence & Intelligence**
   - `GET /api/assessment/[id]/benchmark` → `GET /api/assessments/[id]/benchmark`
   - `GET /api/assessment/[id]/similar-cases` → `GET /api/assessments/[id]/similar-cases`

**Estimated Effort**: 2-3 weeks  
**Impact**: High - Core product features

### Phase 2: Data Management (Medium Priority)

**Target**: Move all CRUD operations to backend

1. **Projects**
   - `GET /api/projects` → `GET /api/projects`
   - `POST /api/projects` → `POST /api/projects`
   - `GET /api/projects/[id]` → `GET /api/projects/[id]`
   - `PUT /api/projects/[id]` → `PUT /api/projects/[id]`
   - `DELETE /api/projects/[id]` → `DELETE /api/projects/[id]`

2. **Calculations & Frameworks**
   - Move all `/api/calculations/*` routes
   - Move all `/api/frameworks/*` routes

3. **User Management**
   - `GET /api/user/usage` → `GET /api/user/usage`
   - `GET /api/user/subscription` → `GET /api/user/subscription`

**Estimated Effort**: 1-2 weeks  
**Impact**: Medium - Cleaner codebase

### Phase 3: Remaining Features (Low Priority)

**Target**: Move remaining business logic routes

1. **Risk & Compliance**
   - `POST /api/risk/assess` → `POST /api/risk-assessments`
   - `POST /api/compliance/assessments` → `POST /api/compliance-assessments`
   - `GET /api/risk/evidence` → `GET /api/evidence/risk`
   - `POST /api/risk/search` → `POST /api/intelligence/risk/search`

2. **Regulatory Signals**
   - `GET /api/regulatory-signals` → `GET /api/regulatory-signals`
   - Move limit checking to backend

**Estimated Effort**: 1 week  
**Impact**: Low - Nice to have

---

## Implementation Strategy

### For Each Route Being Moved:

1. **Backend Implementation** (in `api.sengol.ai`):
   ```typescript
   // Backend API endpoint
   POST /api/assessments
   {
     name: string
     projectId: string
     // ... other fields
   }
   ```

2. **Frontend Proxy** (thin wrapper):
   ```typescript
   // app/api/review/start/route.ts
   export async function POST(request: NextRequest) {
     const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'https://api.sengol.ai'
     const response = await fetch(`${backendUrl}/api/assessments`, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
         'Authorization': `Bearer ${process.env.API_AUTH_TOKEN}`
       },
       body: JSON.stringify(await request.json())
     })
     return NextResponse.json(await response.json(), { status: response.status })
   }
   ```

3. **Update Frontend Calls**:
   - All frontend code already calls `/api/review/start`
   - No frontend changes needed if proxy maintains same path
   - Or update to call backend directly if preferred

---

## Benefits of Migration

### 1. Clean Codebase
- Frontend becomes UX-only (React components, UI logic)
- No business logic in frontend
- Easier to maintain and test

### 2. Centralized Logic
- All business logic in one place (backend)
- Consistent scoring calculations
- Easier to update and version

### 3. Better Performance
- Backend can optimize database queries
- Caching at API layer
- Better scalability

### 4. Security
- All database access in backend
- Frontend can't accidentally expose DB logic
- Centralized authentication

### 5. Testability
- Backend logic can be unit tested independently
- Frontend can be tested with mock APIs
- Clear separation of concerns

---

## Current State Analysis

### Routes Using Prisma (Database Access)

**Total**: ~40+ routes

**Categories**:
- Assessment management: ~10 routes
- Projects: ~5 routes
- Calculations: ~3 routes
- Frameworks: ~3 routes
- User management: ~5 routes
- Risk/Compliance: ~5 routes
- Evidence/Intelligence: ~5 routes
- Admin: ~5 routes

### Routes Already Proxying

**Total**: ~7 routes

These are already clean and should remain as-is.

---

## Migration Checklist

### High Priority Routes (Phase 1)

- [ ] `POST /api/review/start` → `POST /api/assessments`
- [ ] `GET /api/review/[id]` → `GET /api/assessments/[id]`
- [ ] `PUT /api/review/[id]/step1` → `PUT /api/assessments/[id]/step1`
- [ ] `PUT /api/review/[id]/step2` → `PUT /api/assessments/[id]/step2`
- [ ] `PUT /api/review/[id]/step3` → `PUT /api/assessments/[id]/step3`
- [ ] `POST /api/review/[id]/submit` → `POST /api/assessments/[id]/submit`
- [ ] `GET /api/review/[id]/scores` → `GET /api/assessments/[id]/scores`
- [ ] `GET /api/assessment/[id]/benchmark` → `GET /api/assessments/[id]/benchmark`
- [ ] `GET /api/assessment/[id]/similar-cases` → `GET /api/assessments/[id]/similar-cases`

### Medium Priority Routes (Phase 2)

- [ ] `GET /api/projects` → `GET /api/projects`
- [ ] `POST /api/projects` → `POST /api/projects`
- [ ] `GET /api/projects/[id]` → `GET /api/projects/[id]`
- [ ] `PUT /api/projects/[id]` → `PUT /api/projects/[id]`
- [ ] `DELETE /api/projects/[id]` → `DELETE /api/projects/[id]`
- [ ] `GET /api/calculations` → `GET /api/calculations`
- [ ] `POST /api/calculations` → `POST /api/calculations`
- [ ] `GET /api/frameworks` → `GET /api/frameworks`
- [ ] `POST /api/frameworks` → `POST /api/frameworks`
- [ ] `GET /api/user/usage` → `GET /api/user/usage`

### Low Priority Routes (Phase 3)

- [ ] `POST /api/risk/assess` → `POST /api/risk-assessments`
- [ ] `POST /api/compliance/assessments` → `POST /api/compliance-assessments`
- [ ] `GET /api/risk/evidence` → `GET /api/evidence/risk`
- [ ] `POST /api/risk/search` → `POST /api/intelligence/risk/search`
- [ ] `GET /api/regulatory-signals` → `GET /api/regulatory-signals`

---

## Recommended Next Steps

1. **Start with Phase 1** (Core Assessment Flow)
   - Highest impact on codebase cleanliness
   - Core product features
   - Most visible to users

2. **Create Backend API Endpoints**
   - Implement in `api.sengol.ai`
   - Maintain same request/response structure initially
   - Add comprehensive error handling

3. **Update Frontend to Proxy**
   - Convert existing routes to thin proxies
   - Maintain same API paths (no frontend changes needed)
   - Or update frontend to call backend directly

4. **Test Thoroughly**
   - Ensure all functionality works
   - Test error cases
   - Verify performance

5. **Iterate on Phase 2 & 3**
   - Move remaining routes gradually
   - Monitor for any issues
   - Clean up as you go

---

## Summary

**Total Routes to Migrate**: ~40+ routes  
**Already Clean**: ~7 routes (proxying)  
**Keep in Frontend**: ~10 routes (auth, webhooks, health checks)

**Estimated Total Effort**: 4-6 weeks  
**Impact**: High - Much cleaner codebase, better maintainability

**Recommendation**: Start with Phase 1 (Core Assessment Flow) for maximum impact.

---

**Document Version**: 1.0  
**Last Updated**: December 2024

