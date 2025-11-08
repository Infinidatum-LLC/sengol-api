/**
 * Incident Search Service - Semantic search over incident embeddings using d-vecDB
 *
 * This service provides evidence-based incident search using d-vecDB vector database
 * for fast similarity search with metadata filtering.
 *
 * PERFORMANCE OPTIMIZATIONS (Week 2):
 * - L1 Cache: Local memory LRU cache (1-5ms)
 * - L2 Cache: Redis distributed cache (20-50ms)
 * - L3: d-vecDB vector search (100-5000ms)
 * - Request deduplication (prevents duplicate in-flight requests)
 * - Pre-filtering by metadata (reduces search space by 80-90%)
 */

import { searchByText, SearchResult, IncidentMetadata } from './dvecdb-embeddings'
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
 * Find similar incidents using d-vecDB vector similarity search
 * WITH 3-TIER CACHING STRATEGY
 */
export async function findSimilarIncidents(
  projectDescription: string,
  options: IncidentSearchOptions = {}
): Promise<IncidentMatch[]> {
  const overallStartTime = Date.now()

  const {
    limit = 20,
    minSimilarity = 0.7,
    industry,
    severity,
    requireMfaData = false,
    requireBackupData = false,
    requireIrPlanData = false,
    incidentTypes,
  } = options

  console.log('\n🔍 [SEARCH] Starting incident search with optimizations...')
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
    // L3: d-vecDB Vector Search with Request Deduplication (100-5000ms)
    // ========================================================================
    console.log('[L3 d-vecDB] Cache miss - executing vector search...')

    // Use request deduplication to merge identical in-flight requests
    const results = await requestDeduplicator.execute(
      redisCacheKey,
      async () => {
        return await performVectorSearch(projectDescription, options)
      },
      { ttl: 10000 } // 10 second dedup window
    )

    const totalLatency = Date.now() - overallStartTime

    // Populate both cache layers
    await setInCache(redisCacheKey, results, CACHE_TTL.VECTOR_SEARCH)
    setInLocalCache(vectorSearchCache, 'vectorSearch', cacheKey, results)

    console.log(`[d-vecDB COMPLETE] ✅ Returned ${results.length} results in ${totalLatency}ms`)

    return results
  } catch (error) {
    console.error('❌ [ERROR] Incident search failed:', error)
    throw new Error(
      'Failed to find similar incidents: ' + (error instanceof Error ? error.message : 'Unknown error')
    )
  }
}

/**
 * Perform actual vector search against d-vecDB
 * (separated for request deduplication)
 */
async function performVectorSearch(
  projectDescription: string,
  options: IncidentSearchOptions
): Promise<IncidentMatch[]> {
  const {
    limit = 20,
    minSimilarity = 0.7,
    industry,
    severity,
    requireMfaData = false,
    requireBackupData = false,
    requireIrPlanData = false,
    incidentTypes,
  } = options

  const searchStartTime = Date.now()

  // Build metadata filter for d-vecDB
  const filter: Partial<IncidentMetadata> = {}

  if (industry) {
    filter.industry = industry
  }

  // Note: d-vecDB doesn't support complex array filters like severity[] directly
  // We'll filter in post-processing

  if (incidentTypes && incidentTypes.length > 0) {
    // For single type, use filter; for multiple, filter in post-processing
    if (incidentTypes.length === 1) {
      filter.incidentType = incidentTypes[0]
    }
  }

  // Search in d-vecDB (get more results for post-filtering)
  const searchLimit = limit * 3 // Get 3x results for filtering
  console.log(`[d-vecDB] Querying for top ${searchLimit} matches...`)

  const results: SearchResult[] = await searchByText(
    projectDescription,
    filter,
    searchLimit
  )

  const searchLatency = Date.now() - searchStartTime
  console.log(`[d-vecDB] Found ${results.length} initial matches in ${searchLatency}ms`)

  // Post-process: Apply additional filters and convert to IncidentMatch
  let matches: IncidentMatch[] = results
    .filter((result) => {
      // Filter by minimum similarity
      if (result.score < minSimilarity) return false

      // Filter by severity if specified
      if (severity && severity.length > 0) {
        if (!result.metadata.severity || !severity.includes(result.metadata.severity)) {
          return false
        }
      }

      // Filter by incident types (if multiple specified)
      if (incidentTypes && incidentTypes.length > 1) {
        if (!incidentTypes.includes(result.metadata.incidentType)) {
          return false
        }
      }

      // Filter by security control data availability
      if (requireMfaData && result.metadata.hadMfa === undefined) return false
      if (requireBackupData && result.metadata.hadBackups === undefined) return false
      if (requireIrPlanData && result.metadata.hadIrPlan === undefined) return false

      return true
    })
    .slice(0, limit) // Take only requested limit
    .map((result) => ({
      id: result.id,
      incidentId: result.metadata.incidentId,
      incidentType: result.metadata.incidentType,
      attackType: result.metadata.attackType || null,
      organization: result.metadata.organization || null,
      industry: result.metadata.industry || null,
      severity: result.metadata.severity || null,
      incidentDate: result.metadata.incidentDate ? new Date(result.metadata.incidentDate) : null,
      hadMfa: result.metadata.hadMfa ?? null,
      hadBackups: result.metadata.hadBackups ?? null,
      hadIrPlan: result.metadata.hadIrPlan ?? null,
      estimatedCost: result.metadata.estimatedCost ? Math.round(result.metadata.estimatedCost) : null,
      downtimeHours: result.metadata.downtimeHours ?? null,
      recordsAffected: result.metadata.recordsAffected ?? null,
      similarity: result.score,
      embeddingText: result.metadata.embeddingText,
    }))

  console.log(`[d-vecDB] ✅ Filtered to ${matches.length} matches (similarity >= ${minSimilarity})`)

  if (matches.length > 0) {
    const minSim = matches[matches.length - 1].similarity.toFixed(3)
    const maxSim = matches[0].similarity.toFixed(3)
    console.log(`[d-vecDB] Similarity range: ${minSim} - ${maxSim}`)
  }

  return matches
}

/**
 * Calculate statistics from a set of incident matches
 */
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
