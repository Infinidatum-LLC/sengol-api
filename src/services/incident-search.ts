/**
 * Incident Search Service - Qdrant Vector Database
 *
 * This service provides evidence-based incident search using Qdrant vector database.
 * Data is automatically populated by the autonomous crawler system.
 *
 * MIGRATION HISTORY:
 * - d-vecDB VPS → Google Vertex AI RAG (Nov 2025)
 * - Vertex AI RAG → Gemini Grounding (Nov 2025)
 * - Gemini Grounding → Qdrant (Nov 2025) - autonomous crawler integration
 *
 * BENEFITS:
 * - Real-time data from 15 crawler sources
 * - Fast vector search (< 500ms)
 * - Cost-effective (~$96/month vs. Vertex AI costs)
 * - Self-hosted, full control
 * - 3-tier caching still active (L1, L2, L3)
 */

import {
  searchIncidents as qdrantSearch,
  QdrantSearchResult,
  QdrantSearchOptions,
} from '../lib/qdrant-client'
import {
  vectorSearchCache,
  generateCacheKey,
  getFromLocalCache,
  setInLocalCache,
} from '../lib/local-cache'
import {
  getFromCache,
  setInCache,
  generateVectorSearchKey,
  CACHE_TTL,
} from '../lib/redis-cache'
import { requestDeduplicator } from '../lib/request-deduplicator'

export interface IncidentSearchOptions {
  limit?: number
  minSimilarity?: number
  industry?: string
  severity?: string[]
  requireMfaData?: boolean
  requireBackupData?: boolean
  requireIrPlanData?: boolean
  incidentTypes?: string[]
}

export interface IncidentMatch {
  id: string
  incidentId: string
  incidentType: string
  attackType?: string | null
  organization?: string | null
  industry?: string | null
  severity?: string | null
  incidentDate?: Date | null
  hadMfa?: boolean | null
  hadBackups?: boolean | null
  hadIrPlan?: boolean | null
  estimatedCost?: number | null
  downtimeHours?: number | null
  recordsAffected?: number | null
  similarity: number
  embeddingText: string
}

export interface IncidentStatistics {
  totalIncidents: number
  dateRange: { earliest?: Date; latest?: Date }
  avgCost: number
  medianCost: number
  totalCost: number
  incidentsWithCostData: number
  avgDowntime: number
  totalDowntime: number
  incidentsWithDowntimeData: number
  avgRecordsAffected: number
  totalRecordsAffected: number
  incidentsWithRecordsData: number
  mfaAdoptionRate: number
  backupAdoptionRate: number
  irPlanAdoptionRate: number
  incidentsWithSecurityData: number
  costSavingsMfa: number
  costSavingsBackups: number
  costSavingsIrPlan: number
  avgCostWithMfa: number
  avgCostWithoutMfa: number
  avgCostWithBackups: number
  avgCostWithoutBackups: number
  avgCostWithIrPlan: number
  avgCostWithoutIrPlan: number
  severityBreakdown: { low: number; medium: number; high: number; critical: number; unknown: number }
  topIndustries: Array<{ industry: string; count: number }>
}

/**
 * Find similar incidents using Qdrant vector similarity search
 * WITH 3-TIER CACHING STRATEGY
 */
