# Comprehensive Sengol API Architecture Analysis

**Analysis Date:** November 19, 2025
**Repository:** sengol-api (Middleware/Backend API)
**Location:** `/Users/durai/Documents/GitHub/sengol-api`

---

## EXECUTIVE SUMMARY

**Sengol-API** is a Node.js/TypeScript **Fastify-based middleware layer** that serves as the business logic and data access layer for the Sengol platform. It sits between the Next.js frontend and external services (Qdrant, OpenAI, etc.).

**Architecture Pattern:** 3-Tier (Hybrid Approach)
- **Layer 1:** Next.js Frontend (Vercel) → Calls sengol-api
- **Layer 2:** Sengol API (Node.js/Fastify) → This repository
- **Layer 3:** External Services → PostgreSQL (Neon), Qdrant, OpenAI, Google Cloud

**Current Status:** Production-ready with comprehensive trial/subscription system already implemented in the frontend. Backend API is ready for enhancement with hybrid trial system.

---

## 1. MAIN ENTRY POINT AND APPLICATION STRUCTURE

### Entry Point
**File:** `src/app.ts` (172 lines)

**Framework:** Fastify 4.26.0 (lightweight Node.js HTTP framework)

**Server Configuration:**
```typescript
- Port: 4000 (configurable via PORT env var)
- Body limit: 10MB
- Request timeout: 120 seconds (2 minutes)
- Logging: Bunyan-style (configurable level)
- CORS: Configured origins from env
- Security: Helmet.js middleware
- Rate limiting: 100 requests per minute (with Redis support)
```

### Application Startup
1. Builds Fastify instance with plugins
2. Registers route handlers (8 route modules)
3. Sets up global middleware and error handlers
4. Graceful shutdown on SIGTERM/SIGINT
5. Vercel serverless export for Cloud Run deployment

### Route Organization
Routes are modular, registered sequentially:
- `auth.routes.ts` - Authentication (login, register - TODO)
- `health.routes.ts` - Health checks (basic + detailed)
- `review.routes.ts` - Risk assessment reviews
- `projects.routes.ts` - Project management
- `projects-gated.routes.ts` - Gated project operations
- `risk.routes.ts` - Risk analysis
- `assessments.routes.ts` - Assessment management
- `questions.routes.ts` - Question generation
- `compliance.routes.ts` - Compliance responses
- `council.routes.ts` - AI Risk Council (policies, vendors, schedules)

---

## 2. CURRENT API ENDPOINTS

### Health & Status Routes
```
GET  /health                           - Basic health check (fast response)
GET  /health/detailed                 - Detailed health with dependency checks
GET  /api/council/health              - Council API health check
GET  /api/council/status              - Council system status
```

### Authentication Routes (TODO)
```
POST /api/auth/login                  - User login (not implemented)
POST /api/auth/register               - User registration (not implemented)
```

### Review & Assessment Routes
```
POST /api/review/analyze-system              - System analysis for initial setup
POST /api/review/:id/generate-questions     - Generate assessment questions (with incident search)
PUT  /api/review/:id/save-questions         - Save answered questions
POST /api/review/:id/incident-analysis      - Analyze incidents for assessment
POST /api/review/:id/compliance-responses   - Save compliance responses
GET  /api/review/:id/compliance-responses   - Retrieve compliance responses
```

### Project Routes
```
GET  /api/projects                    - List user projects (spec-compliant)
POST /api/projects                    - Create new project (spec-compliant)
GET  /api/projects-list               - Legacy list projects endpoint
POST /api/projects-create             - Legacy create project endpoint
GET  /api/projects-get/:id            - Legacy get project endpoint
PUT  /api/projects-update/:id         - Legacy update project endpoint
DELETE /api/projects-delete/:id       - Legacy delete project endpoint
```

### Risk & Assessment Routes
```
GET  /api/risk/*                      - Risk analysis endpoints
POST /api/assessments/*               - Assessment operations
```

### User Routes
```
GET  /api/user/usage                  - Get user usage summary and limits
```

