# GCE Crawler Implementation Plan

**Objective:** Migrate crawler infrastructure from Vast.ai VPS to Google Compute Engine with automated orchestration, source discovery, and real-time Qdrant updates.

**Status:** Planning Phase
**Target:** Q1 2025 Implementation
**Estimated Timeline:** 4-6 weeks

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [GCE Infrastructure Setup](#gce-infrastructure-setup)
3. [Crawler Source Management](#crawler-source-management)
4. [Orchestrator Implementation](#orchestrator-implementation)
5. [Data Flow & Storage](#data-flow--storage)
6. [Embeddings Pipeline](#embeddings-pipeline)
7. [Qdrant Integration](#qdrant-integration)
8. [Monitoring & Operations](#monitoring--operations)
9. [Implementation Phases](#implementation-phases)
10. [Cost Analysis](#cost-analysis)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    GCE CRAWLER INFRASTRUCTURE                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────┐
│  SOURCE DISCOVERY & MANAGEMENT                                    │
│  ┌────────────────────┐  ┌────────────────────────────────────┐ │
│  │  Auto-Discovery    │  │  Manual Source Registry             │ │
│  │  Engine            │  │  (PostgreSQL + Admin UI)            │ │
│  │  - RSS feed finder │  │  - Add/edit/disable sources        │ │
│  │  - Sitemap parser  │  │  - Configure crawl params          │ │
│  │  - API detector    │  │  - Priority & schedule             │ │
│  └────────────────────┘  └────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  ORCHESTRATOR (GCE VM: crawler-orchestrator)                     │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Cloud Scheduler Trigger (Hourly)                       │    │
│  │    ↓                                                     │    │
│  │  Load Active Sources → Sort by Priority                 │    │
│  │    ↓                                                     │    │
│  │  Dispatch to Worker VMs (Cloud Tasks Queue)             │    │
│  │    ↓                                                     │    │
│  │  Monitor Execution → Update Status                      │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  CRAWLER WORKERS (GCE VMs: crawler-worker-1, 2, 3...)           │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐               │
│  │  Worker 1  │  │  Worker 2  │  │  Worker 3  │  [Auto-scale] │
│  │  Regulatory│  │  Incidents │  │  Research  │               │
│  └────────────┘  └────────────┘  └────────────┘               │
│       ↓               ↓               ↓                          │
│  Fetch → Parse → Dedupe → Store to GCS                          │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  DATA STORAGE (GCS Buckets)                                      │
│  gs://sengol-crawled-data/                                       │
│    ├── raw/             ← Raw crawler output (JSON)              │
│    ├── processed/       ← Cleaned & normalized                   │
│    └── embeddings/      ← Vector embeddings (1536-dim)           │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  EMBEDDING PIPELINE (GCE VM: embedding-generator)                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Cloud Pub/Sub Trigger (on new data in GCS)             │    │
│  │    ↓                                                     │    │
│  │  Batch records (50 per batch)                           │    │
│  │    ↓                                                     │    │
│  │  Generate embeddings (OpenAI API)                       │    │
│  │    ↓                                                     │    │
│  │  Save to GCS: embeddings/{source}/{date}.jsonl          │    │
│  │    ↓                                                     │    │
│  │  Trigger Qdrant Loader                                  │    │
│  └─────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  QDRANT LOADER (GCE VM: sengol-vector-db)                       │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Cloud Pub/Sub Trigger (on new embeddings)              │    │
│  │    ↓                                                     │    │
│  │  Load JSONL from GCS                                    │    │
│  │    ↓                                                     │    │
│  │  Upsert to Qdrant (batch 100)                           │    │
│  │    ↓                                                     │    │
│  │  Update PostgreSQL status (embedding_status='completed')│    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                   │
│  Qdrant Collection: sengol_incidents_full                        │
│    - 1536-dim vectors (OpenAI)                                   │
│    - Cosine distance                                             │
│    - Auto-indexed                                                │
└──────────────────────────────────────────────────────────────────┘
                              ↓
┌──────────────────────────────────────────────────────────────────┐
│  MONITORING & ALERTING                                           │
│  - Cloud Monitoring dashboards                                   │
│  - Alerting policies (failures, delays)                          │
│  - Cloud Logging (structured logs)                               │
│  - Admin UI (real-time status)                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## GCE Infrastructure Setup

### VM Instances

#### 1. Orchestrator VM (`crawler-orchestrator`)

**Purpose:** Coordinate crawler execution, manage queue, monitor status

**Specifications:**
```yaml
Machine Type: n2-standard-2 (2 vCPU, 8 GB RAM)
Region: us-central1
Zone: us-central1-a
Boot Disk: 50 GB SSD
OS: Ubuntu 22.04 LTS
Network: Default VPC with Cloud NAT

Metadata:
  startup-script: |
    #!/bin/bash
    # Install Node.js 20.x
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs

    # Install pnpm
    npm install -g pnpm

    # Setup application
    mkdir -p /opt/crawler-orchestrator
    cd /opt/crawler-orchestrator
    # Clone repo & install dependencies (done via deployment script)
```

**Services Running:**
- Orchestrator API (Express/Fastify)
- Cloud Tasks queue consumer
- Cloud Scheduler HTTP target
- Prometheus metrics exporter

**IAM Roles:**
- `roles/cloudscheduler.jobRunner` - Trigger scheduled jobs
- `roles/cloudtasks.enqueuer` - Create tasks
- `roles/logging.logWriter` - Write logs
- `roles/monitoring.metricWriter` - Write metrics

#### 2. Crawler Worker VMs (`crawler-worker-1`, `crawler-worker-2`, `crawler-worker-3`)

**Purpose:** Execute crawlers in parallel

**Specifications:**
```yaml
Machine Type: e2-medium (2 vCPU, 4 GB RAM)
Region: us-central1
Zone: us-central1-a (distribute across zones for HA)
Boot Disk: 30 GB SSD
OS: Ubuntu 22.04 LTS
Managed Instance Group: Yes (auto-scaling 1-5 instances)

Auto-scaling Policy:
  Min Instances: 1
  Max Instances: 5
  Target CPU: 70%
  Scale-in Time: 300s
```

**Services Running:**
- Crawler execution engine
- Cloud Tasks queue consumer
- GCS uploader
- Pub/Sub publisher

**IAM Roles:**
- `roles/storage.objectCreator` - Write to GCS
- `roles/pubsub.publisher` - Publish events
- `roles/logging.logWriter` - Write logs

#### 3. Embedding Generator VM (`embedding-generator`)

**Purpose:** Generate OpenAI embeddings for new data

**Specifications:**
```yaml
Machine Type: n2-standard-2 (2 vCPU, 8 GB RAM)
Region: us-central1
Zone: us-central1-a
Boot Disk: 30 GB SSD
OS: Ubuntu 22.04 LTS
Preemptible: Yes (cost savings, can retry on failure)
```

**Services Running:**
- Pub/Sub subscriber (listen for new data events)
- OpenAI API client (batch processing)
- GCS uploader (embeddings output)
- Retry queue handler

**IAM Roles:**
- `roles/pubsub.subscriber` - Receive messages
- `roles/storage.objectViewer` - Read raw data
- `roles/storage.objectCreator` - Write embeddings
- `roles/secretmanager.secretAccessor` - Access OpenAI API key

#### 4. Qdrant Loader VM (`sengol-vector-db` - existing)

**Purpose:** Load embeddings into Qdrant vector database

**Current Setup:** Already exists (see EMBEDDINGS_MIGRATION.md)

**New Services:**
- Pub/Sub subscriber (listen for new embeddings)
- Incremental loader (upsert batches)
- PostgreSQL status updater

**IAM Roles (additional):**
- `roles/pubsub.subscriber` - Receive embedding events
- `roles/storage.objectViewer` - Read embeddings from GCS

### GCS Buckets

```yaml
Bucket 1: sengol-crawled-data
  Region: us-central1
  Storage Class: Standard
  Lifecycle Rules:
    - Delete raw data after 90 days
    - Move processed data to Nearline after 30 days
  Structure:
    /raw/
      /{source_type}/
        /{date}/
          /{timestamp}.json
    /processed/
      /{source_type}/
        /{date}/
          /normalized_{timestamp}.json
    /embeddings/
      /{source_type}/
        /{date}/
          /embeddings_{timestamp}.jsonl

Bucket 2: sengol-crawler-configs
  Region: us-central1
  Storage Class: Standard
  Structure:
    /sources/
      /source_registry.json
      /auto_discovered.json
    /schemas/
      /{source_type}_schema.json

Bucket 3: sengol-crawler-logs (optional)
  Region: us-central1
  Storage Class: Standard
  Lifecycle: Delete after 30 days
```

### Cloud Services

#### Cloud Scheduler Jobs

```yaml
Job 1: crawler-orchestrator-trigger
  Schedule: "0 */2 * * *" (every 2 hours)
  Target: HTTP
  URL: http://crawler-orchestrator.internal/api/trigger
  Method: POST
  Auth: OIDC Token

Job 2: high-priority-regulatory
  Schedule: "0 */6 * * *" (every 6 hours)
  Target: HTTP
  URL: http://crawler-orchestrator.internal/api/trigger?category=regulatory
  Method: POST

Job 3: embedding-generator-trigger
  Schedule: "*/15 * * * *" (every 15 minutes)
  Target: HTTP
  URL: http://embedding-generator.internal/api/process-pending
  Method: POST

Job 4: health-check
  Schedule: "*/5 * * * *" (every 5 minutes)
  Target: HTTP
  URL: http://crawler-orchestrator.internal/api/health
  Method: GET
```

#### Cloud Tasks Queues

```yaml
Queue 1: crawler-tasks
  Rate Limit: 100/second
  Max Concurrent: 50
  Max Attempts: 3
  Max Retry Duration: 1 hour

Queue 2: embedding-tasks
  Rate Limit: 50/second
  Max Concurrent: 10
  Max Attempts: 5
  Max Retry Duration: 6 hours

Queue 3: qdrant-loader-tasks
  Rate Limit: 20/second
  Max Concurrent: 5
  Max Attempts: 3
  Max Retry Duration: 30 minutes
```

#### Pub/Sub Topics

```yaml
Topic 1: crawler-data-ready
  Subscribers:
    - embedding-generator-subscription (push to VM)
  Message Schema:
    {
      source_type: string
      source_id: string
      file_path: string (GCS path)
      record_count: number
      timestamp: ISO8601
    }

Topic 2: embeddings-ready
  Subscribers:
    - qdrant-loader-subscription (push to VM)
  Message Schema:
    {
      source_type: string
      file_path: string (GCS path)
      embedding_count: number
      model: "text-embedding-3-small"
      dimensions: 1536
      timestamp: ISO8601
    }

Topic 3: crawler-errors
  Subscribers:
    - error-alert-subscription (push to Cloud Functions)
    - admin-notifications
  Message Schema:
    {
      crawler_type: string
      error_type: string
      error_message: string
      source_url: string
      timestamp: ISO8601
    }
```

### Cloud Monitoring

```yaml
Dashboards:
  1. Crawler Overview
     - Active crawlers count
     - Success rate (24h)
     - Data volume (records/hour)
     - Error rate by source

  2. Embedding Pipeline
     - Pending embeddings count
     - Generation rate (embeddings/min)
     - OpenAI API usage
     - Cost tracking

  3. Qdrant Status
     - Total vectors
     - Insert rate
     - Search latency
     - Index health

Alerts:
  1. Crawler Failure Rate > 20% (30 min window)
  2. Embedding Queue Backlog > 10,000 records
  3. Qdrant Insert Lag > 1 hour
  4. OpenAI API Errors > 5 in 5 minutes
  5. VM CPU > 80% for 10 minutes
  6. Disk Usage > 80%
```

---

## Crawler Source Management

### 1. Auto-Discovery Engine

**Purpose:** Automatically discover new data sources based on patterns and heuristics

**Implementation:** `/lib/source-discovery/auto-discovery.ts`

```typescript
interface SourceDiscoveryConfig {
  searchDomains: string[] // e.g., ["*.gov", "*.edu", "*.org"]
  keywords: string[]       // e.g., ["AI incidents", "AI regulation"]
  detectTypes: string[]    // e.g., ["rss", "api", "sitemap"]
  minQualityScore: number  // 0-100
}

class AutoDiscoveryEngine {
  /**
   * Discover RSS feeds from a domain
   */
  async discoverRSSFeeds(domain: string): Promise<RSSSource[]> {
    // 1. Fetch homepage
    const html = await fetchPage(domain)

    // 2. Look for <link rel="alternate" type="application/rss+xml">
    const rssLinks = parseRSSLinks(html)

    // 3. Check common paths: /feed, /rss, /atom.xml
    const commonPaths = ['/feed', '/rss', '/atom.xml', '/feed.xml']

    // 4. Validate feeds
    const validFeeds = []
    for (const feed of [...rssLinks, ...commonPaths]) {
      try {
        const feedData = await fetchFeed(feed)
        if (isValidFeed(feedData)) {
          validFeeds.push({
            url: feed,
            title: feedData.title,
            lastUpdated: feedData.lastBuildDate,
            itemCount: feedData.items.length
          })
        }
      } catch (error) {
        // Skip invalid feeds
      }
    }

    return validFeeds
  }

  /**
   * Discover API endpoints from a domain
   */
  async discoverAPIs(domain: string): Promise<APISource[]> {
    // 1. Check for common API documentation paths
    const docPaths = [
      '/api/docs',
      '/api-docs',
      '/swagger.json',
      '/openapi.json',
      '/v1/docs',
      '/.well-known/openapi'
    ]

    // 2. Parse OpenAPI/Swagger specs
    for (const path of docPaths) {
      try {
        const spec = await fetchJSON(`${domain}${path}`)
        if (spec.openapi || spec.swagger) {
          return parseOpenAPISpec(spec, domain)
        }
      } catch (error) {
        // Try next path
      }
    }

    // 3. Heuristic detection (look for common patterns)
    // Check for /api/, /v1/, /graphql, etc.
    const heuristics = [
      { pattern: /\/api\/.*\/.*/, method: 'GET' },
      { pattern: /\/v\d+\/.*/, method: 'GET' },
      { pattern: /\/graphql$/, method: 'POST' }
    ]

    return discoverByHeuristics(domain, heuristics)
  }

  /**
   * Discover from sitemaps
   */
  async discoverFromSitemap(domain: string): Promise<WebSource[]> {
    // 1. Try common sitemap locations
    const sitemapURLs = [
      `${domain}/sitemap.xml`,
      `${domain}/sitemap_index.xml`,
      `${domain}/sitemap/sitemap.xml`
    ]

    // 2. Check robots.txt for sitemap declaration
    const robotsTxt = await fetchRobotsTxt(domain)
    const declaredSitemaps = parseRobotsTxtSitemaps(robotsTxt)
    sitemapURLs.push(...declaredSitemaps)

    // 3. Parse sitemaps
    for (const url of sitemapURLs) {
      try {
        const sitemap = await fetchSitemap(url)
        const urls = parseSitemapURLs(sitemap)

        // 4. Filter by keywords
        const relevantURLs = urls.filter(u =>
          this.config.keywords.some(kw => u.toLowerCase().includes(kw.toLowerCase()))
        )

        return relevantURLs.map(url => ({
          url,
          discoveryMethod: 'sitemap',
          lastModified: extractLastMod(sitemap, url)
        }))
      } catch (error) {
        // Try next sitemap
      }
    }

    return []
  }

  /**
   * Quality scoring for discovered sources
   */
  async scoreSource(source: DiscoveredSource): Promise<number> {
    let score = 0

    // 1. Domain authority (check if .gov, .edu, known org)
    if (source.domain.endsWith('.gov')) score += 30
    else if (source.domain.endsWith('.edu')) score += 25
    else if (isKnownOrganization(source.domain)) score += 20

    // 2. Content quality (keyword relevance)
    const keywordMatches = countKeywordMatches(source.content, this.config.keywords)
    score += Math.min(keywordMatches * 5, 30)

    // 3. Update frequency
    if (source.updateFrequency === 'daily') score += 20
    else if (source.updateFrequency === 'weekly') score += 15
    else if (source.updateFrequency === 'monthly') score += 10

    // 4. Data structure (API > RSS > Web scraping)
    if (source.type === 'api') score += 20
    else if (source.type === 'rss') score += 15
    else if (source.type === 'web') score += 10

    return Math.min(score, 100)
  }

  /**
   * Main discovery workflow
   */
  async discoverSources(domains: string[]): Promise<DiscoveredSource[]> {
    const discovered: DiscoveredSource[] = []

    for (const domain of domains) {
      console.log(`🔍 Discovering sources from: ${domain}`)

      // Run discovery methods in parallel
      const [rss, apis, sitemap] = await Promise.all([
        this.discoverRSSFeeds(domain),
        this.discoverAPIs(domain),
        this.discoverFromSitemap(domain)
      ])

      // Combine results
      const sources = [
        ...rss.map(s => ({ ...s, type: 'rss' })),
        ...apis.map(s => ({ ...s, type: 'api' })),
        ...sitemap.map(s => ({ ...s, type: 'web' }))
      ]

      // Score and filter
      for (const source of sources) {
        const score = await this.scoreSource(source)
        if (score >= this.config.minQualityScore) {
          discovered.push({ ...source, qualityScore: score })
        }
      }
    }

    // Sort by quality score
    return discovered.sort((a, b) => b.qualityScore - a.qualityScore)
  }
}
```

**Usage:**

```typescript
const engine = new AutoDiscoveryEngine({
  searchDomains: [
    'https://www.ftc.gov',
    'https://www.federalregister.gov',
    'https://oecd.ai',
    'https://incidentdatabase.ai',
    'https://algorithmwatch.org'
  ],
  keywords: [
    'artificial intelligence',
    'AI regulation',
    'AI incident',
    'machine learning',
    'algorithmic bias'
  ],
  detectTypes: ['rss', 'api', 'sitemap'],
  minQualityScore: 60
})

const discovered = await engine.discoverSources(engine.config.searchDomains)

// Save to database
for (const source of discovered) {
  await prisma.source_registry.create({
    data: {
      source_url: source.url,
      source_type: source.type,
      discovery_method: 'auto',
      quality_score: source.qualityScore,
      status: 'pending_review',  // Requires manual approval
      discovered_at: new Date()
    }
  })
}
```

### 2. Manual Source Registry

**Database Schema:**

```sql
CREATE TABLE source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Basic Info
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  source_type VARCHAR(50) NOT NULL, -- 'rss', 'api', 'web', 'graphql'
  category VARCHAR(50) NOT NULL,     -- 'regulatory', 'incidents', 'news', 'research'

  -- Discovery
  discovery_method VARCHAR(50) DEFAULT 'manual', -- 'manual', 'auto'
  quality_score INTEGER,              -- 0-100
  discovered_at TIMESTAMP,

  -- Configuration
  enabled BOOLEAN DEFAULT false,
  priority INTEGER DEFAULT 10,        -- 1-100 (1=highest)
  schedule_cron VARCHAR(50),          -- e.g., '0 */6 * * *'
  crawler_class VARCHAR(100),         -- e.g., 'APICrawler', 'RSSCrawler'

  -- Crawl Parameters (JSONB for flexibility)
  crawl_config JSONB DEFAULT '{}',    -- Source-specific settings
  /* Example:
  {
    "api_endpoint": "/api/v1/incidents",
    "auth_type": "bearer",
    "rate_limit": 100,
    "pagination": {
      "type": "cursor",
      "page_size": 100
    },
    "fields": ["id", "title", "description"],
    "filters": {
      "date_from": "2024-01-01"
    }
  }
  */

  -- Target Storage
  data_table VARCHAR(100),            -- PostgreSQL table name
  gcs_path_template VARCHAR(255),     -- e.g., 'raw/{source_type}/{date}/'

  -- Metadata
  description TEXT,
  tags TEXT[],
  contact_email VARCHAR(255),
  documentation_url TEXT,

  -- Status Tracking
  status VARCHAR(50) DEFAULT 'active', -- 'active', 'paused', 'deprecated', 'pending_review'
  last_crawled_at TIMESTAMP,
  last_success_at TIMESTAMP,
  consecutive_failures INTEGER DEFAULT 0,

  -- Audit
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(100),
  updated_by VARCHAR(100),

  -- Indexes
  INDEX idx_source_type (source_type),
  INDEX idx_category (category),
  INDEX idx_enabled_priority (enabled, priority),
  INDEX idx_status (status)
);
```

**Admin UI for Manual Management:**

Location: `/app/(admin)/crawler-sources/page.tsx`

Features:
- **List View:** All sources with status, last crawl, success rate
- **Add New Source:** Form with validation
- **Edit Source:** Update config, priority, schedule
- **Enable/Disable:** Toggle sources on/off
- **Test Crawl:** Run single crawl to validate config
- **View Logs:** See execution history
- **Bulk Actions:** Enable/disable multiple sources

**API Endpoints:**

```typescript
// GET /api/admin/sources
// List all sources with filtering
router.get('/sources', async (req, res) => {
  const { category, status, enabled } = req.query

  const sources = await prisma.source_registry.findMany({
    where: {
      category: category as string,
      status: status as string,
      enabled: enabled === 'true'
    },
    orderBy: { priority: 'asc' }
  })

  res.json({ sources })
})

// POST /api/admin/sources
// Create new source
router.post('/sources', async (req, res) => {
  const { source_name, source_url, source_type, category, crawl_config } = req.body

  // Validate URL
  if (!isValidURL(source_url)) {
    return res.status(400).json({ error: 'Invalid URL' })
  }

  // Check for duplicates
  const existing = await prisma.source_registry.findUnique({
    where: { source_url }
  })
  if (existing) {
    return res.status(409).json({ error: 'Source already exists' })
  }

  const source = await prisma.source_registry.create({
    data: {
      source_name,
      source_url,
      source_type,
      category,
      crawl_config,
      discovery_method: 'manual',
      created_by: req.user.email
    }
  })

  res.json({ source })
})

// PUT /api/admin/sources/:id
// Update source configuration
router.put('/sources/:id', async (req, res) => {
  const { id } = req.params
  const updates = req.body

  const source = await prisma.source_registry.update({
    where: { id },
    data: {
      ...updates,
      updated_by: req.user.email,
      updated_at: new Date()
    }
  })

  res.json({ source })
})

// POST /api/admin/sources/:id/test
// Test crawl a source
router.post('/sources/:id/test', async (req, res) => {
  const { id } = req.params

  const source = await prisma.source_registry.findUnique({ where: { id } })
  if (!source) {
    return res.status(404).json({ error: 'Source not found' })
  }

  // Execute test crawl
  const crawler = await instantiateCrawler(source)
  const result = await crawler.crawl({ limit: 10, dryRun: true })

  res.json({ result })
})

// POST /api/admin/sources/:id/approve
// Approve auto-discovered source
router.post('/sources/:id/approve', async (req, res) => {
  const { id } = req.params
  const { enabled, priority, schedule_cron } = req.body

  const source = await prisma.source_registry.update({
    where: { id },
    data: {
      status: 'active',
      enabled,
      priority,
      schedule_cron,
      updated_by: req.user.email
    }
  })

  res.json({ source })
})
```

### 3. Source Templates

**Pre-configured Templates for Common Source Types:**

```typescript
// templates/source-templates.ts

export const SOURCE_TEMPLATES = {
  federal_register: {
    source_type: 'api',
    crawler_class: 'APICrawler',
    crawl_config: {
      api_endpoint: 'https://www.federalregister.gov/api/v1/documents.json',
      method: 'GET',
      params: {
        conditions: {
          term: 'artificial intelligence OR machine learning',
          publication_date: { gte: '{{date_from}}' }
        },
        per_page: 100,
        page: '{{page}}'
      },
      pagination: {
        type: 'page_number',
        page_param: 'page',
        max_pages: 100
      },
      rate_limit: {
        requests: 1,
        per_seconds: 1
      }
    },
    data_table: 'scraped_financial_data',
    schedule_cron: '0 */6 * * *'
  },

  arxiv: {
    source_type: 'api',
    crawler_class: 'APICrawler',
    crawl_config: {
      api_endpoint: 'http://export.arxiv.org/api/query',
      method: 'GET',
      params: {
        search_query: 'all:artificial+intelligence OR all:machine+learning',
        sortBy: 'submittedDate',
        sortOrder: 'descending',
        start: '{{offset}}',
        max_results: 100
      },
      response_format: 'xml',
      parser: 'fast-xml-parser',
      pagination: {
        type: 'offset',
        offset_param: 'start',
        limit: 5000
      },
      rate_limit: {
        requests: 1,
        per_seconds: 3
      }
    },
    data_table: 'research_papers',
    schedule_cron: '0 2 * * *'
  },

  rss_generic: {
    source_type: 'rss',
    crawler_class: 'RSSCrawler',
    crawl_config: {
      feed_url: '{{feed_url}}',
      fields: ['title', 'link', 'pubDate', 'description', 'content'],
      filters: {
        keywords: ['AI', 'artificial intelligence', 'machine learning']
      }
    },
    data_table: 'ai_news',
    schedule_cron: '0 */4 * * *'
  },

  web_scraping_generic: {
    source_type: 'web',
    crawler_class: 'WebCrawler',
    crawl_config: {
      start_url: '{{start_url}}',
      selectors: {
        items: '.article',
        title: 'h2.title',
        link: 'a.read-more @href',
        date: 'time @datetime',
        description: '.summary'
      },
      pagination: {
        type: 'next_link',
        selector: 'a.next-page @href'
      },
      rate_limit: {
        requests: 1,
        per_seconds: 3
      }
    },
    data_table: 'ai_incidents',
    schedule_cron: '0 2 * * *'
  }
}

// Usage in Admin UI
function createSourceFromTemplate(templateKey: string, overrides: any) {
  const template = SOURCE_TEMPLATES[templateKey]
  return {
    ...template,
    ...overrides,
    crawl_config: {
      ...template.crawl_config,
      ...overrides.crawl_config
    }
  }
}
```

---

## Orchestrator Implementation

### Core Orchestrator Service

**File:** `/lib/orchestrator/crawler-orchestrator-gce.ts`

```typescript
import { PrismaClient } from '@prisma/client'
import { CloudTasksClient } from '@google-cloud/tasks'
import { PubSub } from '@google-cloud/pubsub'
import { Storage } from '@google-cloud/storage'

const prisma = new PrismaClient()
const tasksClient = new CloudTasksClient()
const pubsub = new PubSub()
const storage = new Storage()

interface OrchestratorConfig {
  projectId: string
  region: string
  queueName: string
  workerUrl: string
}

class CrawlerOrchestrator {
  private config: OrchestratorConfig
  private isRunning: boolean = false

  constructor(config: OrchestratorConfig) {
    this.config = config
  }

  /**
   * Main orchestration loop
   * Triggered by Cloud Scheduler
   */
  async execute(options?: {
    category?: string
    priority?: number
    sourceIds?: string[]
  }) {
    if (this.isRunning) {
      console.log('⚠️  Orchestrator already running, skipping...')
      return { status: 'skipped', reason: 'already_running' }
    }

    this.isRunning = true
    console.log('🚀 Starting Crawler Orchestrator')

    try {
      // 1. Load sources from database
      const sources = await this.loadSources(options)
      console.log(`📊 Loaded ${sources.length} sources`)

      // 2. Filter and sort
      const eligible = this.filterEligibleSources(sources)
      console.log(`✅ ${eligible.length} eligible for crawling`)

      // 3. Create tasks for workers
      const tasks = await this.createWorkerTasks(eligible)
      console.log(`📤 Created ${tasks.length} worker tasks`)

      // 4. Monitor execution (async)
      this.monitorExecution(tasks)

      return {
        status: 'success',
        sources_loaded: sources.length,
        sources_eligible: eligible.length,
        tasks_created: tasks.length
      }
    } catch (error) {
      console.error('❌ Orchestrator error:', error)
      throw error
    } finally {
      this.isRunning = false
    }
  }

  /**
   * Load sources from database
   */
  private async loadSources(options?: {
    category?: string
    priority?: number
    sourceIds?: string[]
  }) {
    const where: any = {
      enabled: true,
      status: 'active'
    }

    if (options?.category) {
      where.category = options.category
    }

    if (options?.priority) {
      where.priority = { lte: options.priority }
    }

    if (options?.sourceIds?.length) {
      where.id = { in: options.sourceIds }
    }

    return prisma.source_registry.findMany({
      where,
      orderBy: { priority: 'asc' }
    })
  }

  /**
   * Filter sources that are eligible for crawling
   */
  private filterEligibleSources(sources: any[]) {
    return sources.filter(source => {
      // Skip if recently crawled (based on schedule)
      if (source.last_crawled_at) {
        const minInterval = this.getMinIntervalFromCron(source.schedule_cron)
        const elapsed = Date.now() - source.last_crawled_at.getTime()
        if (elapsed < minInterval) {
          console.log(`⏭️  Skipping ${source.source_name} (crawled ${elapsed}ms ago)`)
          return false
        }
      }

      // Skip if too many consecutive failures
      if (source.consecutive_failures >= 5) {
        console.log(`⚠️  Skipping ${source.source_name} (too many failures)`)
        return false
      }

      return true
    })
  }

  /**
   * Create Cloud Tasks for worker VMs
   */
  private async createWorkerTasks(sources: any[]) {
    const parent = tasksClient.queuePath(
      this.config.projectId,
      this.config.region,
      this.config.queueName
    )

    const tasks = []

    for (const source of sources) {
      const task = {
        httpRequest: {
          httpMethod: 'POST' as const,
          url: `${this.config.workerUrl}/crawl`,
          headers: {
            'Content-Type': 'application/json'
          },
          body: Buffer.from(JSON.stringify({
            source_id: source.id,
            source_url: source.source_url,
            source_type: source.source_type,
            crawler_class: source.crawler_class,
            crawl_config: source.crawl_config,
            data_table: source.data_table,
            gcs_path_template: source.gcs_path_template
          })).toString('base64')
        },
        scheduleTime: {
          seconds: Math.floor(Date.now() / 1000) + (tasks.length * 2) // Stagger by 2 seconds
        }
      }

      const [response] = await tasksClient.createTask({ parent, task })
      tasks.push({
        taskName: response.name,
        sourceId: source.id,
        sourceName: source.source_name
      })

      // Update last_crawled_at immediately to prevent duplicate scheduling
      await prisma.source_registry.update({
        where: { id: source.id },
        data: { last_crawled_at: new Date() }
      })
    }

    return tasks
  }

  /**
   * Monitor task execution and update status
   */
  private async monitorExecution(tasks: any[]) {
    // This runs asynchronously
    setTimeout(async () => {
      for (const task of tasks) {
        try {
          const execution = await prisma.crawler_executions.findFirst({
            where: {
              source_id: task.sourceId,
              started_at: { gte: new Date(Date.now() - 60000) } // Last minute
            },
            orderBy: { started_at: 'desc' }
          })

          if (execution) {
            console.log(`✅ ${task.sourceName}: ${execution.status}`)

            // Update source status
            if (execution.status === 'completed') {
              await prisma.source_registry.update({
                where: { id: task.sourceId },
                data: {
                  last_success_at: execution.completed_at,
                  consecutive_failures: 0
                }
              })
            } else if (execution.status === 'failed') {
              await prisma.source_registry.update({
                where: { id: task.sourceId },
                data: {
                  consecutive_failures: { increment: 1 }
                }
              })
            }
          }
        } catch (error) {
          console.error(`❌ Error monitoring ${task.sourceName}:`, error)
        }
      }
    }, 60000) // Check after 1 minute
  }

  /**
   * Parse cron to get minimum interval in milliseconds
   */
  private getMinIntervalFromCron(cron: string): number {
    // Simple heuristic - can be improved
    if (cron.includes('*/1 ')) return 60000         // 1 minute
    if (cron.includes('*/5 ')) return 300000        // 5 minutes
    if (cron.includes('*/15 ')) return 900000       // 15 minutes
    if (cron.includes('*/30 ')) return 1800000      // 30 minutes
    if (cron.includes('* * *')) return 3600000      // 1 hour
    if (cron.includes('0 */2')) return 7200000      // 2 hours
    if (cron.includes('0 */6')) return 21600000     // 6 hours
    if (cron.includes('0 2 *')) return 86400000     // 1 day
    return 3600000 // Default to 1 hour
  }

  /**
   * Health check endpoint
   */
  async healthCheck() {
    const stats = await prisma.source_registry.aggregate({
      _count: {
        id: true
      },
      where: {
        enabled: true
      }
    })

    const recentExecutions = await prisma.crawler_executions.count({
      where: {
        started_at: {
          gte: new Date(Date.now() - 86400000) // Last 24 hours
        }
      }
    })

    const recentFailures = await prisma.crawler_executions.count({
      where: {
        started_at: {
          gte: new Date(Date.now() - 86400000)
        },
        status: 'failed'
      }
    })

    const successRate = recentExecutions > 0
      ? ((recentExecutions - recentFailures) / recentExecutions) * 100
      : 100

    return {
      status: successRate >= 80 ? 'healthy' : successRate >= 50 ? 'degraded' : 'unhealthy',
      is_running: this.isRunning,
      enabled_sources: stats._count.id,
      executions_24h: recentExecutions,
      failures_24h: recentFailures,
      success_rate: Math.round(successRate)
    }
  }
}

// Express/Fastify API endpoints
app.post('/api/trigger', async (req, res) => {
  const { category, priority, source_ids } = req.body

  const orchestrator = new CrawlerOrchestrator({
    projectId: process.env.GCP_PROJECT_ID!,
    region: 'us-central1',
    queueName: 'crawler-tasks',
    workerUrl: process.env.WORKER_URL!
  })

  const result = await orchestrator.execute({
    category,
    priority,
    sourceIds: source_ids
  })

  res.json(result)
})

app.get('/api/health', async (req, res) => {
  const orchestrator = new CrawlerOrchestrator({...})
  const health = await orchestrator.healthCheck()
  res.json(health)
})
```

---

## Data Flow & Storage

### Crawl Execution Flow

```
1. ORCHESTRATOR TRIGGER (Cloud Scheduler)
   ↓
2. LOAD SOURCES (from source_registry)
   ↓
3. FILTER ELIGIBLE SOURCES
   - Check last_crawled_at vs schedule
   - Check consecutive_failures < 5
   - Check enabled = true
   ↓
4. CREATE CLOUD TASKS (one per source)
   - Task payload contains source config
   - Staggered scheduling (2s apart)
   ↓
5. WORKER VM RECEIVES TASK
   ↓
6. INSTANTIATE CRAWLER (based on crawler_class)
   ↓
7. EXECUTE CRAWL
   - Fetch data from source
   - Parse & extract structured data
   - Deduplicate by external_id
   ↓
8. SAVE TO GCS (raw data)
   - Path: gs://sengol-crawled-data/raw/{source_type}/{date}/{timestamp}.json
   - Format: JSONL (one JSON per line)
   ↓
9. PUBLISH PUB/SUB EVENT (crawler-data-ready)
   - Message contains GCS path, record count
   ↓
10. UPDATE EXECUTION STATUS (crawler_executions table)
    - status: 'completed' or 'failed'
    - records_processed, records_new, records_updated
    ↓
11. EMBEDDING GENERATOR TRIGGERED (by Pub/Sub)
    ↓
12. GENERATE EMBEDDINGS
    - Load raw data from GCS
    - Batch process (50 records)
    - Call OpenAI API
    ↓
13. SAVE EMBEDDINGS TO GCS
    - Path: gs://sengol-crawled-data/embeddings/{source_type}/{date}/{timestamp}.jsonl
    - Format: JSONL with embedding vectors
    ↓
14. PUBLISH PUB/SUB EVENT (embeddings-ready)
    ↓
15. QDRANT LOADER TRIGGERED (by Pub/Sub)
    ↓
16. LOAD TO QDRANT
    - Load embeddings from GCS
    - Upsert to Qdrant (batch 100)
    - Update embedding_status in PostgreSQL
    ↓
17. DONE ✅
```

### GCS Storage Structure

```
gs://sengol-crawled-data/
├── raw/
│   ├── regulatory/
│   │   ├── federal_register/
│   │   │   ├── 2025-01-10/
│   │   │   │   ├── 1704873600000.jsonl  (timestamp)
│   │   │   │   └── 1704877200000.jsonl
│   │   │   └── 2025-01-11/
│   │   └── eur_lex/
│   ├── incidents/
│   │   ├── aiaaic/
│   │   ├── aiid/
│   │   └── avid/
│   └── research/
│       ├── arxiv/
│       └── github/
│
├── processed/
│   ├── regulatory/
│   │   └── federal_register/
│   │       └── 2025-01-10/
│   │           └── normalized_1704873600000.jsonl
│   └── ...
│
└── embeddings/
    ├── regulatory/
    │   └── federal_register/
    │       └── 2025-01-10/
    │           └── embeddings_1704873600000.jsonl
    └── ...

Format of raw JSONL:
{"source_id":"federal_register-123","title":"AI Regulation Notice","url":"https://...","content":"...","crawled_at":"2025-01-10T12:00:00Z"}
{"source_id":"federal_register-124","title":"...","url":"...","content":"...","crawled_at":"2025-01-10T12:00:00Z"}

Format of embeddings JSONL:
{"id":"federal_register-123","embedding":[0.123,-0.456,...],"content":"AI Regulation Notice...","metadata":{"source":"federal_register","date":"2025-01-10"}}
{"id":"federal_register-124","embedding":[0.789,-0.012,...],"content":"...","metadata":{...}}
```

---

## Embeddings Pipeline

### Embedding Generator Service

**File:** `/lib/embedding-pipeline/embedding-generator-gce.ts`

```typescript
import { Storage } from '@google-cloud/storage'
import { PubSub } from '@google-cloud/pubsub'
import { PrismaClient } from '@prisma/client'
import OpenAI from 'openai'
import * as readline from 'readline'
import * as fs from 'fs'

const storage = new Storage()
const pubsub = new PubSub()
const prisma = new PrismaClient()
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
})

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const BATCH_SIZE = 50
const RATE_LIMIT_DELAY = 100 // ms between batches

interface EmbeddingTask {
  sourceType: string
  filePath: string
  recordCount: number
}

class EmbeddingGenerator {
  /**
   * Process a new data file from GCS
   */
  async processFile(task: EmbeddingTask) {
    console.log(`🎯 Processing file: ${task.filePath}`)
    console.log(`   Records: ${task.recordCount}`)

    try {
      // 1. Download file from GCS
      const records = await this.downloadAndParse(task.filePath)
      console.log(`📥 Loaded ${records.length} records`)

      // 2. Generate embeddings in batches
      const embeddings = await this.generateEmbeddings(records)
      console.log(`✨ Generated ${embeddings.length} embeddings`)

      // 3. Upload to GCS
      const embeddingPath = this.getEmbeddingPath(task.filePath)
      await this.uploadEmbeddings(embeddingPath, embeddings)
      console.log(`📤 Uploaded to: ${embeddingPath}`)

      // 4. Publish event for Qdrant loader
      await this.publishEmbeddingsReady({
        sourceType: task.sourceType,
        filePath: embeddingPath,
        embeddingCount: embeddings.length
      })
      console.log(`✅ Published embeddings-ready event`)

      return {
        status: 'success',
        embeddings_generated: embeddings.length,
        output_path: embeddingPath
      }
    } catch (error) {
      console.error(`❌ Error processing file:`, error)
      throw error
    }
  }

  /**
   * Download and parse JSONL from GCS
   */
  private async downloadAndParse(gcsPath: string): Promise<any[]> {
    const [bucket, ...pathParts] = gcsPath.replace('gs://', '').split('/')
    const filePath = pathParts.join('/')

    const file = storage.bucket(bucket).file(filePath)
    const [exists] = await file.exists()

    if (!exists) {
      throw new Error(`File not found: ${gcsPath}`)
    }

    // Stream download and parse JSONL
    const records: any[] = []
    const readStream = file.createReadStream()
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      if (line.trim()) {
        try {
          records.push(JSON.parse(line))
        } catch (error) {
          console.warn(`⚠️  Failed to parse line: ${line.substring(0, 50)}...`)
        }
      }
    }

    return records
  }

  /**
   * Generate embeddings using OpenAI API
   */
  private async generateEmbeddings(records: any[]): Promise<any[]> {
    const embeddings: any[] = []

    // Process in batches
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE)

      // Extract text for embedding
      const texts = batch.map(r => this.extractEmbeddingText(r))

      try {
        console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)} (${batch.length} records)`)

        // Call OpenAI API
        const response = await openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: texts,
          dimensions: EMBEDDING_DIMENSIONS
        })

        // Combine with original records
        for (let j = 0; j < batch.length; j++) {
          embeddings.push({
            id: records[i + j].source_id || records[i + j].id,
            embedding: response.data[j].embedding,
            content: texts[j].substring(0, 1000), // Truncate for storage
            metadata: {
              source: records[i + j].source || records[i + j].source_type,
              crawled_at: records[i + j].crawled_at,
              ...this.extractMetadata(records[i + j])
            },
            embedding_model: EMBEDDING_MODEL,
            embedding_dimensions: EMBEDDING_DIMENSIONS,
            generated_at: new Date().toISOString()
          })
        }

        // Rate limiting
        await this.delay(RATE_LIMIT_DELAY)
      } catch (error) {
        console.error(`❌ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, error)

        // Add dummy embeddings for failed batch (or skip)
        for (const record of batch) {
          embeddings.push({
            id: record.source_id || record.id,
            embedding: null,
            content: texts[batch.indexOf(record)].substring(0, 1000),
            metadata: { error: 'embedding_failed' },
            generated_at: new Date().toISOString()
          })
        }
      }
    }

    return embeddings
  }

  /**
   * Extract text for embedding generation
   */
  private extractEmbeddingText(record: any): string {
    // Different extraction strategies based on record type
    const parts: string[] = []

    // Title
    if (record.title) parts.push(record.title)

    // Description/Abstract
    if (record.description) parts.push(record.description)
    if (record.abstract) parts.push(record.abstract)

    // Content (truncated)
    if (record.content) parts.push(record.content.substring(0, 5000))
    if (record.text) parts.push(record.text.substring(0, 5000))

    // Categories/Tags
    if (record.categories) parts.push(`Categories: ${record.categories.join(', ')}`)
    if (record.tags) parts.push(`Tags: ${record.tags.join(', ')}`)

    // Organizations/Authors
    if (record.organization) parts.push(`Organization: ${record.organization}`)
    if (record.authors) parts.push(`Authors: ${record.authors.join(', ')}`)

    return parts.join('\n\n').substring(0, 8000) // OpenAI token limit ~8192
  }

  /**
   * Extract relevant metadata
   */
  private extractMetadata(record: any): any {
    return {
      type: record.type || record.source_type,
      category: record.category,
      severity: record.severity,
      industry: record.industry,
      date: record.incident_date || record.published_date || record.date,
      url: record.source_url || record.url
    }
  }

  /**
   * Upload embeddings to GCS
   */
  private async uploadEmbeddings(gcsPath: string, embeddings: any[]) {
    const [bucket, ...pathParts] = gcsPath.replace('gs://', '').split('/')
    const filePath = pathParts.join('/')

    // Convert to JSONL
    const jsonl = embeddings.map(e => JSON.stringify(e)).join('\n')

    // Upload
    await storage.bucket(bucket).file(filePath).save(jsonl, {
      contentType: 'application/x-ndjson',
      metadata: {
        embedding_model: EMBEDDING_MODEL,
        embedding_count: embeddings.length.toString(),
        generated_at: new Date().toISOString()
      }
    })
  }

  /**
   * Publish embeddings-ready event
   */
  private async publishEmbeddingsReady(data: any) {
    const topic = pubsub.topic('embeddings-ready')
    await topic.publishMessage({
      json: data,
      attributes: {
        sourceType: data.sourceType,
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * Get embedding output path
   */
  private getEmbeddingPath(rawPath: string): string {
    // gs://sengol-crawled-data/raw/regulatory/federal_register/2025-01-10/1704873600000.jsonl
    // → gs://sengol-crawled-data/embeddings/regulatory/federal_register/2025-01-10/embeddings_1704873600000.jsonl
    return rawPath
      .replace('/raw/', '/embeddings/')
      .replace(/(\d+)\.jsonl$/, 'embeddings_$1.jsonl')
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

// Pub/Sub message handler
export async function handlePubSubMessage(message: any) {
  const data = message.json as EmbeddingTask

  const generator = new EmbeddingGenerator()
  await generator.processFile(data)

  message.ack()
}

// HTTP endpoint for manual trigger
app.post('/api/process-pending', async (req, res) => {
  // Find pending raw files in GCS
  const [files] = await storage.bucket('sengol-crawled-data').getFiles({
    prefix: 'raw/',
    delimiter: '/'
  })

  const pending = files.filter(file => {
    // Check if embedding already exists
    const embeddingPath = file.name.replace('/raw/', '/embeddings/')
    return !storage.bucket('sengol-crawled-data').file(embeddingPath).exists()
  })

  console.log(`📊 Found ${pending.length} pending files`)

  const generator = new EmbeddingGenerator()
  const results = []

  for (const file of pending.slice(0, 10)) { // Process max 10 at a time
    try {
      const result = await generator.processFile({
        sourceType: file.name.split('/')[1],
        filePath: `gs://sengol-crawled-data/${file.name}`,
        recordCount: 0 // Unknown
      })
      results.push(result)
    } catch (error) {
      console.error(`❌ Failed to process ${file.name}:`, error)
    }
  }

  res.json({ processed: results.length, results })
})
```

---

## Qdrant Integration

### Incremental Qdrant Loader

**File:** `/lib/qdrant-integration/qdrant-loader-gce.ts`

```typescript
import { Storage } from '@google-cloud/storage'
import { PubSub } from '@google-cloud/pubsub'
import { PrismaClient } from '@prisma/client'
import { QdrantClient } from '@qdrant/js-client-rest'
import * as readline from 'readline'

const storage = new Storage()
const pubsub = new PubSub()
const prisma = new PrismaClient()
const qdrant = new QdrantClient({
  host: 'localhost', // Running on same VM
  port: 6333
})

const COLLECTION_NAME = 'sengol_incidents_full'
const BATCH_SIZE = 100

interface QdrantLoadTask {
  sourceType: string
  filePath: string
  embeddingCount: number
}

class QdrantLoader {
  /**
   * Load embeddings from GCS to Qdrant
   */
  async loadEmbeddings(task: QdrantLoadTask) {
    console.log(`🎯 Loading embeddings: ${task.filePath}`)
    console.log(`   Count: ${task.embeddingCount}`)

    try {
      // 1. Download embeddings from GCS
      const embeddings = await this.downloadEmbeddings(task.filePath)
      console.log(`📥 Loaded ${embeddings.length} embeddings`)

      // 2. Validate collection
      await this.ensureCollection()

      // 3. Upsert to Qdrant in batches
      const inserted = await this.upsertToQdrant(embeddings)
      console.log(`✅ Upserted ${inserted} vectors`)

      // 4. Update PostgreSQL status
      await this.updateEmbeddingStatus(embeddings)
      console.log(`📊 Updated database status`)

      return {
        status: 'success',
        vectors_inserted: inserted
      }
    } catch (error) {
      console.error(`❌ Error loading embeddings:`, error)
      throw error
    }
  }

  /**
   * Download embeddings JSONL from GCS
   */
  private async downloadEmbeddings(gcsPath: string): Promise<any[]> {
    const [bucket, ...pathParts] = gcsPath.replace('gs://', '').split('/')
    const filePath = pathParts.join('/')

    const file = storage.bucket(bucket).file(filePath)
    const embeddings: any[] = []

    const readStream = file.createReadStream()
    const rl = readline.createInterface({
      input: readStream,
      crlfDelay: Infinity
    })

    for await (const line of rl) {
      if (line.trim()) {
        try {
          const embedding = JSON.parse(line)
          // Skip if embedding generation failed
          if (embedding.embedding && Array.isArray(embedding.embedding)) {
            embeddings.push(embedding)
          }
        } catch (error) {
          console.warn(`⚠️  Failed to parse embedding line`)
        }
      }
    }

    return embeddings
  }

  /**
   * Ensure collection exists with correct configuration
   */
  private async ensureCollection() {
    try {
      await qdrant.getCollection(COLLECTION_NAME)
      console.log(`✅ Collection exists: ${COLLECTION_NAME}`)
    } catch (error) {
      console.log(`⚠️  Collection not found, creating...`)
      await qdrant.createCollection(COLLECTION_NAME, {
        vectors: {
          size: 1536,
          distance: 'Cosine'
        },
        optimizers_config: {
          indexing_threshold: 20000
        }
      })
      console.log(`✅ Created collection: ${COLLECTION_NAME}`)
    }
  }

  /**
   * Upsert embeddings to Qdrant in batches
   */
  private async upsertToQdrant(embeddings: any[]): Promise<number> {
    let inserted = 0

    for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
      const batch = embeddings.slice(i, i + BATCH_SIZE)

      const points = batch.map((emb, idx) => ({
        id: this.generatePointId(emb.id),
        vector: emb.embedding,
        payload: {
          content: emb.content,
          source: emb.metadata?.source,
          type: emb.metadata?.type,
          category: emb.metadata?.category,
          severity: emb.metadata?.severity,
          industry: emb.metadata?.industry,
          date: emb.metadata?.date,
          url: emb.metadata?.url,
          source_id: emb.id,
          embedding_model: emb.embedding_model,
          generated_at: emb.generated_at
        }
      }))

      await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points
      })

      inserted += batch.length
      console.log(`   Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(embeddings.length / BATCH_SIZE)}: ${batch.length} vectors`)
    }

    return inserted
  }

  /**
   * Generate consistent point ID from source ID
   */
  private generatePointId(sourceId: string): number {
    // Use hash to generate consistent numeric ID
    let hash = 0
    for (let i = 0; i < sourceId.length; i++) {
      const char = sourceId.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Update embedding_status in PostgreSQL
   */
  private async updateEmbeddingStatus(embeddings: any[]) {
    const sourceIds = embeddings.map(e => e.id)

    // Update across all relevant tables
    const tables = [
      'ai_incidents',
      'ai_vulnerabilities',
      'research_papers',
      'ai_repositories',
      'ai_news',
      'scraped_financial_data'
    ]

    for (const table of tables) {
      try {
        await prisma.$executeRawUnsafe(`
          UPDATE ${table}
          SET
            embedding_status = 'completed',
            embedding_id = external_id,
            embedding_generated_at = NOW()
          WHERE external_id = ANY($1::text[])
        `, sourceIds)
      } catch (error) {
        // Table might not have these fields, skip
        console.warn(`⚠️  Could not update ${table}`)
      }
    }
  }
}

// Pub/Sub message handler
export async function handlePubSubMessage(message: any) {
  const data = message.json as QdrantLoadTask

  const loader = new QdrantLoader()
  await loader.loadEmbeddings(data)

  message.ack()
}

// HTTP endpoint for manual trigger
app.post('/api/load-pending', async (req, res) => {
  // Find pending embedding files in GCS
  const [files] = await storage.bucket('sengol-crawled-data').getFiles({
    prefix: 'embeddings/',
    delimiter: '/'
  })

  console.log(`📊 Found ${files.length} embedding files`)

  const loader = new QdrantLoader()
  const results = []

  for (const file of files.slice(0, 5)) { // Process max 5 at a time
    try {
      const result = await loader.loadEmbeddings({
        sourceType: file.name.split('/')[1],
        filePath: `gs://sengol-crawled-data/${file.name}`,
        embeddingCount: 0
      })
      results.push(result)
    } catch (error) {
      console.error(`❌ Failed to load ${file.name}:`, error)
    }
  }

  res.json({ loaded: results.length, results })
})

// Verify Qdrant status
app.get('/api/qdrant/status', async (req, res) => {
  try {
    const collection = await qdrant.getCollection(COLLECTION_NAME)

    res.json({
      collection: COLLECTION_NAME,
      status: collection.status,
      points_count: collection.points_count,
      indexed_vectors_count: collection.indexed_vectors_count,
      vector_size: collection.config.params.vectors.size,
      distance: collection.config.params.vectors.distance
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

---

## Monitoring & Operations

### Cloud Monitoring Dashboards

**Dashboard 1: Crawler System Overview**

```yaml
Widgets:
  - Crawler Execution Rate (line chart)
    Metric: custom.googleapis.com/crawler/executions
    Aggregation: rate(1m)

  - Success Rate by Category (pie chart)
    Metric: custom.googleapis.com/crawler/success_rate
    Group by: category

  - Active Sources (scorecard)
    Metric: custom.googleapis.com/crawler/active_sources

  - Data Volume (stacked area chart)
    Metric: custom.googleapis.com/crawler/records_processed
    Group by: source_type

  - Error Rate (line chart)
    Metric: custom.googleapis.com/crawler/errors
    Threshold: 10/hour (warning line)
```

**Dashboard 2: Embedding Pipeline**

```yaml
Widgets:
  - Pending Embeddings (scorecard)
    Query: Count records where embedding_status='pending'

  - Embedding Generation Rate (line chart)
    Metric: custom.googleapis.com/embeddings/generation_rate

  - OpenAI API Usage (line chart)
    Metric: custom.googleapis.com/embeddings/api_calls
    Cost calculation overlay

  - Queue Depth (line chart)
    Metric: custom.googleapis.com/embeddings/queue_depth
    Threshold: 10000 (alert line)
```

**Dashboard 3: Qdrant Vector Database**

```yaml
Widgets:
  - Total Vectors (scorecard)
    Metric: custom.googleapis.com/qdrant/points_count

  - Insert Rate (line chart)
    Metric: custom.googleapis.com/qdrant/insert_rate

  - Search Latency (line chart)
    Metric: custom.googleapis.com/qdrant/search_latency_ms
    Percentiles: p50, p95, p99

  - Index Status (gauge)
    Metric: custom.googleapis.com/qdrant/indexed_percentage
    Goal: 100%
```

### Alerting Policies

```yaml
Alert 1: High Crawler Failure Rate
  Condition: crawler_failure_rate > 0.2 for 30 minutes
  Notification: Email + Slack
  Severity: Warning

Alert 2: Embedding Queue Backlog
  Condition: embedding_queue_depth > 10000
  Notification: Email
  Severity: Warning

Alert 3: Qdrant Insert Lag
  Condition: (current_time - last_insert_time) > 1 hour
  Notification: Slack
  Severity: Critical

Alert 4: OpenAI API Errors
  Condition: openai_api_errors > 5 in 5 minutes
  Notification: Email + Slack
  Severity: Critical

Alert 5: VM High CPU
  Condition: cpu_utilization > 0.8 for 10 minutes
  Notification: Slack
  Severity: Warning

Alert 6: Disk Space Low
  Condition: disk_usage > 0.8
  Notification: Email
  Severity: Critical
```

### Logging Strategy

```typescript
// Structured logging with Cloud Logging

import { Logging } from '@google-cloud/logging'
const logging = new Logging()
const log = logging.log('crawler-system')

function logCrawlerStart(source: any) {
  log.write(log.entry({
    severity: 'INFO',
    jsonPayload: {
      event: 'crawler_start',
      source_id: source.id,
      source_name: source.source_name,
      source_type: source.source_type,
      category: source.category,
      priority: source.priority
    }
  }))
}

function logCrawlerComplete(source: any, result: any) {
  log.write(log.entry({
    severity: 'INFO',
    jsonPayload: {
      event: 'crawler_complete',
      source_id: source.id,
      source_name: source.source_name,
      duration_ms: result.duration_ms,
      records_processed: result.totalProcessed,
      records_new: result.newDocuments,
      records_updated: result.updatedDocuments,
      records_failed: result.errors
    }
  }))
}

function logCrawlerError(source: any, error: Error) {
  log.write(log.entry({
    severity: 'ERROR',
    jsonPayload: {
      event: 'crawler_error',
      source_id: source.id,
      source_name: source.source_name,
      error_message: error.message,
      error_stack: error.stack
    }
  }))
}
```

---

## Implementation Phases

### Phase 1: Infrastructure Setup (Week 1)

**Tasks:**
- [ ] Create GCE VMs (orchestrator, workers, embedding-generator)
- [ ] Setup GCS buckets with lifecycle policies
- [ ] Configure Cloud Scheduler jobs
- [ ] Create Cloud Tasks queues
- [ ] Setup Pub/Sub topics and subscriptions
- [ ] Configure IAM roles and service accounts
- [ ] Setup Cloud Monitoring dashboards
- [ ] Configure alerting policies

**Deliverables:**
- All VMs running and accessible
- GCS buckets created with correct permissions
- Cloud services configured
- Basic monitoring in place

### Phase 2: Source Management (Week 2)

**Tasks:**
- [ ] Implement auto-discovery engine
- [ ] Create source_registry database schema
- [ ] Build admin UI for source management
- [ ] Create API endpoints for CRUD operations
- [ ] Migrate existing 15 crawlers to new registry
- [ ] Create source templates for common types
- [ ] Test auto-discovery on known domains
- [ ] Document manual source addition process

**Deliverables:**
- Auto-discovery engine functional
- Admin UI deployed
- All existing sources migrated
- Documentation complete

### Phase 3: Crawler Orchestration (Week 3)

**Tasks:**
- [ ] Implement orchestrator service
- [ ] Port crawler base classes to GCE environment
- [ ] Implement Cloud Tasks integration
- [ ] Create worker service
- [ ] Test priority-based execution
- [ ] Implement deduplication logic
- [ ] Setup GCS storage structure
- [ ] Test end-to-end crawl flow

**Deliverables:**
- Orchestrator running on schedule
- Workers processing tasks
- Data flowing to GCS
- Deduplication working

### Phase 4: Embeddings Pipeline (Week 4)

**Tasks:**
- [ ] Implement embedding generator service
- [ ] Setup Pub/Sub triggers
- [ ] Integrate OpenAI API with rate limiting
- [ ] Implement batch processing
- [ ] Create retry logic for failures
- [ ] Test with sample data
- [ ] Monitor API costs
- [ ] Optimize batch sizes

**Deliverables:**
- Embeddings generating automatically
- Pub/Sub triggers working
- Rate limiting effective
- Cost monitoring in place

### Phase 5: Qdrant Integration (Week 5)

**Tasks:**
- [ ] Implement Qdrant loader service
- [ ] Setup Pub/Sub subscription
- [ ] Create incremental update logic
- [ ] Test with existing collection
- [ ] Verify deduplication
- [ ] Monitor insert performance
- [ ] Setup PostgreSQL status updates
- [ ] Test end-to-end flow

**Deliverables:**
- Qdrant loader operational
- Incremental updates working
- PostgreSQL sync functional
- Performance acceptable

### Phase 6: Testing & Optimization (Week 6)

**Tasks:**
- [ ] Load test orchestrator
- [ ] Test with high volume sources
- [ ] Verify error handling
- [ ] Test recovery from failures
- [ ] Optimize Cloud Tasks queue settings
- [ ] Tune auto-scaling policies
- [ ] Performance profiling
- [ ] Cost optimization

**Deliverables:**
- System tested at scale
- Performance optimized
- Costs within budget
- Documentation updated

---

## Cost Analysis

### Monthly Cost Estimate

**Compute Engine VMs:**
```
Orchestrator (n2-standard-2, 24/7):      $50/month
Worker VMs (e2-medium × 3, 24/7):        $75/month
Embedding Generator (n2-standard-2, 12h/day): $25/month
Qdrant VM (existing, n2d-standard-2):   $50/month
                                        ──────────
Total VMs:                              $200/month
```

**Storage (GCS):**
```
Raw data (100 GB, Standard):             $2.60/month
Processed data (50 GB, Nearline):        $0.65/month
Embeddings (200 GB, Standard):           $5.20/month
                                        ──────────
Total Storage:                           $8.45/month
```

**Cloud Services:**
```
Cloud Scheduler (3 jobs):                Free
Cloud Tasks (queue operations):          $0.10/month
Pub/Sub (message volume):                $0.50/month
Cloud Monitoring:                        Free (basic tier)
Cloud Logging:                           $1.00/month
                                        ──────────
Total Services:                          $1.60/month
```

**OpenAI API:**
```
Embeddings (text-embedding-3-small):
  - 1000 records/day × 500 tokens avg × 30 days = 15M tokens/month
  - Cost: $0.020 per 1M tokens
  - Monthly: 15 × $0.020 = $0.30/month

  - For 10,000 records/day:
  - 150M tokens/month
  - Monthly: 150 × $0.020 = $3.00/month
```

**Total Monthly Cost:**
```
Low Volume (1K records/day):   ~$210/month
Medium Volume (5K records/day): ~$212/month
High Volume (10K records/day):  ~$215/month
```

**Cost Optimizations:**
1. Use preemptible VMs for embedding generator (-60% cost)
2. Use committed use discounts for VMs (-30% cost)
3. Archive old raw data to Coldline after 90 days
4. Implement intelligent batching to reduce API calls
5. Use auto-scaling to run fewer workers during low activity

**Optimized Monthly Cost:** ~$150/month

---

## Next Steps

1. **Review and Approve Plan:**
   - Review architecture decisions
   - Confirm GCE infrastructure setup
   - Approve cost estimates

2. **Phase 1 Execution:**
   - Provision GCE resources
   - Setup networking and IAM
   - Deploy monitoring

3. **Iterative Development:**
   - Follow 6-week implementation plan
   - Weekly checkpoints and reviews
   - Continuous testing and validation

4. **Documentation:**
   - Update operational guides
   - Create runbooks for common issues
   - Document API endpoints

---

**Document Version:** 1.0
**Last Updated:** 2025-01-10
**Status:** Planning Phase
**Next Review:** Weekly during implementation
