/**
 * Incremental Data Sync Service
 *
 * Automatically syncs new crawler data from PostgreSQL to Cloud Storage
 * for use with Gemini grounding. Runs daily to keep incident data fresh.
 */

import { PrismaClient } from '@prisma/client'
import { Storage } from '@google-cloud/storage'

const prisma = new PrismaClient()
const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT?.trim(),
})

const BUCKET_NAME = process.env.GCS_BUCKET_NAME?.trim() || 'sengol-incidents'
const SYNC_DATA_PATH = 'incidents/postgres-migrated/raw/'

// Track last sync time in memory (in production, use Redis or database)
let lastSyncTimestamps: Record<string, Date> = {}

interface SyncResult {
  table: string
  newRecords: number
  totalRecords: number
  synced: boolean
  error?: string
}

/**
 * Handle BigInt serialization for JSON
 */
function prepareBigInt() {
  // @ts-ignore
  BigInt.prototype.toJSON = function() {
    return this.toString()
  }
}

prepareBigInt()

/**
 * Sync a single table's new records to Cloud Storage
 */
async function syncTable(
  tableName: string,
  fetchFunction: (since: Date | null) => Promise<any[]>
): Promise<SyncResult> {
  console.log(`\n[IncrementalSync] Syncing ${tableName}...`)

  try {
    const lastSync = lastSyncTimestamps[tableName] || null

    // Fetch records since last sync
    const newRecords = await fetchFunction(lastSync)

    console.log(`[IncrementalSync] Found ${newRecords.length} new records in ${tableName}`)

    if (newRecords.length === 0) {
      return {
        table: tableName,
        newRecords: 0,
        totalRecords: 0,
        synced: false
      }
    }

    // Fetch all records for the complete file
    const allRecords = await fetchFunction(null)

    // Upload to Cloud Storage
    const bucket = storage.bucket(BUCKET_NAME)
    const filename = `${SYNC_DATA_PATH}${tableName}.json`
    const file = bucket.file(filename)

    const jsonContent = JSON.stringify(allRecords, null, 2)
    await file.save(jsonContent, {
      contentType: 'application/json',
      metadata: {
        lastSync: new Date().toISOString(),
        recordCount: allRecords.length.toString(),
        newRecords: newRecords.length.toString()
      }
    })

    console.log(`[IncrementalSync] ✓ Synced ${tableName}: ${newRecords.length} new, ${allRecords.length} total`)

    // Update last sync timestamp
    lastSyncTimestamps[tableName] = new Date()

    return {
      table: tableName,
      newRecords: newRecords.length,
      totalRecords: allRecords.length,
      synced: true
    }

  } catch (error) {
    console.error(`[IncrementalSync] Error syncing ${tableName}:`, error)
    return {
      table: tableName,
      newRecords: 0,
      totalRecords: 0,
      synced: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Run incremental sync for all crawler data
 */
export async function runIncrementalSync(): Promise<{
  results: SyncResult[]
  totalNew: number
  totalSynced: number
}> {
  console.log('\n🔄 Starting Incremental Data Sync...')
  console.log(`   Last sync timestamps: ${JSON.stringify(lastSyncTimestamps, null, 2)}`)

  const results: SyncResult[] = []

  // Sync cyber incidents
  results.push(await syncTable('cyber_incident_staging', async (since) => {
    if (since) {
      return prisma.cyber_incident_staging.findMany({
        where: {
          crawled_at: {
            gt: since
          }
        }
      })
    }
    return prisma.cyber_incident_staging.findMany()
  }))

  // Sync cloud incidents
  results.push(await syncTable('cloud_incident_staging', async (since) => {
    if (since) {
      return prisma.cloud_incident_staging.findMany({
        where: {
          crawled_at: {
            gt: since
          }
        }
      })
    }
    return prisma.cloud_incident_staging.findMany()
  }))

  // Sync failure patterns
  results.push(await syncTable('failure_patterns', async (since) => {
    if (since) {
      return prisma.failure_patterns.findMany({
        where: {
          created_at: {
            gt: since
          }
        }
      })
    }
    return prisma.failure_patterns.findMany()
  }))

  // Sync security vulnerabilities
  results.push(await syncTable('security_vulnerabilities', async (since) => {
    if (since) {
      return prisma.security_vulnerabilities.findMany({
        where: {
          published_at: {
            gt: since
          }
        }
      })
    }
    return prisma.security_vulnerabilities.findMany()
  }))

  // Sync regulation violations
  results.push(await syncTable('regulation_violations', async (since) => {
    if (since) {
      return prisma.regulation_violations.findMany({
        where: {
          created_at: {
            gt: since
          }
        }
      })
    }
    return prisma.regulation_violations.findMany()
  }))

  // Sync CEP signal events
  results.push(await syncTable('cep_signal_events', async (since) => {
    if (since) {
      return prisma.cep_signal_events.findMany({
        where: {
          created_at: {
            gt: since
          }
        }
      })
    }
    return prisma.cep_signal_events.findMany()
  }))

  // Sync CEP anomalies
  results.push(await syncTable('cep_anomalies', async (since) => {
    if (since) {
      return prisma.cep_anomalies.findMany({
        where: {
          detected_at: {
            gt: since
          }
        }
      })
    }
    return prisma.cep_anomalies.findMany()
  }))

  // Sync CEP pattern templates
  results.push(await syncTable('cep_pattern_templates', async (since) => {
    if (since) {
      return prisma.cep_pattern_templates.findMany({
        where: {
          updated_at: {
            gt: since
          }
        }
      })
    }
    return prisma.cep_pattern_templates.findMany()
  }))

  // Calculate totals
  const totalNew = results.reduce((sum, r) => sum + r.newRecords, 0)
  const totalSynced = results.filter(r => r.synced).length

  // Note: Incident cache in incident-search.ts will auto-refresh after 1 hour TTL
  if (totalNew > 0) {
    console.log('\n[IncrementalSync] New data synced. Cache will refresh automatically.')
  }

  console.log('\n📊 Sync Summary:')
  console.log('═'.repeat(60))
  results.forEach(r => {
    const status = r.synced ? '✓' : '✗'
    console.log(`${status} ${r.table.padEnd(30)} ${r.newRecords} new, ${r.totalRecords} total`)
    if (r.error) {
      console.log(`   Error: ${r.error}`)
    }
  })
  console.log('═'.repeat(60))
  console.log(`Total new records: ${totalNew}`)
  console.log(`Tables synced: ${totalSynced}/${results.length}`)

  await prisma.$disconnect()

  return {
    results,
    totalNew,
    totalSynced
  }
}

/**
 * Schedule daily sync (call this from your main app)
 */
export function scheduleDailySync(): NodeJS.Timeout {
  console.log('[IncrementalSync] Scheduling daily sync...')

  // Run immediately on startup
  runIncrementalSync().catch(error => {
    console.error('[IncrementalSync] Initial sync failed:', error)
  })

  // Then run every 24 hours
  return setInterval(() => {
    console.log('[IncrementalSync] Running scheduled daily sync...')
    runIncrementalSync().catch(error => {
      console.error('[IncrementalSync] Scheduled sync failed:', error)
    })
  }, 24 * 60 * 60 * 1000) // 24 hours
}

/**
 * Get sync status
 */
export function getSyncStatus(): {
  lastSyncTimestamps: Record<string, Date>
  nextSyncIn: number
} {
  // Calculate time until next sync (assuming daily schedule)
  const now = new Date()
  const timestamps = Object.values(lastSyncTimestamps)
  const lastSync = timestamps.length > 0 ? Math.max(...timestamps.map(d => d.getTime())) : 0

  const nextSync = lastSync + (24 * 60 * 60 * 1000) // 24 hours from last sync
  const nextSyncIn = Math.max(0, nextSync - now.getTime())

  return {
    lastSyncTimestamps,
    nextSyncIn
  }
}

/**
 * Manually trigger sync (useful for testing or immediate updates)
 */
export async function triggerManualSync(): Promise<any> {
  console.log('[IncrementalSync] Manual sync triggered')
  return runIncrementalSync()
}
