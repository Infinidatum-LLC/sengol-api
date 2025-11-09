#!/bin/bash

# Deploy Crawler Application to Compute Engine Instance

set -e

# Configuration
PROJECT_ID="sengolvertexapi"
ZONE="us-central1-a"
INSTANCE_NAME="sengol-crawler"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}Deploying crawler application to $INSTANCE_NAME...${NC}"

# Copy crawler script to instance
echo "Copying crawler.py to instance..."
gcloud compute scp ../crawler/crawler.py $INSTANCE_NAME:/opt/sengol-crawler/ \
    --zone=$ZONE \
    --project=$PROJECT_ID

# Copy embedding pipeline script
echo "Copying embedding-pipeline.py to instance..."
gcloud compute scp ../crawler/embedding-pipeline.py $INSTANCE_NAME:/opt/sengol-crawler/ \
    --zone=$ZONE \
    --project=$PROJECT_ID

# Make scripts executable
echo "Setting up scripts on instance..."
gcloud compute ssh $INSTANCE_NAME \
    --zone=$ZONE \
    --project=$PROJECT_ID \
    --command="
        cd /opt/sengol-crawler && \
        chmod +x crawler.py embedding-pipeline.py && \
        chown \$USER:\$USER crawler.py embedding-pipeline.py
    "

# Setup systemd services
echo "Creating systemd services..."
gcloud compute ssh $INSTANCE_NAME \
    --zone=$ZONE \
    --project=$PROJECT_ID \
    --command="
        sudo tee /etc/systemd/system/sengol-crawler.service > /dev/null <<'EOF'
[Unit]
Description=Sengol Incident Crawler
After=network.target

[Service]
Type=simple
User=\$USER
WorkingDirectory=/opt/sengol-crawler
Environment=\"PATH=/opt/sengol-crawler/venv/bin:/usr/local/bin:/usr/bin:/bin\"
ExecStart=/opt/sengol-crawler/venv/bin/python3 /opt/sengol-crawler/crawler.py
Restart=on-failure
RestartSec=300

[Install]
WantedBy=multi-user.target
EOF

        sudo tee /etc/systemd/system/sengol-embedding.service > /dev/null <<'EOF'
[Unit]
Description=Sengol Embedding Pipeline
After=network.target

[Service]
Type=simple
User=\$USER
WorkingDirectory=/opt/sengol-crawler
Environment=\"PATH=/opt/sengol-crawler/venv/bin:/usr/local/bin:/usr/bin:/bin\"
ExecStart=/opt/sengol-crawler/venv/bin/python3 /opt/sengol-crawler/embedding-pipeline.py
Restart=on-failure
RestartSec=300

[Install]
WantedBy=multi-user.target
EOF

        sudo systemctl daemon-reload
        sudo systemctl enable sengol-crawler.service
        sudo systemctl enable sengol-embedding.service
    "

# Setup cron jobs
echo "Setting up cron jobs..."
gcloud compute ssh $INSTANCE_NAME \
    --zone=$ZONE \
    --project=$PROJECT_ID \
    --command="
        (crontab -l 2>/dev/null | grep -v sengol-crawler; echo '0 2 * * * cd /opt/sengol-crawler && /opt/sengol-crawler/venv/bin/python3 crawler.py >> /var/log/sengol-crawler.log 2>&1') | crontab -
        (crontab -l 2>/dev/null | grep -v sengol-embedding; echo '0 3 * * * cd /opt/sengol-crawler && /opt/sengol-crawler/venv/bin/python3 embedding-pipeline.py >> /var/log/sengol-embedding.log 2>&1') | crontab -
    "

# Start services
echo "Starting services..."
gcloud compute ssh $INSTANCE_NAME \
    --zone=$ZONE \
    --project=$PROJECT_ID \
    --command="
        sudo systemctl start sengol-crawler.service
        sudo systemctl start sengol-embedding.service
    "

echo -e "${GREEN}Deployment complete!${NC}"
echo ""
echo "Check status:"
echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo systemctl status sengol-crawler.service'"
echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo systemctl status sengol-embedding.service'"
echo ""
echo "View logs:"
echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='sudo journalctl -u sengol-crawler.service -f'"
echo "  gcloud compute ssh $INSTANCE_NAME --zone=$ZONE --command='tail -f /var/log/sengol-crawler.log'"
