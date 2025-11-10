# GCE Crawler Infrastructure - Quick Reference

**Last Updated:** January 10, 2025

---

## 🚀 Quick Start

```bash
# Deploy entire infrastructure (15 minutes)
cd /Users/durai/Documents/GitHub/sengol-api
./scripts/gce/1-setup-infrastructure.sh
export DATABASE_URL="postgresql://..."
./scripts/gce/2-setup-database.sh
./scripts/gce/3-deploy-services.sh
./scripts/gce/4-setup-scheduler.sh
```

---

## 📋 Common Commands

### Infrastructure Management

```bash
# List all VMs
gcloud compute instances list --filter="name:sengol-*" --format="table(name,zone,status,machineType)"

# Start/Stop VMs
gcloud compute instances start sengol-crawler-orchestrator --zone=us-central1-a
gcloud compute instances stop sengol-embedding-generator --zone=us-central1-a

# SSH to VM
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a

# View VM logs
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="sudo journalctl -u sengol-orchestrator -n 100"

# Tail logs in real-time
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="sudo journalctl -u sengol-orchestrator -f"
```

### Service Management

```bash
# Check service status
sudo systemctl status sengol-orchestrator

# Start/Stop/Restart service
sudo systemctl start sengol-orchestrator
sudo systemctl stop sengol-orchestrator
sudo systemctl restart sengol-orchestrator

# View service logs
sudo journalctl -u sengol-orchestrator -n 100

# Enable/Disable auto-start
sudo systemctl enable sengol-orchestrator
sudo systemctl disable sengol-orchestrator
```

### Orchestrator Operations

```bash
# Execute all enabled crawlers (dry run)
curl -X POST http://localhost:3000/api/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d '{"dryRun": true}'

# Execute regulatory crawlers only
curl -X POST http://localhost:3000/api/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d '{"category": "regulatory"}'

# Execute high-priority crawlers (priority 1-5)
curl -X POST http://localhost:3000/api/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d '{"priority": 5}'

# Execute specific sources
curl -X POST http://localhost:3000/api/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d '{"sourceIds": ["uuid1", "uuid2"]}'

# Health check
curl http://localhost:3000/api/orchestrator/health | python3 -m json.tool

# Get statistics
curl http://localhost:3000/api/orchestrator/statistics | python3 -m json.tool
```

### Auto-Discovery

```bash
# Discover sources from domains
curl -X POST http://localhost:3000/api/orchestrator/discovery/discover \
  -H "Content-Type: application/json" \
  -d '{
    "domains": [
      "https://www.aiaaic.org",
      "https://incidentdatabase.ai"
    ],
    "saveToDatabase": true
  }' | python3 -m json.tool
```

### Cloud Scheduler

```bash
# List jobs
gcloud scheduler jobs list --location=us-central1

# Run job manually
gcloud scheduler jobs run regulatory-crawlers-6h --location=us-central1

# Pause/Resume job
gcloud scheduler jobs pause all-crawlers-daily --location=us-central1
gcloud scheduler jobs resume all-crawlers-daily --location=us-central1

# Update schedule
gcloud scheduler jobs update http all-crawlers-daily \
  --location=us-central1 \
  --schedule="0 3 * * *"
```

### Database Queries

```bash
# Connect to database
psql "$DATABASE_URL"
```

```sql
-- View all sources
SELECT id, source_name, category, enabled, priority, last_crawled_at
FROM source_registry
ORDER BY priority;

-- View eligible sources (ready to crawl)
SELECT * FROM eligible_sources;

-- Recent executions
SELECT
  crawler_name,
  status,
  started_at,
  completed_at,
  records_processed,
  records_new,
  records_failed
FROM crawler_executions
ORDER BY started_at DESC
LIMIT 20;

-- Failed sources (need attention)
SELECT source_name, consecutive_failures, last_error_message
FROM source_registry
WHERE consecutive_failures >= 3
ORDER BY consecutive_failures DESC;

-- Enable/Disable source
UPDATE source_registry SET enabled = true WHERE source_name = 'AIAAIC Repository';
UPDATE source_registry SET enabled = false WHERE source_name = 'OECD Policy';

-- Reset failure count
UPDATE source_registry SET consecutive_failures = 0 WHERE id = 'uuid';

-- Add new source manually
INSERT INTO source_registry (
  source_name,
  source_url,
  source_type,
  category,
  enabled,
  priority,
  crawler_class,
  target_table
) VALUES (
  'New Source',
  'https://example.com/api',
  'api',
  'incidents',
  true,
  10,
  'CustomCrawler',
  'ai_incidents'
);
```

### GCS Operations

