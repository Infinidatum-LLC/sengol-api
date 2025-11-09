#!/bin/bash

# Update Vercel Environment Variables for Vertex AI

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Update Vercel Environment Variables${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

# Check if sengol-api-key-base64.txt exists
if [ ! -f "sengol-api-key-base64.txt" ]; then
    echo -e "${YELLOW}Error: sengol-api-key-base64.txt not found${NC}"
    echo "Please run ./scripts/setup-vertex-ai-infrastructure.sh first"
    exit 1
fi

echo -e "${YELLOW}This script will help you update Vercel environment variables.${NC}"
echo ""
echo "Follow the prompts to add each variable."
echo ""

# Function to add environment variable
add_env_var() {
    local var_name=$1
    local var_value=$2

    echo -e "${GREEN}Adding $var_name...${NC}"
    echo "$var_value" | vercel env add $var_name production --force
}

# Add GOOGLE_CLOUD_PROJECT
echo ""
echo -e "${YELLOW}[1/4] Adding GOOGLE_CLOUD_PROJECT${NC}"
add_env_var "GOOGLE_CLOUD_PROJECT" "sengolvertexapi"

# Add VERTEX_AI_LOCATION
echo ""
echo -e "${YELLOW}[2/4] Adding VERTEX_AI_LOCATION${NC}"
add_env_var "VERTEX_AI_LOCATION" "us-central1"

# Add GCS_BUCKET_NAME
echo ""
echo -e "${YELLOW}[3/4] Adding GCS_BUCKET_NAME${NC}"
add_env_var "GCS_BUCKET_NAME" "sengol-incidents"

# Add GOOGLE_APPLICATION_CREDENTIALS_JSON
echo ""
echo -e "${YELLOW}[4/4] Adding GOOGLE_APPLICATION_CREDENTIALS_JSON${NC}"
echo "Reading from sengol-api-key-base64.txt..."
CREDS=$(cat sengol-api-key-base64.txt)
add_env_var "GOOGLE_APPLICATION_CREDENTIALS_JSON" "$CREDS"

# Remove deprecated variables
echo ""
echo -e "${YELLOW}Removing deprecated d-vecDB variables...${NC}"

vercel env rm DVECDB_HOST production --yes 2>/dev/null || echo "  DVECDB_HOST not found (already removed)"
vercel env rm DVECDB_PORT production --yes 2>/dev/null || echo "  DVECDB_PORT not found (already removed)"
vercel env rm DVECDB_COLLECTION production --yes 2>/dev/null || echo "  DVECDB_COLLECTION not found (already removed)"

echo ""
echo -e "${GREEN}================================================${NC}"
echo -e "${GREEN}   Environment Variables Updated!${NC}"
echo -e "${GREEN}================================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify variables: ${YELLOW}vercel env ls${NC}"
echo "  2. Deploy to production: ${YELLOW}vercel --prod${NC}"
echo ""
