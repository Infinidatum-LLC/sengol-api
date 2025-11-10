#!/bin/bash

# Complete Optimized System Deployment
# Runs all setup scripts in order
# Estimated time: 45 minutes
# Estimated cost: ~$96/month

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}║   ${GREEN}SENGOL CRAWLER - OPTIMIZED DEPLOYMENT${BLUE}       ║${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}║   ${YELLOW}Estimated Cost: ~$96/month${BLUE}                  ║${NC}"
echo -e "${BLUE}║   ${YELLOW}Deployment Time: ~45 minutes${BLUE}                ║${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

# Check if required environment variables are set
echo -e "\n${YELLOW}Checking prerequisites...${NC}"

if [ -z "$DATABASE_URL" ]; then
  echo -e "${RED}ERROR: DATABASE_URL environment variable not set${NC}"
  echo -e "Please set it: ${GREEN}export DATABASE_URL='postgresql://...'${NC}"
  exit 1
fi

if [ -z "$OPENAI_API_KEY" ]; then
  echo -e "${RED}ERROR: OPENAI_API_KEY environment variable not set${NC}"
  echo -e "Please set it: ${GREEN}export OPENAI_API_KEY='sk-...'${NC}"
  exit 1
fi

echo -e "${GREEN}✓ Prerequisites check passed${NC}"

# Confirm deployment
echo -e "\n${YELLOW}This script will:${NC}"
echo -e "  1. Create GCP infrastructure (VMs, buckets, Pub/Sub, etc.)"
echo -e "  2. Setup PostgreSQL database schema"
echo -e "  3. Deploy services (VMs + Cloud Functions)"
echo -e "  4. Configure Cloud Scheduler jobs"
echo -e "  5. Setup auto-shutdown schedules"
echo -e ""
echo -e "${BLUE}Optimizations:${NC}"
echo -e "  ✓ Preemptible worker VM (60% cost reduction)"
echo -e "  ✓ Cloud Functions for embedding/qdrant (save ~$64/month)"
echo -e "  ✓ Auto-shutdown orchestrator off-hours (save ~$12/month)"
echo -e "  ✓ Smaller disk sizes (20-30GB vs 50-100GB)"
echo -e ""
read -p "Continue with deployment? (yes/no) " -n 3 -r
echo
if [[ ! $REPLY =~ ^yes$ ]]; then
  echo -e "${RED}Deployment cancelled${NC}"
  exit 1
fi

# Change to script directory
cd "$(dirname "$0")"

START_TIME=$(date +%s)

