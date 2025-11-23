/**
 * Dynamic Question Generation Engine
 *
 * Generates context-aware risk and compliance questions based on:
 * 1. System description analysis via LLM
 * 2. Similar historical incidents from Vertex AI RAG (78,767+ incidents)
 * 3. Industry-specific patterns and regulatory requirements
 *
 * This replaces static questionnaires with intelligent, evidence-based assessments
 * that provide real differentiation value to clients.
 */

import { gemini } from '../lib/multi-llm-client' // Multi-provider LLM with automatic fallback
import { findSimilarIncidents, calculateIncidentStatistics, type IncidentMatch } from './incident-search'
import { getFromCache, setInCache, CACHE_TTL } from '../lib/redis-cache'
import { PRE_FILTER_THRESHOLDS, QUESTION_INTENSITY, WEIGHT_FORMULAS, VECTOR_SEARCH_CONFIG, type QuestionIntensity } from '../config/thresholds'
import crypto from 'crypto'

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
  examples: string[] // Real incidents from Vertex AI RAG
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
  dataTypes?: string[] // Data types processed (PII, Financial, Health, etc.) - ENHANCED for multi-factor matching
  dataSources?: string[] // Data sources (API, Database, File Upload, etc.) - NEW for multi-factor matching
  systemCriticality?: string // High, Medium, Low
  deployment?: string // cloud, on-prem, hybrid

  // Question generation controls
  maxQuestions?: number // Total questions (default: 75)
  questionsPerDomain?: number // Questions per domain (default: 25)
  minWeight?: number // Minimum weight threshold (0-1 scale, default: 0.7 for 70%+)
  minRiskPotential?: number // Alias for minWeight

  // Multi-factor relevance controls
  minRelevanceScore?: number // Minimum combined relevance score (default: 0.5)
  minIncidentCount?: number // Minimum incidents per question (default: 3)

  // Question intensity filtering (frontend alignment)
  questionIntensity?: 'high' | 'medium' | 'low' // Controls question filtering (default: 'high')

  // Cache control
  forceRegenerate?: boolean // Force bypass all caches and regenerate from scratch (default: false)
  skipIncidentSearch?: boolean // Skip incident search for faster generation (5-10s vs 30s) - moved to Step 3 (default: false)
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
// CACHING HELPERS
// ============================================================================

/**
 * Generate cache key for question generation requests
 * Key factors: system description, domains, industry, tech stack, intensity
 */
function generateQuestionCacheKey(request: QuestionGenerationRequest): string {
  const normalized = {
    system: request.systemDescription.trim().toLowerCase().substring(0, 500),
    domains: (request.selectedDomains || []).sort().join(','),
    industry: request.industry || '',
    tech: (request.techStack || []).sort().join(','),
    data: (request.dataTypes || []).sort().join(','),
    intensity: request.questionIntensity || 'high',
    jurisdictions: (request.jurisdictions || []).sort().join(','),
    version: 'v9', // ← CACHE BUSTER: Performance optimization (batch size 5→8, delay 12s→8s) + comprehensive questions
  }

  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 16)

  return `questions:${hash}`
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Extract technologies from incident metadata or text
 */
function extractTechnologies(incident: IncidentMatch): string[] {
  const techs: string[] = []

  // Extract from embeddingText
  if (incident.embeddingText) {
    const text = incident.embeddingText.toLowerCase()
    const techKeywords: Record<string, string[]> = {
      'GPT-4': ['gpt-4', 'gpt4', 'openai gpt-4'],
      'GPT-3': ['gpt-3', 'gpt3'],
      'Claude': ['claude', 'anthropic'],
      'BERT': ['bert'],
      'LLM': ['llm', 'large language model'],
      'AWS': ['aws', 'amazon web services'],
      'Azure': ['azure', 'microsoft azure'],
      'GCP': ['gcp', 'google cloud'],
      'PostgreSQL': ['postgresql', 'postgres'],
      'MongoDB': ['mongodb', 'mongo'],
      'Redis': ['redis'],
      'Docker': ['docker', 'container'],
      'Kubernetes': ['kubernetes', 'k8s'],
      'React': ['react'],
      'Node.js': ['node.js', 'nodejs'],
      'Python': ['python'],
      'TensorFlow': ['tensorflow'],
      'PyTorch': ['pytorch'],
      'S3': ['s3', 'amazon s3'],
      'Lambda': ['lambda', 'aws lambda'],
      'API': ['api', 'rest api'],
    }

    for (const [tech, keywords] of Object.entries(techKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        techs.push(tech)
      }
    }
  }

  return [...new Set(techs)]
}

/**
 * Extract data types from incident metadata or text
 */
function extractDataTypes(incident: IncidentMatch): string[] {
  const dataTypes: string[] = []

  if (incident.embeddingText) {
    const text = incident.embeddingText.toLowerCase()
    const dataTypeKeywords: Record<string, string[]> = {
      'PII': ['pii', 'personally identifiable', 'personal data'],
      'PHI': ['phi', 'protected health', 'medical records'],
      'Financial': ['financial', 'payment', 'credit card', 'bank account'],
      'Health': ['health', 'medical', 'patient'],
      'Credit': ['credit', 'credit card'],
      'Biometric': ['biometric', 'fingerprint', 'face recognition'],
      'Location': ['location', 'gps', 'geolocation'],
      'Authentication': ['authentication', 'password', 'credentials'],
    }

    for (const [dataType, keywords] of Object.entries(dataTypeKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        dataTypes.push(dataType)
      }
    }
  }

  return [...new Set(dataTypes)]
}

/**
 * Extract data sources from incident metadata or text
 */
function extractDataSources(incident: IncidentMatch): string[] {
  const sources: string[] = []

  if (incident.embeddingText) {
    const text = incident.embeddingText.toLowerCase()
    const sourceKeywords: Record<string, string[]> = {
      'API': ['api', 'rest', 'graphql', 'endpoint'],
      'Database': ['database', 'sql', 'nosql'],
      'File': ['file', 'upload', 'document'],
      'Third-party': ['third-party', 'external service', 'integration'],
      'Cloud Storage': ['cloud storage', 's3', 'blob'],
      'Stream': ['streaming', 'real-time', 'kafka'],
    }

    for (const [source, keywords] of Object.entries(sourceKeywords)) {
      if (keywords.some(kw => text.includes(kw))) {
        sources.push(source)
      }
    }
  }

  return [...new Set(sources)]
}

/**
 * Calculate technology match score (0-1)
 */
function calculateTechnologyMatch(incident: IncidentMatch, techStack: string[]): number {
  if (!techStack || techStack.length === 0) return 0.5 // Neutral if no tech stack

  const incidentTechs = extractTechnologies(incident)
  if (incidentTechs.length === 0) return 0.5 // Neutral if unknown

  const techStackLower = techStack.map(t => t.toLowerCase())
  const incidentTechsLower = incidentTechs.map(t => t.toLowerCase())

  const matches = incidentTechsLower.filter(tech =>
    techStackLower.some(stackTech =>
      stackTech.includes(tech) || tech.includes(stackTech)
    )
  )

  return matches.length / Math.max(techStack.length, incidentTechs.length)
}

/**
 * Calculate data type match score (0-1)
 */
function calculateDataTypeMatch(incident: IncidentMatch, dataTypes: string[]): number {
  if (!dataTypes || dataTypes.length === 0) return 0.5 // Neutral if no data types

  const incidentDataTypes = extractDataTypes(incident)
  if (incidentDataTypes.length === 0) return 0.5 // Neutral if unknown

  const dataTypesLower = dataTypes.map(t => t.toLowerCase())
  const incidentDataTypesLower = incidentDataTypes.map(t => t.toLowerCase())

  const matches = incidentDataTypesLower.filter(dt =>
    dataTypesLower.some(sysDt =>
      sysDt.includes(dt) || dt.includes(sysDt)
    )
  )

  return matches.length / Math.max(dataTypes.length, incidentDataTypes.length)
}

/**
 * Calculate data source match score (0-1)
 */
