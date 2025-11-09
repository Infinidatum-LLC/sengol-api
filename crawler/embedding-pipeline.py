#!/usr/bin/env python3
"""
Sengol Embedding Pipeline
Processes raw incident data, generates embeddings, and indexes in Vertex AI
"""

import json
import logging
from datetime import datetime
from google.cloud import storage, aiplatform
from vertexai.language_models import TextEmbeddingModel
from typing import Dict, List
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
BUCKET_NAME = "sengol-incidents"
PROJECT_ID = "sengolvertexapi"
LOCATION = "us-central1"
EMBEDDING_MODEL = "text-embedding-004"

class EmbeddingPipeline:
    def __init__(self):
        self.storage_client = storage.Client(project=PROJECT_ID)
        self.bucket = self.storage_client.bucket(BUCKET_NAME)

        # Initialize Vertex AI
        aiplatform.init(project=PROJECT_ID, location=LOCATION)

        # Initialize embedding model
        self.embedding_model = TextEmbeddingModel.from_pretrained(EMBEDDING_MODEL)

        logger.info(f"Initialized embedding pipeline for project: {PROJECT_ID}")

    def list_unprocessed_files(self) -> List[str]:
        """List raw incident files that haven't been processed"""
        logger.info("Listing unprocessed files...")

        raw_prefix = "incidents/raw/"
        processed_prefix = "incidents/processed/"

        # Get all raw files
        raw_blobs = list(self.bucket.list_blobs(prefix=raw_prefix))
        raw_files = {blob.name for blob in raw_blobs if blob.name.endswith('.jsonl')}

        # Get all processed files
        processed_blobs = list(self.bucket.list_blobs(prefix=processed_prefix))
        processed_files = {blob.name.replace('/processed/', '/raw/') for blob in processed_blobs}

        # Find unprocessed files
        unprocessed = raw_files - processed_files

        logger.info(f"Found {len(unprocessed)} unprocessed files")
        return list(unprocessed)

    def read_incidents_from_file(self, blob_name: str) -> List[Dict]:
        """Read incidents from JSONL file"""
        try:
            blob = self.bucket.blob(blob_name)
            content = blob.download_as_text()

            incidents = []
            for line in content.strip().split('\n'):
                if line:
                    incidents.append(json.loads(line))

            logger.info(f"Read {len(incidents)} incidents from {blob_name}")
            return incidents

        except Exception as e:
            logger.error(f"Failed to read {blob_name}: {e}")
            return []

    def generate_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Generate embeddings using Vertex AI"""
        logger.info(f"Generating embeddings for {len(texts)} texts...")

        try:
            # Vertex AI embeddings in batches of 5 (API limit)
            batch_size = 5
            all_embeddings = []

            for i in range(0, len(texts), batch_size):
                batch = texts[i:i + batch_size]
                embeddings = self.embedding_model.get_embeddings(batch)
                all_embeddings.extend([emb.values for emb in embeddings])

                # Rate limiting
                time.sleep(0.5)

                if (i + batch_size) % 20 == 0:
                    logger.info(f"  Processed {min(i + batch_size, len(texts))}/{len(texts)} embeddings")

            logger.info(f"✅ Generated {len(all_embeddings)} embeddings")
            return all_embeddings

        except Exception as e:
            logger.error(f"Failed to generate embeddings: {e}")
            raise

    def process_incidents(self, incidents: List[Dict]) -> List[Dict]:
        """Add embeddings to incidents"""
        logger.info(f"Processing {len(incidents)} incidents...")

        try:
            # Extract texts for embedding
            texts = [inc["metadata"]["embeddingText"] for inc in incidents]

            # Generate embeddings
            embeddings = self.generate_embeddings(texts)

            # Add embeddings to incidents
            processed = []
            for incident, embedding in zip(incidents, embeddings):
                incident["embedding"] = embedding
                incident["embedding_model"] = EMBEDDING_MODEL
                incident["processed_at"] = datetime.now().isoformat()
                processed.append(incident)

            logger.info(f"✅ Processed {len(processed)} incidents with embeddings")
            return processed

        except Exception as e:
            logger.error(f"Failed to process incidents: {e}")
            raise

    def save_processed_incidents(self, incidents: List[Dict], original_blob_name: str):
        """Save processed incidents with embeddings"""
        try:
            # Create JSONL content
            jsonl_content = "\n".join(
                json.dumps(incident) for incident in incidents
            )

            # Determine destination path
            processed_name = original_blob_name.replace('/raw/', '/processed/')
            blob = self.bucket.blob(processed_name)

            # Upload
            blob.upload_from_string(
                jsonl_content,
                content_type='application/jsonl'
            )

            logger.info(f"✅ Saved {len(incidents)} processed incidents to gs://{BUCKET_NAME}/{processed_name}")

            # Also save to embeddings collection for Vertex AI
            embeddings_name = processed_name.replace('/processed/', '/embeddings/')
            embeddings_blob = self.bucket.blob(embeddings_name)
            embeddings_blob.upload_from_string(jsonl_content, content_type='application/jsonl')

            logger.info(f"✅ Saved to embeddings collection: gs://{BUCKET_NAME}/{embeddings_name}")

        except Exception as e:
            logger.error(f"Failed to save processed incidents: {e}")
            raise

    def run(self):
        """Main pipeline execution"""
        logger.info("🚀 Starting embedding pipeline...")

        try:
            # Find unprocessed files
            unprocessed_files = self.list_unprocessed_files()

            if not unprocessed_files:
                logger.info("No unprocessed files found")
                return

            total_processed = 0

            # Process each file
            for blob_name in unprocessed_files:
                try:
                    logger.info(f"Processing file: {blob_name}")

                    # Read incidents
                    incidents = self.read_incidents_from_file(blob_name)

                    if not incidents:
                        logger.warning(f"No incidents in {blob_name}, skipping")
                        continue

                    # Process incidents (add embeddings)
                    processed_incidents = self.process_incidents(incidents)

                    # Save processed incidents
                    self.save_processed_incidents(processed_incidents, blob_name)

                    total_processed += len(processed_incidents)

                    logger.info(f"✅ Completed processing {blob_name}")

                except Exception as e:
                    logger.error(f"Error processing {blob_name}: {e}")
                    continue

            logger.info(f"✅ Pipeline completed: {total_processed} total incidents processed")

        except Exception as e:
            logger.error(f"❌ Pipeline failed: {e}")
            raise

def main():
    pipeline = EmbeddingPipeline()
    pipeline.run()

if __name__ == "__main__":
    main()
