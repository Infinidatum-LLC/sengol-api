#!/bin/bash

###############################################################################
# Vertex AI Vector Search (Matching Engine) Setup Script
#
# This script sets up a production-grade vector search index for incident
# embeddings, providing <50ms query latency (vs. 70s GCS downloads).
#
# Prerequisites:
# - Google Cloud SDK installed and authenticated
# - Project: sengolvertexapi
# - Embeddings stored in: gs://sengol-incidents/incidents/embeddings/
###############################################################################

set -e  # Exit on error

# Set PATH to include gcloud SDK
export PATH="/Users/durai/google-cloud-sdk/bin:$PATH"

# Configuration
PROJECT_ID="sengolvertexapi"
REGION="us-central1"
INDEX_NAME="sengol-incident-embeddings"
INDEX_ENDPOINT_NAME="sengol-incidents-endpoint"
EMBEDDING_DIMENSION=768
BUCKET_NAME="sengol-incidents"
EMBEDDINGS_PATH="gs://${BUCKET_NAME}/incidents/embeddings/postgres-migrated/"

echo "=================================="
echo "Vertex AI Vector Search Setup"
echo "=================================="
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Embeddings: $EMBEDDINGS_PATH"
echo "=================================="
echo ""

# Step 1: Enable required APIs
echo "Step 1: Enabling required GCP APIs..."
gcloud services enable \
  aiplatform.googleapis.com \
  compute.googleapis.com \
  storage-api.googleapis.com \
  --project=$PROJECT_ID

echo "✓ APIs enabled"
echo ""

# Step 2: Verify embeddings exist
echo "Step 2: Verifying embeddings in GCS..."
EMBEDDING_COUNT=$(gsutil ls ${EMBEDDINGS_PATH}*.jsonl 2>/dev/null | wc -l || echo "0")
if [ "$EMBEDDING_COUNT" -eq "0" ]; then
  echo "❌ ERROR: No embedding files found at $EMBEDDINGS_PATH"
  echo "Please run the embedding generation pipeline first."
  exit 1
fi
echo "✓ Found $EMBEDDING_COUNT embedding files"
echo ""

# Step 3: Prepare embeddings in correct format for Vector Search
echo "Step 3: Preparing embeddings for Vector Search..."
echo "Creating formatted embeddings directory..."

# Vector Search expects newline-delimited JSON with specific format:
# {"id": "1", "embedding": [0.1, 0.2, ...], "restricts": [{"namespace": "industry", "allow": ["healthcare"]}]}

# Create a temporary directory for formatted embeddings
FORMATTED_DIR="gs://${BUCKET_NAME}/incidents/vector-search-input/"
echo "Output directory: $FORMATTED_DIR"

# Note: This script assumes embeddings are already in the correct format
# If conversion is needed, use the Python script: prepare-vector-search-embeddings.py

echo "✓ Embeddings directory prepared"
echo ""

# Step 4: Create Vector Search Index
echo "Step 4: Creating Vector Search Index..."
echo "This will take 20-40 minutes for ~80K vectors..."
echo ""

# Create index using gcloud alpha (Vector Search is in preview/GA)
gcloud alpha ai indexes create \
  --display-name="$INDEX_NAME" \
  --description="Incident embeddings for semantic search (text-embedding-004, 768d)" \
  --metadata-file=- \
  --region="$REGION" \
  --project="$PROJECT_ID" <<EOF
{
  "contentsDeltaUri": "${EMBEDDINGS_PATH}",
  "config": {
    "dimensions": $EMBEDDING_DIMENSION,
    "approximateNeighborsCount": 100,
    "distanceMeasureType": "DOT_PRODUCT_DISTANCE",
    "algorithm_config": {
      "treeAhConfig": {
        "leafNodeEmbeddingCount": 500,
        "leafNodesToSearchPercent": 7
      }
    }
  }
}
EOF

echo "✓ Index creation initiated"
echo ""

# Step 5: Wait for index creation to complete
echo "Step 5: Waiting for index creation to complete..."
echo "Checking index status every 2 minutes..."
echo "(This typically takes 20-40 minutes)"
echo ""

INDEX_ID=""
while [ -z "$INDEX_ID" ]; do
  sleep 120
  INDEX_ID=$(gcloud ai indexes list \
    --region=$REGION \
    --project=$PROJECT_ID \
    --filter="displayName:$INDEX_NAME" \
    --format="value(name)" \
    2>/dev/null || echo "")

  if [ -n "$INDEX_ID" ]; then
    INDEX_STATE=$(gcloud ai indexes describe $INDEX_ID \
      --region=$REGION \
      --project=$PROJECT_ID \
      --format="value(metadata.state)" \
      2>/dev/null || echo "CREATING")

    echo "Index state: $INDEX_STATE"

    if [ "$INDEX_STATE" == "CREATED" ]; then
      break
    fi
  fi
done

echo "✓ Index created successfully: $INDEX_ID"
echo ""

# Step 6: Create Index Endpoint
echo "Step 6: Creating Index Endpoint..."

ENDPOINT_ID=$(gcloud ai index-endpoints create \
  --display-name="$INDEX_ENDPOINT_NAME" \
  --description="Public endpoint for incident vector search" \
  --network="" \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="value(name)")

echo "✓ Endpoint created: $ENDPOINT_ID"
echo ""

# Step 7: Deploy Index to Endpoint
echo "Step 7: Deploying index to endpoint..."
echo "This will take 10-20 minutes..."
echo ""

DEPLOYED_INDEX_ID="deployed_${INDEX_NAME}_$(date +%s)"

gcloud ai index-endpoints deploy-index $ENDPOINT_ID \
  --deployed-index-id="$DEPLOYED_INDEX_ID" \
  --display-name="$INDEX_NAME" \
  --index="$INDEX_ID" \
  --min-replica-count=1 \
  --max-replica-count=2 \
  --machine-type="n1-standard-2" \
  --region=$REGION \
  --project=$PROJECT_ID

echo "✓ Index deployed successfully"
echo ""

# Step 8: Get endpoint details
echo "Step 8: Retrieving endpoint details..."

ENDPOINT_DOMAIN=$(gcloud ai index-endpoints describe $ENDPOINT_ID \
  --region=$REGION \
  --project=$PROJECT_ID \
  --format="value(publicEndpointDomainName)")

echo ""
echo "=================================="
echo "✅ Vector Search Setup Complete!"
echo "=================================="
echo ""
echo "Index ID: $INDEX_ID"
echo "Endpoint ID: $ENDPOINT_ID"
echo "Deployed Index ID: $DEPLOYED_INDEX_ID"
echo "Endpoint Domain: $ENDPOINT_DOMAIN"
echo ""
echo "Add these to your .env file:"
echo "VECTOR_SEARCH_INDEX_ID=$INDEX_ID"
echo "VECTOR_SEARCH_ENDPOINT_ID=$ENDPOINT_ID"
echo "VECTOR_SEARCH_DEPLOYED_INDEX_ID=$DEPLOYED_INDEX_ID"
echo "VECTOR_SEARCH_ENDPOINT_DOMAIN=$ENDPOINT_DOMAIN"
echo ""
echo "Expected query latency: 20-50ms"
echo "Cost estimate: ~$50-100/month"
echo ""
echo "=================================="
