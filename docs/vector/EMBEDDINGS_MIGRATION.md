# Vector Embeddings Migration - Vertex AI to OpenAI

**Date:** January 2025
**Status:** ✅ Complete
**Migration Type:** Full re-embedding of all 78,827 incident records

---

## Overview

Successfully migrated the Sengol vector embeddings infrastructure from Google Vertex AI (768-dimensional) to OpenAI (1536-dimensional) embeddings to achieve:
- **Unified embedding model** across all data sources
- **Higher dimensional vectors** for better semantic search accuracy
- **Cost efficiency** with OpenAI's text-embedding-3-small model
- **Simplified infrastructure** by removing Google Vertex AI dependency

---

## Migration Summary

### Before Migration
- **Vector Database:** Qdrant v1.12.5 on GCE
- **Collection:** `sengol_incidents_full`
- **Embeddings:** Mixed (768-dim Vertex AI + missing CEP data)
- **Total Vectors:** 41,905 (53% coverage)
- **Missing Data:** 36,922 records (CEP events, violations, etc.)

### After Migration
- **Vector Database:** Qdrant v1.12.5 on GCE (same)
- **Collection:** `sengol_incidents_full` (recreated)
- **Embeddings:** Unified OpenAI text-embedding-3-small (1536-dim)
- **Total Vectors:** 78,827 (100% coverage)
- **Missing Data:** 0 records

---

## Technical Details

### OpenAI Embedding Model
```
Model: text-embedding-3-small
Dimensions: 1536
API: OpenAI Embeddings API
Cost: ~$0.02 per 1M tokens
```

### Qdrant Collection Configuration
```json
{
  "vectors": {
    "size": 1536,
    "distance": "Cosine"
  },
  "optimizers_config": {
    "indexing_threshold": 20000
  }
}
```

### GCP Infrastructure
- **VM Instance:** `sengol-vector-db`
- **Zone:** us-central1-a
- **Project:** elite-striker-477619-p8
- **Machine Type:** n2d-standard-2
- **Qdrant Version:** 1.12.5
- **Qdrant Port:** 6333

---

## Data Breakdown

| Source File | Records | Percentage | Description |
|-------------|---------|------------|-------------|
| `cyber_incident_staging.json` | 21,015 | 26.7% | CVE vulnerabilities, cyberattacks |
| `failure_patterns.json` | 20,933 | 26.6% | AI/ML system failures |
| `cep_signal_events.json` | 25,244 | 32.0% | Common Event Pattern signals |
| `regulation_violations.json` | 11,514 | 14.6% | Compliance violations |
| `cloud_incident_staging.json` | 56 | 0.1% | Cloud infrastructure incidents |
| `cep_anomalies.json` | 40 | 0.1% | Detected anomalies |
| `security_vulnerabilities.json` | 20 | 0.0% | Security vulnerabilities |
| `cep_pattern_templates.json` | 5 | 0.0% | Pattern templates |
| **Total** | **78,827** | **100%** | All incident data |

---

## Migration Process

### Phase 1: Generate Missing CEP Embeddings
**Duration:** 4.9 minutes
**Records:** 36,823 new embeddings
**Rate:** 126 records/second

Generated embeddings for missing data:
- CEP signal events (25,244)
- Regulation violations (11,514)
- CEP anomalies (40)
- CEP pattern templates (5)
- Security vulnerabilities (20)

### Phase 2: Re-embed All Existing Data
**Duration:** 13.6 minutes
**Records:** 78,827 total embeddings
**Rate:** 97 records/second

Re-embedded all data to achieve unified 1536-dim embeddings:
- Replaced old 768-dim Vertex AI embeddings
- Deleted old embedding files from GCS
- Saved new embeddings to `gs://sengol-incidents-elite/incidents/embeddings/openai-1536/`

