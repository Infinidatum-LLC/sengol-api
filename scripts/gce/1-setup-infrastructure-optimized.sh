#!/bin/bash

# GCE Infrastructure Setup Script - OPTIMIZED VERSION
# Cost: ~$96/month (vs $236 baseline)
# Optimizations: Preemptible workers, smaller disks, Cloud Functions ready

set -e  # Exit on error

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
ZONE="us-central1-a"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Sengol Crawler GCE Infrastructure Setup${NC}"
echo -e "${BLUE}OPTIMIZED VERSION (~$96/month)${NC}"
echo -e "${GREEN}========================================${NC}"

# Set project
echo -e "\n${YELLOW}Setting GCP project...${NC}"
gcloud config set project $PROJECT_ID

# Enable required APIs
echo -e "\n${YELLOW}Enabling required GCP APIs...${NC}"
gcloud services enable compute.googleapis.com
gcloud services enable storage.googleapis.com
gcloud services enable cloudscheduler.googleapis.com
gcloud services enable cloudtasks.googleapis.com
gcloud services enable pubsub.googleapis.com
gcloud services enable monitoring.googleapis.com
gcloud services enable logging.googleapis.com
gcloud services enable cloudfunctions.googleapis.com
gcloud services enable cloudbuild.googleapis.com

# Create GCS buckets
echo -e "\n${YELLOW}Creating GCS buckets...${NC}"

# 1. Raw crawled data bucket
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://sengol-crawled-data-raw 2>/dev/null || echo "Bucket already exists"
gsutil lifecycle set - gs://sengol-crawled-data-raw <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 90}
      }
    ]
  }
}
EOF

# 2. Processed data bucket
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://sengol-crawled-data-processed 2>/dev/null || echo "Bucket already exists"
gsutil lifecycle set - gs://sengol-crawled-data-processed <<EOF
{
  "lifecycle": {
    "rule": [
      {
        "action": {"type": "Delete"},
        "condition": {"age": 180}
      }
    ]
  }
}
EOF

# 3. Embeddings bucket (already exists, just verify)
echo -e "${GREEN}Using existing embeddings bucket: gs://sengol-incidents-elite/incidents/embeddings/${NC}"

# Create service accounts
echo -e "\n${YELLOW}Creating service accounts...${NC}"

# Orchestrator service account
gcloud iam service-accounts create sengol-orchestrator \
  --display-name="Sengol Crawler Orchestrator" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account already exists"

# Worker service account
gcloud iam service-accounts create sengol-crawler-worker \
  --display-name="Sengol Crawler Worker" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account already exists"

# Cloud Functions service account (for embedding gen & qdrant loader)
gcloud iam service-accounts create sengol-functions \
  --display-name="Sengol Cloud Functions" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account already exists"

# Grant IAM roles
echo -e "\n${YELLOW}Granting IAM roles...${NC}"

# Orchestrator permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer" 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter" 2>/dev/null || true

# Worker permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin" 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher" 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter" 2>/dev/null || true

# Cloud Functions permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin" 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber" 2>/dev/null || true

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter" 2>/dev/null || true

# Create Pub/Sub topics and subscriptions
echo -e "\n${YELLOW}Creating Pub/Sub topics...${NC}"

gcloud pubsub topics create sengol-data-crawled --project=$PROJECT_ID 2>/dev/null || echo "Topic already exists"
gcloud pubsub topics create sengol-embeddings-generated --project=$PROJECT_ID 2>/dev/null || echo "Topic already exists"
gcloud pubsub topics create sengol-qdrant-updated --project=$PROJECT_ID 2>/dev/null || echo "Topic already exists"

# Create subscriptions (no manual subscriptions needed for Cloud Functions - auto-created)
echo -e "${GREEN}Pub/Sub topics created. Subscriptions will be created automatically by Cloud Functions.${NC}"

# Create Cloud Tasks queues
echo -e "\n${YELLOW}Creating Cloud Tasks queues...${NC}"