# Phase 1: Infrastructure (15 minutes)
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Phase 1: Infrastructure Setup${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Estimated time: 15 minutes${NC}\n"

chmod +x 1-setup-infrastructure-optimized.sh
./1-setup-infrastructure-optimized.sh

echo -e "\n${GREEN}✓ Phase 1 complete!${NC}"

# Phase 2: Database (5 minutes)
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Phase 2: Database Setup${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Estimated time: 5 minutes${NC}\n"

chmod +x 2-setup-database.sh
./2-setup-database.sh

echo -e "\n${GREEN}✓ Phase 2 complete!${NC}"

# Phase 3: Services (20 minutes)
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Phase 3: Service Deployment${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Estimated time: 20 minutes${NC}\n"

chmod +x 3-deploy-services-optimized.sh
./3-deploy-services-optimized.sh

echo -e "\n${GREEN}✓ Phase 3 complete!${NC}"

# Phase 4: Scheduler (2 minutes)
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Phase 4: Cloud Scheduler Setup${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Estimated time: 2 minutes${NC}\n"

chmod +x 4-setup-scheduler.sh
./4-setup-scheduler.sh

echo -e "\n${GREEN}✓ Phase 4 complete!${NC}"

# Phase 5: Auto-Shutdown (3 minutes)
echo -e "\n${GREEN}═══════════════════════════════════════${NC}"
echo -e "${GREEN}Phase 5: Auto-Shutdown Setup${NC}"
echo -e "${GREEN}═══════════════════════════════════════${NC}"
echo -e "${YELLOW}Estimated time: 3 minutes${NC}\n"

chmod +x 5-setup-auto-shutdown.sh
./5-setup-auto-shutdown.sh

echo -e "\n${GREEN}✓ Phase 5 complete!${NC}"

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
MINUTES=$((DURATION / 60))
SECONDS=$((DURATION % 60))

# Final summary
echo -e "\n${BLUE}╔════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}║   ${GREEN}DEPLOYMENT COMPLETE!${BLUE}                        ║${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}║   ${YELLOW}Total time: ${MINUTES}m ${SECONDS}s${BLUE}                           ║${NC}"
echo -e "${BLUE}║                                                    ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"

echo -e "\n${GREEN}Resources Created:${NC}"
echo -e "  ✓ 2 VMs (orchestrator + preemptible worker)"
echo -e "  ✓ 2 Cloud Functions (embedding generator + Qdrant loader)"
echo -e "  ✓ 3 GCS buckets"
echo -e "  ✓ 3 Pub/Sub topics"
echo -e "  ✓ 1 Cloud Tasks queue"
echo -e "  ✓ 6 Cloud Scheduler jobs"
echo -e "  ✓ PostgreSQL source_registry table (15 initial sources)"

echo -e "\n${GREEN}Cost Breakdown:${NC}"
echo -e "  Orchestrator VM (12h/day):        $12.23/month"
echo -e "  Worker VM (preemptible):          $10.00/month"
echo -e "  Qdrant VM (existing):             $47.82/month"
echo -e "  Cloud Functions:                   $8.00/month"
echo -e "  Persistent disks (5 × 20-30GB):   $17.00/month"
echo -e "  GCS storage:                       $0.45/month"
echo -e "  Pub/Sub + Cloud Tasks:             $0.20/month"
echo -e "  OpenAI API:                        $0.30/month"
echo -e "  ${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  ${GREEN}TOTAL:                            ~$96.00/month${NC}"

echo -e "\n${GREEN}Automated Jobs:${NC}"
echo -e "  • Regulatory crawlers: Every 6 hours"
echo -e "  • All crawlers: Daily at 2 AM UTC"
echo -e "  • News crawlers: Every 4 hours"
echo -e "  • Auto-discovery: Weekly on Sundays"
echo -e "  • VM shutdown: Daily at 9 PM UTC"
echo -e "  • VM startup: Daily at 6 AM UTC"

echo -e "\n${YELLOW}Next Steps:${NC}"

echo -e "\n${BLUE}1. Update Environment Variables:${NC}"
echo -e "   ${GREEN}# On orchestrator VM${NC}"
echo -e "   gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a"
echo -e "   nano ~/sengol-crawler/.env"
echo -e "   # Add DATABASE_URL, OPENAI_API_KEY"
echo -e "   sudo systemctl restart sengol-orchestrator"

echo -e "\n${BLUE}2. Update Cloud Function Environment:${NC}"
echo -e "   ${GREEN}# Update OPENAI_API_KEY${NC}"
echo -e "   gcloud functions deploy sengol-embedding-generator \\"
echo -e "     --update-env-vars OPENAI_API_KEY=${OPENAI_API_KEY} \\"
echo -e "     --region=us-central1"

echo -e "\n${BLUE}3. Test the System:${NC}"
echo -e "   ${GREEN}# Trigger a test run${NC}"
echo -e "   gcloud scheduler jobs run all-crawlers-daily --location=us-central1"

echo -e "\n${BLUE}4. Monitor Execution:${NC}"
echo -e "   ${GREEN}# View orchestrator logs${NC}"
echo -e "   gcloud compute ssh sengol-crawler-orchestrator --zone=us-central1-a \\"
echo -e "     --command='sudo journalctl -u sengol-orchestrator -f'"

echo -e "\n${BLUE}5. Check Database:${NC}"
echo -e "   ${GREEN}# View crawler executions${NC}"
echo -e "   psql \"\$DATABASE_URL\" -c \"SELECT * FROM crawler_executions ORDER BY started_at DESC LIMIT 10;\""

echo -e "\n${YELLOW}Documentation:${NC}"
echo -e "  • Architecture: docs/crawlers/GCE_IMPLEMENTATION_PLAN.md"
echo -e "  • Deployment: docs/crawlers/GCE_DEPLOYMENT_README.md"
echo -e "  • Quick Ref: docs/crawlers/QUICK_REFERENCE.md"

echo -e "\n${YELLOW}Cost Monitoring:${NC}"
echo -e "  • Set budget alert: gcloud billing budgets create --budget-amount=150USD"
echo -e "  • View costs: https://console.cloud.google.com/billing"

echo -e "\n${GREEN}Deployment successful! System is now running autonomously.${NC}"
echo -e "${BLUE}Expected monthly cost: ~$96 (69% reduction from baseline $236)${NC}\n"
