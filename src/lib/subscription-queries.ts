/**
 * Subscription & Trial Queries
 *
 * Database queries for managing user subscriptions and trial status.
 * Uses shared Neon PostgreSQL connection to Sengol database.
 */

import { prisma } from '../services/database'
import { PricingTier, PRICING_TIER_LIMITS, FeatureType, TRIAL_DURATION_DAYS } from '../config/trial'
import {
  TrialLimitError,
  SubscriptionError,
  TrialExpiredError,
  InvalidTierError,
  DatabaseError,
} from './errors'

/**
 * Get user's subscription tier
 * Determines which feature limits apply to the user
 *
 * Tier hierarchy (in order of precedence):
 * 1. Active paid subscription (ToolSubscription)
 * 2. Active trial
 * 3. Free/Community tier (default)
 */
export async function getUserSubscription(userId: string): Promise<{ tier: PricingTier; status: string }> {
  try {
    // Check for active paid subscription
    const toolSub = await prisma.toolSubscription.findFirst({
      where: { userId, status: 'active' },
      orderBy: { createdAt: 'desc' },
      select: { planId: true, status: true },
    })

    if (toolSub) {
      const tier = (toolSub.planId.toLowerCase() as PricingTier) || 'free'
      return { tier, status: toolSub.status }
    }

    // Check for active trial
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { trialStatus: true, trialEndsAt: true },
    })

    if (user?.trialStatus === 'active' && user.trialEndsAt && new Date() < user.trialEndsAt) {
      return { tier: 'trial', status: 'active' }
    }

    // Default to free tier
    return { tier: 'free', status: 'active' }
  } catch (error) {
    throw new DatabaseError('getUserSubscription', error as Error)
  }
}

/**
 * Get detailed trial status for a user
 */
export async function getTrialStatus(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        trialStartedAt: true,
        trialEndsAt: true,
        trialStatus: true,
      },
    })

    if (!user) {
      return null
    }

    const now = new Date()
    const isExpired = user.trialStatus === 'expired' || (user.trialEndsAt !== null && now >= user.trialEndsAt)
    const daysRemaining = isExpired
      ? 0
      : user.trialEndsAt
        ? Math.ceil((user.trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : 0

    return {
      isActive: user.trialStatus === 'active' && !isExpired,
      isExpired: isExpired === true,
      startedAt: user.trialStartedAt,
      endsAt: user.trialEndsAt,
      daysRemaining,
    }
  } catch (error) {
    throw new DatabaseError('getTrialStatus', error as Error)
  }
}

/**
 * Check if user has reached trial limit for a feature
 */
export async function hasReachedTrialLimit(userId: string, feature: FeatureType): Promise<boolean> {
  try {
    // First check if user is in trial
    const trialStatus = await getTrialStatus(userId)
    if (!trialStatus?.isActive) {
      return false // Not in active trial, no limit applies
    }

    // Get trial usage
    const trialUsage = await prisma.trialUsage.findUnique({
      where: { userId },
    })

    if (!trialUsage) {
      return false // No usage record yet
    }

    // Map feature to usage field
    const usageField = getUsageField(feature)
    const currentCount = (trialUsage[usageField as keyof typeof trialUsage] as number) || 0

    // Get limit for this feature
    const limit = PRICING_TIER_LIMITS.trial[feature]

    // If limit is -1 (unlimited), return false
    if (limit === -1) {
      return false
    }

    // If limit is 0 (disabled), return true
    if (limit === 0) {
      return true
    }

    return currentCount >= limit
  } catch (error) {
    throw new DatabaseError('hasReachedTrialLimit', error as Error)
  }
}

/**
 * Get feature limit for a user's tier
 */
export async function getFeatureLimit(userId: string, feature: FeatureType): Promise<number> {
  try {
    const { tier } = await getUserSubscription(userId)
    const tierLimits = PRICING_TIER_LIMITS[tier]
    return tierLimits[feature]
  } catch (error) {
    throw new DatabaseError('getFeatureLimit', error as Error)
  }
}

/**
 * Increment feature usage for trial user
 */
export async function incrementFeatureUsage(userId: string, feature: FeatureType): Promise<boolean> {
  try {
    // Check if at limit
    const atLimit = await hasReachedTrialLimit(userId, feature)
    if (atLimit) {
      const limit = PRICING_TIER_LIMITS.trial[feature]
      throw new TrialLimitError(feature, 0, limit, 'trial')
    }

    // Increment usage
    const usageField = getUsageField(feature)
    await prisma.trialUsage.update({
      where: { userId },
      data: {
        [usageField]: {
          increment: 1,
        },
      },
    })

    return true
  } catch (error) {
    if (error instanceof TrialLimitError) {
      throw error
    }
    throw new DatabaseError('incrementFeatureUsage', error as Error)
  }
}

/**
 * Get user's current feature usage
 */
export async function getFeatureUsage(userId: string, feature: FeatureType): Promise<{ used: number; limit: number }> {
  try {
    const trialUsage = await prisma.trialUsage.findUnique({
      where: { userId },
    })

    const usageField = getUsageField(feature)
    const used = (trialUsage?.[usageField as keyof typeof trialUsage] as number) || 0

    const limit = PRICING_TIER_LIMITS.trial[feature]

    return { used, limit }
  } catch (error) {
    throw new DatabaseError('getFeatureUsage', error as Error)
  }
}

/**
 * Helper: Map feature to Prisma TrialUsage field name
 */
function getUsageField(feature: FeatureType): string {
  const fieldMap: Record<FeatureType, string> = {
    incidentSearch: 'incidentSearchCount',
    riskAssessment: 'riskAssessmentCount',
    complianceCheck: 'complianceCheckCount',
    reportGeneration: 'reportGenerationCount',
    batchOperations: 'batchOperationsCount',
  }
  return fieldMap[feature] || `${feature}Count`
}

/**
 * Start a trial for a user
 */
export async function startTrial(userId: string) {
  try {
    const now = new Date()
    const endsAt = new Date(now.getTime() + TRIAL_DURATION_DAYS * 24 * 60 * 60 * 1000)

    await prisma.user.update({
      where: { id: userId },
      data: {
        trialStartedAt: now,
        trialEndsAt: endsAt,
        trialStatus: 'active',
      },
    })

    // Create trial usage record
    await prisma.trialUsage.upsert({
      where: { userId },
      create: { userId },
      update: {},
    })

    return { userId, trialStartedAt: now, trialEndsAt: endsAt }
  } catch (error) {
    throw new DatabaseError('startTrial', error as Error)
  }
}

/**
 * Expire a trial for a user
 */
export async function expireTrial(userId: string) {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { trialStatus: 'expired' },
    })
    return { userId, status: 'expired' }
  } catch (error) {
    throw new DatabaseError('expireTrial', error as Error)
  }
}
