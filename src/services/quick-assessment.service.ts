/**
 * Quick Assessment Service
 *
 * Generates quick 30-word risk or compliance assessments using LLM
 * and incident database evidence
 */

import { findSimilarIncidents, calculateIncidentStatistics } from './incident-search'
import { resilientOpenAIClient } from '../lib/openai-resilient'

/**
 * Generate a quick 30-word assessment of risk or compliance
 */
export async function generateQuickAssessment(
  systemDescription: string,
  type: 'risk' | 'compliance'
): Promise<string> {
  console.log(`[QuickAssessment] Generating ${type} assessment...`)

  try {
    // Find similar incidents for evidence
    const incidents = await findSimilarIncidents(systemDescription, {
      limit: 20,
      minSimilarity: 0.6,
    })

    const stats = calculateIncidentStatistics(incidents)

    // Get top incident types
    const topIncidentTypes = Array.from(new Set(incidents.slice(0, 5).map(i => i.incidentType)))
    const incidentCounts = new Map<string, number>()
    incidents.forEach(i => {
      const count = incidentCounts.get(i.incidentType) || 0
      incidentCounts.set(i.incidentType, count + 1)
    })

    // Format incident summary for prompt
    const incidentSummary = topIncidentTypes
      .map(type => {
        const count = incidentCounts.get(type) || 0
        return `${type} (${count} incidents)`
      })
      .join(', ')

    // Build prompt based on type
    const prompt = type === 'risk'
      ? `You are a cybersecurity risk assessor. Analyze this system description and incident data to provide a quick risk assessment in EXACTLY 30 words.

**SYSTEM DESCRIPTION:**
${systemDescription}

**EVIDENCE FROM INCIDENT DATABASE:**
- Total similar incidents: ${incidents.length}
- Average incident cost: $${stats.avgCost.toLocaleString()}
- Top incident types: ${incidentSummary}

**TASK:**
Write a concise 30-word risk assessment highlighting the top 3 specific risks with evidence (include incident counts in parentheses).

Format: "High risk: [risk 1] ([count]K incidents), [risk 2] ([count]K incidents), [risk 3] ([count]K incidents)."

Keep it factual, specific, and exactly 30 words.`
      : `You are a compliance assessor. Analyze this system description to provide a quick compliance assessment in EXACTLY 30 words.

**SYSTEM DESCRIPTION:**
${systemDescription}

**EVIDENCE FROM INCIDENT DATABASE:**
- Total compliance-related incidents: ${incidents.length}
- Average fine amount: $${stats.avgCost.toLocaleString()}
- Common violations: ${incidentSummary}

**TASK:**
Write a concise 30-word compliance assessment highlighting the top 3 specific compliance requirements or gaps with evidence (include incident counts in parentheses).

Format: "Compliance gaps: [requirement 1] ([count]K incidents), [requirement 2] ([count]K incidents), [requirement 3] ([count]K incidents)."

Keep it factual, specific, and exactly 30 words.`

    const assessment = await resilientOpenAIClient.chatCompletion(
      [{ role: 'user', content: prompt }],
      {
        model: 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 100,
      }
    )

    console.log(`[QuickAssessment] Generated: "${assessment}"`)

    return assessment.trim()
  } catch (error) {
    console.error('[QuickAssessment] Error:', error)
    throw error
  }
}
