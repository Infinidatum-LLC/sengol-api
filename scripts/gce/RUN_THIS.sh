#!/bin/bash

# STREAMLINED DEPLOYMENT SCRIPT
# Run this from your terminal with: ./RUN_THIS.sh
# Time: ~45 minutes | Cost: ~$96/month

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SENGOL CRAWLER - OPTIMIZED DEPLOYMENT           ║${NC}"
echo -e "${BLUE}║   Cost: ~\$96/month | Time: 45 minutes              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
ZONE="us-central1-a"

# Load credentials from .env file
if [ -f "../../.env" ]; then
    echo -e "\n${GREEN}Loading credentials from .env file...${NC}"
    export $(grep -E '^(DATABASE_URL|OPENAI_API_KEY)=' ../../.env | xargs)
else
    echo -e "\n${YELLOW}Warning: .env file not found, using environment variables${NC}"
fi

# Check credentials
if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}ERROR: DATABASE_URL not set${NC}"
    echo "Please set it: export DATABASE_URL='postgresql://...'"
    exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
    echo -e "${RED}ERROR: OPENAI_API_KEY not set${NC}"
    echo "Please set it: export OPENAI_API_KEY='sk-...'"
    exit 1
fi

echo -e "${GREEN}✓ Credentials loaded${NC}"

# Check gcloud auth
echo -e "\n${YELLOW}Checking gcloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" > /dev/null 2>&1; then
    echo -e "${YELLOW}Running gcloud auth login...${NC}"
    gcloud auth login
fi

gcloud config set project $PROJECT_ID
echo -e "${GREEN}✓ Authenticated to project: $PROJECT_ID${NC}"

# Confirm deployment
echo -e "\n${YELLOW}This will create:${NC}"
echo "  • 2 VMs (orchestrator + preemptible worker)"
echo "  • 2 Cloud Functions (embedding generator + Qdrant loader)"
echo "  • 3 GCS buckets, Pub/Sub, Cloud Tasks, Scheduler"
echo "  • PostgreSQL source_registry table with 15 sources"
echo ""
echo -e "${BLUE}Estimated cost: ~\$96/month${NC}"
echo ""
read -p "Continue? (yes/no) " -r
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

START_TIME=$(date +%s)

