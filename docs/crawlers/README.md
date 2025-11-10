# Sengol Crawler System Documentation

This directory contains comprehensive documentation for the Sengol Crawler System deployed on Google Cloud Platform.

## Documentation Index

### Core Documentation
- **[ARCHITECTURE.md](ARCHITECTURE.md)** - System architecture and data flow
- **[DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)** - Step-by-step deployment instructions
- **[OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md)** - Day-to-day operations and monitoring
- **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)** - Common issues and solutions

### Reference Documentation
- **[INFRASTRUCTURE.md](INFRASTRUCTURE.md)** - Complete infrastructure specifications
- **[CLOUD_FUNCTIONS.md](CLOUD_FUNCTIONS.md)** - Cloud Functions documentation
- **[DATA_SOURCES.md](DATA_SOURCES.md)** - All 15 crawler data sources
- **[API_REFERENCE.md](API_REFERENCE.md)** - API endpoints and usage

### Maintenance Documentation
- **[COST_OPTIMIZATION.md](COST_OPTIMIZATION.md)** - Cost management strategies
- **[SECURITY.md](SECURITY.md)** - Security configurations and best practices
- **[DISASTER_RECOVERY.md](DISASTER_RECOVERY.md)** - Backup and recovery procedures

## Quick Links

### Deployment Status
- **Project ID**: elite-striker-477619-p8
- **Region**: us-central1
- **Deployment Date**: 2025-11-10
- **Status**: Fully Operational
- **Monthly Cost**: ~$96-99

### Key Resources
- **VMs**: 3 (orchestrator, worker, vector-db)
- **Cloud Functions**: 2 (embedding-generator, qdrant-loader)
- **Pub/Sub Topics**: 3
- **Cloud Scheduler Jobs**: 6
- **Data Sources**: 15

### Access Points
- **Orchestrator API**: http://10.128.0.3:3000
- **Qdrant Database**: http://10.128.0.2:6333
- **GCS Buckets**:
  - sengol-crawled-data-raw
  - sengol-incidents-elite

## Getting Started

1. **For New Team Members**: Start with [ARCHITECTURE.md](ARCHITECTURE.md) to understand the system
2. **For Operators**: Review [OPERATIONS_GUIDE.md](OPERATIONS_GUIDE.md) for daily tasks
3. **For Developers**: Check [API_REFERENCE.md](API_REFERENCE.md) for integration details
4. **For Issues**: Consult [TROUBLESHOOTING.md](TROUBLESHOOTING.md) first

## System Overview

The Sengol Crawler System is an autonomous AI/ML data collection and vector database system that:

1. **Crawls** 15 security incident, regulatory, research, and news sources
2. **Generates** OpenAI embeddings (text-embedding-3-small, 1536 dimensions)
3. **Stores** vectors in Qdrant database for semantic search
4. **Runs** on automated schedules with cost optimization

### Architecture Diagram

```
Cloud Scheduler → Orchestrator API → Cloud Tasks → Crawler Worker
                                                         ↓
                                                    GCS Bucket
                                                         ↓
                                                    Pub/Sub Topic
                                                         ↓
                                            Embedding Generator Function
                                                         ↓
                                                    Pub/Sub Topic
                                                         ↓
                                                Qdrant Loader Function
                                                         ↓
                                                  Qdrant Database
```

## Support and Contact

For issues or questions:
1. Check [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
2. Review Cloud Logging in GCP Console
3. Contact the development team

## Changelog

### 2025-11-10 - Initial Deployment
- All 5 phases completed
- 15 data sources configured
- 6 Cloud Scheduler jobs enabled
- Auto-shutdown configured for cost optimization
- Complete documentation created

## License

Internal Sengol AI documentation. Confidential and proprietary.
