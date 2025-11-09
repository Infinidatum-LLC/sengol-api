/**
 * Incident Search Service
 *
 * Retrieves relevant incidents from Cloud Storage using semantic search.
 * Uses Gemini to understand query context and find matching incidents.
 */

import { Storage } from '@google-cloud/storage'
import { getGeminiClient } from '../lib/gemini-client'

const storage = new Storage({
  projectId: process.env.GOOGLE_CLOUD_PROJECT?.trim(),
})

const BUCKET_NAME = process.env.GCS_BUCKET_NAME?.trim() || 'sengol-incidents'
const INCIDENT_DATA_PATH = 'incidents/postgres-migrated/raw/'

interface IncidentRecord {
  id: string
  [key: string]: any
}

interface SearchResult {
  incidents: IncidentRecord[]
  totalCount: number
  source: string
}

/**
 * Load all incident data from Cloud Storage (cached)
 */
let incidentCache: Map<string, IncidentRecord[]> | null = null
let cacheTimestamp: number = 0
const CACHE_TTL = 3600000 // 1 hour

async function loadIncidentData(): Promise<Map<string, IncidentRecord[]>> {
  const now = Date.now()

  // Return cached data if still valid
  if (incidentCache && (now - cacheTimestamp) < CACHE_TTL) {
    console.log('[IncidentSearch] Using cached incident data')
    return incidentCache
  }

  console.log('[IncidentSearch] Loading incident data from Cloud Storage...')

  const bucket = storage.bucket(BUCKET_NAME)
  const [files] = await bucket.getFiles({ prefix: INCIDENT_DATA_PATH })

  const jsonFiles = files.filter(file => file.name.endsWith('.json'))
  const dataMap = new Map<string, IncidentRecord[]>()

  for (const file of jsonFiles) {
    try {
      const tableName = file.name.split('/').pop()?.replace('.json', '') || 'unknown'
      const [content] = await file.download()
      const records = JSON.parse(content.toString()) as IncidentRecord[]

      dataMap.set(tableName, records)
      console.log(`[IncidentSearch] Loaded ${records.length} records from ${tableName}`)
    } catch (error) {
      console.error(`[IncidentSearch] Error loading ${file.name}:`, error)
    }
  }

  incidentCache = dataMap
  cacheTimestamp = now

  return dataMap
}

/**
 * Search for relevant incidents using Gemini's understanding
 */
export async function searchIncidents(
  context: {
    industry?: string
    complianceFrameworks?: string[]
    riskAreas?: string[]
    organizationSize?: string
    technologies?: string[]
  },
  limit: number = 20
): Promise<SearchResult> {
  console.log('[IncidentSearch] Searching for relevant incidents...')
  console.log('[IncidentSearch] Context:', JSON.stringify(context, null, 2))

  try {
    // Load all incident data
    const incidentData = await loadIncidentData()

    // Get all incidents
    const allIncidents: Array<IncidentRecord & { type: string }> = []
    for (const [type, records] of incidentData.entries()) {
      records.forEach(record => {
        allIncidents.push({ ...record, type })
      })
    }

    console.log(`[IncidentSearch] Total incidents available: ${allIncidents.length}`)

    // Use Gemini to rank incidents by relevance
    const relevantIncidents = await rankIncidentsByRelevance(allIncidents, context, limit)

    return {
      incidents: relevantIncidents,
      totalCount: allIncidents.length,
      source: 'cloud-storage'
    }
  } catch (error) {
    console.error('[IncidentSearch] Error searching incidents:', error)
    throw error
  }
}

/**
 * Use Gemini to rank incidents by relevance to the assessment context
 */