### AI Risk Council Routes (40+ endpoints)
**Policy Engine:**
```
POST   /api/council/policies                 - Create policy
GET    /api/council/policies                 - List policies (paginated)
GET    /api/council/policies/:id             - Get policy by ID
PUT    /api/council/policies/:id             - Update policy
DELETE /api/council/policies/:id             - Delete policy
POST   /api/council/policies/:id/evaluate    - Evaluate single policy
POST   /api/council/policies/evaluate-all    - Bulk evaluate policies
```

**Vendor Governance:**
```
POST   /api/council/vendors                  - Create vendor
GET    /api/council/vendors                  - List vendors (paginated)
GET    /api/council/vendors/:id              - Get vendor by ID
PUT    /api/council/vendors/:id              - Update vendor
DELETE /api/council/vendors/:id              - Delete vendor
POST   /api/council/vendors/:id/assess       - Assess vendor
GET    /api/council/vendors/:vendorId/assessments/:assessmentId
POST   /api/council/vendors/:id/scorecard    - Create vendor scorecard
GET    /api/council/vendors/:id/scorecards   - List vendor scorecards
```

**Automated Assessment:**
```
POST   /api/council/schedules                - Create assessment schedule
GET    /api/council/schedules                - List schedules (paginated)
GET    /api/council/schedules/:id            - Get schedule by ID
PUT    /api/council/schedules/:id            - Update schedule
DELETE /api/council/schedules/:id            - Delete schedule
POST   /api/council/schedules/:id/run-now    - Execute schedule immediately
```

**Violations:**
```
GET    /api/council/violations               - List violations (paginated, filterable)
PUT    /api/council/violations/:id           - Update violation status
```

### Response Format
**Standard Success Response:**
```typescript
{
  success: true,
  data: { ... },
  pagination?: { total, limit, offset, hasMore }
}
```

**Standard Error Response:**
```typescript
{
  success: false,
  error: string,
  code: string,
  statusCode: number,
  details?: string
}
```

---

## 3. DATABASE INTEGRATION

### Connection Details
- **Provider:** PostgreSQL (Neon Cloud)
- **ORM:** Prisma 5.10.0
- **Connection String:** `DATABASE_URL` environment variable
- **Client Generation:** `npx prisma generate`

### Database Resilience Features
**Custom Resilience Layer:** `lib/prisma-resilient.ts`
- Circuit breaker pattern for database operations
- LRU cache for frequently accessed data (user tier, admin status)
- Automatic retry with exponential backoff
- Health check endpoint
- Fallback defaults on catastrophic failure

**Cached Operations:**
- `getUserTier(userId)` - Get user's pricing tier (cached)
- `isUserAdmin(userId)` - Check admin status (cached)
- `countAssessmentsThisMonth(userId)` - Count monthly assessments (cached)
- `countUserProjects(userId)` - Count user projects (cached)
- `getSubscriptionStatus(userId)` - Get subscription details (cached)

**Cache Configuration:**
- Default TTL: 3600 seconds (1 hour)
- Max cache size: 1000 entries
- Configurable via `CACHE_TTL` and `CACHE_MAX_SIZE` env vars

### User & Subscription Schema

#### User Model
```prisma
model User {
  id                     String    @id
  email                  String    @unique
  password               String?
  name                   String?
  emailVerified          DateTime?
  image                  String?
  role                   String    @default("user")
  company                String?
  jobTitle               String?
  industry               String?
  teamSize               String?
  currentGeographyId     String?   // Multi-tenancy support
  createdAt              DateTime  @default(now())
  updatedAt              DateTime
  
  // Relationships
  Account[]
  ProductAccess[]
  Purchase[]
  ToolSubscription[]
  UserRegulatoryProfile?
  // ... 20+ other relationships
}
```

#### Product Access Model
```prisma
model ProductAccess {
  id             String    @id
  userId         String
  productSlug    String
  productName    String
  accessType     String    // "free", "trial", "paid", "grant"
  status         String    @default("active") // "active", "inactive", "expired"
  expiresAt      DateTime?
  grantedAt      DateTime  @default(now())
  purchaseId     String?
  subscriptionId String?
  
  @@unique([userId, productSlug])
  @@index([status])
}
```

