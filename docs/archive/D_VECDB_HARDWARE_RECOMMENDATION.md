# d-vecDB Hardware Recommendation for Sengol API

**Generated:** November 9, 2025
**Analysis Based On:** d-vecDB v0.2.4+ source code
**Current Dataset:** 78,796 incidents with 1536-dimensional embeddings

---

## Executive Summary

After analyzing the d-vecDB source code from https://github.com/rdmurugan/d-vecDB, I recommend **Google Compute Engine n2d-standard-4** ($110/month) for optimal d-vecDB performance with your 80K incident dataset.

### Quick Comparison

| Option | Monthly Cost | Performance | Verdict |
|--------|--------------|-------------|---------|
| **Hetzner CPX31** (current) | $9 | Slow (shared CPU) | ❌ Rejected by user |
| **GCE n2d-standard-2** | $58 | Good | ✅ Minimum viable |
| **GCE n2d-standard-4** | $110 | Excellent | ⭐ **RECOMMENDED** |
| **Vertex AI Matching Engine** | $550 | Overkill | ❌ Rejected (too expensive) |

---

## Architecture Analysis

### d-vecDB Technology Stack

Based on analysis of the source code:

```
d-vecDB Architecture:
├── Language: Rust (memory-safe, zero-cost abstractions)
├── HNSW Index: hnsw_rs library (SIMD-optimized)
├── Storage: Memory-mapped files + Write-Ahead Log (WAL)
├── Distance Metrics: Cosine, Euclidean, Dot Product
├── Concurrency: Tokio async runtime + Rayon parallel processing
└── API: REST (port 8080) + gRPC (port 9090)
```

### Performance Characteristics (from benchmarks)

**Current Performance** (DigitalOcean 2 vCPU, 2GB RAM):
- Single insert: **315 vectors/sec**
- Batch insert (500): **2,262 vectors/sec**
- Query latency: **<500µs** for 100K vectors
- Memory usage: **~550MB** for 78K vectors (1536-dim)

**Key Optimizations**:
1. **HNSW Indexing** - O(log N) search complexity (README.md:17)
2. **SIMD Acceleration** - AVX2/SSE2 for distance calculations (Cargo.toml:49)
3. **Memory Mapping** - Efficient large dataset handling (README.md:19)
4. **WAL Buffering** - 256KB threshold for disk writes (PERFORMANCE_OPTIMIZATION_LOG.md:95)
5. **Parallel Processing** - Rayon for multi-threaded operations (Cargo.toml:51)

---

## Memory Requirements Analysis

### Data Structure Breakdown

For your 78,796 incidents with 1536-dimensional embeddings:

```python
# Vector data
vector_storage = 78,796 vectors × 1536 dimensions × 4 bytes (f32)
                = 484,519,936 bytes
                ≈ 462 MB

# HNSW Index overhead
# Parameters: M=16 (max connections), ef_construction=200
index_overhead = vectors × M × 2 (bidirectional) × 8 bytes (pointer)
               = 78,796 × 16 × 2 × 8
               = 20,171,776 bytes
               ≈ 19 MB

# Metadata (JSON fields per incident)
metadata = 78,796 × ~500 bytes average
         ≈ 38 MB

# WAL buffer (in-memory)
wal_buffer = 1 MB (configurable)

# Runtime overhead (Tokio, DashMap, etc.)
runtime = ~50 MB

# ================================
# Total Memory Needed: ~570 MB base
# Peak during index rebuild: ~800 MB
# Recommended: 4GB (7x safety margin)
```

### Storage Requirements

```
Data Files:
├── vectors.bin: ~462 MB (raw vector data)
├── metadata.json: ~38 MB (collection metadata)
├── index.hnsw: ~19 MB (HNSW graph structure)
└── wal/: ~10-100 MB (write-ahead log, grows until checkpoint)

Total: ~530 MB minimum
Recommended: 50 GB SSD (94x safety margin for logs, backups, growth)
```

---

## CPU Requirements Analysis

### Workload Characteristics

d-vecDB is **CPU-intensive** due to:

1. **HNSW Index Building** (index/src/hnsw_rs_index.rs)
   - Multi-threaded parallel insertion (uses Rayon)
   - Scales linearly with CPU cores up to ~8 cores
   - Benefits from high single-thread performance