async function rankIncidentsByRelevance(
  incidents: Array<IncidentRecord & { type: string }>,
  context: any,
  limit: number
): Promise<IncidentRecord[]> {
  // For performance, pre-filter incidents based on simple criteria
  let filtered = incidents

  // Filter by industry if specified
  if (context.industry) {
    filtered = filtered.filter(inc => {
      const industry = inc.industry?.toLowerCase() || ''
      return industry.includes(context.industry.toLowerCase())
    })
  }

  // If we have too many incidents, use Gemini to intelligently select the most relevant ones
  if (filtered.length > limit * 5) {
    // Sample a diverse set
    filtered = sampleDiverseIncidents(filtered, limit * 3)
  }

  // If still have reasonable number, return top N
  if (filtered.length <= limit) {
    return filtered
  }

  // Use Gemini to rank the remaining incidents
  console.log(`[IncidentSearch] Using Gemini to rank ${filtered.length} incidents...`)

  try {
    const gemini = getGeminiClient()

    // Create a concise summary of each incident for Gemini to evaluate
    const incidentSummaries = filtered.slice(0, 50).map((inc, idx) => ({
      index: idx,
      summary: createIncidentSummary(inc)
    }))

    const prompt = `Given an organization with the following profile:
Industry: ${context.industry || 'Not specified'}
Compliance Frameworks: ${context.complianceFrameworks?.join(', ') || 'Not specified'}
Risk Areas: ${context.riskAreas?.join(', ') || 'Not specified'}
Organization Size: ${context.organizationSize || 'Not specified'}
Technologies: ${context.technologies?.join(', ') || 'Not specified'}

Here are ${incidentSummaries.length} security incidents. Select the ${limit} most relevant incident indexes (by number) that would provide the most valuable lessons for this organization's risk assessment.

Incidents:
${incidentSummaries.map(s => `${s.index}. ${s.summary}`).join('\n')}

Respond with ONLY a JSON array of the ${limit} most relevant incident indexes, like: [0, 5, 12, ...]`

    const result = await gemini.generateContent(prompt)
    const response = result.response.text()

    // Parse the response to get selected indexes
    const match = response.match(/\[([\d,\s]+)\]/)
    if (match) {
      const selectedIndexes = match[1].split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n))
      console.log(`[IncidentSearch] Gemini selected indexes: ${selectedIndexes.join(', ')}`)

      const selected = selectedIndexes
        .filter(idx => idx < filtered.length)
        .map(idx => filtered[idx])

      return selected.slice(0, limit)
    }
  } catch (error) {
    console.error('[IncidentSearch] Error using Gemini for ranking:', error)
  }

  // Fallback: return first N incidents
  console.log('[IncidentSearch] Using fallback: returning first incidents')
  return filtered.slice(0, limit)
}

/**
 * Sample diverse incidents across different types and severities
 */
function sampleDiverseIncidents(
  incidents: Array<IncidentRecord & { type: string }>,
  count: number
): Array<IncidentRecord & { type: string }> {
  // Group by type
  const byType = new Map<string, Array<IncidentRecord & { type: string }>>()

  incidents.forEach(inc => {
    if (!byType.has(inc.type)) {
      byType.set(inc.type, [])
    }
    byType.get(inc.type)!.push(inc)
  })

  // Sample evenly from each type
  const result: Array<IncidentRecord & { type: string }> = []
  const perType = Math.ceil(count / byType.size)

  for (const [type, typeIncidents] of byType.entries()) {
    // Take a mix of different severity levels if available
    const sample = typeIncidents
      .sort((a, b) => {
        const severityOrder: any = { critical: 4, high: 3, medium: 2, low: 1 }
        const aSev = severityOrder[a.severity?.toLowerCase()] || 0
        const bSev = severityOrder[b.severity?.toLowerCase()] || 0
        return bSev - aSev
      })
      .slice(0, perType)

    result.push(...sample)
  }

  return result.slice(0, count)
}

/**
 * Create a concise summary of an incident for Gemini evaluation
 */
function createIncidentSummary(incident: IncidentRecord & { type: string }): string {
  const type = incident.type

  if (type === 'cyber_incident_staging') {
    return `${incident.attack_type} attack on ${incident.organization} (${incident.industry}) - ${incident.severity} severity, $${incident.estimated_cost} cost`
  }

  if (type === 'cloud_incident_staging') {
    return `${incident.cloud_provider} ${incident.affected_service} - ${incident.incident_type} affecting ${incident.affected_customers} customers`
  }

  if (type === 'failure_patterns') {
    return `${incident.pattern_type} failure in ${incident.category} - occurs ${incident.occurrence_frequency}`
  }

  if (type === 'security_vulnerabilities') {
    return `${incident.cve_id}: ${incident.vulnerability_type} (CVSS ${incident.cvss_score}) in ${incident.affected_products?.join(', ')}`
  }

  if (type === 'regulation_violations') {
    return `${incident.regulation_framework} violation by ${incident.organization} - ${incident.violation_type}, fine: $${incident.fine_amount}`
  }

  if (type === 'cep_signal_events') {
    return `CEP Signal: ${incident.event_type} from ${incident.source} - ${incident.severity} severity`
  }

  return `${type}: ${JSON.stringify(incident).slice(0, 100)}...`
}

/**
 * Get incident statistics for monitoring
 */
export async function getIncidentStats(): Promise<{
  totalIncidents: number
  byType: Record<string, number>
  cacheAge: number
}> {
  const data = await loadIncidentData()
  const byType: Record<string, number> = {}
  let total = 0

  for (const [type, records] of data.entries()) {
    byType[type] = records.length
    total += records.length
  }

  return {
    totalIncidents: total,
    byType,
    cacheAge: Date.now() - cacheTimestamp
  }
}

/**
 * Clear the incident cache (useful for testing or after data updates)
 */
export function clearIncidentCache(): void {
  console.log('[IncidentSearch] Clearing incident cache')
  incidentCache = null
  cacheTimestamp = 0
}
