# Qdrant Operations Manual

**Last Updated:** January 2025
**Qdrant Version:** 1.12.5
**Collection:** `sengol_incidents_full`

---

## Quick Reference

### Connection Details
```
Host: localhost (VM internal only)
Port: 6333
Instance: sengol-vector-db
Zone: us-central1-a
Project: elite-striker-477619-p8
```

### Collection Stats (Current)
```
Total Vectors: 78,827
Dimensions: 1536 (OpenAI text-embedding-3-small)
Distance: Cosine
Status: green
Indexed: 97.7%
```

---

## Common Operations

### 1. Check Collection Status

**Via SSH:**
```bash
# SSH to VM
gcloud compute ssh sengol-vector-db \
  --zone=us-central1-a \
  --project=elite-striker-477619-p8

# Check collection
curl -s 'http://localhost:6333/collections/sengol_incidents_full' | python3 -m json.tool
```

**Expected Output:**
```json
{
  "result": {
    "status": "green",
    "points_count": 78827,
    "indexed_vectors_count": 76993,
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    }
  }
}
```

### 2. List All Collections

```bash
curl -s 'http://localhost:6333/collections' | python3 -m json.tool
```

### 3. Retrieve Sample Points

```bash
curl -s -X POST 'http://localhost:6333/collections/sengol_incidents_full/points/scroll' \
  -H 'Content-Type: application/json' \
  -d '{
    "limit": 5,
    "with_payload": true,
    "with_vector": false
  }' | python3 -m json.tool
```

### 4. Search by Vector

**Python Script:**
```python
from qdrant_client import QdrantClient
from openai import OpenAI

# Initialize clients
openai_client = OpenAI(api_key="<OPENAI_API_KEY>")
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

for result in results:
    print(f"Score: {result.score}, ID: {result.id}")
    print(f"Content: {result.payload.get('content', '')[:100]}...")
```

### 5. Count Vectors by Source

**Python Script:**
```python
from qdrant_client import QdrantClient

client = QdrantClient(host="localhost", port=6333)

# Get all points
points = client.scroll(
    collection_name="sengol_incidents_full",
    limit=100000,
    with_payload=["source_file"],
    with_vector=False
)

# Count by source
from collections import Counter
sources = [p.payload.get('source_file') for p in points[0]]
counts = Counter(sources)

for source, count in counts.most_common():
    print(f"{source}: {count:,}")
```

---

## Administration Tasks

### Create New Collection

```bash
curl -X PUT 'http://localhost:6333/collections/new_collection_name' \
  -H 'Content-Type: application/json' \
  -d '{
    "vectors": {
      "size": 1536,
      "distance": "Cosine"
    },
    "optimizers_config": {
      "indexing_threshold": 20000
    }
  }'
```

### Delete Collection

```bash
curl -X DELETE 'http://localhost:6333/collections/collection_name'
```

### Update Collection Parameters

```bash
curl -X PATCH 'http://localhost:6333/collections/sengol_incidents_full' \
  -H 'Content-Type: application/json' \
  -d '{
    "optimizers_config": {
      "indexing_threshold": 30000
    }
  }'
```

### Create Collection Alias

```bash
curl -X POST 'http://localhost:6333/collections/aliases' \
  -H 'Content-Type: application/json' \
  -d '{
    "actions": [{
      "create_alias": {
        "collection_name": "sengol_incidents_full",
        "alias_name": "incidents"
      }
    }]
  }'
```

---

## Backup & Recovery

### 1. Create Snapshot

```bash
# Create snapshot
curl -X POST 'http://localhost:6333/collections/sengol_incidents_full/snapshots'

# Output: {"result": {"name": "sengol_incidents_full-2025-01-10-12-30-45.snapshot"}}
```

### 2. List Snapshots

```bash
curl -s 'http://localhost:6333/collections/sengol_incidents_full/snapshots' | python3 -m json.tool
```

### 3. Download Snapshot

```bash
SNAPSHOT_NAME="sengol_incidents_full-2025-01-10-12-30-45.snapshot"
curl -o /tmp/$SNAPSHOT_NAME \
  "http://localhost:6333/collections/sengol_incidents_full/snapshots/$SNAPSHOT_NAME"
```

### 4. Upload to GCS

```bash
gsutil cp /tmp/$SNAPSHOT_NAME \
  gs://sengol-incidents-elite/backups/qdrant/$SNAPSHOT_NAME
```