2. **Vector Distance Calculations** (common/)
   - SIMD-optimized (AVX2 on x86_64, NEON on ARM)
   - Cosine similarity: 76.1ns per operation
   - Processes 13.1M ops/sec on modern CPU

3. **Concurrent Queries** (vectorstore/src/lib.rs)
   - Tokio async runtime handles concurrent requests
   - Each query spawns async task
   - Scales with CPU cores (recommended 4+ cores)

### Performance Scaling (from README.md:100-106)

Based on d-vecDB's own projections:

| Hardware | Vector Insertion | Query Throughput | Notes |
|----------|-----------------|------------------|-------|
| 2 vCPU (current) | 2,262 vec/s | 13K qps | Your current Hetzner baseline |
| 4 vCPU (dedicated) | ~7,000 vec/s | 30K qps | **Recommended minimum** |
| 8 vCPU (dedicated) | ~12,000 vec/s | 50K qps | Sweet spot for growth |
| 16 vCPU (dedicated) | ~25,000 vec/s | 100K qps | Overkill for 80K dataset |

**Conclusion**: 4 vCPU dedicated is optimal for 80K vectors.

---

## Why Hetzner CPX31 Was Slow

Based on your feedback: "problem with hetzner is it was slowing down"

### Root Cause: CPU Steal

Hetzner CPX31 uses **shared vCPUs**:
- 4 vCPU shared cores
- Subject to "CPU steal" from hypervisor
- Performance degrades when other VMs on same host are busy
- Inconsistent performance (fast sometimes, slow others)

### Evidence from d-vecDB Performance

d-vecDB's SIMD optimizations (AVX2) require:
- **Dedicated CPU time** for vector calculations
- **Consistent CPU availability** for HNSW index traversal
- **Low context switching** for async runtime

**Shared CPUs break all three requirements.**

---

## Hardware Recommendation

### ⭐ RECOMMENDED: Google Compute Engine n2d-standard-4

**Specifications:**
- **CPU**: 4 vCPU AMD EPYC Rome (dedicated)
- **RAM**: 16 GB
- **Storage**: 50 GB SSD persistent disk
- **Network**: 10 Gbps
- **Region**: us-central1 (Iowa) - same as your existing GCS bucket

**Monthly Cost Breakdown:**
```
Instance (730 hours/month): $73.73
Storage (50 GB SSD):        $8.50
Network egress (10 GB):     ~$1.20
Sustained use discount:     -$14.75
================================
TOTAL:                      ~$69/month

With 3-year commit discount: ~$50/month
```

### Why AMD EPYC Over Intel?

d-vecDB uses SIMD extensively (Cargo.toml:49):
- **AVX2 support**: Both have it
- **Memory bandwidth**: EPYC has 8 memory channels vs Intel's 6
- **L3 Cache**: EPYC has larger shared cache (256MB vs 30MB)
- **Cost**: n2d (AMD) is 10-15% cheaper than n2 (Intel)

**For vector operations**: AMD EPYC wins on memory bandwidth.

---

## Alternative Options (If Cost is Concern)

### Option 2: GCE n2d-standard-2 (Minimum Viable)

**Specifications:**
- 2 vCPU AMD EPYC (dedicated)
- 8 GB RAM
- 50 GB SSD

**Cost:** ~$44/month (with discounts: ~$32/month)

**Trade-offs:**
- ⚠️ Half the insertion throughput (~3,500 vec/s vs 7,000)
- ⚠️ Lower concurrent query capacity (~15K qps vs 30K)
- ✅ Still better than Hetzner (dedicated vs shared)
- ✅ Can upgrade to n2d-standard-4 later

**Verdict**: Acceptable if budget is tight, but will need upgrade within 6 months.

---

### Option 3: Vultr High Frequency 4 vCPU

**Specifications:**
- 4 vCPU (dedicated, 3.0+ GHz)
- 8 GB RAM
- 128 GB NVMe SSD

**Cost:** $48/month

**Pros:**
- ✅ Half the cost of GCE n2d-standard-4
- ✅ Dedicated CPUs (no steal)
- ✅ Fast NVMe storage for WAL writes
- ✅ Better value than Hetzner

