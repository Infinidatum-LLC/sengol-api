# Qdrant Collection Strategy: Single vs Multiple Collections

**Date:** January 2025
**Current Setup:** Single collection (`sengol_incidents_full`)
**Status:** Recommendation for future architecture

---

## Current Architecture

### Single Collection Approach
We currently use **one unified collection** with all 78,827 vectors:

```
sengol_incidents_full (78,827 vectors)
├── cyber_incident_staging (21,015)
├── failure_patterns (20,933)
├── cep_signal_events (25,244)
├── regulation_violations (11,514)
├── cloud_incident_staging (56)
├── cep_anomalies (40)
├── security_vulnerabilities (20)
└── cep_pattern_templates (5)
```

**Differentiation:** Uses `source_file` payload field to identify data type

---

## Option 1: Single Collection (Current)

### Advantages ✅

1. **Cross-Domain Search**
   - Find similar incidents across all types with one query
   - Example: "SQL injection" can match CVEs, incidents, and patterns
   - Better for holistic risk assessment

2. **Simpler Architecture**
   - One collection to maintain
   - Single indexing pipeline
   - Easier backup/restore
   - Less complexity in code

3. **Better Resource Utilization**
   - Shared HNSW index
   - More efficient memory usage
   - Single optimization process

4. **Unified Scoring**
   - Consistent similarity scores across all data types
   - Easier to rank and compare different incident types
   - No need to merge/normalize scores from multiple collections

5. **Faster Development**
   - One search endpoint
   - Single embedding pipeline
   - Less code duplication

### Disadvantages ❌

1. **Limited Filtering Performance**
   - Filtering by `source_file` happens AFTER vector search
   - Cannot optimize index for specific data types
   - May return irrelevant results if not filtered properly

2. **No Type-Specific Optimization**
   - Same HNSW parameters for all data types
   - Cannot tune indexing for specific use cases
   - One-size-fits-all approach

3. **Payload Size**
   - All metadata stored in every point
   - Larger memory footprint
   - Cannot optimize storage per type

4. **Backup Granularity**
   - Cannot backup/restore specific data types
   - All-or-nothing approach

---

## Option 2: Multiple Collections (Alternative)

### Architecture
```
cyber_incidents (21,015 vectors)
├── cyber_incident_staging
└── security_vulnerabilities

ai_failures (20,933 vectors)
└── failure_patterns

cep_signals (25,289 vectors)
├── cep_signal_events
├── cep_anomalies
└── cep_pattern_templates

compliance (11,514 vectors)
└── regulation_violations

cloud_incidents (56 vectors)
└── cloud_incident_staging
```

### Advantages ✅

1. **Type-Specific Optimization**
   - Different HNSW parameters per collection
   - Example: Higher `m` for critical cyber incidents, lower for templates
   - Optimize indexing threshold per data volume

2. **Faster Filtered Searches**
   - No post-filtering needed
   - Search only relevant collection
   - Better performance for type-specific queries

3. **Independent Scaling**
   - Scale collections separately
   - Add shards to high-volume collections only
   - Quantize less-critical collections

4. **Granular Access Control**
   - Different API keys per collection
   - Team-specific access (cyber team → cyber_incidents)
   - Better security isolation

5. **Flexible Schema**
   - Different payload structures per collection
   - Type-specific fields without bloat
   - Easier schema evolution

6. **Easier Management**
   - Backup/restore specific collections
   - Delete old data from one collection
   - Update specific data types independently

### Disadvantages ❌

1. **Complex Cross-Collection Search**
   - Need to query multiple collections
   - Score normalization required
   - More complex API layer
   - Higher latency (multiple requests)

2. **Code Duplication**
   - Multiple search functions
   - Duplicate embedding pipelines
   - More maintenance overhead

3. **Resource Overhead**
   - Each collection has separate index
   - Higher memory usage overall
   - More disk space required

4. **Operational Complexity**
   - Monitor multiple collections
   - Multiple backup schedules
   - More failure points

---

## Recommendation

### For Current Scale (< 100K vectors): **Single Collection** ✅

**Why:**
1. **Cross-domain search is valuable** - Finding similar incidents across all types provides better risk insights
2. **Simple maintenance** - Easier to manage one collection
3. **Good performance** - Current search times < 1ms
4. **Cost-effective** - Less infrastructure overhead

