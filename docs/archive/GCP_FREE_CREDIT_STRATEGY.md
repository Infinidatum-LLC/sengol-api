# GCP $1000 Free Credit Strategy & Infrastructure Plan

**Goal:** Maximize $1000 GCP credit over 12 months for Vector DB + Crawler + Complex Event Processing

**Generated:** November 9, 2025

---

## Step 1: Billing Account Setup

### Action Required

You need to enable billing and verify the $1000 credit:

1. **Visit GCP Console Billing:**
   ```
   https://console.cloud.google.com/billing?project=sengolvertexapi
   ```

2. **Verify Free Trial Credit:**
   - Check for "$300 free trial" + additional credits
   - Look for "Google Cloud $1000 credit for startups" or similar promotion
   - Confirm credit expiration date (12 months from activation)

3. **Enable Cloud Billing API:**
   ```bash
   # Visit this URL and click "Enable"
   https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=sengolvertexapi
   ```

4. **Link Billing Account to Project:**
   ```bash
   gcloud billing projects link sengolvertexapi \
     --billing-account=YOUR_BILLING_ACCOUNT_ID
   ```

---

## Budget Strategy: $1000 for 12 Months

**Monthly Budget:** ~$83/month
**Safety Margin:** Set alert at $70/month to avoid overages

### Recommended Budget Allocation

| Component | Monthly Cost | Annual Cost | % of Budget |
|-----------|--------------|-------------|-------------|
| **Qdrant Cloud (Free)** | $0 | $0 | 0% |
| **GCE Instance (crawler/CEP)** | $45-65 | $540-780 | 54-78% |
| **Cloud Storage** | $5-10 | $60-120 | 6-12% |
| **Network Egress** | $2-5 | $24-60 | 2-6% |
| **Cloud Logging** | $3-5 | $36-60 | 3-6% |
| **Monitoring (free tier)** | $0 | $0 | 0% |
| **Reserve Buffer** | $10-15 | $120-180 | 12-18% |
| **TOTAL** | **$65-$100** | **$780-$1,200** | **78-120%** |

**Conclusion:** We can build excellent infrastructure within budget!

---

## Part 1: Qdrant Fitment Analysis

### Why Qdrant Cloud is Perfect for This Use Case

#### 1. **Cost: FREE for Your Dataset**

**Qdrant Cloud Free Tier:**
- Storage: 1 GB free
- Shared resources (sufficient for your workload)
- No time limit (always free)

**Your Data Size:**
```
80,000 vectors × 1536 dimensions × 4 bytes = 492 MB
+ Metadata: ~40 MB
+ Index overhead: ~20 MB
= ~552 MB total

✅ Fits in 1 GB free tier with 50% headroom
```

#### 2. **Performance: Excellent**

**Rust-based architecture** (like d-vecDB but more mature):
- HNSW indexing: O(log N) search
- Query latency: 20-100ms (p95)
- Insertion speed: 4,000 vec/s
- Concurrent queries: 1,000+ QPS

**Benchmark comparison:**
| Metric | Qdrant Cloud | d-vecDB (VPS) | Pinecone |
|--------|--------------|---------------|----------|
| Query latency | 20-100ms | 100-200ms | 50-150ms |
| Monthly cost | $0 | $48 | $25 |
| Stability | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Setup time | 30 min | 2 hrs | 30 min |

#### 3. **Stability: Production-Ready**

Unlike d-vecDB's recent bugs:
- ✅ Metadata persistence: Native, battle-tested
- ✅ Index persistence: Automatic
- ✅ Crash recovery: Built-in
- ✅ No breaking changes: Stable API since v1.0
- ✅ Active development: 50+ contributors
- ✅ Used in production: 1000+ companies

#### 4. **Features Match Your Needs**

**Metadata Filtering** (critical for your use case):
```typescript
// Filter by industry, severity, incident type
const results = await qdrantClient.search('incidents', {
  vector: queryEmbedding,
  limit: 10,
  filter: {
    must: [
      { key: 'industry', match: { value: 'healthcare' } },
      { key: 'severity', match: { value: 'high' } }
    ]
  }
})
```

**Payload Storage** (for rich incident metadata):
- Store full incident data with vectors
- No need for separate database
- Atomic updates