### 5. Restore from Snapshot

```bash
# 1. Delete existing collection
curl -X DELETE 'http://localhost:6333/collections/sengol_incidents_full'

# 2. Upload snapshot to VM
gsutil cp gs://sengol-incidents-elite/backups/qdrant/$SNAPSHOT_NAME \
  /var/lib/qdrant/snapshots/

# 3. Restore collection
curl -X PUT 'http://localhost:6333/collections/sengol_incidents_full/snapshots/upload' \
  -H 'Content-Type: multipart/form-data' \
  -F "snapshot=@/var/lib/qdrant/snapshots/$SNAPSHOT_NAME"
```

### 6. Rebuild from GCS Embeddings

**If snapshots unavailable, rebuild from source:**
```bash
# 1. SSH to VM
gcloud compute ssh sengol-vector-db --zone=us-central1-a --project=elite-striker-477619-p8

# 2. Create new collection
curl -X PUT 'http://localhost:6333/collections/sengol_incidents_full' \
  -H 'Content-Type: application/json' \
  -d '{"vectors":{"size":1536,"distance":"Cosine"}}'

# 3. Load embeddings from GCS
cd /home/durai_sengol_ai
python3 load_all_openai_embeddings.py
```

**Recovery Time:** ~5 minutes for full 78,827 vectors

---

## Performance Tuning

### 1. Optimize Collection

```bash
# Trigger manual optimization
curl -X POST 'http://localhost:6333/collections/sengol_incidents_full/optimize'
```

### 2. Check Indexing Status

```bash
curl -s 'http://localhost:6333/collections/sengol_incidents_full' | \
  python3 -c "import sys,json;d=json.load(sys.stdin)['result'];print(f'Indexed: {d[\"indexed_vectors_count\"]}/{d[\"points_count\"]} ({d[\"indexed_vectors_count\"]/d[\"points_count\"]*100:.1f}%)')"
```

### 3. Adjust HNSW Parameters

```bash
curl -X PATCH 'http://localhost:6333/collections/sengol_incidents_full' \
  -H 'Content-Type: application/json' \
  -d '{
    "hnsw_config": {
      "m": 32,
      "ef_construct": 200
    }
  }'
```

**Parameter Guide:**
- `m`: 16-64 (higher = better recall, more memory)
- `ef_construct`: 100-400 (higher = better quality, slower indexing)

### 4. Enable Quantization (Reduce Memory)

```bash
curl -X PATCH 'http://localhost:6333/collections/sengol_incidents_full' \
  -H 'Content-Type: application/json' \
  -d '{
    "quantization_config": {
      "scalar": {
        "type": "int8",
        "quantile": 0.99,
        "always_ram": true
      }
    }
  }'
```

**Memory Savings:** ~75% reduction (1536-dim → int8)

---

## Monitoring & Metrics

### 1. Collection Metrics

```bash
curl -s 'http://localhost:6333/metrics' | grep qdrant_
```

**Key Metrics:**
- `qdrant_collections_total`: Total collections
- `qdrant_points_total`: Total vectors
- `qdrant_searches_total`: Total searches
- `qdrant_indexing_status`: Indexing progress

### 2. Check Qdrant Service Status

```bash
# Via systemd
sudo systemctl status qdrant

# Check logs
sudo journalctl -u qdrant -f
```

### 3. Check Resource Usage

```bash
# Memory
free -h

# Disk
df -h /var/lib/qdrant

# Qdrant process
ps aux | grep qdrant
```

### 4. Monitor Search Performance

**Python script:**
```python
import time
from qdrant_client import QdrantClient
from openai import OpenAI

openai_client = OpenAI(api_key="<key>")
qdrant_client = QdrantClient(host="localhost", port=6333)

# Generate test query
query_vector = openai_client.embeddings.create(
    model="text-embedding-3-small",
    input="test query"
).data[0].embedding

# Measure search time
start = time.time()
results = qdrant_client.search(
    collection_name="sengol_incidents_full",
    query_vector=query_vector,
    limit=10
)
elapsed = time.time() - start

print(f"Search time: {elapsed*1000:.2f}ms")
print(f"Results: {len(results)}")
```

---

## Troubleshooting

