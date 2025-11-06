/**
 * Risk Assessment Service
 *
 * Provides risk weight calculation and evidence-based analysis using
 * historical incident data and LLM analysis
 */

import { findSimilarIncidents, calculateIncidentStatistics, IncidentMatch } from './incident-search'
import { resilientOpenAIClient } from '../lib/openai-resilient'

// ============================================================================
// RISK WEIGHT CALCULATION
// ============================================================================

interface RiskWeightRequest {
  systemDescription: string
  technologyStack: string[]
  industry: string
  deployment: 'cloud' | 'on-prem' | 'hybrid'
}

interface RiskWeightResult {
  riskWeights: Array<{
    category: string
    weight: number
    reasoning: {
      incidentFrequency: number
      avgSeverity: number
      techRelevance: number
      regulatoryImpact: string
    }
    evidence: {
      incidentCount: number
      avgSeverity: number
      relevanceScore: number
      recentExamples: Array<{
        id: string
        title: string
        date: string
        severity: number
        impact: string
      }>
      statistics: {
        totalCost: number
        avgCost: number
        affectedSystems: number
      }
    }
  }>
  totalIncidentsAnalyzed: number
  topCategories: string[]
}

/**
 * Calculate risk weights from system context and incident database
 */
export async function calculateRiskWeights(request: RiskWeightRequest): Promise<RiskWeightResult> {
  console.log('[RiskWeights] Calculating risk weights...')

  try {
    // Build search query from system context
    const searchQuery = `${request.systemDescription} ${request.technologyStack.join(' ')} ${request.industry} ${request.deployment}`

    // Find similar incidents
    const incidents = await findSimilarIncidents(searchQuery, {
      limit: 100,
      minSimilarity: 0.6,
      industry: request.industry,
    })

    console.log(`[RiskWeights] Found ${incidents.length} similar incidents`)

    // Aggregate incidents by category
    const categoryMap = new Map<string, IncidentMatch[]>()
    incidents.forEach(incident => {
      const category = incident.incidentType
      if (!categoryMap.has(category)) {
        categoryMap.set(category, [])
      }
      categoryMap.get(category)!.push(incident)
    })

    // Calculate weights for each category
    const riskWeights = Array.from(categoryMap.entries())
      .map(([category, categoryIncidents]) => {
        const stats = calculateIncidentStatistics(categoryIncidents)

        // Calculate component scores
        const incidentFrequency = Math.min((categoryIncidents.length / 10) * 10, 10) // Scale to 10
        const avgSeverity = calculateAverageSeverityScore(categoryIncidents)
        const techRelevance = calculateTechRelevance(categoryIncidents, request.technologyStack)
        const regulatoryImpact = determineRegulatoryImpact(categoryIncidents)

        // Calculate composite weight (0-10 scale)
        const weight = (
          incidentFrequency * 0.4 +
          avgSeverity * 0.3 +
          techRelevance * 10 * 0.2 +
          (regulatoryImpact === 'high' ? 10 : regulatoryImpact === 'medium' ? 6 : 3) * 0.1
        )

        // Format recent examples
        const recentExamples = categoryIncidents.slice(0, 3).map(incident => ({
          id: incident.incidentId,
          title: incident.embeddingText.substring(0, 100),
          date: incident.incidentDate?.toISOString().split('T')[0] || 'Unknown',
          severity: mapSeverityToNumber(incident.severity),
          impact: incident.estimatedCost
            ? `Estimated cost: $${Number(incident.estimatedCost).toLocaleString()}`
            : 'Impact data unavailable',
        }))

        return {
          category,
          weight: parseFloat(weight.toFixed(1)),
          reasoning: {
            incidentFrequency: parseFloat(incidentFrequency.toFixed(1)),
            avgSeverity: parseFloat(avgSeverity.toFixed(1)),
            techRelevance: parseFloat(techRelevance.toFixed(2)),
            regulatoryImpact,
          },
          evidence: {
            incidentCount: categoryIncidents.length,
            avgSeverity: parseFloat(avgSeverity.toFixed(1)),
            relevanceScore: parseFloat(techRelevance.toFixed(2)),
            recentExamples,
            statistics: {
              totalCost: stats.totalCost,
              avgCost: stats.avgCost,
              affectedSystems: categoryIncidents.length,
            },
          },
        }
      })
      .sort((a, b) => b.weight - a.weight) // Sort by weight descending

    const topCategories = riskWeights.slice(0, 5).map(rw => rw.category)

    console.log(`[RiskWeights] Top categories: ${topCategories.join(', ')}`)

    return {
      riskWeights,
      totalIncidentsAnalyzed: incidents.length,
      topCategories,
    }
  } catch (error) {
    console.error('[RiskWeights] Error:', error)
    throw error
  }
}

// ============================================================================
// EVIDENCE-BASED ANALYSIS
// ============================================================================

interface EvidenceAnalysisRequest {
  systemDescription: string
  riskCategory: string
  industry: string
  maxExamples: number
}

interface EvidenceAnalysisResult {
  riskCategory: string
  incidentCount: number
  avgSeverity: number
  keyFindings: string[]
  recentExamples: Array<{
    id: string
    title: string
    date: string
    severity: number
    impact: string
    cost: number
  }>
  recommendations: string[]
}

/**
 * Generate evidence-based risk analysis using LLM + incident database
 */