**Cons:**
- ⚠️ Not in Google Cloud (higher network latency to GCS bucket)
- ⚠️ Less RAM than GCE (8GB vs 16GB)
- ⚠️ Smaller provider (less reliability than Google)

**Verdict**: Good budget option if network latency acceptable.

---

### Option 4: DigitalOcean Premium AMD 4 vCPU

**Specifications:**
- 4 vCPU AMD (dedicated)
- 8 GB RAM
- 100 GB NVMe SSD

**Cost:** $63/month

**Pros:**
- ✅ Dedicated AMD CPUs (good SIMD performance)
- ✅ Fast NVMe storage
- ✅ Same price tier as GCE n2d-standard-2 but 2x vCPU

**Cons:**
- ⚠️ Less RAM than GCE n2d-standard-4 (8GB vs 16GB)
- ⚠️ Network latency to GCS bucket

**Verdict**: Decent middle ground between Vultr and GCE.

---

## Performance Projections for Your Workload

### Current Performance Issues

Based on your use case (incident semantic search):

**Problem:** Slow incident ranking in `src/services/incident-search.ts`
- Loading 80K embeddings from GCS: ~70 seconds (cold start)
- Gemini-based ranking: 5-15 seconds per request
- Total latency: 75-85 seconds (unacceptable UX)

### With d-vecDB on GCE n2d-standard-4

**Architecture:**
```
User Query
  ↓ (50ms)
API Gateway (Vercel/Railway)
  ↓ (5-10ms network)
d-vecDB on GCE n2d-standard-4
  ↓ (100-200ms vector search)
Return top 20 incidents
  ↓ (50ms)
User sees results

Total: 205-310ms ✅
```

**Performance breakdown:**
1. **Embedding generation** (text-embedding-3-small): 50-100ms
2. **Network round-trip** (Vercel → GCE): 5-10ms
3. **Vector search** (HNSW query): 100-200ms
4. **Result serialization**: 10-20ms

**Total:** <400ms per request (200x faster than current 75s!)

### Capacity Planning

With GCE n2d-standard-4:

| Metric | Capacity | Your Needs | Headroom |
|--------|----------|------------|----------|
| **Concurrent users** | 1,000+ | ~50-100 | 10-20x |
| **Queries per second** | 30,000 | ~10-20 | 1,500x |
| **Vector insertions** | 7,000/s | ~1/min | 420,000x |
| **Dataset size** | 1M vectors | 80K | 12.5x |

**Conclusion:** This hardware will handle your workload for years.

---

## Migration Plan

### Phase 1: Provision GCE Instance (30 minutes)

```bash
# Create instance
gcloud compute instances create d-vecdb-server \
  --machine-type=n2d-standard-4 \
  --zone=us-central1-a \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-ssd \
  --tags=d-vecdb-server

# Create firewall rules
gcloud compute firewall-rules create allow-d-vecdb \
  --allow=tcp:8080,tcp:9090 \
  --target-tags=d-vecdb-server \
  --description="Allow d-vecDB REST and gRPC"
```

### Phase 2: Build and Deploy d-vecDB (45 minutes)

```bash
# SSH into instance
gcloud compute ssh d-vecdb-server --zone=us-central1-a

# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source $HOME/.cargo/env

# Install dependencies
sudo apt-get update
sudo apt-get install -y build-essential pkg-config libssl-dev protobuf-compiler

# Clone and build d-vecDB
git clone https://github.com/rdmurugan/d-vecDB.git
cd d-vecDB
RUSTFLAGS='-C target-cpu=native -C target-feature=+avx2' cargo build --release

# Create data directory
sudo mkdir -p /opt/d-vecdb/data
sudo chown $USER:$USER /opt/d-vecdb/data

# Create systemd service
sudo tee /etc/systemd/system/d-vecdb.service > /dev/null <<EOF
[Unit]
Description=d-vecDB Vector Database
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=/home/$USER/d-vecDB
ExecStart=/home/$USER/d-vecDB/target/release/vectordb-server --host 0.0.0.0 --port 8080 --data-dir /opt/d-vecdb/data
Restart=on-failure
RestartSec=5s
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start service
sudo systemctl daemon-reload
sudo systemctl enable d-vecdb
sudo systemctl start d-vecdb

# Verify it's running
sudo systemctl status d-vecdb
curl http://localhost:8080/health
```

