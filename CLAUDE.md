# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Sengol API is a middleware layer for the Sengol AI risk assessment platform. It sits between the Next.js frontend and Python backend, providing business logic, API endpoints, and integration with PostgreSQL and d-vecDB vector database.

**Architecture:**
```
Frontend (Next.js) → Middleware (Fastify/this repo) → Backend (Python)
                           ↓
                    PostgreSQL + d-vecDB
```

## Development Commands

### Setup
```bash
npm install
npx prisma generate
npx prisma db push
```

### Development
```bash
npm run dev              # Start dev server with hot reload (uses tsx watch)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled JavaScript from dist/
```

### Testing
```bash
npm test                 # Run tests with Vitest
npm run test:watch       # Run tests in watch mode
```

### Code Quality
```bash
npm run lint             # Lint TypeScript files with ESLint
npm run format           # Format code with Prettier
```

### Database
```bash
npx prisma generate      # Generate Prisma client after schema changes
npx prisma db push       # Push schema changes to database
npx prisma studio        # Open Prisma Studio GUI
```

## Core Architecture

### 1. Dynamic Question Generation Engine

The centerpiece of this API is the **evidence-based risk assessment** system in `src/services/dynamic-question-generator.ts`. This is NOT a simple questionnaire generator—it's an intelligent system that:

1. **Analyzes system descriptions** using OpenAI GPT-4o
2. **Searches 78,767+ historical security incidents** from d-vecDB using semantic vector similarity
3. **Generates weighted questions** based on real incident data, not static templates
4. **Creates explainable scoring formulas** with transparency into weightage calculations

**Key Flow:**
```
System Description → d-vecDB Vector Search → GPT-4o Analysis →
Dynamic Questions (with weights, evidence, real incidents) →
Explainable Scoring Formula
```

**Critical Files:**
- `src/services/dynamic-question-generator.ts` - Main generation logic (776 lines, heavily documented)
- `src/services/incident-search.ts` - d-vecDB semantic search wrapper
- `src/services/dvecdb-embeddings.ts` - Low-level d-vecDB client integration
- `src/controllers/review.controller.ts` - API endpoint handlers

### 2. Vector Database Integration (d-vecDB)

The system uses **d-vecDB** (NOT traditional databases) for semantic incident search:

**Connection Setup:**
- Host/port configured in `src/config/env.ts` from environment variables
- Client initialized in `src/lib/dvecdb.ts`
- Default collection: `incidents` (78,767+ records)

**Search Flow:**
```
User Query → Generate Embedding (OpenAI) →
d-vecDB Vector Search → Post-filter by Metadata →
Return Ranked Incidents with Similarity Scores
```

**Important:** d-vecDB uses vector embeddings, NOT keyword search. All incidents are pre-embedded. The `embeddingText` field is a SHORT summary (e.g., "vulnerability CSRF..."), not full text. Rely on semantic similarity scores, not keyword matching.

### 3. Database (Prisma + PostgreSQL)

**Schema Location:** `prisma/schema.prisma` (large file, 33K+ tokens)

**Key Models:**
- `User` - User accounts with geography-based multi-tenancy
- `RiskAssessment` - Main assessment records (stores generated questions in `riskNotes` JSONB)
- `Project` - Projects linked to assessments
- `GeographyAccount` - Multi-geography support for compliance
- Many other models for compliance, frameworks, evidence artifacts, etc.

**Critical Pattern:** The schema uses `riskNotes` as a flexible JSONB field to store dynamically generated questions. This is intentional—questions are NOT stored in normalized tables because they're unique per assessment.

### 4. API Framework (Fastify)

**Entry Point:** `src/app.ts` exports a `build()` function that returns a configured Fastify instance.

**Plugin Registration Order:**
1. CORS (`@fastify/cors`) - configured from `ALLOWED_ORIGINS` env var
2. Helmet (`@fastify/helmet`) - security headers
3. Rate Limiting (`@fastify/rate-limit`) - 100 req/min default
4. Routes (health, auth, review)

**Error Handling:** Global error handler at `src/app.ts:36-46` sanitizes 500 errors.