#### Tool Subscription Model
```prisma
model ToolSubscription {
  id               String    @id
  userId           String
  planId           String
  status           String    @default("active")
  amount           Int       @default(5000)
  billingPeriod    String    @default("monthly")
  stripeSubId      String?   @unique
  stripeCustId     String?
  currentPeriodEnd DateTime?
  cancelAt         DateTime?
  createdAt        DateTime  @default(now())
  updatedAt        DateTime
  
  @@unique([userId, planId])
  @@index([status])
  @@index([stripeSubId])
}
```

#### GeographyAccount Model (Multi-tenancy)
```prisma
model GeographyAccount {
  id                 String    @id
  userId             String
  name               String
  jurisdiction       String
  billingStatus      String    @default("active")
  stripeCustomerId   String?   @unique
  stripeSubId        String?   @unique
  tier               String    @default("free")
  projectLimit       Int       @default(3)
  userLimit          Int       @default(5)
  currentPeriodEnd   DateTime?
  trialEnds          DateTime?  // KEY: Trial end date for geography account
  
  @@index([billingStatus])
  @@index([jurisdiction])
}
```

#### Trial & Usage Tracking (Frontend - Sengol)
```prisma
model User {
  trialStartedAt      DateTime?
  trialEndsAt         DateTime?
  trialStatus         String?   // "active", "expired"
  trialEmailsSent      Json?
}

model TrialUsage {
  userId              String    @id
  assessmentCount     Int       @default(0)
  roiCalculatorCount  Int       @default(0)
  buildVsBuyCount     Int       @default(0)
}
```

---

## 4. AUTHENTICATION & AUTHORIZATION

### Current Implementation

**Auth Middleware:** `src/middleware/auth.ts`
- Bearer token validation
- API_AUTH_TOKEN environment variable check
- Two modes: `authMiddleware` (required) and `optionalAuthMiddleware`

**Not Yet Implemented:**
- JWT-based user authentication
- OAuth/SSO integration
- Session management
- Role-based access control (RBAC) beyond basic admin flag

### Feature Gating (Tier-Based Access Control)

**Service:** `src/services/feature-gates.service.ts`

**Key Functions:**
```typescript
checkFeatureAccess(userId, feature: FeatureGateKey)
  -> { hasAccess: boolean, tier: PricingTier, error?: ... }

checkAssessmentLimit(userId)
  -> LimitCheckResult with upgrade suggestions

checkProjectLimit(userId)
  -> LimitCheckResult with upgrade suggestions

getUserUsageSummary(userId)
  -> { tier, limits, usage {...} }

isUserAdmin(userId)  // Bypasses all limits
  -> boolean (cached)

getUserTier(userId)
  -> PricingTier (cached)
```

**Tier System:** `src/lib/pricing.ts`

Four pricing tiers:
1. **Free** - 1 user, 1 assessment/month, 2 projects, limited features
2. **Consultant** - 1 user, 5 assessments/month, 10 projects, $59/month
3. **Professional** - 5 users, 20 assessments/month, unlimited projects, $99/month
4. **Enterprise** - Unlimited users, assessments, projects, API access, $999/month

---

## 5. QDRANT INTEGRATION

### Vector Database Purpose
Stores 50,000+ AI/cyber/cloud incident embeddings for semantic search.

### Qdrant Client:** `src/lib/qdrant-client.ts`

**Configuration (Dual-Mode Support):**
```
Qdrant Cloud Mode:
  - QDRANT_HOST=xxxxx.qdrant.io
  - QDRANT_API_KEY=your-key
  - Uses HTTPS + API authentication

Self-Hosted Mode:
  - QDRANT_HOST=localhost
  - QDRANT_PORT=6333
  - QDRANT_USE_HTTPS=false (optional)
  - No authentication
```

**Collection:** `sengol_incidents`
- Embedding model: `text-embedding-3-small` (OpenAI)
- Embedding dimensions: 1536
- Collection contains incident records with:
  - Text embeddings
  - Incident metadata (type, severity, impact)
  - Industry tags
  - Temporal data

### Incident Search Integration

**Service:** `src/services/incident-search.ts`

