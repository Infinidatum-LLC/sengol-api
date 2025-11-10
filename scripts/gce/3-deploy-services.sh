#!/bin/bash

# Service Deployment Script
# Deploys application code to GCE VMs

set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
ZONE="us-central1-a"
LOCAL_REPO="/Users/durai/Documents/Github/sengoladmin"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Deploying Services to GCE${NC}"
echo -e "${GREEN}========================================${NC}"

# Check if we're in the right directory
if [ ! -d "$LOCAL_REPO" ]; then
  echo -e "${RED}Error: Repository not found at $LOCAL_REPO${NC}"
  exit 1
fi

cd $LOCAL_REPO

# Build the application
echo -e "\n${YELLOW}Building application...${NC}"
pnpm install
pnpm run build

# Create deployment package
echo -e "\n${YELLOW}Creating deployment package...${NC}"
DEPLOY_DIR="/tmp/sengol-crawler-deploy"
rm -rf $DEPLOY_DIR
mkdir -p $DEPLOY_DIR

# Copy necessary files
cp -r dist/ $DEPLOY_DIR/
cp -r node_modules/ $DEPLOY_DIR/
cp package.json $DEPLOY_DIR/
cp pnpm-lock.yaml $DEPLOY_DIR/
cp -r lib/crawlers/ $DEPLOY_DIR/lib/
cp -r prisma/ $DEPLOY_DIR/

# Create .env file template
cat > $DEPLOY_DIR/.env.template <<'EOF'
# Database
DATABASE_URL="postgresql://..."

# OpenAI
OPENAI_API_KEY="sk-..."

# GCP
GCP_PROJECT_ID="elite-striker-477619-p8"
GCP_REGION="us-central1"

# Qdrant
DVECDB_HOST="sengol-vector-db"
DVECDB_PORT="6333"

# Cloud Tasks
CRAWLER_QUEUE_NAME="sengol-crawler-tasks"

# Port
PORT=3000
EOF