**Route Structure:**
- `/health` - Health check endpoint
- `/api/auth/*` - Authentication endpoints (login, register)
- `/api/review/:id/generate-questions` - Dynamic question generation (main feature)

### 5. Environment Configuration

**Required Variables:** (see `.env.example`)
```bash
DATABASE_URL          # PostgreSQL connection string
JWT_SECRET           # For JWT authentication
OPENAI_API_KEY       # For GPT-4o and embeddings
DVECDB_HOST          # d-vecDB host (default: 99.213.88.59)
DVECDB_PORT          # d-vecDB port (default: 40560)
```

**Optional Variables:**
```bash
PYTHON_BACKEND_URL   # Python backend for additional processing
REDIS_URL            # Redis for caching (not currently used)
ALLOWED_ORIGINS      # Comma-separated CORS origins
```

**Validation:** `src/config/env.ts` throws errors on startup if required variables are missing.

## Key Technical Details

### Question Generation Weightage System

Questions have **composite weights** calculated from three components:

```javascript
finalWeight = (baseWeight × 0.5) + (evidenceWeight × 0.3) + (industryWeight × 0.2)
```

- **Base Weight:** LLM-analyzed priority based on system description
- **Evidence Weight:** Incident frequency/severity from d-vecDB (more incidents = higher weight)
- **Industry Weight:** Industry-specific relevance

This is NOT arbitrary—it's the core differentiator that makes Sengol evidence-based vs. competitors.

### Incident Statistics Calculation

`calculateIncidentStatistics()` in `incident-search.ts` computes:
- MFA/Backup/IR Plan adoption rates from real incidents
- Cost savings analysis (with vs. without security controls)
- Severity breakdowns
- Industry benchmarks

These statistics are used for weightage explanations and to justify question priorities to users.

### Scoring Formula Generation

The `createScoringFormula()` function generates:
- Weighted scoring formula explanation
- ASCII visualization of score calculation
- Example calculations with real question weights
- Component justifications based on incident data

This provides transparency for audits and client trust.

## Common Development Patterns

### Adding New Question Generation Logic

1. Modify `generateRiskQuestions()` or `generateComplianceQuestions()` in `dynamic-question-generator.ts`
2. Update the `DynamicQuestion` interface if adding new fields
3. Adjust weightage formulas in `calculateEvidenceWeight()` if needed
4. Test with diverse system descriptions to ensure quality

### Adding New API Endpoints

1. Create route file in `src/routes/` (follow pattern of `review.routes.ts`)
2. Create controller in `src/controllers/`
3. Register route in `src/app.ts` build function
4. Use Fastify's TypeScript generics for request/reply typing

### Modifying Prisma Schema

1. Edit `prisma/schema.prisma`
2. Run `npx prisma generate` to update client
3. Run `npx prisma db push` to sync database (dev) OR create migrations for production
4. Restart dev server to pick up schema changes

## Deployment

**Vercel:** Configured in `vercel.json` - routes all traffic to `src/app.ts`

**Railway:** Configuration in `railway.json` (if present)

**Environment Variables:** Must be set in deployment platform dashboard. Never commit `.env` to git.

## Resilience & Scalability (NEW)

### Architecture Overview

The API now includes enterprise-grade resilience patterns:

**Core Resilience Features:**
- **Circuit Breaker Pattern** (`src/lib/circuit-breaker.ts`) - Prevents cascading failures
- **Retry Logic** (`src/lib/retry.ts`) - Exponential backoff with jitter
- **Response Caching** (`src/lib/cache.ts`) - LRU cache for expensive operations
- **Graceful Shutdown** - Zero-downtime deployments
- **Health Monitoring** - Comprehensive health check endpoints

**Resilient Clients:**
- **d-vecDB Client** (`src/lib/dvecdb-resilient.ts`) - Wrapper with circuit breaker, retry, timeout, caching
- **OpenAI Client** (`src/lib/openai-resilient.ts`) - Wrapper with retry, rate limit handling, caching

