/**
 * Embedding Generator Service
 *
 * Generates OpenAI embeddings for crawled data and uploads to GCS.
 * Triggered by Pub/Sub events when new data is crawled.
 *
 * Process:
 * 1. Receive task via Pub/Sub (data crawled event)
 * 2. Download raw data from GCS
 * 3. Extract embedding text from each record
 * 4. Generate embeddings using OpenAI (batch processing)
 * 5. Upload embeddings to GCS
 * 6. Publish event (embeddings generated)
 */

import { Storage } from '@google-cloud/storage';
import { PubSub } from '@google-cloud/pubsub';
import { OpenAI } from 'openai';
import { logger } from '../lib/logger';
import { env } from '../config/env';

interface EmbeddingTask {
  sourceId: string;
  sourceName: string;
  category: string;
  gcsPath: string; // Path to raw data in GCS
  recordCount: number;
}

interface EmbeddingRecord {
  id: string;
  embedding_id: string;
  embedding: number[];
  embedding_text: string;
  metadata: Record<string, any>;
}

const EMBEDDING_MODEL = 'text-embedding-3-small';
const EMBEDDING_DIMENSIONS = 1536;
const BATCH_SIZE = 100;
const RATE_LIMIT_DELAY = 100; // ms between batches

export class EmbeddingGenerator {
  private storage: Storage;
  private pubsub: PubSub;
  private openai: OpenAI;
  private projectId: string;
  private rawBucket: string;
  private embeddingsBucket: string;

