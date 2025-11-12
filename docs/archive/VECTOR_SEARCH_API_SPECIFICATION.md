# Vector Search API Specification

**Version**: 1.0
**Last Updated**: November 6, 2025
**Purpose**: API specification for standalone vector search service

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Data Models](#data-models)
4. [API Endpoints](#api-endpoints)
5. [Authentication](#authentication)
6. [Error Handling](#error-handling)
7. [Performance Requirements](#performance-requirements)
8. [Integration Guide](#integration-guide)

---

## Overview

This API service provides semantic vector search capabilities across AI knowledge base content (research papers, news articles, regulatory documents). It implements a **hybrid architecture** where:

- **d-VecDB** stores 1536-dimensional vectors with minimal metadata
- **PostgreSQL** stores complete document metadata
- **Search combines both** for enriched results

### Key Features

- Natural language semantic search
- Content type filtering (research_paper, ai_news, regulation)
- Configurable result limits (1-50)
- Similarity scoring (0-1 scale)
- Full metadata enrichment from PostgreSQL

---

## Architecture

### System Components

```
┌─────────────────┐
│  Client App     │
│ (Admin Portal)  │
└────────┬────────┘
         │
         │ HTTPS
         ▼
┌─────────────────┐
│  API Server     │◄─── This specification
│ (Vector Search) │
└────┬─────┬──────┘
     │     │
     │     │ PostgreSQL
     │     ▼
     │  ┌──────────────┐
     │  │ PostgreSQL   │
     │  │ (Metadata)   │
     │  └──────────────┘
     │
     │ SSH Tunnel
     ▼
┌─────────────────┐
│   d-VecDB       │
│ (Vector Search) │
│  on VPS         │
└─────────────────┘
```

### Data Flow

1. **Query received** → API receives search query text
2. **Generate embedding** → Convert query to 1536-dim vector (OpenAI API)
3. **Search d-VecDB** → Find similar vectors via SSH
4. **Extract IDs** → Get `pg_id` from d-VecDB metadata
5. **Fetch metadata** → Query PostgreSQL for full records
6. **Enrich results** → Combine similarity scores with metadata
7. **Return response** → Send JSON to client

---

## Data Models

### Vector Format (d-VecDB)

#### Vector Upload Payload

```json
{
  "data": [
    0.0234, -0.1234, 0.5678, ..., 0.9012
  ],
  "metadata": {
    "pg_id": "550e8400-e29b-41d4-a716-446655440000",
    "pg_table": "research_papers",
    "type": "research_paper"
  }
}
```

**Field Specifications:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `data` | `array<float>` | ✅ | 1536-dimensional vector (OpenAI text-embedding-3-small) |
| `metadata.pg_id` | `string (UUID)` | ✅ | PostgreSQL primary key for metadata lookup |
| `metadata.pg_table` | `string (enum)` | ✅ | PostgreSQL table name: `research_papers`, `ai_news`, or `scraped_financial_data` |
| `metadata.type` | `string (enum)` | ✅ | Content type: `research_paper`, `ai_news`, or `regulation` |

**Vector Constraints:**
- Dimensions: Exactly **1536** floats
- Range: -1.0 to 1.0 (normalized)
- Format: 32-bit floating point
- Distance metric: Cosine similarity

#### d-VecDB Search Query

```json
{
  "vector": [0.0234, -0.1234, 0.5678, ..., 0.9012],
  "limit": 10
}
```

#### d-VecDB Search Response

```json
{
  "success": true,
  "data": [
    {
      "id": "vec_123456",
      "distance": 0.15,
      "metadata": {
        "pg_id": "550e8400-e29b-41d4-a716-446655440000",
        "pg_table": "research_papers",
        "type": "research_paper"
      }
    }
  ]
}
```

**Field Specifications:**

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | d-VecDB internal vector ID |
| `distance` | `float` | Cosine distance (0 = identical, 2 = opposite) |
| `metadata.pg_id` | `string (UUID)` | PostgreSQL record ID |
| `metadata.pg_table` | `string` | PostgreSQL table name |
| `metadata.type` | `string` | Content type for filtering |

---

### PostgreSQL Metadata Schema

#### Table: `research_papers`

```sql
CREATE TABLE research_papers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  abstract TEXT,
  authors TEXT[], -- Array of author names
  categories TEXT[], -- Array of ArXiv categories
  published_date TIMESTAMP,
  source_url TEXT UNIQUE,
  embedding_vector DOUBLE PRECISION[1536],
  embedding_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**API Response Fields:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "title": "Scaling Laws for Neural Language Models",
  "abstract": "We study empirical scaling laws for language model performance...",
  "authors": ["Jared Kaplan", "Sam McCandlish", "Tom Henighan"],
  "categories": ["cs.LG", "cs.CL"],
  "published_date": "2020-01-23T00:00:00Z",
  "source_url": "https://arxiv.org/abs/2001.08361",
  "created_at": "2025-11-05T12:30:00Z",
  "updated_at": "2025-11-05T12:30:00Z"
}
```

#### Table: `ai_news`

```sql
CREATE TABLE ai_news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  author TEXT,
  score INTEGER,
  num_comments INTEGER,
  source_url TEXT UNIQUE,
  hn_url TEXT,
  embedding_vector DOUBLE PRECISION[1536],
  embedding_status TEXT DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  scraped_at TIMESTAMP
);
```

**API Response Fields:**

```json
{
  "id": "660e8400-e29b-41d4-a716-446655440001",
  "title": "OpenAI announces GPT-4",
  "author": "sama",
  "score": 1234,
  "num_comments": 567,
  "source_url": "https://openai.com/blog/gpt-4",
  "hn_url": "https://news.ycombinator.com/item?id=35137254",
  "created_at": "2025-11-04T08:15:00Z",
  "scraped_at": "2025-11-04T08:15:00Z"
}
```

#### Table: `scraped_financial_data`

```sql
CREATE TABLE scraped_financial_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  source_url TEXT UNIQUE,
  raw_content TEXT,
  metadata JSONB,
  embedding_vector DOUBLE PRECISION[1536],
  embedding_status TEXT DEFAULT 'pending',
  scraped_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

**API Response Fields:**

```json
{
  "id": "770e8400-e29b-41d4-a716-446655440002",
  "source": "federal_register",
  "source_url": "https://www.federalregister.gov/documents/2023/10/30/...",
  "metadata": {
    "title": "AI Risk Management Framework",
    "document_number": "2023-23945",
    "publication_date": "2023-10-30"
  },
  "created_at": "2025-11-03T14:20:00Z",
  "scraped_at": "2025-11-03T14:20:00Z"
}
```

**Note**: `raw_content` is excluded from API responses (too large). Access via separate endpoint if needed.

---

## API Endpoints

### 1. POST /api/v1/vector-search

**Description**: Semantic search across vector database with metadata enrichment.

#### Request

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

**Body:**
```json
{
  "query": "AI safety regulations and governance",
  "limit": 10,
  "type": "research_paper"
}
```

**Parameters:**

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `query` | `string` | ✅ | - | Natural language search query (2-500 chars) |
| `limit` | `integer` | ❌ | 10 | Number of results (1-50) |
| `type` | `string (enum)` | ❌ | null | Filter by type: `research_paper`, `ai_news`, `regulation`, or omit for all |

**Validation Rules:**

- `query`: 2-500 characters, non-empty after trimming
- `limit`: Integer between 1 and 50
- `type`: Must be one of: `research_paper`, `ai_news`, `regulation`, or `null`

#### Response

**Success (200 OK):**

```json
{
  "query": "AI safety regulations and governance",
  "limit": 10,
  "type": "research_paper",
  "results": [
    {
      "distance": 0.15,
      "score": 0.85,
      "type": "research_paper",
      "table": "research_papers",
      "data": {
        "id": "550e8400-e29b-41d4-a716-446655440000",
        "title": "AI Governance and Safety Standards",
        "abstract": "This paper explores frameworks for...",
        "authors": ["John Doe", "Jane Smith"],
        "categories": ["cs.AI", "cs.CY"],
        "published_date": "2024-05-15T00:00:00Z",
        "source_url": "https://arxiv.org/abs/2405.12345",
        "created_at": "2025-11-05T10:00:00Z",
        "updated_at": "2025-11-05T10:00:00Z"
      }
    },
    {
      "distance": 0.22,
      "score": 0.78,
      "type": "research_paper",
      "table": "research_papers",
      "data": {
        "id": "660e8400-e29b-41d4-a716-446655440001",
        "title": "Regulatory Approaches to AI Systems",
        "abstract": "We survey international AI regulations...",
        "authors": ["Alice Johnson"],
        "categories": ["cs.CY"],
        "published_date": "2024-03-20T00:00:00Z",
        "source_url": "https://arxiv.org/abs/2403.54321",
        "created_at": "2025-11-04T15:30:00Z",
        "updated_at": "2025-11-04T15:30:00Z"
      }
    }
  ],
  "total": 2,
  "metadata": {
    "search_time_ms": 423,
    "embedding_time_ms": 1250,
    "dvecdb_time_ms": 305,
    "postgres_time_ms": 118
  }
}
```

**Response Fields:**

| Field | Type | Description |
|-------|------|-------------|
| `query` | `string` | Original search query |
| `limit` | `integer` | Requested result limit |
| `type` | `string` | Content type filter (or "all") |
| `results` | `array` | Array of search results |
| `results[].distance` | `float` | Cosine distance (lower = more similar) |
| `results[].score` | `float` | Similarity score: `1 - distance` (0-1, higher = better) |
| `results[].type` | `string` | Content type: `research_paper`, `ai_news`, or `regulation` |
| `results[].table` | `string` | PostgreSQL table name |
| `results[].data` | `object` | Full metadata from PostgreSQL (schema varies by type) |
| `total` | `integer` | Number of results returned |
| `metadata.search_time_ms` | `integer` | Total search time in milliseconds |
| `metadata.embedding_time_ms` | `integer` | Time to generate query embedding |
| `metadata.dvecdb_time_ms` | `integer` | Time for d-VecDB search |
| `metadata.postgres_time_ms` | `integer` | Time for PostgreSQL lookups |

**Error Responses:**

**400 Bad Request** - Invalid parameters
```json
{
  "error": "Validation failed",
  "details": "Query must be between 2 and 500 characters",
  "code": "INVALID_QUERY"
}
```

**401 Unauthorized** - Missing or invalid API key
```json
{
  "error": "Authentication required",
  "details": "Invalid or missing API key",
  "code": "UNAUTHORIZED"
}
```

**500 Internal Server Error** - OpenAI API failure
```json
{
  "error": "Embedding generation failed",
  "details": "OpenAI API returned 429: Rate limit exceeded",
  "code": "EMBEDDING_ERROR"
}
```

**503 Service Unavailable** - d-VecDB unreachable
```json
{
  "error": "Vector database unavailable",
  "details": "SSH connection to d-VecDB failed",
  "code": "DVECDB_UNAVAILABLE"
}
```

---

### 2. POST /api/v1/vectors/upload

**Description**: Upload vectors with metadata to d-VecDB.

#### Request

**Headers:**
```
Content-Type: application/json
Authorization: Bearer <API_KEY>
```

**Body:**
```json
{
  "vectors": [
    {
      "data": [0.0234, -0.1234, 0.5678, ..., 0.9012],
      "metadata": {
        "pg_id": "550e8400-e29b-41d4-a716-446655440000",
        "pg_table": "research_papers",
        "type": "research_paper"
      }
    }
  ],
  "collection": "ai_knowledge_base"
}
```

**Parameters:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `vectors` | `array` | ✅ | Array of vectors to upload (max 100 per request) |
| `vectors[].data` | `array<float>` | ✅ | 1536-dimensional vector |
| `vectors[].metadata.pg_id` | `string (UUID)` | ✅ | PostgreSQL record ID |
| `vectors[].metadata.pg_table` | `string` | ✅ | PostgreSQL table name |
| `vectors[].metadata.type` | `string` | ✅ | Content type |
| `collection` | `string` | ❌ | d-VecDB collection name (default: `ai_knowledge_base`) |

#### Response

**Success (200 OK):**

```json
{
  "uploaded": 25,
  "failed": 0,
  "total": 25,
  "collection": "ai_knowledge_base",
  "errors": []
}
```

**Partial Success (200 OK):**

```json
{
  "uploaded": 23,
  "failed": 2,
  "total": 25,
  "collection": "ai_knowledge_base",
  "errors": [
    {
      "index": 5,
      "pg_id": "invalid-uuid",
      "error": "Invalid vector dimensions: expected 1536, got 1024"
    },
    {
      "index": 12,
      "pg_id": "770e8400-e29b-41d4-a716-446655440002",
      "error": "d-VecDB timeout after 15 seconds"
    }
  ]
}
```

---

### 3. GET /api/v1/vectors/stats

**Description**: Get d-VecDB statistics.

#### Request

**Headers:**
```
Authorization: Bearer <API_KEY>
```

#### Response

**Success (200 OK):**

```json
{
  "total_vectors": 107549,
  "collections": [
    {
      "name": "ai_knowledge_base",
      "vector_count": 107549,
      "dimension": 1536,
      "distance_metric": "Cosine"
    }
  ],
  "metadata": {
    "with_metadata": 101,
    "without_metadata": 107448
  }
}
```

---

### 4. GET /api/v1/health

**Description**: Health check endpoint.

#### Request

No authentication required.

#### Response

**Success (200 OK):**

```json
{
  "status": "healthy",
  "services": {
    "api": "up",
    "postgres": "up",
    "dvecdb": "up",
    "openai": "up"
  },
  "latency": {
    "postgres_ms": 12,
    "dvecdb_ms": 45,
    "openai_ms": 850
  },
  "version": "1.0.0",
  "timestamp": "2025-11-06T06:15:00Z"
}
```

**Degraded (200 OK):**

```json
{
  "status": "degraded",
  "services": {
    "api": "up",
    "postgres": "up",
    "dvecdb": "down",
    "openai": "up"
  },
  "errors": {
    "dvecdb": "SSH connection timeout after 10 seconds"
  },
  "version": "1.0.0",
  "timestamp": "2025-11-06T06:15:00Z"
}
```

---

## Authentication

### API Key Authentication

All endpoints (except `/health`) require Bearer token authentication:

```
Authorization: Bearer YOUR_API_KEY_HERE
```

**API Key Format:**
- Prefix: `sk_live_` (production) or `sk_test_` (testing)
- Length: 32 characters after prefix
- Character set: `[a-zA-Z0-9]`

**Example:**
```
Authorization: Bearer YOUR_API_KEY_HERE
```

### Rate Limiting

| Plan | Rate Limit | Burst |
|------|------------|-------|
| Free | 10 req/min | 20 |
| Pro | 100 req/min | 200 |
| Enterprise | 1000 req/min | 2000 |

**Rate Limit Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1699268400
```

**Rate Limit Exceeded (429):**
```json
{
  "error": "Rate limit exceeded",
  "details": "100 requests per minute allowed, reset at 2025-11-06T06:20:00Z",
  "code": "RATE_LIMIT_EXCEEDED",
  "retry_after": 42
}
```

---

## Error Handling

### Error Response Format

All errors follow this structure:

```json
{
  "error": "Human-readable error message",
  "details": "Additional context or debugging information",
  "code": "ERROR_CODE",
  "request_id": "req_1234567890abcdef",
  "timestamp": "2025-11-06T06:15:00Z"
}
```

### Error Codes

| HTTP Status | Code | Description |
|-------------|------|-------------|
| 400 | `INVALID_QUERY` | Query text validation failed |
| 400 | `INVALID_LIMIT` | Limit must be 1-50 |
| 400 | `INVALID_TYPE` | Type must be research_paper, ai_news, regulation, or null |
| 400 | `INVALID_VECTOR` | Vector dimensions incorrect (must be 1536) |
| 401 | `UNAUTHORIZED` | Missing or invalid API key |
| 403 | `FORBIDDEN` | API key valid but lacks permissions |
| 404 | `NOT_FOUND` | Resource not found |
| 429 | `RATE_LIMIT_EXCEEDED` | Too many requests |
| 500 | `EMBEDDING_ERROR` | OpenAI API failure |
| 500 | `DATABASE_ERROR` | PostgreSQL query failure |
| 503 | `DVECDB_UNAVAILABLE` | d-VecDB connection failure |
| 503 | `SERVICE_UNAVAILABLE` | Service temporarily down |

---

## Performance Requirements

### Latency Targets

| Operation | P50 | P95 | P99 |
|-----------|-----|-----|-----|
| `/vector-search` | 500ms | 1000ms | 2000ms |
| `/vectors/upload` | 200ms | 500ms | 1000ms |
| `/vectors/stats` | 100ms | 300ms | 500ms |
| `/health` | 50ms | 100ms | 200ms |

**Breakdown for `/vector-search`:**
- OpenAI embedding: ~1000-1500ms
- d-VecDB search: ~200-400ms
- PostgreSQL lookup: ~50-150ms (for 10 records)
- Network overhead: ~50-100ms

### Availability

- **SLA Target**: 99.9% uptime
- **Monitoring**: Health checks every 30 seconds
- **Alerting**: Notify if service degraded for >2 minutes

### Scalability

- **Concurrent requests**: Support 100 simultaneous requests
- **Vector database size**: Support up to 10M vectors
- **Search performance**: Maintain <500ms P50 at 10M vectors

---

## Integration Guide

### Environment Variables

**Required:**

```bash
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-1234567890abcdef...

# PostgreSQL Configuration
DATABASE_URL=postgresql://user:password@host:5432/database

# d-VecDB Configuration (SSH Access)
VPS_HOST=ssh7.vast.ai
VPS_SSH_PORT=31735
VPS_SSH_USER=root
VPS_SSH_KEY_PATH=/path/to/ssh/key
# OR
VPS_SSH_PRIVATE_KEY="-----BEGIN OPENSSH PRIVATE KEY-----\n..."

# API Configuration
API_PORT=8080
API_HOST=0.0.0.0
```

**Optional:**

```bash
# d-VecDB Settings
DVECDB_URL=http://localhost:8080
DVECDB_COLLECTION=ai_knowledge_base

# Rate Limiting
RATE_LIMIT_ENABLED=true
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW_MS=60000

# Timeouts (milliseconds)
OPENAI_TIMEOUT=15000
DVECDB_TIMEOUT=10000
POSTGRES_TIMEOUT=5000

# Logging
LOG_LEVEL=info
LOG_FORMAT=json
```

### SSH Configuration for d-VecDB

**Connection String:**
```bash
ssh -o StrictHostKeyChecking=no \
    -o ConnectTimeout=10 \
    -o BatchMode=yes \
    -i /path/to/ssh/key \
    -p 31735 \
    root@ssh7.vast.ai
```

**d-VecDB API Endpoints:**
- Create collection: `POST http://localhost:8080/collections`
- Upload vector: `POST http://localhost:8080/collections/{name}/vectors`
- Search vectors: `POST http://localhost:8080/collections/{name}/search`
- Get stats: `GET http://localhost:8080/stats`

**Example Search via SSH:**
```bash
# Upload search query to VPS
scp -P 31735 -i ~/.ssh/id_vast search_query.json root@ssh7.vast.ai:/tmp/

# Execute search
ssh -p 31735 -i ~/.ssh/id_vast root@ssh7.vast.ai \
  "curl -s -X POST http://localhost:8080/collections/ai_knowledge_base/search \
   -H 'Content-Type: application/json' \
   -d @/tmp/search_query.json"
```

### Database Connection

**Prisma Schema** (for reference):

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model research_papers {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title            String
  abstract         String?
  authors          String[]
  categories       String[]
  published_date   DateTime?
  source_url       String?   @unique
  embedding_vector Float[]
  embedding_status String?   @default("pending")
  created_at       DateTime  @default(now())
  updated_at       DateTime  @default(now())
}

model ai_news {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  title            String
  author           String?
  score            Int?
  num_comments     Int?      @map("num_comments")
  source_url       String?   @unique
  hn_url           String?
  embedding_vector Float[]
  embedding_status String?   @default("pending")
  created_at       DateTime  @default(now())
  scraped_at       DateTime?
}

model scraped_financial_data {
  id               String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  source           String
  source_url       String?   @unique
  raw_content      String?
  metadata         Json?
  embedding_vector Float[]
  embedding_status String?   @default("pending")
  scraped_at       DateTime? @default(now())
  created_at       DateTime  @default(now())
}
```

### Implementation Checklist

#### Phase 1: Core Search (Week 1)

- [ ] Set up API server (Express/FastAPI/etc.)
- [ ] Implement authentication middleware (API key validation)
- [ ] Create PostgreSQL connection pool
- [ ] Implement SSH connection to d-VecDB
- [ ] Implement OpenAI embedding generation
- [ ] Create `/vector-search` endpoint with full flow
- [ ] Add error handling and logging
- [ ] Set up health check endpoint

#### Phase 2: Vector Management (Week 2)

- [ ] Implement `/vectors/upload` endpoint
- [ ] Add batch upload support (max 100 vectors)
- [ ] Implement retry logic for failed uploads
- [ ] Add `/vectors/stats` endpoint
- [ ] Create admin endpoints for vector management

#### Phase 3: Performance & Monitoring (Week 3)

- [ ] Add request/response logging
- [ ] Implement rate limiting
- [ ] Add performance metrics (latency tracking)
- [ ] Set up monitoring dashboards
- [ ] Add caching layer for common queries
- [ ] Optimize PostgreSQL queries (batch lookups)

#### Phase 4: Production Readiness (Week 4)

- [ ] Load testing (100 concurrent users)
- [ ] Security audit (API key rotation, input validation)
- [ ] Documentation review
- [ ] Create deployment scripts
- [ ] Set up CI/CD pipeline
- [ ] Production deployment

---

## Example Implementations

### Node.js/TypeScript (Express)

```typescript
import express from 'express'
import OpenAI from 'openai'
import { PrismaClient } from '@prisma/client'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)
const app = express()
const prisma = new PrismaClient()
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

app.post('/api/v1/vector-search', async (req, res) => {
  const startTime = Date.now()

  try {
    // 1. Validate request
    const { query, limit = 10, type } = req.body

    if (!query || query.length < 2 || query.length > 500) {
      return res.status(400).json({
        error: 'Validation failed',
        details: 'Query must be between 2 and 500 characters',
        code: 'INVALID_QUERY'
      })
    }

    // 2. Generate embedding
    const embeddingStart = Date.now()
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
      dimensions: 1536
    })
    const queryVector = embeddingResponse.data[0].embedding
    const embeddingTime = Date.now() - embeddingStart

    // 3. Search d-VecDB via SSH
    const dvecdbStart = Date.now()
    const searchQuery = { vector: queryVector, limit: Math.min(limit, 50) }

    // Upload query to VPS
    const queryFile = `/tmp/search_${Date.now()}.json`
    const remotePath = `/tmp/search_${Date.now()}.json`

    fs.writeFileSync(queryFile, JSON.stringify(searchQuery))

    const sshOptions = `-o StrictHostKeyChecking=no -i ${process.env.VPS_SSH_KEY_PATH}`
    await execAsync(`scp ${sshOptions} -P ${process.env.VPS_SSH_PORT} ${queryFile} ${process.env.VPS_SSH_USER}@${process.env.VPS_HOST}:${remotePath}`)

    // Execute search
    const searchCmd = `ssh ${sshOptions} -p ${process.env.VPS_SSH_PORT} ${process.env.VPS_SSH_USER}@${process.env.VPS_HOST} "curl -s -X POST http://localhost:8080/collections/ai_knowledge_base/search -H 'Content-Type: application/json' -d @${remotePath}"`
    const { stdout } = await execAsync(searchCmd)

    // Parse response
    const jsonStart = stdout.indexOf('{')
    const dvecdbResult = JSON.parse(stdout.substring(jsonStart))
    const dvecdbTime = Date.now() - dvecdbStart

    // 4. Fetch metadata from PostgreSQL
    const postgresStart = Date.now()
    const results = []

    for (const result of dvecdbResult.data) {
      if (!result.metadata?.pg_id) continue

      const { pg_id, pg_table, type: resultType } = result.metadata

      // Filter by type if specified
      if (type && resultType !== type) continue

      let record = null
      if (pg_table === 'research_papers') {
        record = await prisma.research_papers.findUnique({ where: { id: pg_id } })
      } else if (pg_table === 'ai_news') {
        record = await prisma.ai_news.findUnique({ where: { id: pg_id } })
      } else if (pg_table === 'scraped_financial_data') {
        record = await prisma.scraped_financial_data.findUnique({ where: { id: pg_id } })
      }

      if (record) {
        results.push({
          distance: result.distance,
          score: 1 - result.distance,
          type: resultType,
          table: pg_table,
          data: record
        })
      }
    }

    const postgresTime = Date.now() - postgresStart
    const totalTime = Date.now() - startTime

    // 5. Return results
    res.json({
      query,
      limit,
      type: type || 'all',
      results,
      total: results.length,
      metadata: {
        search_time_ms: totalTime,
        embedding_time_ms: embeddingTime,
        dvecdb_time_ms: dvecdbTime,
        postgres_time_ms: postgresTime
      }
    })

  } catch (error) {
    console.error('Search failed:', error)
    res.status(500).json({
      error: 'Search failed',
      details: error.message,
      code: 'INTERNAL_ERROR'
    })
  }
})

app.listen(8080, () => console.log('API server listening on port 8080'))
```

### Python/FastAPI

```python
from fastapi import FastAPI, HTTPException, Header
from pydantic import BaseModel, Field
from typing import Optional, List
import openai
import asyncpg
import subprocess
import json
import time

app = FastAPI()

class SearchRequest(BaseModel):
    query: str = Field(..., min_length=2, max_length=500)
    limit: int = Field(10, ge=1, le=50)
    type: Optional[str] = Field(None, regex="^(research_paper|ai_news|regulation)$")

class SearchResponse(BaseModel):
    query: str
    limit: int
    type: str
    results: List[dict]
    total: int
    metadata: dict

@app.post("/api/v1/vector-search", response_model=SearchResponse)
async def vector_search(
    request: SearchRequest,
    authorization: str = Header(...)
):
    start_time = time.time()

    # Validate API key
    if not authorization.startswith("Bearer sk_"):
        raise HTTPException(401, detail="Invalid API key")

    # Generate embedding
    embedding_start = time.time()
    response = openai.Embedding.create(
        model="text-embedding-3-small",
        input=request.query,
        dimensions=1536
    )
    query_vector = response['data'][0]['embedding']
    embedding_time = (time.time() - embedding_start) * 1000

    # Search d-VecDB via SSH
    dvecdb_start = time.time()
    search_query = {
        "vector": query_vector,
        "limit": min(request.limit, 50)
    }

    # Write query to temp file
    query_file = f"/tmp/search_{int(time.time() * 1000)}.json"
    with open(query_file, 'w') as f:
        json.dump(search_query, f)

    # Upload and search
    subprocess.run([
        "scp", "-P", "31735", "-i", "/path/to/key",
        query_file, f"root@ssh7.vast.ai:/tmp/query.json"
    ])

    result = subprocess.run([
        "ssh", "-p", "31735", "-i", "/path/to/key",
        "root@ssh7.vast.ai",
        "curl -s -X POST http://localhost:8080/collections/ai_knowledge_base/search -d @/tmp/query.json"
    ], capture_output=True, text=True)

    dvecdb_result = json.loads(result.stdout[result.stdout.index('{'):])
    dvecdb_time = (time.time() - dvecdb_start) * 1000

    # Fetch from PostgreSQL
    postgres_start = time.time()
    conn = await asyncpg.connect(os.getenv("DATABASE_URL"))
    results = []

    for item in dvecdb_result['data']:
        if not item.get('metadata', {}).get('pg_id'):
            continue

        pg_id = item['metadata']['pg_id']
        pg_table = item['metadata']['pg_table']
        result_type = item['metadata']['type']

        if request.type and result_type != request.type:
            continue

        record = await conn.fetchrow(
            f"SELECT * FROM {pg_table} WHERE id = $1",
            pg_id
        )

        if record:
            results.append({
                "distance": item['distance'],
                "score": 1 - item['distance'],
                "type": result_type,
                "table": pg_table,
                "data": dict(record)
            })

    await conn.close()
    postgres_time = (time.time() - postgres_start) * 1000
    total_time = (time.time() - start_time) * 1000

    return SearchResponse(
        query=request.query,
        limit=request.limit,
        type=request.type or "all",
        results=results,
        total=len(results),
        metadata={
            "search_time_ms": int(total_time),
            "embedding_time_ms": int(embedding_time),
            "dvecdb_time_ms": int(dvecdb_time),
            "postgres_time_ms": int(postgres_time)
        }
    )
```

---

## Testing

### Unit Tests

**Test Embedding Generation:**
```bash
curl -X POST http://localhost:8080/api/v1/vector-search \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"query": "test query", "limit": 1}'
```

**Test Type Filtering:**
```bash
curl -X POST http://localhost:8080/api/v1/vector-search \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"query": "AI safety", "limit": 5, "type": "research_paper"}'
```

**Test Validation:**
```bash
# Should return 400
curl -X POST http://localhost:8080/api/v1/vector-search \
  -H "Authorization: Bearer YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{"query": "x", "limit": 100}'
```

### Load Testing

**Apache Bench:**
```bash
ab -n 1000 -c 10 -T "application/json" \
   -H "Authorization: Bearer YOUR_API_KEY_HERE" \
   -p search_query.json \
   http://localhost:8080/api/v1/vector-search
```

**Expected Results:**
- Throughput: >10 req/sec
- P95 latency: <1000ms
- Error rate: <1%

---

## Deployment

### Docker Configuration

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN npx prisma generate

EXPOSE 8080

CMD ["node", "dist/server.js"]
```

**docker-compose.yml:**
```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=production
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - DATABASE_URL=${DATABASE_URL}
      - VPS_SSH_KEY_PATH=/secrets/ssh_key
    volumes:
      - ./secrets:/secrets:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/v1/health"]
      interval: 30s
      timeout: 10s
      retries: 3
```

### Environment Setup

**Production:**
```bash
export NODE_ENV=production
export API_PORT=8080
export OPENAI_API_KEY=sk-proj-...
export DATABASE_URL=postgresql://...
export VPS_SSH_KEY_PATH=/secrets/id_vast
export RATE_LIMIT_MAX=1000
export LOG_LEVEL=info
```

**Staging:**
```bash
export NODE_ENV=staging
export API_PORT=8080
export OPENAI_API_KEY=sk-proj-staging-...
export DATABASE_URL=postgresql://staging...
export RATE_LIMIT_MAX=100
export LOG_LEVEL=debug
```

---

## Monitoring & Observability

### Metrics to Track

**Request Metrics:**
- Total requests per minute
- Requests by endpoint
- Response times (P50, P95, P99)
- Error rates by status code

**Service Metrics:**
- OpenAI API latency
- d-VecDB connection health
- PostgreSQL query performance
- SSH connection failures

**Business Metrics:**
- Searches by content type
- Average results per search
- API key usage by customer

### Logging Format

**Request Log:**
```json
{
  "timestamp": "2025-11-06T06:15:00.123Z",
  "level": "info",
  "type": "request",
  "method": "POST",
  "path": "/api/v1/vector-search",
  "query": "AI safety",
  "limit": 10,
  "type_filter": "research_paper",
  "api_key_prefix": "sk_live_xxxx",
  "ip": "192.168.1.100",
  "user_agent": "Mozilla/5.0...",
  "request_id": "req_1234567890"
}
```

**Response Log:**
```json
{
  "timestamp": "2025-11-06T06:15:00.845Z",
  "level": "info",
  "type": "response",
  "request_id": "req_1234567890",
  "status": 200,
  "total_time_ms": 722,
  "embedding_time_ms": 1250,
  "dvecdb_time_ms": 305,
  "postgres_time_ms": 118,
  "results_count": 8
}
```

---

## Support & Resources

### Documentation
- API Specification: This document
- Hybrid Architecture Guide: `/docs/HYBRID_VECTOR_SEARCH_SETUP.md`
- Database Schema: `/prisma/schema.prisma`

### Contact
- Technical Questions: tech@infinidatum.com
- API Issues: api-support@infinidatum.com
- Security Concerns: security@infinidatum.com

### Version History
- **1.0.0** (2025-11-06): Initial specification release

---

**Document Revision**: 1.0
**Effective Date**: November 6, 2025
**Next Review**: December 6, 2025