```bash
# List buckets
gsutil ls -p elite-striker-477619-p8

# List files in bucket
gsutil ls gs://sengol-crawled-data-processed/

# Download file
gsutil cp gs://sengol-crawled-data-processed/incidents/file.json /tmp/

# Upload file
gsutil cp /tmp/file.json gs://sengol-crawled-data-processed/incidents/

# Delete old files (> 90 days)
gsutil -m rm gs://sengol-crawled-data-raw/**/$(date -d '90 days ago' +%Y-%m-%d)*

# Check bucket size
gsutil du -sh gs://sengol-crawled-data-processed/
```

### Pub/Sub Operations

```bash
# List topics
gcloud pubsub topics list

# Publish test message
gcloud pubsub topics publish sengol-data-crawled \
  --message='{"sourceId":"test","sourceName":"Test","gcsPath":"test.json"}'

# List subscriptions
gcloud pubsub subscriptions list

# Pull messages (debugging)
gcloud pubsub subscriptions pull sengol-data-crawled-sub --limit=5
```

### Qdrant Operations

```bash
# SSH to Qdrant VM
gcloud compute ssh sengol-vector-db --zone=us-central1-a

# Check collection
curl -s http://localhost:6333/collections/sengol_incidents_full | python3 -m json.tool

# Count vectors
curl -s http://localhost:6333/collections/sengol_incidents_full | \
  python3 -c "import sys,json;print(f'Points: {json.load(sys.stdin)[\"result\"][\"points_count\"]:,}')"

# Create snapshot
curl -X POST http://localhost:6333/collections/sengol_incidents_full/snapshots

# List snapshots
curl -s http://localhost:6333/collections/sengol_incidents_full/snapshots | python3 -m json.tool

# Download snapshot to GCS
SNAPSHOT=$(curl -s http://localhost:6333/collections/sengol_incidents_full/snapshots | \
  python3 -c 'import sys,json;print(json.load(sys.stdin)["result"][0]["name"])')
gsutil cp /var/lib/qdrant/snapshots/$SNAPSHOT \
  gs://sengol-incidents-elite/backups/qdrant/
```

---

## 🐛 Troubleshooting

### Service Won't Start

```bash
# Check service status
sudo systemctl status sengol-orchestrator

# View error logs
sudo journalctl -u sengol-orchestrator -n 50

# Check environment variables
cat ~/.bashrc | grep -E "(OPENAI|DATABASE)"

# Verify dependencies
cd ~/sengol-crawler
pnpm install
npx prisma generate

# Restart service
sudo systemctl restart sengol-orchestrator
```

### No Tasks Created

```bash
# Check source registry
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM eligible_sources;"

# If 0, enable sources
psql "$DATABASE_URL" -c "UPDATE source_registry SET enabled = true WHERE priority <= 5;"

# Check orchestrator logs
sudo journalctl -u sengol-orchestrator -n 100 | grep -i "eligible"

# Verify Cloud Tasks queue
gcloud tasks queues describe sengol-crawler-tasks --location=us-central1
```

### Embeddings Not Generating

```bash
# Check embedding generator status
gcloud compute ssh sengol-embedding-generator --zone=us-central1-a \
  --command="sudo systemctl status sengol-embedding-gen"

# View logs
gcloud compute ssh sengol-embedding-generator --zone=us-central1-a \
  --command="sudo journalctl -u sengol-embedding-gen -n 100"

# Test OpenAI API
python3 -c "
from openai import OpenAI
import os
client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
print(client.models.list())
"

# Check Pub/Sub subscription
gcloud pubsub subscriptions pull sengol-data-crawled-sub --limit=5
```

### Qdrant Not Updating

```bash
# Check Qdrant loader status
gcloud compute ssh sengol-qdrant-loader --zone=us-central1-a \
  --command="sudo systemctl status sengol-qdrant-loader"

# Test connectivity to Qdrant
gcloud compute ssh sengol-qdrant-loader --zone=us-central1-a \
  --command="curl http://sengol-vector-db:6333"

# Check firewall rules
gcloud compute firewall-rules list --filter="name:sengol-internal-allow"

# Verify Pub/Sub subscription
gcloud pubsub subscriptions pull sengol-embeddings-generated-sub --limit=5
```

---

## 📊 Monitoring

### Health Checks

```bash
# Orchestrator health
curl http://ORCHESTRATOR_IP:3000/api/orchestrator/health | python3 -m json.tool

# All services health
for SERVICE in orchestrator worker embedding-gen qdrant-loader; do
  echo "=== $SERVICE ==="
  gcloud compute ssh sengol-crawler-$SERVICE --zone=us-central1-a \
    --command="sudo systemctl is-active sengol-$SERVICE"
done
```

### Statistics

