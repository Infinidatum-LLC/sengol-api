#!/bin/bash

# Setup Git Auto-Deploy via Cloud Build
# Configures automatic deployments on git push (like Vercel)

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Git Auto-Deploy Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

PROJECT_ID="elite-striker-477619-p8"
REPO_NAME="sengol-api"

# Get GitHub username
echo -e "${YELLOW}Enter your GitHub username:${NC}"
read -p "> " GITHUB_USER

if [ -z "$GITHUB_USER" ]; then
  echo -e "${RED}ERROR: GitHub username required${NC}"
  exit 1
fi

# Connect GitHub repository
echo -e "${YELLOW}Connecting GitHub repository...${NC}"
echo -e "${BLUE}You'll be prompted to authorize Cloud Build to access your GitHub account${NC}"

# Check if trigger already exists
EXISTING_TRIGGER=$(/Users/durai/google-cloud-sdk/bin/gcloud builds triggers list \
  --filter="name:sengol-api-auto-deploy" \
  --format="value(name)" \
  --project=${PROJECT_ID} 2>/dev/null)

if [ -n "$EXISTING_TRIGGER" ]; then
  echo -e "${GREEN}✓ Trigger already exists${NC}"
else
  # Create trigger
  /Users/durai/google-cloud-sdk/bin/gcloud builds triggers create github \
    --name="sengol-api-auto-deploy" \
    --repo-name="${REPO_NAME}" \
    --repo-owner="${GITHUB_USER}" \
    --branch-pattern="^master$" \
    --build-config="cloudbuild.yaml" \
    --project=${PROJECT_ID}

  echo -e "${GREEN}✓ Trigger created${NC}"
fi

# Grant Cloud Build permissions
echo -e "${YELLOW}Granting Cloud Build permissions...${NC}"

PROJECT_NUMBER=$(/Users/durai/google-cloud-sdk/bin/gcloud projects describe ${PROJECT_ID} --format='value(projectNumber)')
CLOUD_BUILD_SA="${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com"

# Grant necessary roles
/Users/durai/google-cloud-sdk/bin/gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/run.admin" \
  --quiet >/dev/null 2>&1

/Users/durai/google-cloud-sdk/bin/gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/iam.serviceAccountUser" \
  --quiet >/dev/null 2>&1

/Users/durai/google-cloud-sdk/bin/gcloud projects add-iam-policy-binding ${PROJECT_ID} \
  --member="serviceAccount:${CLOUD_BUILD_SA}" \
  --role="roles/secretmanager.secretAccessor" \
  --quiet >/dev/null 2>&1

echo -e "${GREEN}✓ Permissions granted${NC}"

# Test the trigger
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}How it works:${NC}"
echo -e "1. Push code to master branch: ${BLUE}git push origin master${NC}"
echo -e "2. Cloud Build automatically triggers"
echo -e "3. Builds Docker image"
echo -e "4. Deploys to Cloud Run"
echo -e "5. Service updates automatically"
echo ""
echo -e "${YELLOW}Monitor builds:${NC}"
echo -e "CLI: ${BLUE}/Users/durai/google-cloud-sdk/bin/gcloud builds list --limit=5${NC}"
echo -e "Web: ${BLUE}https://console.cloud.google.com/cloud-build/builds?project=${PROJECT_ID}${NC}"
echo ""
echo -e "${YELLOW}Test now:${NC}"
echo -e "Make a small change, commit, and push:"
echo -e "${BLUE}echo \"# Deploy test \$(date)\" >> README.md${NC}"
echo -e "${BLUE}git add README.md${NC}"
echo -e "${BLUE}git commit -m \"test: Verify auto-deploy\"${NC}"
echo -e "${BLUE}git push origin master${NC}"
echo ""
