# Sengol API - Quick Start Overview

## What is Sengol API?

**Node.js/TypeScript Fastify middleware** that sits between your Next.js frontend and external services (Qdrant, OpenAI, PostgreSQL).

```
Frontend (Next.js)
       ↓
  Sengol API (Node.js/Fastify) ← You are here
       ↓
 PostgreSQL + Qdrant + OpenAI
```

## Quick Start (5 minutes)

### 1. Install & Setup
```bash
cd /Users/durai/Documents/GitHub/sengol-api
npm install
cp .env.example .env.local
npx prisma generate
```

### 2. Environment Variables
```bash
# Essential
DATABASE_URL=postgresql://...
OPENAI_API_KEY=sk-...
JWT_SECRET=your-secret-key

# Optional
QDRANT_HOST=localhost (or qdrant.cloud host)
REDIS_URL=redis://localhost:6379
PORT=4000
```

### 3. Start Development Server
```bash
npm run dev
# Runs on http://localhost:4000
```

### 4. Test API
```bash
# Health check
curl http://localhost:4000/health

# Detailed health
curl http://localhost:4000/health/detailed
```

---

## Key Concepts

### 1. Route Modules
- `auth.routes.ts` - Authentication (TODO)
- `review.routes.ts` - Assessment reviews
- `projects.routes.ts` - Project management
- `council.routes.ts` - AI Risk Council (policies, vendors, schedules)
- `compliance.routes.ts` - Compliance responses
- `health.routes.ts` - Health checks

### 2. Database
- **ORM:** Prisma
- **Provider:** PostgreSQL (Neon Cloud)
- **Resilience:** Built-in circuit breaker & caching

### 3. Feature Gating
- **4 Tiers:** Free, Consultant, Professional, Enterprise
- **Located:** `src/lib/pricing.ts` and `src/services/feature-gates.service.ts`
- **Usage:** Check tier limits before creating assessments/projects

### 4. Vector Database (Qdrant)
- **Purpose:** Semantic search of 50,000+ incidents
- **Usage:** Question generation looks up relevant incidents
- **Client:** `src/lib/qdrant-client.ts`

### 5. Trial System
- **Frontend:** `/Users/durai/Documents/GitHub/sengol/lib/trial-manager.ts` (7-day trial)
- **Backend:** Feature gates exist but not enforced in routes yet
- **Missing:** API route guards to prevent trial users from exceeding limits

---

## Most Important Files

| File | Purpose |
|------|---------|
| `src/app.ts` | Main Fastify app |
| `src/lib/pricing.ts` | Pricing tiers and feature gates |
| `src/services/feature-gates.service.ts` | Tier-based access control |
| `src/lib/qdrant-client.ts` | Vector database integration |
| `src/services/incident-search.ts` | Semantic incident search |
| `prisma/schema.prisma` | Database schema (3041 lines) |
| `src/lib/prisma-resilient.ts` | Database resilience layer |
| `src/routes/*.routes.ts` | API endpoint definitions (10 files) |

---

## API Response Format

### Success
```json
{
  "success": true,
  "data": { ... },
  "pagination": { "total": 100, "limit": 10, "offset": 0, "hasMore": true }
}
```

### Error
```json
{
  "success": false,
  "error": "Human-readable message",
  "code": "ERROR_CODE",
  "statusCode": 400,
  "details": "Optional details"
}
```

---

## Common Endpoints

### Health Checks
```
GET /health              - Quick health check
GET /health/detailed    - Full dependency check (database, Qdrant, OpenAI, etc.)
```

### Reviews & Assessments
```
POST /api/review/analyze-system                    - Analyze system for risks
POST /api/review/:id/generate-questions            - Generate assessment questions
PUT  /api/review/:id/save-questions               - Save question responses
POST /api/review/:id/compliance-responses         - Save compliance answers
```

### User Information
```
GET /api/user/usage     - Get user tier, limits, and current usage
```

### AI Risk Council
```
POST /api/council/policies              - Create policy
GET  /api/council/policies              - List policies
POST /api/council/vendors               - Create vendor
GET  /api/council/vendors               - List vendors
POST /api/council/schedules             - Create assessment schedule
GET  /api/council/schedules             - List schedules
```

---

## Architecture Highlights

### 1. Resilience
- **Circuit Breaker:** Handles database failures gracefully
- **Caching:** In-memory LRU cache with Redis fallback
- **Retries:** Exponential backoff for failed requests
- **Timeouts:** Global request timeout of 120 seconds

