/**
 * Dynamic Question Generation Engine
 *
 * Generates context-aware risk and compliance questions based on:
 * 1. System description analysis via LLM
 * 2. Similar historical incidents from d-vecDB (78,767+ incidents)
 * 3. Industry-specific patterns and regulatory requirements
 *
 * This replaces static questionnaires with intelligent, evidence-based assessments
 * that provide real differentiation value to clients.
 */

import OpenAI from 'openai'
import { findSimilarIncidents, calculateIncidentStatistics, type IncidentMatch } from './incident-search'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface IncidentEvidence {
  incidentCount: number
  avgSeverity: number
  relevanceScore: number
  recentExamples: Array<{
    id: string
    title: string
    organization: string
    date: string
    severity: number
    incidentType: string
    category: string
    description: string
    estimatedCost: number
    cost: number
    similarity: number
    relevanceScore: number
  }>
  statistics?: {
    totalCost: number
    avgCost: number
    affectedSystems: number
  }
}

export interface DynamicQuestion {
  id: string
  label: string
  text?: string // Alias for label
  question?: string // Alias for label
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'

  // Evidence-based context
  importance: string
  examples: string[] // Real incidents from d-vecDB
  mitigations: string[]
  regulations: string[]

  // ✅ CRITICAL: Evidence object with incident metadata
  evidence: IncidentEvidence

  // Weightage and scoring
  baseWeight: number // 0-1 (LLM-determined importance)
  evidenceWeight: number // 0-1 (based on incident frequency/severity)
  industryWeight: number // 0-1 (industry-specific relevance)
  finalWeight: number // Calculated composite weight
  weight?: number // Alias for finalWeight (0-10 scale)

  // Explainability
  weightageExplanation: string // Why this weight?
  reasoning?: string // Alias for importance
  evidenceQuery: string
  relatedIncidents: IncidentMatch[]
  similarIncidents?: IncidentMatch[] // Alias for relatedIncidents

  // Metadata
  category: 'ai' | 'cyber' | 'cloud' | 'compliance'
  domain?: 'ai' | 'cyber' | 'cloud' | 'compliance' // For frontend filtering
  generatedFrom: 'llm' | 'evidence' | 'hybrid'
  confidence: number | string // 0-1 (how confident we are in this question) or 'high'/'medium'/'low'
  aiGenerated?: boolean
  relatedIncidentCount?: number
}

export interface QuestionGenerationRequest {
  systemDescription: string
  selectedDomains?: string[] // ['ai', 'cyber', 'cloud']
  jurisdictions?: string[] // ['US', 'EU']
  industry?: string
  companySize?: string
  budgetRange?: string
  existingControls?: string[]
  techStack?: string[] // Technologies used (GPT-4, PostgreSQL, AWS, etc.)
  dataTypes?: string[] // Data types processed (PII, Financial, etc.)
  systemCriticality?: string // High, Medium, Low

  // Question generation controls
  maxQuestions?: number // Total questions (default: 75)
  questionsPerDomain?: number // Questions per domain (default: 25)
  minWeight?: number // Minimum weight threshold (0-1 scale, default: 0.7 for 70%+)
  minRiskPotential?: number // Alias for minWeight
}

export interface QuestionGenerationResult {
  riskQuestions: DynamicQuestion[]
  complianceQuestions: DynamicQuestion[]

  // Scoring formula explanation
  scoringFormula: ScoringFormula

  // Evidence summary
  incidentSummary: {
    totalIncidentsAnalyzed: number
    relevantIncidents: number
    avgIncidentCost: number
    topRisks: string[]
    industryBenchmark: string
  }

  // Explainability
  generationMetadata: {
    timestamp: Date
    llmModel: string
    incidentSearchCount: number
    avgSimilarityScore: number
    generationTimeMs: number
    // Per-domain question counts
    totalRiskQuestions: number
    totalComplianceQuestions: number
    aiQuestions?: number
    cyberQuestions?: number
    cloudQuestions?: number
    avgRiskWeight: number
    avgComplianceWeight: number
  }
}

export interface ScoringFormula {
  name: string
  description: string
  components: ScoringComponent[]
  formula: string // Mathematical formula as string
  exampleCalculation: string
  visualization: string // ASCII art or simple diagram
}

