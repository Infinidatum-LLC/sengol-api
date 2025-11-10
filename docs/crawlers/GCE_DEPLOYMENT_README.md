# GCE Crawler Infrastructure - Deployment Guide

**Last Updated:** January 2025
**Status:** Production-Ready Implementation
**Project:** elite-striker-477619-p8

---

## Overview

This document provides complete deployment instructions for the Sengol crawler infrastructure on Google Cloud Platform (GCE). The system consists of:

- **4 VM instances** (orchestrator, workers, embedding generator, Qdrant loader)
- **3 GCS buckets** (raw data, processed data, embeddings)
- **3 Pub/Sub topics** (data-crawled, embeddings-generated, qdrant-updated)
- **3 Cloud Tasks queues** (crawler-tasks, embedding-tasks, qdrant-tasks)
- **4 Cloud Scheduler jobs** (automated execution)

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUD SCHEDULER                               │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ Regulatory   │ │ All Crawlers │ │ News         │            │
│  │ Every 6h     │ │ Daily 2 AM   │ │ Every 4h     │            │
│  └──────┬───────┘ └──────┬───────┘ └──────┬───────┘            │
└─────────┼────────────────┼────────────────┼────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ORCHESTRATOR VM                               │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  CrawlerOrchestrator Service (Node.js/TypeScript)        │  │
│  │  - Load sources from source_registry                     │  │
│  │  - Filter eligible sources                               │  │
│  │  - Create Cloud Tasks for workers                        │  │
│  │  - Monitor execution                                     │  │
│  └────────────────────┬─────────────────────────────────────┘  │
└───────────────────────┼─────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────────┐
│                    CLOUD TASKS QUEUE                             │
│                  (sengol-crawler-tasks)                          │
└────────────────────────┬────────────────────────────────────────┘
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
┌────────────┐  ┌────────────┐  ┌────────────┐
│  WORKER-1  │  │  WORKER-2  │  │  WORKER-N  │
│            │  │            │  │            │
│ Execute    │  │ Execute    │  │ Execute    │
│ Crawler    │  │ Crawler    │  │ Crawler    │
│ Tasks      │  │ Tasks      │  │ Tasks      │
└─────┬──────┘  └─────┬──────┘  └─────┬──────┘
      │               │               │
      └───────────────┼───────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GCS BUCKET                                    │
│              (sengol-crawled-data-processed)                     │
│  cyber_incidents_2025-01-10.json                                │
│  regulatory_data_2025-01-10.json                                │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ Pub/Sub (data-crawled)
┌─────────────────────────────────────────────────────────────────┐
│               EMBEDDING GENERATOR VM (Python)                    │
│  - Download raw data from GCS                                   │
│  - Generate OpenAI embeddings (1536-dim)                        │
│  - Upload to GCS embeddings bucket                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    GCS BUCKET                                    │
│         (sengol-incidents-elite/incidents/embeddings)            │
│  cyber_incidents_2025-01-10.jsonl                               │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼ Pub/Sub (embeddings-generated)
┌─────────────────────────────────────────────────────────────────┐
│                  QDRANT LOADER VM (Python)                       │
│  - Download embeddings from GCS                                 │
│  - Upsert to Qdrant (sengol_incidents_full)                     │
│  - Update PostgreSQL embedding_status                           │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                  QDRANT VECTOR DATABASE                          │
│              (sengol-vector-db VM, port 6333)                    │
│  Collection: sengol_incidents_full (78,827+ vectors)            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

### Local Machine

```bash
# Install gcloud CLI
brew install --cask google-cloud-sdk

# Authenticate
gcloud auth login
gcloud config set project elite-striker-477619-p8

# Install required tools
brew install pnpm
npm install -g typescript tsx
```

### Environment Variables

Create `.env` file with:

```bash
DATABASE_URL="postgresql://user:pass@host:5432/db"
OPENAI_API_KEY="sk-..."
GCP_PROJECT_ID="elite-striker-477619-p8"
GCP_REGION="us-central1"
DVECDB_HOST="sengol-vector-db"
DVECDB_PORT="6333"
```

---

## Deployment Steps

### Phase 1: Infrastructure Setup (30 minutes)

Run the infrastructure provisioning script:

```bash
cd /Users/durai/Documents/GitHub/sengol-api
chmod +x scripts/gce/*.sh
./scripts/gce/1-setup-infrastructure.sh
```

**This creates:**
- ✅ 3 GCS buckets with lifecycle policies
- ✅ 4 service accounts with IAM roles
- ✅ 3 Pub/Sub topics and subscriptions
- ✅ 3 Cloud Tasks queues
- ✅ 4 VM instances
- ✅ Firewall rules