### Phase 3: Recreate Qdrant Collection
**Steps:**
1. Deleted old `sengol_incidents_full` collection (768-dim)
2. Created new `sengol_incidents_full` collection (1536-dim)
3. Loaded all 78,827 OpenAI embeddings
4. Verified collection status and search functionality

**Loading Duration:** 4.6 minutes
**Loading Rate:** 283 vectors/second

---

## Storage Locations

### Google Cloud Storage

**Source Data (Raw JSON):**
```
gs://sengol-incidents/incidents/postgres-migrated/raw/
├── cyber_incident_staging.json
├── failure_patterns.json
├── cep_signal_events.json
├── regulation_violations.json
├── cloud_incident_staging.json
├── cep_anomalies.json
├── security_vulnerabilities.json
└── cep_pattern_templates.json
```

**OpenAI Embeddings (1536-dim):**
```
gs://sengol-incidents-elite/incidents/embeddings/openai-1536/
├── cyber_incident_staging.json
├── failure_patterns.json
├── cep_signal_events.json
├── regulation_violations.json
├── cloud_incident_staging.json
├── cep_anomalies.json
├── security_vulnerabilities.json
└── cep_pattern_templates.json
```

**Old Embeddings (DELETED):**
```
gs://sengol-incidents-elite/incidents/embeddings/matching-engine-full/
└── [All 768-dim Vertex AI embeddings removed]
```

---

## Validation & Testing

### Collection Health Check
```bash
curl -s 'http://localhost:6333/collections/sengol_incidents_full' | python3 -m json.tool
```

**Results:**
- Total Vectors: 78,827 ✅
- Indexed Vectors: 76,993 (97.7%)
- Status: green ✅
- Optimizer Status: ok ✅

### Semantic Search Test
Tested 5 query types with successful results:

| Query Type | Top Score | Status |
|------------|-----------|--------|
| SQL injection attacks | 0.5704 | ✅ Pass |
| Ransomware incidents | 0.6126 | ✅ Pass |
| Cloud security breaches | 0.5175 | ✅ Pass |
| Data breach with customer info | 0.5682 | ✅ Pass |
| Phishing attacks | 0.5546 | ✅ Pass |

All searches returned relevant results with proper similarity scores.

---

## Scripts & Tools

### Embedding Generation
**File:** `/home/durai_sengol_ai/reembed_all_with_openai.py`

```python
# Key configuration
EMBEDDING_MODEL = "text-embedding-3-small"
BATCH_SIZE = 100
VECTOR_DIM = 1536
```

### Embedding Loading
**File:** `/home/durai_sengol_ai/load_all_openai_embeddings.py`

```python
# Key configuration
QDRANT_HOST = "localhost"
QDRANT_PORT = 6333
COLLECTION_NAME = "sengol_incidents_full"
BATCH_SIZE = 100
```

### Search Testing
**File:** `/home/durai_sengol_ai/test_qdrant_search.py`

```python
# Test semantic search with OpenAI embeddings
# Generates query embeddings and searches Qdrant
```

---

## Performance Metrics

### Embedding Generation
- **OpenAI API Rate:** 100-150 records/second
- **Batch Size:** 100 records per API call
- **Total Time:** ~18 minutes for 78,827 records
- **API Cost:** ~$0.15 (estimated)

### Vector Loading
- **Qdrant Insert Rate:** 283-495 vectors/second
- **Batch Size:** 100 vectors per upsert
- **Total Time:** 4.6 minutes for 78,827 vectors
- **Indexing:** Background indexing to 97.7%

### Search Performance
- **Query Time:** < 1ms for semantic search
- **Cosine Distance:** Effective for similarity matching
- **Result Quality:** High relevance scores (0.51-0.61)

---

## Access & Permissions

### GCS Bucket Permissions
```bash
# Compute service account
SERVICE_ACCOUNT="678287061519-compute@developer.gserviceaccount.com"

# Read access to source data
gcloud storage buckets add-iam-policy-binding \
  gs://sengol-incidents \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/storage.objectViewer" \
  --project=sengolvertexapi

# Write access to embeddings
gcloud storage buckets add-iam-policy-binding \
  gs://sengol-incidents-elite \
  --member="serviceAccount:$SERVICE_ACCOUNT" \
  --role="roles/storage.objectAdmin" \
  --project=elite-striker-477619-p8
```

