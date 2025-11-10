# Sengol Crawler System - Architecture

## System Overview

The Sengol Crawler System is an event-driven, serverless-hybrid architecture deployed on Google Cloud Platform for autonomous data collection, embedding generation, and vector storage.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Cloud Scheduler                             │
│  ┌───────────────────┬───────────────────┬────────────────────┐    │
│  │ Regulatory        │ News Crawlers     │ All Crawlers       │    │
│  │ Crawlers (6h)     │ (4h)              │ Daily (2 AM)       │    │
│  └──────┬────────────┴─────┬─────────────┴────────┬───────────┘    │
│         │                  │                      │                 │
│  ┌──────┴──────────────────┴──────────────────────┴───────────┐    │
│  │ Auto-Discovery Weekly (Sundays)                             │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTP POST
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Crawler Orchestrator API (e2-medium)                   │
│  VM: sengol-crawler-orchestrator (10.128.0.3:3000)                 │
│                                                                      │
│  Endpoints:                                                         │
│  - POST /api/orchestrator/execute                                   │
│  - POST /api/discovery/discover                                     │
│                                                                      │
│  Functions:                                                         │
│  - Receive scheduler triggers                                       │
│  - Query PostgreSQL for active crawler sources                      │
│  - Enqueue tasks to Cloud Tasks queue                               │
│  - Track execution status in database                               │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Cloud Tasks
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  Cloud Tasks Queue                                  │
│  Queue: sengol-crawler-tasks                                        │
│  - Rate limiting: 100 tasks/second                                  │
│  - Retry policy: exponential backoff                                │
│  - Task routing to worker VMs                                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ HTTP POST with task payload
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Crawler Worker (n2-standard-2 preemptible)               │
│  VM: sengol-crawler-worker-1 (10.128.0.4:3000)                     │
│                                                                      │
│  Endpoint:                                                          │
│  - POST /api/worker/execute                                         │
│                                                                      │
│  Functions:                                                         │
│  - Execute crawler scripts (Python/Node.js)                         │
│  - Extract and structure data                                       │
│  - Upload raw JSON to GCS bucket                                    │
│  - Publish completion event to Pub/Sub                              │
│  - Update execution status in database                              │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Upload JSON
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Google Cloud Storage                                   │
│  Bucket: sengol-crawled-data-raw                                    │
│  Path: {source_name}/{timestamp}.json                               │
│  Content: Raw crawled data in JSON format                           │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Pub/Sub message
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Pub/Sub Topic: sengol-data-crawled                     │
│  Message: {sourceId, sourceName, gcsPath, category}                 │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Event trigger
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│        Cloud Function: Embedding Generator (Cloud Run Gen2)         │
│  Function: sengol-embedding-generator                               │
│  Runtime: Python 3.11                                               │
│  Memory: 2GB, Timeout: 540s, Max Instances: 10                      │
│                                                                      │
│  Process:                                                           │
│  1. Download raw data from GCS bucket                               │
│  2. Extract embedding text from records                             │
│  3. Process in batches of 100                                       │
│  4. Call OpenAI API (text-embedding-3-small, 1536 dimensions)       │
│  5. Create JSONL with embeddings and metadata                       │
│  6. Upload to sengol-incidents-elite bucket                         │
│  7. Publish completion event to Pub/Sub                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Upload JSONL
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Google Cloud Storage                                   │
│  Bucket: sengol-incidents-elite                                     │
│  Path: incidents/embeddings/openai-1536/{category}/{source}_{date}.jsonl │
│  Content: Embeddings with vectors and metadata                      │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Pub/Sub message
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│         Pub/Sub Topic: sengol-embeddings-generated                  │
│  Message: {sourceId, sourceName, category, embeddingsPath}          │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Event trigger
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│          Cloud Function: Qdrant Loader (Cloud Run Gen2)             │
│  Function: sengol-qdrant-loader                                     │
│  Runtime: Python 3.11                                               │
│  Memory: 2GB, Timeout: 540s, Max Instances: 10                      │
│                                                                      │
│  Process:                                                           │
│  1. Download JSONL embeddings from GCS                              │
│  2. Parse vectors and metadata                                      │
│  3. Ensure Qdrant collection exists                                 │
│  4. Upsert vectors in batches of 100                                │
│  5. Publish completion event to Pub/Sub                             │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Upsert vectors
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│              Qdrant Vector Database (n2d-standard-2)                │
│  VM: sengol-vector-db (10.128.0.2:6333)                            │
│  Collection: sengol_incidents_full                                  │
│  Vectors: 1536 dimensions, COSINE distance                          │
│                                                                      │
│  Storage:                                                           │
│  - Persistent disk for vector storage                               │
│  - Indexed for fast semantic search                                 │
│  - Metadata filtering support                                       │
└─────────────────────────┬───────────────────────────────────────────┘
                          │ Pub/Sub message
                          ▼
