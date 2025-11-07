/**
 * Industry Benchmarking Service
 *
 * Calculates industry benchmarks and comparisons using d-vecDB incident data
 * with intelligent fallback to synthetic benchmarks when needed.
 */

import { findSimilarIncidents, calculateIncidentStatistics, type IncidentMatch } from './incident-search'

// ============================================================================
// TYPES
// ============================================================================

export interface BenchmarkData {
  industry: string
  aiSystemType: string
  averageRiskScore: number
  medianRiskScore: number
  p25RiskScore: number
  p75RiskScore: number
  p90RiskScore: number
  sampleSize: number
  dataSource: 'dvecdb_realtime' | 'synthetic_fallback'
  avgIncidentCost?: number
  topRiskFactors: Array<{
    category: string
    avgScore: number
    frequency: number
  }>
  avgComplianceScore: number | null
  medianComplianceScore: number | null
  p25ComplianceScore: number | null
  p75ComplianceScore: number | null
}

export interface ComparisonData {
  percentile: number // 0-100 (lower percentile = lower risk)
  ranking: 'excellent' | 'above_average' | 'average' | 'below_average' | 'high_risk'
  difference: number // userScore - averageRiskScore
  differencePercent: number // % delta vs average
  comparisonText: string
  performanceBand: {
    label: string
    color: string
    icon: string
  }
}

export interface BenchmarkResponse {
  userScore: number
  benchmark: BenchmarkData | null
  comparison: ComparisonData | null
  isFallback: boolean
  fallbackMessage: string | null
  message: string | null
}

// ============================================================================
// SYNTHETIC FALLBACK DATA
// ============================================================================

const SYNTHETIC_BENCHMARKS: Record<string, Partial<BenchmarkData>> = {
  'Financial Services': {
    averageRiskScore: 71.2,
    medianRiskScore: 69.8,
    p25RiskScore: 58.3,
    p75RiskScore: 82.5,
    p90RiskScore: 88.1,
    avgIncidentCost: 1_350_000,
    topRiskFactors: [
      { category: 'Data Privacy', avgScore: 79.1, frequency: 42 },
      { category: 'Model Bias', avgScore: 73.5, frequency: 31 },
      { category: 'Access Control', avgScore: 68.2, frequency: 28 },
    ],
    avgComplianceScore: 65.4,
    medianComplianceScore: 67.0,
    p25ComplianceScore: 52.1,
    p75ComplianceScore: 78.9,
  },
  'Healthcare': {
    averageRiskScore: 75.8,
    medianRiskScore: 74.2,
    p25RiskScore: 63.5,
    p75RiskScore: 86.1,
    p90RiskScore: 91.3,
    avgIncidentCost: 2_100_000,
    topRiskFactors: [
      { category: 'Data Privacy', avgScore: 84.2, frequency: 58 },
      { category: 'Access Control', avgScore: 77.8, frequency: 45 },
      { category: 'Data Encryption', avgScore: 72.1, frequency: 39 },
    ],
    avgComplianceScore: 58.3,
    medianComplianceScore: 60.5,
    p25ComplianceScore: 45.2,
    p75ComplianceScore: 72.8,
  },
  'Technology': {
    averageRiskScore: 65.4,
    medianRiskScore: 64.1,
    p25RiskScore: 52.8,
    p75RiskScore: 76.9,
    p90RiskScore: 83.5,
    avgIncidentCost: 980_000,
    topRiskFactors: [
      { category: 'API Security', avgScore: 71.3, frequency: 52 },
      { category: 'Model Security', avgScore: 68.5, frequency: 41 },
      { category: 'Data Privacy', avgScore: 65.7, frequency: 38 },
    ],
    avgComplianceScore: 71.2,
    medianComplianceScore: 73.5,
    p25ComplianceScore: 61.3,
    p75ComplianceScore: 82.1,
  },
  'Retail': {
    averageRiskScore: 68.9,
    medianRiskScore: 67.3,
    p25RiskScore: 56.1,
    p75RiskScore: 79.4,
    p90RiskScore: 85.7,
    avgIncidentCost: 1_150_000,
    topRiskFactors: [
      { category: 'Payment Security', avgScore: 75.8, frequency: 46 },
      { category: 'Data Privacy', avgScore: 70.2, frequency: 39 },
      { category: 'Access Control', avgScore: 66.4, frequency: 33 },
    ],
    avgComplianceScore: 62.8,
    medianComplianceScore: 64.2,
    p25ComplianceScore: 51.5,
    p75ComplianceScore: 75.3,
  },
  'default': {
    averageRiskScore: 68.5,
    medianRiskScore: 67.0,
    p25RiskScore: 55.2,
    p75RiskScore: 79.8,
    p90RiskScore: 86.3,
    avgIncidentCost: 1_200_000,
    topRiskFactors: [
      { category: 'Data Privacy', avgScore: 73.5, frequency: 40 },
      { category: 'Access Control', avgScore: 69.8, frequency: 35 },
      { category: 'API Security', avgScore: 66.2, frequency: 30 },
    ],
    avgComplianceScore: 67.3,
    medianComplianceScore: 69.1,
    p25ComplianceScore: 56.4,
    p75ComplianceScore: 78.5,
  },
}

