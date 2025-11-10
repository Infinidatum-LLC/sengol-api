# Vector Search Documentation

This directory contains comprehensive documentation for the Sengol vector search infrastructure.

---

## Documents Overview

### 📊 [EMBEDDINGS_MIGRATION.md](./EMBEDDINGS_MIGRATION.md)
**Complete migration guide from Vertex AI to OpenAI embeddings**

- Migration summary and rationale
- Technical details and specifications
- Data breakdown (78,827 vectors)
- Step-by-step migration process
- Storage locations and file structure
- Validation and testing results
- Performance metrics
- Troubleshooting guide

**Key Info:**
- **Migration Date:** January 2025
- **Old Model:** Vertex AI text-embedding-004 (768-dim)
- **New Model:** OpenAI text-embedding-3-small (1536-dim)
- **Status:** ✅ Complete

---

### 🔧 [QDRANT_OPERATIONS.md](./QDRANT_OPERATIONS.md)
**Operational guide for Qdrant vector database**

- Quick reference and connection details
- Common operations (search, retrieve, count)
- Administration tasks (create, delete, update)
- Backup and recovery procedures
- Performance tuning and optimization
- Monitoring and metrics
- Security configuration
- Troubleshooting guide
- API reference

**Key Info:**
- **Version:** Qdrant v1.12.5
- **Instance:** sengol-vector-db (GCE)
- **Collection:** sengol_incidents_full (78,827 vectors)
- **Status:** ✅ Operational

---

## Quick Start

### Connect to Qdrant
```bash
# SSH to vector database VM
gcloud compute ssh sengol-vector-db \
  --zone=us-central1-a \
  --project=elite-striker-477619-p8

# Check collection status
curl 'http://localhost:6333/collections/sengol_incidents_full'
```

### Search for Incidents
```python
from qdrant_client import QdrantClient
from openai import OpenAI

# Initialize clients
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
qdrant_client = QdrantClient(host="localhost", port=6333)

# Generate query embedding
query = "ransomware attacks"
response = openai_client.embeddings.create(
    model="text-embedding-3-small",
    input=query
)
query_vector = response.data[0].embedding

# Search Qdrant
results = qdrant_client.search(
    collection_name="sengol_incidents_full",
    query_vector=query_vector,
    limit=10
)

# Print results
for result in results:
    print(f"Score: {result.score:.4f}")
    print(f"Content: {result.payload['content'][:200]}...")
```

---

## System Architecture

```
┌─────────────────┐
│   User Query    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  OpenAI API     │  Generate 1536-dim embedding
│  text-emb-3-sm  │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Qdrant Vector  │  Semantic search
│     Database    │  Cosine similarity
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Ranked Results  │  Top-K most similar incidents
└─────────────────┘
```

---

## Data Sources

| Source | Records | Type | Description |
|--------|---------|------|-------------|
| cyber_incident_staging | 21,015 | CVE/Incidents | Vulnerabilities, cyberattacks |
| failure_patterns | 20,933 | AI/ML Failures | System failures, adversarial attacks |
| cep_signal_events | 25,244 | CEP Signals | Common Event Pattern signals |
| regulation_violations | 11,514 | Compliance | Regulatory violations |
| cloud_incident_staging | 56 | Cloud | Infrastructure incidents |
| cep_anomalies | 40 | Anomalies | Detected anomalies |
| security_vulnerabilities | 20 | Security | Security vulnerabilities |
| cep_pattern_templates | 5 | Templates | Pattern templates |
| **Total** | **78,827** | - | All incident data |

---

## Infrastructure

### GCP Resources
- **VM:** sengol-vector-db
- **Project:** elite-striker-477619-p8
- **Zone:** us-central1-a
- **Machine:** n2d-standard-2
- **Disk:** 50GB persistent SSD

### Storage
- **Raw Data:** gs://sengol-incidents/incidents/postgres-migrated/raw/
- **Embeddings:** gs://sengol-incidents-elite/incidents/embeddings/openai-1536/
- **Backups:** gs://sengol-incidents-elite/backups/qdrant/

### Services
- **Qdrant:** v1.12.5 (port 6333)
- **OpenAI API:** text-embedding-3-small
- **Access:** IAP tunnel (no external IP)

