# 🚀 DEPLOYMENT READY - EXECUTE NOW

**Status:** ✅ All systems ready - Authentication required
**Date:** 2025-01-10
**Estimated Time:** 45 minutes
**Cost:** ~$96/month (69% savings)

---

## 🎯 QUICK START - RUN THIS COMMAND

```bash
cd /Users/durai/Documents/GitHub/sengol-api
./DEPLOY_CRAWLER_SYSTEM.sh
```

**That's it!** The script will:
1. Authenticate with gcloud (will open browser)
2. Set the correct GCP project
3. Run the full deployment automatically

---

## 📋 What Will Happen

### Phase 1: Infrastructure (15 min)
- Enable 7 GCP APIs (Compute, Storage, Cloud Functions, etc.)
- Create 2 GCS buckets (raw + processed data)
- Create 3 service accounts (orchestrator, worker, functions)
- Grant IAM permissions
- Create Pub/Sub topics (data-crawled, embeddings-generated, qdrant-updated)
- Create Cloud Tasks queue (crawler-tasks)
- Launch 2 VMs:
  - **Orchestrator VM** (e2-medium, 12h/day): Coordinates crawling
  - **Worker VM** (n2-standard-2, preemptible): Executes crawler tasks

### Phase 2: Database (5 min)
- Create `source_registry` table with 15 crawler sources:
  - CISA KEV (Known Exploited Vulnerabilities)
  - NVD (National Vulnerability Database)
  - Security breach databases
  - Ransomware tracking
  - Incident response reports
  - And 10 more sources
- Create `eligible_sources` view
- Set up auto-update triggers

### Phase 3: Cloud Functions (10 min)
- Deploy **Embedding Generator** (Python 3.11)
  - Triggers on new crawled data
  - Generates OpenAI embeddings
  - Memory: 2GB, Timeout: 9 min
- Deploy **Qdrant Loader** (Python 3.11)
  - Triggers after embedding generation
  - Loads vectors to Qdrant database
  - Memory: 1GB, Timeout: 5 min

### Phase 4: Automation (10 min)
- Create 6 Cloud Scheduler jobs:
  1. **Regulatory crawlers** - Every 6 hours (critical compliance data)
  2. **All crawlers daily** - 2 AM UTC (comprehensive update)
  3. **News crawlers** - Every 4 hours (breaking security news)
  4. **Auto-discovery** - Weekly on Sundays (find new sources)
  5. **VM startup** - 6 AM UTC (begin daily operations)
  6. **VM shutdown** - 9 PM UTC (save costs overnight)

### Phase 5: Verification (5 min)
- Test VM connectivity
- Verify Cloud Functions are active
- Check database has 15 sources
- Test manual crawler trigger

---

## ✅ Environment Check

**Already Configured:**
- ✅ Database URL set in `.env`
- ✅ OpenAI API Key set in `.env`
- ✅ gcloud SDK installed at `/Users/durai/google-cloud-sdk`
- ✅ GCP Project: `elite-striker-477619-p8`
- ✅ All deployment scripts ready in `scripts/gce/`

**Requires Action:**
- ⚠️ gcloud authentication (expired - script will handle this)

---

## 💰 Cost Breakdown

| Resource | Specification | Cost/Month |
|----------|--------------|------------|
| Orchestrator VM | e2-medium (2 vCPU, 4GB), 12h/day | $12.23 |
| Worker VM | n2-standard-2 (2 vCPU, 8GB), preemptible | $10.00 |
| Qdrant VM | n2d-standard-2 (existing) | $47.82 |
| Embedding Generator | Cloud Function, 2GB | $5.00 |
| Qdrant Loader | Cloud Function, 1GB | $3.00 |
| Persistent Disks | 5 disks × 20-30GB | $17.00 |
| GCS Storage | ~15 GB | $0.45 |
| Pub/Sub + Tasks | Message passing | $0.20 |
| Cloud Scheduler | 6 jobs | $0.30 |
| OpenAI API | ~500 records/day | $0.30 |
| **TOTAL** | | **$96.30** |

**Optimization Features:**
- VMs auto-shutdown 15 hours/day (9 PM - 6 AM) → **Save $140/month**
- Preemptible worker VM → **Save 70% on compute**
- Cloud Functions only run when needed → **No idle costs**

---

## 🔍 Monitoring After Deployment

### Check VMs Status
```bash
gcloud compute instances list --filter="name:sengol-*" \
  --format="table(name,zone,status,machineType)"
```