### Issue: Collection Not Found
```bash
# List all collections
curl -s 'http://localhost:6333/collections'

# Create if missing
curl -X PUT 'http://localhost:6333/collections/sengol_incidents_full' \
  -H 'Content-Type: application/json' \
  -d '{"vectors":{"size":1536,"distance":"Cosine"}}'
```

### Issue: Qdrant Service Down
```bash
# Check status
sudo systemctl status qdrant

# Restart service
sudo systemctl restart qdrant

# Check logs
sudo journalctl -u qdrant -n 100
```

### Issue: Slow Searches
```bash
# Check indexing status
curl -s 'http://localhost:6333/collections/sengol_incidents_full' | \
  python3 -m json.tool | grep -E "(status|indexed_vectors_count|points_count)"

# If status is "yellow", wait for indexing to complete
# If status is "green" and still slow, increase ef_search parameter:
```

**Increase search quality (slower):**
```python
results = qdrant_client.search(
    collection_name="sengol_incidents_full",
    query_vector=query_vector,
    limit=10,
    search_params={"hnsw_ef": 128}  # Default: 64
)
```

### Issue: High Memory Usage
```bash
# Check memory
free -h

# Check Qdrant usage
ps aux | grep qdrant | awk '{print $6}'

# Solution: Enable quantization (see Performance Tuning section)
```

### Issue: Disk Space Full
```bash
# Check disk usage
du -sh /var/lib/qdrant/*

# Clean up old snapshots
rm /var/lib/qdrant/snapshots/*.snapshot

# If needed, expand disk:
gcloud compute disks resize sengol-vector-db \
  --size=100GB \
  --zone=us-central1-a \
  --project=elite-striker-477619-p8
```

---

## Security

### 1. Enable API Key Authentication

**Edit Qdrant config:**
```yaml
# /etc/qdrant/config.yaml
service:
  api_key: "your-secure-api-key-here"
```

**Restart Qdrant:**
```bash
sudo systemctl restart qdrant
```

**Use API key in requests:**
```bash
curl -H "api-key: your-secure-api-key-here" \
  'http://localhost:6333/collections'
```

### 2. Restrict Network Access

**Firewall rules (if needed):**
```bash
# Allow only local access
sudo ufw allow from 127.0.0.1 to any port 6333
sudo ufw deny 6333
```

### 3. Enable TLS/SSL

**Not required for localhost-only access**, but for production:
```yaml
# /etc/qdrant/config.yaml
service:
  enable_tls: true
  tls_cert: /path/to/cert.pem
  tls_key: /path/to/key.pem
```

---

## Upgrade Qdrant

### Current: v1.12.5 → Target: v1.15+

**Steps:**
```bash
# 1. Create snapshot first!
curl -X POST 'http://localhost:6333/collections/sengol_incidents_full/snapshots'

# 2. Stop Qdrant
sudo systemctl stop qdrant

# 3. Download new version
wget https://github.com/qdrant/qdrant/releases/download/v1.15.0/qdrant-x86_64-unknown-linux-gnu.tar.gz

# 4. Extract and replace
tar xzf qdrant-x86_64-unknown-linux-gnu.tar.gz
sudo mv qdrant /usr/local/bin/qdrant

# 5. Start Qdrant
sudo systemctl start qdrant

# 6. Verify
curl 'http://localhost:6333' | python3 -m json.tool
```

---

## API Reference

### Base URL
```
http://localhost:6333
```

### Common Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/collections` | List all collections |
| GET | `/collections/{name}` | Get collection info |
| PUT | `/collections/{name}` | Create collection |
| DELETE | `/collections/{name}` | Delete collection |
| POST | `/collections/{name}/points/scroll` | Retrieve points |
| POST | `/collections/{name}/points/search` | Search vectors |
| POST | `/collections/{name}/snapshots` | Create snapshot |
| GET | `/metrics` | Prometheus metrics |
| GET | `/` | Server info |

### Full API Docs
https://qdrant.tech/documentation/interfaces/

---

## Contact & Support

### Internal Team
- **Vector DB Admin:** DevOps Team
- **Embeddings Pipeline:** ML Team
- **API Integration:** Backend Team

### External Resources
- **Qdrant Discord:** https://discord.gg/qdrant
- **Qdrant GitHub:** https://github.com/qdrant/qdrant
- **Documentation:** https://qdrant.tech/documentation/

---

**Last Updated:** 2025-01-10
**Document Version:** 1.0
**Maintained By:** DevOps Team
