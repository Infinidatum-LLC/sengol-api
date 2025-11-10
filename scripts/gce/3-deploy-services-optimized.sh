#!/bin/bash

# Service Deployment Script - OPTIMIZED VERSION
# Deploys orchestrator + worker to VMs, embedding/qdrant to Cloud Functions

set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
ZONE="us-central1-a"
LOCAL_REPO="/Users/durai/Documents/Github/sengoladmin"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying Services to GCE${NC}"
echo -e "${BLUE}OPTIMIZED VERSION (Cloud Functions)${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if we're in the right directory
if [ ! -d "$LOCAL_REPO" ]; then
  echo -e "${RED}Error: Repository not found at $LOCAL_REPO${NC}"
  exit 1
fi

cd $LOCAL_REPO

# Build the application
echo -e "\n${YELLOW}Building application...${NC}"
pnpm install
pnpm run build

# Create deployment package
echo -e "\n${YELLOW}Creating deployment package...${NC}"
DEPLOY_DIR="/tmp/sengol-crawler-deploy"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy necessary files
cp -r dist/ $DEPLOY_DIR/
cp -r node_modules/ $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp pnpm-lock.yaml $DEPLOY_DIR/
cp -r lib/crawlers/ $DEPLOY_DIR/lib/ 2>/dev/null || true
cp -r prisma/ $DEPLOY_DIR/

# Create .env file template
cat > $DEPLOY_DIR/.env.template <<'EOF'
# Database
DATABASE_URL="postgresql://..."

# OpenAI
OPENAI_API_KEY="sk-..."

# GCP
GCP_PROJECT_ID="elite-striker-477619-p8"
GCP_REGION="us-central1"

# Qdrant
DVECDB_HOST="sengol-vector-db"
DVECDB_PORT="6333"

# Cloud Tasks
CRAWLER_QUEUE_NAME="sengol-crawler-tasks"

# Port
PORT=3000
EOF