Expected output:
```
NAME                          ZONE           MACHINE_TYPE  STATUS
sengol-crawler-orchestrator   us-central1-a  e2-medium     RUNNING
sengol-crawler-worker-1       us-central1-a  n2-standard-2 RUNNING
sengol-vector-db              us-central1-a  n2d-standard-2 RUNNING
```

### Check Cloud Functions
```bash
gcloud functions list --region=us-central1
```

Expected output:
```
NAME                       REGION       TRIGGER        STATUS
sengol-embedding-generator us-central1  Pub/Sub Topic  ACTIVE
sengol-qdrant-loader       us-central1  Pub/Sub Topic  ACTIVE
```

### Check Database Sources
```bash
export DATABASE_URL="$(grep DATABASE_URL .env | cut -d'=' -f2-)"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM source_registry;"
```

Expected: `15`

### View Orchestrator Logs
```bash
gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
  --command="sudo journalctl -u sengol-orchestrator -f"
```

### Test Manual Trigger
```bash
gcloud scheduler jobs run all-crawlers-daily --location=us-central1
```

---

## 🧪 Test Plan After Deployment

1. **Trigger test crawl:**
   ```bash
   gcloud scheduler jobs run regulatory-crawlers --location=us-central1
   ```

2. **Watch logs in real-time:**
   ```bash
   # Terminal 1 - Orchestrator
   gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \
     --command="sudo journalctl -u sengol-orchestrator -f"

   # Terminal 2 - Embedding Generator
   gcloud functions logs read sengol-embedding-generator \
     --region=us-central1 --limit=50 --format=json
   ```

3. **Verify data flow:**
   - Check GCS bucket for new files: `gsutil ls gs://sengol-crawled-data-raw/`
   - Check embedding bucket: `gsutil ls gs://sengol-incidents-elite/incidents/embeddings/`
   - Query Qdrant for new vectors (via API)

4. **Check costs:**
   ```bash
   open "https://console.cloud.google.com/billing/01EE08-0161A8-5A66FD"
   ```

---

## 🆘 Troubleshooting

### If deployment fails at authentication:
```bash
gcloud auth login
gcloud config set project elite-striker-477619-p8
```

### If VMs fail to create (quota):
```bash
# Check quotas
gcloud compute project-info describe --project=elite-striker-477619-p8 \
  | grep -A5 quotas

# Request increase: https://console.cloud.google.com/iam-admin/quotas
```

### If Cloud Functions fail:
```bash
# Check if APIs are enabled
gcloud services list --enabled | grep -E "(functions|build)"

# Enable if needed
gcloud services enable cloudfunctions.googleapis.com cloudbuild.googleapis.com
```

### If database connection fails:
```bash
# Test connection
psql "$DATABASE_URL" -c "SELECT 1;"

# Verify DATABASE_URL in .env matches your Neon database
```

---

## 📚 Documentation Reference

- **Full Instructions:** `FINAL_DEPLOYMENT_INSTRUCTIONS.md`
- **Architecture:** `docs/crawlers/GCE_IMPLEMENTATION_PLAN.md`
- **Operations:** `docs/crawlers/GCE_DEPLOYMENT_README.md`
- **Quick Reference:** `docs/crawlers/QUICK_REFERENCE.md`

---

## 🎯 Success Criteria

After deployment completes, verify:

- [ ] 2 VMs running (`sengol-crawler-orchestrator`, `sengol-crawler-worker-1`)
- [ ] 2 Cloud Functions active (`sengol-embedding-generator`, `sengol-qdrant-loader`)
- [ ] 15 sources in `source_registry` table
- [ ] 6 Cloud Scheduler jobs configured
- [ ] GCS buckets created (raw + processed)
- [ ] Pub/Sub topics created (3 topics)
- [ ] Test crawl completes successfully
- [ ] Embeddings generated and loaded to Qdrant

---

## 🚀 READY TO DEPLOY!

**Run this command now:**

```bash
cd /Users/durai/Documents/GitHub/sengol-api
./DEPLOY_CRAWLER_SYSTEM.sh
```

The script will guide you through the process. Total time: **45 minutes**.

**Questions or issues?** Check the troubleshooting section above or review `FINAL_DEPLOYMENT_INSTRUCTIONS.md`.

---

**Created:** 2025-01-10 by Claude Code
**Status:** ✅ READY FOR IMMEDIATE DEPLOYMENT
