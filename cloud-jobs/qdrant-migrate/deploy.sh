#!/bin/bash
set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
SERVICE_NAME="sengol-qdrant-migrator"
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/sengol-api/${SERVICE_NAME}"
IMAGE_TAG="latest"
IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

# Qdrant Cloud credentials
TARGET_QDRANT_HOST="dabdc9f2-54ee-4340-b128-e41d3cdc243d.us-east4-0.gcp.cloud.qdrant.io"
TARGET_QDRANT_API_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhY2Nlc3MiOiJtIn0.dKFi1sD4RPnhdEC7W3RgF_vSPSQq5dEYPH9fjq7LqPo"

echo "==========================================="
echo "Sengol Qdrant VM-to-Cloud Migration"
echo "==========================================="
echo ""
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo "Source:   Self-hosted Qdrant (10.128.0.2:6333)"
echo "Target:   Qdrant Cloud"
echo ""

# Step 1 & 2: Build and push using Cloud Build (has proper GCP permissions)
echo "[1/4] Building Docker image..."
echo "[2/4] Pushing to Artifact Registry..."
/Users/durai/google-cloud-sdk/bin/gcloud builds submit --tag=$IMAGE --project=$PROJECT_ID
echo "✓ Image built and pushed"

# Step 3: Create Cloud Run Job
echo ""
echo "[3/4] Creating Cloud Run Job..."
/Users/durai/google-cloud-sdk/bin/gcloud run jobs create $SERVICE_NAME \
  --image=$IMAGE \
  --region=$REGION \
  --vpc-connector=sengol-connector \
  --vpc-egress=all-traffic \
  --memory=2Gi \
  --cpu=2 \
  --task-timeout=1800s \
  --max-retries=0 \
  --set-env-vars="SOURCE_QDRANT_HOST=10.128.0.2,SOURCE_QDRANT_PORT=6333,TARGET_QDRANT_HOST=${TARGET_QDRANT_HOST},TARGET_QDRANT_API_KEY=${TARGET_QDRANT_API_KEY},COLLECTION_NAME=sengol_incidents" \
  --project=$PROJECT_ID 2>&1 || echo "Job already exists, will update..."

# Step 4: Update existing job or execute new one
echo ""
echo "[4/4] Executing migration job..."
echo "  This will connect to self-hosted Qdrant and migrate data to Qdrant Cloud"
echo "  Check logs with: /Users/durai/google-cloud-sdk/bin/gcloud run jobs logs $SERVICE_NAME --region=$REGION"
echo ""

# Try to execute the job (update first if it exists)
/Users/durai/google-cloud-sdk/bin/gcloud run jobs update $SERVICE_NAME \
  --image=$IMAGE \
  --region=$REGION \
  --vpc-connector=sengol-connector \
  --vpc-egress=all-traffic \
  --memory=2Gi \
  --cpu=2 \
  --task-timeout=1800s \
  --max-retries=0 \
  --set-env-vars="SOURCE_QDRANT_HOST=10.128.0.2,SOURCE_QDRANT_PORT=6333,TARGET_QDRANT_HOST=${TARGET_QDRANT_HOST},TARGET_QDRANT_API_KEY=${TARGET_QDRANT_API_KEY},COLLECTION_NAME=sengol_incidents" \
  --project=$PROJECT_ID 2>&1 || true

# Execute the job
/Users/durai/google-cloud-sdk/bin/gcloud run jobs execute $SERVICE_NAME \
  --region=$REGION \
  --project=$PROJECT_ID

echo ""
echo "✓ Migration job submitted!"
echo "Expected duration: 30-60 minutes depending on data size (~78,000 incidents)"
echo ""
echo "View logs:"
echo "  gcloud run jobs logs $SERVICE_NAME --region=$REGION"
echo ""
echo "Monitor execution:"
echo "  gcloud run jobs describe $SERVICE_NAME --region=$REGION --project=$PROJECT_ID"