┌─────────────────────────────────────────────────────────────────────┐
│            Pub/Sub Topic: sengol-qdrant-updated                     │
│  Message: {sourceId, sourceName, category, vectorsLoaded}           │
└─────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Cloud Scheduler

**Purpose**: Trigger crawler executions on automated schedules

**Jobs**:
- `regulatory-crawlers-6h`: Every 6 hours (0 */6 * * *)
- `news-crawlers-4h`: Every 4 hours (0 */4 * * *)
- `all-crawlers-daily`: Daily at 2 AM UTC (0 2 * * *)
- `auto-discovery-weekly`: Sundays at 3 AM UTC (0 3 * * 0)
- `stop-orchestrator-vm`: Daily at 9 PM UTC (0 21 * * *)
- `start-orchestrator-vm`: Daily at 6 AM UTC (0 6 * * *)

**Configuration**:
- Location: us-central1
- Timezone: UTC
- Retry policy: Exponential backoff

### 2. Crawler Orchestrator API

**Infrastructure**:
- VM Type: e2-medium (2 vCPUs, 4 GB memory)
- OS: Ubuntu 20.04 LTS
- Internal IP: 10.128.0.3
- Port: 3000

**Responsibilities**:
- Receive HTTP triggers from Cloud Scheduler
- Query PostgreSQL for active crawler sources
- Filter sources based on schedule and priority
- Create Cloud Tasks for each source
- Track execution status in database
- Handle errors and retries

**Service Account**: sengol-orchestrator@elite-striker-477619-p8.iam.gserviceaccount.com

**Auto-Shutdown**:
- Stop: 9 PM UTC daily (saves 13 hours/day)
- Start: 6 AM UTC daily
- Cost savings: ~54%

### 3. Cloud Tasks Queue

**Purpose**: Distribute crawler tasks to worker VMs

**Configuration**:
- Queue Name: sengol-crawler-tasks
- Max Dispatches: 100/second
- Max Attempts: 3
- Retry Interval: Min 30s, Max 300s
- Task Routing: Round-robin to worker VMs

### 4. Crawler Worker

**Infrastructure**:
- VM Type: n2-standard-2 (2 vCPUs, 8 GB memory, preemptible)
- OS: Ubuntu 20.04 LTS
- Internal IP: 10.128.0.4
- Port: 3000

**Responsibilities**:
- Execute crawler scripts (Python, Node.js)
- Handle different source types (APIs, RSS, web scraping)
- Structure and validate data
- Upload to GCS bucket
- Publish Pub/Sub events
- Update database status

**Service Account**: sengol-crawler-worker@elite-striker-477619-p8.iam.gserviceaccount.com

**Preemptible Configuration**:
- Cost: ~80% discount vs. regular VM
- Automatic restart on preemption
- Graceful task termination

### 5. PostgreSQL Database

**Provider**: Neon (managed PostgreSQL)
**Location**: External (not in GCP)

**Key Tables**:
- `crawler_sources`: 15 configured sources
- `crawler_executions`: Execution history and status
- `auto_discovery_suggestions`: AI-generated source suggestions

### 6. Google Cloud Storage

