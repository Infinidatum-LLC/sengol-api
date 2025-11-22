/**
 * Feature Gates Service
 *
 * Manages feature access control and usage limits based on user subscription tier.
 * Queries database for user subscription, role, and usage data.
 */

import { query } from '../lib/db'
import { PricingTier, FeatureGateKey, LimitKey, getTierLimits, hasFeature } from '../lib/pricing'
import { getUserSubscription } from '../lib/subscription-queries'

/**
 * Get user's current pricing tier (with default fallback)
 */
export async function getUserTier(userId: string): Promise<PricingTier> {
  try {
    const { tier } = await getUserSubscription(userId)
    // Map 'trial' to 'professional' for pricing calculations
    return tier === 'trial' ? 'professional' : tier
  } catch (error) {
    console.error('[FEATURE_GATES] Error getting user tier:', error)
    return 'free' // Default to free tier on error
  }
}

/**
 * Check if user is an admin (with default fallback)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const result = await query(
      `SELECT "role" FROM "User" WHERE "id" = $1 LIMIT 1`,
      [userId]
    )

    if (result.rows.length === 0) {
      return false
    }

    const role = result.rows[0].role
    return role === 'admin' || role === 'ADMIN'
  } catch (error) {
    console.error('[FEATURE_GATES] Error checking admin status:', error)
    return false // Default to non-admin on error
  }
}

/**
 * Check if user has access to a feature
 */
export async function checkFeatureAccess(
  userId: string,
  feature: FeatureGateKey
): Promise<{ hasAccess: boolean; tier: PricingTier; error?: FeatureGateError }> {
  const isAdmin = await isUserAdmin(userId)
  if (isAdmin) {
    return { hasAccess: true, tier: 'enterprise' }
  }

  const tier = await getUserTier(userId)
  const hasAccess = hasFeature(tier, feature)

  if (!hasAccess) {
    return {
      hasAccess: false,
      tier,
      error: {
        type: 'FEATURE_NOT_AVAILABLE',
        message: `${feature} is not available on your ${tier} plan.`,
        feature,
        currentTier: tier,
        upgradeRequired: true,
      },
    }
  }

  return { hasAccess: true, tier }
}

/**
 * Count assessments created this month
 */
export async function countAssessmentsThisMonth(userId: string, useCache: boolean = true): Promise<number> {
  try {
    const startOfMonth = new Date()
    startOfMonth.setDate(1)
    startOfMonth.setHours(0, 0, 0, 0)

    const result = await query(
      `SELECT COUNT(*) as count FROM "Review" 
       WHERE "userId" = $1 AND "createdAt" >= $2`,
      [userId, startOfMonth.toISOString()]
    )

    return parseInt(result.rows[0]?.count || '0', 10)
  } catch (error) {
    console.error('[FEATURE_GATES] Error counting assessments:', error)
    return 0 // Default to 0 on error
  }
}

/**
 * Count user's projects
 */
export async function countUserProjects(userId: string, useCache: boolean = true): Promise<number> {
  try {
    const result = await query(
      `SELECT COUNT(*) as count FROM "Project" WHERE "userId" = $1`,
      [userId]
    )

    return parseInt(result.rows[0]?.count || '0', 10)
  } catch (error) {
    console.error('[FEATURE_GATES] Error counting projects:', error)
    return 0 // Default to 0 on error
  }
}

/**
 * Check assessment creation limit
 */
export async function checkAssessmentLimit(userId: string): Promise<LimitCheckResult> {
  const isAdmin = await isUserAdmin(userId)
  if (isAdmin) {
    return { allowed: true, tier: 'enterprise', isAdmin: true }
  }

  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)
  const currentCount = await countAssessmentsThisMonth(userId)

  const limit = limits.riskAssessmentsPerMonth
  const remaining = limit === -1 ? -1 : Math.max(0, limit - currentCount)
  const allowed = limit === -1 || currentCount < limit

  if (!allowed) {
    return {
      allowed: false,
      tier,
      current: currentCount,
      limit,
      remaining: 0,
      error: {
        type: 'LIMIT_EXCEEDED',
        message: `You've reached your monthly assessment limit of ${limit} for the ${tier} plan.`,
        limitKey: 'assessments',
        current: currentCount,
        limit,
        upgradeRequired: true,
      },
    }
  }

  return {
    allowed: true,
    tier,
    current: currentCount,
    limit,
    remaining,
  }
}

/**
 * Check project creation limit
 */
export async function checkProjectLimit(userId: string): Promise<LimitCheckResult> {
  const isAdmin = await isUserAdmin(userId)
  if (isAdmin) {
    return { allowed: true, tier: 'enterprise', isAdmin: true }
  }

  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)
  const currentCount = await countUserProjects(userId)

  const limit = limits.projects
  const remaining = limit === -1 ? -1 : Math.max(0, limit - currentCount)
  const allowed = limit === -1 || currentCount < limit

  if (!allowed) {
    return {
      allowed: false,
      tier,
      current: currentCount,
      limit,
      remaining: 0,
      error: {
        type: 'LIMIT_EXCEEDED',
        message: `You've reached your project limit of ${limit} for the ${tier} plan.`,
        limitKey: 'projects',
        current: currentCount,
        limit,
        upgradeRequired: true,
      },
    }
  }

  return {
    allowed: true,
    tier,
    current: currentCount,
    limit,
    remaining,
  }
}

/**
 * Get usage summary for user
 */
export async function getUserUsageSummary(userId: string) {
  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)

  const assessmentCount = await countAssessmentsThisMonth(userId)
  const projectCount = await countUserProjects(userId)

  const assessmentLimit = limits.riskAssessmentsPerMonth
  const projectLimit = limits.projects

  return {
    tier,
    limits,
    usage: {
      assessments: {
        current: assessmentCount,
        limit: assessmentLimit,
        remaining: assessmentLimit === -1 ? -1 : Math.max(0, assessmentLimit - assessmentCount),
        percentage: assessmentLimit === -1 ? 0 : Math.min(100, Math.round((assessmentCount / assessmentLimit) * 100)),
      },
      projects: {
        current: projectCount,
        limit: projectLimit,
        remaining: projectLimit === -1 ? -1 : Math.max(0, projectLimit - projectCount),
        percentage: projectLimit === -1 ? 0 : Math.min(100, Math.round((projectCount / projectLimit) * 100)),
      },
    },
  }
}

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface FeatureGateError {
  type: 'FEATURE_NOT_AVAILABLE'
  message: string
  feature: FeatureGateKey
  currentTier: PricingTier
  upgradeRequired: boolean
  recommendedUpgrade?: PricingTier
  upgradeUrl?: string
}

export interface LimitError {
  type: 'LIMIT_EXCEEDED'
  message: string
  limitKey: string
  current: number
  limit: number
  upgradeRequired: boolean
  recommendedUpgrade?: PricingTier
  upgradeUrl?: string
}

export interface LimitCheckResult {
  allowed: boolean
  tier: PricingTier
  current?: number
  limit?: number
  remaining?: number
  error?: LimitError
  isAdmin?: boolean
}
