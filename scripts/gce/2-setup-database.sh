#!/bin/bash

# Database Setup Script
# Creates source_registry table and initial data in PostgreSQL

set -e

# Configuration
PROJECT_ID="elite-striker-477619-p8"
ZONE="us-central1-a"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Setting up Source Registry Database${NC}"
echo -e "${GREEN}========================================${NC}"

# Create SQL migration file
cat > /tmp/source_registry_migration.sql <<'EOF'
-- Source Registry Table
CREATE TABLE IF NOT EXISTS source_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name VARCHAR(255) NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  source_type VARCHAR(50) NOT NULL CHECK (source_type IN ('rss', 'api', 'web', 'graphql', 'sitemap')),
  category VARCHAR(50) NOT NULL CHECK (category IN ('regulatory', 'incidents', 'research', 'news', 'vulnerabilities')),

  -- Discovery
  discovery_method VARCHAR(50) DEFAULT 'manual' CHECK (discovery_method IN ('manual', 'auto_rss', 'auto_api', 'auto_sitemap')),
  discovered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),

  -- Status
  enabled BOOLEAN DEFAULT false,
  verified BOOLEAN DEFAULT false,
  verification_date TIMESTAMP,

  -- Scheduling
  priority INTEGER DEFAULT 10 CHECK (priority >= 1 AND priority <= 15),
  schedule_cron VARCHAR(50) DEFAULT '0 2 * * *',
  last_crawled_at TIMESTAMP,
  next_scheduled_crawl TIMESTAMP,

  -- Crawler Configuration
  crawler_class VARCHAR(100),
  crawl_config JSONB DEFAULT '{}',
  target_table VARCHAR(100),

  -- Performance
  avg_records_per_crawl INTEGER DEFAULT 0,
  avg_duration_seconds INTEGER DEFAULT 0,
  success_rate DECIMAL(5,2) DEFAULT 0.00,

  -- Error Tracking
  consecutive_failures INTEGER DEFAULT 0,
  last_error_message TEXT,
  last_error_at TIMESTAMP,

  -- Metadata
  description TEXT,
  tags JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(100),
  updated_by VARCHAR(100)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_source_registry_enabled ON source_registry(enabled);
CREATE INDEX IF NOT EXISTS idx_source_registry_category ON source_registry(category);
CREATE INDEX IF NOT EXISTS idx_source_registry_priority ON source_registry(priority);
CREATE INDEX IF NOT EXISTS idx_source_registry_next_scheduled ON source_registry(next_scheduled_crawl);
CREATE INDEX IF NOT EXISTS idx_source_registry_discovery_method ON source_registry(discovery_method);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_source_registry_updated_at BEFORE UPDATE
  ON source_registry FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert initial sources from existing crawlers
