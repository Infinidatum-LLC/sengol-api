/**
 * Incident Search Service - Direct Qdrant Vector Search
 *
 * Simplified implementation using the new qdrant-client.ts
 * This replaces the previous Vertex AI RAG / Gemini Grounding implementation
 *
 * MIGRATION HISTORY:
 * - d-vecDB VPS → Google Vertex AI RAG (Nov 2025)
 * - Vertex AI RAG → Gemini Grounding (Nov 2025)
 * - Gemini Grounding → Direct Qdrant (Nov 2025) - eliminates GCP dependencies
 */

import { searchIncidents as qdrantSearch, healthCheck } from '../lib/qdrant-client'

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
  severityBreakdown: Record<string, number>
  industryBreakdown: Record<string, number>
}

/**
 * Search for similar incidents using Qdrant vector search
 *
 * @param query - Natural language search query
 * @param options - Search filters and options
 * @returns Array of matching incidents (NOT wrapped in object - for backward compatibility)
 */
export async function findSimilarIncidents(
  query: string,
  options: IncidentSearchOptions = {}
): Promise<IncidentMatch[]> {
  const startTime = Date.now()

  console.log(`[Incident Search] Query: "${query.substring(0, 80)}..."`)
  console.log(`[Incident Search] Options:`, JSON.stringify(options))

  // Extract options
  const limit = options.limit || 20
  const minSimilarity = options.minSimilarity ?? 0.3
  const industry = options.industry
  const severity = options.severity
  const requireMfaData = options.requireMfaData
  const requireBackupData = options.requireBackupData
  const requireIrPlanData = options.requireIrPlanData
  const incidentTypes = options.incidentTypes

  try {
    // Perform Qdrant search (handles embedding generation internally)
    // Fetch 3x for post-filtering
    const rawResults = await qdrantSearch(query, limit * 3, minSimilarity)

    console.log(`[Incident Search] Qdrant returned ${rawResults.length} results`)

    // Map Qdrant results to IncidentMatch format
    let incidents: IncidentMatch[] = rawResults.map((result) => {
      const payload = result.payload || {}
      const metadata = payload.metadata || payload

      // Parse dates
      let incidentDate: Date | null = null
      const dateStr = metadata.incident_date?.toString() || metadata.date?.toString()
      if (dateStr) {
        const parsed = new Date(dateStr)
        if (!isNaN(parsed.getTime())) {
          incidentDate = parsed
        }
      }

      return {
        id: result.id?.toString() || '',
        incidentId: result.id?.toString() || '',
        incidentType: metadata.attack_type?.toString() || metadata.incident_type?.toString() || 'Unknown',
        attackType: metadata.attack_type?.toString() || null,
        organization: metadata.organization?.toString() || null,
        industry: metadata.industry?.toString() || null,
        severity: metadata.severity?.toString() || null,
        incidentDate,
        hadMfa: metadata.had_mfa ?? null,
        hadBackups: metadata.had_backups ?? null,
        hadIrPlan: metadata.had_ir_plan ?? null,
        estimatedCost: metadata.estimated_cost ? Number(metadata.estimated_cost) : null,
        downtimeHours: metadata.downtime_hours ? Number(metadata.downtime_hours) : null,
        recordsAffected: metadata.records_affected ? Number(metadata.records_affected) : null,
        similarity: result.score,
        embeddingText: payload.content?.toString() || payload.embeddingText?.toString() || '',
      }
    })

    console.log(`[Incident Search] Mapped to ${incidents.length} IncidentMatch objects`)

    // Post-filter by industry if specified (bidirectional matching)
    if (industry) {
      const beforeCount = incidents.length
      const searchTerms = industry.toLowerCase().split(/[&,\s]+/).filter(term => term.length > 2)

      console.log(`[Incident Search] Industry filter DEBUG:`)
      console.log(`[Incident Search]   Input: "${industry}"`)
      console.log(`[Incident Search]   Search terms: ${JSON.stringify(searchTerms)}`)
      console.log(`[Incident Search]   Before filter: ${beforeCount} incidents`)

      // Sample first 5 incident industries for debugging
      const sampleIndustries = incidents.slice(0, 5).map(inc => inc.industry || 'null')
      console.log(`[Incident Search]   Sample incident industries: ${JSON.stringify(sampleIndustries)}`)

      let matchCount = 0
      let noMatchCount = 0

      const filteredIncidents = incidents.filter((inc) => {
        if (!inc.industry) {
          noMatchCount++
          if (noMatchCount <= 3) {
            console.log(`[Incident Search]   ❌ No industry field: incident ${inc.id}`)
          }
          return false
        }

        const incIndustry = inc.industry.toLowerCase()
        const matches = searchTerms.some(term =>
          incIndustry.includes(term) || term.includes(incIndustry)
        )

        if (matches) {
          matchCount++
          if (matchCount <= 3) {
            console.log(`[Incident Search]   ✅ Match: "${inc.industry}"`)
          }
        } else {
          noMatchCount++
          if (noMatchCount <= 3) {
            console.log(`[Incident Search]   ❌ No match: "${inc.industry}" vs terms ${JSON.stringify(searchTerms)}`)
          }
        }

        return matches
      })

      console.log(`[Incident Search] Industry filter ("${industry}"): ${beforeCount} → ${filteredIncidents.length}`)
      console.log(`[Incident Search]   Matches: ${matchCount}, No matches: ${noMatchCount}`)

      // If industry filter removes ALL results, skip it (rely on semantic search)
      if (filteredIncidents.length === 0) {
        console.log(`[Incident Search] ⚠️  Industry filter too restrictive - skipping to rely on semantic search`)
        console.log(`[Incident Search]   Keeping all ${beforeCount} semantically matched incidents`)
      } else {
        incidents = filteredIncidents
      }
    }

    // Post-filter by severity if specified
    if (severity && severity.length > 0) {
      const beforeCount = incidents.length
      const severityLower = severity.map(s => s.toLowerCase())
      incidents = incidents.filter((inc) =>
        inc.severity && severityLower.includes(inc.severity.toLowerCase())
      )
      console.log(`[Incident Search] Severity filter: ${beforeCount} → ${incidents.length}`)
    }

    // Post-filter by incident types if specified
    if (incidentTypes && incidentTypes.length > 0) {
      const beforeCount = incidents.length
      const typesLower = incidentTypes.map(t => t.toLowerCase())
      incidents = incidents.filter((inc) =>
        inc.incidentType && typesLower.some(t => inc.incidentType.toLowerCase().includes(t))
      )
      console.log(`[Incident Search] Incident type filter: ${beforeCount} → ${incidents.length}`)
    }

    // Post-filter by MFA data if required
    if (requireMfaData) {
      const beforeCount = incidents.length
      incidents = incidents.filter((inc) => inc.hadMfa !== null)
      console.log(`[Incident Search] MFA data filter: ${beforeCount} → ${incidents.length}`)
    }

    // Post-filter by backup data if required
    if (requireBackupData) {
      const beforeCount = incidents.length
      incidents = incidents.filter((inc) => inc.hadBackups !== null)
      console.log(`[Incident Search] Backup data filter: ${beforeCount} → ${incidents.length}`)
    }

    // Post-filter by IR plan data if required
    if (requireIrPlanData) {
      const beforeCount = incidents.length
      incidents = incidents.filter((inc) => inc.hadIrPlan !== null)
      console.log(`[Incident Search] IR plan data filter: ${beforeCount} → ${incidents.length}`)
    }

    // Limit to requested count
    incidents = incidents.slice(0, limit)

    const executionTimeMs = Date.now() - startTime
    console.log(`[Incident Search] Returning ${incidents.length} incidents (${executionTimeMs}ms)`)

    // Return array directly (NOT wrapped) for backward compatibility
    return incidents
  } catch (error) {
    console.error(`[Incident Search] ERROR:`, error)
    throw error
  }
}

