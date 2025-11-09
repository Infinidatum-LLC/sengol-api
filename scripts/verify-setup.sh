#!/bin/bash
#
# Sengol API - Setup Verification Script
#
# This script verifies that the entire Vertex AI migration is working correctly:
# - Google Cloud infrastructure
# - Crawler deployment
# - Cron jobs
# - Cloud Storage data
# - Vercel deployment
#
# Usage: ./scripts/verify-setup.sh
#

set -e

# Add gcloud to PATH
export PATH="/Users/durai/google-cloud-sdk/bin:$PATH"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="sengolvertexapi"
ZONE="us-central1-a"
INSTANCE_NAME="sengol-crawler"
BUCKET_NAME="sengol-incidents"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}  Sengol API - Vertex AI Migration Verification${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Counter for issues
ISSUES=0
WARNINGS=0

# Helper functions
check_ok() {
    echo -e "${GREEN}✓${NC} $1"
}

check_warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

check_fail() {
    echo -e "${RED}✗${NC} $1"
    ((ISSUES++))
}

section() {
    echo ""
    echo -e "${BLUE}━━━ $1${NC}"
}

# =============================================================================
# 1. Google Cloud Infrastructure
# =============================================================================

section "1. Google Cloud Infrastructure"

# Check gcloud is installed
if command -v gcloud &> /dev/null; then
    check_ok "gcloud CLI installed"
else
    check_fail "gcloud CLI not found - install from https://cloud.google.com/sdk"
    exit 1
fi

# Check project
CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
if [ "$CURRENT_PROJECT" = "$PROJECT_ID" ]; then
    check_ok "Project: $PROJECT_ID"
else
    check_warn "Current project: $CURRENT_PROJECT (expected: $PROJECT_ID)"
fi

# Check bucket exists
if gsutil ls gs://$BUCKET_NAME &> /dev/null; then
    check_ok "Cloud Storage bucket: gs://$BUCKET_NAME"

    # Check bucket contents
    RAW_COUNT=$(gsutil ls gs://$BUCKET_NAME/incidents/raw/**/*.jsonl 2>/dev/null | wc -l || echo "0")
    EMBED_COUNT=$(gsutil ls gs://$BUCKET_NAME/incidents/embeddings/**/*.jsonl 2>/dev/null | wc -l || echo "0")

    if [ "$RAW_COUNT" -gt 0 ]; then
        check_ok "Raw incident files: $RAW_COUNT"
    else
        check_warn "No raw incident files found (crawler hasn't run yet)"
    fi

    if [ "$EMBED_COUNT" -gt 0 ]; then
        check_ok "Embedding files: $EMBED_COUNT"
    else
        check_warn "No embedding files found (pipeline hasn't run yet)"
    fi
else
    check_fail "Bucket gs://$BUCKET_NAME not found"
fi

# Check instance exists
if gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID &> /dev/null; then
    check_ok "Compute instance: $INSTANCE_NAME"

    # Check instance is running
    STATUS=$(gcloud compute instances describe $INSTANCE_NAME --zone=$ZONE --project=$PROJECT_ID --format="value(status)")
    if [ "$STATUS" = "RUNNING" ]; then
        check_ok "Instance status: RUNNING"
    else
        check_warn "Instance status: $STATUS (should be RUNNING)"
    fi
else
    check_fail "Instance $INSTANCE_NAME not found"
fi

# Check Cloud NAT exists
if gcloud compute routers describe sengol-router --region=us-central1 --project=$PROJECT_ID &> /dev/null; then
    check_ok "Cloud Router: sengol-router"
else
    check_warn "Cloud Router not found (instance may not have internet access)"
fi

# Check Workload Identity Pool
if gcloud iam workload-identity-pools describe vercel-pool --location=global --project=$PROJECT_ID &> /dev/null; then
    check_ok "Workload Identity Pool: vercel-pool"
else
    check_warn "Workload Identity Pool not found (Vercel may not authenticate)"
fi

# =============================================================================
# 2. Crawler Deployment
# =============================================================================

section "2. Crawler Deployment"

# SSH and check files
echo "Checking crawler instance files..."
CRAWLER_CHECK=$(gcloud compute ssh $INSTANCE_NAME --tunnel-through-iap --zone=$ZONE --project=$PROJECT_ID --command='
if [ -f /opt/sengol-crawler/crawler.py ]; then echo "crawler:ok"; else echo "crawler:missing"; fi
if [ -f /opt/sengol-crawler/embedding-pipeline.py ]; then echo "embedding:ok"; else echo "embedding:missing"; fi
if [ -d /opt/sengol-crawler/venv ]; then echo "venv:ok"; else echo "venv:missing"; fi
if [ -f /etc/systemd/system/sengol-crawler.service ]; then echo "service1:ok"; else echo "service1:missing"; fi
if [ -f /etc/systemd/system/sengol-embedding.service ]; then echo "service2:ok"; else echo "service2:missing"; fi
' 2>/dev/null)

if echo "$CRAWLER_CHECK" | grep -q "crawler:ok"; then
    check_ok "crawler.py deployed"
else
    check_fail "crawler.py missing"
fi

if echo "$CRAWLER_CHECK" | grep -q "embedding:ok"; then
    check_ok "embedding-pipeline.py deployed"
else
    check_fail "embedding-pipeline.py missing"
fi

if echo "$CRAWLER_CHECK" | grep -q "venv:ok"; then
    check_ok "Python virtual environment created"
else
    check_fail "Python venv missing"
fi

if echo "$CRAWLER_CHECK" | grep -q "service1:ok"; then
    check_ok "systemd service: sengol-crawler.service"
else
    check_fail "sengol-crawler.service missing"
fi

if echo "$CRAWLER_CHECK" | grep -q "service2:ok"; then
    check_ok "systemd service: sengol-embedding.service"
else
    check_fail "sengol-embedding.service missing"
fi

# =============================================================================
# 3. Cron Jobs
# =============================================================================

section "3. Cron Jobs"

CRON_CHECK=$(gcloud compute ssh $INSTANCE_NAME --tunnel-through-iap --zone=$ZONE --project=$PROJECT_ID --command='sudo crontab -l 2>/dev/null || echo "no cron"' 2>/dev/null)

if echo "$CRON_CHECK" | grep -q "sengol-crawler.service"; then
    CRON_TIME=$(echo "$CRON_CHECK" | grep "sengol-crawler.service" | awk '{print $1, $2}')
    check_ok "Crawler cron job: $CRON_TIME (daily)"
else
    check_fail "Crawler cron job not found"
fi

if echo "$CRON_CHECK" | grep -q "sengol-embedding.service"; then
    CRON_TIME=$(echo "$CRON_CHECK" | grep "sengol-embedding.service" | awk '{print $1, $2}')
    check_ok "Embedding cron job: $CRON_TIME (daily)"
else
    check_fail "Embedding cron job not found"
fi

# =============================================================================
# 4. Backend Code
# =============================================================================

section "4. Backend Code"

# Check if vertex-ai-client.ts exists
if [ -f "src/lib/vertex-ai-client.ts" ]; then
    check_ok "Vertex AI client: src/lib/vertex-ai-client.ts"
else
    check_fail "Vertex AI client missing"
fi

# Check package.json has Google Cloud dependencies
if grep -q "@google-cloud/vertexai" package.json; then
    check_ok "Package.json includes @google-cloud/vertexai"
else
    check_fail "Missing @google-cloud/vertexai in package.json"
fi

# Check .env has required variables
if [ -f ".env" ]; then
    if grep -q "GOOGLE_CLOUD_PROJECT" .env; then
        check_ok ".env has GOOGLE_CLOUD_PROJECT"
    else
        check_warn ".env missing GOOGLE_CLOUD_PROJECT"
    fi

    if grep -q "GCS_BUCKET_NAME" .env; then
        check_ok ".env has GCS_BUCKET_NAME"
    else
        check_warn ".env missing GCS_BUCKET_NAME"
    fi
else
    check_warn ".env file not found"
fi

# Check if build works
if [ -d "dist" ]; then
    check_ok "TypeScript compiled (dist/ exists)"
else
    check_warn "TypeScript not compiled yet (run: npm run build)"
fi

# =============================================================================
# 5. Vercel Deployment
# =============================================================================

section "5. Vercel Deployment"

# Check vercel CLI
if command -v vercel &> /dev/null; then
    check_ok "Vercel CLI installed"

    # Check environment variables
    ENV_CHECK=$(vercel env ls 2>&1 || echo "error")

    if echo "$ENV_CHECK" | grep -q "GOOGLE_CLOUD_PROJECT"; then
        check_ok "Vercel env: GOOGLE_CLOUD_PROJECT"
    else
        check_warn "Vercel env: GOOGLE_CLOUD_PROJECT not set"
    fi

    if echo "$ENV_CHECK" | grep -q "GCS_BUCKET_NAME"; then
        check_ok "Vercel env: GCS_BUCKET_NAME"
    else
        check_warn "Vercel env: GCS_BUCKET_NAME not set"
    fi

    if echo "$ENV_CHECK" | grep -q "WORKLOAD_IDENTITY_PROVIDER"; then
        check_ok "Vercel env: WORKLOAD_IDENTITY_PROVIDER"
    else
        check_warn "Vercel env: WORKLOAD_IDENTITY_PROVIDER not set"
    fi
else
    check_warn "Vercel CLI not installed (install: npm i -g vercel)"
fi

# =============================================================================
# 6. Local Development
# =============================================================================

section "6. Local Development"

# Check if dev server is running
if curl -s http://localhost:4000/health &> /dev/null; then
    check_ok "Dev server running on port 4000"

    # Check health endpoint
    HEALTH=$(curl -s http://localhost:4000/health/detailed 2>/dev/null || echo "error")

    if echo "$HEALTH" | grep -q "vertexai"; then
        VERTEX_STATUS=$(echo "$HEALTH" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)
        if [ "$VERTEX_STATUS" = "ok" ]; then
            check_ok "Vertex AI health: ok"
        else
            check_warn "Vertex AI health: $VERTEX_STATUS"
        fi
    fi
else
    check_warn "Dev server not running (start: npm run dev)"
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BLUE}  Verification Summary${NC}"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ $ISSUES -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All checks passed! System is ready.${NC}"
    echo ""
    echo "Next steps:"
    echo "  1. Wait for tomorrow's cron jobs (2 AM, 3 AM)"
    echo "  2. Or manually run: gcloud compute ssh $INSTANCE_NAME --command='cd /opt/sengol-crawler && source venv/bin/activate && python3 crawler.py'"
    echo "  3. Remove Vercel deployment protection or configure custom domain"
    echo "  4. Test production API endpoints"
    exit 0
elif [ $ISSUES -eq 0 ]; then
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found. Review the items above.${NC}"
    echo ""
    echo "The system should work, but some optional features may not be configured."
    exit 0
else
    echo -e "${RED}✗ $ISSUES critical issue(s) found.${NC}"
    echo -e "${YELLOW}⚠ $WARNINGS warning(s) found.${NC}"
    echo ""
    echo "Please fix the critical issues before proceeding."
    echo "See MIGRATION_COMPLETE.md for troubleshooting steps."
    exit 1
fi
