#!/bin/bash

# Setup Vertex AI Search and Grounding

set -e

# Configuration
PROJECT_ID="sengolvertexapi"
LOCATION="us-central1"
BUCKET_NAME="sengol-incidents"
DATASTORE_ID="sengol-incidents-datastore"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================================${NC}"
echo -e "${BLUE}   Vertex AI Search & Grounding Setup${NC}"
echo -e "${BLUE}================================================${NC}"
echo ""

print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Set project
gcloud config set project $PROJECT_ID

# Enable Vertex AI Search API
print_info "Enabling Vertex AI Search API..."
gcloud services enable discoveryengine.googleapis.com --project=$PROJECT_ID
print_status "Vertex AI Search API enabled"

# Note: Data Store creation requires manual steps in Console
echo ""
echo -e "${YELLOW}Manual Steps Required:${NC}"
echo ""
echo "1. Go to Vertex AI Search Console:"
echo "   https://console.cloud.google.com/gen-app-builder/engines?project=$PROJECT_ID"
echo ""
echo "2. Click 'Create App'"
echo "   - App name: sengol-incidents-search"
echo "   - Type: Search"
echo "   - Content: Unstructured documents"
echo ""
echo "3. Create Data Store:"
echo "   - Data store name: $DATASTORE_ID"
echo "   - Data source: Cloud Storage"
echo "   - Bucket: gs://$BUCKET_NAME/incidents/embeddings/"
echo "   - Import type: JSONL with embeddings"
echo ""
echo "4. Configure grounding:"
echo "   - Enable 'Use as grounding source'"
echo "   - Confidence threshold: 0.7"
echo ""
echo "5. Wait for indexing to complete (may take 30-60 minutes)"
echo ""
echo -e "${GREEN}After setup:${NC}"
echo "  - Data store will automatically index new files in gs://$BUCKET_NAME/incidents/embeddings/"
echo "  - Vertex AI will use this for grounded generation"
echo "  - API will use searchByText() to query the data store"
echo ""
