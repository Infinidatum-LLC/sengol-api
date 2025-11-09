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

class IncidentCrawler:
    def __init__(self):
        self.storage_client = storage.Client(project=PROJECT_ID)
        self.bucket = self.storage_client.bucket(BUCKET_NAME)
        logger.info(f"Initialized crawler for bucket: {BUCKET_NAME}")

    def scrape_cisa_kev(self) -> List[Dict]:
        """Scrape CISA Known Exploited Vulnerabilities"""
        logger.info("Scraping CISA KEV catalog...")

        try:
            url = "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json"
            response = requests.get(url, timeout=30)
            response.raise_for_status()

            data = response.json()
            incidents = []

            for vuln in data.get("vulnerabilities", [])[:100]:  # Limit to 100 per run
                incident = {
                    "id": f"cisa-kev-{vuln.get('cveID', '')}",
                    "content": f"{vuln.get('vulnerabilityName', '')}. {vuln.get('shortDescription', '')}",
                    "metadata": {
                        "incidentId": vuln.get('cveID', ''),
                        "incidentType": "cyber",
                        "severity": "high",  # CISA KEV are all high severity
                        "incidentDate": vuln.get('dateAdded', ''),
                        "attackType": "vulnerability",
                        "attackVector": vuln.get('product', ''),
                        "embeddingText": f"{vuln.get('vulnerabilityName', '')} - {vuln.get('shortDescription', '')} affecting {vuln.get('vendorProject', '')} {vuln.get('product', '')}",
                        "tags": f"cve,kev,{vuln.get('vendorProject', '')}"
                    }
                }
                incidents.append(incident)

            logger.info(f"Scraped {len(incidents)} CISA KEV vulnerabilities")
            return incidents

        except Exception as e:
            logger.error(f"Failed to scrape CISA KEV: {e}")
            return []

    def scrape_nvd_recent(self) -> List[Dict]:
        """Scrape recent CVEs from National Vulnerability Database"""
        logger.info("Scraping recent NVD CVEs...")

        try:
            url = "https://services.nvd.nist.gov/rest/json/cves/2.0"
            params = {
                "resultsPerPage": 50,
                "startIndex": 0
            }

            response = requests.get(url, params=params, timeout=30)
            response.raise_for_status()

            data = response.json()
            incidents = []

            for vuln in data.get("vulnerabilities", []):
                cve_data = vuln["cve"]

                # Extract CVSS score
                metrics = cve_data.get("metrics", {})
                cvss_v31 = metrics.get("cvssMetricV31", [{}])[0] if metrics.get("cvssMetricV31") else {}
                cvss_score = cvss_v31.get("cvssData", {}).get("baseScore", 0)

                # Map to severity
                if cvss_score >= 9.0:
                    severity = "critical"
                elif cvss_score >= 7.0:
                    severity = "high"
                elif cvss_score >= 4.0:
                    severity = "medium"
                else:
                    severity = "low"

                description = ""
                if cve_data.get("descriptions"):
                    description = cve_data["descriptions"][0].get("value", "")

                incident = {
                    "id": f"nvd-{cve_data['id']}",
                    "content": description,
                    "metadata": {
                        "incidentId": cve_data["id"],
                        "incidentType": "cyber",
                        "severity": severity,
                        "incidentDate": cve_data.get("published", ""),
                        "attackType": "vulnerability",
                        "estimatedCost": int(cvss_score * 10000),  # Rough estimate based on severity
                        "embeddingText": description,
                        "tags": f"cve,nvd,cvss-{cvss_score}"
                    }
                }
                incidents.append(incident)

            logger.info(f"Scraped {len(incidents)} NVD CVEs")

            # Rate limiting (NVD has strict rate limits)
            time.sleep(6)  # NVD allows 5 requests per 30 seconds

            return incidents

        except Exception as e:
            logger.error(f"Failed to scrape NVD: {e}")
            return []

    def scrape_breach_level_index(self) -> List[Dict]:
        """Scrape example breach data (placeholder for actual breach databases)"""
        logger.info("Generating example breach incidents...")

        # This is example data - replace with actual breach database scraping
        example_breaches = [
            {
                "id": f"breach-{datetime.now().strftime('%Y%m%d')}-001",
                "content": "Healthcare provider data breach exposing patient records through misconfigured database",
                "metadata": {
                    "incidentId": f"BREACH-{datetime.now().year}-001",
                    "incidentType": "cyber",
                    "organization": "Healthcare Provider",
                    "industry": "healthcare",
                    "severity": "high",
                    "incidentDate": datetime.now().isoformat(),
                    "hadMfa": False,
                    "hadBackups": True,
                    "hadIrPlan": False,
                    "estimatedCost": 5000000,
                    "downtimeHours": 72,
                    "recordsAffected": 500000,
                    "attackType": "data_breach",
                    "attackVector": "misconfiguration",
                    "embeddingText": "Healthcare data breach: 500,000 patient records exposed due to misconfigured database without MFA protection",
                    "tags": "breach,healthcare,misconfiguration"
                }
            }
        ]

        logger.info(f"Generated {len(example_breaches)} example breach incidents")
        return example_breaches

    def upload_to_storage(self, incidents: List[Dict], source: str):
        """Upload incidents to Cloud Storage in JSONL format"""
        if not incidents:
            logger.warning(f"No incidents to upload from {source}")
            return

        try:
            # Create JSONL content
            jsonl_content = "\n".join(
                json.dumps(incident) for incident in incidents
            )

            # Upload to Cloud Storage
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            blob_name = f"incidents/raw/{source}/{timestamp}.jsonl"
            blob = self.bucket.blob(blob_name)

            blob.upload_from_string(
                jsonl_content,
                content_type='application/jsonl'
            )

            logger.info(f"✅ Uploaded {len(incidents)} incidents from {source} to gs://{BUCKET_NAME}/{blob_name}")

        except Exception as e:
            logger.error(f"❌ Failed to upload incidents from {source}: {e}")
            raise

    def run(self):
        """Main crawler execution"""
        logger.info("🚀 Starting incident crawler...")

        total_incidents = 0

        try:
            # Scrape from multiple sources
            sources = [
                ("cisa-kev", self.scrape_cisa_kev),
                ("nvd", self.scrape_nvd_recent),
                ("breach-examples", self.scrape_breach_level_index),
            ]

            for source_name, scrape_func in sources:
                try:
                    logger.info(f"Scraping {source_name}...")
                    incidents = scrape_func()

                    if incidents:
                        self.upload_to_storage(incidents, source_name)
                        total_incidents += len(incidents)

                    # Rate limiting between sources
                    time.sleep(2)

                except Exception as e:
                    logger.error(f"Error scraping {source_name}: {e}")
                    continue

            logger.info(f"✅ Crawler run completed: {total_incidents} total incidents processed")

        except Exception as e:
            logger.error(f"❌ Crawler run failed: {e}")
            raise

def main():
    crawler = IncidentCrawler()
    crawler.run()

if __name__ == "__main__":
    main()