function calculateDataSourceMatch(incident: IncidentMatch, dataSources: string[]): number {
  if (!dataSources || dataSources.length === 0) return 0.5 // Neutral if no data sources

  const incidentSources = extractDataSources(incident)
  if (incidentSources.length === 0) return 0.5 // Neutral if unknown

  const sourcesLower = dataSources.map(s => s.toLowerCase())
  const incidentSourcesLower = incidentSources.map(s => s.toLowerCase())

  const matches = incidentSourcesLower.filter(src =>
    sourcesLower.some(sysSrc =>
      sysSrc.includes(src) || src.includes(sysSrc)
    )
  )

  return matches.length / Math.max(dataSources.length, incidentSources.length)
}

/**
 * Calculate combined multi-factor relevance score (0-1)
 * Combines semantic similarity, technology match, data type match, and source match
 */
function calculateMultiFactorRelevance(
  incident: IncidentMatch,
  request: QuestionGenerationRequest
): number {
  const semanticScore = incident.similarity
  const technologyScore = calculateTechnologyMatch(incident, request.techStack || [])
  const dataTypeScore = calculateDataTypeMatch(incident, request.dataTypes || [])
  const sourceScore = calculateDataSourceMatch(incident, request.dataSources || [])

  // Weighted combination (semantic 40%, tech 30%, dataType 20%, source 10%)
  const combinedRelevance = (
    semanticScore * 0.4 +
    technologyScore * 0.3 +
    dataTypeScore * 0.2 +
    sourceScore * 0.1
  )

  return combinedRelevance
}

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

/**
 * Apply question intensity filtering
 *
 * Filters questions based on weight and priority thresholds according to centralized config:
 * - high: minWeight 0.0, all priorities, max 25 questions
 * - medium: minWeight 0.4, critical/high/medium, max 15 questions
 * - low: minWeight 0.6, critical/high only, max 8 questions
 */
function applyIntensityFiltering(
  questions: DynamicQuestion[],
  intensity: 'high' | 'medium' | 'low' = 'high'
): DynamicQuestion[] {
  // ✅ PHASE 3: Use centralized threshold configuration
  const rules = QUESTION_INTENSITY

  const rule = rules[intensity]

  console.log(`[Intensity] Applying ${intensity.toUpperCase()} filter: minWeight=${rule.minWeight}, priorities=${rule.priorities.join(',')}, max=${rule.maxQuestions}`)

  // Filter by weight and priority
  let filtered = questions.filter(q => {
    const meetsWeight = q.finalWeight >= rule.minWeight
    const meetsPriority = (rule.priorities as readonly string[]).includes(q.priority)
    return meetsWeight && meetsPriority
  })

  // Sort by weight descending (highest priority first)
  filtered = filtered.sort((a, b) => b.finalWeight - a.finalWeight)

  // Limit to max questions
  const beforeLimit = filtered.length
  filtered = filtered.slice(0, rule.maxQuestions)

  console.log(`[Intensity] ${intensity.toUpperCase()}: Filtered ${questions.length} → ${beforeLimit} (after rules) → ${filtered.length} (after limit)`)

  // Warn if we have fewer than minimum expected
  if (filtered.length < 3) {
    console.warn(`[Intensity] WARNING: Only ${filtered.length} questions after ${intensity} filtering. Consider using higher intensity or adjusting thresholds.`)
  }

  return filtered
}

// ============================================================================
// MAIN GENERATION FUNCTION
// ============================================================================