export interface ScoringComponent {
  name: string
  weight: number
  description: string
  formula: string
  justification: string
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Remove duplicate questions based on ID and label similarity
 * Filters out questions with >90% text similarity
 */
function deduplicateQuestions(questions: DynamicQuestion[]): DynamicQuestion[] {
  const seenIds = new Set<string>()
  const seenLabels = new Set<string>()
  const deduplicated: DynamicQuestion[] = []

  for (const question of questions) {
    const id = question.id
    const label = (question.label || question.text || question.question || '').toLowerCase().trim()

    // Skip if ID already seen
    if (seenIds.has(id)) {
      console.log(`[DEDUPE] Skipping duplicate ID: ${id}`)
      continue
    }

    // Skip if label already seen
    if (seenLabels.has(label)) {
      console.log(`[DEDUPE] Skipping duplicate label: ${label}`)
      continue
    }

    // Check for high similarity with existing labels (>90%)
    let isDuplicate = false
    for (const existingLabel of seenLabels) {
      const similarity = calculateStringSimilarity(label, existingLabel)
      if (similarity > 0.9) {
        console.log(`[DEDUPE] Skipping similar label (${(similarity * 100).toFixed(0)}% match): ${label}`)
        isDuplicate = true
        break
      }
    }

    if (!isDuplicate) {
      seenIds.add(id)
      seenLabels.add(label)
      deduplicated.push(question)
    }
  }

  const removed = questions.length - deduplicated.length
  if (removed > 0) {
    console.log(`[DEDUPE] Removed ${removed} duplicate questions (${questions.length} → ${deduplicated.length})`)
  }

  return deduplicated
}

/**
 * Calculate similarity between two strings (Jaccard similarity)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const words1 = new Set(str1.split(/\s+/))
  const words2 = new Set(str2.split(/\s+/))

  const intersection = new Set([...words1].filter(x => words2.has(x)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export async function generateDynamicQuestions(
  request: QuestionGenerationRequest
): Promise<QuestionGenerationResult> {
  const startTime = Date.now()

  console.log('\n🎯 Starting Dynamic Question Generation...')
  console.log('System: "' + request.systemDescription.substring(0, 100) + '..."')
  console.log('Domains:', request.selectedDomains || 'Not specified')
  console.log('Industry:', request.industry || 'Not specified')

  // Step 1: Find similar incidents from d-vecDB (increased from 50 to 100 for better coverage)
  console.log('\n📊 Step 1: Finding similar historical incidents from d-vecDB...')
  const similarIncidents = await findSimilarIncidents(
    request.systemDescription,
    {
      limit: 100, // ✅ Increased from 50 to support more questions
      minSimilarity: 0.6,
      industry: request.industry,
      severity: ['medium', 'high', 'critical'],
    }
  )

  const incidentStats = calculateIncidentStatistics(similarIncidents)

  console.log(`Found ${similarIncidents.length} similar incidents`)
  console.log(`Average cost: $${incidentStats.avgCost.toLocaleString()}`)
  console.log(`Top incident types: ${Array.from(new Set(similarIncidents.slice(0, 5).map(i => i.incidentType))).join(', ')}`)

  // Step 2: Analyze system description with LLM
  console.log('\n🤖 Step 2: Analyzing system description with LLM...')
  const llmAnalysis = await analyzeSystemWithLLM(request, similarIncidents)

  // Step 3: Generate risk questions (hybrid: LLM + evidence)
  console.log('\n⚠️  Step 3: Generating risk questions...')
  const riskQuestions = await generateRiskQuestions(request, similarIncidents, llmAnalysis)

  // Step 4: Generate compliance questions
  console.log('\n📋 Step 4: Generating compliance questions...')
  const complianceQuestions = await generateComplianceQuestions(request, similarIncidents, llmAnalysis)

  // Step 4.5: Deduplicate questions
  console.log('\n🔍 Step 4.5: Removing duplicate questions...')
  const deduplicatedRiskQuestions = deduplicateQuestions(riskQuestions)
  const deduplicatedComplianceQuestions = deduplicateQuestions(complianceQuestions)

  // Step 5: Create scoring formula
  console.log('\n🧮 Step 5: Creating explainable scoring formula...')
  const scoringFormula = createScoringFormula(deduplicatedRiskQuestions, deduplicatedComplianceQuestions, incidentStats)

  const endTime = Date.now()
  const generationTimeMs = endTime - startTime

  console.log(`\n✅ Generation complete in ${generationTimeMs}ms`)
  console.log(`Generated ${deduplicatedRiskQuestions.length} risk questions + ${deduplicatedComplianceQuestions.length} compliance questions`)

  // ✅ Calculate per-domain question counts
  const selectedDomains = request.selectedDomains || ['ai', 'cyber', 'cloud']
  const domainCounts = selectedDomains.reduce((acc, domain) => {
    acc[`${domain}Questions`] = deduplicatedRiskQuestions.filter(q => q.domain === domain).length
    return acc
  }, {} as Record<string, number>)

  return {
    riskQuestions: deduplicatedRiskQuestions,
    complianceQuestions: deduplicatedComplianceQuestions,
    scoringFormula,
    incidentSummary: {
      totalIncidentsAnalyzed: similarIncidents.length,
      relevantIncidents: similarIncidents.filter(i => i.similarity > 0.75).length,
      avgIncidentCost: incidentStats.avgCost,
      topRisks: Array.from(new Set(similarIncidents.slice(0, 10).map(i => i.incidentType))),
      industryBenchmark: generateIndustryBenchmark(incidentStats, request.industry),
    },
    generationMetadata: {
      timestamp: new Date(),
      llmModel: 'gpt-4o',
      incidentSearchCount: similarIncidents.length,
      avgSimilarityScore: similarIncidents.length > 0
        ? similarIncidents.reduce((sum, i) => sum + i.similarity, 0) / similarIncidents.length
        : 0,
      generationTimeMs,
      // ✅ Add metadata fields for frontend
      totalRiskQuestions: deduplicatedRiskQuestions.length,
      totalComplianceQuestions: deduplicatedComplianceQuestions.length,
      ...domainCounts, // aiQuestions, cyberQuestions, cloudQuestions
      avgRiskWeight: deduplicatedRiskQuestions.length > 0
        ? deduplicatedRiskQuestions.reduce((sum, q) => sum + q.finalWeight, 0) / deduplicatedRiskQuestions.length
        : 0,
      avgComplianceWeight: deduplicatedComplianceQuestions.length > 0
        ? deduplicatedComplianceQuestions.reduce((sum, q) => sum + q.finalWeight, 0) / deduplicatedComplianceQuestions.length
        : 0,
    },
  }
}

// ============================================================================
// LLM ANALYSIS
// ============================================================================

interface LLMAnalysis {
  primaryRisks: string[]
  complianceRequirements: string[]
  industryContext: string
  criticalControlGaps: string[]
  recommendedPriorities: { area: string; priority: number; reasoning: string }[]
}

async function analyzeSystemWithLLM(
  request: QuestionGenerationRequest,
  incidents: IncidentMatch[]
): Promise<LLMAnalysis> {
  const incidentSummary = incidents.slice(0, 10).map(i => ({
    type: i.incidentType,
    cost: i.estimatedCost ? `$${Number(i.estimatedCost).toLocaleString()}` : 'Unknown',
    similarity: (i.similarity * 100).toFixed(0) + '%',
  }))

  const prompt = `You are an expert cybersecurity and compliance risk assessor. Analyze this system description and historical incident data to identify critical risks.

**SYSTEM DESCRIPTION:**
${request.systemDescription}

**CONTEXT:**
- Industry: ${request.industry || 'Not specified'}
- Company Size: ${request.companySize || 'Not specified'}
- Budget: ${request.budgetRange || 'Not specified'}
- Selected Domains: ${request.selectedDomains?.join(', ') || 'Not specified'}
- Jurisdictions: ${request.jurisdictions?.join(', ') || 'Not specified'}

**SIMILAR HISTORICAL INCIDENTS (Top 10 most similar):**
${JSON.stringify(incidentSummary, null, 2)}

**TASK:**
Based on the system description and these real historical incidents, identify:

1. **Primary Risks** (top 5 risk areas specific to this system)
2. **Compliance Requirements** (regulations that likely apply)
3. **Industry Context** (industry-specific risk patterns)
4. **Critical Control Gaps** (missing security controls based on incidents)
5. **Recommended Priorities** (which areas need highest attention with reasoning)

Return JSON:
{
  "primaryRisks": ["risk1", "risk2", ...],
  "complianceRequirements": ["GDPR", "SOC 2", ...],
  "industryContext": "brief industry analysis",
  "criticalControlGaps": ["gap1", "gap2", ...],
  "recommendedPriorities": [
    { "area": "Access Control", "priority": 95, "reasoning": "..." },
    ...
  ]
}`

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
      temperature: 0.3,
    })

    const analysis = JSON.parse(response.choices[0].message.content || '{}')
    return analysis as LLMAnalysis
  } catch (error) {
    console.error('LLM analysis failed:', error)
    // Return fallback analysis
    return {
      primaryRisks: ['Access Control', 'Data Protection', 'Monitoring'],
      complianceRequirements: request.jurisdictions?.includes('EU') ? ['GDPR'] : ['SOC 2'],
      industryContext: `${request.industry || 'General'} industry standard risks`,
      criticalControlGaps: ['MFA', 'Encryption', 'Logging'],
      recommendedPriorities: [
        { area: 'Access Control', priority: 90, reasoning: 'High-frequency risk area' },
      ],
    }
  }
}

// ============================================================================
// RISK QUESTION GENERATION
// ============================================================================

async function generateRiskQuestions(
  request: QuestionGenerationRequest,
  incidents: IncidentMatch[],
  llmAnalysis: LLMAnalysis
): Promise<DynamicQuestion[]> {
  const questions: DynamicQuestion[] = []
  const selectedDomains = request.selectedDomains || ['ai', 'cyber', 'cloud']
  const questionsPerDomain = request.questionsPerDomain || 25 // ✅ Default 25 per domain
  const minWeight = request.minRiskPotential || request.minWeight || 0.7 // ✅ Default 70% risk threshold

  console.log(`Generating ${questionsPerDomain} questions per domain for: ${selectedDomains.join(', ')}`)
  console.log(`Minimum risk threshold: ${(minWeight * 100).toFixed(0)}%`)

  // ✅ Generate questions for each selected domain
  for (const domain of selectedDomains) {
    console.log(`\n🔍 Generating questions for ${domain.toUpperCase()} domain...`)

    // Get domain-specific risk areas based on LLM analysis and domain
    const domainRiskAreas = getDomainSpecificRiskAreas(domain, llmAnalysis)

    // Generate questions for this domain
    for (let i = 0; i < Math.min(questionsPerDomain, domainRiskAreas.length); i++) {
      const riskArea = domainRiskAreas[i]
      const relatedIncidents = findRelatedIncidents(riskArea.area, incidents)

      // ✅ Only generate if we have evidence
      if (relatedIncidents.length > 0) {
        const question = await generateSingleRiskQuestion(
          riskArea,
          relatedIncidents,
          request,
          llmAnalysis,
          domain as 'ai' | 'cyber' | 'cloud'
        )

        // ✅ Filter by risk threshold (70%+ by default)
        if (question.finalWeight >= minWeight) {
          questions.push(question)
        }
      }
    }

    console.log(`Generated ${questions.filter(q => q.domain === domain).length} ${domain} questions`)
  }

  console.log(`\nTotal risk questions generated: ${questions.length}`)
  console.log(`Distribution: ${selectedDomains.map(d => `${d}=${questions.filter(q => q.domain === d).length}`).join(', ')}`)

  return questions
}

// ✅ NEW: Get domain-specific risk areas
function getDomainSpecificRiskAreas(
  domain: string,
  llmAnalysis: LLMAnalysis
): Array<{ area: string; priority: number; reasoning: string }> {
  const domainRiskMap: Record<string, string[]> = {
    ai: [
      'AI Model Security', 'Prompt Injection', 'Data Poisoning', 'Model Bias',
      'AI Output Validation', 'Training Data Security', 'Model Inference Security',
      'AI Explainability', 'AI Fairness', 'Model Drift Detection',
      'AI Supply Chain', 'Model Versioning', 'AI Testing', 'AI Monitoring',
      'LLM Security', 'RAG Security', 'Vector Database Security',
      'AI Data Privacy', 'AI Compliance', 'AI Ethics',
      'Model Robustness', 'Adversarial Attacks', 'Model Extraction',
      'AI Governance', 'AI Risk Assessment'
    ],
    cyber: [
      'Access Control', 'Authentication', 'Authorization', 'Data Encryption',
      'Network Security', 'Firewall Configuration', 'Intrusion Detection',
      'Vulnerability Management', 'Patch Management', 'Security Monitoring',
      'Incident Response', 'Data Backup', 'Disaster Recovery',
      'Security Awareness', 'Phishing Protection', 'Malware Protection',
      'Data Loss Prevention', 'Endpoint Security', 'Mobile Security',
      'API Security', 'Web Application Security', 'Database Security',
      'Third-Party Risk', 'Supply Chain Security', 'Security Testing'
    ],
    cloud: [
      'Cloud Infrastructure Security', 'Cloud Configuration', 'IAM Policies',
      'Cloud Data Encryption', 'Cloud Backup', 'Cloud Monitoring',
      'Container Security', 'Kubernetes Security', 'Serverless Security',
      'Cloud Network Security', 'Cloud Compliance', 'Cloud Access Control',
      'Cloud Key Management', 'Cloud Logging', 'Cloud Incident Response',
      'Multi-Cloud Security', 'Cloud Migration Security', 'Cloud Cost Optimization',
      'Cloud Performance', 'Cloud Availability', 'Cloud Disaster Recovery',
      'Cloud SLA Management', 'Cloud Vendor Management', 'Cloud Security Posture',
      'DevSecOps'
    ]
  }

  const domainAreas = domainRiskMap[domain] || []

  // Combine LLM priorities with domain-specific areas
  const combinedAreas = [
    ...llmAnalysis.recommendedPriorities.map(p => ({
      area: p.area,
      priority: p.priority,
      reasoning: p.reasoning
    })),
    ...domainAreas.map(area => ({
      area,
      priority: 75, // Default priority for domain-specific areas
      reasoning: `${domain.toUpperCase()}-specific risk area`
    }))
  ]

  // Sort by priority and remove duplicates
  const uniqueAreas = new Map<string, { area: string; priority: number; reasoning: string }>()
  combinedAreas.forEach(item => {
    const key = item.area.toLowerCase()
    if (!uniqueAreas.has(key) || uniqueAreas.get(key)!.priority < item.priority) {
      uniqueAreas.set(key, item)
    }
  })

  return Array.from(uniqueAreas.values())
    .sort((a, b) => b.priority - a.priority)
}

async function generateSingleRiskQuestion(
  priorityArea: { area: string; priority: number; reasoning: string },
  relatedIncidents: IncidentMatch[],
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis,
  domain?: 'ai' | 'cyber' | 'cloud'
): Promise<DynamicQuestion> {
  // Calculate weights
  const baseWeight = priorityArea.priority / 100 // LLM priority as weight
  const evidenceWeight = calculateEvidenceWeight(relatedIncidents)
  const industryWeight = request.industry ? 0.9 : 0.7 // Higher if industry specified
  const finalWeight = (baseWeight * 0.5) + (evidenceWeight * 0.3) + (industryWeight * 0.2)

  // Extract real examples from incidents
  const examples = relatedIncidents.slice(0, 5).map(incident => {
    const cost = incident.estimatedCost ? ` ($${Number(incident.estimatedCost).toLocaleString()})` : ''
    const org = incident.organization || 'Organization'
    return `${org} - ${incident.incidentType}${cost}`
  })

  // Calculate average cost for this risk area
  const avgCost = relatedIncidents.length > 0
    ? relatedIncidents
        .filter(i => i.estimatedCost)
        .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0) / relatedIncidents.filter(i => i.estimatedCost).length
    : 0

  // Calculate average severity from incidents
  const avgSeverity = relatedIncidents.length > 0
    ? relatedIncidents
        .filter(i => i.severity)
        .reduce((sum, i) => {
          const severityMap: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2 }
          return sum + (severityMap[i.severity!.toLowerCase()] || 5)
        }, 0) / relatedIncidents.filter(i => i.severity).length
    : 5

  // Calculate total cost
  const totalCost = relatedIncidents
    .filter(i => i.estimatedCost)
    .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0)

  // ✅ Create evidence object with incident metadata
  const evidence: IncidentEvidence = {
    incidentCount: relatedIncidents.length,
    avgSeverity: avgSeverity || 5,
    relevanceScore: relatedIncidents.length > 0
      ? relatedIncidents.reduce((sum, i) => sum + i.similarity, 0) / relatedIncidents.length
      : 0,
    recentExamples: relatedIncidents.slice(0, 5).map(incident => ({
      id: incident.incidentId || `inc_${Date.now()}`,
      title: incident.embeddingText?.substring(0, 100) || incident.incidentType || 'Incident',
      // ✅ Try multiple field names for organization (frontend compatibility)
      organization: (incident as any).organization
        || (incident as any).company
        || (incident as any).companyName
        || (incident as any).title
        || 'Organization',
      date: incident.incidentDate ? new Date(incident.incidentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      severity: avgSeverity,
      // ✅ Try multiple field names for incidentType (frontend compatibility)
      incidentType: incident.incidentType
        || (incident as any).type
        || (incident as any).category
        || (incident as any).riskCategory
        || 'security_incident',
      category: incident.incidentType || 'security_incident',
      description: incident.embeddingText || 'Security incident',
      // ✅ Try multiple field names for cost (frontend compatibility)
      estimatedCost: Number((incident as any).estimatedCost
        || (incident as any).cost
        || (incident as any).financialImpact
        || (incident as any).impact
        || 0),
      cost: Number((incident as any).estimatedCost
        || (incident as any).cost
        || (incident as any).financialImpact
        || (incident as any).impact
        || 0),
      // ✅ Try multiple field names for similarity (frontend compatibility)
      similarity: incident.similarity
        || (incident as any).relevanceScore
        || (incident as any).score
        || (incident as any).matchScore
        || 0,
      relevanceScore: incident.similarity
        || (incident as any).relevanceScore
        || (incident as any).score
        || (incident as any).matchScore
        || 0,
    })),
    statistics: {
      totalCost,
      avgCost,
      affectedSystems: relatedIncidents.length,
    }
  }

  const question: DynamicQuestion = {
    id: `dynamic_${priorityArea.area.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    label: priorityArea.area,
    text: priorityArea.area,
    question: priorityArea.area,
    description: `Evidence from ${relatedIncidents.length} incidents with average severity ${avgSeverity.toFixed(1)}/10`,
    priority: determinePriority(finalWeight),

    importance: `${priorityArea.reasoning}. Historical data shows ${relatedIncidents.length} similar incidents with average cost of $${avgCost.toLocaleString()}.`,
    reasoning: `${priorityArea.reasoning}. Evidence from ${relatedIncidents.length} incidents with average severity ${avgSeverity.toFixed(1)}/10`,
    examples,
    mitigations: generateMitigations(priorityArea.area, relatedIncidents),
    regulations: extractRegulations(relatedIncidents, llmAnalysis),

    // ✅ CRITICAL: Evidence object
    evidence,

    baseWeight,
    evidenceWeight,
    industryWeight,
    finalWeight,
    weight: finalWeight, // ✅ 0-1 scale (normalized for frontend display as percentage)

    weightageExplanation: createWeightageExplanation(baseWeight, evidenceWeight, industryWeight, finalWeight, priorityArea.reasoning),
    evidenceQuery: priorityArea.area,
    relatedIncidents: relatedIncidents.slice(0, 10),
    similarIncidents: relatedIncidents.slice(0, 10),
    relatedIncidentCount: relatedIncidents.length,

    category: categorizeDomain(priorityArea.area),
    domain: domain || categorizeDomain(priorityArea.area), // ✅ Add domain for frontend filtering
    generatedFrom: 'hybrid',
    confidence: calculateConfidence(relatedIncidents, baseWeight) > 0.7 ? 'high' : 'medium',
    aiGenerated: true,
  }

  return question
}

// ============================================================================
// COMPLIANCE QUESTION GENERATION
// ============================================================================

async function generateComplianceQuestions(
  request: QuestionGenerationRequest,
  incidents: IncidentMatch[],
  llmAnalysis: LLMAnalysis
): Promise<DynamicQuestion[]> {
  const questions: DynamicQuestion[] = []

  // Generate questions based on identified compliance requirements
  for (const regulation of llmAnalysis.complianceRequirements) {
    const relatedIncidents = incidents.filter(i => {
      if (!i.embeddingText) return false
      const text = i.embeddingText.toLowerCase()
      return (
        text.includes(regulation.toLowerCase()) ||
        text.includes('compliance') ||
        text.includes('regulation')
      )
    })

    const question = await generateSingleComplianceQuestion(
      regulation,
      relatedIncidents,
      request,
      llmAnalysis
    )

    questions.push(question)
  }

  // Ensure minimum compliance coverage
  const criticalCompliance = ['Data Inventory', 'Consent Management', 'Security Measures', 'Breach Response']
  for (const area of criticalCompliance) {
    if (!questions.find(q => q.label.toLowerCase().includes(area.toLowerCase()))) {
      const relatedIncidents = findRelatedIncidents(area, incidents)
      const question = await generateSingleComplianceQuestion(
        area,
        relatedIncidents,
        request,
        llmAnalysis
      )
      questions.push(question)
    }
  }

  return questions
}

async function generateSingleComplianceQuestion(
  complianceArea: string,
  relatedIncidents: IncidentMatch[],
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis
): Promise<DynamicQuestion> {
  // Calculate weights for compliance
  const baseWeight = llmAnalysis.complianceRequirements.includes(complianceArea) ? 0.9 : 0.7
  const evidenceWeight = calculateEvidenceWeight(relatedIncidents)
  const industryWeight = request.industry ? 0.85 : 0.7
  const finalWeight = (baseWeight * 0.6) + (evidenceWeight * 0.25) + (industryWeight * 0.15)

  // Extract examples
  const examples = relatedIncidents.slice(0, 3).map(incident => {
    const cost = incident.estimatedCost ? ` (Fine: $${Number(incident.estimatedCost).toLocaleString()})` : ''
    return `${incident.organization || 'Organization'} - ${incident.incidentType}${cost}`
  })

  const avgFine = relatedIncidents.length > 0
    ? relatedIncidents
        .filter(i => i.estimatedCost)
        .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0) / relatedIncidents.filter(i => i.estimatedCost).length
    : 0

  // Calculate average severity from compliance incidents
  const avgSeverity = relatedIncidents.length > 0
    ? relatedIncidents
        .filter(i => i.severity)
        .reduce((sum, i) => {
          const severityMap: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2 }
          return sum + (severityMap[i.severity!.toLowerCase()] || 5)
        }, 0) / relatedIncidents.filter(i => i.severity).length
    : 5

  // Calculate total cost
  const totalCost = relatedIncidents
    .filter(i => i.estimatedCost)
    .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0)

  // ✅ Create evidence object for compliance questions
  const evidence: IncidentEvidence = {
    incidentCount: relatedIncidents.length,
    avgSeverity: avgSeverity || 5,
    relevanceScore: relatedIncidents.length > 0
      ? relatedIncidents.reduce((sum, i) => sum + i.similarity, 0) / relatedIncidents.length
      : 0,
    recentExamples: relatedIncidents.slice(0, 5).map(incident => ({
      id: incident.incidentId || `inc_${Date.now()}`,
      title: incident.embeddingText?.substring(0, 100) || incident.incidentType || 'Compliance Incident',
      // ✅ Try multiple field names for organization (frontend compatibility)
      organization: (incident as any).organization
        || (incident as any).company
        || (incident as any).companyName
        || (incident as any).title
        || 'Organization',
      date: incident.incidentDate ? new Date(incident.incidentDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      severity: avgSeverity,
      // ✅ Try multiple field names for incidentType (frontend compatibility)
      incidentType: incident.incidentType
        || (incident as any).type
        || (incident as any).category
        || (incident as any).riskCategory
        || 'regulation_violation',
      category: incident.incidentType || 'compliance',
      description: incident.embeddingText || 'Compliance violation',
      // ✅ Try multiple field names for cost (frontend compatibility)
      estimatedCost: Number((incident as any).estimatedCost
        || (incident as any).cost
        || (incident as any).financialImpact
        || (incident as any).impact
        || 0),
      cost: Number((incident as any).estimatedCost
        || (incident as any).cost
        || (incident as any).financialImpact
        || (incident as any).impact
        || 0),
      // ✅ Try multiple field names for similarity (frontend compatibility)
      similarity: incident.similarity
        || (incident as any).relevanceScore
        || (incident as any).score
        || (incident as any).matchScore
        || 0,
      relevanceScore: incident.similarity
        || (incident as any).relevanceScore
        || (incident as any).score
        || (incident as any).matchScore
        || 0,
    })),
    statistics: {
      totalCost,
      avgCost: avgFine,
      affectedSystems: relatedIncidents.length,
    }
  }

  const question: DynamicQuestion = {
    id: `compliance_${complianceArea.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    label: complianceArea,
    text: complianceArea,
    question: complianceArea,
    description: `Based on ${relatedIncidents.length} similar incidents`,
    priority: determinePriority(finalWeight),

    importance: `Required for ${llmAnalysis.complianceRequirements.join(', ')}. Non-compliance fines average $${avgFine.toLocaleString()} based on ${relatedIncidents.length} incidents.`,
    reasoning: `Evidence from ${relatedIncidents.length} compliance incidents`,
    examples,
    mitigations: generateComplianceMitigations(complianceArea),
    regulations: llmAnalysis.complianceRequirements,

    // ✅ CRITICAL: Evidence object
    evidence,

    baseWeight,
    evidenceWeight,
    industryWeight,
    finalWeight,
    weight: finalWeight, // ✅ 0-1 scale (normalized for frontend display as percentage)

    weightageExplanation: createWeightageExplanation(baseWeight, evidenceWeight, industryWeight, finalWeight, `Required by ${llmAnalysis.complianceRequirements.join(', ')}`),
    evidenceQuery: complianceArea,
    relatedIncidents: relatedIncidents.slice(0, 5),
    similarIncidents: relatedIncidents.slice(0, 5),
    relatedIncidentCount: relatedIncidents.length,

    category: 'compliance',
    domain: 'compliance', // ✅ Add domain for compliance questions
    generatedFrom: 'hybrid',
    confidence: calculateConfidence(relatedIncidents, baseWeight) > 0.7 ? 'high' : 'medium',
    aiGenerated: true,
  }

  return question
}

// ============================================================================
// SCORING FORMULA GENERATION
// ============================================================================

function createScoringFormula(
  riskQuestions: DynamicQuestion[],
  complianceQuestions: DynamicQuestion[],
  incidentStats: any
): ScoringFormula {
  // Define scoring components
  const components: ScoringComponent[] = [
    {
      name: 'Risk Coverage Score',
      weight: 0.60,
      description: 'Weighted assessment of risk controls based on incident severity',
      formula: 'Σ(question_score × question_weight) / Σ(question_weight)',
      justification: `60% weight because historical incidents show avg cost of $${incidentStats.avgCost.toLocaleString()}, making risk mitigation the primary concern`,
    },
    {
      name: 'Compliance Coverage Score',
      weight: 0.40,
      description: 'Weighted assessment of regulatory compliance based on fine history',
      formula: 'Σ(question_score × question_weight) / Σ(question_weight)',
      justification: `40% weight because compliance violations average $${incidentStats.avgCost.toLocaleString()} in fines, secondary to direct risk impact`,
    },
  ]

  const formula = `
Final Score = (Risk Coverage × 0.60) + (Compliance Coverage × 0.40)

Where:
- Risk Coverage = Σ(question_answer × question_weight) / Σ(question_weight)
- Compliance Coverage = Σ(question_answer × question_weight) / Σ(question_weight)

Question Weights determined by:
- Base Weight (50%): LLM-analyzed importance based on system description
- Evidence Weight (30%): Incident frequency and severity from d-vecDB
- Industry Weight (20%): Industry-specific relevance

Question Answers:
- Addressed = 100 points
- Partially Addressed = 50 points
- Not Addressed = 0 points
- Not Applicable = Excluded from calculation
`

  const exampleCalculation = generateExampleCalculation(riskQuestions.slice(0, 3), complianceQuestions.slice(0, 2))

  const visualization = `
┌─────────────────────────────────────────────────────────────┐
│                      SCORING BREAKDOWN                       │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Risk Score (60%)                Compliance Score (40%)      │
│  ┌──────────────┐                ┌──────────────┐           │
│  │ Question 1   │ ×weight         │ Question 1   │ ×weight   │
│  │ Question 2   │ ×weight         │ Question 2   │ ×weight   │
│  │ Question 3   │ ×weight         │ Question 3   │ ×weight   │
│  │    ...       │                 │    ...       │           │
│  └──────────────┘                 └──────────────┘           │
│        ↓                                 ↓                    │
│  Weighted Average                  Weighted Average          │
│        ↓                                 ↓                    │
│    ×60%                               ×40%                    │
│        └─────────────┬─────────────────┘                     │
│                      ↓                                        │
│              FINAL SENGOL SCORE                               │
│              (0-100 scale)                                    │
│                                                               │
└─────────────────────────────────────────────────────────────┘
`

  return {
    name: 'Evidence-Based Weighted Scoring',
    description: 'Dynamic scoring formula that adapts weights based on real incident data and LLM analysis of your specific system',
    components,
    formula,
    exampleCalculation,
    visualization,
  }
}

function generateExampleCalculation(riskQuestions: DynamicQuestion[], complianceQuestions: DynamicQuestion[]): string {
  const riskCalc = riskQuestions.map((q, i) =>
    `Q${i+1} (${q.label}): 100 points × ${q.finalWeight.toFixed(2)} weight = ${(100 * q.finalWeight).toFixed(0)}`
  ).join('\n  ')

  const riskTotal = riskQuestions.reduce((sum, q) => sum + (100 * q.finalWeight), 0)
  const riskWeightSum = riskQuestions.reduce((sum, q) => sum + q.finalWeight, 0)
  const riskScore = riskTotal / riskWeightSum

  const complianceCalc = complianceQuestions.map((q, i) =>
    `Q${i+1} (${q.label}): 100 points × ${q.finalWeight.toFixed(2)} weight = ${(100 * q.finalWeight).toFixed(0)}`
  ).join('\n  ')

  const complianceTotal = complianceQuestions.reduce((sum, q) => sum + (100 * q.finalWeight), 0)
  const complianceWeightSum = complianceQuestions.reduce((sum, q) => sum + q.finalWeight, 0)
  const complianceScore = complianceTotal / complianceWeightSum

  const finalScore = (riskScore * 0.6) + (complianceScore * 0.4)

  return `
EXAMPLE CALCULATION (all questions marked "Addressed"):

Risk Questions:
  ${riskCalc}
  ────────────────
  Total: ${riskTotal.toFixed(0)} / ${riskWeightSum.toFixed(2)} = ${riskScore.toFixed(1)}

Compliance Questions:
  ${complianceCalc}
  ────────────────
  Total: ${complianceTotal.toFixed(0)} / ${complianceWeightSum.toFixed(2)} = ${complianceScore.toFixed(1)}

FINAL CALCULATION:
  (${riskScore.toFixed(1)} × 0.60) + (${complianceScore.toFixed(1)} × 0.40)
  = ${(riskScore * 0.6).toFixed(1)} + ${(complianceScore * 0.4).toFixed(1)}
  = ${finalScore.toFixed(1)}

SENGOL SCORE: ${finalScore.toFixed(0)}/100
`
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function findRelatedIncidents(area: string, incidents: IncidentMatch[]): IncidentMatch[] {
  // Since incidents are already filtered by semantic similarity from d-vecDB vector search,
  // we don't need additional keyword filtering. The short content_preview fields in d-vecDB
  // (e.g., "vulnerability CSRF...", "privacy_breach failure...") don't contain full keywords
  // like "access control" or "data encryption", causing false negatives.
  //
  // Instead, we rely on the vector similarity ranking from the original search query.
  // All incidents here are already relevant to the system description.

  const validIncidents = incidents.filter(incident => {
    // Only safety check: ensure embeddingText exists for display purposes
    return incident.embeddingText && incident.embeddingText.length > 0
  })

  console.log(`[findRelatedIncidents] "${area}": Using ${validIncidents.length}/${incidents.length} incidents (already filtered by vector similarity)`)

  // Return all valid incidents - they're already ranked by relevance
  return validIncidents
}

function calculateEvidenceWeight(incidents: IncidentMatch[]): number {
  if (incidents.length === 0) return 0.5 // Neutral if no evidence

  // Weight based on:
  // - Number of incidents (more = higher weight)
  // - Average severity
  // - Average similarity
  const countWeight = Math.min(incidents.length / 20, 1.0) // Max at 20 incidents
  const avgSimilarity = incidents.reduce((sum, i) => sum + i.similarity, 0) / incidents.length
  const severityWeight = calculateSeverityWeight(incidents)

  return (countWeight * 0.4) + (avgSimilarity * 0.3) + (severityWeight * 0.3)
}

function calculateSeverityWeight(incidents: IncidentMatch[]): number {
  const severityScores = { critical: 1.0, high: 0.75, medium: 0.5, low: 0.25 }
  const scores = incidents
    .filter(i => i.severity)
    .map(i => severityScores[i.severity!.toLowerCase() as keyof typeof severityScores] || 0.5)

  return scores.length > 0 ? scores.reduce((sum, s) => sum + s, 0) / scores.length : 0.5
}

function determinePriority(finalWeight: number): 'low' | 'medium' | 'high' | 'critical' {
  if (finalWeight >= 0.85) return 'critical'
  if (finalWeight >= 0.70) return 'high'
  if (finalWeight >= 0.50) return 'medium'
  return 'low'
}

function generateMitigations(area: string, incidents: IncidentMatch[]): string[] {
  // Extract common patterns from incidents
  const mitigations: string[] = []

  if (area.toLowerCase().includes('access') || area.toLowerCase().includes('authentication')) {
    mitigations.push('Implement multi-factor authentication (MFA)')
    mitigations.push('Use role-based access control (RBAC)')
    mitigations.push('Regular access reviews and deprovisioning')
  }

  if (area.toLowerCase().includes('data') || area.toLowerCase().includes('encryption')) {
    mitigations.push('Encrypt data at rest (AES-256) and in transit (TLS 1.3)')
    mitigations.push('Implement data loss prevention (DLP) tools')
    mitigations.push('Regular backup and recovery testing')
  }

  if (area.toLowerCase().includes('monitor') || area.toLowerCase().includes('log')) {
    mitigations.push('Deploy SIEM for centralized logging')
    mitigations.push('Implement real-time alerting')
    mitigations.push('Establish 24/7 security operations center (SOC)')
  }

  // Add at least 3 mitigations
  if (mitigations.length === 0) {
    mitigations.push('Conduct regular security assessments')
    mitigations.push('Implement security awareness training')
    mitigations.push('Establish incident response procedures')
  }

  return mitigations
}

function generateComplianceMitigations(area: string): string[] {
  const mitigations: string[] = []

  if (area.toLowerCase().includes('data inventory')) {
    mitigations.push('Create Records of Processing Activities (ROPA)')
    mitigations.push('Implement data discovery and classification tools')
    mitigations.push('Maintain data flow diagrams')
  } else if (area.toLowerCase().includes('consent')) {
    mitigations.push('Deploy consent management platform (CMP)')
    mitigations.push('Provide granular consent options')
    mitigations.push('Enable easy consent withdrawal')
  } else if (area.toLowerCase().includes('security')) {
    mitigations.push('Conduct regular penetration testing')
    mitigations.push('Implement encryption for personal data')
    mitigations.push('Establish incident response plan')
  } else {
    mitigations.push('Document compliance procedures')
    mitigations.push('Conduct regular compliance audits')
    mitigations.push('Assign compliance ownership')
  }

  return mitigations
}

function extractRegulations(incidents: IncidentMatch[], llmAnalysis: LLMAnalysis): string[] {
  const regulations = new Set<string>(llmAnalysis.complianceRequirements)

  incidents.forEach(incident => {
    // Safety check: skip incidents without embedding text
    if (!incident.embeddingText) return
    const text = incident.embeddingText.toLowerCase()
    if (text.includes('gdpr')) regulations.add('GDPR')
    if (text.includes('hipaa')) regulations.add('HIPAA')
    if (text.includes('pci')) regulations.add('PCI DSS')
    if (text.includes('soc 2')) regulations.add('SOC 2')
    if (text.includes('iso 27001')) regulations.add('ISO 27001')
  })

  return Array.from(regulations)
}

function createWeightageExplanation(
  baseWeight: number,
  evidenceWeight: number,
  industryWeight: number,
  finalWeight: number,
  reasoning: string
): string {
  return `
Question Weight: ${(finalWeight * 100).toFixed(0)}%

Calculation Breakdown:
- Base Weight (50%): ${(baseWeight * 100).toFixed(0)}% - ${reasoning}
- Evidence Weight (30%): ${(evidenceWeight * 100).toFixed(0)}% - Based on ${evidenceWeight > 0.7 ? 'high' : evidenceWeight > 0.5 ? 'moderate' : 'low'} incident frequency
- Industry Weight (20%): ${(industryWeight * 100).toFixed(0)}% - Industry-specific relevance

Formula: (${(baseWeight * 100).toFixed(0)}% × 0.50) + (${(evidenceWeight * 100).toFixed(0)}% × 0.30) + (${(industryWeight * 100).toFixed(0)}% × 0.20)
       = ${(finalWeight * 100).toFixed(0)}%

This weight means this question has ${finalWeight > 0.8 ? 'very high' : finalWeight > 0.6 ? 'high' : finalWeight > 0.4 ? 'moderate' : 'lower'} impact on your final score.
`.trim()
}

function calculateConfidence(incidents: IncidentMatch[], baseWeight: number): number {
  // Confidence based on:
  // - Number of supporting incidents
  // - Average similarity of incidents
  // - LLM base weight

  const incidentConfidence = Math.min(incidents.length / 10, 1.0)
  const similarityConfidence = incidents.length > 0
    ? incidents.reduce((sum, i) => sum + i.similarity, 0) / incidents.length
    : 0.5

  return (incidentConfidence * 0.3) + (similarityConfidence * 0.3) + (baseWeight * 0.4)
}

function categorizeDomain(area: string): 'ai' | 'cyber' | 'cloud' | 'compliance' {
  const lower = area.toLowerCase()
  if (lower.includes('ai') || lower.includes('ml') || lower.includes('model')) return 'ai'
  if (lower.includes('cloud') || lower.includes('infrastructure')) return 'cloud'
  if (lower.includes('compliance') || lower.includes('regulation')) return 'compliance'
  return 'cyber'
}

function generateIndustryBenchmark(incidentStats: any, industry?: string): string {
  return `${industry || 'Your industry'} experiences average incident costs of $${incidentStats.avgCost.toLocaleString()} with ${incidentStats.mfaAdoptionRate.toFixed(0)}% MFA adoption rate.`
}
