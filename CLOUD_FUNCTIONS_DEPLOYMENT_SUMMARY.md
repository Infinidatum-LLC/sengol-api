# Cloud Functions Deployment Summary

**Date:** 2025-01-10
**Status:** CLI deployment blocked - Manual Console deployment required
**Project:** elite-striker-477619-p8

---

## Problem Summary

Cloud Functions deployment via gcloud CLI is failing with:
```
ERROR: Container Healthcheck failed. The user-provided container failed to start
and listen on the port defined provided by the PORT=8080 environment variable
```

### Root Cause

**Both Gen1 and Gen2 Cloud Functions with Python 3.11 runtime now use Cloud Run under the hood.** When using `--trigger-topic` for Pub/Sub triggers, the CLI creates an Eventarc trigger that expects an HTTP service listening on PORT=8080.

However, Pub/Sub-triggered functions should be event-driven, not HTTP-based. This creates a mismatch where:
- The function code is written for event handling (receiving Pub/Sub messages)
- Cloud Run expects an HTTP server responding to health checks
- The function never starts an HTTP server, causing health checks to fail

### Attempts Made

1. **Gen2 with CloudEvent decorator** - Failed (PORT=8080 error)
2. **Gen1 with legacy signature** - Failed (same PORT=8080 error)
3. **Permission fixes** - Multiple IAM roles granted, still failing
4. **Code structure changes** - Tried both `@functions_framework.cloud_event` and legacy `(event, context)` signatures

**Conclusion:** The CLI-based deployment has fundamental issues with how it handles Pub/Sub triggers in modern Python runtimes.

---

## Current Deployment Status

### Phase 1: Infrastructure ✅ COMPLETE
- 3 VMs running (orchestrator, worker, vector-db)
- 3 Service accounts created with proper IAM roles
- 3 Pub/Sub topics created
- Cloud Tasks queue configured
- 2 GCS buckets ready

### Phase 2: Database ✅ COMPLETE
- PostgreSQL (Neon) configured
- 15 crawler sources initialized (11 enabled)
- Views and triggers created

### Phase 3: Cloud Functions ❌ BLOCKED
- `sengol-embedding-generator` - Code ready at `/tmp/cloud-functions/embedding-generator/`
- `sengol-qdrant-loader` - Code ready at `/tmp/cloud-functions/qdrant-loader/`
- **Both functions fail to deploy via CLI**

### Phases 4 & 5: Pending (depend on Phase 3)
- Cloud Scheduler configuration
- Auto-shutdown scripts

---

## Solutions

### Option 1: Deploy via GCP Console (RECOMMENDED)

The GCP Console handles all the Eventarc/Cloud Run complexity automatically.

**Step-by-Step Guide:** `/Users/durai/Documents/GitHub/sengol-api/GCP_CONSOLE_DEPLOYMENT_GUIDE.md`

**Quick Steps:**

1. Open: https://console.cloud.google.com/functions/list?project=elite-striker-477619-p8

2. Click "CREATE FUNCTION"

3. Configure **sengol-embedding-generator**:
   - **Name:** `sengol-embedding-generator`
   - **Region:** us-central1
   - **Trigger type:** Cloud Pub/Sub
   - **Topic:** `sengol-data-crawled`
   - **Runtime:** Python 3.11
   - **Service account:** `sengol-functions@elite-striker-477619-p8.iam.gserviceaccount.com`
   - **Memory:** 2 GB
   - **Timeout:** 540 seconds
   - **Max instances:** 10

4. Upload source code:
   - Copy `/tmp/cloud-functions/embedding-generator/main.py`
   - Copy `/tmp/cloud-functions/embedding-generator/requirements.txt`
   - **Entry point:** `generate_embeddings`

5. Set environment variables:
   ```
   GCP_PROJECT=elite-striker-477619-p8
   OPENAI_API_KEY=<from your .env file>
   ```

6. Click "Deploy"

7. Repeat for **sengol-qdrant-loader**:
   - **Topic:** `sengol-embeddings-generated`
   - **Memory:** 1 GB
   - **Timeout:** 300 seconds
   - **Max instances:** 5
   - **Entry point:** `load_to_qdrant`
   - **Environment:**
     ```
     GCP_PROJECT=elite-striker-477619-p8
     QDRANT_HOST=sengol-vector-db
     QDRANT_PORT=6333
     ```

### Option 2: Alternative Runtime Approach

