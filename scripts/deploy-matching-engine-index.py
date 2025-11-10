#!/usr/bin/env python3
"""
Deploy Existing Vertex AI Matching Engine Index to Endpoint

This script deploys an already-created index to an already-created endpoint.
Used when the full setup script failed at the deployment step.

Usage:
    python3 scripts/deploy-matching-engine-index.py

Expected time: 10-20 minutes for deployment
"""

import asyncio
import json
import time
from datetime import datetime

from google.cloud import aiplatform
from google.cloud.aiplatform import matching_engine

# Configuration
PROJECT_ID = "sengolvertexapi"
REGION = "us-central1"

# Existing resources (from previous run)
INDEX_ID = "9140488651329765376"
ENDPOINT_ID = "8442474689552449536"

# Fixed deployed index ID format
# Must start with a letter and contain only letters, numbers, and underscores
DEPLOYED_INDEX_ID = f"sengol_incident_embeddings_{int(time.time())}"

# Initialize AI Platform
aiplatform.init(project=PROJECT_ID, location=REGION)


async def deploy_index() -> dict:
    """
    Deploy the index to the endpoint.

    Returns:
        Dictionary with configuration values for .env file
    """
    print("=" * 60)
    print("Deploying Vertex AI Matching Engine Index")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Region: {REGION}")
    print(f"Index ID: {INDEX_ID}")
    print(f"Endpoint ID: {ENDPOINT_ID}")
    print(f"Deployed Index ID: {DEPLOYED_INDEX_ID}")
    print("=" * 60)
    print()

    # Get existing resources
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Loading existing index and endpoint...")

    index = matching_engine.MatchingEngineIndex(
        index_name=f"projects/{PROJECT_ID}/locations/{REGION}/indexes/{INDEX_ID}"
    )

    endpoint = matching_engine.MatchingEngineIndexEndpoint(
        index_endpoint_name=f"projects/{PROJECT_ID}/locations/{REGION}/indexEndpoints/{ENDPOINT_ID}"
    )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Resources loaded")
    print()

    # Deploy the index
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Deploying index to endpoint...")
    print("This will take 10-20 minutes...")
    print()

    # For SHARD_SIZE_MEDIUM (50K-100K vectors), we need n1-standard-16 or larger
    # See: https://cloud.google.com/vertex-ai/docs/matching-engine/deploy-index-public
    endpoint.deploy_index(
        index=index,
        deployed_index_id=DEPLOYED_INDEX_ID,
        display_name="sengol-incident-embeddings",
        machine_type="n1-standard-16",  # Required for SHARD_SIZE_MEDIUM
        min_replica_count=1,
        max_replica_count=2,
    )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Index deployed successfully!")
    print()

    # Get endpoint details
    endpoint_domain = endpoint.public_endpoint_domain_name or ""

    # Prepare configuration
    config = {
        "VECTOR_SEARCH_INDEX_ID": INDEX_ID,
        "VECTOR_SEARCH_ENDPOINT_ID": ENDPOINT_ID,
        "VECTOR_SEARCH_DEPLOYED_INDEX_ID": DEPLOYED_INDEX_ID,
        "VECTOR_SEARCH_ENDPOINT_DOMAIN": endpoint_domain,
    }

    print()
    print("=" * 60)
    print("✅ Vertex AI Matching Engine Deployment Complete!")
    print("=" * 60)
    print()
    print("Configuration for .env file:")
    print("-" * 60)
    for key, value in config.items():
        print(f"{key}={value}")
    print("-" * 60)
    print()
    print("Expected query latency: 20-50ms")
    print("Cost estimate: ~$50-100/month")
    print()
    print("=" * 60)

    return config


async def main():
    """Main entry point"""
    try:
        config = await deploy_index()

        # Save config to file
        config_file = "/tmp/matching-engine-config.json"
        with open(config_file, "w") as f:
            json.dump(config, f, indent=2)

        print(f"Configuration saved to: {config_file}")

    except Exception as e:
        print(f"❌ Error during deployment: {e}")
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == "__main__":
    # Run the async deployment
    asyncio.run(main())