**Current filtering approach works well:**
```python
# Search all incident types
results = qdrant_client.search(
    collection_name="sengol_incidents_full",
    query_vector=query_vector,
    limit=50
)

# Post-filter if needed
cyber_only = [r for r in results if r.payload['source_file'].startswith('cyber_')]
```

### When to Switch to Multiple Collections

**Triggers for migration:**

1. **Scale:** > 500K vectors per collection type
2. **Performance:** Search latency > 10ms consistently
3. **Team structure:** Separate teams managing different data types
4. **Security:** Need collection-level access control
5. **Query patterns:** Rarely need cross-domain search (< 10% of queries)

---

## Hybrid Approach (Recommended for Growth)

**Current state:** Single collection
**Future state:** Add specialized collections as needed

### Phase 1: Now (< 100K vectors)
```
sengol_incidents_full (all data)
```
✅ Keep current single collection

### Phase 2: Growth (100K-500K vectors)
```
sengol_incidents_full (all data, kept for cross-domain search)
cyber_incidents_focused (cyber only, optimized for high-throughput)
```
✅ Add specialized collection for high-volume cyber queries
✅ Keep unified collection for analytics

### Phase 3: Scale (> 500K vectors)
```
cyber_incidents (optimized for security team)
ai_failures (optimized for ML team)
cep_signals (optimized for detection engine)
compliance_violations (optimized for legal team)
sengol_incidents_unified (read-only, for cross-domain analytics)
```
✅ Migrate to multiple collections
✅ Keep unified collection for rare cross-domain queries

---

## Implementation Plan for Multiple Collections

**If/when you decide to migrate:**

### Step 1: Create Collections
```bash
# Cyber incidents (high volume, high priority)
curl -X PUT 'http://localhost:6333/collections/cyber_incidents' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {"size": 1536, "distance": "Cosine"},
    "hnsw_config": {"m": 32, "ef_construct": 200}
  }'

# AI failures (research data, can be optimized for space)
curl -X PUT 'http://localhost:6333/collections/ai_failures' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {"size": 1536, "distance": "Cosine"},
    "hnsw_config": {"m": 16, "ef_construct": 100},
    "quantization_config": {"scalar": {"type": "int8"}}
  }'

# CEP signals (real-time detection, high throughput)
curl -X PUT 'http://localhost:6333/collections/cep_signals' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {"size": 1536, "distance": "Cosine"},
    "hnsw_config": {"m": 24, "ef_construct": 150}
  }'

# Compliance (low volume, archival)
curl -X PUT 'http://localhost:6333/collections/compliance_violations' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {"size": 1536, "distance": "Cosine"},
    "hnsw_config": {"m": 16, "ef_construct": 100},
    "quantization_config": {"scalar": {"type": "int8"}}
  }'
```

### Step 2: Data Migration Script
```python
from qdrant_client import QdrantClient

client = QdrantClient(host="localhost", port=6333)

# Define collection mappings
COLLECTION_MAP = {
    "cyber_incident_staging.json": "cyber_incidents",
    "security_vulnerabilities.json": "cyber_incidents",
    "failure_patterns.json": "ai_failures",
    "cep_signal_events.json": "cep_signals",
    "cep_anomalies.json": "cep_signals",
    "cep_pattern_templates.json": "cep_signals",
    "regulation_violations.json": "compliance_violations",
    "cloud_incident_staging.json": "cyber_incidents"
}

# Scroll through all points
offset = None
batch_size = 1000

while True:
    points, offset = client.scroll(
        collection_name="sengol_incidents_full",
        limit=batch_size,
        offset=offset,
        with_payload=True,
        with_vector=True
    )

    if not points:
        break

    # Group by target collection
    by_collection = {}
    for point in points:
        source_file = point.payload.get("source_file")
        target_collection = COLLECTION_MAP.get(source_file)

        if target_collection:
            if target_collection not in by_collection:
                by_collection[target_collection] = []
            by_collection[target_collection].append(point)

    # Insert into target collections
    for collection, batch in by_collection.items():
        client.upsert(
            collection_name=collection,
            points=batch
        )

    print(f"Migrated {len(points)} points...")
```