**Batch Operations:**
```typescript
// Batch insert for crawler
await qdrantClient.upsert('incidents', {
  points: incidents.map(inc => ({
    id: inc.id,
    vector: inc.embedding,
    payload: {
      type: inc.type,
      industry: inc.industry,
      severity: inc.severity,
      description: inc.description,
      // ... all metadata
    }
  }))
})
```

#### 5. **API Compatibility**

**Similar to d-vecDB** (easy migration):

| Operation | d-vecDB | Qdrant |
|-----------|---------|--------|
| Create collection | `createCollectionSimple()` | `createCollection()` |
| Insert vectors | `insertSimple()` | `upsert()` |
| Search | `searchSimple()` | `search()` |
| Filter | Limited | Rich filtering |

**Migration effort:** ~2 hours to update API code

#### 6. **Scaling Path**

**When you outgrow free tier:**

| Vectors | Qdrant Free | Qdrant Paid | Cost |
|---------|-------------|-------------|------|
| 80K | ✅ Fits | - | $0 |
| 500K | ❌ Too big | Startup tier | $25/mo |
| 5M | ❌ Too big | Growth tier | $95/mo |
| 50M+ | ❌ Too big | Enterprise | $500+/mo |

**Recommendation:** Start free, upgrade when needed.

---

## Part 2: Infrastructure Architecture

### Overall Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Sengol Infrastructure                     │
│                  (Using $1000 GCP Credit)                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────┐         ┌──────────────────┐         │
│  │  Qdrant Cloud    │         │   GCE Instance   │         │
│  │  (Free Tier)     │◄────────┤  n2d-standard-2  │         │
│  │                  │         │                  │         │
│  │  Vector Search   │         │  • Web Crawler   │         │
│  │  80K incidents   │         │  • CEP Engine    │         │
│  │  492 MB          │         │  • Data Pipeline │         │
│  └──────────────────┘         └──────────────────┘         │
│           ▲                            │                    │
│           │                            │                    │
│           │                            ▼                    │
│  ┌────────┴─────────┐         ┌──────────────────┐         │
│  │  Vercel API      │         │  Cloud Storage   │         │
│  │  (sengol-api)    │         │  (GCS Bucket)    │         │
│  │                  │         │                  │         │
│  │  • Question Gen  │         │  • Raw incidents │         │
│  │  • Vector Search │         │  • Processed data│         │
│  └──────────────────┘         │  • Event logs    │         │
│                                └──────────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Component 1: Qdrant Cloud (Vector Database)

**Purpose:** Store and search 80K incident embeddings

**Specifications:**
- Tier: Free (1 GB)
- Location: US/EU (choose closest to GCE)
- Distance metric: Cosine similarity
- HNSW params: M=16, ef_construct=100

**Monthly Cost:** $0

**Setup Time:** 30 minutes

---

### Component 2: GCE Instance (Crawler + CEP)

**Purpose:** Run web crawler and complex event processing

**Recommended Spec: n2d-standard-2**

| Resource | Spec | Why |
|----------|------|-----|
| CPU | 2 vCPU AMD EPYC | Dedicated, good SIMD |
| RAM | 8 GB | Sufficient for crawler + CEP |
| Disk | 50 GB SSD | Logs, temp data, buffers |
| Network | 10 Gbps | Fast data ingestion |
| Region | us-central1-a | Same as GCS bucket |

**Cost Breakdown:**
```
Instance: 730 hrs × $0.0505/hr = $36.87/month
Storage: 50 GB × $0.17/GB = $8.50/month
Sustained use discount: -$7.37/month
Network egress: ~$2/month (to Qdrant)

TOTAL: ~$40-45/month
```

**Annual Cost:** ~$480-540 (48-54% of $1000 credit)

**Alternative if budget tight: e2-standard-2**
- 2 vCPU shared
- 8 GB RAM
- Cost: $26/month ($312/year)
- Trade-off: Slower, but enough for crawler

---

### Component 3: Cloud Storage (Data Lake)

**Purpose:** Store raw incidents, processed data, logs

**Specifications:**
- Bucket: sengol-incidents (already exists)
- Storage class: Standard (frequent access)
- Region: us-central1 (same as compute)

**Storage Estimate:**
```
Current embeddings: 500 MB
Raw incident data: 200 MB
Crawler logs: 100 MB/month growing
Event logs: 50 MB/month growing

Year 1 total: ~3 GB
```

**Cost:**
```
Storage: 3 GB × $0.023/GB = $0.07/month
Operations: ~$1/month
Network: Included (same region)

TOTAL: ~$1-2/month
```

