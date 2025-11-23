/**
 * Pricing and Tier Configuration
 *
 * Defines all pricing tiers, limits, and feature gates for the Sengol platform
 * Based on: docs/PRICING_AND_GATING_SPECIFICATION.md
 */

export type PricingTier = 'free' | 'consultant' | 'professional' | 'enterprise' | 'premium'

export type FeatureGateKey =
  | 'pdfExports'
  | 'excelExports'
  | 'apiAccess'
  | 'competitorTracking'
  | 'sso'
  | 'whiteLabel'
  | 'advancedReports'
  | 'graphs'
  | 'roiCalculator'
  | 'buildVsBuy'

export type LimitKey =
  | 'users'
  | 'riskAssessmentsPerMonth'
  | 'complianceAssessmentsPerMonth'
  | 'projects'
  | 'topRisksVisible'
  | 'apiRateLimit'

export interface TierLimits {
  // User limits
  users: number // -1 = unlimited

  // Assessment limits (monthly)
  riskAssessmentsPerMonth: number // -1 = unlimited
  complianceAssessmentsPerMonth: number // -1 = unlimited

  // Project limits
  projects: number // -1 = unlimited

  // Visibility limits
  topRisksVisible: number // -1 = all visible

  // API limits
  apiRateLimit: number // requests per hour, 0 = no access

  // Feature gates
  pdfExports: boolean
  excelExports: boolean
  apiAccess: boolean
  competitorTracking: boolean
  sso: boolean
  whiteLabel: boolean
  advancedReports: boolean
  graphs: boolean
  roiCalculator: boolean
  buildVsBuy: boolean
}

export interface PricingPlan {
  id: PricingTier
  name: string
  priceMonthly: number
  features: string[]
  limits: TierLimits
  support: string
  target: string
  recommended: boolean
}

/**
 * Complete pricing plan configuration
 */
export const PRICING_PLANS: Record<PricingTier, PricingPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    priceMonthly: 0,
    features: [
      'Basic risk scores',
      '2 projects',
      'Community support',
      'View top 3 risks',
    ],
    limits: {
      users: 1,
      riskAssessmentsPerMonth: 1,
      complianceAssessmentsPerMonth: 1,
      projects: 2,
      topRisksVisible: 3,
      apiRateLimit: 0,
      pdfExports: false,
      excelExports: false,
      apiAccess: false,
      competitorTracking: false,
      sso: false,
      whiteLabel: false,
      advancedReports: false,
      graphs: false,
      roiCalculator: false,
      buildVsBuy: false,
    },
    support: 'Community (email)',
    target: 'Individual users trying out the platform',
    recommended: false,
  },

  consultant: {
    id: 'consultant',
    name: 'Consultant',
    priceMonthly: 59,
    features: [
      'PDF & Excel exports',
      'Interactive graphs & charts',
      'Advanced reports',
      'ROI Calculator',
      'Build vs Buy Framework',
      '10 projects',
      'Priority email support',
      'View all risks',
    ],
    limits: {
      users: 1,
      riskAssessmentsPerMonth: 5,
      complianceAssessmentsPerMonth: 5,
      projects: 10,
      topRisksVisible: -1, // All risks visible
      apiRateLimit: 0,
      pdfExports: true,
      excelExports: true,
      apiAccess: false,
      competitorTracking: false,
      sso: false,
      whiteLabel: false,
      advancedReports: true,
      graphs: true,
      roiCalculator: true,
      buildVsBuy: true,
    },
    support: 'Priority Email (~12-hour TAT)',
    target: 'Independent consultants',
    recommended: true,
  },

  professional: {
    id: 'professional',
    name: 'Professional',
    priceMonthly: 99,
    features: [
      'Everything in Consultant',
      'Team features (up to 5 users)',
      'Unlimited projects',
      '20 assessments/month',
      'Priority support',
    ],
    limits: {
      users: 5,
      riskAssessmentsPerMonth: 20,
      complianceAssessmentsPerMonth: 20,
      projects: 100, // Effectively unlimited for most users
      topRisksVisible: -1,
      apiRateLimit: 0,
      pdfExports: true,
      excelExports: true,
      apiAccess: false,
      competitorTracking: false,
      sso: false,
      whiteLabel: false,
      advancedReports: true,
      graphs: true,
      roiCalculator: true,
      buildVsBuy: true,
    },
    support: 'Priority Email (~12-hour TAT)',
    target: 'Small teams and growing businesses',
    recommended: false,
  },

  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    priceMonthly: 999,
    features: [
      'Everything in Professional',
      'Unlimited users',
      'Unlimited assessments',
      'API Access (2,000 req/hour)',
      'SSO/SAML Integration',
      'White-label options',
      'Custom integrations',
      'Dedicated Customer Success Manager',
      '24/7 priority support',
    ],
    limits: {
      users: -1, // Unlimited
      riskAssessmentsPerMonth: -1, // Unlimited
      complianceAssessmentsPerMonth: -1, // Unlimited
      projects: -1, // Unlimited
      topRisksVisible: -1,
      apiRateLimit: 2000, // 2000 requests per hour
      pdfExports: true,
      excelExports: true,
      apiAccess: true,
      competitorTracking: true,
      sso: true,
      whiteLabel: true,
      advancedReports: true,
      graphs: true,
      roiCalculator: true,
      buildVsBuy: true,
    },
    support: 'Dedicated CSM, 24/7 priority support',
    target: 'Large organizations',
    recommended: false,
  },

  premium: {
    id: 'premium',
    name: 'Premium',
    priceMonthly: 0, // Free for existing users
    features: [
      'Everything in Professional',
      'Unlimited users',
      'Unlimited assessments',
      'Unlimited projects',
      'PDF & Excel exports',
      'Advanced reports',
      'ROI Calculator',
      'Build vs Buy Framework',
      'Priority support',
    ],
    limits: {
      users: -1, // Unlimited
      riskAssessmentsPerMonth: -1, // Unlimited
      complianceAssessmentsPerMonth: -1, // Unlimited
      projects: -1, // Unlimited
      topRisksVisible: -1,
      apiRateLimit: 0, // No API access
      pdfExports: true,
      excelExports: true,
      apiAccess: false,
      competitorTracking: false,
      sso: false,
      whiteLabel: false,
      advancedReports: true,
      graphs: true,
      roiCalculator: true,
      buildVsBuy: true,
    },
    support: 'Priority Email (~12-hour TAT)',
    target: 'Existing users with premium access',
    recommended: false,
  },
}