export async function findSimilarIncidents(
  projectDescription: string,
  options: IncidentSearchOptions = {}
): Promise<IncidentMatch[]> {
  const overallStartTime = Date.now()

  const {
    limit = 20,
    minSimilarity = 0.3, // ✅ LOWERED from 0.7 to 0.3 to get more results
    industry,
    severity,
    requireMfaData = false,
    requireBackupData = false,
    requireIrPlanData = false,
    incidentTypes,
  } = options

  console.log('\n🔍 [SEARCH] Starting Qdrant incident search...')
  console.log(`[SEARCH] Query: "${projectDescription.substring(0, 100)}..."`)
  console.log(`[SEARCH] Filters: limit=${limit}, minSim=${minSimilarity}, industry=${industry || 'all'}`)

  // Generate cache key for this search
  const cacheKey = generateCacheKey({
    query: projectDescription,
    filters: { industry, severity, requireMfaData, requireBackupData, requireIrPlanData, incidentTypes },
    limit,
  })

  const redisCacheKey = generateVectorSearchKey({
    query: projectDescription,
    filters: { industry, severity, incidentTypes },
    limit,
  })

  try {
    // ========================================================================
    // L1 CACHE: Local Memory (1-5ms)
    // ========================================================================
    const l1StartTime = Date.now()
    const l1Cached = getFromLocalCache(vectorSearchCache, 'vectorSearch', cacheKey)

    if (l1Cached) {
      const l1Latency = Date.now() - l1StartTime
      const totalLatency = Date.now() - overallStartTime
      console.log(`[L1 CACHE HIT] ✅ Returned ${l1Cached.length} results in ${l1Latency}ms (total: ${totalLatency}ms)`)
      return l1Cached
    }

    const l1Latency = Date.now() - l1StartTime
    console.log(`[L1 CACHE MISS] Local cache miss (${l1Latency}ms)`)

    // ========================================================================
    // L2 CACHE: Redis (20-50ms)
    // ========================================================================
    const l2StartTime = Date.now()
    const l2Cached = await getFromCache<IncidentMatch[]>(redisCacheKey)

    if (l2Cached) {
      const l2Latency = Date.now() - l2StartTime
      const totalLatency = Date.now() - overallStartTime

      // Populate L1 cache for next time
      setInLocalCache(vectorSearchCache, 'vectorSearch', cacheKey, l2Cached)

      console.log(`[L2 CACHE HIT] ✅ Redis returned ${l2Cached.length} results in ${l2Latency}ms (total: ${totalLatency}ms)`)
      return l2Cached
    }

    const l2Latency = Date.now() - l2StartTime
    console.log(`[L2 CACHE MISS] Redis cache miss (${l2Latency}ms)`)

    // ========================================================================
    // L3: Qdrant Vector Search with Request Deduplication (50-500ms)
    // ========================================================================
    console.log('[L3 Qdrant] Cache miss - executing vector search...')

    // Use request deduplication to merge identical in-flight requests
    const results = await requestDeduplicator.execute(
      redisCacheKey,
      async () => {
        return await performQdrantSearch(projectDescription, options)
      },
      { ttl: 10000 } // 10 second dedup window
    )

    const totalLatency = Date.now() - overallStartTime

    // Populate both cache layers
    await setInCache(redisCacheKey, results, CACHE_TTL.VECTOR_SEARCH)
    setInLocalCache(vectorSearchCache, 'vectorSearch', cacheKey, results)

    console.log(`[Qdrant COMPLETE] ✅ Returned ${results.length} results in ${totalLatency}ms`)

    return results
  } catch (error) {
    console.error('❌ [ERROR] Incident search failed:', error)
    throw new Error(
      'Failed to find similar incidents: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Perform actual Qdrant search
 * (separated for request deduplication)
 */
async function performQdrantSearch(
  projectDescription: string,
  options: IncidentSearchOptions
): Promise<IncidentMatch[]> {
  const {
    limit = 20,
    minSimilarity = 0.3, // ✅ FIXED: Match the default in findSimilarIncidents() to avoid parameter override bug
    industry,
    severity,
    requireMfaData = false,
    requireBackupData = false,
    requireIrPlanData = false,
    incidentTypes,
  } = options

  const searchStartTime = Date.now()

  // DIAGNOSTIC LOGGING - Track threshold values
  console.log(`[QDRANT_DIAGNOSTIC] === performQdrantSearch() called ===`)
  console.log(`[QDRANT_DIAGNOSTIC] minSimilarity value: ${minSimilarity}`)
  console.log(`[QDRANT_DIAGNOSTIC] limit value: ${limit}`)
  console.log(`[Qdrant Search] Searching for incidents...`)
  console.log(`[Qdrant Search] Query: "${projectDescription.substring(0, 100)}..."`)

  // Build Qdrant search options
  const qdrantOptions: QdrantSearchOptions = {
    limit,
    scoreThreshold: minSimilarity,
    industry,
    severity,
    requireMfaData,
    requireBackupData,
    requireIrPlanData,
  }

  // DIAGNOSTIC LOGGING - Track scoreThreshold being passed to Qdrant
  console.log(`[QDRANT_DIAGNOSTIC] scoreThreshold passed to Qdrant: ${qdrantOptions.scoreThreshold}`)

  // If incidentTypes provided, map to category
  if (incidentTypes && incidentTypes.length > 0) {
    // Use first incident type as category
    qdrantOptions.category = mapIncidentTypeToCategory(incidentTypes[0])
  }

  // Execute Qdrant search
  const qdrantResults = await qdrantSearch(projectDescription, qdrantOptions)

  // DIAGNOSTIC LOGGING - Track number of results returned
  console.log(`[QDRANT_DIAGNOSTIC] Qdrant raw results count: ${qdrantResults.length}`)

  const searchLatency = Date.now() - searchStartTime
  console.log(`[Qdrant Search] ✅ Found ${qdrantResults.length} matches in ${searchLatency}ms`)

  // Map Qdrant results to IncidentMatch format
  const matches: IncidentMatch[] = qdrantResults.map((result) => 
    mapQdrantResultToIncidentMatch(result)
  )

  if (matches.length > 0) {
    const minSim = matches[matches.length - 1].similarity.toFixed(3)
    const maxSim = matches[0].similarity.toFixed(3)
    console.log(`[Qdrant Search] Similarity range: ${minSim} - ${maxSim}`)
  }

  return matches
}

/**
 * Map Qdrant search result to IncidentMatch interface
 * Ensures 100% API compatibility
 */
function mapQdrantResultToIncidentMatch(result: QdrantSearchResult): IncidentMatch {
  const metadata = result.payload.metadata

  return {
    id: String(result.id),
    incidentId: result.payload.embedding_id || result.payload.id || String(result.id),
    incidentType: mapCategoryToIncidentType(result.payload.category || result.payload.type || 'unknown'),
    attackType: metadata?.attack_type || metadata?.failure_type || null,
    organization: metadata?.organization || null,
    industry: metadata?.industry || null,
    severity: metadata?.severity || null,
    incidentDate: metadata?.incident_date ? new Date(metadata.incident_date) : null,
    hadMfa: metadata?.had_mfa ?? null,
    hadBackups: metadata?.had_backups ?? null,
    hadIrPlan: metadata?.had_ir_plan ?? null,
    estimatedCost: metadata?.estimated_cost || null,
    downtimeHours: metadata?.downtime_hours || metadata?.detection_time_hours || null,
    recordsAffected: metadata?.records_affected || null,
    similarity: result.score,
    embeddingText: result.payload.content || result.payload.embedding_text || 'N/A',
  }
}

/**
 * Map incident type to Qdrant category
 */
function mapIncidentTypeToCategory(incidentType: string): string {
  const mapping: Record<string, string> = {
    'cyber': 'incidents',
    'cloud': 'incidents',
    'failure_pattern': 'incidents',
    'vulnerability': 'vulnerabilities',
    'regulation_violation': 'regulatory',
    'research': 'research',
    'news': 'news',
  }
  return mapping[incidentType] || 'incidents'
}

/**
 * Map Qdrant category to incident type
 */
function mapCategoryToIncidentType(category: string): string {
  const mapping: Record<string, string> = {
    'incidents': 'cyber',
    'vulnerabilities': 'vulnerability',
    'regulatory': 'regulation_violation',
    'research': 'research',
    'news': 'news',
  }
  return mapping[category] || 'cyber'
}

export function calculateIncidentStatistics(incidents: IncidentMatch[]): IncidentStatistics {
  console.log('\n📊 Calculating statistics for ' + incidents.length + ' incidents...')

  if (incidents.length === 0) {
    console.log('No incidents to analyze')
    return {
      totalIncidents: 0,
      dateRange: {},
      avgCost: 0,
      medianCost: 0,
      totalCost: 0,
      incidentsWithCostData: 0,
      avgDowntime: 0,
      totalDowntime: 0,
      incidentsWithDowntimeData: 0,
      avgRecordsAffected: 0,
      totalRecordsAffected: 0,
      incidentsWithRecordsData: 0,
      mfaAdoptionRate: 0,
      backupAdoptionRate: 0,
      irPlanAdoptionRate: 0,
      incidentsWithSecurityData: 0,
      costSavingsMfa: 0,
      costSavingsBackups: 0,
      costSavingsIrPlan: 0,
      avgCostWithMfa: 0,
      avgCostWithoutMfa: 0,
      avgCostWithBackups: 0,
      avgCostWithoutBackups: 0,
      avgCostWithIrPlan: 0,
      avgCostWithoutIrPlan: 0,
      severityBreakdown: { low: 0, medium: 0, high: 0, critical: 0, unknown: 0 },
      topIndustries: [],
    }
  }

  const toNumber = (val: bigint | number | null | undefined): number => {
    if (val === null || val === undefined) return 0
    return typeof val === 'bigint' ? Number(val) : val
  }

  // Date range analysis
  const dates = incidents.map((i) => i.incidentDate).filter((d): d is Date => d !== null && d !== undefined)
  const dateRange = {
    earliest: dates.length > 0 ? new Date(Math.min(...dates.map((d) => d.getTime()))) : undefined,
    latest: dates.length > 0 ? new Date(Math.max(...dates.map((d) => d.getTime()))) : undefined,
  }

  // Cost statistics
  const costsData = incidents.map((i) => toNumber(i.estimatedCost)).filter((c) => c > 0)
  const totalCost = costsData.reduce((sum, c) => sum + c, 0)
  const avgCost = costsData.length > 0 ? totalCost / costsData.length : 0
  const sortedCosts = [...costsData].sort((a, b) => a - b)
  const medianCost = costsData.length > 0 ? sortedCosts[Math.floor(costsData.length / 2)] : 0

  // Downtime statistics
  const downtimeData = incidents.map((i) => i.downtimeHours).filter((d): d is number => d !== null && d !== undefined && d > 0)
  const totalDowntime = downtimeData.reduce((sum, d) => sum + d, 0)
  const avgDowntime = downtimeData.length > 0 ? totalDowntime / downtimeData.length : 0

  // Records affected statistics
  const recordsData = incidents.map((i) => i.recordsAffected).filter((r): r is number => r !== null && r !== undefined && r > 0)
  const totalRecordsAffected = recordsData.reduce((sum, r) => sum + r, 0)
  const avgRecordsAffected = recordsData.length > 0 ? totalRecordsAffected / recordsData.length : 0

  // Security control adoption rates
  const withSecurityData = incidents.filter((i) => i.hadMfa !== null || i.hadBackups !== null || i.hadIrPlan !== null)
  const incidentsWithSecurityData = withSecurityData.length

  const mfaData = incidents.filter((i) => i.hadMfa !== null)
  const mfaTrue = mfaData.filter((i) => i.hadMfa === true)
  const mfaAdoptionRate = mfaData.length > 0 ? (mfaTrue.length / mfaData.length) * 100 : 0

  const backupData = incidents.filter((i) => i.hadBackups !== null)
  const backupTrue = backupData.filter((i) => i.hadBackups === true)
  const backupAdoptionRate = backupData.length > 0 ? (backupTrue.length / backupData.length) * 100 : 0

  const irPlanData = incidents.filter((i) => i.hadIrPlan !== null)
  const irPlanTrue = irPlanData.filter((i) => i.hadIrPlan === true)
  const irPlanAdoptionRate = irPlanData.length > 0 ? (irPlanTrue.length / irPlanData.length) * 100 : 0

  // Cost savings analysis (with vs without security controls)
  const incidentsWithMfa = incidents.filter((i) => i.hadMfa === true && i.estimatedCost && toNumber(i.estimatedCost) > 0)
  const incidentsWithoutMfa = incidents.filter((i) => i.hadMfa === false && i.estimatedCost && toNumber(i.estimatedCost) > 0)
  const avgCostWithMfa = incidentsWithMfa.length > 0 ? incidentsWithMfa.reduce((sum, i) => sum + toNumber(i.estimatedCost), 0) / incidentsWithMfa.length : 0
  const avgCostWithoutMfa = incidentsWithoutMfa.length > 0 ? incidentsWithoutMfa.reduce((sum, i) => sum + toNumber(i.estimatedCost), 0) / incidentsWithoutMfa.length : 0
  const costSavingsMfa = avgCostWithoutMfa - avgCostWithMfa

  const incidentsWithBackups = incidents.filter((i) => i.hadBackups === true && i.estimatedCost && toNumber(i.estimatedCost) > 0)
  const incidentsWithoutBackups = incidents.filter((i) => i.hadBackups === false && i.estimatedCost && toNumber(i.estimatedCost) > 0)
  const avgCostWithBackups = incidentsWithBackups.length > 0 ? incidentsWithBackups.reduce((sum, i) => sum + toNumber(i.estimatedCost), 0) / incidentsWithBackups.length : 0
  const avgCostWithoutBackups = incidentsWithoutBackups.length > 0 ? incidentsWithoutBackups.reduce((sum, i) => sum + toNumber(i.estimatedCost), 0) / incidentsWithoutBackups.length : 0
  const costSavingsBackups = avgCostWithoutBackups - avgCostWithBackups

  const incidentsWithIrPlan = incidents.filter((i) => i.hadIrPlan === true && i.estimatedCost && toNumber(i.estimatedCost) > 0)
  const incidentsWithoutIrPlan = incidents.filter((i) => i.hadIrPlan === false && i.estimatedCost && toNumber(i.estimatedCost) > 0)
  const avgCostWithIrPlan = incidentsWithIrPlan.length > 0 ? incidentsWithIrPlan.reduce((sum, i) => sum + toNumber(i.estimatedCost), 0) / incidentsWithIrPlan.length : 0
  const avgCostWithoutIrPlan = incidentsWithoutIrPlan.length > 0 ? incidentsWithoutIrPlan.reduce((sum, i) => sum + toNumber(i.estimatedCost), 0) / incidentsWithoutIrPlan.length : 0
  const costSavingsIrPlan = avgCostWithoutIrPlan - avgCostWithIrPlan

  // Severity breakdown
  const severityBreakdown = {
    low: incidents.filter((i) => i.severity?.toLowerCase() === 'low').length,
    medium: incidents.filter((i) => i.severity?.toLowerCase() === 'medium').length,
    high: incidents.filter((i) => i.severity?.toLowerCase() === 'high').length,
    critical: incidents.filter((i) => i.severity?.toLowerCase() === 'critical').length,
    unknown: incidents.filter((i) => !i.severity).length,
  }

  // Top industries
  const industryCount = new Map<string, number>()
  incidents.forEach((i) => {
    if (i.industry) {
      const count = industryCount.get(i.industry) || 0
      industryCount.set(i.industry, count + 1)
    }
  })
  const topIndustries = Array.from(industryCount.entries())
    .map(([industry, count]) => ({ industry, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)

  const stats: IncidentStatistics = {
    totalIncidents: incidents.length,
    dateRange,
    avgCost,
    medianCost,
    totalCost,
    incidentsWithCostData: costsData.length,
    avgDowntime,
    totalDowntime,
    incidentsWithDowntimeData: downtimeData.length,
    avgRecordsAffected,
    totalRecordsAffected,
    incidentsWithRecordsData: recordsData.length,
    mfaAdoptionRate,
    backupAdoptionRate,
    irPlanAdoptionRate,
    incidentsWithSecurityData,
    costSavingsMfa,
    costSavingsBackups,
    costSavingsIrPlan,
    avgCostWithMfa,
    avgCostWithoutMfa,
    avgCostWithBackups,
    avgCostWithoutBackups,
    avgCostWithIrPlan,
    avgCostWithoutIrPlan,
    severityBreakdown,
    topIndustries,
  }

  console.log('  ' + stats.totalIncidents + ' total incidents analyzed')
  console.log('  ' + stats.incidentsWithCostData + ' incidents with cost data (avg: $' + stats.avgCost.toLocaleString() + ')')
  console.log('  ' + stats.incidentsWithSecurityData + ' incidents with security control data')
  console.log('  MFA adoption: ' + stats.mfaAdoptionRate.toFixed(1) + '%')
  console.log('  Backup adoption: ' + stats.backupAdoptionRate.toFixed(1) + '%')
  console.log('  IR Plan adoption: ' + stats.irPlanAdoptionRate.toFixed(1) + '%')

  if (costSavingsMfa > 0) {
    console.log('  💰 MFA cost savings: $' + costSavingsMfa.toLocaleString() + ' (' + incidentsWithMfa.length + ' with vs ' + incidentsWithoutMfa.length + ' without)')
  }
  if (costSavingsBackups > 0) {
    console.log('  💰 Backup cost savings: $' + costSavingsBackups.toLocaleString() + ' (' + incidentsWithBackups.length + ' with vs ' + incidentsWithoutBackups.length + ' without)')
  }
  if (costSavingsIrPlan > 0) {
    console.log('  💰 IR Plan cost savings: $' + costSavingsIrPlan.toLocaleString() + ' (' + incidentsWithIrPlan.length + ' with vs ' + incidentsWithoutIrPlan.length + ' without)')
  }

  return stats
}
