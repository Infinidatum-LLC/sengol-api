/**
 * Qdrant Loader Service
 *
 * Loads embeddings from GCS into Qdrant vector database.
 * Triggered by Pub/Sub events when new embeddings are generated.
 *
 * Process:
 * 1. Receive task via Pub/Sub (embeddings generated event)
 * 2. Download embeddings from GCS
 * 3. Ensure Qdrant collection exists
 * 4. Upsert embeddings to Qdrant (incremental update)
 * 5. Update embedding_status in PostgreSQL
 * 6. Publish completion event
 */

import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { QdrantClient } from '@qdrant/js-client-rest';
import { PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { env } from '../config/env';

interface QdrantLoadTask {
  sourceId: string;
  sourceName: string;
  category: string;
  embeddingsPath: string;
  recordCount: number;
}

interface EmbeddingRecord {
  id: string;
  embedding_id: string;
  embedding: number[];
  embedding_text: string;
  metadata: Record<string, any>;
}

const QDRANT_COLLECTION = 'sengol_incidents_full';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100;

export class QdrantLoader {
  private storage: Storage;
  private pubsub: PubSub;
  private qdrant: QdrantClient;
  private prisma: PrismaClient;
  private embeddingsBucket: string;
  private qdrantHost: string;
  private qdrantPort: number;

  constructor() {
    this.storage = new Storage();
    this.pubsub = new PubSub();
    this.prisma = new PrismaClient();
    this.embeddingsBucket = 'sengol-incidents-elite';
    this.qdrantHost = env.DVECDB_HOST || 'localhost';
    this.qdrantPort = parseInt(env.DVECDB_PORT || '6333');

    this.qdrant = new QdrantClient({
      url: `http://${this.qdrantHost}:${this.qdrantPort}`,
    });
  }

  /**
   * Process Qdrant load task
   */
  async processTask(task: QdrantLoadTask): Promise<void> {
    logger.info(`Processing Qdrant load task for ${task.sourceName}`, {
      embeddingsPath: task.embeddingsPath,
      recordCount: task.recordCount,
    });

    try {
      // 1. Download embeddings from GCS
      const embeddings = await this.downloadEmbeddings(task.embeddingsPath);
      logger.info(`Downloaded ${embeddings.length} embeddings`);

      if (embeddings.length === 0) {
        logger.warn('No embeddings found in file');
        return;
      }

      // 2. Ensure collection exists
      await this.ensureCollection();

      // 3. Upsert embeddings to Qdrant
      const upsertedCount = await this.upsertToQdrant(embeddings);
      logger.info(`Upserted ${upsertedCount} vectors to Qdrant`);

      // 4. Update embedding_status in database
      await this.updateEmbeddingStatus(embeddings, task.category);

      // 5. Publish completion event
      await this.publishCompletionEvent({
        sourceId: task.sourceId,
        sourceName: task.sourceName,
        category: task.category,
        vectorsLoaded: upsertedCount,
      });

      logger.info(`Qdrant load complete for ${task.sourceName}`);
    } catch (error) {
      logger.error(`Error processing Qdrant load task:`, error);
      throw error;
    }
  }

  /**
   * Download embeddings from GCS
   */
  private async downloadEmbeddings(gcsPath: string): Promise<EmbeddingRecord[]> {
    const bucket = this.storage.bucket(this.embeddingsBucket);
    const file = bucket.file(gcsPath);

    try {
      const [content] = await file.download();
      const lines = content.toString('utf-8').trim().split('\n');

      return lines
        .filter(line => line.trim())
        .map(line => {
          try {
            return JSON.parse(line);
          } catch (error) {
            logger.error(`Error parsing line: ${line.substring(0, 100)}...`, error);
            return null;
          }
        })
        .filter((record): record is EmbeddingRecord => record !== null);
    } catch (error) {
      logger.error(`Error downloading from GCS: ${gcsPath}`, error);
      throw error;
    }
  }

  /**
   * Ensure Qdrant collection exists
   */
  private async ensureCollection(): Promise<void> {
    try {
      const collections = await this.qdrant.getCollections();
      const exists = collections.collections.some(c => c.name === QDRANT_COLLECTION);

      if (!exists) {
        logger.info(`Creating Qdrant collection: ${QDRANT_COLLECTION}`);

        await this.qdrant.createCollection(QDRANT_COLLECTION, {
          vectors: {
            size: EMBEDDING_DIMENSIONS,
            distance: 'Cosine',
          },
          optimizers_config: {
            indexing_threshold: 20000,
          },
        });

        logger.info('Collection created successfully');
      }
    } catch (error) {
      logger.error('Error ensuring collection exists:', error);
      throw error;
    }
  }

  /**
   * Upsert embeddings to Qdrant
   */
  private async upsertToQdrant(embeddings: EmbeddingRecord[]): Promise<number> {
    let upsertedCount = 0;

    // Process in batches
    for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
      const batch = embeddings.slice(i, i + BATCH_SIZE);

      logger.info(`Upserting batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(embeddings.length / BATCH_SIZE)}`);

      const points = batch.map(record => ({
        id: record.id,
        vector: record.embedding,
        payload: {
          embedding_id: record.embedding_id,
          embedding_text: record.embedding_text,
          content: record.metadata.original_record?.description ||
                   record.metadata.original_record?.text ||
                   record.embedding_text,
          source_file: record.metadata.source_file,
          category: record.metadata.category,
          metadata: record.metadata,
        },
      }));

      try {
        await this.qdrant.upsert(QDRANT_COLLECTION, {
          wait: true,
          points,
        });

        upsertedCount += points.length;
      } catch (error) {
        logger.error(`Error upserting batch ${i}:`, error);
        // Continue with next batch instead of failing completely
      }
    }

    return upsertedCount;
  }

  /**
   * Update embedding_status in PostgreSQL
   */
  private async updateEmbeddingStatus(
    embeddings: EmbeddingRecord[],
    category: string
  ): Promise<void> {
    // Map category to table name
    const tableMap: Record<string, string> = {
      incidents: 'ai_incidents',
      vulnerabilities: 'ai_vulnerabilities',
      regulatory: 'ai_regulations',
      research: 'research_papers',
      news: 'ai_news',
    };

    const tableName = tableMap[category];

    if (!tableName) {
      logger.warn(`Unknown category ${category}, skipping status update`);
      return;
    }

    try {
      // Update in batches
      for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
        const batch = embeddings.slice(i, i + BATCH_SIZE);
        const ids = batch.map(e => e.id);

        // Use raw SQL for flexibility across tables
        await this.prisma.$executeRaw`
          UPDATE ${tableName}
          SET
            embedding_status = 'completed',
            embedding_id = ${batch[0].embedding_id},
            embedding_generated_at = NOW()
          WHERE id = ANY(${ids})
        `;
      }

      logger.info(`Updated embedding_status for ${embeddings.length} records in ${tableName}`);
    } catch (error) {
      logger.error(`Error updating embedding_status in ${tableName}:`, error);
      // Don't throw - vectors are already in Qdrant
    }
  }

  /**
   * Publish completion event to Pub/Sub
   */
  private async publishCompletionEvent(data: {
    sourceId: string;
    sourceName: string;
    category: string;
    vectorsLoaded: number;
  }): Promise<void> {
    const topic = this.pubsub.topic('sengol-qdrant-updated');

    const message = {
      data: Buffer.from(JSON.stringify(data)),
      attributes: {
        sourceId: data.sourceId,
        category: data.category,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      await topic.publishMessage(message);
      logger.info('Published qdrant-updated event', data);
    } catch (error) {
      logger.error('Error publishing Pub/Sub event:', error);
      // Don't throw - vectors are already loaded
    }
  }

  /**
   * Listen for embeddings-generated events and process
   */
  async startListener(): Promise<void> {
    const subscription = this.pubsub.subscription('sengol-embeddings-generated-sub');

    logger.info('Starting Pub/Sub listener for embeddings-generated events');

    subscription.on('message', async message => {
      try {
        const task: QdrantLoadTask = JSON.parse(message.data.toString());
        logger.info('Received Qdrant load task', task);

        await this.processTask(task);

        message.ack();
      } catch (error) {
        logger.error('Error processing message:', error);
        message.nack(); // Retry
      }
    });

    subscription.on('error', error => {
      logger.error('Subscription error:', error);
    });
  }

  /**
   * Get Qdrant collection statistics
   */
  async getStatistics(): Promise<Record<string, any>> {
    try {
      const collectionInfo = await this.qdrant.getCollection(QDRANT_COLLECTION);

      return {
        collection: QDRANT_COLLECTION,
        pointsCount: collectionInfo.points_count,
        indexedVectorsCount: collectionInfo.indexed_vectors_count,
        vectorsConfig: collectionInfo.config?.params?.vectors,
        status: collectionInfo.status,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Error getting Qdrant statistics:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {};

    try {
      // Check GCS access
      await this.storage.bucket(this.embeddingsBucket).exists();
      details.gcs = 'accessible';
    } catch (error) {
      details.gcs = 'inaccessible';
      details.gcsError = error.message;
    }

    try {
      // Check Qdrant connection
      const collections = await this.qdrant.getCollections();
      details.qdrant = 'connected';
      details.collections = collections.collections.length;
    } catch (error) {
      details.qdrant = 'disconnected';
      details.qdrantError = error.message;
    }

    try {
      // Check database connection
      await this.prisma.$queryRaw`SELECT 1`;
      details.database = 'connected';
    } catch (error) {
      details.database = 'disconnected';
      details.databaseError = error.message;
    }

    try {
      // Check Pub/Sub
      await this.pubsub.topic('sengol-qdrant-updated').exists();
      details.pubsub = 'accessible';
    } catch (error) {
      details.pubsub = 'inaccessible';
      details.pubsubError = error.message;
    }

    const status =
      details.qdrant === 'disconnected' || details.gcs === 'inaccessible'
        ? 'unhealthy'
        : details.database === 'disconnected' || details.pubsub === 'inaccessible'
        ? 'degraded'
        : 'healthy';

    return { status, details };
  }

  /**
   * Cleanup
   */
  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }
}

// Export singleton instance
export const qdrantLoader = new QdrantLoader();