  constructor() {
    this.storage = new Storage();
    this.pubsub = new PubSub();
    this.openai = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });
    this.projectId = env.GCP_PROJECT_ID || 'elite-striker-477619-p8';
    this.rawBucket = 'sengol-crawled-data-processed';
    this.embeddingsBucket = 'sengol-incidents-elite';
  }

  /**
   * Process embedding generation task
   */
  async processTask(task: EmbeddingTask): Promise<void> {
    logger.info(`Processing embedding task for ${task.sourceName}`, {
      gcsPath: task.gcsPath,
      recordCount: task.recordCount,
    });

    try {
      // 1. Download raw data from GCS
      const records = await this.downloadAndParse(task.gcsPath);
      logger.info(`Downloaded ${records.length} records`);

      if (records.length === 0) {
        logger.warn('No records found in file');
        return;
      }

      // 2. Generate embeddings in batches
      const embeddingRecords = await this.generateEmbeddings(records, task.category);
      logger.info(`Generated ${embeddingRecords.length} embeddings`);

      // 3. Upload embeddings to GCS
      const outputPath = this.getEmbeddingsPath(task);
      await this.uploadEmbeddings(outputPath, embeddingRecords);
      logger.info(`Uploaded embeddings to ${outputPath}`);

      // 4. Publish completion event
      await this.publishCompletionEvent({
        sourceId: task.sourceId,
        sourceName: task.sourceName,
        category: task.category,
        embeddingsPath: outputPath,
        recordCount: embeddingRecords.length,
      });

      logger.info(`Embedding generation complete for ${task.sourceName}`);
    } catch (error) {
      logger.error(`Error processing embedding task:`, error);
      throw error;
    }
  }

  /**
   * Download and parse raw data from GCS
   */
  private async downloadAndParse(gcsPath: string): Promise<any[]> {
    const bucket = this.storage.bucket(this.rawBucket);
    const file = bucket.file(gcsPath);

    try {
      const [content] = await file.download();
      const data = JSON.parse(content.toString('utf-8'));

      // Handle both array and object formats
      if (Array.isArray(data)) {
        return data;
      } else if (data.records) {
        return data.records;
      } else {
        return [data];
      }
    } catch (error) {
      logger.error(`Error downloading from GCS: ${gcsPath}`, error);
      throw error;
    }
  }

  /**
   * Generate embeddings for all records
   */
  private async generateEmbeddings(
    records: any[],
    category: string
  ): Promise<EmbeddingRecord[]> {
    const embeddingRecords: EmbeddingRecord[] = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);

      logger.info(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(records.length / BATCH_SIZE)}`);

      // Extract embedding text for each record
      const embeddingTexts = batch.map(record => this.extractEmbeddingText(record, category));

      try {
        // Call OpenAI API
        const response = await this.openai.embeddings.create({
          model: EMBEDDING_MODEL,
          input: embeddingTexts,
          dimensions: EMBEDDING_DIMENSIONS,
        });

        // Create embedding records
        for (let j = 0; j < batch.length; j++) {
          const record = batch[j];
          const embedding = response.data[j].embedding;

          embeddingRecords.push({
            id: record.id || record.external_id || `${category}_${i + j}`,
            embedding_id: `emb_${category}_${record.id || i + j}`,
            embedding,
            embedding_text: embeddingTexts[j],
            metadata: {
              source_file: `${category}.json`,
              category,
              original_record: record,
            },
          });
        }

        // Rate limiting
        if (i + BATCH_SIZE < records.length) {
          await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_DELAY));
        }
      } catch (error) {
        logger.error(`Error generating embeddings for batch ${i}:`, error);
        // Continue with next batch instead of failing completely
      }
    }

    return embeddingRecords;
  }

  /**
   * Extract embedding text from a record based on category
   */
  private extractEmbeddingText(record: any, category: string): string {
    let text = '';

    switch (category) {
      case 'incidents':
      case 'vulnerabilities':
        text = `${record.title || ''}\n${record.description || ''}\n${
          record.technical_details || ''
        }\nSeverity: ${record.severity || 'unknown'}\nOrganization: ${
          record.organization || 'unknown'
        }`;
        break;

      case 'regulatory':
        text = `${record.title || ''}\n${record.description || ''}\n${
          record.regulation_text || ''
        }\nJurisdiction: ${record.jurisdiction || 'unknown'}`;
        break;

      case 'research':
        text = `${record.title || ''}\n${record.abstract || ''}\nAuthors: ${
          record.authors?.join(', ') || 'unknown'
        }\nKeywords: ${record.keywords?.join(', ') || ''}`;
        break;

      case 'news':
        text = `${record.title || ''}\n${record.text || record.description || ''}`;
        break;

      default:
        // Generic fallback
        text = `${record.title || ''}\n${
          record.description || record.text || record.content || JSON.stringify(record).substring(0, 500)
        }`;
    }

    // Truncate to avoid token limits (max ~8000 tokens for text-embedding-3-small)
    return text.substring(0, 8000);
  }

  /**
   * Upload embeddings to GCS
   */
  private async uploadEmbeddings(
    gcsPath: string,
    embeddingRecords: EmbeddingRecord[]
  ): Promise<void> {
    const bucket = this.storage.bucket(this.embeddingsBucket);
    const file = bucket.file(gcsPath);

    // Format: JSONL (one JSON object per line)
    const jsonl = embeddingRecords.map(record => JSON.stringify(record)).join('\n');

    try {
      await file.save(jsonl, {
        contentType: 'application/x-ndjson',
        metadata: {
          recordCount: embeddingRecords.length.toString(),
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS.toString(),
          generatedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      logger.error(`Error uploading to GCS: ${gcsPath}`, error);
      throw error;
    }
  }

  /**
   * Get embeddings output path in GCS
   */
  private getEmbeddingsPath(task: EmbeddingTask): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const fileName = task.gcsPath.split('/').pop()?.replace('.json', '') || 'unknown';
    return `incidents/embeddings/openai-1536/${task.category}/${fileName}_${timestamp}.jsonl`;
  }

  /**
   * Publish completion event to Pub/Sub
   */
  private async publishCompletionEvent(data: {
    sourceId: string;
    sourceName: string;
    category: string;
    embeddingsPath: string;
    recordCount: number;
  }): Promise<void> {
    const topic = this.pubsub.topic('sengol-embeddings-generated');

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
      logger.info('Published embeddings-generated event', data);
    } catch (error) {
      logger.error('Error publishing Pub/Sub event:', error);
      // Don't throw - embeddings are already generated
    }
  }

  /**
   * Listen for data-crawled events and process
   */
  async startListener(): Promise<void> {
    const subscription = this.pubsub.subscription('sengol-data-crawled-sub');

    logger.info('Starting Pub/Sub listener for data-crawled events');

    subscription.on('message', async message => {
      try {
        const task: EmbeddingTask = JSON.parse(message.data.toString());
        logger.info('Received embedding task', task);

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
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  }> {
    const details: Record<string, any> = {};

    try {
      // Check GCS access
      await this.storage.bucket(this.rawBucket).exists();
      details.gcs = 'accessible';
    } catch (error) {
      details.gcs = 'inaccessible';
      details.gcsError = error.message;
    }

    try {
      // Check OpenAI API (simple test)
      await this.openai.models.list();
      details.openai = 'accessible';
    } catch (error) {
      details.openai = 'inaccessible';
      details.openaiError = error.message;
    }

    try {
      // Check Pub/Sub
      await this.pubsub.topic('sengol-embeddings-generated').exists();
      details.pubsub = 'accessible';
    } catch (error) {
      details.pubsub = 'inaccessible';
      details.pubsubError = error.message;
    }

    const status =
      details.gcs === 'inaccessible' || details.openai === 'inaccessible'
        ? 'unhealthy'
        : details.pubsub === 'inaccessible'
        ? 'degraded'
        : 'healthy';

    return { status, details };
  }
}

// Export singleton instance
export const embeddingGenerator = new EmbeddingGenerator();
