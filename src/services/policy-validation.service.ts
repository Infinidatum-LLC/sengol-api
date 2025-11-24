/**
 * Policy Validation Service
 * 
 * Validates AI policies using LLM to identify gaps, risks, and compliance issues.
 * Supports:
 * - Organization policy validation
 * - Third-party vendor policy validation
 * - Policy comparison (org vs vendor)
 * - Gap analysis with LLM
 * - Risk flagging
 */

import { callLLM } from '../lib/multi-llm-client'
import { query } from '../lib/db'
import { randomUUID } from 'crypto'

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PolicyDocument {
  id?: string
  name: string
  content: string // Full policy text/document
  type: 'organization' | 'vendor'
  metadata?: {
    version?: string
    effectiveDate?: string
    jurisdiction?: string[]
    industry?: string
    [key: string]: any
  }
}

export interface ValidationIssue {
  id: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  category: 'compliance' | 'security' | 'privacy' | 'operational' | 'legal' | 'technical'
  title: string
  description: string
  recommendation: string
  affectedSection?: string
  evidence?: string
  relatedRegulations?: string[]
  riskScore: number // 0-100
}

export interface GapAnalysis {
  missingAreas: Array<{
    area: string
    description: string
    importance: 'critical' | 'high' | 'medium' | 'low'
    recommendedContent: string
  }>
  weakAreas: Array<{
    area: string
    currentContent: string
    issues: string[]
    recommendedImprovements: string
  }>
  bestPractices: Array<{
    practice: string
    description: string
    implementationGuidance: string
  }>
}

export interface PolicyComparison {
  alignmentScore: number // 0-100
  alignedAreas: string[]
  misalignedAreas: Array<{
    area: string
    orgPolicy: string
    vendorPolicy: string
    gap: string
    risk: 'critical' | 'high' | 'medium' | 'low'
    recommendation: string
  }>
  missingInVendor: string[]
  missingInOrg: string[]
}

