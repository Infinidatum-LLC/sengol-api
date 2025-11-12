#!/bin/bash

# GCP Automation Setup Script
# This script creates a service account with all necessary permissions
# for automated Cloud Run deployments

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}GCP Automation Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
SERVICE_ACCOUNT_NAME="claude-automation"
SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
KEY_FILE="$HOME/.config/gcloud/claude-automation-key.json"

# Step 1: Set the project
echo -e "${YELLOW}Step 1: Setting GCP project to ${PROJECT_ID}${NC}"
/Users/durai/google-cloud-sdk/bin/gcloud config set project ${PROJECT_ID}

# Step 2: Enable required APIs
echo -e "${YELLOW}Step 2: Enabling required GCP APIs${NC}"
/Users/durai/google-cloud-sdk/bin/gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  containerregistry.googleapis.com \
  vpcaccess.googleapis.com \
  secretmanager.googleapis.com \
  iam.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project=${PROJECT_ID}

# Step 3: Create service account (if it doesn't exist)
echo -e "${YELLOW}Step 3: Creating service account${NC}"
if /Users/durai/google-cloud-sdk/bin/gcloud iam service-accounts describe ${SERVICE_ACCOUNT_EMAIL} --project=${PROJECT_ID} >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Service account already exists${NC}"
else
  /Users/durai/google-cloud-sdk/bin/gcloud iam service-accounts create ${SERVICE_ACCOUNT_NAME} \
    --display-name="Claude Automation Service Account" \
    --description="Service account for automated Cloud Run deployments" \
    --project=${PROJECT_ID}
  echo -e "${GREEN}✓ Service account created${NC}"
fi

# Step 4: Grant necessary IAM roles
echo -e "${YELLOW}Step 4: Granting IAM roles to service account${NC}"

ROLES=(
  "roles/run.admin"                      # Deploy and manage Cloud Run services
  "roles/iam.serviceAccountUser"         # Act as other service accounts
  "roles/cloudbuild.builds.editor"       # Create and manage builds
  "roles/storage.admin"                  # Upload/download from Container Registry
  "roles/secretmanager.secretAccessor"   # Access secrets
  "roles/compute.networkUser"            # Use VPC connectors
  "roles/logging.logWriter"              # Write logs
  "roles/monitoring.metricWriter"        # Write metrics
)

for role in "${ROLES[@]}"; do
  echo "  Granting ${role}..."
  /Users/durai/google-cloud-sdk/bin/gcloud projects add-iam-policy-binding ${PROJECT_ID} \
    --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
    --role="${role}" \
    --condition=None \
    --quiet >/dev/null 2>&1
done

echo -e "${GREEN}✓ All IAM roles granted${NC}"

# Step 5: Create and download service account key
echo -e "${YELLOW}Step 5: Creating service account key${NC}"

# Create .config/gcloud directory if it doesn't exist
mkdir -p "$HOME/.config/gcloud"

# Delete existing key if it exists
if [ -f "${KEY_FILE}" ]; then
  echo "  Removing old key file..."
  rm "${KEY_FILE}"
fi

# Create new key
/Users/durai/google-cloud-sdk/bin/gcloud iam service-accounts keys create "${KEY_FILE}" \
  --iam-account="${SERVICE_ACCOUNT_EMAIL}" \
  --project=${PROJECT_ID}

# Set restrictive permissions
chmod 600 "${KEY_FILE}"

echo -e "${GREEN}✓ Service account key created: ${KEY_FILE}${NC}"

# Step 6: Activate the service account
echo -e "${YELLOW}Step 6: Activating service account${NC}"
/Users/durai/google-cloud-sdk/bin/gcloud auth activate-service-account \
  --key-file="${KEY_FILE}" \
  --project=${PROJECT_ID}

# Verify activation
ACTIVE_ACCOUNT=$(/Users/durai/google-cloud-sdk/bin/gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo -e "${GREEN}✓ Active account: ${ACTIVE_ACCOUNT}${NC}"

# Step 7: Set application default credentials
echo -e "${YELLOW}Step 7: Setting application default credentials${NC}"
export GOOGLE_APPLICATION_CREDENTIALS="${KEY_FILE}"
echo "export GOOGLE_APPLICATION_CREDENTIALS=\"${KEY_FILE}\"" >> ~/.bashrc
echo "export GOOGLE_APPLICATION_CREDENTIALS=\"${KEY_FILE}\"" >> ~/.zshrc

echo -e "${GREEN}✓ Application default credentials set${NC}"

# Step 8: Test permissions
echo -e "${YELLOW}Step 8: Testing permissions${NC}"

# Test Cloud Run access
if /Users/durai/google-cloud-sdk/bin/gcloud run services list --region=${REGION} --project=${PROJECT_ID} >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Cloud Run access: OK${NC}"
else
  echo -e "${RED}✗ Cloud Run access: FAILED${NC}"
fi

# Test Secret Manager access
if /Users/durai/google-cloud-sdk/bin/gcloud secrets list --project=${PROJECT_ID} >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Secret Manager access: OK${NC}"
else
  echo -e "${RED}✗ Secret Manager access: FAILED${NC}"
fi

# Test Container Registry access
if /Users/durai/google-cloud-sdk/bin/gcloud container images list --project=${PROJECT_ID} >/dev/null 2>&1; then
  echo -e "${GREEN}✓ Container Registry access: OK${NC}"
else
  echo -e "${RED}✗ Container Registry access: FAILED${NC}"
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Service Account: ${SERVICE_ACCOUNT_EMAIL}"
echo -e "Key File: ${KEY_FILE}"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo -e "1. Run: ${GREEN}source ~/.bashrc${NC} (or restart your terminal)"
echo -e "2. Verify: ${GREEN}echo \$GOOGLE_APPLICATION_CREDENTIALS${NC}"
echo -e "3. Deploy: ${GREEN}./scripts/deploy-to-cloud-run.sh${NC}"
echo ""
echo -e "${YELLOW}Security Note:${NC}"
echo -e "The service account key is stored at: ${KEY_FILE}"
echo -e "Keep this file secure and never commit it to git."
echo -e "It's already added to .gitignore as .config/"
echo ""
