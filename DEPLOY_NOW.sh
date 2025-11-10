#!/bin/bash

# IMMEDIATE DEPLOYMENT SCRIPT
# This will run the deployment WITH interactive authentication

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SENGOL CRAWLER - IMMEDIATE DEPLOYMENT           ║${NC}"
echo -e "${BLUE}║   This script WILL open browser for auth          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

# Set PATH
export PATH="/Users/durai/google-cloud-sdk/bin:$PATH"

# Force reauthentication
echo -e "\n${YELLOW}Step 1: Authenticating with gcloud...${NC}"
echo -e "${YELLOW}(This will open your browser)${NC}\n"

gcloud auth login --launch-browser

# Set project
echo -e "\n${YELLOW}Step 2: Setting project...${NC}"
gcloud config set project elite-striker-477619-p8

# Verify
ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
PROJECT=$(gcloud config get-value project)

echo -e "\n${GREEN}✅ Authentication successful!${NC}"
echo -e "${GREEN}   Account: $ACCOUNT${NC}"
echo -e "${GREEN}   Project: $PROJECT${NC}"

# Run deployment
echo -e "\n${YELLOW}Step 3: Starting deployment...${NC}"
echo -e "${BLUE}This will take approximately 45 minutes${NC}\n"

cd "$(dirname "$0")/scripts/gce"
echo "yes" | ./RUN_THIS.sh

echo -e "\n${GREEN}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║   DEPLOYMENT COMPLETE!                             ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════╝${NC}"