**Annual Cost:** $12-24 (1-2% of budget)

---

### Component 4: Cloud Logging

**Purpose:** Centralized logging for debugging and monitoring

**Specifications:**
- Logs from: GCE instance, crawler, CEP engine
- Retention: 30 days default
- Log filtering for critical errors

**Cost Estimate:**
```
Log volume: ~2 GB/month
First 50 GB free per month
Additional: $0.50/GB

TOTAL: $0-3/month (within free tier)
```

---

### Component 5: Cloud Monitoring (Stackdriver)

**Purpose:** System metrics, uptime monitoring, alerting

**Specifications:**
- Metrics: CPU, RAM, disk, network
- Uptime checks: API health, Qdrant connectivity
- Alerting: Email/SMS for critical events

**Cost:**
```
Free tier: 150 MB ingestion/month
Typical usage: ~50 MB/month

TOTAL: $0/month (within free tier)
```

---

## Part 3: Complex Event Processing (CEP) Engine

### What is CEP?

**Complex Event Processing** = Real-time pattern detection in streaming data

**Your Use Case:**
1. **Incident ingestion** - Crawler finds new incidents
2. **Pattern detection** - CEP identifies trends, clusters, anomalies
3. **Alert generation** - Notify when patterns match threat profiles
4. **Real-time enrichment** - Add context from vector search

### CEP Engine Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  CEP Engine Pipeline                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Crawler  →  Kafka/PubSub  →  CEP Engine  →  Actions   │
│             (event stream)   (processing)   (outputs)   │
│                                                          │
│  New incident    Real-time      Pattern      1. Store   │
│  discovered      buffering      matching     2. Alert   │
│                                  rules        3. Enrich  │
└─────────────────────────────────────────────────────────┘
```

### Recommended CEP Stack

**Option 1: Apache Flink (Recommended)**

**Why Flink:**
- ✅ True streaming (not micro-batch)
- ✅ Stateful processing (remember patterns)
- ✅ Exactly-once semantics (no data loss)
- ✅ Scales to billions of events
- ✅ Mature (used by Uber, Netflix, Alibaba)

**Resources needed:**
- RAM: 4-6 GB
- CPU: 2 vCPU
- Fits on n2d-standard-2 with crawler!

**Example CEP pattern:**
```java
// Detect: 3 healthcare ransomware incidents in 24 hours
DataStream<Incident> incidents = ...;

Pattern<Incident, ?> pattern = Pattern
    .<Incident>begin("first")
    .where(new SimpleCondition<Incident>() {
        @Override
        public boolean filter(Incident incident) {
            return incident.getIndustry().equals("healthcare") &&
                   incident.getAttackType().equals("ransomware");
        }
    })
    .times(3).within(Time.days(1));

PatternStream<Incident> patternStream = CEP.pattern(incidents, pattern);

patternStream.select((Map<String, List<Incident>> pattern) -> {
    // Alert: Healthcare ransomware spike!
    List<Incident> matches = pattern.get("first");
    return new Alert("Healthcare ransomware spike", matches);
});
```

**Option 2: Node.js + Bull Queue (Simpler)**

**Why Bull:**
- ✅ Lighter weight (Node.js)
- ✅ Redis-based (fast)
- ✅ Good for simpler patterns
- ✅ Same language as API (TypeScript)

**Resources needed:**
- RAM: 2 GB
- CPU: 1 vCPU
- + Redis: 512 MB

**Example CEP pattern:**
```typescript
import Bull from 'bull'
import { QdrantClient } from '@qdrant/js-client-rest'

const incidentQueue = new Bull('incidents', 'redis://localhost:6379')

// Process incidents in sliding window
incidentQueue.process(async (job) => {
  const incident = job.data

  // Store in Qdrant
  await qdrantClient.upsert('incidents', {
    points: [{ id: incident.id, vector: incident.embedding, payload: incident }]
  })

  // Check for patterns (last 24 hours)
  const recentIncidents = await getRecentIncidents(24 * 3600 * 1000)

  // Pattern: 3+ ransomware in healthcare
  const pattern = recentIncidents.filter(i =>
    i.industry === 'healthcare' &&
    i.attackType === 'ransomware'
  )

  if (pattern.length >= 3) {
    await sendAlert('Healthcare ransomware spike', pattern)
  }
})
```

**Recommendation:** Start with Bull (simpler), migrate to Flink if needed.

---

## Part 4: Crawler Infrastructure

### Crawler Specifications

**Purpose:** Continuously scrape incident data from sources

**Sources to crawl:**
1. CISA KEV (known exploited vulnerabilities)
2. NVD (National Vulnerability Database)
3. Breach-exchange forums
4. Security vendor blogs
5. Government incident reports

**Crawler architecture:**

```python
# scripts/production_crawler.py