**Bucket 1: sengol-crawled-data-raw**
- Purpose: Store raw crawled JSON data
- Path Structure: `{source_name}/{timestamp}.json`
- Retention: 30 days (lifecycle policy)
- Access: Service accounts only

**Bucket 2: sengol-incidents-elite**
- Purpose: Store embeddings and processed data
- Path Structure: `incidents/embeddings/openai-1536/{category}/{source}_{date}.jsonl`
- Retention: Indefinite
- Access: Service accounts and Cloud Functions

### 7. Pub/Sub Topics

**Topic 1: sengol-data-crawled**
- Trigger: When crawler uploads data to GCS
- Subscriber: Embedding Generator function
- Message Format: `{sourceId, sourceName, gcsPath, category, rawBucket}`

**Topic 2: sengol-embeddings-generated**
- Trigger: When embeddings are generated
- Subscriber: Qdrant Loader function
- Message Format: `{sourceId, sourceName, category, embeddingsPath, recordCount}`

**Topic 3: sengol-qdrant-updated**
- Trigger: When vectors are loaded to Qdrant
- Subscriber: None (logging/monitoring only)
- Message Format: `{sourceId, sourceName, category, vectorsLoaded}`

### 8. Embedding Generator Function

**Platform**: Cloud Run (Gen2)
**Runtime**: Python 3.11
**Trigger**: Pub/Sub (sengol-data-crawled)

**Configuration**:
- Memory: 2GB
- Timeout: 540s (9 minutes)
- Max Instances: 10
- Concurrency: 1 (Pub/Sub default)

**Dependencies**:
- google-cloud-storage==2.14.0
- google-cloud-pubsub==2.19.0
- openai>=1.30.0
- functions-framework==3.5.0

**Process Flow**:
1. Receive Pub/Sub message
2. Download data from GCS (sengol-crawled-data-raw)
3. Extract embedding text based on category
4. Batch records (100 per batch)
5. Call OpenAI API with rate limiting
6. Create JSONL output
7. Upload to GCS (sengol-incidents-elite)
8. Publish to sengol-embeddings-generated

**OpenAI Configuration**:
- Model: text-embedding-3-small
- Dimensions: 1536
- Rate Limit: 0.1s between batches

### 9. Qdrant Loader Function

**Platform**: Cloud Run (Gen2)
**Runtime**: Python 3.11
**Trigger**: Pub/Sub (sengol-embeddings-generated)

**Configuration**:
- Memory: 2GB
- Timeout: 540s (9 minutes)
- Max Instances: 10
- Concurrency: 1 (Pub/Sub default)

**Dependencies**:
- google-cloud-storage==2.14.0
- google-cloud-pubsub==2.19.0
- qdrant-client==1.7.0
- functions-framework==3.5.0

**Process Flow**:
1. Receive Pub/Sub message
2. Download embeddings from GCS
3. Parse JSONL format
4. Ensure collection exists
5. Upsert vectors in batches (100 per batch)
6. Publish to sengol-qdrant-updated

**Qdrant Configuration**:
- Host: 10.128.0.2 (sengol-vector-db)
- Port: 6333
- Collection: sengol_incidents_full
- Distance: COSINE

### 10. Qdrant Vector Database

**Infrastructure**:
- VM Type: n2d-standard-2 (2 vCPUs, 8 GB memory, AMD)
- OS: Ubuntu 20.04 LTS
- Internal IP: 10.128.0.2
- Port: 6333

**Storage**:
- Persistent disk: 100 GB SSD
- Vector index: HNSW
- Quantization: None (full precision)

**Collection Schema**:
```json
{
  "collection_name": "sengol_incidents_full",
  "vectors": {
    "size": 1536,
    "distance": "Cosine"
  },
  "payload": {
    "embedding_id": "string",
    "embedding_text": "string",
    "content": "string (max 1000 chars)",
    "source_file": "string",
    "category": "string",
    "metadata": {
      "title": "string",
      "severity": "string",
      "organization": "string",
      "incident_date": "string"
    }
  }
}
```

