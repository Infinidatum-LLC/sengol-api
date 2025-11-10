/**
 * Crawler Orchestrator Service
 *
 * Coordinates crawler execution across multiple worker VMs using Cloud Tasks.
 * Responsible for:
 * - Loading eligible sources from database
 * - Creating crawler tasks in Cloud Tasks queue
 * - Monitoring execution status
 * - Handling failures and retries
 */

import { CloudTasksClient } from '@google-cloud/tasks';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { env } from '../config/env';

interface CrawlerTask {
  sourceId: string;
  sourceName: string;
  sourceUrl: string;
  sourceType: string;
  category: string;
  priority: number;
  crawlerClass: string;
  crawlConfig: Record<string, any>;
}

interface ExecutionOptions {
  category?: string;
  priority?: number;
  sourceIds?: string[];
  dryRun?: boolean;
}

interface ExecutionResult {
  totalSources: number;
  tasksCreated: number;
  tasksSkipped: number;
  errors: string[];
}

export class CrawlerOrchestrator {
  private tasksClient: CloudTasksClient;
  private prisma: PrismaClient;
  private projectId: string;
  private region: string;
  private queueName: string;

  constructor() {
    this.tasksClient = new CloudTasksClient();
    this.prisma = new PrismaClient();
    this.projectId = env.GCP_PROJECT_ID || 'elite-striker-477619-p8';
    this.region = env.GCP_REGION || 'us-central1';
    this.queueName = env.CRAWLER_QUEUE_NAME || 'sengol-crawler-tasks';
  }

  /**
   * Execute crawlers based on filters
   */
  async execute(options: ExecutionOptions = {}): Promise<ExecutionResult> {
    logger.info('Starting crawler orchestration', options);

    const result: ExecutionResult = {
      totalSources: 0,
      tasksCreated: 0,
      tasksSkipped: 0,
      errors: [],
    };

    try {
      // Load eligible sources
      const sources = await this.loadSources(options);
      result.totalSources = sources.length;

      if (sources.length === 0) {
        logger.info('No eligible sources found');
        return result;
      }

      logger.info(`Found ${sources.length} eligible sources`);

      // Filter sources based on eligibility criteria
      const eligibleSources = this.filterEligibleSources(sources);
      result.tasksSkipped = sources.length - eligibleSources.length;

      if (eligibleSources.length === 0) {
        logger.info('No sources passed eligibility filter');
        return result;
      }

      logger.info(`${eligibleSources.length} sources eligible for crawling`);

      // Dry run - just show what would be executed
      if (options.dryRun) {
        logger.info('DRY RUN - Would execute:', {
          sources: eligibleSources.map(s => ({
            name: s.source_name,
            url: s.source_url,
            priority: s.priority,
          })),
        });
        return result;
      }

      // Create tasks for workers
      const tasks = await this.createWorkerTasks(eligibleSources);
      result.tasksCreated = tasks.length;

      logger.info(`Created ${tasks.length} crawler tasks`);

      // Monitor execution (async, don't wait)
      this.monitorExecution(tasks).catch(err => {
        logger.error('Error monitoring execution:', err);
      });

      return result;
    } catch (error) {
      logger.error('Error in orchestrator execution:', error);
      result.errors.push(error.message);
      throw error;
    }
  }

  /**
   * Load sources from database based on filters
   */
  private async loadSources(options: ExecutionOptions) {
    const whereClause: any = {
      enabled: true,
      consecutive_failures: { lt: 5 }, // Skip sources with 5+ consecutive failures
    };

    // Filter by category
    if (options.category) {
      whereClause.category = options.category;
    }

    // Filter by priority
    if (options.priority) {
      whereClause.priority = { lte: options.priority };
    }

    // Filter by specific source IDs
    if (options.sourceIds && options.sourceIds.length > 0) {
      whereClause.id = { in: options.sourceIds };
    }

    // Only sources that are due for crawling
    whereClause.OR = [
      { next_scheduled_crawl: null },
      { next_scheduled_crawl: { lte: new Date() } },
    ];

    return this.prisma.source_registry.findMany({
      where: whereClause,
      orderBy: [
        { priority: 'asc' },
        { next_scheduled_crawl: 'asc' },
      ],
    });
  }

  /**
   * Filter sources based on additional eligibility criteria
   */
  private filterEligibleSources(sources: any[]): any[] {
    return sources.filter(source => {
      // Skip if crawled in last hour (safety check)
      if (source.last_crawled_at) {
        const hoursSinceLastCrawl =
          (Date.now() - new Date(source.last_crawled_at).getTime()) / (1000 * 60 * 60);

        if (hoursSinceLastCrawl < 1) {
          logger.debug(`Skipping ${source.source_name} - crawled ${hoursSinceLastCrawl.toFixed(1)}h ago`);
          return false;
        }
      }

      // Skip if URL is missing
      if (!source.source_url) {
        logger.warn(`Skipping ${source.source_name} - no URL configured`);
        return false;
      }

      // Skip if crawler class is missing
      if (!source.crawler_class) {
        logger.warn(`Skipping ${source.source_name} - no crawler class configured`);
        return false;
      }

      return true;
    });
  }