INSERT INTO source_registry (source_name, source_url, source_type, category, enabled, verified, priority, schedule_cron, crawler_class, target_table, description) VALUES
  -- Regulatory (Priority 1-4)
  ('Federal Register AI Rules', 'https://www.federalregister.gov/api/v1/documents.json', 'api', 'regulatory', true, true, 1, '0 */6 * * *', 'FederalRegisterCrawler', 'ai_regulations', 'US Federal Register API for AI-related regulations'),
  ('EUR-Lex AI Act', 'https://eur-lex.europa.eu/search.html', 'web', 'regulatory', true, true, 2, '0 */6 * * *', 'EURLexCrawler', 'ai_regulations', 'EU legislation and AI Act documentation'),
  ('OECD AI Policy Observatory', 'https://oecd.ai/en/data', 'api', 'regulatory', false, false, 3, '0 2 * * *', 'OECDPolicyCrawler', 'ai_regulations', 'OECD AI policy tracker (needs URL fix)'),
  ('FTC AI Enforcement', 'https://www.ftc.gov/enforcement/cases-proceedings', 'web', 'regulatory', false, false, 4, '0 2 * * *', 'FTCEnforcementCrawler', 'ai_regulations', 'FTC enforcement actions (needs URL fix)'),

  -- Incidents (Priority 5-12)
  ('AIAAIC Repository', 'https://www.aiaaic.org/aiaaic-repository', 'web', 'incidents', true, true, 5, '0 2 * * *', 'AIAAICCrawler', 'ai_incidents', 'AI, Algorithmic, and Automation Incidents Repository'),
  ('AI Incident Database', 'https://incidentdatabase.ai/api/graphql', 'graphql', 'incidents', true, true, 6, '0 2 * * *', 'AIIDBCrawler', 'ai_incidents', 'AI Incident Database (AIID) via GraphQL'),
  ('AVID - AI Vulnerabilities', 'https://avidml.org/api/v1/vulnerabilities', 'api', 'vulnerabilities', true, true, 7, '0 2 * * *', 'AVIDCrawler', 'ai_vulnerabilities', 'AI Vulnerability Database'),
  ('Cyber Incidents', 'https://raw.githubusercontent.com/cve-search/cve-search/master/sightings.json', 'api', 'incidents', true, true, 8, '0 2 * * *', 'CyberIncidentCrawler', 'cyber_incident_staging', 'Cyber security incidents and CVEs'),
  ('Cloud Incidents', 'https://github.com/danluu/post-mortems/blob/master/README.md', 'web', 'incidents', true, true, 9, '0 2 * * *', 'CloudIncidentCrawler', 'cloud_incident_staging', 'Cloud infrastructure post-mortems'),
  ('Failure Patterns', 'https://raw.githubusercontent.com/danluu/debugging-stories/master/README.md', 'web', 'incidents', true, true, 10, '0 2 * * *', 'FailurePatternCrawler', 'failure_patterns', 'System failure patterns and debugging stories'),
  ('AlgorithmWatch', 'https://algorithmwatch.org/en/database/', 'web', 'incidents', false, false, 11, '0 8 * * *', 'AlgorithmWatchCrawler', 'ai_incidents', 'Algorithm accountability cases (needs URL fix)'),
  ('EFF AI Cases', 'https://www.eff.org/issues/ai', 'web', 'incidents', false, false, 12, '0 9 * * *', 'EFFAICrawler', 'ai_incidents', 'Electronic Frontier Foundation AI cases (needs verification)'),

  -- Research & News (Priority 13-15)
  ('ArXiv AI Papers', 'http://export.arxiv.org/api/query', 'api', 'research', true, true, 13, '0 2 * * *', 'ArXivCrawler', 'research_papers', 'ArXiv AI/ML research papers'),
  ('GitHub AI Repositories', 'https://api.github.com/search/repositories', 'api', 'research', true, true, 14, '0 8 * * *', 'GitHubCrawler', 'ai_repositories', 'Trending AI/ML GitHub repositories'),
  ('HackerNews AI', 'https://hn.algolia.com/api/v1/search', 'api', 'news', true, true, 15, '0 */4 * * *', 'HackerNewsCrawler', 'ai_news', 'HackerNews AI-related discussions')
ON CONFLICT (source_url) DO NOTHING;

-- Update next_scheduled_crawl for all enabled sources
UPDATE source_registry
SET next_scheduled_crawl = CURRENT_TIMESTAMP + INTERVAL '1 hour'
WHERE enabled = true AND next_scheduled_crawl IS NULL;

-- Create view for eligible sources
CREATE OR REPLACE VIEW eligible_sources AS
SELECT
  sr.*,
  CASE
    WHEN next_scheduled_crawl IS NULL THEN true
    WHEN next_scheduled_crawl <= CURRENT_TIMESTAMP THEN true
    ELSE false
  END as is_due,
  EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - last_crawled_at))/3600 as hours_since_last_crawl
FROM source_registry sr
WHERE
  sr.enabled = true
  AND sr.consecutive_failures < 5
ORDER BY sr.priority ASC, sr.next_scheduled_crawl ASC;

COMMENT ON VIEW eligible_sources IS 'Sources that are eligible to be crawled';
EOF

echo -e "\n${YELLOW}Migration SQL created at /tmp/source_registry_migration.sql${NC}"

# Get DATABASE_URL from environment
if [ -z "$DATABASE_URL" ]; then
  echo -e "\n${YELLOW}DATABASE_URL not set. Please provide it:${NC}"
  read -p "DATABASE_URL: " DATABASE_URL
fi

# Apply migration
echo -e "\n${YELLOW}Applying database migration...${NC}"
psql "$DATABASE_URL" < /tmp/source_registry_migration.sql

echo -e "\n${GREEN}Database setup complete!${NC}"

# Show created sources
echo -e "\n${YELLOW}Created sources:${NC}"
psql "$DATABASE_URL" -c "SELECT id, source_name, source_type, category, enabled, priority FROM source_registry ORDER BY priority;"

echo -e "\n${YELLOW}Summary:${NC}"
psql "$DATABASE_URL" -c "SELECT category, COUNT(*) as count, COUNT(*) FILTER (WHERE enabled = true) as enabled_count FROM source_registry GROUP BY category ORDER BY category;"

echo -e "\n${GREEN}Done!${NC}"