---

## Key Metrics

### Performance
- **Search Latency:** < 1ms (indexed)
- **Indexing Status:** 97.7% (76,993/78,827)
- **Insert Rate:** 283-495 vectors/second
- **Query Rate:** Unlimited (localhost)

### Storage
- **Vector Size:** 1536 dimensions × 4 bytes = 6.1 KB per vector
- **Total Size:** ~481 MB for 78,827 vectors
- **Indexed Size:** ~470 MB (97.7% indexed)
- **Disk Usage:** < 2 GB (includes metadata, HNSW index)

### Costs
- **VM Cost:** ~$50/month (n2d-standard-2)
- **Storage:** ~$0.10/month (2 GB)
- **Embedding Generation:** ~$0.15 one-time (78K records)
- **Total Monthly:** ~$50/month

---

## Maintenance Schedule

### Daily
- ✅ Automated monitoring (systemd)
- ✅ Auto-indexing of new vectors

### Weekly
- Check collection health
- Review search performance
- Monitor disk usage

### Monthly
- Create snapshots
- Upload to GCS backup
- Review logs for errors
- Update documentation

### Quarterly
- Review upgrade path for Qdrant
- Optimize collection parameters
- Benchmark search performance
- Capacity planning review

---

## Related Documentation

### Project Documentation
- `/CLAUDE.md` - Project overview and architecture
- `/RESILIENCE.md` - Resilience patterns and error handling
- `/API_CONTRACT.md` - API documentation

### Vector Search Files
- `/src/services/incident-search.ts` - Vector search service
- `/src/services/dvecdb-embeddings.ts` - Embedding generation (legacy)
- `/src/lib/dvecdb.ts` - Vector DB client (legacy)

### Migration Scripts
- `/home/durai_sengol_ai/reembed_all_with_openai.py` - Re-embedding script
- `/home/durai_sengol_ai/load_all_openai_embeddings.py` - Loading script
- `/home/durai_sengol_ai/test_qdrant_search.py` - Search testing script

---

## Support & Troubleshooting

### Common Issues

**1. Cannot connect to Qdrant**
```bash
# Check if service is running
sudo systemctl status qdrant

# Restart if needed
sudo systemctl restart qdrant
```

**2. Search returns no results**
```bash
# Verify collection has data
curl 'http://localhost:6333/collections/sengol_incidents_full'

# Check indexing status
# If indexed_vectors_count < points_count, wait for indexing
```

**3. Slow search performance**
```python
# Increase search quality parameter
results = qdrant_client.search(
    collection_name="sengol_incidents_full",
    query_vector=query_vector,
    limit=10,
    search_params={"hnsw_ef": 128}  # Increase from default 64
)
```

### Getting Help

1. **Check logs:**
   ```bash
   sudo journalctl -u qdrant -n 100
   ```

2. **Review documentation:**
   - QDRANT_OPERATIONS.md (troubleshooting section)
   - EMBEDDINGS_MIGRATION.md (migration issues)

3. **Contact team:**
   - DevOps: Infrastructure issues
   - ML Team: Embedding/search quality
   - Backend: API integration

4. **External resources:**
   - [Qdrant Documentation](https://qdrant.tech/documentation/)
   - [Qdrant Discord](https://discord.gg/qdrant)
   - [OpenAI Platform](https://platform.openai.com/docs)

---

## Recent Updates

### 2025-01-10
- ✅ Completed migration from Vertex AI to OpenAI embeddings
- ✅ Re-embedded all 78,827 incident records
- ✅ Upgraded from 768-dim to 1536-dim vectors
- ✅ Validated search functionality and performance
- ✅ Created comprehensive documentation

### Next Steps
- [ ] Set up automated backup schedule
- [ ] Implement monitoring dashboards
- [ ] Plan for Qdrant version upgrade (v1.12.5 → v1.15+)
- [ ] Consider quantization for memory optimization

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-01-10 | Initial documentation after migration |

---

**Maintained By:** DevOps Team
**Last Review:** 2025-01-10
**Next Review:** 2025-04-10 (Quarterly)
