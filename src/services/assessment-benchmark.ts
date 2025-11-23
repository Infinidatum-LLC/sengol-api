/**
 * Assessment Benchmarking
 * 
 * Compares user's assessment scores against similar systems in the database.
 * Provides percentile rankings and industry benchmarks.
 */

import { query } from '../lib/db'

export interface BenchmarkData {
  userScore: number
  industryAverage: number
  percentile: number
  similarSystemCount: number
  topQuartile: number
  median: number
  bottomQuartile: number
  recommendation: string
}

export interface BenchmarkFilters {
  industry?: string
  systemCriticality?: string
  dataTypes?: string[]
  techStack?: string[]
}

/**
 * Find similar assessments for benchmarking
 */
async function findSimilarAssessments(
  filters: BenchmarkFilters,
  limit: number = 100
): Promise<Array<{ sengolScore: number; riskScore: number; complianceScore: number }>> {
  try {
    let whereConditions: string[] = []
    const params: any[] = []
    let paramIndex = 1

    // Build WHERE clause
    if (filters.industry) {
      whereConditions.push(`industry = $${paramIndex}`)
      params.push(filters.industry)
      paramIndex++
    }

    if (filters.systemCriticality) {
      whereConditions.push(`"systemCriticality" = $${paramIndex}`)
      params.push(filters.systemCriticality)
      paramIndex++
    }

    // For data types and tech stack, we'd need to check JSON arrays
    // This is a simplified version - in production, you might use JSONB operators

    const whereClause = whereConditions.length > 0
      ? `WHERE ${whereConditions.join(' AND ')}`
      : ''

    const sql = `
      SELECT 
        "sengolScore",
        "riskScore",
        "complianceScore"
      FROM "RiskAssessment"
      ${whereClause}
      AND "sengolScore" IS NOT NULL
      AND "sengolScore" > 0
      ORDER BY "updatedAt" DESC
      LIMIT $${paramIndex}
    `
    params.push(limit)

    const result = await query(sql, params)
    return result.rows.map(row => ({
      sengolScore: Number(row.sengolScore) || 0,
      riskScore: Number(row.riskScore) || 0,
      complianceScore: Number(row.complianceScore) || 0,
    }))
  } catch (error) {
    console.error('[BENCHMARK] Error finding similar assessments:', error)
    return []
  }
}

/**
 * Calculate percentile
 */
function calculatePercentile(userScore: number, scores: number[]): number {
  if (scores.length === 0) return 50 // Default to median if no data

  const sorted = [...scores].sort((a, b) => a - b)
  const belowCount = sorted.filter(s => s < userScore).length
  return Math.round((belowCount / sorted.length) * 100)
}

/**
 * Calculate quartiles
 */
function calculateQuartiles(scores: number[]): {
  topQuartile: number
  median: number
  bottomQuartile: number
} {
  if (scores.length === 0) {
    return { topQuartile: 75, median: 50, bottomQuartile: 25 }
  }

  const sorted = [...scores].sort((a, b) => a - b)
  const q1Index = Math.floor(sorted.length * 0.25)
  const q2Index = Math.floor(sorted.length * 0.5)
  const q3Index = Math.floor(sorted.length * 0.75)

  return {
    topQuartile: sorted[q3Index] || sorted[sorted.length - 1] || 75,
    median: sorted[q2Index] || sorted[Math.floor(sorted.length / 2)] || 50,
    bottomQuartile: sorted[q1Index] || sorted[0] || 25,
  }
}

/**
 * Generate benchmark data for a user's assessment
 */
export async function benchmarkAssessment(
  userScore: number,
  filters: BenchmarkFilters
): Promise<BenchmarkData> {
  const similarAssessments = await findSimilarAssessments(filters, 100)
  
  if (similarAssessments.length === 0) {
    return {
      userScore,
      industryAverage: userScore, // Default to user's score if no data
      percentile: 50,
      similarSystemCount: 0,
      topQuartile: 75,
      median: 50,
      bottomQuartile: 25,
      recommendation: 'Insufficient data for benchmarking. Your score will be compared as more assessments are completed.',
    }
  }

  const scores = similarAssessments.map(a => a.sengolScore)
  const industryAverage = scores.reduce((sum, s) => sum + s, 0) / scores.length
  const percentile = calculatePercentile(userScore, scores)
  const quartiles = calculateQuartiles(scores)

  // Generate recommendation
  let recommendation = ''
  if (percentile >= 90) {
    recommendation = 'Excellent! Your score is in the top 10% of similar systems. You\'re demonstrating strong security and compliance practices.'
  } else if (percentile >= 75) {
    recommendation = 'Great work! Your score is in the top quartile. You\'re above average for similar systems.'
  } else if (percentile >= 50) {
    recommendation = 'Good progress! Your score is above the median. There\'s room for improvement to reach the top quartile.'
  } else if (percentile >= 25) {
    recommendation = 'Your score is below average. Focus on addressing high-impact questions to improve your ranking.'
  } else {
    recommendation = 'Your score needs improvement. Prioritize critical risk areas to move into a higher percentile.'
  }

  return {
    userScore,
    industryAverage: Math.round(industryAverage),
    percentile,
    similarSystemCount: similarAssessments.length,
    topQuartile: Math.round(quartiles.topQuartile),
    median: Math.round(quartiles.median),
    bottomQuartile: Math.round(quartiles.bottomQuartile),
    recommendation,
  }
}