**Key Functions:**
```typescript
findSimilarIncidents(
  query: string,
  options?: {
    limit?: number
    minSimilarity?: number
    industry?: string
    excludeIds?: string[]
  }
) -> Promise<IncidentMatch[]>

calculateIncidentStatistics(incidents: IncidentMatch[])
  -> { totalCost, avgCost, affectedSystems, severityDistribution }

findQuestionSpecificIncidents(
  questionId: string,
  systemDescription: string
) -> Promise<IncidentMatch[]>
```

### Vector Search in Question Generation

**Flow:**
1. User provides system description
2. Question generator calls `findSimilarIncidents(description)`
3. Backend searches Qdrant for matching incidents
4. Incidents matched to specific questions
5. Questions populated with evidence from incidents
6. User sees "This incident happened at..." examples

**Performance:**
- Incident search: ~5-10s for 100 results
- Total question generation: 30-120s depending on incident search

---

## 6. TRIAL & SUBSCRIPTION HANDLING

### Frontend Trial System (Already Implemented)

**Location:** `/Users/durai/Documents/GitHub/sengol/lib/trial-manager.ts`

**7-Day Free Trial with Feature Limits:**
- Trial duration: 7 days from EULA acceptance
- Assessment limit: 5 per trial
- ROI Calculator limit: 5 per trial
- Build vs Buy limit: 5 per trial

**Trial Lifecycle:**
```
User registers → EULA acceptance → Trial starts (7 days)
  ↓
Track feature usage → Send milestone emails (day 1, 5, 7, 8)
  ↓
Trial expires → User becomes read-only until upgrade
```

**Milestone Emails:**
- Day 1: Welcome email
- Day 5: Reminder email (2 days left)
- Day 7: Final reminder (last day)
- Day 8: Conversion email (trial expired)

**Trial Status Management:**
- `startTrial(userId)` - Activate trial after EULA
- `isUserInTrial(userId)` - Check active trial status
- `getTrialDaysRemaining(userId)` - Get countdown
- `hasReachedTrialLimit(userId, feature)` - Check feature usage
- `incrementFeatureUsage(userId, feature)` - Track usage
- `expireTrial(userId)` - Mark as expired after 7 days

**Cron Job:** `/api/user/trial/check-expiry`
- Runs daily at midnight (or via manual trigger)
- Marks expired trials
- Sends milestone emails
- Requires `CRON_SECRET` for authorization

### Backend API: What's Missing

**Gap Analysis:**

1. **No trial enforcement in API routes**
   - Questions, assessments, ROI calculator - no trial checks
   - Feature usage not tracked server-side
   - Limits only exist in frontend

2. **No subscription validation**
   - API doesn't check ProductAccess or ToolSubscription
   - No tier-based feature gating in routes
   - Feature gates only used for user usage endpoint

3. **No Stripe integration**
   - Webhook handling missing
   - Subscription creation/update missing
   - Payment processing missing

4. **GeographyAccount trial not implemented**
   - Has `trialEnds` field but never populated
   - Multi-tenancy trial logic missing

---

## 7. EXTERNAL SERVICE INTEGRATIONS

### OpenAI Integration
**Purpose:** LLM analysis for questions and risk assessment
**Service:** `src/lib/openai-client.ts`
**Configuration:**
- `OPENAI_API_KEY` - Required
- `OPENAI_TIMEOUT` - 60 seconds default
- `OPENAI_MAX_RETRIES` - 3 retries
- `OPENAI_BASE_URL` - Optional proxy support

**Usage Patterns:**
- Text embeddings for Qdrant search
- Question generation and refinement
- Risk assessment analysis
- Compliance response analysis

### Google Cloud Integration
**Gemini API Client:** `src/lib/gemini-resilient.ts`
- Resilient client with retries
- Stats tracking
- No actual health checks (expensive API calls)

**Vertex AI:** Removed/disabled (comments indicate historical usage)

### Redis Cache (Optional)
**Purpose:** Rate limiting and distributed caching
**Configuration:**
- `REDIS_URL` - Optional, only used for rate limiting
- Falls back to in-memory cache if not available
- Rate limit: 100 requests/minute

