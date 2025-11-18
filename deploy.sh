#!/bin/bash

# Quick Deploy Script for Sengol API to Cloud Run
# Usage: ./deploy.sh

set -e

echo "🚀 Deploying Sengol API to Cloud Run..."
echo ""

PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
SERVICE_NAME="sengol-api"

# Get current git commit
COMMIT_SHA=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)

echo "📦 Project: $PROJECT_ID"
echo "🌍 Region: $REGION"
echo "🏷️  Commit: $COMMIT_SHA"
echo "🌿 Branch: $BRANCH"
echo ""

# Confirm deployment
read -p "Deploy to Cloud Run? (y/N): " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]
then
    echo "❌ Deployment cancelled"
    exit 1
fi

echo "🔨 Building and deploying..."
echo ""

# Load environment variables from .env file (use for local reference only)
# DO NOT commit secrets to version control - use Cloud Run UI or gcloud secret manager
# Load secrets from environment (set these in Cloud Run or via Secret Manager)
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Deploy using Cloud Run source deployment
# All sensitive values should come from environment variables
/Users/durai/google-cloud-sdk/bin/gcloud run deploy $SERVICE_NAME \
  --source=. \
  --region=$REGION \
  --platform=managed \
  --allow-unauthenticated \
  --vpc-connector=sengol-connector \
  --vpc-egress=all-traffic \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0 \
  --set-env-vars="NODE_ENV=production,DATABASE_URL=${DATABASE_URL},OPENAI_API_KEY=${OPENAI_API_KEY},ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-},JWT_SECRET=${JWT_SECRET},DVECDB_HOST=${DVECDB_HOST:-},DVECDB_PORT=${DVECDB_PORT:-},DVECDB_API_URL=${DVECDB_API_URL:-}" \
  --project=$PROJECT_ID

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Service URL: https://sengol-api-678287061519.us-central1.run.app"
echo "🏥 Health Check: https://sengol-api-678287061519.us-central1.run.app/health"
echo ""
