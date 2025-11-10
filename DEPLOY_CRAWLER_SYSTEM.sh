#!/bin/bash

# SENGOL CRAWLER DEPLOYMENT LAUNCHER
# This script handles authentication and launches the main deployment

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   SENGOL CRAWLER - DEPLOYMENT LAUNCHER            ║${NC}"
echo -e "${BLUE}║   Cost: ~\$96/month | Time: 45 minutes              ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

# Set the gcloud path
export PATH="/Users/durai/google-cloud-sdk/bin:$PATH"

# Check if already authenticated
echo -e "\n${YELLOW}Checking gcloud authentication...${NC}"
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" > /dev/null 2>&1; then
    echo -e "${YELLOW}Authentication required. Running gcloud auth login...${NC}"
    gcloud auth login
fi

# Set project
echo -e "\n${YELLOW}Setting GCP project...${NC}"
gcloud config set project elite-striker-477619-p8

# Verify credentials
ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)")
echo -e "${GREEN}✓ Authenticated as: $ACTIVE_ACCOUNT${NC}"
echo -e "${GREEN}✓ Project: elite-striker-477619-p8${NC}"

# Change to scripts directory
cd "$(dirname "$0")/scripts/gce"

# Run the main deployment script
echo -e "\n${GREEN}Launching main deployment script...${NC}"
./RUN_THIS.sh