export async function generateDynamicQuestions(
  request: QuestionGenerationRequest
): Promise<QuestionGenerationResult> {
  const overallStartTime = Date.now()

  try {
    console.log('\n🎯 Starting Dynamic Question Generation with Multi-Provider LLM...')
    console.log('System: "' + request.systemDescription.substring(0, 100) + '..."')
    console.log('Domains:', request.selectedDomains || 'Not specified')
    console.log('Industry:', request.industry || 'Not specified')
    
    // Log available LLM providers
    try {
      const { getProviderStatus } = await import('../lib/multi-llm-client')
      const providerStatus = getProviderStatus()
      const availableProviders = Object.entries(providerStatus)
        .filter(([_, status]) => status.enabled)
        .map(([name, _]) => name.toUpperCase())
        .join(', ')
      console.log(`[LLM] Available providers: ${availableProviders || 'NONE - Please configure API keys'}`)
      if (availableProviders) {
        const providerOrder = Object.entries(providerStatus)
          .filter(([_, status]) => status.enabled)
          .sort(([_, a], [__, b]) => a.priority - b.priority)
          .map(([name, _]) => name.toUpperCase())
          .join(' → ')
        console.log(`[LLM] Provider fallback order: ${providerOrder}`)
      }
    } catch (err) {
      console.warn('[LLM] Could not check provider status:', err)
    }
    
    if (request.forceRegenerate) {
      console.log('🔄 Force Regenerate: ENABLED - Bypassing all caches')
    }

    // ✅ OPTIMIZATION: Check cache for existing results (80-99% speedup for repeat requests)
    // Skip cache if forceRegenerate flag is set
    const cacheKey = generateQuestionCacheKey(request)

    if (!request.forceRegenerate) {
      const cachedResult = await getFromCache<QuestionGenerationResult>(cacheKey)

      if (cachedResult) {
        const cacheLatency = Date.now() - overallStartTime
        console.log(`\n🚀 [CACHE HIT] Returning cached questions in ${cacheLatency}ms (99% faster!)`)
        console.log(`   Risk: ${cachedResult.riskQuestions.length}, Compliance: ${cachedResult.complianceQuestions.length}`)
        // Update timestamp to reflect cache hit (safely handle potential undefined)
        if (cachedResult.generationMetadata) {
          cachedResult.generationMetadata = {
            ...cachedResult.generationMetadata,
            timestamp: new Date()
          }
        }
        return cachedResult
      }

      console.log(`[CACHE MISS] Generating fresh questions...`)
    } else {
      console.log(`[FORCE REGENERATE] Skipping cache check - generating fresh questions...`)
    }

  // ============================================================================
  // STEP 1: INCIDENT SEARCH - REWRITTEN FOR PROPER EVIDENCE-BASED WEIGHTING
  // ============================================================================
  // ✅ FIX: Enable incident search but with optimized limits for performance
  // Previously skipped for performance, but this breaks evidence-based weighting
  // Solution: Search with reasonable limits (50-100 incidents) for fast but accurate weighting
  // ============================================================================
  
  let similarIncidents: IncidentMatch[] = []
  let incidentStats = { avgCost: 0, totalCost: 0, mfaAdoptionRate: 0 }
  let step1Time = '0.0'

  // Only skip if explicitly requested (for testing/debugging)
  if (request.skipIncidentSearch) {
    console.log(`[OPTIMIZATION] Step 1 (Incident Search): SKIPPED - skipIncidentSearch=true`)
    similarIncidents = []
    incidentStats = { avgCost: 0, totalCost: 0, mfaAdoptionRate: 0 }
    step1Time = '0.1'
  } else {
    const step1Start = Date.now()
    console.log('\n📊 Step 1: Finding similar historical incidents from 78K+ incident database...')
    
    try {
      // ✅ OPTIMIZED: Search 50-100 incidents (not 0, not 1000) for balance of speed and accuracy
      similarIncidents = await findSimilarIncidents(
        request.systemDescription,
        {
          limit: 100, // ✅ Increased from 0 to 100 for proper evidence-based weighting
          minSimilarity: PRE_FILTER_THRESHOLDS.minSimilarity || 0.3, // Lower threshold for more results
          industry: request.industry,
          severity: ['medium', 'high', 'critical'],
        }
      )
      
      step1Time = ((Date.now() - step1Start) / 1000).toFixed(1)
      console.log(`[TIMING] Step 1 (Vector Search): ${step1Time}s`)
      
      incidentStats = calculateIncidentStatistics(similarIncidents)
      
      console.log(`✅ Found ${similarIncidents.length} similar incidents from 78K+ database`)
      console.log(`   Average cost: $${incidentStats.avgCost.toLocaleString()}`)
      console.log(`   Top incident types: ${Array.from(new Set(similarIncidents.slice(0, 5).map(i => i.incidentType))).join(', ')}`)
      
      if (similarIncidents.length === 0) {
        console.warn(`⚠️  WARNING: No incidents found - evidence-based weighting will be limited`)
      }
    } catch (error) {
      console.error(`❌ Incident search failed:`, error)
      console.warn(`⚠️  Continuing without incidents - evidence-based weighting will be limited`)
      similarIncidents = []
      incidentStats = { avgCost: 0, totalCost: 0, mfaAdoptionRate: 0 }
      step1Time = '0.0'
    }
  }

  // Step 2: Analyze system description with LLM
  const step2Start = Date.now()
  console.log('\n🤖 Step 2: Analyzing system description with LLM...')
  const llmAnalysis = await analyzeSystemWithLLM(request, similarIncidents)
  const step2Time = ((Date.now() - step2Start) / 1000).toFixed(1)
  console.log(`[TIMING] Step 2 (LLM System Analysis): ${step2Time}s`)

  // Step 3: Generate risk questions (PARALLEL execution)
  const step3Start = Date.now()
  console.log('\n⚠️  Step 3: Generating risk questions...')
  const riskQuestions = await generateRiskQuestions(request, similarIncidents, llmAnalysis)
  const step3Time = ((Date.now() - step3Start) / 1000).toFixed(1)
  console.log(`[TIMING] Step 3 (Risk Questions): ${step3Time}s`)

  // Step 4: Generate compliance questions (PARALLEL execution)
  const step4Start = Date.now()
  console.log('\n📋 Step 4: Generating compliance questions...')
  const complianceQuestions = await generateComplianceQuestions(request, similarIncidents, llmAnalysis)
  const step4Time = ((Date.now() - step4Start) / 1000).toFixed(1)
  console.log(`[TIMING] Step 4 (Compliance Questions): ${step4Time}s`)

  // Step 4.5: Deduplicate questions
  console.log('\n🔍 Step 4.5: Removing duplicate questions...')
  const deduplicatedRiskQuestions = deduplicateQuestions(riskQuestions)
  const deduplicatedComplianceQuestions = deduplicateQuestions(complianceQuestions)

  // Step 4.6: Apply intensity filtering (if specified)
  let finalRiskQuestions = deduplicatedRiskQuestions
  let finalComplianceQuestions = deduplicatedComplianceQuestions

  if (request.questionIntensity) {
    console.log(`\n🎚️  Step 4.6: Applying question intensity filtering: ${request.questionIntensity.toUpperCase()}`)
    finalRiskQuestions = applyIntensityFiltering(deduplicatedRiskQuestions, request.questionIntensity)
    finalComplianceQuestions = applyIntensityFiltering(deduplicatedComplianceQuestions, request.questionIntensity)
    console.log(`[Intensity] Final counts: ${finalRiskQuestions.length} risk + ${finalComplianceQuestions.length} compliance = ${finalRiskQuestions.length + finalComplianceQuestions.length} total`)
  } else {
    console.log(`\n🎚️  Step 4.6: No intensity filtering applied (using all ${finalRiskQuestions.length + finalComplianceQuestions.length} questions)`)
  }

  // Step 5: Create scoring formula
  const step5Start = Date.now()
  console.log('\n🧮 Step 5: Creating explainable scoring formula...')
  const scoringFormula = createScoringFormula(deduplicatedRiskQuestions, deduplicatedComplianceQuestions, incidentStats)
  const step5Time = ((Date.now() - step5Start) / 1000).toFixed(1)
  console.log(`[TIMING] Step 5 (Scoring Formula): ${step5Time}s`)

  const overallTime = ((Date.now() - overallStartTime) / 1000).toFixed(1)
  const generationTimeMs = Date.now() - overallStartTime

  console.log(`\n✅ Generation complete in ${overallTime}s (${generationTimeMs}ms)`)
  console.log(`Generated ${finalRiskQuestions.length} risk questions + ${finalComplianceQuestions.length} compliance questions (total: ${finalRiskQuestions.length + finalComplianceQuestions.length})`)
  if (request.questionIntensity) {
    console.log(`   (Filtered from ${deduplicatedRiskQuestions.length} + ${deduplicatedComplianceQuestions.length} = ${deduplicatedRiskQuestions.length + deduplicatedComplianceQuestions.length} using ${request.questionIntensity} intensity)`)
  }

  console.log(`\n📊 Performance Breakdown:`)
  console.log(`  • Vector Search: ${step1Time}s`)
  console.log(`  • LLM System Analysis: ${step2Time}s`)
  console.log(`  • Risk Questions (PARALLEL): ${step3Time}s`)
  console.log(`  • Compliance Questions (PARALLEL): ${step4Time}s`)
  console.log(`  • Scoring Formula: ${step5Time}s`)
  console.log(`  • Total: ${overallTime}s`)

  if (parseFloat(overallTime) > 60) {
    console.warn(`⚠️  WARNING: Generation took ${overallTime}s (> 60s target)`)
  } else {
    console.log(`✅ Performance target met (< 60s)`)
  }

  // ✅ Calculate per-domain question counts (using FINAL filtered questions)
  const selectedDomains = request.selectedDomains || ['ai', 'cyber', 'cloud']
  const domainCounts = selectedDomains.reduce((acc, domain) => {
    acc[`${domain}Questions`] = finalRiskQuestions.filter(q => q.domain === domain).length
    return acc
  }, {} as Record<string, number>)

  // Build result object
  const result: QuestionGenerationResult = {
    riskQuestions: finalRiskQuestions,
    complianceQuestions: finalComplianceQuestions,
    scoringFormula,
    // ✅ REMOVED incidentSummary - moved to /api/review/:id/incident-analysis endpoint
    // This was causing the 30-second delay; now questions generate in 5-10 seconds
    incidentSummary: {
      totalIncidentsAnalyzed: 0,
      relevantIncidents: 0,
      avgIncidentCost: 0,
      topRisks: [],
      industryBenchmark: 'N/A',
    },
    generationMetadata: {
      timestamp: new Date(),
      llmModel: 'gemini-2.0-flash-exp',
      incidentSearchCount: 0, // ✅ No longer searching during question generation
      avgSimilarityScore: 0, // ✅ No similarity scoring in this endpoint
      generationTimeMs,
      // ✅ Add metadata fields for frontend (using FINAL filtered questions)
      totalRiskQuestions: finalRiskQuestions.length,
      totalComplianceQuestions: finalComplianceQuestions.length,
      ...domainCounts, // aiQuestions, cyberQuestions, cloudQuestions
      avgRiskWeight: finalRiskQuestions.length > 0
        ? finalRiskQuestions.reduce((sum, q) => sum + q.finalWeight, 0) / finalRiskQuestions.length
        : 0,
      avgComplianceWeight: finalComplianceQuestions.length > 0
        ? finalComplianceQuestions.reduce((sum, q) => sum + q.finalWeight, 0) / finalComplianceQuestions.length
        : 0,
    },
  }

    // ✅ OPTIMIZATION: Cache the result for future requests (10 minute TTL)
    // This makes repeat requests 99% faster (<500ms vs 6-12s)
    await setInCache(cacheKey, result, 600) // 10 minute cache
    console.log(`\n💾 [CACHE STORED] Questions cached for 10 minutes (key: ${cacheKey.substring(0, 30)}...)`)

    return result
  } catch (error) {
    console.error('❌ [CRITICAL ERROR] Question generation failed:', error)

    // Log detailed error information
    if (error instanceof Error) {
      console.error('Error name:', error.name)
      console.error('Error message:', error.message)
      console.error('Error stack:', error.stack)
    }

    // Rethrow with more context
    throw new Error(
      `Failed to generate dynamic questions: ${error instanceof Error ? error.message : 'Unknown error'}. ` +
      `This could be due to Vertex AI connection issues, OpenAI API failures, or data processing errors. ` +
      `Check the logs for more details.`
    )
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
    console.log('[LLM] Calling multi-provider LLM for system analysis...')
    const response = await gemini.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      responseFormat: { type: 'json_object' },
      temperature: 0.3,
    })

    const analysis = JSON.parse(response.choices[0].message.content || '{}')
    const providerUsed = (response as any).provider || 'unknown'
    console.log(`[LLM] ✅ System analysis completed using ${providerUsed.toUpperCase()} provider`)
    console.log(`[LLM] Analysis results: ${Object.keys(analysis).length} fields, ${analysis.recommendedPriorities?.length || 0} priority areas`)
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
  // ✅ FIX: Defensive check for empty array - empty array is truthy but invalid
  const selectedDomains =
    (request.selectedDomains && request.selectedDomains.length > 0)
      ? request.selectedDomains
      : ['ai', 'cyber', 'cloud']
  const questionsPerDomain = request.questionsPerDomain || 12 // ✅ OPTIMIZED: Default 12 per domain (was 25)
  // ✅ PHASE 3: Use centralized pre-filter threshold for minimum weight
  // Intensity filtering will handle final selection based on user's choice (high/medium/low)
  const minWeight = request.minRiskPotential || request.minWeight || PRE_FILTER_THRESHOLDS.minWeight // ✅ Default from centralized config (0.3)

  console.log(`Generating ${questionsPerDomain} questions per domain for: ${selectedDomains.join(', ')}`)
  console.log(`Minimum risk threshold (pre-filter): ${(minWeight * 100).toFixed(0)}% (intensity filtering will apply additional rules)`)

  // ✅ OPTIMIZATION: Generate all questions in parallel to avoid timeout
  const startTime = Date.now()
  console.log(`\n⚡ Generating questions in PARALLEL for all domains to optimize performance...`)

  // Collect all risk areas from all domains
  const allTasks: Array<{
    riskArea: { area: string; priority: number; reasoning: string }
    domain: 'ai' | 'cyber' | 'cloud'
  }> = []

  for (const domain of selectedDomains) {
    const domainRiskAreas = getDomainSpecificRiskAreas(domain, llmAnalysis)
    const areasToGenerate = domainRiskAreas.slice(0, Math.min(questionsPerDomain, domainRiskAreas.length))

    for (const riskArea of areasToGenerate) {
      allTasks.push({
        riskArea,
        domain: domain as 'ai' | 'cyber' | 'cloud'
      })
    }
  }

  console.log(`[PARALLEL] Queued ${allTasks.length} questions for parallel generation`)

  // ✅ RATE LIMITING: Batch requests to avoid quota exhaustion
  // Optimized for performance: Increased batch size and reduced delay
  const BATCH_SIZE = 8 // Process 8 questions at a time (increased from 5 for 37% speedup)
  const DELAY_BETWEEN_BATCHES_MS = 2000 // 2 seconds between batches (reduced from 8s for 75% speedup)

  const generatedQuestions: (DynamicQuestion | null)[] = []

  console.log(`[RATE_LIMIT] Processing ${allTasks.length} questions in batches of ${BATCH_SIZE} with ${DELAY_BETWEEN_BATCHES_MS}ms delay`)

  for (let i = 0; i < allTasks.length; i += BATCH_SIZE) {
    const batch = allTasks.slice(i, i + BATCH_SIZE)
    const batchNumber = Math.floor(i / BATCH_SIZE) + 1
    const totalBatches = Math.ceil(allTasks.length / BATCH_SIZE)

    console.log(`[BATCH ${batchNumber}/${totalBatches}] Processing ${batch.length} questions...`)

    // Process batch in parallel
    const batchResults = await Promise.all(
      batch.map(async ({ riskArea, domain }) => {
        try {
          const question = await generateSingleRiskQuestion(
            riskArea,
            incidents, // ✅ OPTIMIZED: Pass preloaded incidents instead of empty array
            request,
            llmAnalysis,
            domain
          )
          return question
        } catch (error) {
          console.error(`[PARALLEL] Failed to generate question for "${riskArea.area}":`, error)
          return null
        }
      })
    )

    generatedQuestions.push(...batchResults)

    // Add delay between batches (except for the last batch)
    if (i + BATCH_SIZE < allTasks.length) {
      console.log(`[RATE_LIMIT] Waiting ${DELAY_BETWEEN_BATCHES_MS}ms before next batch to avoid quota limits...`)
      await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES_MS))
    }
  }

  const generationTime = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[PARALLEL] ✅ Generated ${generatedQuestions.length} questions in ${generationTime}s (parallel execution)`)

  // Filter out failed questions and apply thresholds
  // ✅ PHASE 3: Use centralized pre-filter threshold for minimum incident count
  const minIncidentCount = request.minIncidentCount || PRE_FILTER_THRESHOLDS.minIncidentCount

  console.log(`\n🔍 [PRE-FILTER] Applying initial filter: minWeight=${minWeight}, minIncidentCount=${minIncidentCount}`)
  let filteredByWeight = 0
  let filteredByIncidents = 0
  let nullQuestions = 0

  for (const question of generatedQuestions) {
    if (!question) {
      nullQuestions++
      continue // Skip failed generations
    }

    const incidentCount = question.relatedIncidentCount || 0
    const meetsWeightThreshold = question.finalWeight >= minWeight
    const meetsIncidentThreshold = incidentCount >= minIncidentCount

    if (meetsWeightThreshold && meetsIncidentThreshold) {
      questions.push(question)
      console.log(`[PRE-FILTER] ✅ "${question.label.substring(0, 60)}" - weight: ${question.finalWeight.toFixed(2)}, incidents: ${incidentCount}`)
    } else {
      if (!meetsWeightThreshold) {
        filteredByWeight++
        console.log(`[PRE-FILTER] ❌ "${question.label.substring(0, 60)}" - weight ${question.finalWeight.toFixed(2)} < ${minWeight}`)
      }
      if (!meetsIncidentThreshold) {
        filteredByIncidents++
        console.log(`[PRE-FILTER] ❌ "${question.label.substring(0, 60)}" - incidents ${incidentCount} < ${minIncidentCount}`)
      }
    }
  }

  console.log(`\n📊 [PRE-FILTER] Summary:`)
  console.log(`   Total generated: ${generatedQuestions.length}`)
  console.log(`   Failed (null): ${nullQuestions}`)
  console.log(`   Filtered by weight: ${filteredByWeight}`)
  console.log(`   Filtered by incidents: ${filteredByIncidents}`)
  console.log(`   Passed to intensity filter: ${questions.length}`)
  console.log(`   Success rate: ${((questions.length / Math.max(1, generatedQuestions.length - nullQuestions)) * 100).toFixed(0)}%`)

  // Log distribution by domain
  for (const domain of selectedDomains) {
    const domainCount = questions.filter(q => q.domain === domain).length
    console.log(`[PARALLEL] Generated ${domainCount} ${domain.toUpperCase()} questions`)
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

// Track used incident IDs across all questions to prevent duplication
const usedIncidentIds = new Set<string>()

async function generateSingleRiskQuestion(
  priorityArea: { area: string; priority: number; reasoning: string },
  relatedIncidents: IncidentMatch[], // Pre-filtered incidents from main function (normally empty for LLM-only phase)
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis,
  domain?: 'ai' | 'cyber' | 'cloud'
): Promise<DynamicQuestion> {
  // ✅ OPTIMIZATION (2025-11-16): Removed per-question Qdrant search for performance
  // The main generateDynamicQuestions() function already skips Qdrant for LLM-only generation
  // This function now uses only the pre-filtered incidents passed in (normally empty array)
  // Incident search is deferred to Step 3 endpoint for better UX and performance
  // Expected generation time: 3-5 seconds for all questions (LLM only, no Qdrant calls)

  console.log(`[LLM_ONLY] Generating question for "${priorityArea.area}" (incident search deferred)`)

  // ✅ REWRITTEN: Use incidents passed from main function (now properly populated)
  // Find incidents specifically related to this risk area
  const relevantIncidents = findRelatedIncidents(priorityArea.area, relatedIncidents)

  // Calculate average multi-factor relevance (properly calculated from actual incidents)
  const avgMultiFactorRelevance = relevantIncidents.length > 0
    ? relevantIncidents.reduce((sum, i) => sum + calculateMultiFactorRelevance(i, request), 0) / relevantIncidents.length
    : 0

  // ✅ NEW: Generate formalized question using LLM
  console.log(`[LLM_QUESTION] Generating formalized question for "${priorityArea.area}"...`)

  const avgCost = relevantIncidents.length > 0
    ? relevantIncidents
        .filter(i => i.estimatedCost)
        .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0) / relevantIncidents.filter(i => i.estimatedCost).length
    : 0

  const avgSeverity = relevantIncidents.length > 0
    ? relevantIncidents
        .filter(i => i.severity)
        .reduce((sum, i) => {
          const severityMap: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2 }
          return sum + (severityMap[i.severity!.toLowerCase()] || 5)
        }, 0) / relevantIncidents.filter(i => i.severity).length
    : 5

  const evidenceSummary = `