Switch to Python 3.9 or 3.10, which may have better CLI support (not tested).

###Option 3: Manual Eventarc Configuration

Use Gen2 with manual Eventarc setup (complex, not documented).

---

## Files Ready for Deployment

### Embedding Generator
**Location:** `/tmp/cloud-functions/embedding-generator/`

**main.py** (168 lines):
- Generates OpenAI embeddings for crawled data
- Batch processing (100 records at a time)
- Uploads to GCS in JSONL format
- Publishes completion events to `sengol-embeddings-generated`

**requirements.txt**:
```
google-cloud-storage==2.14.0
google-cloud-pubsub==2.19.0
openai==1.10.0
functions-framework==3.5.0
```

### Qdrant Loader
**Location:** `/tmp/cloud-functions/qdrant-loader/`

**main.py** (157 lines):
- Loads embeddings from GCS to Qdrant
- Creates collection if not exists
- Batch upserts (100 vectors at a time)
- Publishes completion events to `sengol-qdrant-updated`

**requirements.txt**:
```
google-cloud-storage==2.14.0
google-cloud-pubsub==2.19.0
qdrant-client==1.7.0
functions-framework==3.5.0
```

---

## After Cloud Functions Deployment

Once both functions are deployed successfully, complete the remaining phases:

```bash
cd /Users/durai/Documents/GitHub/sengol-api/scripts/gce

# Phase 4: Cloud Scheduler
./4-setup-scheduler.sh

# Phase 5: Auto-Shutdown
./5-setup-auto-shutdown.sh
```

---

## Verification Commands

### Check deployed functions
```bash
gcloud functions list --region=us-central1 --project=elite-striker-477619-p8
```

### Test embedding generator manually
```bash
gcloud pubsub topics publish sengol-data-crawled \
  --message='{"gcsPath":"test.json","category":"incidents","sourceName":"Test Source"}' \
  --project=elite-striker-477619-p8
```

### View function logs
```bash
gcloud functions logs read sengol-embedding-generator \
  --region=us-central1 --limit=50 --project=elite-striker-477619-p8
```

---

## Next Steps

1. **Deploy both Cloud Functions via GCP Console** using the guide at:
   `/Users/durai/Documents/GitHub/sengol-api/GCP_CONSOLE_DEPLOYMENT_GUIDE.md`

2. **Verify functions are working:**
   ```bash
   gcloud functions list --region=us-central1 --project=elite-striker-477619-p8
   ```

3. **Run Phase 4 (Cloud Scheduler):**
   ```bash
   cd /Users/durai/Documents/GitHub/sengol-api/scripts/gce
   ./4-setup-scheduler.sh
   ```

4. **Run Phase 5 (Auto-Shutdown):**
   ```bash
   ./5-setup-auto-shutdown.sh
   ```

5. **Test end-to-end:**
   - Trigger a crawler manually
   - Watch data flow through: Crawler → GCS → Embedding Generator → Qdrant Loader

---

## Cost Estimate

**Current Infrastructure Running:**
- Orchestrator VM: $24.46/month
- Worker VM (preemptible): $20.00/month
- Vector DB VM: $47.82/month
- Storage & Pub/Sub: ~$0.35/month

**After Cloud Functions deployment:**
- Cloud Functions: ~$5/month (based on estimated invocations)

**Total:** ~$97.63/month (within $100 free tier if new account)

---

## Support

**Documentation Files:**
- Full guide: `/Users/durai/Documents/GitHub/sengol-api/FINAL_DEPLOYMENT_INSTRUCTIONS.md`
- Console guide: `/Users/durai/Documents/GitHub/sengol-api/GCP_CONSOLE_DEPLOYMENT_GUIDE.md`
- Status tracking: `/Users/durai/Documents/GitHub/sengol-api/DEPLOYMENT_STATUS.md`

**GCP Console Links:**
- Functions: https://console.cloud.google.com/functions/list?project=elite-striker-477619-p8
- Cloud Scheduler: https://console.cloud.google.com/cloudscheduler?project=elite-striker-477619-p8
- Pub/Sub Topics: https://console.cloud.google.com/cloudpubsub/topic/list?project=elite-striker-477619-p8
- Logs: https://console.cloud.google.com/logs/query?project=elite-striker-477619-p8

---

**Created:** 2025-01-10 by Claude Code
**Status:** Manual Console deployment required to proceed