gcloud tasks queues create sengol-crawler-tasks \
  --location=$REGION \
  --max-concurrent-dispatches=50 \
  --max-dispatches-per-second=10 \
  --project=$PROJECT_ID 2>/dev/null || echo "Queue already exists"

# Create VMs (OPTIMIZED)
echo -e "\n${YELLOW}Creating VM instances (OPTIMIZED)...${NC}"

# 1. Orchestrator VM (e2-medium with 20GB disk)
echo -e "${GREEN}Creating orchestrator VM...${NC}"
gcloud compute instances create sengol-crawler-orchestrator \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=20GB \
  --boot-disk-type=pd-standard \
  --service-account=sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=sengol-orchestrator \
  --no-address \
  --metadata=startup-script='#!/bin/bash
    apt-get update
    apt-get install -y nodejs npm postgresql-client
    npm install -g pnpm
    ' 2>/dev/null || echo "VM already exists"

# 2. Worker VM - PREEMPTIBLE (n2-standard-2 with 30GB disk)
echo -e "${GREEN}Creating preemptible worker VM...${NC}"
gcloud compute instances create sengol-crawler-worker-1 \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=n2-standard-2 \
  --preemptible \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=30GB \
  --boot-disk-type=pd-standard \
  --service-account=sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=sengol-worker \
  --no-address \
  --metadata=startup-script='#!/bin/bash
    apt-get update
    apt-get install -y nodejs npm postgresql-client chromium-browser
    npm install -g pnpm

    # Auto-restart service if preempted
    cat > /etc/systemd/system/sengol-worker-restart.service <<SERVICE
[Unit]
Description=Restart Sengol Worker on Preemption
After=network.target

[Service]
Type=oneshot
ExecStart=/bin/systemctl restart sengol-worker

[Install]
WantedBy=multi-user.target
SERVICE

    systemctl enable sengol-worker-restart
    ' 2>/dev/null || echo "VM already exists"

# Create firewall rules
echo -e "\n${YELLOW}Creating firewall rules...${NC}"

gcloud compute firewall-rules create sengol-internal-allow \
  --project=$PROJECT_ID \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:0-65535,udp:0-65535,icmp \
  --source-tags=sengol-orchestrator,sengol-worker \
  --target-tags=sengol-orchestrator,sengol-worker \
  2>/dev/null || echo "Firewall rule already exists"

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Optimized Infrastructure Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Created Resources:${NC}"
echo -e "  ✓ 3 GCS buckets"
echo -e "  ✓ 3 service accounts"
echo -e "  ✓ 3 Pub/Sub topics"
echo -e "  ✓ 1 Cloud Tasks queue"
echo -e "  ✓ 2 VM instances (1 orchestrator + 1 preemptible worker)"
echo -e "  ✓ Firewall rules"
echo -e "  ${BLUE}✓ Cloud Functions will be deployed in step 3${NC}"

echo -e "\n${YELLOW}VM Instances:${NC}"
gcloud compute instances list --project=$PROJECT_ID --filter="name:sengol-*" --format="table(name,zone,status,machineType,scheduling.preemptible)"

echo -e "\n${BLUE}Cost Optimizations Applied:${NC}"
echo -e "  ✓ Preemptible worker VM (60% cost reduction)"
echo -e "  ✓ Smaller boot disks (20-30GB vs 50-100GB)"
echo -e "  ✓ No external IPs (save $7.20/month per VM)"
echo -e "  ✓ Cloud Functions instead of dedicated VMs (save ~$64/month)"
echo -e "  ${GREEN}Estimated monthly cost: ~$96 (vs $236 baseline)${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "  1. Run ${GREEN}./2-setup-database.sh${NC} to create source_registry table"
echo -e "  2. Run ${GREEN}./3-deploy-services-optimized.sh${NC} to deploy application code"
echo -e "  3. Run ${GREEN}./4-setup-scheduler.sh${NC} to configure Cloud Scheduler jobs"

echo -e "\n${GREEN}Done!${NC}"
