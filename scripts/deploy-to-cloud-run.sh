#!/bin/bash

# Automated Cloud Run Deployment Script
# Uses service account authentication for automated deployment

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Cloud Run Deployment${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
SERVICE_NAME="sengol-api"
VPC_CONNECTOR="sengol-connector"

# Check if GOOGLE_APPLICATION_CREDENTIALS is set
if [ -z "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  echo -e "${RED}ERROR: GOOGLE_APPLICATION_CREDENTIALS not set${NC}"
  echo -e "Run: ${YELLOW}./scripts/setup-gcp-automation.sh${NC} first"
  exit 1
fi

# Check if key file exists
if [ ! -f "$GOOGLE_APPLICATION_CREDENTIALS" ]; then
  echo -e "${RED}ERROR: Service account key file not found${NC}"
  echo -e "Expected: ${GOOGLE_APPLICATION_CREDENTIALS}"
  echo -e "Run: ${YELLOW}./scripts/setup-gcp-automation.sh${NC} first"
  exit 1
fi

# Verify authentication
echo -e "${YELLOW}Verifying authentication...${NC}"
ACTIVE_ACCOUNT=$(/Users/durai/google-cloud-sdk/bin/gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
if [ -z "$ACTIVE_ACCOUNT" ]; then
  echo -e "${RED}ERROR: No active GCP account${NC}"
  echo -e "Run: ${YELLOW}./scripts/setup-gcp-automation.sh${NC} first"
  exit 1
fi
echo -e "${GREEN}✓ Authenticated as: ${ACTIVE_ACCOUNT}${NC}"

# Check if VPC connector exists
echo -e "${YELLOW}Checking VPC connector...${NC}"
if /Users/durai/google-cloud-sdk/bin/gcloud compute networks vpc-access connectors describe ${VPC_CONNECTOR} \
  --region=${REGION} \
  --project=${PROJECT_ID} >/dev/null 2>&1; then
  echo -e "${GREEN}✓ VPC connector exists${NC}"
else
  echo -e "${YELLOW}Creating VPC connector (this takes 5-10 minutes)...${NC}"
  /Users/durai/google-cloud-sdk/bin/gcloud compute networks vpc-access connectors create ${VPC_CONNECTOR} \
    --network=default \
    --region=${REGION} \
    --range=10.8.0.0/28 \
    --project=${PROJECT_ID}
  echo -e "${GREEN}✓ VPC connector created${NC}"
fi

# Load environment variables from .env
echo -e "${YELLOW}Loading environment variables...${NC}"
if [ -f ".env" ]; then
  export $(grep -v '^#' .env | xargs)
  echo -e "${GREEN}✓ Environment variables loaded${NC}"
else
  echo -e "${RED}ERROR: .env file not found${NC}"
  exit 1
fi

# Check if secrets exist, create if needed
echo -e "${YELLOW}Checking/creating secrets in Secret Manager...${NC}"

# Function to create or update secret
create_or_update_secret() {
  local SECRET_NAME=$1
  local SECRET_VALUE=$2

  if /Users/durai/google-cloud-sdk/bin/gcloud secrets describe ${SECRET_NAME} --project=${PROJECT_ID} >/dev/null 2>&1; then
    # Secret exists, add new version
    echo "  Updating ${SECRET_NAME}..."
    echo -n "${SECRET_VALUE}" | /Users/durai/google-cloud-sdk/bin/gcloud secrets versions add ${SECRET_NAME} \
      --data-file=- \
      --project=${PROJECT_ID} >/dev/null 2>&1
  else
    # Create new secret
    echo "  Creating ${SECRET_NAME}..."
    echo -n "${SECRET_VALUE}" | /Users/durai/google-cloud-sdk/bin/gcloud secrets create ${SECRET_NAME} \
      --data-file=- \
      --replication-policy="automatic" \
      --project=${PROJECT_ID} >/dev/null 2>&1
  fi
}

# Create/update all secrets
create_or_update_secret "DATABASE_URL" "${DATABASE_URL}"
create_or_update_secret "OPENAI_API_KEY" "${OPENAI_API_KEY}"
create_or_update_secret "JWT_SECRET" "${JWT_SECRET}"
create_or_update_secret "QDRANT_HOST" "10.128.0.2"
create_or_update_secret "QDRANT_PORT" "6333"
create_or_update_secret "ALLOWED_ORIGINS" "https://sengol.ai,https://www.sengol.ai"

echo -e "${GREEN}✓ All secrets created/updated${NC}"

# Deploy to Cloud Run
echo -e "${YELLOW}Deploying to Cloud Run...${NC}"
echo -e "${BLUE}This will take 5-10 minutes for the first deployment${NC}"
echo ""

cd /Users/durai/Documents/GitHub/sengol-api

/Users/durai/google-cloud-sdk/bin/gcloud run deploy ${SERVICE_NAME} \
  --source=. \
  --region=${REGION} \
  --platform=managed \
  --allow-unauthenticated \
  --vpc-connector=${VPC_CONNECTOR} \
  --vpc-egress=all-traffic \
  --memory=2Gi \
  --cpu=2 \
  --timeout=300 \
  --max-instances=10 \
  --min-instances=0 \
  --set-env-vars="NODE_ENV=production,CACHE_ENABLED=true,CACHE_TTL=3600,REQUEST_TIMEOUT=120000,OPENAI_TIMEOUT=60000" \
  --update-secrets="DATABASE_URL=DATABASE_URL:latest,OPENAI_API_KEY=OPENAI_API_KEY:latest,JWT_SECRET=JWT_SECRET:latest,QDRANT_HOST=QDRANT_HOST:latest,QDRANT_PORT=QDRANT_PORT:latest,ALLOWED_ORIGINS=ALLOWED_ORIGINS:latest" \
  --project=${PROJECT_ID}

# Get the service URL
SERVICE_URL=$(/Users/durai/google-cloud-sdk/bin/gcloud run services describe ${SERVICE_NAME} \
  --region=${REGION} \
  --project=${PROJECT_ID} \
  --format='value(status.url)')

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Service URL: ${BLUE}${SERVICE_URL}${NC}"
echo ""
echo -e "${YELLOW}Testing the deployment...${NC}"

# Test health endpoint
echo -e "Testing health endpoint..."
if curl -s "${SERVICE_URL}/health" | grep -q "ok"; then
  echo -e "${GREEN}✓ Health check: OK${NC}"
else
  echo -e "${RED}✗ Health check: FAILED${NC}"
fi

# Test API endpoint
echo -e "Testing API endpoint with real data..."
RESPONSE=$(curl -s -X POST "${SERVICE_URL}/api/review/test123/generate-questions" \
  -H "Content-Type: application/json" \
  -d '{
    "systemDescription": "AI chatbot with customer data access",
    "industry": "technology",
    "complianceFrameworks": ["gdpr"]
  }')

# Check if response contains questions with incident counts
if echo "$RESPONSE" | grep -q '"incidentCount"'; then
  INCIDENT_COUNT=$(echo "$RESPONSE" | grep -o '"incidentCount":[0-9]*' | head -1 | cut -d':' -f2)
  if [ "$INCIDENT_COUNT" -gt 0 ]; then
    echo -e "${GREEN}✓ API test: OK (incidentCount: ${INCIDENT_COUNT})${NC}"
    echo -e "${GREEN}✓ Qdrant connectivity: OK${NC}"
  else
    echo -e "${YELLOW}⚠ API test: WARNING (incidentCount: 0)${NC}"
    echo -e "${YELLOW}⚠ Qdrant may not be reachable${NC}"
  fi
else
  echo -e "${RED}✗ API test: FAILED${NC}"
  echo -e "Response: ${RESPONSE}"
fi

echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Map custom domain (optional): ${BLUE}./scripts/setup-custom-domain.sh${NC}"
echo -e "2. Setup git auto-deploy: ${BLUE}./scripts/setup-git-autodeploy.sh${NC}"
echo -e "3. Monitor logs: ${BLUE}/Users/durai/google-cloud-sdk/bin/gcloud run services logs read ${SERVICE_NAME} --region=${REGION}${NC}"
echo ""