### Neon PostgreSQL
**Purpose:** Primary data store
**Features:**
- Serverless, auto-scaling
- Connection pooling included
- Supports large dataset sizes

---

## 8. REQUEST/RESPONSE PATTERNS

### Standard Response Format

**Success (2xx):**
```typescript
{
  success: true,
  data: { ... },
  pagination?: {
    total: number,
    limit: number,
    offset: number,
    hasMore: boolean
  },
  metadata?: { ... }
}
```

**Error (4xx/5xx):**
```typescript
{
  success: false,
  error: string,
  code: ErrorCode,
  statusCode: number,
  details?: string,
  metadata?: { ... }
}
```

### Error Codes
```
VALIDATION_ERROR (400)    - Input validation failed
AUTHENTICATION_ERROR (401) - Auth token invalid/missing
AUTHORIZATION_ERROR (403)  - Insufficient permissions
NOT_FOUND (404)           - Resource doesn't exist
TIMEOUT_ERROR (408)       - Request took too long
RATE_LIMIT_ERROR (429)    - Too many requests
INTERNAL_ERROR (500)      - Unexpected error
DATABASE_ERROR (500)      - DB operation failed
VECTORDB_ERROR (503)      - Qdrant operation failed
LLM_ERROR (503)           - OpenAI/Gemini failed
CIRCUIT_BREAKER_OPEN (503) - Service temporarily unavailable
```

### API Conventions

**Route Parameters:**
- IDs are always strings
- Pass ID in URL path: `/api/resource/:id`

**Query Parameters:**
- `limit` - Pagination limit (default varies)
- `offset` - Pagination offset (default 0)
- Filters as additional query params

**Request Body:**
- JSON format (max 10MB)
- Schema validation via Zod
- Descriptive error messages on validation failure

**Authentication:**
- Bearer token in `Authorization` header
- Format: `Authorization: Bearer <token>`
- Token is `API_AUTH_TOKEN` from environment

---

## 9. GAP ANALYSIS FOR HYBRID TRIAL SYSTEM

### What Currently Exists

**Frontend (Sengol):**
- ✅ 7-day free trial system (trial-manager.ts)
- ✅ Feature usage tracking (assessment, ROI, Build vs Buy)
- ✅ Trial milestone emails (day 1, 5, 7, 8)
- ✅ Trial expiration check (cron job)
- ✅ Trial Banner in dashboard
- ✅ ProductAccess model for free/trial/paid/grant access

**Backend API (sengol-api):**
- ✅ Pricing tier definitions (4 tiers)
- ✅ Feature gate service for tier-based access
- ✅ User usage summary endpoint
- ✅ Pricing and limit logic
- ✅ Database schema for subscriptions

### What's Missing for Hybrid System

**Priority 1 (Critical):**
1. **API Route Guards**
   - Add trial/subscription checks to question generation
   - Add trial/subscription checks to assessment creation
   - Add trial/subscription checks to compliance features
   - Return 403 with upgrade suggestions when limits exceeded

2. **Trial Enforcement**
   - Check `User.trialStatus` and `User.trialEndsAt` server-side
   - Enforce 5-assessment limit per trial
   - Enforce ROI calculator limit (5/trial)
   - Enforce Build vs Buy limit (5/trial)
   - Validate against `TrialUsage` table

3. **GeographyAccount Trial**
   - Populate `GeographyAccount.trialEnds` on account creation
   - Check trial expiration at account level
   - Support multi-account trials

4. **Subscription Validation**
   - Check `ProductAccess` status before allowing features
   - Check `ToolSubscription` status for tool access
   - Return 403 with Stripe checkout link when upgrade needed

**Priority 2 (Important):**
5. **Stripe Integration**
   - Webhook handlers for subscription events
   - Subscription creation/update/cancel endpoints
   - Payment status tracking

6. **Feature-Specific Gating**
   - PDF export → requires consultant+ tier
   - Excel export → requires consultant+ tier
   - API access → requires enterprise tier
   - Team collaboration → requires professional+ tier

7. **Trial Duration Customization**
   - Support different trial lengths per tier
   - Support different trial feature limits
   - A/B testing for trial lengths

