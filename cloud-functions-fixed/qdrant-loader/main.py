"""
Cloud Function: Qdrant Loader
Triggered by Pub/Sub when embeddings are generated
Loads vectors to Qdrant vector database
"""

import functions_framework
import os
import json
import base64
from google.cloud import storage, pubsub_v1
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct, VectorParams, Distance

# Configuration
QDRANT_HOST = os.environ.get('QDRANT_HOST', 'sengol-vector-db')
QDRANT_PORT = int(os.environ.get('QDRANT_PORT', '6333'))
COLLECTION_NAME = 'sengol_incidents_full'
EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 100

storage_client = storage.Client()
publisher = pubsub_v1.PublisherClient()
qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)


@functions_framework.cloud_event
def load_to_qdrant(cloud_event):
    """
    Triggered by Pub/Sub message.
    Args:
        cloud_event: CloudEvent with Pub/Sub message data
    """

    # Decode Pub/Sub message
    pubsub_message = base64.b64decode(cloud_event.data["message"]["data"]).decode('utf-8')
    task = json.loads(pubsub_message)

    print(f"Loading to Qdrant for: {task.get('sourceName', 'unknown')}")

    try:
        # Download embeddings from GCS
        embeddings_path = task['embeddingsPath']
        bucket = storage_client.bucket('sengol-incidents-elite')
        blob = bucket.blob(embeddings_path)
        content = blob.download_as_text()

        # Parse JSONL
        embeddings = [json.loads(line) for line in content.strip().split('\n') if line.strip()]
        print(f"Found {len(embeddings)} embeddings")

        if len(embeddings) == 0:
            print("No embeddings to load")
            return

        # Ensure collection exists
        ensure_collection_exists()

        # Upsert to Qdrant in batches
        total_upserted = 0
        for i in range(0, len(embeddings), BATCH_SIZE):
            batch = embeddings[i:i+BATCH_SIZE]
            print(f"Upserting batch {i//BATCH_SIZE + 1}/{(len(embeddings)-1)//BATCH_SIZE + 1}")

            points = []
            for emb in batch:
                # Extract content for payload
                original_record = emb.get('metadata', {}).get('original_record', {})
                content = (
                    original_record.get('description') or
                    original_record.get('text') or
                    original_record.get('abstract') or
                    emb.get('embedding_text', '')
                )

                point = PointStruct(
                    id=emb['id'],
                    vector=emb['embedding'],
                    payload={
                        'embedding_id': emb.get('embedding_id'),
                        'embedding_text': emb.get('embedding_text', ''),
                        'content': content[:1000],  # Limit size
                        'source_file': emb.get('metadata', {}).get('source_file'),
                        'category': emb.get('metadata', {}).get('category'),
                        'metadata': {
                            'title': original_record.get('title'),
                            'severity': original_record.get('severity'),
                            'organization': original_record.get('organization'),
                            'incident_date': original_record.get('incident_date'),
                        }
                    }
                )
                points.append(point)

            # Upsert batch
            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=points,
                wait=True
            )

            total_upserted += len(points)

        print(f"Upserted {total_upserted} vectors to Qdrant")

        # Publish completion event
        topic_path = publisher.topic_path(
            os.environ.get('GCP_PROJECT', 'elite-striker-477619-p8'),
            'sengol-qdrant-updated'
        )

        completion_data = {
            'sourceId': task.get('sourceId'),
            'sourceName': task.get('sourceName'),
            'category': task.get('category'),
            'vectorsLoaded': total_upserted
        }

        publisher.publish(
            topic_path,
            json.dumps(completion_data).encode('utf-8'),
            sourceId=task.get('sourceId', ''),
            category=task.get('category', '')
        )

        print(f"Published qdrant-updated event")

    except Exception as e:
        print(f"Error loading to Qdrant: {str(e)}")
        raise  # Re-raise to trigger Pub/Sub retry


def ensure_collection_exists():
    """Ensure Qdrant collection exists, create if not"""
    try:
        collections = qdrant_client.get_collections()
        collection_names = [c.name for c in collections.collections]

        if COLLECTION_NAME not in collection_names:
            print(f"Creating collection: {COLLECTION_NAME}")

            qdrant_client.create_collection(
                collection_name=COLLECTION_NAME,
                vectors_config=VectorParams(
                    size=EMBEDDING_DIMENSIONS,
                    distance=Distance.COSINE
                )
            )

            print("Collection created successfully")
        else:
            print(f"Collection {COLLECTION_NAME} already exists")

    except Exception as e:
        print(f"Error ensuring collection exists: {str(e)}")
        raise
