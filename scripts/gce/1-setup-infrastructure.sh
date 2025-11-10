#!/bin/bash

# GCE Infrastructure Setup Script
# Phase 1: Provision all GCP resources for crawler infrastructure
# Run this script from your local machine with gcloud CLI configured

set -e  # Exit on error

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
ZONE="us-central1-a"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Sengol Crawler GCE Infrastructure Setup${NC}"
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

# Create GCS buckets
echo -e "\n${YELLOW}Creating GCS buckets...${NC}"

# 1. Raw crawled data bucket
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://sengol-crawled-data-raw 2>/dev/null || echo "Bucket gs://sengol-crawled-data-raw already exists"
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
gsutil mb -p $PROJECT_ID -c STANDARD -l $REGION gs://sengol-crawled-data-processed 2>/dev/null || echo "Bucket gs://sengol-crawled-data-processed already exists"
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
  --project=$PROJECT_ID 2>/dev/null || echo "Service account sengol-orchestrator already exists"

# Worker service account
gcloud iam service-accounts create sengol-crawler-worker \
  --display-name="Sengol Crawler Worker" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account sengol-crawler-worker already exists"

# Embedding generator service account
gcloud iam service-accounts create sengol-embedding-gen \
  --display-name="Sengol Embedding Generator" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account sengol-embedding-gen already exists"

# Qdrant loader service account
gcloud iam service-accounts create sengol-qdrant-loader \
  --display-name="Sengol Qdrant Loader" \
  --project=$PROJECT_ID 2>/dev/null || echo "Service account sengol-qdrant-loader already exists"

# Grant IAM roles
echo -e "\n${YELLOW}Granting IAM roles...${NC}"

# Orchestrator permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/cloudtasks.enqueuer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Worker permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.publisher"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Embedding generator permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-embedding-gen@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectAdmin"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-embedding-gen@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-embedding-gen@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Qdrant loader permissions
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-qdrant-loader@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/storage.objectViewer"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-qdrant-loader@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:sengol-qdrant-loader@${PROJECT_ID}.iam.gserviceaccount.com" \
  --role="roles/logging.logWriter"

# Create Pub/Sub topics and subscriptions
echo -e "\n${YELLOW}Creating Pub/Sub topics...${NC}"

# Topic 1: Data crawled
gcloud pubsub topics create sengol-data-crawled --project=$PROJECT_ID 2>/dev/null || echo "Topic sengol-data-crawled already exists"

# Topic 2: Embeddings generated
gcloud pubsub topics create sengol-embeddings-generated --project=$PROJECT_ID 2>/dev/null || echo "Topic sengol-embeddings-generated already exists"

# Topic 3: Qdrant updated
gcloud pubsub topics create sengol-qdrant-updated --project=$PROJECT_ID 2>/dev/null || echo "Topic sengol-qdrant-updated already exists"

# Create subscriptions
echo -e "\n${YELLOW}Creating Pub/Sub subscriptions...${NC}"

gcloud pubsub subscriptions create sengol-data-crawled-sub \
  --topic=sengol-data-crawled \
  --ack-deadline=600 \
  --project=$PROJECT_ID 2>/dev/null || echo "Subscription sengol-data-crawled-sub already exists"

gcloud pubsub subscriptions create sengol-embeddings-generated-sub \
  --topic=sengol-embeddings-generated \
  --ack-deadline=600 \
  --project=$PROJECT_ID 2>/dev/null || echo "Subscription sengol-embeddings-generated-sub already exists"

# Create Cloud Tasks queues
echo -e "\n${YELLOW}Creating Cloud Tasks queues...${NC}"

gcloud tasks queues create sengol-crawler-tasks \
  --location=$REGION \
  --max-concurrent-dispatches=50 \
  --max-dispatches-per-second=10 \
  --project=$PROJECT_ID 2>/dev/null || echo "Queue sengol-crawler-tasks already exists"

gcloud tasks queues create sengol-embedding-tasks \
  --location=$REGION \
  --max-concurrent-dispatches=20 \
  --max-dispatches-per-second=5 \
  --project=$PROJECT_ID 2>/dev/null || echo "Queue sengol-embedding-tasks already exists"

gcloud tasks queues create sengol-qdrant-tasks \
  --location=$REGION \
  --max-concurrent-dispatches=10 \
  --max-dispatches-per-second=2 \
  --project=$PROJECT_ID 2>/dev/null || echo "Queue sengol-qdrant-tasks already exists"