### 2. Feature Gating
```typescript
// Check if user has access to feature
const result = await checkFeatureAccess(userId, 'pdfExports')
if (!result.hasAccess) {
  return 403 with upgrade suggestion
}
```

### 3. Database Operations
```typescript
// All cached and resilient
const tier = await getUserTier(userId)      // Cached, 1 hour TTL
const isAdmin = await isUserAdmin(userId)   // Cached, bypasses all limits
```

### 4. Vector Search
```typescript
// Search 50,000+ incidents for matches
const incidents = await findSimilarIncidents('AI chatbot')
// Returns top 100 matching incidents with similarity scores
```

---

## Common Tasks

### Add a New Endpoint
1. Create controller in `src/controllers/`
2. Add route in `src/routes/`
3. Add error handling
4. Test with curl or Postman

Example:
```typescript
// src/routes/example.routes.ts
export async function exampleRoutes(fastify: FastifyInstance) {
  fastify.get('/api/example', exampleController)
}

// src/controllers/example.controller.ts
export async function exampleController(request: FastifyRequest, reply: FastifyReply) {
  try {
    const data = await prisma.example.findMany()
    return reply.send({ success: true, data })
  } catch (error) {
    return reply.code(500).send({ success: false, error: error.message })
  }
}
```

### Check User Tier
```typescript
const tier = await getUserTier(userId)
const limits = PRICING_PLANS[tier].limits
if (limits.projects === -1) {
  // Unlimited projects
}
```

### Check Feature Access
```typescript
const { hasAccess, error } = await checkFeatureAccess(userId, 'pdfExports')
if (!hasAccess) {
  reply.code(403).send({
    error: error.message,
    upgradeUrl: error.upgradeUrl
  })
}
```

### Search Incidents
```typescript
const incidents = await findSimilarIncidents(
  'Our AI system processes payment data',
  {
    limit: 50,
    industry: 'fintech',
    minSimilarity: 0.6
  }
)
```

---

## Pricing Tiers Reference

| Tier | Price | Users | Assessments/Mo | Projects | Key Features |
|------|-------|-------|----------------|----------|--------------|
| Free | $0 | 1 | 1 | 2 | Basic risk scores |
| Consultant | $59 | 1 | 5 | 10 | PDF/Excel, ROI calc |
| Professional | $99 | 5 | 20 | Unlimited | Team features |
| Enterprise | $999 | Unlimited | Unlimited | Unlimited | API access, SSO |

---

## Deployment

### Cloud Run (Recommended)
```bash
# Build container
docker build -t sengol-api .

# Deploy
gcloud run deploy sengol-api \
  --image sengol-api \
  --set-env-vars DATABASE_URL=...,OPENAI_API_KEY=...
```

### Vercel Serverless
- Automatic from git push
- Uses `export default handler` in `src/app.ts`

---

## Monitoring & Troubleshooting

### Health Check Endpoint
```bash
# Quick check (should return instantly)
curl http://localhost:4000/health

# Full check (tests database, Qdrant, OpenAI)
curl http://localhost:4000/health/detailed
```

### Common Issues

**"Missing required environment variable"**
- Check `.env.local` file
- Run `npm run dev` again

**"Connection refused" (database)**
- Ensure PostgreSQL is running
- Check DATABASE_URL is correct
- Run `npx prisma db push`

**"Vector search timeout"**
- Check Qdrant is reachable
- Verify QDRANT_HOST and QDRANT_API_KEY
- Reduce search limit or increase timeout

**"OpenAI API Error"**
- Check OPENAI_API_KEY is valid
- Check API key has funds/quota
- Reduce request size or timeout

---

## What's Next?

### For Trial System Implementation
1. Read `SENGOL_API_ANALYSIS_COMPREHENSIVE.md` (full analysis)
2. Add route guards for trial validation
3. Add Stripe webhook handlers
4. Create trial status endpoints
5. Sync with frontend trial-manager

### For Feature Development
1. Define new endpoint in `src/routes/`
2. Create controller in `src/controllers/`
3. Add tests in `tests/`
4. Update this documentation
5. Deploy to Cloud Run

---

## Resources

- **Full Analysis:** `SENGOL_API_ANALYSIS_COMPREHENSIVE.md`
- **API Contract:** `API_CONTRACT.md`
- **Environment:** `.env.example`
- **Schema:** `prisma/schema.prisma`
- **Types:** `src/types/`
- **Tests:** `tests/`