## Data Flow

### 1. Scheduled Crawling

```
Cloud Scheduler → Orchestrator API → PostgreSQL (query sources)
                                   → Cloud Tasks (enqueue)
                                   → Worker VM (execute crawler)
                                   → GCS (upload JSON)
                                   → Pub/Sub (publish event)
```

### 2. Embedding Generation

```
Pub/Sub Event → Embedding Generator Function → Download from GCS
                                             → Call OpenAI API
                                             → Upload JSONL to GCS
                                             → Pub/Sub (publish event)
```

### 3. Vector Loading

```
Pub/Sub Event → Qdrant Loader Function → Download from GCS
                                        → Upsert to Qdrant
                                        → Pub/Sub (publish completion)
```

## Scalability

### Horizontal Scaling

- **Worker VMs**: Can add more workers (sengol-crawler-worker-2, etc.)
- **Cloud Functions**: Auto-scale from 0 to 10 instances
- **Cloud Tasks**: Supports unlimited queue depth
- **Qdrant**: Can shard collection across multiple nodes

### Vertical Scaling

- **Orchestrator**: Can upgrade to e2-standard-2 (4 GB → 8 GB)
- **Worker**: Can upgrade to n2-standard-4 (8 GB → 16 GB)
- **Qdrant**: Can upgrade to n2d-standard-4 (8 GB → 16 GB)

## Fault Tolerance

### Retry Mechanisms

- **Cloud Tasks**: 3 retry attempts with exponential backoff
- **Cloud Functions**: Automatic Pub/Sub retry until success
- **Preemptible VMs**: Automatic restart on preemption

### Error Handling

- **Database Failures**: Logged and retried
- **API Failures**: Exponential backoff with circuit breaker
- **Network Failures**: Automatic retry by GCP infrastructure

### Data Durability

- **GCS**: 99.999999999% durability (11 nines)
- **PostgreSQL**: Managed by Neon with automatic backups
- **Qdrant**: Persistent disk with snapshot capability

## Security

### Network Security

- **VMs**: Internal IPs only, no public internet exposure
- **Cloud Functions**: VPC connector (optional, not configured)
- **Qdrant**: Only accessible from internal network

### Access Control

- **Service Accounts**: Principle of least privilege
- **IAM Roles**: Granular permissions per service
- **API Keys**: Stored as environment variables, encrypted at rest

### Data Security

- **In-Transit**: HTTPS for all API calls
- **At-Rest**: GCS encryption by default
- **Secrets**: Google Secret Manager (optional, not configured)

## Monitoring

### Cloud Logging

- All services log to Cloud Logging
- Structured JSON logs
- Retention: 30 days

### Cloud Monitoring

- VM metrics: CPU, memory, disk, network
- Function metrics: Invocations, errors, duration
- Custom metrics: Crawler execution counts, error rates

### Alerting

- Critical errors: Email/SMS notifications
- Cost alerts: Budget threshold monitoring
- Resource alerts: VM/function failures

## Cost Optimization

### Compute Costs

- **Preemptible VMs**: 80% discount on worker
- **Auto-Shutdown**: 54% savings on orchestrator
- **Cloud Functions**: Pay-per-invocation

### Storage Costs

- **GCS Lifecycle**: Delete raw data after 30 days
- **Qdrant**: Compressed vectors (future optimization)

### API Costs

- **OpenAI**: Batch processing, caching (future)
- **Rate Limiting**: Avoid quota overruns

**Target Monthly Cost**: ~$96-99

## Future Enhancements

### Performance
- Redis caching layer for frequently accessed data
- Vector compression/quantization in Qdrant
- Parallel crawler execution per worker

### Features
- AI-driven auto-discovery of new sources
- Real-time streaming instead of batch processing
- Multi-region deployment for HA

### Cost
- Committed use discounts for VMs
- Nearline storage for older embeddings
- OpenAI embedding caching

---

**Last Updated**: 2025-11-10
**Document Version**: 1.0