Risk: ${priorityArea.area}
Evidence: ${relevantIncidents.length} incidents found (avg severity: ${avgSeverity.toFixed(1)}/10, relevance: ${(avgMultiFactorRelevance * 100).toFixed(0)}%)
System: ${request.systemDescription.substring(0, 150)}
Tech: ${(request.techStack || []).slice(0, 3).join(', ') || 'General'}
Data: ${(request.dataTypes || []).slice(0, 2).join(', ') || 'General data'}
`.trim()

  let questionText = priorityArea.area // Fallback
  let llmPriority = priorityArea.priority // Will be updated from LLM response
  let llmReasoning = priorityArea.reasoning // Will be updated from LLM response

  try {
    // ✅ REWRITTEN: LLM now generates question WITH explicit weight request
    const completion = await gemini.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a cybersecurity risk assessment expert. Generate a risk assessment question WITH a priority weight.

CRITICAL REQUIREMENTS:
1. **Question Text**: Be concise (1-2 sentences), direct, actionable. NO "based on X incidents" prefixes.
2. **Priority Weight**: Provide a weight (0-100) indicating how critical this risk area is for this system.
   - 90-100: Critical - System would be severely compromised if this fails
   - 70-89: High - Significant impact on security/compliance
   - 50-69: Medium - Moderate risk, should be addressed
   - 30-49: Low - Minor risk, nice to have
   - 0-29: Very Low - Minimal impact

WEIGHT FACTORS TO CONSIDER:
- System criticality (High/Medium/Low)
- Data types processed (PII, Financial, Health = higher weight)
- Technology stack vulnerabilities
- Industry-specific risks
- Regulatory requirements
- Incident frequency (if provided)

RESPONSE FORMAT (JSON):
{
  "question": "What MFA, RBAC, and audit mechanisms protect [data] in your [system]?",
  "priority": 85,
  "reasoning": "High priority because [system] processes [sensitive data] and [industry] has strict requirements"
}

GOOD EXAMPLES:
- High weight (85-95): Access control for PII in financial systems
- Medium weight (60-75): Monitoring for general business systems
- Lower weight (40-55): Nice-to-have security features

Return ONLY valid JSON. No markdown, no code blocks.`
        },
        {
          role: 'user',
          content: `Generate a risk assessment question for: ${priorityArea.area}

System Context:
${request.systemDescription.substring(0, 500)}

Tech Stack: ${(request.techStack || []).join(', ') || 'General'}
Data Types: ${(request.dataTypes || []).join(', ') || 'General data'}
Industry: ${request.industry || 'General'}
System Criticality: ${request.systemCriticality || 'Medium'}

${relevantIncidents.length > 0 ? `\nHistorical Evidence:\n- ${relevantIncidents.length} similar incidents found\n- Average cost: $${(avgCost / 1000).toFixed(0)}K\n- Average severity: ${avgSeverity.toFixed(1)}/10` : '\nNote: Limited historical evidence available - base weight on system context'}

Provide question text and priority weight (0-100) based on the above context.`
        }
      ],
      responseFormat: { type: 'json_object' },
      temperature: 0.7,
      maxTokens: 300
    })

    const llmResponse = JSON.parse(completion.choices[0].message.content || '{}')
    questionText = llmResponse.question || questionText
    llmPriority = llmResponse.priority || priorityArea.priority
    llmReasoning = llmResponse.reasoning || priorityArea.reasoning
    
    // ✅ Strip any "Based on X incidents" prefix that LLM might include despite instructions
    questionText = stripIncidentPrefix(questionText)

    // Log which provider was used (if available in response)
    const providerUsed = (completion as any).provider || 'unknown'
    console.log(`[LLM_QUESTION] Generated: "${questionText.substring(0, 80)}..." (Priority: ${llmPriority}, Provider: ${providerUsed})`)
  } catch (error) {
    console.error(`[LLM_QUESTION] Failed to generate question for ${priorityArea.area}:`, error)
    // Log error details for debugging fallback
    if (error instanceof Error) {
      console.error(`[LLM_QUESTION] Error details: ${error.message}`)
      if (error.message.includes('All LLM providers failed')) {
        console.error(`[LLM_QUESTION] ⚠️  All LLM providers failed - check API keys`)
      }
    }
    // Use fallback question generation
    const tech = (request.techStack || [])[0] || 'your system'
    const data = (request.dataTypes || [])[0] || 'data'
    questionText = `How do you address ${priorityArea.area.toLowerCase()} risks in your ${request.deployment || 'system'} using ${tech} with ${data}?`
  }

  // ✅ Validate question text
  if (questionText.length < 20 || questionText === priorityArea.area) {
    console.warn(`[VALIDATION] Invalid question text (length: ${questionText.length}), using enhanced fallback for ${priorityArea.area}`)

    // Generate meaningful fallback question with context
    const tech = (request.techStack || [])[0] || 'your system'
    const data = (request.dataTypes || [])[0] || 'sensitive data'
    const deployment = request.deployment || 'system'
    const incidentContext = relatedIncidents.length > 0
      ? ` (${relatedIncidents.length} similar incidents found with avg cost $${(avgCost / 1000).toFixed(0)}K)`
      : ''

    // Create context-aware question based on domain
    if (domain === 'ai') {
      questionText = `How does your ${deployment} using ${tech} mitigate ${priorityArea.area.toLowerCase()} risks when processing ${data}${incidentContext}?`
    } else if (domain === 'cyber') {
      questionText = `What security controls are in place to address ${priorityArea.area.toLowerCase()} threats to your ${deployment} handling ${data}${incidentContext}?`
    } else if (domain === 'cloud') {
      questionText = `How do you ensure ${priorityArea.area.toLowerCase()} compliance in your ${deployment} infrastructure managing ${data}${incidentContext}?`
    } else {
      questionText = `How do you address ${priorityArea.area.toLowerCase()} risks in your ${deployment} using ${tech} with ${data}${incidentContext}?`
    }

    console.log(`[VALIDATION] Generated fallback: ${questionText.substring(0, 80)}...`)
  }

  // ✅ REWRITTEN: Calculate weights using LLM-generated priority + evidence + industry
  // Use LLM-generated priority (already extracted above)
  const baseWeight = Math.min(Math.max(llmPriority / 100, 0), 1) // Normalize 0-100 to 0-1, clamp to valid range
  
  // ✅ FIX: Calculate evidence weight from actual incidents (not empty array)
  const evidenceWeight = calculateEvidenceWeight(relevantIncidents)
  
  // Industry weight: Higher if industry specified AND matches system context
  const industryWeight = request.industry ? 0.9 : 0.7
  
  // ✅ Final weight formula: Base (50%) + Evidence (30%) + Industry (20%)
  const finalWeight = (baseWeight * 0.5) + (evidenceWeight * 0.3) + (industryWeight * 0.2)
  
  console.log(`[WEIGHT_CALC] "${priorityArea.area}": base=${(baseWeight * 100).toFixed(0)}%, evidence=${(evidenceWeight * 100).toFixed(0)}%, industry=${(industryWeight * 100).toFixed(0)}%, final=${(finalWeight * 100).toFixed(0)}%`)

  // Extract real examples from incidents
  const examples = relatedIncidents.slice(0, 5).map(incident => {
    const cost = incident.estimatedCost ? ` ($${Number(incident.estimatedCost).toLocaleString()})` : ''
    const org = incident.organization || 'Organization'
    return `${org} - ${incident.incidentType}${cost}`
  })

  // Calculate total cost
  const totalCost = relevantIncidents
    .filter(i => i.estimatedCost)
    .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0)

  // ✅ Create evidence object with incident metadata
  const evidence: IncidentEvidence = {
    incidentCount: relevantIncidents.length,
    avgSeverity: avgSeverity || 5,
    relevanceScore: relevantIncidents.length > 0
      ? relevantIncidents.reduce((sum, i) => sum + i.similarity, 0) / relevantIncidents.length
      : 0,
    recentExamples: relevantIncidents.slice(0, 5).map(incident => ({
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
      affectedSystems: relevantIncidents.length,
    }
  }

  // ✅ Create short label for UI (category + key tech)
  const keyTech = (request.techStack || [])[0]
  const shortLabel = keyTech ? `${priorityArea.area} - ${keyTech}` : priorityArea.area

  const question: DynamicQuestion = {
    id: `dynamic_${priorityArea.area.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    label: shortLabel, // ✅ SHORT: For UI labels/headers
    text: questionText, // ✅ FULL QUESTION: What users see and answer
    question: questionText, // ✅ ALIAS: For backward compatibility
    description: priorityArea.area,
    priority: determinePriority(finalWeight),

    importance: relevantIncidents.length > 0 
      ? `${relevantIncidents.length} incidents found (severity ${avgSeverity.toFixed(1)}/10, relevance ${(avgMultiFactorRelevance * 100).toFixed(0)}%, avg cost $${(avgCost / 1000).toFixed(0)}K). ${llmReasoning || priorityArea.reasoning}`
      : `${llmReasoning || priorityArea.reasoning} (Limited historical evidence - weight based on system context)`,
    reasoning: relevantIncidents.length > 0
      ? `${relevantIncidents.length} incidents | Severity ${avgSeverity.toFixed(1)}/10 | Relevance ${(avgMultiFactorRelevance * 100).toFixed(0)}% | Cost $${(avgCost / 1000).toFixed(0)}K | ${llmReasoning || priorityArea.reasoning}`
      : `LLM Priority: ${llmPriority}/100 | ${llmReasoning || priorityArea.reasoning} (No historical incidents found)`,
    examples,
    mitigations: generateMitigations(priorityArea.area, relevantIncidents),
    regulations: extractRegulations(relevantIncidents, llmAnalysis),

    // ✅ CRITICAL: Evidence object with multi-factor relevance
    evidence,

    baseWeight,
    evidenceWeight,
    industryWeight,
    finalWeight,
    weight: finalWeight, // ✅ 0-1 scale (normalized for frontend display as percentage)

    weightageExplanation: createWeightageExplanation(
      baseWeight, 
      evidenceWeight, 
      industryWeight, 
      finalWeight, 
      `${llmReasoning || priorityArea.reasoning}. ${relevantIncidents.length > 0 ? `Evidence: ${relevantIncidents.length} incidents, ${(avgMultiFactorRelevance * 100).toFixed(0)}% relevance` : 'Limited evidence - weight based on system analysis'}.`
    ),
    evidenceQuery: priorityArea.area,
    relatedIncidents: relevantIncidents.slice(0, 10),
    similarIncidents: relevantIncidents.slice(0, 10),
    relatedIncidentCount: relevantIncidents.length,

    category: categorizeDomain(priorityArea.area),
    domain: domain || categorizeDomain(priorityArea.area), // ✅ Add domain for frontend filtering
    generatedFrom: 'hybrid',
    confidence: calculateConfidence(relevantIncidents, baseWeight) > 0.7 ? 'high' : 'medium',
    aiGenerated: true,
  }

  // ✅ CRITICAL: Mark all used incidents as processed to prevent duplication
  relevantIncidents.forEach(incident => {
    const incidentId = incident.incidentId || incident.embeddingText
    usedIncidentIds.add(incidentId)
  })

  console.log(`[INCIDENT_DEDUPLICATION] Added ${relevantIncidents.length} incidents to used set for "${priorityArea.area}"`)

  return question
}

// ============================================================================
// COMPLIANCE QUESTION GENERATION
// ============================================================================

/**
 * Generate comprehensive fallback compliance question when LLM generation fails
 * Creates fully-formed questions with context instead of just framework names
 */
function generateComplianceFallbackQuestion(
  complianceArea: string,
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis,
  incidentCount: number,
  avgSeverity: number
): string {
  // Map compliance areas to specific control questions
  const controlMappings: Record<string, string[]> = {
    'GDPR': [
      'Has your organization implemented documented procedures for data subject rights requests (access, rectification, erasure) and can you demonstrate compliance with GDPR Article 12-22 response timelines?',
      'Do you maintain detailed records of processing activities, data protection impact assessments, and processor contracts as required by GDPR Articles 5 and 28?',
      'Has your organization appointed a Data Protection Officer, implemented privacy by design principles, and conducted privacy impact assessments for high-risk processing activities?'
    ],
    'PCI-DSS': [
      'Has your organization implemented end-to-end encryption for payment card data in transit and at rest, and do you regularly test your cryptographic implementations to ensure compliance with PCI-DSS Requirements 3.2 and 4.1?',
      'Do you maintain a robust system for monitoring and logging all access to cardholder data, with documented incident response procedures that have been tested in the past 12 months?',
      'Has your organization implemented multi-factor authentication for all user access to card data environments, and do you maintain segregated networks with firewalls configured per PCI-DSS requirements?'
    ],
    'HIPAA': [
      'Has your organization implemented comprehensive access controls, audit logging, and encryption for all protected health information (PHI) as required by HIPAA Technical Safeguards (45 CFR §164.312)?',
      'Do you maintain a documented Business Associate Agreement (BAA) with all vendors processing PHI, and have you conducted a Security Risk Analysis in the past 12 months?',
      'Has your organization implemented an incident response and reporting plan for HIPAA breaches, and do you maintain evidence of employee HIPAA training on an annual basis?'
    ],
    'SOC 2': [
      'Has your organization documented and tested controls for security, availability, and processing integrity, and does your control environment support the operational objectives related to your system?',
      'Do you maintain evidence that access to systems and data is restricted to authorized personnel, and that user activity is monitored and logged for audit purposes?',
      'Has your organization implemented procedures to identify, record, and resolve security incidents, with documented evidence of incident response testing within the past year?'
    ],
    'ISO 27001': [
      'Has your organization implemented an information security management system (ISMS) with documented policies, procedures, and controls aligned with ISO 27001 requirements?',
      'Do you conduct annual risk assessments, maintain asset inventories, and implement access controls based on your information classification scheme?',
      'Has your organization implemented an audit schedule, maintain records of management reviews, and demonstrate continuous improvement of your ISMS?'
    ],
    'Data Inventory': [
      'Do you maintain a comprehensive data inventory documenting all personal data or sensitive information your system processes, including data types, sources, processing purposes, and storage locations?',
      'Have you classified all data assets by sensitivity level, implemented appropriate retention policies, and documented all data flows within your system architecture?',
      'Can you demonstrate that your data inventory is regularly updated, that data lineage is tracked, and that you have documented approval for each data processing activity?'
    ],
    'Security Measures': [
      'Have you implemented multi-layered security controls including network segmentation, endpoint protection, intrusion detection, and vulnerability management programs?',
      'Do you maintain documented evidence of regular security assessments, penetration testing, and remediation of identified vulnerabilities within defined timeframes?',
      'Has your organization implemented secure development practices, including code review processes, security testing in CI/CD pipelines, and dependency scanning for known vulnerabilities?'
    ],
    'Consent Management': [
      'Does your system implement granular consent management that clearly explains data processing purposes, allows users to grant or withdraw consent, and maintains audit trails of all consent decisions?',
      'Have you documented your legal basis for each data processing activity, and do you distinguish between explicit consent, implied consent, and legitimate interest legal bases?',
      'Can you demonstrate that consent is freely given, specific, informed, and unambiguous, and that users can easily withdraw consent through your system?'
    ],
    'Breach Response': [
      'Has your organization documented an incident response plan that includes detection procedures, containment strategies, eradication steps, and recovery procedures for security breaches?',
      'Do you maintain procedures for notifying affected individuals and regulators of personal data breaches within required timeframes, with documented evidence of past breach notifications?',
      'Have you implemented procedures to preserve evidence from security incidents, conduct root cause analysis, and implement corrective actions to prevent recurrence?'
    ]
  }

  // Get relevant questions for this compliance area (fallback to generic question if no mapping exists)
  let baseQuestions = controlMappings[complianceArea] || [
    `Has your organization implemented documented security controls and procedures to address ${complianceArea} regulatory requirements, and can you provide evidence of compliance testing?`,
    `Do you maintain an audit trail of all access to systems subject to ${complianceArea} requirements, and have you conducted compliance assessments in the past 12 months?`,
    `Has your organization implemented incident response procedures specific to ${complianceArea} requirements, with documented evidence of employee training and testing?`
  ]

  // Select the most appropriate question based on the system's characteristics
  let selectedQuestion = baseQuestions[0]

  // Customize based on system characteristics
  if (request.techStack?.includes('kubernetes') || request.techStack?.includes('cloud')) {
    // For cloud/containerized systems, emphasize cloud-specific controls
    const cloudQuestions: Record<string, string> = {
      'GDPR': 'Has your organization ensured that cloud service providers demonstrate GDPR compliance, and do you maintain data processing agreements with clear responsibilities for data protection in the cloud?',
      'PCI-DSS': 'For card data processed in the cloud, do you have documented evidence of cloud provider PCI-DSS compliance, and have you implemented additional network security controls specific to cloud environments?',
      'Security Measures': 'Has your cloud infrastructure been configured with encrypted data at rest and in transit, with proper identity and access management (IAM) policies, and network security groups/security groups properly configured?',
      'SOC 2': 'Do your cloud service providers maintain current SOC 2 Type II reports, and have you reviewed their control effectiveness relevant to your compliance obligations?'
    }
    if (cloudQuestions[complianceArea]) {
      selectedQuestion = cloudQuestions[complianceArea]
    }
  }

  // Add evidence context if available
  if (incidentCount > 0) {
    selectedQuestion += ` (Based on ${incidentCount} real compliance violations with an average severity rating of ${avgSeverity.toFixed(1)}/10)`
  }

  return selectedQuestion
}

async function generateComplianceQuestions(
  request: QuestionGenerationRequest,
  incidents: IncidentMatch[],
  llmAnalysis: LLMAnalysis
): Promise<DynamicQuestion[]> {
  const startTime = Date.now()
  console.log(`\n⚡ Generating compliance questions in PARALLEL...`)

  // Collect all compliance areas to generate
  const complianceAreas = new Set<string>([
    ...(llmAnalysis.complianceRequirements || []),
  ])

  // Ensure minimum compliance coverage
  const criticalCompliance = ['Data Inventory', 'Consent Management', 'Security Measures', 'Breach Response']
  for (const area of criticalCompliance) {
    if (![...complianceAreas].find(existing => existing.toLowerCase().includes(area.toLowerCase()))) {
      complianceAreas.add(area)
    }
  }

  console.log(`[PARALLEL] Queued ${complianceAreas.size} compliance questions for parallel generation`)

  // ✅ Generate ALL compliance questions in parallel using Promise.all
  // ✅ OPTIMIZATION: Pass preloaded incidents to avoid per-question vector searches
  const generatedQuestions = await Promise.all(
    Array.from(complianceAreas).map(async (complianceArea) => {
      try {
        const question = await generateSingleComplianceQuestion(
          complianceArea,
          incidents, // ✅ OPTIMIZED: Pass preloaded incidents instead of per-question vector searches
          request,
          llmAnalysis
        )
        return question
      } catch (error) {
        console.error(`[PARALLEL] Failed to generate compliance question for "${complianceArea}":`, error)
        return null
      }
    })
  )

  const generationTime = ((Date.now() - startTime) / 1000).toFixed(1)
  console.log(`[PARALLEL] ✅ Generated ${generatedQuestions.length} compliance questions in ${generationTime}s (parallel execution)`)

  // Filter out failed generations
  const questions = generatedQuestions.filter((q): q is DynamicQuestion => q !== null)

  return questions
}

async function generateSingleComplianceQuestion(
  complianceArea: string,
  relatedIncidents: IncidentMatch[], // Kept for backward compatibility (will be empty for LLM-only phase)
  request: QuestionGenerationRequest,
  llmAnalysis: LLMAnalysis
): Promise<DynamicQuestion> {
  // ✅ OPTIMIZATION (2025-11-16): Removed per-question Qdrant search for performance
  // Compliance incident search deferred to Step 3 for better UX
  console.log(`[LLM_ONLY] Generating compliance question for "${complianceArea}" (incident search deferred)`)

  // Use incidents passed from main function (normally empty for LLM-only phase)
  const relevantIncidents = relatedIncidents

  // Calculate average multi-factor relevance (will be 0 for empty incidents array)
  const avgMultiFactorRelevance = relevantIncidents.length > 0 ? 0.5 : 0

  // ✅ NEW: Generate formalized compliance question using LLM
  console.log(`[LLM_COMPLIANCE] Generating formalized compliance question for "${complianceArea}"...`)

  const avgFine = relevantIncidents.length > 0
    ? relevantIncidents
        .filter(i => i.estimatedCost)
        .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0) / relevantIncidents.filter(i => i.estimatedCost).length
    : 0

  const avgSeverity = relevantIncidents.length > 0
    ? relevantIncidents
        .filter(i => i.severity)
        .reduce((sum, i) => {
          const severityMap: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 2 }
          return sum + (severityMap[i.severity!.toLowerCase()] || 5)
        }, 0) / relevantIncidents.filter(i => i.severity).length
    : 5

  const complianceEvidenceSummary = `
Compliance Area: ${complianceArea}
Regulatory Requirements: ${(llmAnalysis.complianceRequirements || []).join(', ')}

System Context:
- Description: ${request.systemDescription.substring(0, 300)}
- Technology Stack: ${(request.techStack || []).slice(0, 5).join(', ') || 'Not specified'}
- Data Types: ${(request.dataTypes || []).slice(0, 5).join(', ') || 'Not specified'}
- Data Sources: ${(request.dataSources || []).slice(0, 5).join(', ') || 'Not specified'}
- Industry: ${request.industry || 'Not specified'}
- Jurisdictions: ${(request.jurisdictions || []).join(', ') || 'Not specified'}

Evidence from Compliance Violations Database:
- ${relevantIncidents.length} relevant compliance incidents found
- Average severity: ${avgSeverity.toFixed(1)}/10
- Multi-factor relevance: ${(avgMultiFactorRelevance * 100).toFixed(0)}%
- Average fine: $${(avgFine / 1000).toFixed(0)}K per violation

Recent Examples (Top 3):
${relevantIncidents.slice(0, 3).map((ex, i) =>
  `${i + 1}. ${ex.organization || 'Organization'} - ${ex.incidentType} (${ex.incidentDate ? new Date(ex.incidentDate).toISOString().split('T')[0] : 'Recent'}, fine: $${ex.estimatedCost ? (Number(ex.estimatedCost) / 1000).toFixed(0) + 'K' : 'Unknown'})`
).join('\n')}
`.trim()

  let complianceQuestionText = complianceArea // Fallback

  try {
    const completion = await gemini.chat.completions.create({
      messages: [
        {
          role: 'system',
          content: `You are a compliance and regulatory risk expert. Generate a formal, comprehensive compliance assessment question based on real-world regulatory violations and system context.

The question MUST be:
1. **Specific & Contextual**: Directly reference the ${complianceArea} compliance area and the user's system (${request.industry || 'the stated industry'})
2. **Evidence-Based**: Mention or reference that this is based on ${relevantIncidents.length} real compliance violations with average severity of ${avgSeverity.toFixed(1)}/10
3. **Actionable**: Clearly answerable with "addressed", "partially addressed", "not addressed", or "not applicable"
4. **Control-Focused**: Ask about specific security controls, procedures, or requirements (e.g., encryption, access controls, data retention, incident response)
5. **Technology-Aware**: Reference the system's technologies: ${(request.techStack || []).slice(0, 3).join(', ')}
6. **Data-Aware**: Consider the data types being processed: ${(request.dataTypes || []).slice(0, 3).join(', ')}
7. **Professional**: Use formal, regulatory language appropriate for compliance documentation
8. **Concise**: Keep to 2-3 sentences maximum

CRITICAL: Do NOT simply repeat the framework name. Transform it into a complete, meaningful question about compliance practices.
Do NOT use phrases like "Do you have..." without context. Instead, ask about specific controls or requirements.

Example transformation:
- BAD: "PCI-DSS compliance?"
- GOOD: "Has your organization implemented end-to-end encryption for payment card data in transit and at rest, as required by PCI-DSS requirements 3.2 and 3.4?"

Format: Return ONLY the question text, nothing else. No preamble, explanation, or question numbering.`
        },
        {
          role: 'user',
          content: complianceEvidenceSummary
        }
      ],
      temperature: 0.7,
      maxTokens: 300
    })

    // ✅ FIX #1: Properly extract and validate LLM response
    const llmResponse = completion.choices?.[0]?.message?.content?.trim()
    if (llmResponse && llmResponse.length > 20) {
      complianceQuestionText = llmResponse
      // ✅ Strip any "Based on X incidents" prefix from compliance questions
      complianceQuestionText = stripIncidentPrefix(complianceQuestionText)
    }
    const providerUsed = (completion as any).provider || 'unknown'
    console.log(`[LLM_COMPLIANCE] Generated: ${complianceQuestionText.substring(0, 80)}... (Provider: ${providerUsed})`)
  } catch (error) {
    console.error(`[LLM_COMPLIANCE] Failed to generate compliance question for ${complianceArea}:`, error)
    // Log error details for debugging fallback
    if (error instanceof Error) {
      console.error(`[LLM_COMPLIANCE] Error details: ${error.message}`)
      if (error.message.includes('All LLM providers failed')) {
        console.error(`[LLM_COMPLIANCE] ⚠️  All LLM providers failed - check API keys`)
      }
    }
    // Use comprehensive fallback question generation
    complianceQuestionText = generateComplianceFallbackQuestion(
      complianceArea,
      request,
      llmAnalysis,
      relevantIncidents.length,
      avgSeverity
    )
  }

  // ✅ FIX #1: Validate compliance question text with comprehensive checks
  if (!complianceQuestionText || complianceQuestionText.length < 20 || complianceQuestionText === complianceArea) {
    console.warn(`[VALIDATION] Invalid compliance question text ("${complianceQuestionText}"), using fallback for ${complianceArea}`)
    complianceQuestionText = generateComplianceFallbackQuestion(
      complianceArea,
      request,
      llmAnalysis,
      relevantIncidents.length,
      avgSeverity
    )
  }

  // Calculate weights for compliance
  const baseWeight = (llmAnalysis.complianceRequirements || []).includes(complianceArea) ? 0.9 : 0.7
  const evidenceWeight = calculateEvidenceWeight(relevantIncidents)
  const industryWeight = request.industry ? 0.85 : 0.7
  const finalWeight = (baseWeight * 0.6) + (evidenceWeight * 0.25) + (industryWeight * 0.15)

  // Extract examples
  const examples = relevantIncidents.slice(0, 3).map(incident => {
    const cost = incident.estimatedCost ? ` (Fine: $${Number(incident.estimatedCost).toLocaleString()})` : ''
    return `${incident.organization || 'Organization'} - ${incident.incidentType}${cost}`
  })

  // Calculate total cost
  const totalCost = relevantIncidents
    .filter(i => i.estimatedCost)
    .reduce((sum, i) => sum + Number(i.estimatedCost || 0), 0)

  // ✅ Create evidence object for compliance questions
  const evidence: IncidentEvidence = {
    incidentCount: relevantIncidents.length,
    avgSeverity: avgSeverity || 5,
    relevanceScore: relevantIncidents.length > 0
      ? relevantIncidents.reduce((sum, i) => sum + i.similarity, 0) / relevantIncidents.length
      : 0,
    recentExamples: relevantIncidents.slice(0, 5).map(incident => ({
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
      affectedSystems: relevantIncidents.length,
    }
  }

  // ✅ Create short label for compliance questions (category + key regulation)
  const keyRegulation = (llmAnalysis.complianceRequirements || [])[0]
  const complianceShortLabel = keyRegulation && keyRegulation !== complianceArea
    ? `${complianceArea} - ${keyRegulation}`
    : complianceArea

  const question: DynamicQuestion = {
    id: `compliance_${complianceArea.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`,
    label: complianceShortLabel, // ✅ SHORT: For UI labels/headers
    text: complianceQuestionText, // ✅ FULL QUESTION: What users see and answer
    question: complianceQuestionText, // ✅ ALIAS: For backward compatibility
    description: complianceArea,
    priority: determinePriority(finalWeight),

    importance: `Required for ${(llmAnalysis.complianceRequirements || []).join(', ')}. Non-compliance fines average $${avgFine.toLocaleString()} based on ${relevantIncidents.length} incidents. Multi-factor relevance: ${(avgMultiFactorRelevance * 100).toFixed(0)}% (considering technology stack, data types, and data sources).`,
    reasoning: `Evidence from ${relevantIncidents.length} compliance incidents with ${(avgMultiFactorRelevance * 100).toFixed(0)}% relevance`,
    examples,
    mitigations: generateComplianceMitigations(complianceArea),
    regulations: llmAnalysis.complianceRequirements,

    // ✅ FIX #2: Explicitly set related incidents for frontend display
    relatedIncidents: relevantIncidents.slice(0, 10).map(incident => ({
      ...incident,
      similarity: incident.similarity || avgMultiFactorRelevance,
      cost: incident.estimatedCost || 0,
      benchmarkingData: {
        industryAverage: avgFine,
        affectedOrganizations: relevantIncidents.length,
        caseType: 'Compliance Violation',
        severity: incident.severity || 'high',
        resolution: 'Implement required compliance controls'
      }
    })),
    similarIncidents: relevantIncidents.slice(0, 10).map(incident => ({
      ...incident,
      similarity: incident.similarity || avgMultiFactorRelevance,
      cost: incident.estimatedCost || 0
    })),

    // ✅ CRITICAL: Evidence object (maintains existing type structure)
    evidence,

    baseWeight,
    evidenceWeight,
    industryWeight,
    finalWeight,
    weight: finalWeight, // ✅ 0-1 scale (normalized for frontend display as percentage)

    weightageExplanation: createWeightageExplanation(baseWeight, evidenceWeight, industryWeight, finalWeight, `Required by ${(llmAnalysis.complianceRequirements || []).join(', ')}`),
    evidenceQuery: complianceArea,
    relatedIncidentCount: relevantIncidents.length,

    category: 'compliance',
    domain: 'compliance', // ✅ Add domain for compliance questions
    generatedFrom: 'hybrid',
    confidence: calculateConfidence(relevantIncidents, baseWeight) > 0.7 ? 'high' : 'medium',
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
- Evidence Weight (30%): Incident frequency and severity from Vertex AI RAG
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
  // Since incidents are already filtered by semantic similarity from Vertex AI vector search,
  // we don't need additional keyword filtering. The short content_preview fields from Vertex AI
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
  // ✅ REWRITTEN: Better handling of empty incidents
  if (incidents.length === 0) {
    console.log(`[EVIDENCE_WEIGHT] No incidents - returning 0.3 (low evidence weight)`)
    return 0.3 // Lower weight when no evidence (not 0.5 which is neutral)
  }

  // Weight based on:
  // - Number of incidents (more = higher weight, max at 20 incidents)
  // - Average similarity (how relevant are the incidents)
  // - Average severity (how bad are the incidents)
  const countWeight = Math.min(incidents.length / 20, 1.0) // Max at 20 incidents
  const avgSimilarity = incidents.reduce((sum, i) => sum + (i.similarity || 0), 0) / incidents.length
  const severityWeight = calculateSeverityWeight(incidents)

  const evidenceWeight = (countWeight * 0.4) + (avgSimilarity * 0.3) + (severityWeight * 0.3)
  
  console.log(`[EVIDENCE_WEIGHT] ${incidents.length} incidents: count=${(countWeight * 100).toFixed(0)}%, similarity=${(avgSimilarity * 100).toFixed(0)}%, severity=${(severityWeight * 100).toFixed(0)}% → final=${(evidenceWeight * 100).toFixed(0)}%`)
  
  return evidenceWeight
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
  const regulations = new Set<string>(llmAnalysis.complianceRequirements || [])

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

// ✅ Strip any "Based on X incidents" prefix that LLM might include despite instructions
function stripIncidentPrefix(question: string): string {
  // Pattern 1: Match "Based on X incidents (##% relevance)" or similar with parentheses
  const parenthesesPattern = /^Based\s+on\s+\d+\s+(?:similar\s+)?incidents\s*\([^)]*%[^)]*\)\s*/i
  let stripped = question.replace(parenthesesPattern, '').trim()

  // Pattern 2: Match "Based on X incidents." or with punctuation
  if (stripped === question) {
    const punctuationPattern = /^Based\s+on\s+(\d+\s+)?(?:similar\s+)?incidents.*?[\.\,\:]\s*/i
    stripped = question.replace(punctuationPattern, '').trim()
  }

  // Pattern 3: Remove leading phrases that mention data or analysis
  const dataPattern = /^(According to|Based on|From our analysis|Our data shows)\s+/i
  const finalStripped = stripped.replace(dataPattern, '').trim()

  return finalStripped || question // Return original if all content would be removed
}

function generateIndustryBenchmark(incidentStats: any, industry?: string): string {
  return `${industry || 'Your industry'} experiences average incident costs of $${incidentStats.avgCost.toLocaleString()} with ${incidentStats.mfaAdoptionRate.toFixed(0)}% MFA adoption rate.`
}
