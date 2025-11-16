#!/usr/bin/env python3
"""
Direct Qdrant VM-to-Cloud migration
Exports embeddings from self-hosted Qdrant directly to Qdrant Cloud without GCS intermediate
This job runs in Cloud Run with VPC access to reach the internal Qdrant VM
"""

import os
import sys
from datetime import datetime
from typing import List, Dict, Any
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct


def get_source_qdrant_client() -> QdrantClient:
    """Initialize client for self-hosted Qdrant instance"""
    qdrant_host = os.getenv("SOURCE_QDRANT_HOST", "10.128.0.2")
    qdrant_port = int(os.getenv("SOURCE_QDRANT_PORT", "6333"))
    url = f"http://{qdrant_host}:{qdrant_port}"
    print(f"[Migrate] Connecting to source Qdrant (self-hosted) at {url}")
    return QdrantClient(url=url)


def get_target_qdrant_client() -> QdrantClient:
    """Initialize client for Qdrant Cloud instance"""
    qdrant_host = os.getenv("TARGET_QDRANT_HOST")
    qdrant_api_key = os.getenv("TARGET_QDRANT_API_KEY")

    if not qdrant_host or not qdrant_api_key:
        raise ValueError("TARGET_QDRANT_HOST and TARGET_QDRANT_API_KEY must be set")

    url = f"https://{qdrant_host}"
    print(f"[Migrate] Connecting to target Qdrant (Cloud) at {url}")
    return QdrantClient(url=url, api_key=qdrant_api_key, timeout=60.0)


def ensure_collection_exists(client: QdrantClient, collection_name: str, vector_size: int):
    """Create collection if it doesn't exist"""
    try:
        client.get_collection(collection_name)
        print(f"[Migrate] Collection '{collection_name}' already exists on target")
    except Exception:
        print(f"[Migrate] Creating collection '{collection_name}' on target...")
        from qdrant_client.models import Distance, VectorParams
        client.recreate_collection(
            collection_name=collection_name,
            vectors_config=VectorParams(
                size=vector_size,
                distance=Distance.COSINE
            )
        )
        print(f"[Migrate] ✓ Collection created")


def migrate_collection(
    source_client: QdrantClient,
    target_client: QdrantClient,
    collection_name: str,
    batch_size: int = 100
) -> Dict[str, Any]:
    """Migrate all points from source to target Qdrant"""

    # Get source collection info
    print(f"[Migrate] Getting source collection info for '{collection_name}'...")
    source_collection_info = source_client.get_collection(collection_name)
    total_points = source_collection_info.points_count

    print(f"[Migrate] Source collection '{collection_name}' has {total_points} points")
    print(f"[Migrate] Vector size: {source_collection_info.config.params.vectors.size}")

    # Ensure target collection exists with same config
    vector_size = source_collection_info.config.params.vectors.size
    ensure_collection_exists(target_client, collection_name, vector_size)

    # Migrate all points in batches
    migrated_count = 0
    offset = 0
    start_time = datetime.utcnow()

    while offset < total_points:
        remaining = total_points - offset
        limit = min(batch_size, remaining)

        print(f"[Migrate] Fetching points {offset} to {offset + limit} from source...")

        # Fetch points from source
        response = source_client.scroll(
            collection_name,
            offset=offset,
            limit=limit,
            with_payload=True,
            with_vectors=True
        )

        points = response[0]

        if not points:
            break

        # Upload to target
        print(f"[Migrate] Uploading {len(points)} points to target...")
        upsert_points = [
            PointStruct(
                id=p.id,
                vector=p.vector,
                payload=p.payload
            )
            for p in points
        ]

        target_client.upsert(
            collection_name=collection_name,
            points=upsert_points
        )

        migrated_count += len(points)
        offset += limit

        # Progress indicator
        progress = min(100, round((migrated_count / total_points) * 100))
        elapsed = (datetime.utcnow() - start_time).total_seconds()
        rate = migrated_count / elapsed if elapsed > 0 else 0
        eta_seconds = (total_points - migrated_count) / rate if rate > 0 else 0

        print(f"[Migrate] Progress: {progress}% ({migrated_count}/{total_points}) | "
              f"Speed: {rate:.1f} pts/sec | ETA: {int(eta_seconds)}s")

    # Verify migration
    print(f"[Migrate] Verifying target collection...")
    target_collection_info = target_client.get_collection(collection_name)
    target_point_count = target_collection_info.points_count

    if target_point_count != total_points:
        print(f"[Migrate] WARNING: Mismatch in point count!")
        print(f"[Migrate] Source: {total_points}, Target: {target_point_count}")

    migration_data = {
        "metadata": {
            "collection": collection_name,
            "migrated_at": datetime.utcnow().isoformat() + "Z",
            "source_points": total_points,
            "target_points": target_point_count,
            "vector_size": vector_size,
            "migration_duration_seconds": (datetime.utcnow() - start_time).total_seconds()
        }
    }

    return migration_data


def main():
    """Main migration function"""
    collection_name = os.getenv("COLLECTION_NAME", "sengol_incidents")

    try:
        # Connect to both instances
        source_client = get_source_qdrant_client()
        target_client = get_target_qdrant_client()

        # Check source connection
        print("[Migrate] Checking source Qdrant connection...")
        source_collections = source_client.get_collections()
        source_collection_names = [c.name for c in source_collections.collections]
        print(f"[Migrate] Source collections: {', '.join(source_collection_names)}")

        if collection_name not in source_collection_names:
            print(f"[Migrate] ERROR: Collection '{collection_name}' not found in source!")
            sys.exit(1)

        # Check target connection
        print("[Migrate] Checking target Qdrant connection...")
        target_collections = target_client.get_collections()
        target_collection_names = [c.name for c in target_collections.collections]
        print(f"[Migrate] Target collections: {', '.join(target_collection_names)}")

        # Migrate collection
        print(f"[Migrate] Starting migration of '{collection_name}'...")
        migration_result = migrate_collection(source_client, target_client, collection_name)

        print(f"\n[Migrate] ✓ Migration completed successfully!")
        print(f"[Migrate] Source points: {migration_result['metadata']['source_points']}")
        print(f"[Migrate] Target points: {migration_result['metadata']['target_points']}")
        print(f"[Migrate] Duration: {migration_result['metadata']['migration_duration_seconds']:.1f}s")
        print(f"[Migrate] Vector size: {migration_result['metadata']['vector_size']}")

        return 0

    except Exception as e:
        print(f"[Migrate] ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    sys.exit(main())
