#!/usr/bin/env python3
"""
Parallel Async Vertex AI Matching Engine Index Creation

This script creates a Vertex AI Vector Search (Matching Engine) index using
asynchronous operations for fast setup. Similar to the d-vecDB approach.

Usage:
    python3 scripts/create-matching-engine-index.py

Expected time: 20-40 minutes for index creation
Expected latency after deployment: <50ms per query
"""

import asyncio
import json
import os
import time
from datetime import datetime
from typing import Dict, List, Optional

from google.cloud import aiplatform
from google.cloud.aiplatform import matching_engine

# Configuration
PROJECT_ID = "sengolvertexapi"
REGION = "us-central1"
INDEX_DISPLAY_NAME = "sengol-incident-embeddings"
INDEX_DESCRIPTION = "Incident embeddings for semantic search (text-embedding-004, 768d)"
EMBEDDINGS_GCS_PATH = "gs://sengol-incidents/incidents/embeddings/matching-engine-full/"
EMBEDDING_DIMENSION = 768

# Initialize AI Platform
aiplatform.init(project=PROJECT_ID, location=REGION)


async def create_index_async() -> matching_engine.MatchingEngineIndex:
    """
    Create a Vertex AI Matching Engine index asynchronously.

    This uses Tree-AH algorithm with DOT_PRODUCT distance for fast semantic search.

    Returns:
        The created MatchingEngineIndex resource
    """
    print("=" * 60)
    print("Creating Vertex AI Matching Engine Index")
    print("=" * 60)
    print(f"Project: {PROJECT_ID}")
    print(f"Region: {REGION}")
    print(f"Embeddings: {EMBEDDINGS_GCS_PATH}")
    print(f"Dimensions: {EMBEDDING_DIMENSION}")
    print("=" * 60)
    print()

    # Index configuration with Tree-AH algorithm
    index_config = {
        "dimensions": EMBEDDING_DIMENSION,
        "approximate_neighbors_count": 100,
        "distance_measure_type": "DOT_PRODUCT_DISTANCE",
        "algorithm_config": {
            "tree_ah_config": {
                "leaf_node_embedding_count": 500,
                "leaf_nodes_to_search_percent": 7,
            }
        },
    }

    print(f"[{datetime.now().strftime('%H:%M:%S')}] Creating index...")
    print(f"Index config: {json.dumps(index_config, indent=2)}")
    print()

    # Create the index
    # This operation is long-running (20-40 minutes)
    index = matching_engine.MatchingEngineIndex.create_tree_ah_index(
        display_name=INDEX_DISPLAY_NAME,
        contents_delta_uri=EMBEDDINGS_GCS_PATH,
        dimensions=EMBEDDING_DIMENSION,
        approximate_neighbors_count=100,
        distance_measure_type="DOT_PRODUCT_DISTANCE",
        leaf_node_embedding_count=500,
        leaf_nodes_to_search_percent=7,
        description=INDEX_DESCRIPTION,
    )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Index created!")
    print(f"Index resource name: {index.resource_name}")
    print()

    return index


async def create_index_endpoint_async() -> matching_engine.MatchingEngineIndexEndpoint:
    """
    Create an index endpoint for serving queries.

    Returns:
        The created MatchingEngineIndexEndpoint resource
    """
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Creating index endpoint...")

    endpoint = matching_engine.MatchingEngineIndexEndpoint.create(
        display_name="sengol-incidents-endpoint",
        description="Public endpoint for incident vector search",
        public_endpoint_enabled=True,
    )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Endpoint created!")
    print(f"Endpoint resource name: {endpoint.resource_name}")
    print()

    return endpoint


async def deploy_index_async(
    index: matching_engine.MatchingEngineIndex,
    endpoint: matching_engine.MatchingEngineIndexEndpoint,
) -> None:
    """
    Deploy the index to the endpoint.

    Args:
        index: The MatchingEngineIndex to deploy
        endpoint: The MatchingEngineIndexEndpoint to deploy to
    """
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Deploying index to endpoint...")
    print("This will take 10-20 minutes...")
    print()

    deployed_index_id = f"deployed_{INDEX_DISPLAY_NAME}_{int(time.time())}"

    # Deploy with autoscaling
    endpoint.deploy_index(
        index=index,
        deployed_index_id=deployed_index_id,
        display_name=INDEX_DISPLAY_NAME,
        machine_type="n1-standard-2",
        min_replica_count=1,
        max_replica_count=2,
    )

    print(f"[{datetime.now().strftime('%H:%M:%S')}] ✅ Index deployed successfully!")
    print(f"Deployed index ID: {deployed_index_id}")
    print()

    return deployed_index_id


async def setup_matching_engine() -> Dict[str, str]:
    """
    Complete setup: Create index, endpoint, and deploy.

    Returns:
        Dictionary with configuration values for .env file
    """
    start_time = time.time()

    # Run index creation and endpoint creation in parallel
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Starting parallel setup...")
    print("- Creating index (20-40 minutes)")
    print("- Creating endpoint (2-5 minutes)")
    print()

    # Note: We create index first, then endpoint, then deploy
    # This is because index creation is the longest operation
    index = await create_index_async()
    endpoint = await create_index_endpoint_async()
    deployed_index_id = await deploy_index_async(index, endpoint)

    # Extract configuration
    config = {
        "VECTOR_SEARCH_INDEX_ID": index.resource_name.split("/")[-1],
        "VECTOR_SEARCH_ENDPOINT_ID": endpoint.resource_name.split("/")[-1],
        "VECTOR_SEARCH_DEPLOYED_INDEX_ID": deployed_index_id,
        "VECTOR_SEARCH_ENDPOINT_DOMAIN": endpoint.public_endpoint_domain_name or "",
    }

    elapsed_time = time.time() - start_time
    print()
    print("=" * 60)
    print("✅ Vertex AI Matching Engine Setup Complete!")
    print("=" * 60)
    print(f"Total time: {elapsed_time / 60:.1f} minutes")
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
        config = await setup_matching_engine()

        # Save config to file
        config_file = "/tmp/matching-engine-config.json"
        with open(config_file, "w") as f:
            json.dump(config, f, indent=2)

        print(f"Configuration saved to: {config_file}")

    except Exception as e:
        print(f"❌ Error during setup: {e}")
        import traceback
        traceback.print_exc()
        exit(1)


if __name__ == "__main__":
    # Run the async setup
    asyncio.run(main())