export async function generateEvidenceBasedAnalysis(
  request: EvidenceAnalysisRequest
): Promise<EvidenceAnalysisResult> {
  console.log(`[EvidenceAnalysis] Analyzing ${request.riskCategory}...`)

  try {
    // Search for incidents in this risk category
    const searchQuery = `${request.systemDescription} ${request.riskCategory} ${request.industry}`
    const incidents = await findSimilarIncidents(searchQuery, {
      limit: 50,
      minSimilarity: 0.6,
      industry: request.industry,
    })

    // Filter to only incidents matching the risk category
    const relevantIncidents = incidents.filter(i =>
      i.incidentType.toLowerCase().includes(request.riskCategory.toLowerCase()) ||
      i.embeddingText.toLowerCase().includes(request.riskCategory.toLowerCase())
    )

    console.log(`[EvidenceAnalysis] Found ${relevantIncidents.length} relevant incidents`)

    const stats = calculateIncidentStatistics(relevantIncidents)
    const avgSeverity = calculateAverageSeverityScore(relevantIncidents)

    // Format recent examples
    const recentExamples = relevantIncidents.slice(0, request.maxExamples).map(incident => ({
      id: incident.incidentId,
      title: incident.embeddingText.substring(0, 100),
      date: incident.incidentDate?.toISOString().split('T')[0] || 'Unknown',
      severity: mapSeverityToNumber(incident.severity),
      impact: incident.estimatedCost
        ? `Exposed ${incident.recordsAffected?.toLocaleString() || 'unknown'} records`
        : 'Impact data unavailable',
      cost: incident.estimatedCost ? Number(incident.estimatedCost) : 0,
    }))

    // Use LLM to analyze patterns and generate recommendations
    const incidentSummary = relevantIncidents.slice(0, 10).map((i, idx) => {
      const cost = i.estimatedCost ? `$${Number(i.estimatedCost).toLocaleString()}` : 'Unknown'
      return `${idx + 1}. ${i.incidentType} - ${i.severity || 'medium'} severity - Cost: ${cost}`
    }).join('\n')

    const prompt = `You are a cybersecurity expert analyzing incident patterns. Based on the following incident data, provide:

**RISK CATEGORY:** ${request.riskCategory}
**INDUSTRY:** ${request.industry}
**SYSTEM:** ${request.systemDescription.substring(0, 200)}

**INCIDENT DATA (${relevantIncidents.length} similar incidents):**
${incidentSummary}

**STATISTICS:**
- Average cost: $${stats.avgCost.toLocaleString()}
- Average severity: ${avgSeverity.toFixed(1)}/10
- Total cost: $${stats.totalCost.toLocaleString()}

Provide a JSON response with:
{
  "keyFindings": [
    "Finding 1: Specific pattern or trend with percentage/numbers",
    "Finding 2: Another specific finding with evidence",
    "Finding 3: Third specific finding"
  ],
  "recommendations": [
    "Recommendation 1: Specific, actionable recommendation",
    "Recommendation 2: Another specific recommendation",
    "Recommendation 3: Third recommendation"
  ]
}

Be specific, data-driven, and actionable. Use numbers from the incident data.`

    const analysis = await resilientOpenAIClient.chatCompletion(
      [{ role: 'user', content: prompt }],
      {
        model: 'gpt-4o',
        temperature: 0.5,
        maxTokens: 500,
        responseFormat: { type: 'json_object' },
      }
    )

    const parsed = JSON.parse(analysis)

    return {
      riskCategory: request.riskCategory,
      incidentCount: relevantIncidents.length,
      avgSeverity: parseFloat(avgSeverity.toFixed(1)),
      keyFindings: parsed.keyFindings || [
        `${relevantIncidents.length} similar incidents identified`,
        `Average cost per incident: $${stats.avgCost.toLocaleString()}`,
        `Most affected industry: ${request.industry}`,
      ],
      recentExamples,
      recommendations: parsed.recommendations || [
        'Implement data encryption for sensitive information',
        'Regular security audits and penetration testing',
        'Employee security awareness training',
      ],
    }
  } catch (error) {
    console.error('[EvidenceAnalysis] Error:', error)
    throw error
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateAverageSeverityScore(incidents: IncidentMatch[]): number {
  const severityMap: Record<string, number> = {
    critical: 10,
    high: 7.5,
    medium: 5,
    low: 2.5,
  }

  const scores = incidents
    .filter(i => i.severity)
    .map(i => severityMap[i.severity!.toLowerCase()] || 5)

  return scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 5
}

function mapSeverityToNumber(severity?: string | null): number {
  const map: Record<string, number> = {
    critical: 10,
    high: 8,
    medium: 5,
    low: 2,
  }
  return severity ? map[severity.toLowerCase()] || 5 : 5
}

function calculateTechRelevance(incidents: IncidentMatch[], techStack: string[]): number {
  if (techStack.length === 0) return 0.7 // Neutral if no tech stack provided

  const relevantIncidents = incidents.filter(incident => {
    const text = incident.embeddingText.toLowerCase()
    return techStack.some(tech => text.includes(tech.toLowerCase()))
  })

  return relevantIncidents.length / Math.max(incidents.length, 1)
}

function determineRegulatoryImpact(incidents: IncidentMatch[]): 'high' | 'medium' | 'low' {
  const regulatoryKeywords = ['gdpr', 'hipaa', 'pci', 'sox', 'compliance', 'regulation', 'fine']
  const regulatoryIncidents = incidents.filter(incident => {
    const text = incident.embeddingText.toLowerCase()
    return regulatoryKeywords.some(keyword => text.includes(keyword))
  })

  const ratio = regulatoryIncidents.length / Math.max(incidents.length, 1)

  if (ratio > 0.3) return 'high'
  if (ratio > 0.1) return 'medium'
  return 'low'
}