**Expected output:**
```
Infrastructure Setup Complete!
Created Resources:
  ✓ 3 GCS buckets
  ✓ 4 service accounts
  ✓ 3 Pub/Sub topics
  ✓ 2 Pub/Sub subscriptions
  ✓ 3 Cloud Tasks queues
  ✓ 4 VM instances
  ✓ 1 instance template
  ✓ Firewall rules
```

### Phase 2: Database Setup (10 minutes)

Create the `source_registry` table in PostgreSQL:

```bash
export DATABASE_URL="postgresql://..."
./scripts/gce/2-setup-database.sh
```

**This creates:**
- ✅ `source_registry` table with indexes
- ✅ `eligible_sources` view
- ✅ Initial 15 sources (from sengoladmin crawlers)
- ✅ Auto-update triggers

**Verify:**
```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM source_registry;"
# Expected: 15 rows
```

### Phase 3: Service Deployment (20 minutes)

Deploy application code to VMs:

```bash
./scripts/gce/3-deploy-services.sh
```

**This deploys:**
- ✅ Orchestrator service (TypeScript)
- ✅ Worker service (TypeScript)
- ✅ Embedding generator (Python)
- ✅ Qdrant loader (Python)
- ✅ Systemd services for auto-restart

**Important:** After deployment, SSH to each VM and update `.env` files:

```bash
# Orchestrator
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a
nano ~/sengol-crawler/.env
# Add DATABASE_URL, OPENAI_API_KEY, etc.
sudo systemctl restart sengol-orchestrator

# Repeat for other VMs
```

### Phase 4: Cloud Scheduler Setup (5 minutes)

Create automated jobs:

```bash
./scripts/gce/4-setup-scheduler.sh
```

**This creates:**
- ✅ `regulatory-crawlers-6h` - Every 6 hours
- ✅ `all-crawlers-daily` - Daily at 2 AM UTC
- ✅ `news-crawlers-4h` - Every 4 hours
- ✅ `auto-discovery-weekly` - Weekly on Sundays

**Test manually:**
```bash
gcloud scheduler jobs run regulatory-crawlers-6h --location=us-central1
```

---

## Verification & Testing

### 1. Check VM Status

```bash
gcloud compute instances list --filter="name:sengol-*"
```

**Expected:**
- All VMs in `RUNNING` state
- All VMs have internal IPs
- No external IPs (security best practice)

### 2. Check Service Status

```bash
# Orchestrator
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="sudo systemctl status sengol-orchestrator"

# Worker
gcloud compute ssh sengol-crawler-worker-1 --zone=us-central1-a \
  --command="sudo systemctl status sengol-worker"

# Embedding Generator
gcloud compute ssh sengol-embedding-generator --zone=us-central1-a \
  --command="sudo systemctl status sengol-embedding-gen"

# Qdrant Loader
gcloud compute ssh sengol-qdrant-loader --zone=us-central1-a \
  --command="sudo systemctl status sengol-qdrant-loader"
```

**Expected:** All services in `active (running)` state

### 3. Test Manual Execution

Trigger a test crawler run:

```bash
# SSH to orchestrator
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a

# Run orchestrator
cd ~/sengol-crawler
curl -X POST http://localhost:3000/api/orchestrator/execute \
  -H "Content-Type: application/json" \
  -d '{"category": "news", "dryRun": true}'
```

**Expected output:**
```json
{
  "totalSources": 1,
  "tasksCreated": 0,
  "tasksSkipped": 0,
  "errors": []
}
```

### 4. Check Pub/Sub Topics

```bash
gcloud pubsub topics list --format="table(name)"
```

**Expected:**
- `sengol-data-crawled`
- `sengol-embeddings-generated`
- `sengol-qdrant-updated`

### 5. Check Cloud Tasks Queues

```bash
gcloud tasks queues list --location=us-central1
```

**Expected:**
- `sengol-crawler-tasks`
- `sengol-embedding-tasks`
- `sengol-qdrant-tasks`

### 6. Verify GCS Buckets

```bash
gsutil ls -p elite-striker-477619-p8
```

**Expected:**
- `gs://sengol-crawled-data-raw/`
- `gs://sengol-crawled-data-processed/`
- `gs://sengol-incidents-elite/`

---

## Monitoring & Operations

### View Logs

