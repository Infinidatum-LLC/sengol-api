#!/bin/bash

# Complete Vertex AI Migration - Run All Steps
# This master script executes all setup steps in sequence

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║         VERTEX AI MIGRATION - COMPLETE SETUP              ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}║  This will set up the entire Vertex AI infrastructure     ║${NC}"
echo -e "${CYAN}║  and deploy the crawler system.                           ║${NC}"
echo -e "${CYAN}║                                                            ║${NC}"
echo -e "${CYAN}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check prerequisites
echo -e "${BLUE}Checking prerequisites...${NC}"

if ! command -v gcloud &> /dev/null; then
    echo -e "${RED}Error: gcloud CLI is not installed${NC}"
    echo "Please install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

if ! command -v vercel &> /dev/null; then
    echo -e "${RED}Error: Vercel CLI is not installed${NC}"
    echo "Please install: npm install -g vercel"
    exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q .; then
    echo -e "${RED}Error: Not authenticated with gcloud${NC}"
    echo "Please run: gcloud auth login"
    exit 1
fi

echo -e "${GREEN}✓ All prerequisites met${NC}"
echo ""

# Confirmation
echo -e "${YELLOW}This script will:${NC}"
echo "  1. Create Google Cloud Storage bucket"
echo "  2. Setup service account with permissions"
echo "  3. Create Compute Engine instance for crawlers"
echo "  4. Deploy crawler application"
echo "  5. Update Vercel environment variables"
echo "  6. Provide next steps for Vertex AI grounding"
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  STEP 1: Infrastructure Setup${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

./scripts/setup-vertex-ai-infrastructure.sh

echo ""
echo -e "${GREEN}✓ Infrastructure setup complete${NC}"
echo ""

# Wait for instance to be ready
echo -e "${YELLOW}Waiting 90 seconds for instance to initialize...${NC}"
for i in {90..1}; do
    echo -ne "\r  Time remaining: ${i}s "
    sleep 1
done
echo ""

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  STEP 2: Deploy Crawler Application${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

./scripts/deploy-crawler.sh

echo ""
echo -e "${GREEN}✓ Crawler deployment complete${NC}"
echo ""

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  STEP 3: Update Vercel Environment Variables${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

./scripts/update-vercel-env.sh

echo ""
echo -e "${GREEN}✓ Vercel environment variables updated${NC}"
echo ""

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  STEP 4: Vertex AI Grounding Setup${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

./scripts/setup-vertex-ai-grounding.sh

echo ""
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🎉 SETUP COMPLETE!${NC}"
echo -e "${CYAN}════════════════════════════════════════════════════════════${NC}"
echo ""

echo -e "${GREEN}All automated steps completed successfully!${NC}"
echo ""
echo -e "${YELLOW}Next Manual Steps:${NC}"
echo ""
echo "1. Wait for crawler to generate incident data (~10-30 minutes)"
echo "   ${BLUE}Monitor: gcloud compute ssh sengol-crawler --zone=us-central1-a --command='sudo journalctl -u sengol-crawler.service -f'${NC}"
echo ""
echo "2. Setup Vertex AI Data Store (follow instructions above)"
echo "   ${BLUE}This takes 30-60 minutes for initial indexing${NC}"
echo ""
echo "3. Deploy to Vercel:"
echo "   ${BLUE}npm run build${NC}"
echo "   ${BLUE}vercel --prod${NC}"
echo ""
echo "4. Test the API:"
echo "   ${BLUE}curl https://api.sengol.ai/health/detailed${NC}"
echo ""
echo -e "${GREEN}Migration Complete! 🚀${NC}"
echo ""