### Step 3: Update API Layer
```typescript
// src/services/incident-search.ts

async function searchIncidents(query: string, options?: SearchOptions) {
  const collections = options?.collections || [
    'cyber_incidents',
    'ai_failures',
    'cep_signals',
    'compliance_violations'
  ];

  // Search all collections in parallel
  const results = await Promise.all(
    collections.map(collection =>
      qdrantClient.search(collection, queryVector, { limit: 50 })
    )
  );

  // Merge and sort results
  const merged = results.flat().sort((a, b) => b.score - a.score);

  return merged.slice(0, options?.limit || 10);
}
```

### Step 4: Gradual Migration
1. **Week 1:** Create new collections, keep old one
2. **Week 2:** Migrate data to new collections
3. **Week 3:** Update API to use new collections
4. **Week 4:** Monitor performance and rollback if needed
5. **Week 5:** Delete old collection if successful

---

## Performance Comparison

### Single Collection (Current)
```
Query: "ransomware attacks"
Collections searched: 1
Total vectors searched: 78,827
Response time: 0.8ms
Results: 10 (all types)
```

### Multiple Collections (Estimated)
```
Query: "ransomware attacks" (cyber_incidents only)
Collections searched: 1
Total vectors searched: 21,015
Response time: 0.5ms
Results: 10 (cyber only)

Query: "ransomware attacks" (all collections)
Collections searched: 4
Total vectors searched: 78,827
Response time: 2.5ms (4 parallel queries + merge)
Results: 10 (all types)
```

**Verdict:** Single collection is faster for cross-domain search, multiple collections are faster for type-specific queries.

---

## Cost Analysis

### Single Collection
- **Memory:** ~480 MB (78,827 × 6.1 KB)
- **Disk:** ~2 GB (with index)
- **Maintenance:** Low
- **Complexity:** Low

### Multiple Collections (4 collections)
- **Memory:** ~550 MB (overhead from 4 separate indexes)
- **Disk:** ~2.5 GB (4 separate HNSW indexes)
- **Maintenance:** Medium
- **Complexity:** Medium-High

**Cost difference:** ~15% more resources for multiple collections

---

## Decision Matrix

| Factor | Single Collection | Multiple Collections | Winner |
|--------|-------------------|----------------------|--------|
| Cross-domain search | ✅ Excellent | ⚠️ Complex | Single |
| Type-specific search | ⚠️ Good | ✅ Excellent | Multiple |
| Maintenance complexity | ✅ Low | ❌ High | Single |
| Resource efficiency | ✅ Efficient | ⚠️ More overhead | Single |
| Scalability | ⚠️ Limited | ✅ Better | Multiple |
| Team isolation | ❌ Not possible | ✅ Possible | Multiple |
| Current scale (< 100K) | ✅ Perfect fit | ⚠️ Over-engineered | Single |
| Future scale (> 500K) | ⚠️ May struggle | ✅ Better | Multiple |

**Current Recommendation: Single Collection ✅**

---

## Monitoring for Migration Decision

**Track these metrics to decide when to migrate:**

### Performance Metrics
```python
# Monitor search latency
if avg_search_latency > 10ms:
    consider_multiple_collections = True

# Monitor filter overhead
filtered_results = len([r for r in results if meets_filter(r)])
if filtered_results < 0.2 * len(results):  # 80% filtered out
    consider_multiple_collections = True
```

### Query Pattern Analysis
```python
# Analyze query distribution
query_logs = analyze_past_30_days()

cross_domain_queries = query_logs.filter(collections='all').count()
single_domain_queries = query_logs.filter(collections=1).count()

if cross_domain_queries / total_queries < 0.1:  # < 10% cross-domain
    consider_multiple_collections = True
```

### Scale Thresholds
```python
if total_vectors > 500_000:
    migrate_to_multiple_collections = True
elif total_vectors > 1_000_000:
    must_migrate_immediately = True
```

---

## Conclusion

**Current Recommendation: Keep Single Collection**

**Reasons:**
1. ✅ Current scale (78K vectors) is well within single collection capacity
2. ✅ Cross-domain search is valuable for risk assessment
3. ✅ Performance is excellent (< 1ms search)
4. ✅ Simpler maintenance and operations
5. ✅ Lower resource costs

**Re-evaluate when:**
- Total vectors exceed 500K
- Search latency exceeds 10ms consistently
- Team needs collection-level isolation
- Query patterns show < 10% cross-domain search

**Next Review:** Q2 2025 or when vectors > 200K

---

**Document Version:** 1.0
**Last Updated:** 2025-01-10
**Next Review:** 2025-04-10