# Create VMs
echo -e "\n${YELLOW}Creating VM instances...${NC}"

# 1. Orchestrator VM
echo -e "${GREEN}Creating orchestrator VM...${NC}"
gcloud compute instances create sengol-crawler-orchestrator \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-standard \
  --service-account=sengol-orchestrator@${PROJECT_ID}.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=sengol-orchestrator \
  --metadata=startup-script='#!/bin/bash
    apt-get update
    apt-get install -y nodejs npm postgresql-client
    npm install -g pnpm
    ' 2>/dev/null || echo "VM sengol-crawler-orchestrator already exists"

# 2. Worker VM (template for auto-scaling)
echo -e "${GREEN}Creating worker VM template...${NC}"
gcloud compute instance-templates create sengol-crawler-worker-template \
  --project=$PROJECT_ID \
  --machine-type=n2-standard-2 \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-standard \
  --service-account=sengol-crawler-worker@${PROJECT_ID}.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=sengol-worker \
  --metadata=startup-script='#!/bin/bash
    apt-get update
    apt-get install -y nodejs npm postgresql-client chromium-browser
    npm install -g pnpm
    ' 2>/dev/null || echo "Instance template sengol-crawler-worker-template already exists"

# Create initial worker instance
gcloud compute instances create sengol-crawler-worker-1 \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --source-instance-template=sengol-crawler-worker-template \
  2>/dev/null || echo "VM sengol-crawler-worker-1 already exists"

# 3. Embedding generator VM
echo -e "${GREEN}Creating embedding generator VM...${NC}"
gcloud compute instances create sengol-embedding-generator \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=n2-standard-2 \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=100GB \
  --boot-disk-type=pd-standard \
  --service-account=sengol-embedding-gen@${PROJECT_ID}.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=sengol-embedding-gen \
  --metadata=startup-script='#!/bin/bash
    apt-get update
    apt-get install -y python3 python3-pip
    pip3 install openai google-cloud-storage google-cloud-pubsub
    ' 2>/dev/null || echo "VM sengol-embedding-generator already exists"

# 4. Qdrant loader VM
echo -e "${GREEN}Creating Qdrant loader VM...${NC}"
gcloud compute instances create sengol-qdrant-loader \
  --project=$PROJECT_ID \
  --zone=$ZONE \
  --machine-type=e2-medium \
  --image-family=ubuntu-2204-lts \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size=50GB \
  --boot-disk-type=pd-standard \
  --service-account=sengol-qdrant-loader@${PROJECT_ID}.iam.gserviceaccount.com \
  --scopes=cloud-platform \
  --tags=sengol-qdrant-loader \
  --metadata=startup-script='#!/bin/bash
    apt-get update
    apt-get install -y python3 python3-pip
    pip3 install qdrant-client google-cloud-storage google-cloud-pubsub
    ' 2>/dev/null || echo "VM sengol-qdrant-loader already exists"

# Create firewall rules
echo -e "\n${YELLOW}Creating firewall rules...${NC}"

# Allow internal communication between VMs
gcloud compute firewall-rules create sengol-internal-allow \
  --project=$PROJECT_ID \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:0-65535,udp:0-65535,icmp \
  --source-tags=sengol-orchestrator,sengol-worker,sengol-embedding-gen,sengol-qdrant-loader \
  --target-tags=sengol-orchestrator,sengol-worker,sengol-embedding-gen,sengol-qdrant-loader \
  2>/dev/null || echo "Firewall rule sengol-internal-allow already exists"

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Infrastructure Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Created Resources:${NC}"
echo -e "  ✓ 3 GCS buckets"
echo -e "  ✓ 4 service accounts"
echo -e "  ✓ 3 Pub/Sub topics"
echo -e "  ✓ 2 Pub/Sub subscriptions"
echo -e "  ✓ 3 Cloud Tasks queues"
echo -e "  ✓ 4 VM instances"
echo -e "  ✓ 1 instance template"
echo -e "  ✓ Firewall rules"

echo -e "\n${YELLOW}VM Instances:${NC}"
gcloud compute instances list --project=$PROJECT_ID --filter="name:sengol-*"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "  1. Run ${GREEN}./2-setup-database.sh${NC} to create source_registry table"
echo -e "  2. Run ${GREEN}./3-deploy-services.sh${NC} to deploy application code"
echo -e "  3. Run ${GREEN}./4-setup-scheduler.sh${NC} to configure Cloud Scheduler jobs"

echo -e "\n${GREEN}Done!${NC}"