# Deploy to Orchestrator VM
echo -e "\n${YELLOW}Deploying to orchestrator VM...${NC}"
gcloud compute scp --recurse $DEPLOY_DIR/* \
  sengol-crawler-orchestrator:/home/$(whoami)/sengol-crawler/ \
  --zone=$ZONE \
  --project=$PROJECT_ID

gcloud compute ssh sengol-crawler-orchestrator \
  --zone=$ZONE \
  --project=$PROJECT_ID \
  --command="
    cd /home/$(whoami)/sengol-crawler

    # Setup environment
    if [ ! -f .env ]; then
      echo 'Creating .env file from template...'
      cp .env.template .env
      echo 'IMPORTANT: Edit .env file with actual credentials!'
    fi

    # Install dependencies
    pnpm install --prod

    # Generate Prisma client
    npx prisma generate

    # Create systemd service
    sudo tee /etc/systemd/system/sengol-orchestrator.service > /dev/null <<'SERVICE'
[Unit]
Description=Sengol Crawler Orchestrator
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/sengol-crawler
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/services/crawler-orchestrator-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

    # Enable and start service
    sudo systemctl daemon-reload
    sudo systemctl enable sengol-orchestrator
    sudo systemctl restart sengol-orchestrator

    echo 'Orchestrator service deployed successfully'
  "

# Deploy to Worker VM
echo -e "\n${YELLOW}Deploying to worker VM...${NC}"
gcloud compute scp --recurse $DEPLOY_DIR/* \
  sengol-crawler-worker-1:/home/$(whoami)/sengol-crawler/ \
  --zone=$ZONE \
  --project=$PROJECT_ID

gcloud compute ssh sengol-crawler-worker-1 \
  --zone=$ZONE \
  --project=$PROJECT_ID \
  --command="
    cd /home/$(whoami)/sengol-crawler

    # Setup environment
    if [ ! -f .env ]; then
      cp .env.template .env
    fi

    # Install dependencies
    pnpm install --prod
    npx prisma generate

    # Create systemd service
    sudo tee /etc/systemd/system/sengol-worker.service > /dev/null <<'SERVICE'
[Unit]
Description=Sengol Crawler Worker
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)/sengol-crawler
Environment=NODE_ENV=production
ExecStart=/usr/bin/node dist/services/crawler-worker-server.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

    sudo systemctl daemon-reload
    sudo systemctl enable sengol-worker
    sudo systemctl restart sengol-worker

    echo 'Worker service deployed successfully'
  "

# Deploy embedding generator (Python service)
echo -e "\n${YELLOW}Deploying embedding generator...${NC}"

# Create Python service
cat > /tmp/embedding_service.py <<'PYTHON'
#!/usr/bin/env python3
"""
Embedding Generator Service
Listens for Pub/Sub events and generates embeddings
"""

import os
import json
from google.cloud import pubsub_v1, storage
from openai import OpenAI
import time

PROJECT_ID = os.getenv('GCP_PROJECT_ID', 'elite-striker-477619-p8')
SUBSCRIPTION_ID = 'sengol-data-crawled-sub'
EMBEDDING_MODEL = 'text-embedding-3-small'
BATCH_SIZE = 100

openai_client = OpenAI(api_key=os.getenv('OPENAI_API_KEY'))
storage_client = storage.Client()
subscriber = pubsub_v1.SubscriberClient()

subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)

def process_message(message):
    try:
        data = json.loads(message.data.decode('utf-8'))
        print(f"Processing: {data['sourceName']}")

        # Download raw data
        bucket = storage_client.bucket(data.get('rawBucket', 'sengol-crawled-data-processed'))
        blob = bucket.blob(data['gcsPath'])
        content = json.loads(blob.download_as_text())

        records = content if isinstance(content, list) else content.get('records', [])
        print(f"Found {len(records)} records")

        # Generate embeddings (simplified)
        embeddings = []
        for i in range(0, len(records), BATCH_SIZE):
            batch = records[i:i+BATCH_SIZE]
            texts = [str(r.get('title', '')) + ' ' + str(r.get('description', '')) for r in batch]

            response = openai_client.embeddings.create(
                model=EMBEDDING_MODEL,
                input=texts,
                dimensions=1536
            )

            for j, emb in enumerate(response.data):
                embeddings.append({
                    'id': batch[j].get('id', f"{data['category']}_{i+j}"),
                    'embedding': emb.embedding,
                    'metadata': batch[j]
                })

            time.sleep(0.1)  # Rate limiting

        # Upload embeddings
        output_bucket = storage_client.bucket('sengol-incidents-elite')
        output_path = f"incidents/embeddings/openai-1536/{data['category']}/{data['sourceName']}.jsonl"
        output_blob = output_bucket.blob(output_path)

        jsonl = '\n'.join(json.dumps(e) for e in embeddings)
        output_blob.upload_from_string(jsonl)

        print(f"Uploaded {len(embeddings)} embeddings to {output_path}")

        # Publish completion event
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(PROJECT_ID, 'sengol-embeddings-generated')
        publisher.publish(topic_path, json.dumps({
            'sourceId': data['sourceId'],
            'sourceName': data['sourceName'],
            'category': data['category'],
            'embeddingsPath': output_path,
            'recordCount': len(embeddings)
        }).encode())

        message.ack()

    except Exception as e:
        print(f"Error: {e}")
        message.nack()

def main():
    print(f"Starting embedding generator service...")
    print(f"Listening on: {subscription_path}")

    streaming_pull_future = subscriber.subscribe(subscription_path, callback=process_message)

    try:
        streaming_pull_future.result()
    except KeyboardInterrupt:
        streaming_pull_future.cancel()

if __name__ == '__main__':
    main()
PYTHON

gcloud compute scp /tmp/embedding_service.py \
  sengol-embedding-generator:/home/$(whoami)/ \
  --zone=$ZONE \
  --project=$PROJECT_ID

gcloud compute ssh sengol-embedding-generator \
  --zone=$ZONE \
  --project=$PROJECT_ID \
  --command="
    chmod +x embedding_service.py

    # Create systemd service
    sudo tee /etc/systemd/system/sengol-embedding-gen.service > /dev/null <<'SERVICE'
[Unit]
Description=Sengol Embedding Generator
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)
Environment=OPENAI_API_KEY=${OPENAI_API_KEY}
Environment=GCP_PROJECT_ID=elite-striker-477619-p8
ExecStart=/usr/bin/python3 /home/$(whoami)/embedding_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

    sudo systemctl daemon-reload
    sudo systemctl enable sengol-embedding-gen
    sudo systemctl restart sengol-embedding-gen

    echo 'Embedding generator deployed successfully'
  "

# Deploy Qdrant loader (Python service)
echo -e "\n${YELLOW}Deploying Qdrant loader...${NC}"

cat > /tmp/qdrant_loader_service.py <<'PYTHON'
#!/usr/bin/env python3
"""
Qdrant Loader Service
Listens for Pub/Sub events and loads embeddings to Qdrant
"""

import os
import json
from google.cloud import pubsub_v1, storage
from qdrant_client import QdrantClient
from qdrant_client.models import PointStruct

PROJECT_ID = os.getenv('GCP_PROJECT_ID', 'elite-striker-477619-p8')
SUBSCRIPTION_ID = 'sengol-embeddings-generated-sub'
QDRANT_HOST = os.getenv('QDRANT_HOST', 'sengol-vector-db')
QDRANT_PORT = int(os.getenv('QDRANT_PORT', '6333'))
COLLECTION_NAME = 'sengol_incidents_full'
BATCH_SIZE = 100

storage_client = storage.Client()
subscriber = pubsub_v1.SubscriberClient()
qdrant_client = QdrantClient(host=QDRANT_HOST, port=QDRANT_PORT)

subscription_path = subscriber.subscription_path(PROJECT_ID, SUBSCRIPTION_ID)

def process_message(message):
    try:
        data = json.loads(message.data.decode('utf-8'))
        print(f"Loading to Qdrant: {data['sourceName']}")

        # Download embeddings
        bucket = storage_client.bucket('sengol-incidents-elite')
        blob = bucket.blob(data['embeddingsPath'])
        content = blob.download_as_text()

        embeddings = [json.loads(line) for line in content.strip().split('\n')]
        print(f"Found {len(embeddings)} embeddings")

        # Upsert to Qdrant in batches
        for i in range(0, len(embeddings), BATCH_SIZE):
            batch = embeddings[i:i+BATCH_SIZE]

            points = [
                PointStruct(
                    id=emb['id'],
                    vector=emb['embedding'],
                    payload={
                        'embedding_id': emb.get('embedding_id'),
                        'content': emb['metadata'].get('description', ''),
                        'source_file': emb['metadata'].get('source_file'),
                        'category': emb['metadata'].get('category'),
                        'metadata': emb['metadata']
                    }
                )
                for emb in batch
            ]

            qdrant_client.upsert(
                collection_name=COLLECTION_NAME,
                points=points,
                wait=True
            )

        print(f"Loaded {len(embeddings)} vectors to Qdrant")

        # Publish completion event
        publisher = pubsub_v1.PublisherClient()
        topic_path = publisher.topic_path(PROJECT_ID, 'sengol-qdrant-updated')
        publisher.publish(topic_path, json.dumps({
            'sourceId': data['sourceId'],
            'sourceName': data['sourceName'],
            'category': data['category'],
            'vectorsLoaded': len(embeddings)
        }).encode())

        message.ack()

    except Exception as e:
        print(f"Error: {e}")
        message.nack()

def main():
    print(f"Starting Qdrant loader service...")
    print(f"Listening on: {subscription_path}")
    print(f"Qdrant: {QDRANT_HOST}:{QDRANT_PORT}")

    streaming_pull_future = subscriber.subscribe(subscription_path, callback=process_message)

    try:
        streaming_pull_future.result()
    except KeyboardInterrupt:
        streaming_pull_future.cancel()

if __name__ == '__main__':
    main()
PYTHON

gcloud compute scp /tmp/qdrant_loader_service.py \
  sengol-qdrant-loader:/home/$(whoami)/ \
  --zone=$ZONE \
  --project=$PROJECT_ID

gcloud compute ssh sengol-qdrant-loader \
  --zone=$ZONE \
  --project=$PROJECT_ID \
  --command="
    chmod +x qdrant_loader_service.py

    # Create systemd service
    sudo tee /etc/systemd/system/sengol-qdrant-loader.service > /dev/null <<'SERVICE'
[Unit]
Description=Sengol Qdrant Loader
After=network.target

[Service]
Type=simple
User=$(whoami)
WorkingDirectory=/home/$(whoami)
Environment=GCP_PROJECT_ID=elite-striker-477619-p8
Environment=QDRANT_HOST=sengol-vector-db
Environment=QDRANT_PORT=6333
ExecStart=/usr/bin/python3 /home/$(whoami)/qdrant_loader_service.py
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
SERVICE

    sudo systemctl daemon-reload
    sudo systemctl enable sengol-qdrant-loader
    sudo systemctl restart sengol-qdrant-loader

    echo 'Qdrant loader deployed successfully'
  "

# Cleanup
rm -rf $DEPLOY_DIR
rm /tmp/embedding_service.py
rm /tmp/qdrant_loader_service.py

# Summary
echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}"

echo -e "\n${YELLOW}Service Status:${NC}"
echo -e "  1. Orchestrator: ${GREEN}gcloud compute ssh sengol-crawler-orchestrator --zone=$ZONE --command='sudo systemctl status sengol-orchestrator'${NC}"
echo -e "  2. Worker: ${GREEN}gcloud compute ssh sengol-crawler-worker-1 --zone=$ZONE --command='sudo systemctl status sengol-worker'${NC}"
echo -e "  3. Embedding Gen: ${GREEN}gcloud compute ssh sengol-embedding-generator --zone=$ZONE --command='sudo systemctl status sengol-embedding-gen'${NC}"
echo -e "  4. Qdrant Loader: ${GREEN}gcloud compute ssh sengol-qdrant-loader --zone=$ZONE --command='sudo systemctl status sengol-qdrant-loader'${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo -e "  1. Edit .env files on each VM with actual credentials"
echo -e "  2. Restart services after updating .env"
echo -e "  3. Run ${GREEN}./4-setup-scheduler.sh${NC} to create Cloud Scheduler jobs"

echo -e "\n${GREEN}Done!${NC}"