8. **Advanced Metrics**
   - Track feature usage server-side
   - Alert when approaching limits
   - Suggest upgrades based on usage patterns

---

## 10. RECOMMENDATIONS FOR HYBRID TRIAL IMPLEMENTATION

### Architecture Approach

**Option 1: Lightweight (Recommended)**
- Use existing `ProductAccess` model as source of truth
- Add API route guards that check `ProductAccess.status` and `.expiresAt`
- Validate `User.trialStatus` server-side for free trials
- Keep trial counting in frontend (avoid duplicate server tracking)
- Stripe webhooks update `ProductAccess` and `ToolSubscription`

**Option 2: Full Server-Validation**
- Implement server-side trial tracking (duplicate of frontend)
- API enforces all limits independent of frontend
- Requires:
  - Server-side `TrialUsage` tracking
  - Server-side `AssessmentUsage` tracking
  - Server-side feature usage monitoring
  - Higher complexity but more secure

**Recommended:** Option 1 (simpler, less duplication)

### Implementation Steps

**Phase 1: Route Guards (1-2 days)**
1. Create middleware: `auth/trial-check.ts`
2. Create middleware: `auth/subscription-check.ts`
3. Apply to high-value endpoints:
   - `/api/review/:id/generate-questions`
   - `/api/review/:id/incident-analysis`
   - `/api/assessments/*`
4. Return 403 with upgrade info when denied

**Phase 2: Stripe Integration (2-3 days)**
1. Create `POST /api/stripe/webhooks` endpoint
2. Handle events:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Update `ProductAccess` and `ToolSubscription`
4. Create subscription management endpoints

**Phase 3: Enhanced Trial Logic (1-2 days)**
1. Add `/api/trial/status` endpoint
2. Add `/api/trial/usage` endpoint to track server-side
3. Sync with frontend trial-manager
4. Optional: Server-side enforcement of usage limits

**Phase 4: Feature Gating per Route (1 day)**
1. Update route handlers to check feature availability
2. Return meaningful errors with upgrade paths
3. Add feature checks to compliance, ROI, build-vs-buy

### Code Structure

**New Files to Create:**

```typescript
// src/middleware/trial-check.ts
export async function trialGuard(request: FastifyRequest, reply: FastifyReply)
  -> Check User.trialStatus, User.trialEndsAt
  -> Check TrialUsage against limits
  -> Return 403 if trial expired or limit reached

// src/middleware/subscription-check.ts
export async function subscriptionGuard(request: FastifyRequest, reply: FastifyReply)
  -> Check ProductAccess.status for product slug
  -> Check ToolSubscription.status
  -> Check GeographyAccount tier
  -> Return 403 if not active/paid

// src/routes/stripe.routes.ts
fastify.post('/api/stripe/webhooks', stripeWebhookHandler)

// src/services/stripe.service.ts
export async function handleSubscriptionCreated(event)
export async function handleSubscriptionUpdated(event)
export async function handleSubscriptionDeleted(event)

// src/controllers/trial.controller.ts
export async function getTrialStatus(request, reply)
export async function getTrialUsage(request, reply)
```

**Modified Files:**

```typescript
// Update src/routes/review.routes.ts
fastify.post(
  '/api/review/:id/generate-questions',
  { preHandler: [trialGuard, subscriptionGuard] },
  generateQuestionsController
)

// Update src/lib/errors.ts
export class FeatureLimitError extends AppError
export class TrialExpiredError extends AppError
export class SubscriptionRequiredError extends AppError

// Update src/services/feature-gates.service.ts
export async function getTrialStatus(userId)
export async function validateTrialAccess(userId, feature)
export async function enforceSubscription(userId, tier)
```

### Environment Variables Needed

```
# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLIC_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Trial Configuration
TRIAL_DURATION_DAYS=7
TRIAL_ASSESSMENT_LIMIT=5
TRIAL_ROI_LIMIT=5
TRIAL_BUILD_VS_BUY_LIMIT=5

# Feature Gate Config
ENABLE_TRIAL_ENFORCEMENT=true
ENABLE_SUBSCRIPTION_ENFORCEMENT=true
ENABLE_STRIPE_WEBHOOKS=true
```

