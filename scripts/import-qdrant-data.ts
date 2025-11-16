/**
 * Import Data to Qdrant Cloud from JSON Export
 *
 * This script imports previously exported data to a Qdrant Cloud instance.
 * Use this after exporting data from the self-hosted Qdrant instance.
 *
 * Usage:
 *   npx tsx scripts/import-qdrant-data.ts <export-file-path>
 *
 * Environment variables:
 *   QDRANT_HOST=xxxxx.qdrant.io    # Qdrant Cloud host (without https://)
 *   QDRANT_API_KEY=your-key        # Qdrant Cloud API key
 *
 * Example:
 *   npx tsx scripts/import-qdrant-data.ts backups/qdrant-export-sengol_incidents-2024-11-15T10-30-45-123Z.json
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import * as fs from 'fs'

const QDRANT_HOST = process.env.QDRANT_HOST
const QDRANT_API_KEY = process.env.QDRANT_API_KEY
const BATCH_SIZE = 50

interface ExportedData {
  metadata: {
    collection: string
    exportedAt: string
    totalPoints: number
  }
  points: any[]
}

async function importData(): Promise<void> {
  // Validate arguments
  const exportFile = process.argv[2]
  if (!exportFile) {
    console.error('[Import] Error: Please provide export file path')
    console.error('[Import] Usage: npx tsx scripts/import-qdrant-data.ts <export-file-path>')
    process.exit(1)
  }

  // Validate environment variables
  if (!QDRANT_HOST || !QDRANT_API_KEY) {
    console.error('[Import] Error: Missing environment variables')
    console.error('[Import] Required: QDRANT_HOST, QDRANT_API_KEY')
    process.exit(1)
  }

  // Check if file exists
  if (!fs.existsSync(exportFile)) {
    console.error(`[Import] Error: File not found: ${exportFile}`)
    process.exit(1)
  }

  console.log(`[Import] Starting Qdrant Cloud data import`)
  console.log(`[Import] Target: https://${QDRANT_HOST}`)
  console.log(`[Import] Source file: ${exportFile}`)

  try {
    // Load export file
    console.log(`[Import] Loading export file...`)
    const fileContent = fs.readFileSync(exportFile, 'utf-8')
    const exportData: ExportedData = JSON.parse(fileContent)

    const { metadata, points } = exportData
    console.log(`[Import] Loaded ${metadata.totalPoints} points from ${metadata.collection}`)
    console.log(`[Import] Exported at: ${metadata.exportedAt}`)

    // Initialize Qdrant Cloud client
    const client = new QdrantClient({
      url: `https://${QDRANT_HOST}`,
      apiKey: QDRANT_API_KEY,
    })

    // Check health and verify connection
    console.log(`[Import] Verifying Qdrant Cloud connection...`)
    const collections = await client.getCollections()
    console.log(`[Import] Connected! Available collections: ${collections.collections.map(c => c.name).join(', ')}`)

    // Check if collection exists
    const collectionName = metadata.collection
    const collectionExists = collections.collections.some(c => c.name === collectionName)

    if (!collectionExists) {
      console.log(`[Import] Collection "${collectionName}" not found. Creating...`)
      // Get vector size from first point
      const firstPoint = points[0]
      const vectorSize = Array.isArray(firstPoint.vector) ? firstPoint.vector.length : 1536

      await client.createCollection(collectionName, {
        vectors: {
          size: vectorSize,
          distance: 'Cosine',
        },
      })
      console.log(`[Import] Collection "${collectionName}" created with ${vectorSize} dimensions`)
    }

    // Import points in batches
    let imported = 0
    for (let i = 0; i < points.length; i += BATCH_SIZE) {
      const batch = points.slice(i, i + BATCH_SIZE)
      const batchNum = Math.floor(i / BATCH_SIZE) + 1
      const totalBatches = Math.ceil(points.length / BATCH_SIZE)

      console.log(`[Import] Uploading batch ${batchNum}/${totalBatches} (${batch.length} points)...`)

      try {
        await client.upsert(collectionName, {
          points: batch,
        })
        imported += batch.length

        const progress = Math.round((imported / points.length) * 100)
        console.log(`[Import] Progress: ${progress}% (${imported}/${points.length})`)
      } catch (batchError) {
        console.error(`[Import] Error uploading batch ${batchNum}:`, batchError)
        throw batchError
      }
    }

    // Verify import
    console.log(`[Import] Verifying import...`)
    const collectionInfo = await client.getCollection(collectionName)
    console.log(`[Import] Collection points: ${collectionInfo.points_count}`)

    if (collectionInfo.points_count === points.length) {
      console.log(`[Import] ✓ Import completed successfully!`)
      console.log(`[Import] Total points imported: ${collectionInfo.points_count}`)
    } else {
      console.warn(`[Import] ⚠ Warning: Expected ${points.length} points but found ${collectionInfo.points_count}`)
    }

  } catch (error) {
    console.error(`[Import] Error during import:`, error)
    process.exit(1)
  }
}

// Run import
importData()
