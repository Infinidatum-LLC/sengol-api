/**
 * Auto-Discovery Engine
 *
 * Automatically discovers new data sources for crawlers:
 * - RSS feeds
 * - APIs (OpenAPI/Swagger)
 * - Sitemaps
 * - Web pages
 *
 * Scores sources based on:
 * - Relevance (keyword matching)
 * - Authority (domain metrics)
 * - Freshness (update frequency)
 */

import axios from 'axios';
import * as cheerio from 'cheerio';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';

interface DiscoveredSource {
  sourceName: string;
  sourceUrl: string;
  sourceType: 'rss' | 'api' | 'web' | 'sitemap';
  category: string;
  discoveryMethod: string;
  qualityScore: number;
  metadata: Record<string, any>;
}

interface RSSSource extends DiscoveredSource {
  sourceType: 'rss';
  metadata: {
    title?: string;
    description?: string;
    items?: number;
    lastBuildDate?: string;
  };
}

interface APISource extends DiscoveredSource {
  sourceType: 'api';
  metadata: {
    apiType?: 'rest' | 'graphql' | 'openapi';
    version?: string;
    endpoints?: number;
  };
}

interface WebSource extends DiscoveredSource {
  sourceType: 'web';
  metadata: {
    title?: string;
    keywords?: string[];
    linkCount?: number;
  };
}

const AI_KEYWORDS = [
  'artificial intelligence',
  'machine learning',
  'ai',
  'ml',
  'deep learning',
  'neural network',
  'algorithm',
  'automation',
  'incident',
  'vulnerability',
  'regulation',
  'governance',
  'ethics',
  'safety',
  'risk',
];

export class AutoDiscoveryEngine {
  private prisma: PrismaClient;
  private axiosInstance: typeof axios;

  constructor() {
    this.prisma = new PrismaClient();
    this.axiosInstance = axios.create({
      timeout: 10000,
      headers: {
        'User-Agent': 'SengolCrawlerBot/1.0 (Auto-discovery)',
      },
    });
  }

