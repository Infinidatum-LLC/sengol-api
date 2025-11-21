/**
 * Feature Gates Service - STUB
 *
 * Temporary stub to unblock build while Prisma migration is completed.
 * This file replaces the original feature-gates.service.ts which still references
 * the removed resilientPrisma module.
 *
 * TODO: Complete Prisma-to-raw-SQL migration for this module
 */

import { PricingTier, FeatureGateKey, LimitKey, getTierLimits, hasFeature } from '../lib/pricing'

/**
 * Get user's current pricing tier (with default fallback)
 */
export async function getUserTier(userId: string): Promise<PricingTier> {
  // TODO: Query user subscription from database
  return 'free'
}

/**
 * Check if user is an admin (with default fallback)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  // TODO: Query user role from database
  return false
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
  // TODO: Query from database
  return 0
}

/**
 * Count user's projects
 */
export async function countUserProjects(userId: string, useCache: boolean = true): Promise<number> {
  // TODO: Query from database
  return 0
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
  const currentCount = 0

  return {
    allowed: true,
    tier,
    current: currentCount,
    limit: -1,
    remaining: -1,
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

  return {
    allowed: true,
    tier,
    current: 0,
    limit: limits.projects,
    remaining: limits.projects === -1 ? -1 : limits.projects,
  }
}

/**
 * Get usage summary for user
 */
export async function getUserUsageSummary(userId: string) {
  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)

  return {
    tier,
    limits,
    usage: {
      assessments: {
        current: 0,
        limit: -1,
        remaining: -1,
        percentage: 0,
      },
      projects: {
        current: 0,
        limit: limits.projects,
        remaining: limits.projects === -1 ? -1 : limits.projects,
        percentage: 0,
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
