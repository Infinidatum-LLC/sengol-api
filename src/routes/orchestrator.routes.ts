/**
 * Orchestrator API Routes
 *
 * Provides HTTP endpoints for crawler orchestration and management
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { crawlerOrchestrator } from '../services/crawler-orchestrator';
import { autoDiscoveryEngine } from '../services/auto-discovery-engine';
import { logger } from '../lib/logger';

interface ExecuteRequest {
  category?: string;
  priority?: number;
  sourceIds?: string[];
  dryRun?: boolean;
}

interface DiscoverRequest {
  domains: string[];
  saveToDatabase?: boolean;
}

export async function orchestratorRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/orchestrator/execute
   * Trigger crawler execution
   */
  fastify.post<{
    Body: ExecuteRequest;
  }>('/execute', async (request: FastifyRequest<{ Body: ExecuteRequest }>, reply: FastifyReply) => {
    try {
      const { category, priority, sourceIds, dryRun } = request.body;

      logger.info('Orchestrator execution requested', {
        category,
        priority,
        sourceIds,
        dryRun,
      });

      const result = await crawlerOrchestrator.execute({
        category,
        priority,
        sourceIds,
        dryRun,
      });

      return reply.status(200).send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('Error executing orchestrator:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/orchestrator/health
   * Health check for orchestrator
   */
  fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const health = await crawlerOrchestrator.healthCheck();

      const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

      return reply.status(statusCode).send({
        success: true,
        data: health,
      });
    } catch (error) {
      logger.error('Error checking orchestrator health:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * GET /api/orchestrator/statistics
   * Get orchestrator statistics
   */
  fastify.get('/statistics', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const stats = await crawlerOrchestrator.getStatistics();

      return reply.status(200).send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting orchestrator statistics:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  /**
   * POST /api/discovery/discover
   * Trigger auto-discovery for domains
   */
  fastify.post<{
    Body: DiscoverRequest;
  }>('/discovery/discover', async (request: FastifyRequest<{ Body: DiscoverRequest }>, reply: FastifyReply) => {
    try {
      const { domains, saveToDatabase = true } = request.body;

      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'domains array is required',
        });
      }

      logger.info('Auto-discovery requested', { domains, saveToDatabase });

      const sources = await autoDiscoveryEngine.discoverSources(domains);

      let savedCount = 0;
      if (saveToDatabase) {
        savedCount = await autoDiscoveryEngine.saveDiscoveredSources(sources);
      }

      return reply.status(200).send({
        success: true,
        data: {
          totalDiscovered: sources.length,
          savedToDatabase: savedCount,
          sources: sources.map(s => ({
            sourceName: s.sourceName,
            sourceUrl: s.sourceUrl,
            sourceType: s.sourceType,
            category: s.category,
            qualityScore: s.qualityScore,
          })),
        },
      });
    } catch (error) {
      logger.error('Error in auto-discovery:', error);
      return reply.status(500).send({
        success: false,
        error: error.message,
      });
    }
  });
}