---

## 11. KEY FILES REFERENCE

### Core Application
- `src/app.ts` - Main Fastify app and route registration
- `src/config/env.ts` - Environment configuration and validation
- `src/lib/errors.ts` - Custom error classes

### Database & Caching
- `src/lib/prisma.ts` - Prisma client singleton
- `src/lib/prisma-resilient.ts` - Database resilience layer with caching
- `src/lib/cache.ts` - Redis cache wrapper
- `src/lib/local-cache.ts` - In-memory LRU cache

### Authentication & Authorization
- `src/middleware/auth.ts` - Bearer token validation
- `src/services/feature-gates.service.ts` - Tier-based access control
- `src/lib/pricing.ts` - Pricing tiers and limits definition

### Vector Search & AI
- `src/lib/qdrant-client.ts` - Qdrant vector database client
- `src/services/incident-search.ts` - Semantic incident search
- `src/lib/openai-client.ts` - OpenAI embeddings and LLM
- `src/lib/gemini-resilient.ts` - Google Gemini API client

### Business Logic
- `src/services/risk.service.ts` - Risk assessment calculations
- `src/services/dynamic-question-generator.ts` - Smart question generation
- `src/services/council-policy.service.ts` - AI Risk Council policies
- `src/services/council-vendor.service.ts` - Vendor governance
- `src/services/council-schedule.service.ts` - Assessment automation

### Controllers (Request Handlers)
- `src/controllers/review.controller.ts` - Assessment review flows
- `src/controllers/council.controller.ts` - Council API handlers
- `src/controllers/user.controller.ts` - User operations
- `src/controllers/projects-gated.controller.ts` - Project management

### Routes (Endpoint Definitions)
- `src/routes/*.routes.ts` - All route definitions (10 files)

### Types
- `src/types/council/*.ts` - Council API type definitions
- `src/types/*.ts` - Other type definitions

### Middleware
- `src/middleware/validation.ts` - Input validation
- `src/middleware/auth.ts` - Authentication
- `src/middleware/request-logging.ts` - Request logging
- `src/middleware/request-timeout.ts` - Timeout handling

---

## 12. DEPLOYMENT & OPERATIONAL NOTES

### Deployment Targets
1. **Vercel (Next.js Frontend)** - Automatic from git push
2. **Google Cloud Run (This API)** - Container deployment
3. **Cloud Functions** - Serverless alternatives (legacy)

### Production Configuration
```
NODE_ENV=production
PORT=4000 (or assigned by Cloud Run)
DATABASE_URL=neon-postgresql-url
JWT_SECRET=strong-secret-key
OPENAI_API_KEY=sk-prod-key
QDRANT_HOST=production-qdrant-host
QDRANT_API_KEY=production-qdrant-key
ALLOWED_ORIGINS=https://sengol.ai,https://app.sengol.ai
```

### Health Checks
- **Liveness:** `GET /health` → Returns 200 with uptime
- **Readiness:** `GET /health/detailed` → Tests all dependencies
- Used by Cloud Run for auto-restart

### Monitoring Points
- Request latency and error rates
- Database connection pool status
- Cache hit/miss ratios
- Circuit breaker state (open/closed)
- Vector search performance
- OpenAI API usage and costs

---

## CONCLUSION

The Sengol API is a **well-architected, production-ready middleware layer** with:
- ✅ Modern framework (Fastify)
- ✅ Comprehensive error handling
- ✅ Database resilience and caching
- ✅ Feature gating and pricing tiers
- ✅ Vector database integration
- ✅ AI/LLM integration
- ✅ Multi-tenancy support (GeographyAccount)

**Trial System Status:**
- Frontend: Fully implemented (7-day trial, feature limits, milestone emails)
- Backend: Partially implemented (pricing tiers, feature gates, but no route guards)

**Next Steps:**
1. Add trial/subscription guards to critical routes
2. Implement Stripe webhook handlers
3. Create trial status and usage endpoints
4. Add feature-specific access control per tier
5. Sync frontend trial tracking with backend enforcement