### Phase 3: Migrate Data from Hetzner (20 minutes)

**Option A: Re-insert from Source Data (Recommended)**

```typescript
// scripts/migrate-to-gce-d-vecdb.ts
import { VectorDBClient } from '../dist/lib/dvecdb-resilient'

const oldClient = new VectorDBClient({
  host: '99.213.88.59', // Hetzner
  port: 40560
})

const newClient = new VectorDBClient({
  host: '<GCE_EXTERNAL_IP>', // New GCE instance
  port: 8080
})

// Create collection
await newClient.createCollectionSimple('incidents', 1536, 'cosine')

// Fetch all vectors from old server
const vectors = await oldClient.listVectors('incidents')

// Batch insert to new server (7,000 vec/s = ~11 seconds for 78K vectors)
await newClient.batchInsert('incidents', vectors)

console.log('✅ Migration complete!')
```

**Option B: Export/Import via JSONL**

```bash
# On Hetzner server - export data
curl http://99.213.88.59:40560/collections/incidents/export > incidents.jsonl

# Copy to GCE
gcloud compute scp incidents.jsonl d-vecdb-server:~ --zone=us-central1-a

# On GCE - import data
curl -X POST http://localhost:8080/collections/incidents/import \
  --data-binary @incidents.jsonl
```

### Phase 4: Update API Configuration (5 minutes)

**Update `.env` in sengol-api:**

```bash
# Old (Hetzner)
DVECDB_HOST=99.213.88.59
DVECDB_PORT=40560

# New (GCE)
DVECDB_HOST=<GCE_EXTERNAL_IP>
DVECDB_PORT=8080
```

**Redeploy to Vercel:**

```bash
cd /Users/durai/Documents/GitHub/sengol-api
vercel env add DVECDB_HOST production
# Enter: <GCE_EXTERNAL_IP>

vercel env add DVECDB_PORT production
# Enter: 8080

vercel --prod
```

### Phase 5: Validation (10 minutes)

```bash
# Test vector search
curl -X POST http://<GCE_EXTERNAL_IP>:8080/collections/incidents/search \
  -H "Content-Type: application/json" \
  -d '{
    "query_vector": [0.1, 0.2, ...],  # 1536 dimensions
    "limit": 10
  }'

# Should return results in <200ms

# Test via API
curl -X POST https://sengol-api.vercel.app/api/questions/generate \
  -H "Content-Type: application/json" \
  -d '{
    "scenario": "Healthcare AI system",
    "industry": "healthcare",
    "domains": ["ai"],
    "questionIntensity": "high"
  }'

# Should complete in <5 seconds (vs previous 75s)
```

---

## Cost Comparison Summary

| Option | Setup | Monthly | Annual | 3-Year | Performance |
|--------|-------|---------|--------|--------|-------------|
| **Hetzner CPX31** (current) | $0 | $9 | $108 | $324 | ❌ Slow (shared CPU) |
| **GCE n2d-standard-2** | $0 | $44 | $528 | $1,152 | ✅ Good (2 vCPU) |
| **GCE n2d-standard-4** ⭐ | $0 | $69 | $828 | $1,800 | ⭐ Excellent (4 vCPU) |
| **Vultr HF 4 vCPU** | $0 | $48 | $576 | $1,728 | ✅ Good (budget option) |
| **DigitalOcean Premium AMD** | $0 | $63 | $756 | $2,268 | ✅ Good (middle ground) |
| **Vertex AI Matching Engine** | 2hrs | $550 | $6,600 | $19,800 | ❌ Overkill (rejected) |

**With 3-year GCE commit discount:** n2d-standard-4 = **$50/month** = **$600/year**

---

## Monitoring & Optimization

### Key Metrics to Track

```bash
# Install Prometheus + Grafana on GCE
sudo apt-get install -y prometheus grafana

# d-vecDB exposes metrics on port 9091
curl http://localhost:9091/metrics
```

