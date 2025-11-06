/**
 * Feature Gates Service
 *
 * Handles feature gating, limit enforcement, and tier management
 * Based on: docs/PRICING_AND_GATING_SPECIFICATION.md
 */

import { prisma } from '../lib/prisma'
import {
  PricingTier,
  FeatureGateKey,
  LimitKey,
  PRICING_PLANS,
  getTierLimits,
  hasFeature,
  isLimitExceeded,
  getRecommendedUpgrade,
  getUpgradeUrl,
  getTierDisplayName,
  getTotalAssessmentLimit,
} from '../lib/pricing'

// ============================================================================
// USER TIER MANAGEMENT
// ============================================================================

/**
 * Get user's current pricing tier
 */
export async function getUserTier(userId: string): Promise<PricingTier> {
  try {
    // Fetch user's active subscription
    const subscription = await prisma.toolSubscription.findFirst({
      where: {
        userId,
        status: 'active',
      },
      orderBy: {
        createdAt: 'desc',
      },
    })

    // If no active subscription, user is on free tier
    if (!subscription || !subscription.planId) {
      return 'free'
    }

    // Validate plan ID
    const planId = subscription.planId.toLowerCase()
    if (!['free', 'consultant', 'professional', 'enterprise'].includes(planId)) {
      console.warn(`Invalid plan ID: ${subscription.planId}, defaulting to free`)
      return 'free'
    }

    return planId as PricingTier
  } catch (error) {
    console.error('Error getting user tier:', error)
    return 'free' // Default to free on error
  }
}

/**
 * Check if user is an admin (admins bypass all limits)
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    })

    return user?.role === 'admin'
  } catch (error) {
    console.error('Error checking admin status:', error)
    return false
  }
}

// ============================================================================
// FEATURE GATE CHECKS
// ============================================================================

/**
 * Check if user has access to a feature
 */
export async function checkFeatureAccess(
  userId: string,
  feature: FeatureGateKey
): Promise<{ hasAccess: boolean; tier: PricingTier; error?: FeatureGateError }> {
  // Check if admin (admins bypass all gates)
  const isAdmin = await isUserAdmin(userId)
  if (isAdmin) {
    return { hasAccess: true, tier: 'enterprise' }
  }

  // Get user's tier
  const tier = await getUserTier(userId)

  // Check feature availability
  const hasAccess = hasFeature(tier, feature)

  if (!hasAccess) {
    const recommendedUpgrade = getRecommendedUpgrade(tier)
    return {
      hasAccess: false,
      tier,
      error: {
        type: 'FEATURE_NOT_AVAILABLE',
        message: `${feature} is not available on your ${getTierDisplayName(tier)} plan.`,
        feature,
        currentTier: tier,
        upgradeRequired: true,
        recommendedUpgrade: recommendedUpgrade || undefined,
        upgradeUrl: recommendedUpgrade ? getUpgradeUrl(recommendedUpgrade) : undefined,
      },
    }
  }

  return { hasAccess: true, tier }
}

// ============================================================================
// LIMIT CHECKS
// ============================================================================

/**
 * Count assessments created this month
 */
export async function countAssessmentsThisMonth(userId: string): Promise<number> {
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  const count = await prisma.riskAssessment.count({
    where: {
      userId,
      createdAt: { gte: startOfMonth },
    },
  })

  return count
}

/**
 * Count user's projects
 */
export async function countUserProjects(userId: string): Promise<number> {
  const count = await prisma.project.count({
    where: { userId },
  })

  return count
}

/**
 * Check assessment creation limit
 */
export async function checkAssessmentLimit(userId: string): Promise<LimitCheckResult> {
  // Check if admin (admins bypass all limits)
  const isAdmin = await isUserAdmin(userId)
  if (isAdmin) {
    return { allowed: true, tier: 'enterprise', isAdmin: true }
  }

  // Get user's tier
  const tier = await getUserTier(userId)

  // Count assessments this month
  const currentCount = await countAssessmentsThisMonth(userId)

  // Get total assessment limit
  const totalLimit = getTotalAssessmentLimit(tier)

  // Check if exceeded
  if (totalLimit !== -1 && currentCount >= totalLimit) {
    const recommendedUpgrade = getRecommendedUpgrade(tier)
    return {
      allowed: false,
      tier,
      error: {
        type: 'LIMIT_EXCEEDED',
        message: `Assessment limit reached. ${getTierDisplayName(tier)} plan allows ${totalLimit} assessments per month.`,
        limitKey: 'assessments',
        current: currentCount,
        limit: totalLimit,
        upgradeRequired: true,
        recommendedUpgrade: recommendedUpgrade || undefined,
        upgradeUrl: recommendedUpgrade ? getUpgradeUrl(recommendedUpgrade) : undefined,
      },
    }
  }

  return {
    allowed: true,
    tier,
    current: currentCount,
    limit: totalLimit,
    remaining: totalLimit === -1 ? -1 : totalLimit - currentCount,
  }
}

/**
 * Check project creation limit
 */
export async function checkProjectLimit(userId: string): Promise<LimitCheckResult> {
  // Check if admin
  const isAdmin = await isUserAdmin(userId)
  if (isAdmin) {
    return { allowed: true, tier: 'enterprise', isAdmin: true }
  }

  // Get user's tier
  const tier = await getUserTier(userId)

  // Count projects
  const currentCount = await countUserProjects(userId)

  // Get project limit
  const limits = getTierLimits(tier)
  const projectLimit = limits.projects

  // Check if exceeded
  if (projectLimit !== -1 && currentCount >= projectLimit) {
    const recommendedUpgrade = getRecommendedUpgrade(tier)
    return {
      allowed: false,
      tier,
      error: {
        type: 'LIMIT_EXCEEDED',
        message: `Project limit reached. ${getTierDisplayName(tier)} plan allows ${projectLimit} projects.`,
        limitKey: 'projects',
        current: currentCount,
        limit: projectLimit,
        upgradeRequired: true,
        recommendedUpgrade: recommendedUpgrade || undefined,
        upgradeUrl: recommendedUpgrade ? getUpgradeUrl(recommendedUpgrade) : undefined,
      },
    }
  }

  return {
    allowed: true,
    tier,
    current: currentCount,
    limit: projectLimit,
    remaining: projectLimit === -1 ? -1 : projectLimit - currentCount,
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

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get usage summary for user
 */
export async function getUserUsageSummary(userId: string) {
  const tier = await getUserTier(userId)
  const limits = getTierLimits(tier)

  const assessmentsThisMonth = await countAssessmentsThisMonth(userId)
  const projectCount = await countUserProjects(userId)

  const totalAssessmentLimit = getTotalAssessmentLimit(tier)

  return {
    tier,
    limits,
    usage: {
      assessments: {
        current: assessmentsThisMonth,
        limit: totalAssessmentLimit,
        remaining: totalAssessmentLimit === -1 ? -1 : totalAssessmentLimit - assessmentsThisMonth,
        percentage:
          totalAssessmentLimit === -1 ? 0 : (assessmentsThisMonth / totalAssessmentLimit) * 100,
      },
      projects: {
        current: projectCount,
        limit: limits.projects,
        remaining: limits.projects === -1 ? -1 : limits.projects - projectCount,
        percentage: limits.projects === -1 ? 0 : (projectCount / limits.projects) * 100,
      },
    },
  }
}