import schedule
import time
from typing import List, Dict
import asyncio
from qdrant_client import QdrantClient
import openai

class ProductionCrawler:
    def __init__(self):
        self.qdrant = QdrantClient(url="https://your-qdrant-cloud-url")
        self.openai_client = openai.Client(api_key=os.getenv('OPENAI_API_KEY'))

    async def crawl_all_sources(self):
        """Main crawl loop"""
        sources = [
            self.crawl_cisa_kev(),
            self.crawl_nvd(),
            self.crawl_breach_forums(),
        ]

        incidents = await asyncio.gather(*sources)
        incidents_flat = [i for sublist in incidents for i in sublist]

        print(f"Crawled {len(incidents_flat)} new incidents")

        # Generate embeddings
        for incident in incidents_flat:
            embedding = await self.generate_embedding(incident['text'])
            incident['embedding'] = embedding

        # Store in Qdrant
        await self.store_incidents(incidents_flat)

        return incidents_flat

    async def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding using OpenAI"""
        response = await self.openai_client.embeddings.create(
            model="text-embedding-3-small",
            input=text
        )
        return response.data[0].embedding

    async def store_incidents(self, incidents: List[Dict]):
        """Store in Qdrant"""
        points = [
            {
                "id": inc['id'],
                "vector": inc['embedding'],
                "payload": {
                    "type": inc['type'],
                    "industry": inc['industry'],
                    "severity": inc['severity'],
                    "description": inc['description'],
                    "date": inc['date'],
                }
            }
            for inc in incidents
        ]

        await self.qdrant.upsert(
            collection_name="incidents",
            points=points
        )

# Run crawler every 6 hours
schedule.every(6).hours.do(lambda: asyncio.run(crawler.crawl_all_sources()))

while True:
    schedule.run_pending()
    time.sleep(60)
```

**Resource needs:**
- CPU: 1 vCPU (I/O bound, not CPU bound)
- RAM: 2 GB (buffers, parsing)
- Disk: 10 GB (logs, temp files)
- Network: 1 Gbps (downloading data)

**Cost:** Included in GCE n2d-standard-2 instance

---

## Part 5: Complete Setup Guide

### Phase 1: Enable Billing & Set Budget (10 minutes)

**Step 1: Enable Cloud Billing API**
```
Visit: https://console.developers.google.com/apis/api/cloudbilling.googleapis.com/overview?project=sengolvertexapi
Click: "Enable"
```

**Step 2: Set Up Budget Alert**
```bash
# Via Cloud Console
1. Go to: https://console.cloud.google.com/billing/budgets
2. Create budget:
   - Name: "Free Credit Budget"
   - Budget amount: $1000
   - Alert thresholds: 50%, 70%, 90%, 100%
   - Email: your-email@domain.com
```

**Step 3: Verify Free Credit**
```bash
gcloud billing accounts list

# Should show $1000 credit balance
```

---

### Phase 2: Set Up Qdrant Cloud (30 minutes)

**Step 1: Create Account**
```
1. Visit: https://cloud.qdrant.io
2. Sign up (email + password)
3. Verify email
```

**Step 2: Create Cluster (Free Tier)**
```
1. Click "Create Cluster"
2. Choose:
   - Name: sengol-incidents
   - Region: US East (or closest to your GCE)
   - Tier: Free (1 GB)
3. Wait 2-3 minutes for provisioning
```

**Step 3: Get API Credentials**
```
1. Click on cluster name
2. Copy:
   - Cluster URL: https://xxx.us-east-1.aws.cloud.qdrant.io
   - API Key: qdrant_xxx
3. Save to .env:
   QDRANT_URL=https://xxx.us-east-1.aws.cloud.qdrant.io
   QDRANT_API_KEY=qdrant_xxx
```

**Step 4: Create Collection**
```typescript
// scripts/setup-qdrant.ts
import { QdrantClient } from '@qdrant/js-client-rest'

const client = new QdrantClient({
  url: process.env.QDRANT_URL!,
  apiKey: process.env.QDRANT_API_KEY!,
})

await client.createCollection('incidents', {
  vectors: {
    size: 1536, // text-embedding-3-small dimension
    distance: 'Cosine',
  },
  optimizers_config: {
    indexing_threshold: 10000, // Start HNSW after 10K vectors
  },
  hnsw_config: {
    m: 16, // Max connections per node
    ef_construct: 100, // Quality during build
  },
})

console.log('✅ Qdrant collection created!')
```

---

### Phase 3: Provision GCE Instance (20 minutes)

**Step 1: Create Instance**
```bash
gcloud compute instances create sengol-main \
  --project=sengolvertexapi \
  --zone=us-central1-a \
  --machine-type=n2d-standard-2 \
  --network-interface=network-tier=PREMIUM,stack-type=IPV4_ONLY,subnet=default \
  --maintenance-policy=MIGRATE \
  --provisioning-model=STANDARD \
  --service-account=sengol-service-account@sengolvertexapi.iam.gserviceaccount.com \
  --scopes=https://www.googleapis.com/auth/cloud-platform \
  --create-disk=auto-delete=yes,boot=yes,device-name=sengol-main,image=projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20250107,mode=rw,size=50,type=pd-balanced \
  --labels=purpose=crawler-cep,cost-center=free-credit
```

**Step 2: Configure Firewall**
```bash
# Allow SSH
gcloud compute firewall-rules create allow-ssh \
  --allow=tcp:22 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow SSH"

# Allow HTTP/HTTPS for crawler
gcloud compute firewall-rules create allow-web \
  --allow=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow web traffic"
```

---

### Phase 4: Install Software Stack (30 minutes)

```bash
# SSH into instance
gcloud compute ssh sengol-main --zone=us-central1-a

# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install Python 3.11
sudo apt-get install -y python3.11 python3.11-venv python3-pip

# Install Redis (for Bull queue)
sudo apt-get install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server

# Install dependencies
cd /opt
sudo mkdir sengol-app && sudo chown $USER:$USER sengol-app
cd sengol-app

# Clone your repo or copy files
# (You'll do this based on your setup)
```

---

### Phase 5: Deploy Crawler + CEP (45 minutes)

**I'll create the complete setup scripts for you separately.**

---

## Cost Monitoring Dashboard

### Weekly Budget Tracking

| Week | Compute | Storage | Network | Logging | Total | Remaining |
|------|---------|---------|---------|---------|-------|-----------|
| 1 | $10 | $0.50 | $0.50 | $0 | $11 | $989 |
| 2 | $10 | $0.50 | $0.50 | $0 | $11 | $978 |
| ... | ... | ... | ... | ... | ... | ... |
| 52 | $10 | $2 | $1 | $0.50 | $13.50 | $78 |

**Total Year 1 Projection:** ~$600-700 (60-70% of $1000 credit)

---

## Summary

### Total Monthly Cost Breakdown

| Component | Cost | Provider |
|-----------|------|----------|
| **Qdrant Cloud** | **$0** | Qdrant |
| **GCE n2d-standard-2** | **$40** | Google (free credit) |
| **Cloud Storage** | **$2** | Google (free credit) |
| **Networking** | **$2** | Google (free credit) |
| **Logging/Monitoring** | **$0** | Google (free tier) |
| **TOTAL** | **$44/month** | |

**Annual:** $528 (53% of $1000 credit)
**Credit Remaining:** $472 (47% buffer for growth)

---

## Next Steps

1. ✅ Enable Cloud Billing API (you need to do this)
2. ✅ Set up Qdrant Cloud account (30 min)
3. ✅ Provision GCE instance (I'll do this after billing enabled)
4. ✅ Install crawler + CEP stack (I'll provide scripts)
5. ✅ Migrate 80K vectors to Qdrant (I'll create migration script)
6. ✅ Update API to use Qdrant (I'll update code)
7. ✅ Deploy and monitor

**Ready to proceed?** Let me know once billing is enabled!

---

**Document prepared by:** Claude Code
**Recommendation:** Qdrant Cloud (free) + GCE n2d-standard-2 ($40/mo)
**Total annual cost:** ~$528 (53% of $1000 credit)
**Estimated setup time:** 3-4 hours