```bash
# Crawler execution stats (last 7 days)
psql "$DATABASE_URL" -c "
SELECT
  DATE(started_at) as date,
  COUNT(*) as executions,
  COUNT(*) FILTER (WHERE status = 'completed') as successful,
  SUM(records_new) as new_records
FROM crawler_executions
WHERE started_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(started_at)
ORDER BY date DESC;
"

# Source health summary
psql "$DATABASE_URL" -c "
SELECT
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE enabled = true) as enabled,
  COUNT(*) FILTER (WHERE consecutive_failures >= 3) as failing
FROM source_registry
GROUP BY category;
"

# Qdrant collection stats
gcloud compute ssh sengol-vector-db --zone=us-central1-a \
  --command="curl -s http://localhost:6333/collections/sengol_incidents_full | \
    python3 -c 'import sys,json;d=json.load(sys.stdin)[\"result\"];print(f\"Points: {d[\"points_count\"]:,}\nIndexed: {d[\"indexed_vectors_count\"]:,}\nStatus: {d[\"status\"]}\")'"
```

---

## 💰 Cost Management

### Current Spending

```bash
# GCE compute costs
gcloud compute instances list --filter="name:sengol-*" \
  --format="table(name,machineType,zone,status)"

# Estimated monthly cost: $145
```

### Cost Optimization

```bash
# Stop non-critical VMs during off-hours
gcloud compute instances stop sengol-embedding-generator sengol-qdrant-loader \
  --zone=us-central1-a

# Start before scheduled runs
gcloud compute instances start sengol-embedding-generator sengol-qdrant-loader \
  --zone=us-central1-a

# Use preemptible VMs for workers (60-90% discount)
gcloud compute instances create sengol-crawler-worker-2 \
  --zone=us-central1-a \
  --source-instance-template=sengol-crawler-worker-template \
  --preemptible
```

---

## 🔐 Security

### Update Secrets

```bash
# Create secrets in Secret Manager
echo -n "sk-new-key" | gcloud secrets create openai-api-key --data-file=-

# Update .env on VMs
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a
nano ~/sengol-crawler/.env
# Update OPENAI_API_KEY=sk-new-key
sudo systemctl restart sengol-orchestrator
```

### IAM Permissions

```bash
# List service account permissions
gcloud projects get-iam-policy elite-striker-477619-p8 \
  --flatten="bindings[].members" \
  --filter="bindings.members:sengol-*"

# Grant additional permission
gcloud projects add-iam-policy-binding elite-striker-477619-p8 \
  --member="serviceAccount:sengol-orchestrator@elite-striker-477619-p8.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"
```

---

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `GCE_IMPLEMENTATION_PLAN.md` | Complete architecture and design |
| `GCE_DEPLOYMENT_README.md` | Step-by-step deployment guide |
| `GCE_IMPLEMENTATION_SUMMARY.md` | Implementation summary |
| `QUICK_REFERENCE.md` | This file - common operations |
| `DATA_SOURCES.md` | List of all data sources |
| `/docs/vector/QDRANT_OPERATIONS.md` | Qdrant operations manual |

---

## 🆘 Emergency Procedures

### Complete System Restart

```bash
# Stop all services
for VM in orchestrator worker-1 embedding-generator qdrant-loader; do
  gcloud compute ssh sengol-crawler-$VM --zone=us-central1-a \
    --command="sudo systemctl stop sengol-$VM"
done

# Wait 10 seconds
sleep 10

# Start all services
for VM in orchestrator worker-1 embedding-generator qdrant-loader; do
  gcloud compute ssh sengol-crawler-$VM --zone=us-central1-a \
    --command="sudo systemctl start sengol-$VM"
done

# Verify
for VM in orchestrator worker-1 embedding-generator qdrant-loader; do
  echo "=== $VM ==="
  gcloud compute ssh sengol-crawler-$VM --zone=us-central1-a \
    --command="sudo systemctl status sengol-$VM"
done
```

### Rollback Deployment

```bash
# Re-deploy from backup
cd /Users/durai/Documents/GitHub/sengol-api
./scripts/gce/3-deploy-services.sh
```

### Restore Qdrant from Snapshot

```bash
# Download snapshot from GCS
gsutil cp gs://sengol-incidents-elite/backups/qdrant/SNAPSHOT_NAME /tmp/

# SSH to Qdrant VM
gcloud compute ssh sengol-vector-db --zone=us-central1-a

# Stop Qdrant
sudo systemctl stop qdrant

# Restore snapshot
sudo mv /tmp/SNAPSHOT_NAME /var/lib/qdrant/snapshots/
curl -X PUT 'http://localhost:6333/collections/sengol_incidents_full/snapshots/upload' \
  -H 'Content-Type: multipart/form-data' \
  -F "snapshot=@/var/lib/qdrant/snapshots/SNAPSHOT_NAME"

# Start Qdrant
sudo systemctl start qdrant

# Verify
curl http://localhost:6333/collections/sengol_incidents_full
```

---

## 📞 Support

**Documentation:** `/docs/crawlers/`
**Logs:** `sudo journalctl -u sengol-SERVICE -n 100`
**Health:** `GET /api/orchestrator/health`
**Statistics:** `GET /api/orchestrator/statistics`

**Emergency Contact:** DevOps Team

---

**Quick Reference Version:** 1.0
**Last Updated:** 2025-01-10