/**
 * Calculate incident statistics for evidence-based weighting
 */
export function calculateIncidentStatistics(incidents: IncidentMatch[]): IncidentStatistics {
  if (incidents.length === 0) {
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
      severityBreakdown: {},
      industryBreakdown: {},
    }
  }

  // Calculate date range
  const dates = incidents
    .map(i => i.incidentDate)
    .filter(d => d !== null) as Date[]

  const dateRange: { earliest?: Date; latest?: Date } = {}
  if (dates.length > 0) {
    dateRange.earliest = new Date(Math.min(...dates.map(d => d.getTime())))
    dateRange.latest = new Date(Math.max(...dates.map(d => d.getTime())))
  }

  // Calculate cost statistics
  const costs = incidents
    .map(i => i.estimatedCost)
    .filter(c => c !== null && c !== undefined) as number[]

  const totalCost = costs.reduce((sum, c) => sum + c, 0)
  const avgCost = costs.length > 0 ? totalCost / costs.length : 0

  let medianCost = 0
  if (costs.length > 0) {
    const sortedCosts = [...costs].sort((a, b) => a - b)
    medianCost = sortedCosts[Math.floor(sortedCosts.length / 2)]
  }

  // Calculate downtime statistics
  const downtimes = incidents
    .map(i => i.downtimeHours)
    .filter(d => d !== null && d !== undefined) as number[]

  const totalDowntime = downtimes.reduce((sum, d) => sum + d, 0)
  const avgDowntime = downtimes.length > 0 ? totalDowntime / downtimes.length : 0

  // Calculate records affected statistics
  const records = incidents
    .map(i => i.recordsAffected)
    .filter(r => r !== null && r !== undefined) as number[]

  const totalRecordsAffected = records.reduce((sum, r) => sum + r, 0)
  const avgRecordsAffected = records.length > 0 ? totalRecordsAffected / records.length : 0

  // Calculate security control adoption rates
  const securityDataCount = incidents.filter(i =>
    i.hadMfa !== null || i.hadBackups !== null || i.hadIrPlan !== null
  ).length

  const mfaCount = incidents.filter(i => i.hadMfa === true).length
  const backupCount = incidents.filter(i => i.hadBackups === true).length
  const irPlanCount = incidents.filter(i => i.hadIrPlan === true).length

  const mfaAdoptionRate = securityDataCount > 0 ? mfaCount / securityDataCount : 0
  const backupAdoptionRate = securityDataCount > 0 ? backupCount / securityDataCount : 0
  const irPlanAdoptionRate = securityDataCount > 0 ? irPlanCount / securityDataCount : 0

  // Calculate cost savings from security controls
  const costsWithoutMFA = incidents
    .filter(i => i.hadMfa === false && i.estimatedCost)
    .map(i => i.estimatedCost!)

  const costsWithMFA = incidents
    .filter(i => i.hadMfa === true && i.estimatedCost)
    .map(i => i.estimatedCost!)

  const avgCostWithoutMFA = costsWithoutMFA.length > 0
    ? costsWithoutMFA.reduce((a, b) => a + b, 0) / costsWithoutMFA.length
    : 0

  const avgCostWithMFA = costsWithMFA.length > 0
    ? costsWithMFA.reduce((a, b) => a + b, 0) / costsWithMFA.length
    : 0

  const costSavingsMfa = avgCostWithoutMFA - avgCostWithMFA

  // Similar calculations for backups
  const costsWithoutBackups = incidents
    .filter(i => i.hadBackups === false && i.estimatedCost)
    .map(i => i.estimatedCost!)

  const costsWithBackups = incidents
    .filter(i => i.hadBackups === true && i.estimatedCost)
    .map(i => i.estimatedCost!)

  const avgCostWithoutBackups = costsWithoutBackups.length > 0
    ? costsWithoutBackups.reduce((a, b) => a + b, 0) / costsWithoutBackups.length
    : 0

  const avgCostWithBackups = costsWithBackups.length > 0
    ? costsWithBackups.reduce((a, b) => a + b, 0) / costsWithBackups.length
    : 0

  const costSavingsBackups = avgCostWithoutBackups - avgCostWithBackups

  // Similar calculations for IR plan
  const costsWithoutIrPlan = incidents
    .filter(i => i.hadIrPlan === false && i.estimatedCost)
    .map(i => i.estimatedCost!)

  const costsWithIrPlan = incidents
    .filter(i => i.hadIrPlan === true && i.estimatedCost)
    .map(i => i.estimatedCost!)

  const avgCostWithoutIrPlan = costsWithoutIrPlan.length > 0
    ? costsWithoutIrPlan.reduce((a, b) => a + b, 0) / costsWithoutIrPlan.length
    : 0

  const avgCostWithIrPlan = costsWithIrPlan.length > 0
    ? costsWithIrPlan.reduce((a, b) => a + b, 0) / costsWithIrPlan.length
    : 0

  const costSavingsIrPlan = avgCostWithoutIrPlan - avgCostWithIrPlan

  // Calculate severity and industry breakdowns
  const severityBreakdown: Record<string, number> = {}
  const industryBreakdown: Record<string, number> = {}

  incidents.forEach(i => {
    if (i.severity) {
      severityBreakdown[i.severity] = (severityBreakdown[i.severity] || 0) + 1
    }
    if (i.industry) {
      industryBreakdown[i.industry] = (industryBreakdown[i.industry] || 0) + 1
    }
  })

  return {
    totalIncidents: incidents.length,
    dateRange,
    avgCost,
    medianCost,
    totalCost,
    incidentsWithCostData: costs.length,
    avgDowntime,
    totalDowntime,
    incidentsWithDowntimeData: downtimes.length,
    avgRecordsAffected,
    totalRecordsAffected,
    incidentsWithRecordsData: records.length,
    mfaAdoptionRate,
    backupAdoptionRate,
    irPlanAdoptionRate,
    incidentsWithSecurityData: securityDataCount,
    costSavingsMfa,
    costSavingsBackups,
    costSavingsIrPlan,
    severityBreakdown,
    industryBreakdown,
  }
}

/**
 * Health check for incident search service
 */
export async function checkIncidentSearchHealth(): Promise<boolean> {
  try {
    console.log(`[Incident Search] Running health check...`)
    const healthy = await healthCheck()
    console.log(`[Incident Search] Health check: ${healthy ? 'PASSED' : 'FAILED'}`)
    return healthy
  } catch (error) {
    console.error(`[Incident Search] Health check error:`, error)
    return false
  }
}

// Export for backward compatibility
export default {
  findSimilarIncidents,
  calculateIncidentStatistics,
  checkIncidentSearchHealth,
}