export interface ValidationResult {
  id: string
  policyId: string
  policyName: string
  validationType: 'single' | 'comparison'
  timestamp: Date
  overallScore: number // 0-100
  status: 'pass' | 'warning' | 'fail'
  issues: ValidationIssue[]
  gapAnalysis?: GapAnalysis
  comparison?: PolicyComparison
  summary: string
  recommendations: string[]
  metadata: {
    llmModel: string
    processingTimeMs: number
    policyLength: number
    [key: string]: any
  }
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate a single policy (organization or vendor)
 */
export async function validatePolicy(
  policy: PolicyDocument,
  options?: {
    includeGapAnalysis?: boolean
    focusAreas?: string[]
    industry?: string
    jurisdiction?: string[]
  }
): Promise<ValidationResult> {
  const startTime = Date.now()
  const validationId = randomUUID()

  console.log(`[PolicyValidation] Starting validation for policy: ${policy.name}`)

  try {
    // Build validation prompt
    const validationPrompt = buildValidationPrompt(policy, options)

    // Call LLM for validation
    const llmResponse = await callLLM({
      messages: [{ role: 'user', content: validationPrompt }],
      temperature: 0.3, // Lower temperature for more consistent analysis
      maxTokens: 4096,
      responseFormat: { type: 'json_object' },
    })

    const analysis = JSON.parse(llmResponse.content) as {
      issues: ValidationIssue[]
      gapAnalysis?: GapAnalysis
      summary: string
      recommendations: string[]
      overallScore: number
    }

    // Calculate overall score if not provided
    const overallScore = analysis.overallScore ?? calculateOverallScore(analysis.issues)

    // Determine status
    const status = determineStatus(overallScore, analysis.issues)

    // Perform gap analysis if requested
    let gapAnalysis: GapAnalysis | undefined
    if (options?.includeGapAnalysis) {
      gapAnalysis = await performGapAnalysis(policy, options)
    }

    const result: ValidationResult = {
      id: validationId,
      policyId: policy.id || 'unknown',
      policyName: policy.name,
      validationType: 'single',
      timestamp: new Date(),
      overallScore,
      status,
      issues: analysis.issues || [],
      gapAnalysis,
      summary: analysis.summary || 'Policy validation completed',
      recommendations: analysis.recommendations || [],
      metadata: {
        llmModel: 'gemini-pro',
        processingTimeMs: Date.now() - startTime,
        policyLength: policy.content.length,
        type: policy.type,
      },
    }

    // Save validation result to database
    await saveValidationResult(result)

    return result
  } catch (error) {
    console.error('[PolicyValidation] Error validating policy:', error)
    throw new Error(`Failed to validate policy: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

/**
 * Compare organization policy with vendor policy
 */
export async function comparePolicies(
  orgPolicy: PolicyDocument,
  vendorPolicy: PolicyDocument,
  options?: {
    focusAreas?: string[]
    industry?: string
  }
): Promise<ValidationResult> {
  const startTime = Date.now()
  const validationId = randomUUID()

  console.log(`[PolicyValidation] Comparing policies: ${orgPolicy.name} vs ${vendorPolicy.name}`)

  try {
    // Build comparison prompt
    const comparisonPrompt = buildComparisonPrompt(orgPolicy, vendorPolicy, options)

    // Call LLM for comparison
    const llmResponse = await callLLM({
      messages: [{ role: 'user', content: comparisonPrompt }],
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: { type: 'json_object' },
    })

    const analysis = JSON.parse(llmResponse.content) as {
      comparison: PolicyComparison
      issues: ValidationIssue[]
      summary: string
      recommendations: string[]
    }

    // Calculate overall score based on alignment
    const overallScore = analysis.comparison.alignmentScore

    // Determine status
    const status = determineStatus(overallScore, analysis.issues)

    const result: ValidationResult = {
      id: validationId,
      policyId: orgPolicy.id || 'unknown',
      policyName: `${orgPolicy.name} vs ${vendorPolicy.name}`,
      validationType: 'comparison',
      timestamp: new Date(),
      overallScore,
      status,
      issues: analysis.issues || [],
      comparison: analysis.comparison,
      summary: analysis.summary || 'Policy comparison completed',
      recommendations: analysis.recommendations || [],
      metadata: {
        llmModel: 'gemini-pro',
        processingTimeMs: Date.now() - startTime,
        policyLength: orgPolicy.content.length + vendorPolicy.content.length,
        orgPolicyType: orgPolicy.type,
        vendorPolicyType: vendorPolicy.type,
      },
    }

    // Save validation result
    await saveValidationResult(result)

    return result
  } catch (error) {
    console.error('[PolicyValidation] Error comparing policies:', error)
    throw new Error(`Failed to compare policies: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function buildValidationPrompt(
  policy: PolicyDocument,
  options?: {
    focusAreas?: string[]
    industry?: string
    jurisdiction?: string[]
  }
): string {
  const focusAreasText = options?.focusAreas
    ? `\n**FOCUS AREAS:** ${options.focusAreas.join(', ')}`
    : ''
  const industryText = options?.industry ? `\n**INDUSTRY:** ${options.industry}` : ''
  const jurisdictionText = options?.jurisdiction
    ? `\n**JURISDICTIONS:** ${options.jurisdiction.join(', ')}`
    : ''

  return `You are an expert AI policy analyst and compliance auditor. Analyze the following AI policy document and identify risks, gaps, and compliance issues.

**POLICY TYPE:** ${policy.type === 'organization' ? 'Organization Policy' : 'Vendor Policy'}
**POLICY NAME:** ${policy.name}${focusAreasText}${industryText}${jurisdictionText}

**POLICY CONTENT:**
${policy.content}

**TASK:**
Perform a comprehensive analysis and return a JSON object with:

1. **issues**: Array of validation issues, each with:
   - severity: "critical" | "high" | "medium" | "low" | "info"
   - category: "compliance" | "security" | "privacy" | "operational" | "legal" | "technical"
   - title: Brief issue title
   - description: Detailed description of the issue
   - recommendation: Specific recommendation to address the issue
   - affectedSection: Section of policy where issue was found (if applicable)
   - evidence: Quote or excerpt from policy that demonstrates the issue
   - relatedRegulations: Array of relevant regulations (e.g., ["GDPR", "CCPA", "EU AI Act"])
   - riskScore: Number 0-100 indicating risk level

2. **summary**: Overall assessment summary (2-3 paragraphs)

3. **recommendations**: Array of top 5-10 prioritized recommendations

4. **overallScore**: Number 0-100 representing overall policy quality and compliance

**ANALYSIS CRITERIA:**
- Compliance with relevant regulations (GDPR, CCPA, EU AI Act, etc.)
- Security best practices
- Privacy protections
- Operational clarity and enforceability
- Technical accuracy
- Risk management coverage
- Incident response procedures
- Vendor management (if applicable)
- Data governance
- Model governance
- Bias and fairness considerations
- Transparency requirements

**SEVERITY GUIDELINES:**
- **critical**: Legal violations, major security gaps, regulatory non-compliance
- **high**: Significant risks, important missing protections, unclear procedures
- **medium**: Moderate risks, areas for improvement, minor gaps
- **low**: Minor issues, suggestions for enhancement
- **info**: Best practice recommendations, optional improvements

Return ONLY valid JSON in this exact format:
{
  "issues": [...],
  "summary": "...",
  "recommendations": [...],
  "overallScore": 85
}`
}

function buildComparisonPrompt(
  orgPolicy: PolicyDocument,
  vendorPolicy: PolicyDocument,
  options?: {
    focusAreas?: string[]
    industry?: string
  }
): string {
  const focusAreasText = options?.focusAreas
    ? `\n**FOCUS AREAS:** ${options.focusAreas.join(', ')}`
    : ''
  const industryText = options?.industry ? `\n**INDUSTRY:** ${options.industry}` : ''

  return `You are an expert AI policy analyst. Compare the organization's AI policy with a third-party vendor's AI policy to identify alignment, gaps, and risks.

${focusAreasText}${industryText}

**ORGANIZATION POLICY:**
Name: ${orgPolicy.name}
Content:
${orgPolicy.content}

**VENDOR POLICY:**
Name: ${vendorPolicy.name}
Content:
${vendorPolicy.content}

**TASK:**
Compare these policies and return a JSON object with:

1. **comparison**: Object containing:
   - alignmentScore: Number 0-100 (how well policies align)
   - alignedAreas: Array of areas where policies are well-aligned
   - misalignedAreas: Array of objects with:
     - area: Policy area name
     - orgPolicy: Relevant section from org policy
     - vendorPolicy: Relevant section from vendor policy
     - gap: Description of the gap
     - risk: "critical" | "high" | "medium" | "low"
     - recommendation: How to address the gap
   - missingInVendor: Array of areas covered in org policy but missing in vendor policy
   - missingInOrg: Array of areas covered in vendor policy but missing in org policy

2. **issues**: Array of validation issues found in the comparison (same format as validation)

3. **summary**: Comparison summary (2-3 paragraphs)

4. **recommendations**: Array of top 5-10 prioritized recommendations for alignment

**COMPARISON CRITERIA:**
- Policy alignment and consistency
- Security standards compatibility
- Privacy protection alignment
- Compliance requirements matching
- Risk management approach compatibility
- Data handling procedures alignment
- Incident response coordination
- Vendor accountability and transparency

Return ONLY valid JSON in this exact format:
{
  "comparison": {...},
  "issues": [...],
  "summary": "...",
  "recommendations": [...]
}`
}

// ============================================================================
// GAP ANALYSIS
// ============================================================================

async function performGapAnalysis(
  policy: PolicyDocument,
  options?: {
    industry?: string
    jurisdiction?: string[]
  }
): Promise<GapAnalysis> {
  const prompt = `You are an expert AI policy consultant. Analyze the following policy and identify gaps compared to industry best practices and regulatory requirements.

**POLICY:**
${policy.content}

**TASK:**
Return a JSON object with:

1. **missingAreas**: Array of critical areas not covered in the policy, each with:
   - area: Area name (e.g., "Data Retention", "Model Monitoring")
   - description: Why this area is important
   - importance: "critical" | "high" | "medium" | "low"
   - recommendedContent: Suggested policy text for this area

2. **weakAreas**: Array of areas that are covered but need strengthening, each with:
   - area: Area name
   - currentContent: What's currently in the policy
   - issues: Array of specific issues with current content
   - recommendedImprovements: Suggested improvements

3. **bestPractices**: Array of best practices that could enhance the policy, each with:
   - practice: Practice name
   - description: What this practice entails
   - implementationGuidance: How to implement it

Return ONLY valid JSON.`

  try {
    const response = await callLLM({
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      maxTokens: 4096,
      responseFormat: { type: 'json_object' },
    })

    return JSON.parse(response.content) as GapAnalysis
  } catch (error) {
    console.error('[PolicyValidation] Error in gap analysis:', error)
    // Return empty gap analysis on error
    return {
      missingAreas: [],
      weakAreas: [],
      bestPractices: [],
    }
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function calculateOverallScore(issues: ValidationIssue[]): number {
  if (issues.length === 0) return 100

  // Weight issues by severity
  const weights = {
    critical: 20,
    high: 10,
    medium: 5,
    low: 2,
    info: 0.5,
  }

  let totalDeduction = 0
  for (const issue of issues) {
    totalDeduction += weights[issue.severity] || 0
  }

  // Cap deduction at 100
  const score = Math.max(0, 100 - totalDeduction)
  return Math.round(score)
}

function determineStatus(score: number, issues: ValidationIssue[]): 'pass' | 'warning' | 'fail' {
  const hasCritical = issues.some(i => i.severity === 'critical')
  const hasHigh = issues.some(i => i.severity === 'high')

  if (hasCritical || score < 50) return 'fail'
  if (hasHigh || score < 70) return 'warning'
  return 'pass'
}

async function saveValidationResult(result: ValidationResult): Promise<void> {
  try {
    await query(
      `INSERT INTO "PolicyValidation" (
        "id", "policyId", "policyName", "validationType", "timestamp",
        "overallScore", "status", "issues", "gapAnalysis", "comparison",
        "summary", "recommendations", "metadata"
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      ON CONFLICT ("id") DO UPDATE SET
        "overallScore" = EXCLUDED."overallScore",
        "status" = EXCLUDED."status",
        "issues" = EXCLUDED."issues",
        "gapAnalysis" = EXCLUDED."gapAnalysis",
        "comparison" = EXCLUDED."comparison",
        "summary" = EXCLUDED."summary",
        "recommendations" = EXCLUDED."recommendations",
        "metadata" = EXCLUDED."metadata",
        "updatedAt" = NOW()`,
      [
        result.id,
        result.policyId,
        result.policyName,
        result.validationType,
        result.timestamp.toISOString(),
        result.overallScore,
        result.status,
        JSON.stringify(result.issues),
        result.gapAnalysis ? JSON.stringify(result.gapAnalysis) : null,
        result.comparison ? JSON.stringify(result.comparison) : null,
        result.summary,
        JSON.stringify(result.recommendations),
        JSON.stringify(result.metadata),
      ]
    )
  } catch (error) {
    // If table doesn't exist, log but don't fail
    console.warn('[PolicyValidation] Could not save to database:', error)
  }
}