/**
 * Get recommended upgrade tier for a given tier
 */
export function getRecommendedUpgrade(currentTier: PricingTier): PricingTier | null {
  const upgradeMap: Record<PricingTier, PricingTier | null> = {
    free: 'consultant',
    consultant: 'professional',
    professional: 'enterprise',
    enterprise: null, // No upgrade available
    premium: 'enterprise', // Premium users can upgrade to enterprise
  }
  return upgradeMap[currentTier]
}

/**
 * Get upgrade URL for a tier
 */
export function getUpgradeUrl(tier: PricingTier): string {
  return `/pricing?plan=${tier}`
}

/**
 * Get tier display name
 */
export function getTierDisplayName(tier: PricingTier): string {
  return PRICING_PLANS[tier].name
}

/**
 * Get tier limits
 */
export function getTierLimits(tier: PricingTier): TierLimits {
  return PRICING_PLANS[tier].limits
}

/**
 * Check if tier has a specific feature
 */
export function hasFeature(tier: PricingTier, feature: FeatureGateKey): boolean {
  return PRICING_PLANS[tier].limits[feature] === true
}

/**
 * Get all available tiers
 */
export function getAllTiers(): PricingPlan[] {
  return Object.values(PRICING_PLANS)
}

/**
 * Get tier by ID
 */
export function getTierById(tierId: string): PricingPlan | null {
  const tier = PRICING_PLANS[tierId as PricingTier]
  return tier || null
}

/**
 * Check if limit is exceeded
 */
export function isLimitExceeded(
  tier: PricingTier,
  limitKey: LimitKey,
  currentUsage: number
): boolean {
  const limit = PRICING_PLANS[tier].limits[limitKey]

  // -1 means unlimited
  if (limit === -1) return false

  return currentUsage >= limit
}

/**
 * Calculate total assessment limit (risk + compliance)
 */
export function getTotalAssessmentLimit(tier: PricingTier): number {
  const limits = PRICING_PLANS[tier].limits
  const riskLimit = limits.riskAssessmentsPerMonth
  const complianceLimit = limits.complianceAssessmentsPerMonth

  // If either is unlimited, total is unlimited
  if (riskLimit === -1 || complianceLimit === -1) return -1

  return riskLimit + complianceLimit
}