  /**
   * Create Cloud Tasks for crawler workers
   */
  private async createWorkerTasks(sources: any[]): Promise<string[]> {
    const queuePath = this.tasksClient.queuePath(
      this.projectId,
      this.region,
      this.queueName
    );

    const taskPromises = sources.map(async (source, index) => {
      const task: CrawlerTask = {
        sourceId: source.id,
        sourceName: source.source_name,
        sourceUrl: source.source_url,
        sourceType: source.source_type,
        category: source.category,
        priority: source.priority,
        crawlerClass: source.crawler_class,
        crawlConfig: source.crawl_config || {},
      };

      // Create Cloud Task
      const taskRequest = {
        parent: queuePath,
        task: {
          httpRequest: {
            httpMethod: 'POST' as const,
            url: `http://sengol-crawler-worker-1:3000/api/crawler/execute`,
            headers: {
              'Content-Type': 'application/json',
            },
            body: Buffer.from(JSON.stringify(task)).toString('base64'),
          },
          scheduleTime: {
            seconds: Math.floor(Date.now() / 1000) + (index * 2), // Stagger by 2 seconds
          },
        },
      };

      try {
        const [response] = await this.tasksClient.createTask(taskRequest);
        logger.info(`Created task for ${source.source_name}`, {
          taskName: response.name,
        });

        // Record execution start in database
        await this.prisma.crawler_executions.create({
          data: {
            crawler_type: source.crawler_class,
            crawler_name: source.source_name,
            source_id: source.id,
            started_at: new Date(),
            status: 'queued',
            execution_metadata: {
              taskName: response.name,
              scheduledTime: taskRequest.task.scheduleTime,
            },
          },
        });

        return response.name!;
      } catch (error) {
        logger.error(`Failed to create task for ${source.source_name}:`, error);
        return null;
      }
    });

    const taskNames = await Promise.all(taskPromises);
    return taskNames.filter(name => name !== null) as string[];
  }

  /**
   * Monitor execution status (async)
   */
  private async monitorExecution(taskNames: string[]): Promise<void> {
    logger.info(`Monitoring ${taskNames.length} tasks`);

    // This would typically poll the database or use Pub/Sub
    // For now, just log that monitoring started
    // In production, this would:
    // 1. Subscribe to completion events via Pub/Sub
    // 2. Update crawler_executions table
    // 3. Calculate success rates
    // 4. Alert on failures

    setTimeout(() => {
      logger.info('Monitoring session started (async)');
    }, 1000);
  }

  /**
   * Health check for orchestrator
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {};

    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;
      details.database = 'connected';
    } catch (error) {
      details.database = 'disconnected';
      details.databaseError = error.message;
    }

    try {
      // Check Cloud Tasks queue
      const queuePath = this.tasksClient.queuePath(
        this.projectId,
        this.region,
        this.queueName
      );
      await this.tasksClient.getQueue({ name: queuePath });
      details.cloudTasks = 'available';
    } catch (error) {
      details.cloudTasks = 'unavailable';
      details.cloudTasksError = error.message;
    }

    // Check source registry
    try {
      const sourceCount = await this.prisma.source_registry.count({
        where: { enabled: true },
      });
      details.enabledSources = sourceCount;
    } catch (error) {
      details.sourcesError = error.message;
    }

    // Determine overall status
    const status =
      details.database === 'disconnected' || details.cloudTasks === 'unavailable'
        ? 'unhealthy'
        : details.sourcesError
        ? 'degraded'
        : 'healthy';

    return { status, details };
  }

  /**
   * Get orchestrator statistics
   */
  async getStatistics(): Promise<Record<string, any>> {
    const [
      totalSources,
      enabledSources,
      sourcesNeedingCrawl,
      recentExecutions,
      failedSources,
    ] = await Promise.all([
      this.prisma.source_registry.count(),
      this.prisma.source_registry.count({ where: { enabled: true } }),
      this.prisma.source_registry.count({
        where: {
          enabled: true,
          OR: [
            { next_scheduled_crawl: null },
            { next_scheduled_crawl: { lte: new Date() } },
          ],
        },
      }),
      this.prisma.crawler_executions.count({
        where: {
          started_at: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      }),
      this.prisma.source_registry.count({
        where: {
          enabled: true,
          consecutive_failures: { gte: 3 },
        },
      }),
    ]);

    return {
      totalSources,
      enabledSources,
      sourcesNeedingCrawl,
      recentExecutions,
      failedSources,
      lastUpdated: new Date(),
    };
  }

  /**
   * Cleanup and disconnect
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
    await this.tasksClient.close();
  }
}

// Export singleton instance
export const crawlerOrchestrator = new CrawlerOrchestrator();