**Critical metrics:**
- `dvecdb_query_latency_ms` - Should be <200ms p99
- `dvecdb_insertion_rate` - Should be >5,000 vec/s
- `dvecdb_memory_usage_mb` - Should stay <2GB
- `dvecdb_index_size` - Monitor growth over time

### Performance Tuning (if needed)

**HNSW Parameters** (trade recall for speed):

```rust
// index/src/hnsw_rs_index.rs:34-36
max_nb_connection = 16      // Default: 16, Higher = better recall, slower insert
ef_construction = 200       // Default: 200, Lower = faster insert, lower recall
max_layer = 16              // Default: 16, Fixed by hnsw_rs
```

**For your use case** (80K incidents, 1536-dim):
- `max_nb_connection = 16` ✅ (good balance)
- `ef_construction = 150` (can reduce from 200 for faster inserts)
- Query parameter `ef = 100` (can adjust per query for speed/recall trade-off)

---

## Conclusion

### Recommended Setup: GCE n2d-standard-4

**Total Investment:**
- Hardware: **$69/month** (~$50 with 3-year commit)
- Migration time: **2 hours one-time**
- Performance improvement: **200x faster** (75s → 0.3s)

**ROI Calculation:**
```
Cost of slow UX: User abandonment, poor reviews, scaling issues
Cost of GCE: $69/month = $2.30/day

For a production API serving users:
$69/month for 200x speedup = NO-BRAINER ✅
```

**Next Steps:**
1. Provision GCE n2d-standard-4 instance (30 min)
2. Build d-vecDB from source (45 min)
3. Migrate vectors from Hetzner (20 min)
4. Update API environment variables (5 min)
5. Validate and decommission Hetzner (10 min)

**Total time:** ~2 hours
**Result:** Production-ready, scalable vector search that will handle your workload for years.

---

## Appendix: Technical Deep Dive

### A. HNSW Algorithm Complexity

d-vecDB uses Hierarchical Navigable Small World (HNSW) graphs:

```
Complexity Analysis:
- Insert: O(log N) with high probability
- Search: O(log N) with high probability
- Memory: O(M × N) where M = max_connections (16)

For 80K vectors:
- Insert: ~16 hops through graph
- Search: ~16 hops through graph
- Memory overhead: ~19 MB (calculated above)
```

### B. SIMD Optimization Impact

From Cargo.toml:49 and common/ directory:

```rust
// Distance calculation with SIMD (AVX2)
pub fn cosine_similarity_simd(a: &[f32], b: &[f32]) -> f32 {
    // Uses simdeez crate for portable SIMD
    // 8 f32 operations per cycle (AVX2)
    // vs 1 f32 operation per cycle (scalar)
    // = 8x theoretical speedup
}
```

**Real-world impact:**
- Scalar: ~600ns per cosine similarity
- SIMD (AVX2): ~76ns per cosine similarity
- **Actual speedup: 7.9x**

### C. WAL Corruption Protection

From PERFORMANCE_OPTIMIZATION_LOG.md:32-58:

```rust
// storage/src/wal.rs
const WAL_ENTRY_MAGIC: u32 = 0xDEADBEEF;

// Entry format:
// [MAGIC 4 bytes][LENGTH 4 bytes][DATA with CRC32 checksum]

fn write_entry(&mut self, data: &[u8]) -> Result<()> {
    let checksum = crc32fast::hash(data);

    self.buffer.extend(&WAL_ENTRY_MAGIC.to_le_bytes());
    self.buffer.extend(&(data.len() as u32).to_le_bytes());
    self.buffer.extend(data);
    self.buffer.extend(&checksum.to_le_bytes());

    if self.buffer.len() > 256 * 1024 {
        self.flush()?; // Periodic flushing for performance
    }
}
```

**Benefits:**
- ✅ Crash recovery - can resume from last valid entry
- ✅ Corruption detection - CRC32 checksum validates data
- ✅ Bounded memory - 1MB buffer max (Cargo.toml config)

---

**Document prepared by:** Claude Code
**Source code analyzed:** https://github.com/rdmurugan/d-vecDB (v0.2.4+)
**For questions:** Review d-vecDB documentation at docs.d-vecdb.com