# ============================================================
# PHASE 1: Infrastructure (15 min)
# ============================================================
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}PHASE 1: Infrastructure Setup (15 min)${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

echo -e "\n${YELLOW}Enabling GCP APIs...${NC}"
gcloud services enable \
    compute.googleapis.com \
    storage.googleapis.com \
    cloudscheduler.googleapis.com \
    cloudtasks.googleapis.com \
    pubsub.googleapis.com \
    cloudfunctions.googleapis.com \
    cloudbuild.googleapis.com \
    --project=$PROJECT_ID

echo -e "\n${YELLOW}Creating GCS buckets...${NC}"
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://sengol-crawled-data-raw 2>/dev/null || echo "Bucket exists"
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://sengol-crawled-data-processed 2>/dev/null || echo "Bucket exists"

echo -e "\n${YELLOW}Creating service accounts...${NC}"
gcloud iam service-accounts create sengol-orchestrator \
    --display-name="Sengol Orchestrator" --project=$PROJECT_ID 2>/dev/null || echo "Account exists"
gcloud iam service-accounts create sengol-crawler-worker \
    --display-name="Sengol Worker" --project=$PROJECT_ID 2>/dev/null || echo "Account exists"
gcloud iam service-accounts create sengol-functions \
    --display-name="Sengol Functions" --project=$PROJECT_ID 2>/dev/null || echo "Account exists"

echo -e "\n${YELLOW}Granting IAM permissions...${NC}"
for ROLE in roles/cloudtasks.enqueuer roles/pubsub.publisher roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="$ROLE" --quiet 2>/dev/null || true
done

for ROLE in roles/storage.objectAdmin roles/pubsub.publisher roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="$ROLE" --quiet 2>/dev/null || true
done

for ROLE in roles/storage.objectAdmin roles/pubsub.subscriber roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding $PROJECT_ID \
        --member="serviceAccount:sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com" \
        --role="$ROLE" --quiet 2>/dev/null || true
done

echo -e "\n${YELLOW}Creating Pub/Sub topics...${NC}"
gcloud pubsub topics create sengol-data-crawled --project=$PROJECT_ID 2>/dev/null || echo "Topic exists"
gcloud pubsub topics create sengol-embeddings-generated --project=$PROJECT_ID 2>/dev/null || echo "Topic exists"
gcloud pubsub topics create sengol-qdrant-updated --project=$PROJECT_ID 2>/dev/null || echo "Topic exists"

echo -e "\n${YELLOW}Creating Cloud Tasks queue...${NC}"
gcloud tasks queues create sengol-crawler-tasks \
    --location=$REGION --project=$PROJECT_ID 2>/dev/null || echo "Queue exists"

echo -e "\n${YELLOW}Creating VMs...${NC}"
echo "  Creating orchestrator VM..."
gcloud compute instances create sengol-crawler-orchestrator \
    --project=$PROJECT_ID --zone=$ZONE \
    --machine-type=e2-medium \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=20GB \
    --boot-disk-type=pd-standard \
    --service-account=sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com \
    --scopes=cloud-platform \
    --no-address \
    --tags=sengol-orchestrator \
    --metadata=startup-script='#!/bin/bash
apt-get update && apt-get install -y nodejs npm postgresql-client
npm install -g pnpm' 2>/dev/null || echo "VM exists"

echo "  Creating preemptible worker VM..."
gcloud compute instances create sengol-crawler-worker-1 \
    --project=$PROJECT_ID --zone=$ZONE \
    --machine-type=n2-standard-2 \
    --preemptible \
    --image-family=ubuntu-2204-lts \
    --image-project=ubuntu-os-cloud \
    --boot-disk-size=30GB \
    --boot-disk-type=pd-standard \
    --service-account=sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com \
    --scopes=cloud-platform \
    --no-address \
    --tags=sengol-worker \
    --metadata=startup-script='#!/bin/bash
apt-get update && apt-get install -y nodejs npm postgresql-client chromium-browser
npm install -g pnpm' 2>/dev/null || echo "VM exists"

echo -e "${GREEN}✓ Phase 1 complete!${NC}"

# ============================================================
# PHASE 2: Database (5 min)
# ============================================================
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}PHASE 2: Database Setup (5 min)${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

./2-setup-database.sh

echo -e "${GREEN}✓ Phase 2 complete!${NC}"

# ============================================================
# PHASE 3: Deploy Cloud Functions (10 min)
# ============================================================
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}PHASE 3: Cloud Functions (10 min)${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

echo -e "\n${YELLOW}Deploying embedding generator...${NC}"
gcloud functions deploy sengol-embedding-generator \
    --gen2 --runtime=python311 --region=$REGION \
    --source=/tmp/cloud-functions/embedding-generator \
    --entry-point=generate_embeddings \
    --trigger-topic=sengol-data-crawled \
    --service-account=sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com \
    --memory=2GB --timeout=540s --max-instances=10 \
    --set-env-vars="GCP_PROJECT=${PROJECT_ID},OPENAI_API_KEY=${OPENAI_API_KEY}" \
    --project=$PROJECT_ID --quiet

echo -e "\n${YELLOW}Deploying Qdrant loader...${NC}"
gcloud functions deploy sengol-qdrant-loader \
    --gen2 --runtime=python311 --region=$REGION \
    --source=/tmp/cloud-functions/qdrant-loader \
    --entry-point=load_to_qdrant \
    --trigger-topic=sengol-embeddings-generated \
    --service-account=sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com \
    --memory=1GB --timeout=300s --max-instances=5 \
    --set-env-vars="GCP_PROJECT=${PROJECT_ID},QDRANT_HOST=sengol-vector-db,QDRANT_PORT=6333" \
    --project=$PROJECT_ID --quiet

echo -e "${GREEN}✓ Phase 3 complete!${NC}"

# ============================================================
# PHASE 4: Cloud Scheduler (2 min)
# ============================================================
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}PHASE 4: Cloud Scheduler (2 min)${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

./4-setup-scheduler.sh

echo -e "${GREEN}✓ Phase 4 complete!${NC}"

# ============================================================
# PHASE 5: Auto-Shutdown (3 min)
# ============================================================
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}PHASE 5: Auto-Shutdown (3 min)${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"

./5-setup-auto-shutdown.sh

echo -e "${GREEN}✓ Phase 5 complete!${NC}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))

# ============================================================
# DEPLOYMENT COMPLETE
# ============================================================
echo -e "\n${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   DEPLOYMENT COMPLETE! (${MINUTES} minutes)                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

echo -e "\n${GREEN}Resources Created:${NC}"
gcloud compute instances list --filter="name:sengol-*" --format="table(name,zone,machineType,status)"

echo -e "\n${GREEN}Cloud Functions:${NC}"
gcloud functions list --filter="name:sengol-*" --region=$REGION --format="table(name,status,trigger)"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Update VM environment:"
echo "   gcloud compute ssh sengol-crawler-orchestrator --zone=$ZONE"
echo "   nano ~/sengol-crawler/.env  # Add DATABASE_URL, OPENAI_API_KEY"
echo "   sudo systemctl restart sengol-orchestrator"
echo ""
echo "2. Test the system:"
echo "   gcloud scheduler jobs run all-crawlers-daily --location=$REGION"
echo ""
echo "3. Monitor logs:"
echo "   gcloud compute ssh sengol-crawler-orchestrator --zone=$ZONE \\"
echo "     --command='sudo journalctl -u sengol-orchestrator -f'"

echo -e "\n${BLUE}Estimated monthly cost: ~\$96${NC}"
echo -e "${GREEN}System is now running autonomously!${NC}\n"
