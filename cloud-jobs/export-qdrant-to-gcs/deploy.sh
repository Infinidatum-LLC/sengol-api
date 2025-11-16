#!/bin/bash
set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
SERVICE_NAME="sengol-qdrant-exporter"
GCS_BUCKET="sengol-data-migrations"

# Derived variables
IMAGE_NAME="${REGION}-docker.pkg.dev/${PROJECT_ID}/sengol-api/${SERVICE_NAME}"
IMAGE_TAG="latest"
IMAGE="${IMAGE_NAME}:${IMAGE_TAG}"

echo "=========================================="
echo "Sengol Qdrant to GCS Export"
echo "=========================================="
echo ""
echo "Project:  $PROJECT_ID"
echo "Region:   $REGION"
echo "Service:  $SERVICE_NAME"
echo "Bucket:   $GCS_BUCKET"
echo ""

# Step 1: Create GCS bucket if it doesn't exist
echo "[1/5] Checking GCS bucket..."
if gsutil ls -b gs://$GCS_BUCKET > /dev/null 2>&1; then
    echo "✓ Bucket gs://$GCS_BUCKET already exists"
else
    echo "  Creating bucket gs://$GCS_BUCKET..."
    gsutil mb -p $PROJECT_ID gs://$GCS_BUCKET
    echo "✓ Bucket created"
fi

# Step 2: Build Docker image
echo ""
echo "[2/5] Building Docker image..."
docker build -t $IMAGE .
echo "✓ Image built: $IMAGE"

# Step 3: Push to Artifact Registry
echo ""
echo "[3/5] Pushing to Artifact Registry..."
docker push $IMAGE
echo "✓ Image pushed"

# Step 4: Deploy to Cloud Run
echo ""
echo "[4/5] Deploying to Cloud Run..."
gcloud run deploy $SERVICE_NAME \
  --image=$IMAGE \
  --platform=managed \
  --region=$REGION \
  --vpc-connector=sengol-connector \
  --vpc-egress=all-traffic \
  --memory=2Gi \
  --cpu=2 \
  --timeout=3600 \
  --max-instances=1 \
  --set-env-vars="GCS_BUCKET=$GCS_BUCKET,QDRANT_HOST=10.128.0.2,QDRANT_PORT=6333" \
  --project=$PROJECT_ID

echo "✓ Service deployed"

# Step 5: Run the job
echo ""
echo "[5/5] Executing export job..."
echo "  This will connect to self-hosted Qdrant and export data to GCS"
echo "  Check logs with: gcloud run logs $SERVICE_NAME --region=$REGION --limit=100"
echo ""
echo "Job submitted! The export will run in the background."
echo "Expected duration: 10-30 minutes depending on data size"
echo ""
echo "View logs:"
echo "  gcloud run logs $SERVICE_NAME --region=$REGION --follow"
echo ""
echo "After export completes, data will be at:"
echo "  gs://$GCS_BUCKET/qdrant-exports/sengol_incidents-*.json"
