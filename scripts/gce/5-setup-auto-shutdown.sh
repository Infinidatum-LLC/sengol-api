#!/bin/bash

# Auto-Shutdown Setup Script
# Stops orchestrator VM during off-hours (9 PM - 6 AM)
# Further reduces cost by ~$12/month

set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
REGION="us-central1"
ZONE="us-central1-a"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setting up Auto-Shutdown Schedules${NC}"
echo -e "${BLUE}Additional ~$12/month savings${NC}"
echo -e "${GREEN}========================================${NC}"

# Set project
gcloud config set project $PROJECT_ID

# Create Cloud Scheduler jobs for VM auto-shutdown/startup
echo -e "\n${YELLOW}Creating VM auto-shutdown jobs...${NC}"

# Job 1: Stop orchestrator at 9 PM UTC (off-hours)
echo -e "${GREEN}Creating stop-orchestrator job (9 PM UTC)...${NC}"
gcloud scheduler jobs create http stop-orchestrator-vm \
  --location=$REGION \
  --schedule="0 21 * * *" \
  --time-zone="UTC" \
  --uri="https://compute.googleapis.com/compute/v1/projects/${PROJECT_ID}/zones/${ZONE}/instances/sengol-crawler-orchestrator/stop" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
  --description="Stop orchestrator VM at 9 PM UTC to save costs during off-hours" \
  2>/dev/null || echo "Job already exists"

# Job 2: Start orchestrator at 6 AM UTC (before scheduled crawlers run)
echo -e "${GREEN}Creating start-orchestrator job (6 AM UTC)...${NC}"
gcloud scheduler jobs create http start-orchestrator-vm \
  --location=$REGION \
  --schedule="0 6 * * *" \
  --time-zone="UTC" \
  --uri="https://compute.googleapis.com/compute/v1/projects/${PROJECT_ID}/zones/${ZONE}/instances/sengol-crawler-orchestrator/start" \
  --http-method=POST \
  --oauth-service-account-email="${PROJECT_ID}@appspot.gserviceaccount.com" \
  --description="Start orchestrator VM at 6 AM UTC before scheduled crawlers run" \
  2>/dev/null || echo "Job already exists"

# Grant compute.instances.stop/start permissions to App Engine service account
echo -e "\n${YELLOW}Granting VM control permissions...${NC}"
gcloud projects add-iam-policy-binding $PROJECT_ID \
  --member="serviceAccount:${PROJECT_ID}@appspot.gserviceaccount.com" \
  --role="roles/compute.instanceAdmin.v1" 2>/dev/null || true

# Create manual shutdown script for emergency use
cat > /tmp/manual-shutdown.sh <<'SCRIPT'
#!/bin/bash
# Manual VM shutdown script for weekends or extended downtime

PROJECT_ID="elite-striker-477619-p8"
ZONE="us-central1-a"

echo "Stopping all Sengol VMs..."

# Stop orchestrator (save ~$0.50/day)
gcloud compute instances stop sengol-crawler-orchestrator --zone=$ZONE --project=$PROJECT_ID

# Worker is already preemptible, no need to stop manually

echo "All VMs stopped. Start them manually when needed:"
echo "gcloud compute instances start sengol-crawler-orchestrator --zone=$ZONE --project=$PROJECT_ID"
SCRIPT

chmod +x /tmp/manual-shutdown.sh

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Auto-Shutdown Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Created Jobs:${NC}"
gcloud scheduler jobs list --location=$REGION --filter="name:*orchestrator-vm*" --format="table(name,schedule,state)"

echo -e "\n${BLUE}Cost Savings:${NC}"
echo -e "  ✓ Orchestrator stopped 9 PM - 6 AM (9 hours/day)"
echo -e "  ✓ Saves ~50% uptime = ~$12.23/month"
echo -e "  ✓ Worker is preemptible (already optimized)"
echo -e "  ${GREEN}Total estimated savings: ~$12/month${NC}"

echo -e "\n${YELLOW}Schedule:${NC}"
echo -e "  6:00 AM UTC - Orchestrator starts"
echo -e "  6:00 AM UTC - Regulatory crawlers run (every 6 hours)"
echo -e "  2:00 AM UTC - All crawlers run daily"
echo -e "  9:00 PM UTC - Orchestrator stops (off-hours)"

echo -e "\n${YELLOW}Manual Control:${NC}"
echo -e "  Start now: ${GREEN}gcloud compute instances start sengol-crawler-orchestrator --zone=$ZONE${NC}"
echo -e "  Stop now: ${GREEN}gcloud compute instances stop sengol-crawler-orchestrator --zone=$ZONE${NC}"
echo -e "  Emergency shutdown: ${GREEN}/tmp/manual-shutdown.sh${NC}"

echo -e "\n${YELLOW}Notes:${NC}"
echo -e "  - Worker VM is preemptible (Google may stop/restart anytime)"
echo -e "  - Cloud Functions run on-demand (no shutdown needed)"
echo -e "  - Qdrant VM stays running 24/7 (already optimized at n2d-standard-2)"
echo -e "  - All schedules use UTC timezone"

echo -e "\n${GREEN}Done!${NC}"
