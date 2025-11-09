# Crawler Deployment Guide for Google Compute Engine

**Purpose**: Deploy incident data crawlers on minimal Google Compute Engine instance to populate Cloud Storage bucket for Vertex AI RAG.

---

## Overview

The crawler system scrapes cybersecurity incident data, processes it, generates embeddings, and uploads to Google Cloud Storage for Vertex AI to index and search.

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Google Cloud Project                       │
│                   (sengolvertexapi)                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────────┐         ┌─────────────────────┐     │
│  │ Compute Engine   │         │ Cloud Storage       │     │
│  │ (e2-micro)       │────────→│ sengol-incidents    │     │
│  │                  │ Upload  │ /incidents/*.jsonl  │     │
│  │ - Python Crawler │         └─────────────────────┘     │
│  │ - Scheduler      │                    ↓                 │
│  │ - Data Processor │         ┌─────────────────────┐     │
│  └──────────────────┘         │ Vertex AI RAG       │     │
│                                │ (Automatic Indexing)│     │
│                                └─────────────────────┘     │
│                                           ↓                 │
│                                ┌─────────────────────┐     │
│                                │ Sengol API          │     │
│                                │ (Vercel)            │     │
│                                └─────────────────────┘     │
└─────────────────────────────────────────────────────────────┘
```

---

## Prerequisites

1. Google Cloud Project: `sengolvertexapi`
2. Cloud Storage bucket: `sengol-incidents` (created)
3. Service account with permissions (created)
4. `gcloud` CLI installed and authenticated

---

## Step 1: Create Minimal Compute Instance

### Option A: Using gcloud CLI (Recommended)

```bash
# Create e2-micro instance (free tier eligible)
gcloud compute instances create sengol-crawler \
    --project=sengolvertexapi \
    --zone=us-central1-a \
    --machine-type=e2-micro \
    --image-family=debian-11 \
    --image-project=debian-cloud \
    --boot-disk-size=10GB \
    --boot-disk-type=pd-standard \
    --scopes=cloud-platform \
    --tags=crawler,http-server \
    --metadata=enable-oslogin=TRUE

# Verify creation
gcloud compute instances list --project=sengolvertexapi
```

### Option B: Using Cloud Console

1. Go to https://console.cloud.google.com/compute/instances
2. Click "Create Instance"
3. Configure:
   - **Name**: `sengol-crawler`
   - **Region**: `us-central1`
   - **Zone**: `us-central1-a`
   - **Machine type**: `e2-micro` (0.25-1 vCPU, 1GB RAM)
   - **Boot disk**: Debian 11, 10GB
   - **Access scopes**: "Allow full access to all Cloud APIs"
4. Click "Create"

---

## Step 2: SSH into Instance

```bash
# SSH into the instance
gcloud compute ssh sengol-crawler --project=sengolvertexapi --zone=us-central1-a
```

---

## Step 3: Install Dependencies

```bash
# Update system
sudo apt-get update
sudo apt-get upgrade -y

# Install Python 3 and pip
sudo apt-get install -y python3 python3-pip python3-venv git

# Install system dependencies for scraping
sudo apt-get install -y curl wget jq

# Verify installations
python3 --version
pip3 --version
git --version
```

---

## Step 4: Setup Crawler Application

### Create Crawler Directory

```bash
# Create application directory
sudo mkdir -p /opt/sengol-crawler
sudo chown $USER:$USER /opt/sengol-crawler
cd /opt/sengol-crawler

# Create Python virtual environment
python3 -m venv venv
source venv/bin/activate
```

### Install Python Dependencies

```bash
# Create requirements.txt
cat > requirements.txt <<'EOF'
google-cloud-storage==2.14.0
google-cloud-aiplatform==1.38.0
requests==2.31.0
beautifulsoup4==4.12.2
pandas==2.1.4
schedule==1.2.0
python-dotenv==1.0.0
lxml==4.9.3
EOF

# Install dependencies
pip install -r requirements.txt
```

---

## Step 5: Create Crawler Script

### Basic Crawler Template

```python
# Save as: /opt/sengol-crawler/crawler.py

#!/usr/bin/env python3
"""
Sengol Incident Crawler
Scrapes cybersecurity incident data and uploads to Google Cloud Storage
"""

import json
import logging
from datetime import datetime
from google.cloud import storage
from typing import Dict, List
import requests
from bs4 import BeautifulSoup

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
BUCKET_NAME = "sengol-incidents"
PROJECT_ID = "sengolvertexapi"

class IncidentCrawler:
    def __init__(self):
        self.storage_client = storage.Client(project=PROJECT_ID)
        self.bucket = self.storage_client.bucket(BUCKET_NAME)
        logger.info(f"Initialized crawler for bucket: {BUCKET_NAME}")

    def scrape_incidents(self) -> List[Dict]:
        """
        Scrape incidents from various sources.

        TODO: Implement actual scraping logic for:
        - Cybersecurity incident databases
        - Regulatory violation reports
        - System failure databases
        """
        incidents = []

        # Example: Placeholder data
        # Replace with actual scraping logic
        example_incident = {
            "id": f"incident-{datetime.now().strftime('%Y%m%d-%H%M%S')}",
            "content": "Example cybersecurity incident description...",
            "metadata": {
                "incidentId": "CYBER-2025-001",
                "incidentType": "cyber",
                "organization": "Example Corp",
                "industry": "finance",
                "severity": "high",
                "incidentDate": "2025-01-15",
                "hadMfa": False,
                "hadBackups": True,
                "hadIrPlan": False,
                "estimatedCost": 500000,
                "downtimeHours": 48,
                "recordsAffected": 10000,
                "attackType": "ransomware",
                "attackVector": "phishing",
                "embeddingText": "Ransomware attack on financial institution..."
            }
        }

        incidents.append(example_incident)

        logger.info(f"Scraped {len(incidents)} incidents")
        return incidents

    def upload_to_storage(self, incidents: List[Dict]):
        """Upload incidents to Cloud Storage in JSONL format"""
        if not incidents:
            logger.warning("No incidents to upload")
            return

        try:
            # Create JSONL content
            jsonl_content = "\n".join(
                json.dumps(incident) for incident in incidents
            )

            # Upload to Cloud Storage
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            blob_name = f"incidents/batch-{timestamp}.jsonl"
            blob = self.bucket.blob(blob_name)

            blob.upload_from_string(
                jsonl_content,
                content_type='application/jsonl'
            )

            logger.info(f"✅ Uploaded {len(incidents)} incidents to gs://{BUCKET_NAME}/{blob_name}")

        except Exception as e:
            logger.error(f"❌ Failed to upload incidents: {e}")
            raise

    def run(self):
        """Main crawler execution"""
        logger.info("🚀 Starting incident crawler...")

        try:
            # Scrape incidents
            incidents = self.scrape_incidents()

            # Upload to Cloud Storage
            if incidents:
                self.upload_to_storage(incidents)
                logger.info(f"✅ Crawler run completed successfully: {len(incidents)} incidents processed")
            else:
                logger.warning("⚠️ No incidents found in this run")

        except Exception as e:
            logger.error(f"❌ Crawler run failed: {e}")
            raise

def main():
    crawler = IncidentCrawler()
    crawler.run()

if __name__ == "__main__":
    main()
```

Make the script executable:
```bash
chmod +x /opt/sengol-crawler/crawler.py
```

---

## Step 6: Test Crawler

```bash
# Activate virtual environment
cd /opt/sengol-crawler
source venv/bin/activate

# Run crawler
python3 crawler.py

# Expected output:
# 2025-11-08 12:00:00 - __main__ - INFO - 🚀 Starting incident crawler...
# 2025-11-08 12:00:01 - __main__ - INFO - Scraped 1 incidents
# 2025-11-08 12:00:02 - __main__ - INFO - ✅ Uploaded 1 incidents to gs://sengol-incidents/incidents/batch-20251108-120002.jsonl
# 2025-11-08 12:00:02 - __main__ - INFO - ✅ Crawler run completed successfully: 1 incidents processed
```

Verify upload:
```bash
gsutil ls gs://sengol-incidents/incidents/
```

---

## Step 7: Setup Automated Scheduling

### Create Systemd Service

```bash
# Create service file
sudo tee /etc/systemd/system/sengol-crawler.service > /dev/null <<'EOF'
[Unit]
Description=Sengol Incident Crawler
After=network.target

[Service]
Type=simple
User=YOUR_USERNAME
WorkingDirectory=/opt/sengol-crawler
Environment="PATH=/opt/sengol-crawler/venv/bin:/usr/local/bin:/usr/bin:/bin"
ExecStart=/opt/sengol-crawler/venv/bin/python3 /opt/sengol-crawler/crawler.py
Restart=on-failure
RestartSec=300

[Install]
WantedBy=multi-user.target
EOF

# Replace YOUR_USERNAME with actual username
sudo sed -i "s/YOUR_USERNAME/$USER/g" /etc/systemd/system/sengol-crawler.service

# Reload systemd
sudo systemctl daemon-reload

# Enable service
sudo systemctl enable sengol-crawler.service

# Start service
sudo systemctl start sengol-crawler.service

# Check status
sudo systemctl status sengol-crawler.service
```

### Create Cron Job for Periodic Execution

```bash
# Run crawler daily at 2 AM
(crontab -l 2>/dev/null; echo "0 2 * * * cd /opt/sengol-crawler && /opt/sengol-crawler/venv/bin/python3 crawler.py >> /var/log/sengol-crawler.log 2>&1") | crontab -

# Verify cron job
crontab -l
```

---

## Step 8: Monitoring and Logs

### View Logs

```bash
# View systemd service logs
sudo journalctl -u sengol-crawler.service -f

# View cron job logs
tail -f /var/log/sengol-crawler.log

# View Cloud Storage bucket
gsutil ls -lh gs://sengol-incidents/incidents/
```

### Setup Log Rotation

```bash
# Create logrotate config
sudo tee /etc/logrotate.d/sengol-crawler > /dev/null <<'EOF'
/var/log/sengol-crawler.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 YOUR_USERNAME YOUR_USERNAME
}
EOF

# Replace YOUR_USERNAME
sudo sed -i "s/YOUR_USERNAME/$USER/g" /etc/logrotate.d/sengol-crawler
```

---

## Step 9: Implement Actual Data Sources

### Data Sources to Scrape

1. **Cybersecurity Incidents**:
   - CISA Known Exploited Vulnerabilities: https://www.cisa.gov/known-exploited-vulnerabilities-catalog
   - CVE Database: https://cve.mitre.org/
   - National Vulnerability Database: https://nvd.nist.gov/

2. **Breach Reports**:
   - Privacy Rights Clearinghouse: https://privacyrights.org/data-breaches
   - HaveIBeenPwned: https://haveibeenpwned.com/
   - State Attorney General breach reports

3. **Regulatory Violations**:
   - SEC enforcement actions
   - FTC data security cases
   - GDPR violation database

4. **Industry Reports**:
   - Verizon DBIR
   - IBM X-Force Threat Intelligence
   - CrowdStrike threat reports

### Example: Scraping CVE Database

```python
def scrape_cve_database(self) -> List[Dict]:
    """Scrape recent CVEs from NIST NVD"""
    url = "https://services.nvd.nist.gov/rest/json/cves/2.0"

    response = requests.get(url, params={
        "resultsPerPage": 100,
        "startIndex": 0
    })

    data = response.json()
    incidents = []

    for cve in data.get("vulnerabilities", []):
        cve_data = cve["cve"]

        incident = {
            "id": f"cve-{cve_data['id']}",
            "content": cve_data.get("descriptions", [{}])[0].get("value", ""),
            "metadata": {
                "incidentId": cve_data["id"],
                "incidentType": "cyber",
                "severity": self._map_cvss_to_severity(cve_data),
                "incidentDate": cve_data.get("published", ""),
                "attackType": "vulnerability",
                "embeddingText": cve_data.get("descriptions", [{}])[0].get("value", "")
            }
        }

        incidents.append(incident)

    return incidents

def _map_cvss_to_severity(self, cve_data: Dict) -> str:
    """Map CVSS score to severity level"""
    try:
        metrics = cve_data.get("metrics", {})
        cvss_v3 = metrics.get("cvssMetricV31", [{}])[0]
        score = cvss_v3.get("cvssData", {}).get("baseScore", 0)

        if score >= 9.0:
            return "critical"
        elif score >= 7.0:
            return "high"
        elif score >= 4.0:
            return "medium"
        else:
            return "low"
    except:
        return "medium"
```

---

## Cost Optimization

### Minimize Costs

1. **Use e2-micro**: Free tier eligible (1 instance/month)
2. **Stop when not needed**:
   ```bash
   gcloud compute instances stop sengol-crawler --zone=us-central1-a
   ```

3. **Schedule start/stop**:
   ```bash
   # Start at 2 AM, stop at 3 AM (run for 1 hour)
   # (Use Cloud Scheduler or cron on another machine)
   ```

4. **Use preemptible instance** (saves 80%):
   ```bash
   gcloud compute instances create sengol-crawler \
       --preemptible \
       --machine-type=e2-micro \
       ...
   ```

---

## Troubleshooting

### Issue: "Permission denied" to Cloud Storage
```bash
# Solution: Check service account permissions
gcloud projects get-iam-policy sengolvertexapi
```

### Issue: Crawler script fails
```bash
# Check logs
sudo journalctl -u sengol-crawler.service -n 50

# Check Python errors
cd /opt/sengol-crawler
source venv/bin/activate
python3 -c "import google.cloud.storage; print('OK')"
```

### Issue: Out of disk space
```bash
# Check disk usage
df -h

# Clean up old logs
sudo find /var/log -name "*.log" -mtime +30 -delete
```

---

## Next Steps

1. ✅ Deploy minimal compute instance
2. ✅ Install dependencies
3. ✅ Create crawler script
4. ⏳ Implement actual data sources
5. ⏳ Test with Vertex AI RAG
6. ⏳ Monitor and optimize

---

**Last Updated**: November 8, 2025
**Status**: Template Ready, Implementation Pending
