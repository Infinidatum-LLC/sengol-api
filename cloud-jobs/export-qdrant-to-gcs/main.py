#!/usr/bin/env python3
"""
Export Qdrant data from self-hosted instance to Google Cloud Storage
This job runs in Cloud Run with VPC access to reach the internal Qdrant VM
"""

import os
import sys
import json
from datetime import datetime
from typing import List, Dict, Any

from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct
from google.cloud import storage


def get_qdrant_client() -> QdrantClient:
    """Initialize Qdrant client for self-hosted instance"""
    qdrant_host = os.getenv("QDRANT_HOST", "10.128.0.2")
    qdrant_port = int(os.getenv("QDRANT_PORT", "6333"))
    url = f"http://{qdrant_host}:{qdrant_port}"
    print(f"[Export] Connecting to Qdrant at {url}")
    return QdrantClient(url=url)


def get_gcs_client() -> storage.Client:
    """Initialize GCS client"""
    return storage.Client()


def export_collection(
    client: QdrantClient,
    collection_name: str,
    batch_size: int = 100
) -> Dict[str, Any]:
    """Export all points from a Qdrant collection"""
    print(f"[Export] Getting collection info for '{collection_name}'...")
    collection_info = client.get_collection(collection_name)
    total_points = collection_info.points_count

    print(f"[Export] Collection '{collection_name}' has {total_points} points")

    # Fetch all points in batches
    all_points = []
    offset = 0

    while offset < total_points:
        remaining = total_points - offset
        limit = min(batch_size, remaining)

        print(f"[Export] Fetching points {offset} to {offset + limit}...")

        response = client.scroll(
            collection_name,
            offset=offset,
            limit=limit,
            with_payload=True,
            with_vector=True
        )

        all_points.extend(response[0])  # response is (points, next_page_offset)
        offset += limit

        # Progress indicator
        progress = min(100, round((offset / total_points) * 100))
        print(f"[Export] Progress: {progress}% ({offset}/{total_points})")

    # Create export data structure
    export_data = {
        "metadata": {
            "collection": collection_name,
            "exported_at": datetime.utcnow().isoformat() + "Z",
            "total_points": len(all_points),
        },
        "points": [
            {
                "id": p.id,
                "vector": p.vector,
                "payload": p.payload,
            }
            for p in all_points
        ]
    }

    return export_data


def upload_to_gcs(
    data: Dict[str, Any],
    bucket_name: str,
    file_name: str
) -> str:
    """Upload exported data to Google Cloud Storage"""
    gcs_client = get_gcs_client()
    bucket = gcs_client.bucket(bucket_name)
    blob = bucket.blob(file_name)

    print(f"[Export] Uploading to GCS: gs://{bucket_name}/{file_name}")

    # Convert data to JSON
    json_data = json.dumps(data, indent=2)

    # Upload
    blob.upload_from_string(json_data, content_type="application/json")

    file_size_mb = len(json_data) / 1024 / 1024
    print(f"[Export] ✓ Upload complete! File size: {file_size_mb:.2f} MB")

    return f"gs://{bucket_name}/{file_name}"


def main():
    """Main export function"""
    collection_name = "sengol_incidents"
    bucket_name = os.getenv("GCS_BUCKET", "sengol-data-migrations")

    try:
        # Connect to Qdrant
        client = get_qdrant_client()

        # Check connection
        print("[Export] Checking Qdrant connection...")
        collections = client.get_collections()
        collection_names = [c.name for c in collections.collections]
        print(f"[Export] Available collections: {', '.join(collection_names)}")

        if collection_name not in collection_names:
            print(f"[Export] ERROR: Collection '{collection_name}' not found!")
            sys.exit(1)

        # Export collection
        print(f"[Export] Starting export of '{collection_name}'...")
        export_data = export_collection(client, collection_name)

        # Upload to GCS
        timestamp = datetime.utcnow().isoformat().replace(":", "-").replace(".", "-")
        file_name = f"qdrant-exports/sengol_incidents-{timestamp}.json"
        gcs_path = upload_to_gcs(export_data, bucket_name, file_name)

        print(f"[Export] ✓ Export completed successfully!")
        print(f"[Export] Data location: {gcs_path}")
        print(f"[Export] Total points exported: {export_data['metadata']['total_points']}")

        return 0

    except Exception as e:
        print(f"[Export] ERROR: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    sys.exit(main())
