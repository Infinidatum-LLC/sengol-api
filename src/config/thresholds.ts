/**
 * Centralized Threshold Configuration for Question Generation
 *
 * This file consolidates all threshold values, weights, and filtering criteria
 * used in the dynamic question generation system. Previously scattered across
 * 8+ locations in dynamic-question-generator.ts, causing inconsistencies and bugs.
 *
 * Based on: /tmp/CODE_CLEANUP_PLAN.md Phase 3
 */

// ============================================================================
// PRE-FILTER THRESHOLDS
// ============================================================================

/**
 * Initial filtering thresholds applied before intensity-based rules
 * Used to filter out irrelevant or low-quality questions early
 */
export const PRE_FILTER_THRESHOLDS = {
  /**
   * Minimum risk/compliance weight required (0-1 scale)
   * Questions below this threshold are filtered out before intensity rules
   * Default: 0.3 (30% minimum relevance)
   */
  minWeight: 0.3,

  /**
   * Minimum number of supporting incidents required
   * Questions must be backed by at least this many real incidents
   * Default: 1 incident minimum
   */
  minIncidentCount: 1,

  /**
   * Minimum vector similarity score for incident matching (0-1 scale)
   * Lower values return more incidents but with less relevance
   * Default: 0.3 (30% semantic similarity)
   */
  minSimilarity: 0.3,
} as const

// ============================================================================
// INTENSITY-BASED FILTERING
// ============================================================================

/**
 * Question intensity levels control the volume and depth of questions
 * Each level has different thresholds, priorities, and question limits
 */
export const QUESTION_INTENSITY = {
  /**
   * HIGH INTENSITY
   * - Comprehensive assessment with maximum coverage
   * - Accepts all weight levels (0%+)
   * - Includes all priority levels (critical, high, medium, low)
   * - Generates up to 25 questions
   */
  high: {
    minWeight: 0.0,
    priorities: ['critical', 'high', 'medium', 'low'] as const,
    maxQuestions: 25,
  },

  /**
   * MEDIUM INTENSITY
   * - Balanced assessment focusing on higher priorities
   * - Requires 40%+ weight
   * - Includes critical, high, medium priorities only
   * - Generates up to 15 questions
   */
  medium: {
    minWeight: 0.4,
    priorities: ['critical', 'high', 'medium'] as const,
    maxQuestions: 15,
  },

  /**
   * LOW INTENSITY
   * - Focused assessment on critical issues only
   * - Requires 60%+ weight
   * - Includes critical and high priorities only
   * - Generates up to 8 questions
   */
  low: {
    minWeight: 0.6,
    priorities: ['critical', 'high'] as const,
    maxQuestions: 8,
  },
} as const

export type QuestionIntensity = keyof typeof QUESTION_INTENSITY

// ============================================================================
// WEIGHT CALCULATION FORMULAS
// ============================================================================

/**
 * Component weights for final question score calculation
 *
 * finalWeight = (baseWeight × base) + (evidenceWeight × evidence) + (industryWeight × industry)
 *
 * Risk vs Compliance have different weight distributions:
 * - Risk questions prioritize evidence (30%) due to extensive incident database
 * - Compliance questions prioritize base assessment (60%) as regulations are prescriptive
 */
export const WEIGHT_FORMULAS = {
  /**
   * RISK QUESTION WEIGHTS
   * Prioritizes incident evidence due to large historical dataset
   */
  RISK: {
    base: 0.5,       // 50% - LLM-analyzed priority from system description
    evidence: 0.3,   // 30% - Incident frequency/severity from vector DB
    industry: 0.2,   // 20% - Industry-specific relevance
  },

  /**
   * COMPLIANCE QUESTION WEIGHTS
   * Prioritizes base assessment as compliance is more prescriptive
   */
  COMPLIANCE: {
    base: 0.6,       // 60% - LLM-analyzed regulatory requirements
    evidence: 0.25,  // 25% - Compliance violation incidents
    industry: 0.15,  // 15% - Industry-specific regulations
  },
} as const

// ============================================================================
// VECTOR SEARCH CONFIGURATION
// ============================================================================

/**
 * Configuration for vector similarity search operations
 * Used when finding similar incidents for question generation
 */
export const VECTOR_SEARCH_CONFIG = {
  /**
   * Number of incidents to fetch per question (before post-filtering)
   * Higher values improve quality but increase cost/latency
   */
  incidentsPerQuestion: 20,

  /**
   * Maximum incidents to use for evidence after post-filtering
   * Prevents overwhelming LLM context window
   */
  maxEvidenceIncidents: 15,

  /**
   * Multiplier for initial incident fetch (before post-filtering by metadata)
   * Fetch 3x results to account for metadata filters reducing result count
   */
  fetchMultiplier: 3,
} as const

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get threshold configuration for a given intensity level
 * @param intensity - Question intensity level (high, medium, low)
 * @returns Threshold configuration object
 */
export function getIntensityConfig(intensity: QuestionIntensity) {
  return QUESTION_INTENSITY[intensity]
}

/**
 * Get weight formula for a question type
 * @param type - Question type (risk or compliance)
 * @returns Weight formula configuration
 */
export function getWeightFormula(type: 'risk' | 'compliance') {
  return type === 'risk' ? WEIGHT_FORMULAS.RISK : WEIGHT_FORMULAS.COMPLIANCE
}

/**
 * Calculate final weight using the appropriate formula
 * @param type - Question type (risk or compliance)
 * @param baseWeight - LLM-analyzed base weight (0-1)
 * @param evidenceWeight - Incident evidence weight (0-1)
 * @param industryWeight - Industry-specific weight (0-1)
 * @returns Final calculated weight (0-1)
 */
export function calculateFinalWeight(
  type: 'risk' | 'compliance',
  baseWeight: number,
  evidenceWeight: number,
  industryWeight: number
): number {
  const formula = getWeightFormula(type)
  return (
    baseWeight * formula.base +
    evidenceWeight * formula.evidence +
    industryWeight * formula.industry
  )
}

/**
 * Check if a question passes the pre-filter thresholds
 * @param weight - Question weight (0-1)
 * @param incidentCount - Number of supporting incidents
 * @returns true if question passes pre-filter criteria
 */
export function passesPreFilter(weight: number, incidentCount: number): boolean {
  return (
    weight >= PRE_FILTER_THRESHOLDS.minWeight &&
    incidentCount >= PRE_FILTER_THRESHOLDS.minIncidentCount
  )
}

/**
 * Check if a question passes intensity-based filtering
 * @param weight - Question weight (0-1)
 * @param priority - Question priority level
 * @param intensity - Selected intensity level
 * @returns true if question passes intensity filter
 */
export function passesIntensityFilter(
  weight: number,
  priority: string,
  intensity: QuestionIntensity
): boolean {
  const config = getIntensityConfig(intensity)
  return (
    weight >= config.minWeight &&
    config.priorities.includes(priority as any)
  )
}