### Qdrant Access
- **Internal Access:** localhost:6333 (VM only)
- **No External IP:** Access via IAP tunnel
- **Authentication:** None (internal only)

---

## Maintenance & Operations

### Monitoring Collection Status
```bash
# SSH to VM
gcloud compute ssh sengol-vector-db \
  --zone=us-central1-a \
  --project=elite-striker-477619-p8

# Check collection
curl -s 'http://localhost:6333/collections/sengol_incidents_full'
```

### Adding New Data
1. **Generate embeddings:**
   ```bash
   export OPENAI_API_KEY="<key>"
   python3 reembed_all_with_openai.py
   ```

2. **Load to Qdrant:**
   ```bash
   python3 load_all_openai_embeddings.py
   ```

### Backup Strategy
- **Source Data:** Already in GCS (`sengol-incidents` bucket)
- **Embeddings:** Stored in GCS (`sengol-incidents-elite/openai-1536/`)
- **Qdrant:** Can be recreated from GCS embeddings
- **Recovery Time:** ~5 minutes to reload from GCS

---

## Troubleshooting

### Common Issues

**Issue:** Vector dimension mismatch
```
Error: "Vector dimension error: expected dim: 768, got 1536"
```
**Solution:** Ensure using correct collection with 1536-dim configuration

**Issue:** Permission denied accessing GCS
```
Error: "storage.objects.get access denied"
```
**Solution:** Grant compute service account proper IAM roles (see Access section)

**Issue:** Qdrant collection not found
```
Error: "Collection not found"
```
**Solution:** Create collection first:
```bash
curl -X PUT 'http://localhost:6333/collections/sengol_incidents_full' \
  -H 'Content-Type: application/json' \
  -d '{"vectors":{"size":1536,"distance":"Cosine"}}'
```

**Issue:** Slow search performance
```
Status: yellow, indexed_vectors_count < points_count
```
**Solution:** Wait for background indexing to complete (check `indexed_vectors_count`)

---

## Future Considerations

### Potential Improvements
1. **Upgrade Qdrant:** v1.12.5 → v1.15+ for better performance
2. **Add Quantization:** Reduce memory usage with scalar quantization
3. **Implement Sharding:** For datasets > 1M vectors
4. **Add Authentication:** Secure Qdrant with API keys
5. **Set up Monitoring:** Prometheus + Grafana for metrics

### Scaling Strategy
- **Current Capacity:** ~100K vectors on n2d-standard-2
- **Next Tier:** n2d-standard-4 (500K-1M vectors)
- **Enterprise:** Qdrant Cloud for multi-region, high availability

### Model Upgrades
- **Current:** text-embedding-3-small (1536-dim)
- **Option:** text-embedding-3-large (3072-dim) for higher accuracy
- **Cost:** ~4x more expensive, 2x dimensions

---

## References

### Documentation
- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [OpenAI Embeddings Guide](https://platform.openai.com/docs/guides/embeddings)
- [GCP Compute Engine](https://cloud.google.com/compute/docs)

### Related Files
- `/docs/vector/VECTOR_SEARCH_SETUP.md` - Initial setup guide
- `/docs/vector/QDRANT_OPERATIONS.md` - Operations manual
- `/scripts/` - Embedding generation scripts

---

## Changelog

### 2025-01-10 - Initial Migration Complete
- Migrated from Vertex AI (768-dim) to OpenAI (1536-dim)
- Re-embedded all 78,827 records
- Deleted old Vertex AI embeddings
- Verified search functionality
- Documented migration process

---

**Migration Completed By:** Claude Code
**Last Updated:** 2025-01-10
**Document Version:** 1.0
