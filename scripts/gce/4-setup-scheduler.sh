#!/bin/bash

# Cloud Scheduler Setup Script
# Creates scheduled jobs for automated crawler execution

set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
ZONE="us-central1-a"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setting up Cloud Scheduler Jobs${NC}"
echo -e "${GREEN}========================================${NC}"

# Set project
gcloud config set project $PROJECT_ID

# Get orchestrator internal IP (for HTTP target)
ORCHESTRATOR_IP=$(gcloud compute instances describe sengol-crawler-orchestrator \
  --zone=$ZONE \
  --format="value(networkInterfaces[0].networkIP)")

echo -e "\n${YELLOW}Orchestrator IP: ${ORCHESTRATOR_IP}${NC}"

# Job 1: High-priority regulatory crawlers - Every 6 hours
echo -e "\n${YELLOW}Creating job: regulatory-crawlers-6h${NC}"
gcloud scheduler jobs create http regulatory-crawlers-6h \
  --location=$REGION \
  --schedule="0 */6 * * *" \
  --time-zone="UTC" \
  --uri="http://${ORCHESTRATOR_IP}:3000/api/orchestrator/execute" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "category": "regulatory",
    "priority": 4
  }' \
  --description="Execute high-priority regulatory crawlers every 6 hours" \
  2>/dev/null || echo "Job regulatory-crawlers-6h already exists"

# Job 2: All enabled crawlers - Daily at 2 AM UTC
echo -e "${YELLOW}Creating job: all-crawlers-daily${NC}"
gcloud scheduler jobs create http all-crawlers-daily \
  --location=$REGION \
  --schedule="0 2 * * *" \
  --time-zone="UTC" \
  --uri="http://${ORCHESTRATOR_IP}:3000/api/orchestrator/execute" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{}' \
  --description="Execute all enabled crawlers daily at 2 AM UTC" \
  2>/dev/null || echo "Job all-crawlers-daily already exists"

# Job 3: News crawlers - Every 4 hours
echo -e "${YELLOW}Creating job: news-crawlers-4h${NC}"
gcloud scheduler jobs create http news-crawlers-4h \
  --location=$REGION \
  --schedule="0 */4 * * *" \
  --time-zone="UTC" \
  --uri="http://${ORCHESTRATOR_IP}:3000/api/orchestrator/execute" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "category": "news"
  }' \
  --description="Execute news crawlers every 4 hours" \
  2>/dev/null || echo "Job news-crawlers-4h already exists"

# Job 4: Auto-discovery - Weekly on Sundays at 3 AM UTC
echo -e "${YELLOW}Creating job: auto-discovery-weekly${NC}"
gcloud scheduler jobs create http auto-discovery-weekly \
  --location=$REGION \
  --schedule="0 3 * * 0" \
  --time-zone="UTC" \
  --uri="http://${ORCHESTRATOR_IP}:3000/api/discovery/discover" \
  --http-method=POST \
  --headers="Content-Type=application/json" \
  --message-body='{
    "domains": [
      "https://www.aiaaic.org",
      "https://incidentdatabase.ai",
      "https://avidml.org",
      "https://algorithmwatch.org",
      "https://www.eff.org",
      "https://www.oecd.ai",
      "https://www.ftc.gov",
      "https://www.federalregister.gov",
      "https://eur-lex.europa.eu"
    ]
  }' \
  --description="Run auto-discovery engine weekly on Sundays" \
  2>/dev/null || echo "Job auto-discovery-weekly already exists"

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Cloud Scheduler Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Created Jobs:${NC}"
gcloud scheduler jobs list --location=$REGION --format="table(name,schedule,state)"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "  1. Test a job manually: ${GREEN}gcloud scheduler jobs run regulatory-crawlers-6h --location=$REGION${NC}"
echo -e "  2. Monitor executions in orchestrator logs"
echo -e "  3. Check crawler_executions table in database"

echo -e "\n${GREEN}Done!${NC}"