**Error Handling:**
- **Custom Error Classes** (`src/lib/errors.ts`) - Structured errors with status codes and metadata
- Error types: `ValidationError`, `DatabaseError`, `VectorDBError`, `LLMError`, `CircuitBreakerError`, `TimeoutError`, etc.

**Middleware:**
- **Request Validation** (`src/middleware/validation.ts`) - Zod-based type-safe validation
- **Request Timeout** (`src/middleware/request-timeout.ts`) - Global timeout (default: 2 minutes)
- **Request Logging** (`src/middleware/request-logging.ts`) - Structured logging with duration tracking

### Using Resilient Clients

**Always use the resilient clients instead of raw clients:**

```typescript
// ✅ Good - Use resilient client
import { resilientDvecdbClient } from './lib/dvecdb-resilient'
const results = await resilientDvecdbClient.searchByText(query, filter, limit)

// ❌ Bad - Don't use raw client directly
import { dvecdbClient } from './lib/dvecdb'
const results = await dvecdbClient.search(...)
```

**d-vecDB operations are automatically:**
- Retried on transient failures (up to 3 times)
- Protected by circuit breaker (fails fast when service is down)
- Cached for better performance
- Monitored for health

**OpenAI operations are automatically:**
- Retried on rate limits and transient failures
- Cached to reduce API costs (40-60% savings)
- Monitored for errors

### Health Checks

Multiple health check endpoints for different purposes:

- `GET /health` - Fast basic check (for load balancers)
- `GET /health/detailed` - Full dependency checks (for monitoring dashboards)
- `GET /health/ready` - Kubernetes readiness probe
- `GET /health/live` - Kubernetes liveness probe
- `GET /health/cache` - Cache statistics
- `GET /health/circuit-breakers` - Circuit breaker states

### Configuration

All resilience features are configurable via environment variables:

```bash
DVECDB_TIMEOUT=30000          # d-vecDB request timeout (ms)
DVECDB_MAX_RETRIES=3          # Max retry attempts
OPENAI_TIMEOUT=60000          # OpenAI request timeout (ms)
OPENAI_MAX_RETRIES=3          # Max retry attempts
CACHE_ENABLED=true            # Enable/disable caching
CACHE_TTL=3600                # Cache TTL (seconds)
REQUEST_TIMEOUT=120000        # Global request timeout (ms)
SHUTDOWN_TIMEOUT=30000        # Graceful shutdown timeout (ms)
```

### Monitoring

**Circuit Breaker States:**
- Check via `GET /health/circuit-breakers`
- Monitor for OPEN state (indicates failing service)
- Automatically recovers after 60 seconds

**Cache Performance:**
- Check via `GET /health/cache`
- Monitor hit rate (should be > 70%)
- Vector search cache: 1 hour TTL
- LLM response cache: 2 hour TTL

**Error Tracking:**
All errors are structured with:
- Error code (for programmatic handling)
- Status code (HTTP standard)
- Metadata (context for debugging)

### Documentation

- **`RESILIENCE.md`** - Comprehensive resilience guide
- **`API_CONTRACT.md`** - Frontend integration guide with error handling
- **`IMPROVEMENTS_SUMMARY.md`** - Summary of all improvements

## Important Notes

### d-vecDB Specifics

- d-vecDB does NOT support complex array filters (e.g., `severity: ['high', 'critical']`)
- Solution: Fetch 3x results and post-filter in `findSimilarIncidents()`
- The `embeddingText` field is SHORT (20-50 chars), not full incident descriptions
- ALWAYS rely on vector similarity scores, not keyword matching on `embeddingText`

### Authentication Status

Authentication routes exist (`src/routes/auth.routes.ts`) but JWT verification is NOT yet implemented on protected routes. There's a TODO comment in `review.controller.ts:45-48` where auth checks should be added.

### TypeScript Configuration

- Target: ES2022
- Module: CommonJS (not ESM)
- Output: `dist/` directory
- Source maps enabled for debugging
- Strict mode enabled

### Testing Considerations

Tests use Vitest. No test files currently exist in the repo, but the setup is configured. When writing tests:
- Mock Prisma client to avoid database dependencies
- Mock OpenAI client to avoid API costs
- Mock d-vecDB client for predictable vector search results
