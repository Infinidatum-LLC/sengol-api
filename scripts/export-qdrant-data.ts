/**
 * Export Data from Self-Hosted Qdrant to JSON File
 *
 * This script exports all data from the self-hosted Qdrant instance
 * to a JSON file that can be imported to Qdrant Cloud.
 *
 * Usage:
 *   npx tsx scripts/export-qdrant-data.ts
 *
 * Environment variables:
 *   QDRANT_HOST=10.128.0.2       # Self-hosted Qdrant host
 *   QDRANT_PORT=6333             # Self-hosted Qdrant port
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import * as fs from 'fs'
import * as path from 'path'

const QDRANT_HOST = process.env.QDRANT_HOST || 'localhost'
const QDRANT_PORT = parseInt(process.env.QDRANT_PORT || '6333')
const COLLECTION_NAME = 'sengol_incidents'
const BATCH_SIZE = 100

interface ExportedData {
  metadata: {
    collection: string
    exportedAt: string
    totalPoints: number
  }
  points: any[]
}

async function exportData(): Promise<void> {
  console.log(`[Export] Starting Qdrant data export`)
  console.log(`[Export] Source: http://${QDRANT_HOST}:${QDRANT_PORT}`)
  console.log(`[Export] Collection: ${COLLECTION_NAME}`)

  try {
    // Initialize client
    const client = new QdrantClient({
      url: `http://${QDRANT_HOST}:${QDRANT_PORT}`,
    })

    // Check health
    console.log(`[Export] Checking Qdrant health...`)
    const collections = await client.getCollections()
    console.log(`[Export] Collections found: ${collections.collections.map(c => c.name).join(', ')}`)

    // Get collection info
    const collectionInfo = await client.getCollection(COLLECTION_NAME)
    const totalPoints = collectionInfo.points_count
    console.log(`[Export] Total points in ${COLLECTION_NAME}: ${totalPoints}`)

    // Fetch all points in batches
    const allPoints: any[] = []
    let offset = 0

    while (offset < totalPoints) {
      const remaining = totalPoints - offset
      const limit = Math.min(BATCH_SIZE, remaining)

      console.log(`[Export] Fetching points ${offset} to ${offset + limit}...`)

      const response = await client.scroll(COLLECTION_NAME, {
        offset,
        limit,
        with_payload: true,
        with_vector: true,
      })

      allPoints.push(...response.points)
      offset += limit

      // Progress indicator
      const progress = Math.min(100, Math.round((offset / totalPoints) * 100))
      console.log(`[Export] Progress: ${progress}%`)
    }

    // Create export data structure
    const exportData: ExportedData = {
      metadata: {
        collection: COLLECTION_NAME,
        exportedAt: new Date().toISOString(),
        totalPoints: allPoints.length,
      },
      points: allPoints,
    }

    // Save to file
    const outputDir = path.join(__dirname, '../backups')
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = path.join(outputDir, `qdrant-export-${COLLECTION_NAME}-${timestamp}.json`)

    console.log(`[Export] Saving ${allPoints.length} points to ${filename}...`)
    fs.writeFileSync(filename, JSON.stringify(exportData, null, 2))

    console.log(`[Export] ✓ Export completed successfully!`)
    console.log(`[Export] Output file: ${filename}`)
    console.log(`[Export] File size: ${(fs.statSync(filename).size / 1024 / 1024).toFixed(2)} MB`)

  } catch (error) {
    console.error(`[Export] Error during export:`, error)
    process.exit(1)
  }
}

// Run export
exportData()