  /**
   * Discover RSS feeds from a domain
   */
  async discoverRSSFeeds(domain: string): Promise<RSSSource[]> {
    logger.info(`Discovering RSS feeds for ${domain}`);
    const feeds: RSSSource[] = [];

    try {
      // Fetch homepage
      const response = await this.axiosInstance.get(domain);
      const $ = cheerio.load(response.data);

      // Method 1: Find <link> tags with RSS
      $('link[type="application/rss+xml"], link[type="application/atom+xml"]').each(
        (_, el) => {
          const href = $(el).attr('href');
          const title = $(el).attr('title') || 'Untitled Feed';

          if (href) {
            const feedUrl = this.resolveUrl(domain, href);
            feeds.push({
              sourceName: title,
              sourceUrl: feedUrl,
              sourceType: 'rss',
              category: this.inferCategory(title),
              discoveryMethod: 'auto_rss',
              qualityScore: 0, // Will be calculated later
              metadata: { title },
            });
          }
        }
      );

      // Method 2: Common RSS paths
      const commonPaths = [
        '/feed',
        '/rss',
        '/feed.xml',
        '/rss.xml',
        '/atom.xml',
        '/feeds/posts/default',
      ];

      for (const path of commonPaths) {
        const feedUrl = new URL(path, domain).toString();
        try {
          const feedResponse = await this.axiosInstance.get(feedUrl);
          if (
            feedResponse.status === 200 &&
            (feedResponse.data.includes('<rss') || feedResponse.data.includes('<feed'))
          ) {
            feeds.push({
              sourceName: `${new URL(domain).hostname} RSS`,
              sourceUrl: feedUrl,
              sourceType: 'rss',
              category: 'news',
              discoveryMethod: 'auto_rss',
              qualityScore: 0,
              metadata: {},
            });
          }
        } catch {
          // Ignore 404s
        }
      }

      // Score and validate feeds
      const validatedFeeds = await Promise.all(
        feeds.map(async feed => {
          const score = await this.scoreRSSFeed(feed.sourceUrl);
          return { ...feed, qualityScore: score };
        })
      );

      return validatedFeeds.filter(f => f.qualityScore > 30); // Only keep decent quality
    } catch (error) {
      logger.error(`Error discovering RSS feeds for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Discover APIs from a domain
   */
  async discoverAPIs(domain: string): Promise<APISource[]> {
    logger.info(`Discovering APIs for ${domain}`);
    const apis: APISource[] = [];

    try {
      // Common API documentation paths
      const apiPaths = [
        '/api',
        '/api/docs',
        '/api/v1',
        '/swagger',
        '/swagger.json',
        '/openapi.json',
        '/api/swagger/ui',
        '/graphql',
      ];

      for (const path of apiPaths) {
        const apiUrl = new URL(path, domain).toString();
        try {
          const response = await this.axiosInstance.get(apiUrl);

          if (response.status === 200) {
            let apiType: 'rest' | 'graphql' | 'openapi' = 'rest';

            // Detect API type
            if (path.includes('graphql') || response.data.includes('__schema')) {
              apiType = 'graphql';
            } else if (
              path.includes('swagger') ||
              path.includes('openapi') ||
              response.data.swagger ||
              response.data.openapi
            ) {
              apiType = 'openapi';
            }

            apis.push({
              sourceName: `${new URL(domain).hostname} ${apiType.toUpperCase()} API`,
              sourceUrl: apiUrl,
              sourceType: 'api',
              category: this.inferCategoryFromUrl(apiUrl),
              discoveryMethod: 'auto_api',
              qualityScore: 0,
              metadata: {
                apiType,
                version: response.data.info?.version || 'unknown',
              },
            });
          }
        } catch {
          // Ignore 404s
        }
      }

      // Score APIs
      const scoredAPIs = apis.map(api => ({
        ...api,
        qualityScore: this.scoreAPI(api),
      }));

      return scoredAPIs.filter(a => a.qualityScore > 40);
    } catch (error) {
      logger.error(`Error discovering APIs for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Discover sources from sitemap
   */
  async discoverFromSitemap(domain: string): Promise<WebSource[]> {
    logger.info(`Discovering sources from sitemap for ${domain}`);
    const sources: WebSource[] = [];

    try {
      // Try common sitemap paths
      const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemap'];

      for (const path of sitemapPaths) {
        const sitemapUrl = new URL(path, domain).toString();
        try {
          const response = await this.axiosInstance.get(sitemapUrl);

          if (response.status === 200 && response.data.includes('<urlset')) {
            const $ = cheerio.load(response.data, { xmlMode: true });

            $('url > loc').each((_, el) => {
              const url = $(el).text();

              // Filter by keywords
              if (this.containsAIKeywords(url)) {
                sources.push({
                  sourceName: this.extractTitleFromUrl(url),
                  sourceUrl: url,
                  sourceType: 'web',
                  category: this.inferCategoryFromUrl(url),
                  discoveryMethod: 'auto_sitemap',
                  qualityScore: 0,
                  metadata: {},
                });
              }
            });
          }
        } catch {
          // Ignore 404s
        }
      }

      // Score sources
      const scoredSources = sources.map(s => ({
        ...s,
        qualityScore: this.scoreWebSource(s),
      }));

      return scoredSources.filter(s => s.qualityScore > 35);
    } catch (error) {
      logger.error(`Error discovering from sitemap for ${domain}:`, error);
      return [];
    }
  }

  /**
   * Score an RSS feed based on quality metrics
   */
  private async scoreRSSFeed(feedUrl: string): Promise<number> {
    try {
      const response = await this.axiosInstance.get(feedUrl);
      const $ = cheerio.load(response.data, { xmlMode: true });

      let score = 50; // Base score

      // Check for recent items
      const items = $('item, entry');
      if (items.length > 10) score += 15;
      if (items.length > 50) score += 10;

      // Check update frequency
      const lastBuildDate = $('lastBuildDate, updated').first().text();
      if (lastBuildDate) {
        const daysSinceUpdate =
          (Date.now() - new Date(lastBuildDate).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceUpdate < 1) score += 20;
        else if (daysSinceUpdate < 7) score += 10;
        else if (daysSinceUpdate > 90) score -= 20;
      }

      // Check for AI-related content
      const content = response.data.toLowerCase();
      const keywordMatches = AI_KEYWORDS.filter(kw => content.includes(kw)).length;
      score += Math.min(keywordMatches * 2, 20);

      return Math.min(Math.max(score, 0), 100);
    } catch {
      return 0;
    }
  }

  /**
   * Score an API based on heuristics
   */
  private scoreAPI(api: APISource): number {
    let score = 60; // Base score for APIs

    // OpenAPI/Swagger is more structured
    if (api.metadata.apiType === 'openapi') score += 15;
    if (api.metadata.apiType === 'graphql') score += 10;

    // Check if URL contains AI keywords
    const url = api.sourceUrl.toLowerCase();
    const keywordMatches = AI_KEYWORDS.filter(kw => url.includes(kw)).length;
    score += Math.min(keywordMatches * 5, 20);

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Score a web source
   */
  private scoreWebSource(source: WebSource): number {
    let score = 40; // Base score

    // Check for keywords in URL
    const url = source.sourceUrl.toLowerCase();
    const keywordMatches = AI_KEYWORDS.filter(kw => url.includes(kw)).length;
    score += Math.min(keywordMatches * 3, 20);

    // Prefer known domains
    if (
      url.includes('gov') ||
      url.includes('edu') ||
      url.includes('org') ||
      url.includes('ieee')
    ) {
      score += 15;
    }

    return Math.min(Math.max(score, 0), 100);
  }

  /**
   * Infer category from title or URL
   */
  private inferCategory(text: string): string {
    const lower = text.toLowerCase();

    if (
      lower.includes('regulation') ||
      lower.includes('policy') ||
      lower.includes('law') ||
      lower.includes('compliance')
    ) {
      return 'regulatory';
    }

    if (
      lower.includes('incident') ||
      lower.includes('vulnerability') ||
      lower.includes('breach')
    ) {
      return 'incidents';
    }

    if (lower.includes('research') || lower.includes('paper') || lower.includes('arxiv')) {
      return 'research';
    }

    if (lower.includes('news') || lower.includes('blog')) {
      return 'news';
    }

    return 'news'; // Default
  }

  /**
   * Infer category from URL
   */
  private inferCategoryFromUrl(url: string): string {
    const lower = url.toLowerCase();

    if (lower.includes('/regulation') || lower.includes('/policy')) {
      return 'regulatory';
    }

    if (lower.includes('/incident') || lower.includes('/vulnerability')) {
      return 'incidents';
    }

    if (lower.includes('/research') || lower.includes('/paper')) {
      return 'research';
    }

    return 'news';
  }

  /**
   * Check if URL/text contains AI keywords
   */
  private containsAIKeywords(text: string): boolean {
    const lower = text.toLowerCase();
    return AI_KEYWORDS.some(kw => lower.includes(kw));
  }

  /**
   * Extract title from URL
   */
  private extractTitleFromUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname
        .split('/')
        .filter(p => p)
        .pop();
      return path ? path.replace(/-/g, ' ').replace(/_/g, ' ') : urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(base: string, relative: string): string {
    try {
      return new URL(relative, base).toString();
    } catch {
      return relative;
    }
  }

  /**
   * Discover all sources from a list of domains
   */
  async discoverSources(domains: string[]): Promise<DiscoveredSource[]> {
    logger.info(`Starting auto-discovery for ${domains.length} domains`);

    const allSources: DiscoveredSource[] = [];

    for (const domain of domains) {
      try {
        const [rssFeeds, apis, sitemapSources] = await Promise.all([
          this.discoverRSSFeeds(domain),
          this.discoverAPIs(domain),
          this.discoverFromSitemap(domain),
        ]);

        allSources.push(...rssFeeds, ...apis, ...sitemapSources);

        logger.info(`Discovered ${rssFeeds.length + apis.length + sitemapSources.length} sources for ${domain}`);
      } catch (error) {
        logger.error(`Error discovering sources for ${domain}:`, error);
      }

      // Rate limit: wait 2 seconds between domains
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Deduplicate by URL
    const uniqueSources = this.deduplicateSources(allSources);

    logger.info(`Total discovered: ${uniqueSources.length} unique sources`);

    return uniqueSources;
  }

  /**
   * Deduplicate sources by URL
   */
  private deduplicateSources(sources: DiscoveredSource[]): DiscoveredSource[] {
    const seen = new Set<string>();
    return sources.filter(source => {
      if (seen.has(source.sourceUrl)) {
        return false;
      }
      seen.add(source.sourceUrl);
      return true;
    });
  }

  /**
   * Save discovered sources to database
   */
  async saveDiscoveredSources(sources: DiscoveredSource[]): Promise<number> {
    logger.info(`Saving ${sources.length} discovered sources to database`);

    let savedCount = 0;

    for (const source of sources) {
      try {
        await this.prisma.source_registry.create({
          data: {
            source_name: source.sourceName,
            source_url: source.sourceUrl,
            source_type: source.sourceType,
            category: source.category,
            discovery_method: source.discoveryMethod,
            quality_score: source.qualityScore,
            enabled: false, // Require manual verification
            verified: false,
            priority: 15, // Lowest priority for unverified sources
            metadata: source.metadata,
          },
        });
        savedCount++;
      } catch (error) {
        // Likely duplicate URL (unique constraint)
        logger.debug(`Skipping duplicate source: ${source.sourceUrl}`);
      }
    }

    logger.info(`Saved ${savedCount} new sources`);

    return savedCount;
  }

  /**
   * Cleanup
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export const autoDiscoveryEngine = new AutoDiscoveryEngine();