# Deploy to Orchestrator VM
echo -e "\n${YELLOW}Deploying to orchestrator VM...${NC}"
gcloud compute scp --recurse $DEPLOY_DIR/* \
  sengol-crawler-orchestrator:/home/$(whoami)/sengol-crawler/ \
  --zone=$ZONE \
  --project=$PROJECT_ID

gcloud compute ssh sengol-crawler-orchestrator \
  --zone=$ZONE \
  --project=$PROJECT_ID \
  --command="
    cd /home/$(whoami)/sengol-crawler

    # Setup environment
    if [ ! -f .env ]; then
      echo 'Creating .env file from template...'
      cp .env.template .env
      echo 'IMPORTANT: Edit .env file with actual credentials!'
    fi

    # Install dependencies
    pnpm install --prod

    # Generate Prisma client
    npx prisma generate

    # Create systemd service
    sudo tee /etc/systemd/system/sengol-orchestrator.service > /dev/null <<'SERVICE'
[Unit]
Description=Sengol Crawler Orchestrator
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/sengol-crawler
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/app.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

    # Enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable sengol-orchestrator
    sudo systemctl restart sengol-orchestrator

    echo 'Orchestrator service deployed successfully'
  "

# Deploy to Worker VM
echo -e "\n${YELLOW}Deploying to preemptible worker VM...${NC}"
gcloud compute scp --recurse $DEPLOY_DIR/* \
  sengol-crawler-worker-1:/home/$(whoami)/sengol-crawler/ \
  --zone=$ZONE \
  --project=$PROJECT_ID

gcloud compute ssh sengol-crawler-worker-1 \
  --zone=$ZONE \
  --project=$PROJECT_ID \
  --command="
    cd /home/$(whoami)/sengol-crawler

    # Setup environment
    if [ ! -f .env ]; then
      cp .env.template .env
    fi

    # Install dependencies
    pnpm install --prod
    npx prisma generate

    # Create systemd service
    sudo tee /etc/systemd/system/sengol-worker.service > /dev/null <<'SERVICE'
[Unit]
Description=Sengol Crawler Worker
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/sengol-crawler
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/services/crawler-worker-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

    sudo systemctl daemon-reload
    sudo systemctl enable sengol-worker
    sudo systemctl restart sengol-worker

    echo 'Worker service deployed successfully'
  "

# Deploy Cloud Functions
echo -e "\n${YELLOW}Deploying Cloud Functions...${NC}"

# 1. Embedding Generator Cloud Function
echo -e "${GREEN}Deploying embedding generator function...${NC}"
gcloud functions deploy sengol-embedding-generator \
  --gen2 \
  --runtime=python311 \
  --region=$REGION \
  --source=/tmp/cloud-functions/embedding-generator \
  --entry-point=generate_embeddings \
  --trigger-topic=sengol-data-crawled \
  --service-account=sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com \
  --memory=2GB \
  --timeout=540s \
  --max-instances=10 \
  --set-env-vars="GCP_PROJECT=${PROJECT_ID},OPENAI_API_KEY=${OPENAI_API_KEY}" \
  --project=$PROJECT_ID

# 2. Qdrant Loader Cloud Function
echo -e "${GREEN}Deploying Qdrant loader function...${NC}"
gcloud functions deploy sengol-qdrant-loader \
  --gen2 \
  --runtime=python311 \
  --region=$REGION \
  --source=/tmp/cloud-functions/qdrant-loader \
  --entry-point=load_to_qdrant \
  --trigger-topic=sengol-embeddings-generated \
  --service-account=sengol-functions@${PROJECT_ID}.iam.gserviceaccount.com \
  --memory=1GB \
  --timeout=300s \
  --max-instances=5 \
  --set-env-vars="GCP_PROJECT=${PROJECT_ID},QDRANT_HOST=sengol-vector-db,QDRANT_PORT=6333" \
  --project=$PROJECT_ID \
  --vpc-connector=projects/${PROJECT_ID}/locations/${REGION}/connectors/sengol-vpc-connector 2>/dev/null || \
  echo "Warning: VPC connector not found. Qdrant loader may not reach internal Qdrant VM. Create VPC connector first."

# Create VPC connector (if doesn't exist) for Cloud Function to reach internal Qdrant VM
echo -e "\n${YELLOW}Checking VPC connector for Cloud Functions...${NC}"
gcloud compute networks vpc-access connectors create sengol-vpc-connector \
  --region=$REGION \
  --network=default \
  --range=10.8.0.0/28 \
  --project=$PROJECT_ID 2>/dev/null || echo "VPC connector already exists or creation failed"

# Cleanup
rm -rf $DEPLOY_DIR

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Service Status:${NC}"
echo -e "  1. Orchestrator: ${GREEN}gcloud compute ssh sengol-crawler-orchestrator --zone=$ZONE --command='sudo systemctl status sengol-orchestrator'${NC}"
echo -e "  2. Worker: ${GREEN}gcloud compute ssh sengol-crawler-worker-1 --zone=$ZONE --command='sudo systemctl status sengol-worker'${NC}"
echo -e "  3. Embedding Gen: ${GREEN}gcloud functions describe sengol-embedding-generator --region=$REGION${NC}"
echo -e "  4. Qdrant Loader: ${GREEN}gcloud functions describe sengol-qdrant-loader --region=$REGION${NC}"

echo -e "\n${BLUE}Cost Optimization Applied:${NC}"
echo -e "  ✓ Cloud Functions instead of dedicated VMs (save ~$64/month)"
echo -e "  ✓ Preemptible worker (save ~$38/month)"
echo -e "  ✓ Only 2 VMs running 24/7 (orchestrator + worker)"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "  1. Update .env files on VMs with actual credentials"
echo -e "  2. Set OPENAI_API_KEY for Cloud Functions"
echo -e "  3. Run ${GREEN}./4-setup-scheduler.sh${NC} to create Cloud Scheduler jobs"
echo -e "  4. Create VPC connector if Qdrant loader deployment failed"

echo -e "\n${GREEN}Done!${NC}"
