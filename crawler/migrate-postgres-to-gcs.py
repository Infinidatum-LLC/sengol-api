#!/usr/bin/env python3
"""
Migrate historical incidents from PostgreSQL to Cloud Storage

This script:
1. Connects to PostgreSQL database
2. Exports existing incidents/compliance data
3. Uploads to Cloud Storage in JSONL format
4. Makes data compatible with Vertex AI embedding pipeline
"""

import os
import sys
import json
import logging
from datetime import datetime
from typing import List, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor
from google.cloud import storage

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://neondb_owner:npg_zXVLKR3q6e9Z@ep-nameless-tree-a8idbdk7-pooler.eastus2.azure.neon.tech/sengol?sslmode=require')
GCS_BUCKET = os.getenv('GCS_BUCKET_NAME', 'sengol-incidents')
GOOGLE_CLOUD_PROJECT = os.getenv('GOOGLE_CLOUD_PROJECT', 'sengolvertexapi')


class PostgresToGCSMigrator:
    def __init__(self):
        self.db_conn = None
        self.storage_client = None
        self.bucket = None

    def connect_db(self):
        """Connect to PostgreSQL database"""
        logger.info(f"Connecting to PostgreSQL...")
        try:
            self.db_conn = psycopg2.connect(DATABASE_URL)
            logger.info("✓ Connected to PostgreSQL")
        except Exception as e:
            logger.error(f"Failed to connect to PostgreSQL: {e}")
            raise

    def connect_gcs(self):
        """Connect to Google Cloud Storage"""
        logger.info(f"Connecting to GCS bucket: {GCS_BUCKET}")
        try:
            self.storage_client = storage.Client(project=GOOGLE_CLOUD_PROJECT)
            self.bucket = self.storage_client.bucket(GCS_BUCKET)
            logger.info(f"✓ Connected to GCS bucket: {GCS_BUCKET}")
        except Exception as e:
            logger.error(f"Failed to connect to GCS: {e}")
            raise

    def list_tables(self) -> List[str]:
        """List all tables in the database"""
        cursor = self.db_conn.cursor()
        cursor.execute("""
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name
        """)
        tables = [row[0] for row in cursor.fetchall()]
        cursor.close()
        return tables

    def export_table(self, table_name: str, limit: int = None) -> List[Dict[str, Any]]:
        """Export data from a PostgreSQL table"""
        logger.info(f"Exporting table: {table_name}")

        cursor = self.db_conn.cursor(cursor_factory=RealDictCursor)

        query = f"SELECT * FROM {table_name}"
        if limit:
            query += f" LIMIT {limit}"

        cursor.execute(query)
        rows = cursor.fetchall()
        cursor.close()

        # Convert to list of dicts
        data = [dict(row) for row in rows]
        logger.info(f"  Exported {len(data)} rows from {table_name}")

        return data

    def convert_to_incident_format(self, table_name: str, rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Convert PostgreSQL rows to incident format for embeddings"""
        incidents = []

        for idx, row in enumerate(rows):
            # Generate incident ID
            incident_id = f"postgres-{table_name}-{row.get('id', idx)}"

            # Build text representation for embedding
            text_parts = []
            metadata = {
                "incidentId": incident_id,
                "incidentType": "postgres_migration",
                "source": table_name,
                "migrationDate": datetime.now().isoformat(),
            }

            # Extract common fields
            for key, value in row.items():
                if value is not None:
                    # Skip binary/blob data
                    if isinstance(value, (bytes, bytearray)):
                        continue

                    # Convert datetime to string
                    if isinstance(value, datetime):
                        value = value.isoformat()

                    # Add to text for embedding
                    text_parts.append(f"{key}: {value}")

                    # Add to metadata (with type hints)
                    if key == 'industry':
                        metadata['industry'] = str(value)
                    elif key == 'severity':
                        metadata['severity'] = str(value)
                    elif key == 'organization':
                        metadata['organization'] = str(value)
                    elif key in ['cost', 'estimated_cost', 'impact']:
                        try:
                            metadata['estimatedCost'] = float(value)
                        except:
                            pass
                    elif key in ['records_affected', 'users_affected']:
                        try:
                            metadata['recordsAffected'] = int(value)
                        except:
                            pass

            # Create incident document
            embedding_text = " | ".join(text_parts)
            metadata['embeddingText'] = embedding_text

            incident = {
                "id": incident_id,
                "text": embedding_text,
                "metadata": metadata,
                "raw_data": row  # Keep original data for reference
            }

            incidents.append(incident)

        return incidents

    def upload_to_gcs(self, incidents: List[Dict[str, Any]], source_name: str):
        """Upload incidents to Cloud Storage in JSONL format"""
        timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
        filename = f"incidents/raw/postgres-{source_name}/{timestamp}.jsonl"

        logger.info(f"Uploading {len(incidents)} incidents to {filename}")

        # Create JSONL content
        jsonl_lines = [json.dumps(incident, default=str) for incident in incidents]
        jsonl_content = "\n".join(jsonl_lines)

        # Upload to GCS
        blob = self.bucket.blob(filename)
        blob.upload_from_string(
            jsonl_content,
            content_type='application/jsonl'
        )

        logger.info(f"✅ Uploaded to gs://{GCS_BUCKET}/{filename}")
        return filename

    def migrate_all_tables(self, exclude_tables: List[str] = None, limit: int = None):
        """Migrate all tables from PostgreSQL to GCS"""
        exclude_tables = exclude_tables or []

        # Get list of tables
        tables = self.list_tables()
        logger.info(f"Found {len(tables)} tables in database")

        total_incidents = 0

        for table_name in tables:
            if table_name in exclude_tables:
                logger.info(f"Skipping table: {table_name} (excluded)")
                continue

            try:
                # Export table data
                rows = self.export_table(table_name, limit=limit)

                if not rows:
                    logger.info(f"  No data in table: {table_name}")
                    continue

                # Convert to incident format
                incidents = self.convert_to_incident_format(table_name, rows)

                # Upload to GCS
                self.upload_to_gcs(incidents, table_name)

                total_incidents += len(incidents)

            except Exception as e:
                logger.error(f"  Failed to process table {table_name}: {e}")
                continue

        logger.info(f"✅ Migration complete: {total_incidents} total incidents migrated")

    def close(self):
        """Close database connection"""
        if self.db_conn:
            self.db_conn.close()
            logger.info("✓ Closed database connection")


def main():
    # Parse command line arguments
    import argparse
    parser = argparse.ArgumentParser(description='Migrate PostgreSQL data to GCS')
    parser.add_argument('--list-tables', action='store_true', help='List all tables and exit')
    parser.add_argument('--table', type=str, help='Migrate specific table only')
    parser.add_argument('--exclude', type=str, nargs='+', help='Tables to exclude')
    parser.add_argument('--limit', type=int, help='Limit number of rows per table')
    args = parser.parse_args()

    # Initialize migrator
    migrator = PostgresToGCSMigrator()

    try:
        # Connect to services
        migrator.connect_db()
        migrator.connect_gcs()

        # List tables mode
        if args.list_tables:
            tables = migrator.list_tables()
            print("\n=== Database Tables ===")
            for table in tables:
                print(f"  - {table}")
            return

        # Migrate specific table
        if args.table:
            rows = migrator.export_table(args.table, limit=args.limit)
            if rows:
                incidents = migrator.convert_to_incident_format(args.table, rows)
                migrator.upload_to_gcs(incidents, args.table)
        else:
            # Migrate all tables
            exclude = args.exclude or [
                'users',  # Don't migrate user tables
                'sessions',
                'accounts',
                '_prisma_migrations',
            ]
            migrator.migrate_all_tables(exclude_tables=exclude, limit=args.limit)

    except Exception as e:
        logger.error(f"Migration failed: {e}")
        sys.exit(1)
    finally:
        migrator.close()


if __name__ == '__main__':
    main()
