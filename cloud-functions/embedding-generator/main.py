"""
Cloud Function: Embedding Generator
Triggered by Pub/Sub when data is crawled
Generates OpenAI embeddings and uploads to GCS
"""

import os
import json
import base64
from google.cloud import storage, pubsub_v1
from openai import OpenAI
import time

# Configuration
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSIONS = 1536
BATCH_SIZE = 100
RATE_LIMIT_DELAY = 0.1  # seconds between batches

openai_client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))
storage_client = storage.Client()
publisher = pubsub_v1.PublisherClient()

def generate_embeddings(event, context):
    """
    Background Cloud Function triggered by Pub/Sub.

    Args:
        event (dict): Event payload with 'data' field containing base64-encoded JSON
        context (google.cloud.functions.Context): Metadata for the event
    """

    # Decode Pub/Sub message
    pubsub_message = base64.b64decode(event['data']).decode('utf-8')
    task = json.loads(pubsub_message)

    print(f"Processing embedding task for: {task.get('sourceName', 'unknown')}")

    try:
        # Download raw data from GCS
        gcs_path = task['gcsPath']
        bucket_name = task.get('rawBucket', 'sengol-crawled-data-processed')

        bucket = storage_client.bucket(bucket_name)
        blob = bucket.blob(gcs_path)
        content = blob.download_as_text()
        data = json.loads(content)

        # Handle both array and object formats
        records = data if isinstance(data, list) else data.get('records', [data])
        print(f"Found {len(records)} records")

        if len(records) == 0:
            print("No records to process")
            return

        # Generate embeddings in batches
        embeddings = []
        category = task.get('category', 'incidents')

        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i+BATCH_SIZE]
            print(f"Processing batch {i//BATCH_SIZE + 1}/{(len(records)-1)//BATCH_SIZE + 1}")

            # Extract embedding text
            embedding_texts = [extract_embedding_text(record, category) for record in batch]

            # Call OpenAI API
            response = openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=embedding_texts,
                dimensions=EMBEDDING_DIMENSIONS
            )

            # Store embeddings
            for j, emb_data in enumerate(response.data):
                record = batch[j]
                embeddings.append({
                    'id': record.get('id', record.get('external_id', f"{category}_{i+j}")),
                    'embedding_id': f"emb_{category}_{record.get('id', i+j)}",
                    'embedding': emb_data.embedding,
                    'embedding_text': embedding_texts[j],
                    'metadata': {
                        'source_file': f"{category}.json",
                        'category': category,
                        'original_record': record
                    }
                })

            # Rate limiting
            if i + BATCH_SIZE < len(records):
                time.sleep(RATE_LIMIT_DELAY)

        print(f"Generated {len(embeddings)} embeddings")

        # Upload embeddings to GCS
        embeddings_bucket = storage_client.bucket('sengol-incidents-elite')
        timestamp = time.strftime('%Y-%m-%d')
        source_name = task.get('sourceName', 'unknown').replace(' ', '_')
        output_path = f"incidents/embeddings/openai-1536/{category}/{source_name}_{timestamp}.jsonl"

        # Create JSONL
        jsonl = '\n'.join(json.dumps(emb) for emb in embeddings)

        output_blob = embeddings_bucket.blob(output_path)
        output_blob.upload_from_string(jsonl, content_type='application/x-ndjson')

        print(f"Uploaded embeddings to gs://sengol-incidents-elite/{output_path}")

        # Publish completion event
        topic_path = publisher.topic_path(
            os.environ.get('GCP_PROJECT', 'elite-striker-477619-p8'),
            'sengol-embeddings-generated'
        )

        completion_data = {
            'sourceId': task.get('sourceId'),
            'sourceName': task.get('sourceName'),
            'category': category,
            'embeddingsPath': output_path,
            'recordCount': len(embeddings)
        }

        publisher.publish(
            topic_path,
            json.dumps(completion_data).encode('utf-8'),
            sourceId=task.get('sourceId', ''),
            category=category
        )

        print(f"Published embeddings-generated event")

    except Exception as e:
        print(f"Error processing embedding task: {str(e)}")
        raise  # Re-raise to trigger Pub/Sub retry


def extract_embedding_text(record, category):
    """Extract embedding text from a record based on category"""

    if category in ['incidents', 'vulnerabilities']:
        text = f"{record.get('title', '')}\n{record.get('description', '')}\n"
        text += f"{record.get('technical_details', '')}\n"
        text += f"Severity: {record.get('severity', 'unknown')}\n"
        text += f"Organization: {record.get('organization', 'unknown')}"

    elif category == 'regulatory':
        text = f"{record.get('title', '')}\n{record.get('description', '')}\n"
        text += f"{record.get('regulation_text', '')}\n"
        text += f"Jurisdiction: {record.get('jurisdiction', 'unknown')}"

    elif category == 'research':
        text = f"{record.get('title', '')}\n{record.get('abstract', '')}\n"
        text += f"Authors: {', '.join(record.get('authors', []))}\n"
        text += f"Keywords: {', '.join(record.get('keywords', []))}"

    elif category == 'news':
        text = f"{record.get('title', '')}\n"
        text += f"{record.get('text', record.get('description', ''))}"

    else:
        # Generic fallback
        text = f"{record.get('title', '')}\n"
        text += f"{record.get('description', record.get('text', record.get('content', '')))}"

    # Truncate to avoid token limits (~8000 tokens for text-embedding-3-small)
    return text[:8000]