// ============================================================================
// BENCHMARK CALCULATION
// ============================================================================

/**
 * Calculate benchmark from d-vecDB incidents
 */
export async function calculateBenchmarkFromIncidents(
  incidents: IncidentMatch[],
  industry: string,
  aiSystemType: string = 'AI System'
): Promise<BenchmarkData> {
  console.log(`[Benchmark] Calculating from ${incidents.length} incidents`)

  if (incidents.length < 10) {
    console.warn(`[Benchmark] Insufficient incidents (${incidents.length}), using synthetic fallback`)
    throw new Error('Insufficient incident data')
  }

  const stats = calculateIncidentStatistics(incidents)

  // Calculate risk scores from incidents (based on severity and cost)
  const riskScores = incidents.map(incident => {
    const severityMap: Record<string, number> = {
      'critical': 90,
      'high': 75,
      'medium': 55,
      'low': 30,
    }
    const severityScore = severityMap[incident.severity?.toLowerCase() || 'medium'] || 55

    // Adjust by cost (normalize to 0-20 range)
    const costScore = incident.estimatedCost
      ? Math.min(20, Number(incident.estimatedCost) / 100_000)
      : 0

    return Math.min(100, severityScore + costScore)
  })

  // Calculate percentiles
  const sortedScores = [...riskScores].sort((a, b) => a - b)
  const averageRiskScore = riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length
  const medianRiskScore = sortedScores[Math.floor(sortedScores.length / 2)]
  const p25RiskScore = sortedScores[Math.floor(sortedScores.length * 0.25)]
  const p75RiskScore = sortedScores[Math.floor(sortedScores.length * 0.75)]
  const p90RiskScore = sortedScores[Math.floor(sortedScores.length * 0.90)]

  // Extract top risk factors from incident types
  const riskFactors = new Map<string, { totalScore: number; count: number }>()
  incidents.forEach(incident => {
    const category = incident.incidentType || 'Unknown'
    const existing = riskFactors.get(category) || { totalScore: 0, count: 0 }
    const severityScore = ({ critical: 90, high: 75, medium: 55, low: 30 })[incident.severity?.toLowerCase() || 'medium'] || 55
    riskFactors.set(category, {
      totalScore: existing.totalScore + severityScore,
      count: existing.count + 1,
    })
  })

  const topRiskFactors = Array.from(riskFactors.entries())
    .map(([category, data]) => ({
      category,
      avgScore: data.totalScore / data.count,
      frequency: data.count,
    }))
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 5)

  return {
    industry,
    aiSystemType,
    averageRiskScore: Math.round(averageRiskScore * 10) / 10,
    medianRiskScore: Math.round(medianRiskScore * 10) / 10,
    p25RiskScore: Math.round(p25RiskScore * 10) / 10,
    p75RiskScore: Math.round(p75RiskScore * 10) / 10,
    p90RiskScore: Math.round(p90RiskScore * 10) / 10,
    sampleSize: incidents.length,
    dataSource: 'dvecdb_realtime',
    avgIncidentCost: Math.round(stats.avgCost),
    topRiskFactors,
    avgComplianceScore: null, // Not available from incident data
    medianComplianceScore: null,
    p25ComplianceScore: null,
    p75ComplianceScore: null,
  }
}

/**
 * Get synthetic fallback benchmark
 */
function getSyntheticBenchmark(industry: string, aiSystemType: string = 'AI System'): BenchmarkData {
  const syntheticData = SYNTHETIC_BENCHMARKS[industry] || SYNTHETIC_BENCHMARKS['default']

  return {
    industry,
    aiSystemType,
    sampleSize: 148, // Synthetic sample size
    dataSource: 'synthetic_fallback',
    ...syntheticData,
  } as BenchmarkData
}

// ============================================================================
// COMPARISON CALCULATION
// ============================================================================

/**
 * Calculate comparison metrics
 */