```bash
# Orchestrator logs
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="sudo journalctl -u sengol-orchestrator -f"

# Worker logs
gcloud compute ssh sengol-crawler-worker-1 --zone=us-central1-a \
  --command="sudo journalctl -u sengol-worker -f"

# Embedding generator logs
gcloud compute ssh sengol-embedding-generator --zone=us-central1-a \
  --command="sudo journalctl -u sengol-embedding-gen -f"

# Qdrant loader logs
gcloud compute ssh sengol-qdrant-loader --zone=us-central1-a \
  --command="sudo journalctl -u sengol-qdrant-loader -f"
```

### Database Monitoring

Check recent crawler executions:

```bash
psql "$DATABASE_URL" -c "
SELECT
  crawler_name,
  status,
  started_at,
  completed_at,
  records_processed,
  records_new
FROM crawler_executions
ORDER BY started_at DESC
LIMIT 10;
"
```

Check source registry status:

```bash
psql "$DATABASE_URL" -c "
SELECT
  category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE enabled = true) as enabled,
  COUNT(*) FILTER (WHERE verified = true) as verified
FROM source_registry
GROUP BY category
ORDER BY category;
"
```

### Qdrant Monitoring

Check collection status:

```bash
gcloud compute ssh sengol-vector-db --zone=us-central1-a \
  --command="curl -s http://localhost:6333/collections/sengol_incidents_full | python3 -m json.tool"
```

**Expected output:**
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

---

## Cost Management

### Current Monthly Costs (Estimated)

| Resource | Type | Cost |
|----------|------|------|
| Orchestrator VM | e2-medium (1 vCPU, 4 GB) | $24/month |
| Worker VM | n2-standard-2 (2 vCPU, 8 GB) | $48/month |
| Embedding Gen VM | n2-standard-2 (2 vCPU, 8 GB) | $48/month |
| Qdrant Loader VM | e2-medium (1 vCPU, 4 GB) | $24/month |
| GCS Storage | ~10 GB | $0.20/month |
| Pub/Sub | ~100K messages/month | $0.40/month |
| Cloud Tasks | ~10K tasks/month | $0.40/month |
| Cloud Scheduler | 4 jobs | Free (< 3 jobs charged) |
| **Total** | | **~$145/month** |

### Cost Optimization

**Reduce VM costs:**
```bash
# Stop non-critical VMs during off-hours
gcloud compute instances stop sengol-embedding-generator --zone=us-central1-a
gcloud compute instances stop sengol-qdrant-loader --zone=us-central1-a

# Start before scheduled runs
gcloud compute instances start sengol-embedding-generator --zone=us-central1-a
gcloud compute instances start sengol-qdrant-loader --zone=us-central1-a
```

**Use preemptible VMs for workers** (60-90% discount):
```bash
gcloud compute instances create sengol-crawler-worker-2 \
  --zone=us-central1-a \
  --source-instance-template=sengol-crawler-worker-template \
  --preemptible
```

**Auto-scaling workers** (only run when needed):
- Implement Cloud Functions to start/stop workers based on queue depth

---

## Troubleshooting

### Issue: Orchestrator not creating tasks

**Symptoms:**
- Cloud Scheduler job succeeds but no tasks in queue
- Orchestrator logs show "No eligible sources found"

**Solution:**
```bash
# Check source registry
psql "$DATABASE_URL" -c "SELECT * FROM eligible_sources;"

# If empty, check enabled status
psql "$DATABASE_URL" -c "UPDATE source_registry SET enabled = true WHERE priority <= 5;"

# Restart orchestrator
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="sudo systemctl restart sengol-orchestrator"
```

### Issue: Worker failing to execute crawlers

**Symptoms:**
- Tasks remain in queue
- Worker logs show module not found errors

**Solution:**
```bash
# SSH to worker
gcloud compute ssh sengol-crawler-worker-1 --zone=us-central1-a

# Reinstall dependencies
cd ~/sengol-crawler
pnpm install
npx prisma generate

# Restart service
sudo systemctl restart sengol-worker
```

### Issue: Embeddings not generating

**Symptoms:**
- Data crawled successfully but no embeddings in GCS
- Embedding generator logs show OpenAI API errors

**Solution:**
```bash
# Check OpenAI API key
gcloud compute ssh sengol-embedding-generator --zone=us-central1-a

# Verify environment
grep OPENAI_API_KEY ~/.bashrc
# If missing, add it and restart service

# Test OpenAI API
python3 -c "
from openai import OpenAI
client = OpenAI(api_key='sk-...')
print(client.models.list())
"

sudo systemctl restart sengol-embedding-gen
```

### Issue: Qdrant loader not upserting

**Symptoms:**
- Embeddings generated but Qdrant point count not increasing
- Loader logs show connection errors