export function calculateComparison(userScore: number, benchmark: BenchmarkData): ComparisonData {
  const { averageRiskScore, p25RiskScore, p75RiskScore, p90RiskScore } = benchmark

  // Calculate percentile (linear interpolation)
  let percentile: number
  if (userScore <= p25RiskScore) {
    percentile = Math.round((userScore / p25RiskScore) * 25)
  } else if (userScore <= averageRiskScore) {
    percentile = Math.round(25 + ((userScore - p25RiskScore) / (averageRiskScore - p25RiskScore)) * 25)
  } else if (userScore <= p75RiskScore) {
    percentile = Math.round(50 + ((userScore - averageRiskScore) / (p75RiskScore - averageRiskScore)) * 25)
  } else if (userScore <= p90RiskScore) {
    percentile = Math.round(75 + ((userScore - p75RiskScore) / (p90RiskScore - p75RiskScore)) * 15)
  } else {
    percentile = Math.round(90 + Math.min(10, ((userScore - p90RiskScore) / (100 - p90RiskScore)) * 10))
  }

  percentile = Math.max(0, Math.min(100, percentile))

  // Determine ranking
  let ranking: ComparisonData['ranking']
  if (percentile < 25) {
    ranking = 'excellent' // Low risk
  } else if (percentile < 45) {
    ranking = 'above_average'
  } else if (percentile < 65) {
    ranking = 'average'
  } else if (percentile < 85) {
    ranking = 'below_average'
  } else {
    ranking = 'high_risk'
  }

  // Calculate differences
  const difference = Math.round((userScore - averageRiskScore) * 10) / 10
  const differencePercent = Math.round((difference / averageRiskScore) * 100)

  // Generate comparison text
  const comparisonText = generateComparisonText(userScore, averageRiskScore, percentile, ranking)

  // Performance band
  const performanceBand = getPerformanceBand(ranking)

  return {
    percentile,
    ranking,
    difference,
    differencePercent,
    comparisonText,
    performanceBand,
  }
}

/**
 * Generate human-readable comparison text
 */
function generateComparisonText(
  userScore: number,
  averageScore: number,
  percentile: number,
  ranking: string
): string {
  if (ranking === 'excellent') {
    return `Your risk score is significantly better than the industry average, placing you in the top ${100 - percentile}% of similar organizations. You're demonstrating strong security practices.`
  } else if (ranking === 'above_average') {
    return `Your risk score is better than average, with ${Math.round(averageScore - userScore)} points below the industry mean. You're outperforming most peers in your sector.`
  } else if (ranking === 'average') {
    return `Your risk score is close to the industry average, performing similarly to most peers in your sector.`
  } else if (ranking === 'below_average') {
    return `Your risk score is ${Math.round(userScore - averageScore)} points above the industry average. There are opportunities to improve security controls and reduce risk.`
  } else {
    return `Your risk score is significantly higher than the industry average. Immediate attention to critical security gaps is recommended.`
  }
}

/**
 * Get performance band styling
 */
function getPerformanceBand(ranking: string): ComparisonData['performanceBand'] {
  switch (ranking) {
    case 'excellent':
      return { label: 'Excellent', color: '#10b981', icon: '🌟' }
    case 'above_average':
      return { label: 'Above Average', color: '#3b82f6', icon: '👍' }
    case 'average':
      return { label: 'Average', color: '#f59e0b', icon: '⚖️' }
    case 'below_average':
      return { label: 'Below Average', color: '#f97316', icon: '⚠️' }
    case 'high_risk':
      return { label: 'High Risk', color: '#ef4444', icon: '🚨' }
    default:
      return { label: 'Unknown', color: '#6b7280', icon: '❓' }
  }
}

// ============================================================================
// MAIN BENCHMARK FUNCTION
// ============================================================================

/**
 * Get comprehensive benchmark data for an assessment
 */
export async function getBenchmarkData(params: {
  userScore: number
  industry: string
  systemDescription: string
  aiSystemType?: string
}): Promise<BenchmarkResponse> {
  const { userScore, industry, systemDescription, aiSystemType = 'AI System' } = params

  console.log(`[Benchmark] Getting benchmark for ${industry}`)

  let benchmark: BenchmarkData | null = null
  let isFallback = false
  let fallbackMessage: string | null = null

  try {
    // Try to get real-time benchmark from d-vecDB
    console.log(`[Benchmark] Querying d-vecDB for ${industry} incidents`)

    const incidents = await findSimilarIncidents(systemDescription, {
      limit: 100,
      minSimilarity: 0.6,
      industry,
    })

    if (incidents.length >= 10) {
      benchmark = await calculateBenchmarkFromIncidents(incidents, industry, aiSystemType)
      console.log(`[Benchmark] Calculated from ${incidents.length} real incidents`)
    } else {
      throw new Error(`Only ${incidents.length} incidents found, need at least 10`)
    }
  } catch (error) {
    console.warn(`[Benchmark] d-vecDB failed, using synthetic fallback:`, error)
    benchmark = getSyntheticBenchmark(industry, aiSystemType)
    isFallback = true
    fallbackMessage = 'Using synthetic industry benchmark data. Real-time incident data temporarily unavailable.'
  }

  // Calculate comparison if we have benchmark data
  const comparison = benchmark ? calculateComparison(userScore, benchmark) : null

  return {
    userScore,
    benchmark,
    comparison,
    isFallback,
    fallbackMessage,
    message: null,
  }
}