**Solution:**
```bash
# Check Qdrant connectivity
gcloud compute ssh sengol-qdrant-loader --zone=us-central1-a

ping sengol-vector-db  # Should resolve to internal IP

curl http://sengol-vector-db:6333  # Should return Qdrant info

# If connection fails, check firewall
gcloud compute firewall-rules list --filter="name:sengol-internal-allow"

# Restart loader
sudo systemctl restart sengol-qdrant-loader
```

---

## Maintenance

### Weekly Tasks

1. **Check execution statistics:**
```bash
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
```

2. **Review failed sources:**
```bash
psql "$DATABASE_URL" -c "
SELECT source_name, consecutive_failures, last_error_message
FROM source_registry
WHERE consecutive_failures >= 3
ORDER BY consecutive_failures DESC;
"
```

3. **Clean up old GCS data:**
```bash
# Delete raw data older than 90 days
gsutil -m rm gs://sengol-crawled-data-raw/**/$(date -d '90 days ago' +%Y-%m-%d)*
```

### Monthly Tasks

1. **Review and optimize costs**
2. **Update dependencies:**
```bash
cd /Users/durai/Documents/Github/sengoladmin
pnpm update
./scripts/gce/3-deploy-services.sh
```

3. **Backup Qdrant:**
```bash
gcloud compute ssh sengol-vector-db --zone=us-central1-a \
  --command="
    curl -X POST http://localhost:6333/collections/sengol_incidents_full/snapshots
    SNAPSHOT=\$(curl -s http://localhost:6333/collections/sengol_incidents_full/snapshots | python3 -c 'import sys,json;print(json.load(sys.stdin)[\"result\"][0][\"name\"])')
    gsutil cp /var/lib/qdrant/snapshots/\$SNAPSHOT gs://sengol-incidents-elite/backups/qdrant/
  "
```

---

## Rollback Procedure

If deployment fails or services are unstable:

### 1. Stop all services

```bash
for VM in orchestrator worker-1 embedding-generator qdrant-loader; do
  gcloud compute ssh sengol-crawler-$VM --zone=us-central1-a \
    --command="sudo systemctl stop sengol-$VM"
done
```

### 2. Restore previous deployment

```bash
# Re-deploy from backup
./scripts/gce/3-deploy-services.sh
```

### 3. Verify and restart

```bash
# Test orchestrator
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="curl -X POST http://localhost:3000/health"

# If healthy, restart all services
for VM in orchestrator worker-1 embedding-generator qdrant-loader; do
  gcloud compute ssh sengol-crawler-$VM --zone=us-central1-a \
    --command="sudo systemctl start sengol-$VM"
done
```

---

## Security Best Practices

### 1. No External IPs

All VMs use internal IPs only. Access via:
- Cloud Console SSH
- IAP tunnel
- Bastion host (if needed)

### 2. Service Account Permissions

Each VM has dedicated service account with minimal permissions:
- Orchestrator: Cloud Tasks enqueuer, Pub/Sub publisher
- Worker: GCS object admin, Pub/Sub publisher
- Embedding Gen: GCS object admin, Pub/Sub subscriber
- Qdrant Loader: GCS object viewer, Pub/Sub subscriber

### 3. Secret Management

Never commit secrets to git. Use:
- Secret Manager for production
- Environment variables for development

```bash
# Create secrets
echo -n "sk-..." | gcloud secrets create openai-api-key --data-file=-

# Access in services
gcloud secrets versions access latest --secret="openai-api-key"
```

### 4. Network Security

- All inter-VM communication via internal network
- Firewall rules restrict traffic to `sengol-*` tags only
- No public endpoints exposed

---

## Support & Contact

### Documentation

- **Architecture:** `/docs/crawlers/GCE_IMPLEMENTATION_PLAN.md`
- **Data Sources:** `/docs/crawlers/DATA_SOURCES.md`
- **Crawler Code:** `/Users/durai/Documents/Github/sengoladmin/lib/crawlers/`
- **Vector DB:** `/docs/vector/QDRANT_OPERATIONS.md`

### Troubleshooting

- Check logs first: `sudo journalctl -u sengol-SERVICE -n 100`
- Verify connectivity: `ping`, `curl`, `nc`
- Review GCP quotas: Cloud Console → IAM & Admin → Quotas

### Emergency Contact

- **Infrastructure Issues:** DevOps Team
- **Crawler Issues:** Backend Team
- **Data Quality Issues:** Data Team

---

**Deployment Guide Version:** 1.0
**Last Updated:** 2025-01-10
**Maintained By:** DevOps Team
