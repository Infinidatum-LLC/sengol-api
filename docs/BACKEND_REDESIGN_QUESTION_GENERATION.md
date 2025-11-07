# Backend Redesign: Question Generation Flow

**Date**: December 2024
**Status**: Specification for Implementation
**Goal**: Redesign question generation to use LLM formalization, vector DB curation, and multi-factor relevance matching

---

## 🎯 Overview

The current question generation flow needs enhancement to:
1. **Formalize questions using LLM** - Better structured, context-aware questions
2. **Curate from Vector DB (d-vecDB)** - Find relevant incidents based on technology, data types, and sources
3. **Multi-factor relevance matching** - Combine technology choices, data types, and data sources
4. **Filter to applicable risks only** - Show only risks relevant to the user's system

---

## 📊 Current Flow Analysis

### Current Implementation
- **File**: `lib/ai/question-generator.ts`
- **Flow**: System Context → Calculate Risk Weights → Generate Questions
- **Relevance**: Basic similarity score from vector search
- **Question Generation**: Simple GPT-4 prompt

### Current Limitations
1. Relevance only uses semantic similarity (description matching)
2. Doesn't explicitly match technology stack, data types, or sources
3. Question formalization is basic
4. No explicit filtering based on system characteristics

---

## 🔄 Redesigned Flow

```
┌─────────────────────────────────────────────────────────────┐
│              STEP 1: System Context Extraction               │
├─────────────────────────────────────────────────────────────┤
│  Input: System Description                                  │
│  Extract:                                                  │
│  ├─ Technologies (techStack)                                │
│  ├─ Data Types (dataTypes: PII, Financial, Health, etc.)  │
│  ├─ Data Sources (sources: APIs, databases, files, etc.)  │
│  ├─ Industry                                               │
│  └─ Deployment Model                                       │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│         STEP 2: Multi-Factor Vector DB Search              │
├─────────────────────────────────────────────────────────────┤
│  Search d-vecDB with:                                      │
│  ├─ Semantic Query (system description)                    │
│  ├─ Technology Filter (match tech stack)                    │
│  ├─ Data Type Filter (match data types)                    │
│  └─ Source Filter (match data sources)                     │
│                                                             │
│  Return: Top N relevant incidents with:                    │
│  ├─ Semantic similarity score                              │
│  ├─ Technology match score                                 │
│  ├─ Data type match score                                  │
│  └─ Source match score                                     │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│         STEP 3: Multi-Factor Relevance Calculation         │
├─────────────────────────────────────────────────────────────┤
│  For each incident, calculate combined relevance:          │
│                                                             │
│  Combined Relevance =                                      │
│    (Semantic Similarity × 40%) +                           │
│    (Technology Match × 30%) +                              │
│    (Data Type Match × 20%) +                               │
│    (Source Match × 10%)                                     │
│                                                             │
│  Filter: Only incidents with relevance >= threshold        │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│         STEP 4: Risk Category Aggregation                   │
├─────────────────────────────────────────────────────────────┤
│  Group incidents by risk category:                           │
│  ├─ data_breach                                            │
│  ├─ model_bias                                             │
│  ├─ access_control                                         │
│  └─ ...                                                    │
│                                                             │
│  Calculate category weights:                               │
│  ├─ Incident count                                         │
│  ├─ Average relevance                                     │
│  ├─ Average severity                                       │
│  └─ Technology/data type/source alignment                   │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│         STEP 5: LLM-Based Question Formalization           │
├─────────────────────────────────────────────────────────────┤
│  For each risk category:                                   │
│  ├─ Gather evidence (incidents, statistics)                │
│  ├─ Extract technology/data type/source context             │
│  ├─ Use LLM to formalize question                         │
│  └─ Structure: Clear, actionable, system-specific          │
│                                                             │
│  LLM Prompt includes:                                       │
│  ├─ System description                                      │
│  ├─ Technology stack                                       │
│  ├─ Data types handled                                     │
│  ├─ Data sources used                                      │
│  ├─ Relevant incidents (top 3-5)                           │
│  └─ Risk category context                                  │
└─────────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────────┐
│         STEP 6: Filter Applicable Risks                    │
├─────────────────────────────────────────────────────────────┤
│  Final filtering:                                           │
│  ├─ Minimum relevance threshold                            │
│  ├─ Minimum incident count                                 │
│  ├─ Technology alignment check                              │
│  ├─ Data type alignment check                              │
│  └─ Source alignment check                                 │
│                                                             │
│  Return: Only risks applicable to user's system             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 Backend Implementation Details

### 1. Enhanced System Context Interface

**File**: `lib/ai/incident-intelligence.ts`

```typescript
export interface SystemContext {
  description: string
  technologyStack: string[]        // e.g., ['GPT-4', 'AWS', 'PostgreSQL']
  dataTypes: string[]             // e.g., ['PII', 'Financial', 'Health']
  dataSources: string[]           // e.g., ['API', 'Database', 'File Upload']
  industry: string
  deployment: 'cloud' | 'on-prem' | 'hybrid'
}
```

**Changes Needed**:
- Update `SystemContext` interface to include `dataTypes` and `dataSources`
- Update all functions that use `SystemContext` to handle new fields

---

### 2. Multi-Factor Vector DB Search

**File**: `lib/ai/incident-intelligence.ts` (new function)

```typescript
/**
 * Search incidents with multi-factor relevance matching
 */
export async function searchIncidentsWithMultiFactorRelevance(
  context: SystemContext,
  options: {
    topK?: number
    minRelevance?: number
  } = {}
): Promise<Array<{
  incident: SearchResult
  semanticScore: number
  technologyScore: number
  dataTypeScore: number
  sourceScore: number
  combinedRelevance: number
}>> {
  const { topK = 100, minRelevance = 0.5 } = options

  // Step 1: Semantic search (existing)
  const semanticQuery = `
    System: ${context.description}
    Technologies: ${context.technologyStack.join(', ')}
    Industry: ${context.industry}
    Deployment: ${context.deployment}
  `.trim()

  const semanticResults = await searchByText(semanticQuery, {}, topK * 2)

  // Step 2: Calculate multi-factor relevance for each incident
  const resultsWithRelevance = semanticResults.map(incident => {
    const semanticScore = incident.score || 0
    
    // Technology match score
    const technologyScore = calculateTechnologyMatch(
      incident.metadata,
      context.technologyStack
    )
    
    // Data type match score
    const dataTypeScore = calculateDataTypeMatch(
      incident.metadata,
      context.dataTypes
    )
    
    // Source match score
    const sourceScore = calculateSourceMatch(
      incident.metadata,
      context.dataSources
    )
    
    // Combined relevance
    const combinedRelevance = (
      semanticScore * 0.4 +
      technologyScore * 0.3 +
      dataTypeScore * 0.2 +
      sourceScore * 0.1
    )

    return {
      incident,
      semanticScore,
      technologyScore,
      dataTypeScore,
      sourceScore,
      combinedRelevance
    }
  })

  // Step 3: Filter by minimum relevance and sort
  return resultsWithRelevance
    .filter(r => r.combinedRelevance >= minRelevance)
    .sort((a, b) => b.combinedRelevance - a.combinedRelevance)
    .slice(0, topK)
}

/**
 * Calculate technology match score (0-1)
 */
function calculateTechnologyMatch(
  metadata: IncidentMetadata | undefined,
  techStack: string[]
): number {
  if (!metadata || techStack.length === 0) return 0

  // Extract technologies from incident metadata
  const incidentTechs = extractTechnologiesFromMetadata(metadata)
  
  if (incidentTechs.length === 0) return 0

  // Calculate overlap
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
function calculateDataTypeMatch(
  metadata: IncidentMetadata | undefined,
  dataTypes: string[]
): number {
  if (!metadata || dataTypes.length === 0) return 0

  // Extract data types from incident metadata
  const incidentDataTypes = extractDataTypesFromMetadata(metadata)
  
  if (incidentDataTypes.length === 0) return 0.5 // Neutral if unknown

  // Calculate overlap
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
 * Calculate source match score (0-1)
 */
function calculateSourceMatch(
  metadata: IncidentMetadata | undefined,
  dataSources: string[]
): number {
  if (!metadata || dataSources.length === 0) return 0

  // Extract sources from incident metadata
  const incidentSources = extractSourcesFromMetadata(metadata)
  
  if (incidentSources.length === 0) return 0.5 // Neutral if unknown

  // Calculate overlap
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
 * Extract technologies from incident metadata
 */
function extractTechnologiesFromMetadata(metadata: IncidentMetadata): string[] {
  const techs: string[] = []
  
  // Check common fields
  if (metadata.modelType) techs.push(metadata.modelType)
  if (metadata.technologyStack) {
    if (Array.isArray(metadata.technologyStack)) {
      techs.push(...metadata.technologyStack)
    } else {
      techs.push(metadata.technologyStack)
    }
  }
  
  // Extract from embeddingText if available
  if (metadata.embeddingText) {
    const text = metadata.embeddingText.toLowerCase()
    const commonTechs = ['gpt-4', 'gpt-3', 'claude', 'bert', 'aws', 'azure', 'gcp', 
                         'postgresql', 'mongodb', 'redis', 'docker', 'kubernetes']
    commonTechs.forEach(tech => {
      if (text.includes(tech)) techs.push(tech)
    })
  }
  
  return [...new Set(techs)] // Remove duplicates
}

/**
 * Extract data types from incident metadata
 */
function extractDataTypesFromMetadata(metadata: IncidentMetadata): string[] {
  const dataTypes: string[] = []
  
  // Check common fields
  if (metadata.dataTypes) {
    if (Array.isArray(metadata.dataTypes)) {
      dataTypes.push(...metadata.dataTypes)
    } else {
      dataTypes.push(metadata.dataTypes)
    }
  }
  
  // Extract from embeddingText if available
  if (metadata.embeddingText) {
    const text = metadata.embeddingText.toLowerCase()
    const commonDataTypes = ['pii', 'phi', 'financial', 'health', 'credit', 
                            'payment', 'biometric', 'location']
    commonDataTypes.forEach(dt => {
      if (text.includes(dt)) dataTypes.push(dt)
    })
  }
  
  return [...new Set(dataTypes)] // Remove duplicates
}

/**
 * Extract sources from incident metadata
 */
function extractSourcesFromMetadata(metadata: IncidentMetadata): string[] {
  const sources: string[] = []
  
  // Check common fields
  if (metadata.dataSources) {
    if (Array.isArray(metadata.dataSources)) {
      sources.push(...metadata.dataSources)
    } else {
      sources.push(metadata.dataSources)
    }
  }
  
  // Extract from embeddingText if available
  if (metadata.embeddingText) {
    const text = metadata.embeddingText.toLowerCase()
    const sourceKeywords = ['api', 'database', 'file', 'upload', 'stream', 
                           'third-party', 'external', 'integration']
    sourceKeywords.forEach(keyword => {
      if (text.includes(keyword)) sources.push(keyword)
    })
  }
  
  return [...new Set(sources)] // Remove duplicates
}
```

---

### 3. Enhanced Risk Weight Calculation

**File**: `lib/ai/incident-intelligence.ts` (update `calculateRiskWeights`)

```typescript
/**
 * Calculate risk weights with multi-factor relevance
 */
export async function calculateRiskWeights(
  context: SystemContext
): Promise<RiskWeight[]> {
  console.log('[INCIDENT_INTELLIGENCE] Calculating risk weights with multi-factor relevance:', context)

  // Step 1: Multi-factor incident search
  const relevantIncidents = await searchIncidentsWithMultiFactorRelevance(
    context,
    { topK: 100, minRelevance: 0.5 }
  )

  console.log(`[INCIDENT_INTELLIGENCE] Found ${relevantIncidents.length} relevant incidents with multi-factor matching`)

  // Step 2: Aggregate by category
  const categoryAggregates = aggregateByCategoryWithRelevance(
    relevantIncidents.map(r => r.incident)
  )

  // Step 3: Calculate weights with multi-factor context
  const weights: RiskWeight[] = []

  for (const [category, incidents] of Object.entries(categoryAggregates)) {
    // Get relevance scores for incidents in this category
    const categoryRelevanceScores = relevantIncidents
      .filter(r => {
        const incidentCategory = r.incident.metadata?.incidentType || 'other'
        return incidentCategory === category
      })
      .map(r => r.combinedRelevance)

    const weight = calculateCategoryWeightWithMultiFactor(
      category,
      incidents,
      categoryRelevanceScores,
      context
    )
    weights.push(weight)
  }

  // Step 4: Sort by weight (highest risk first)
  weights.sort((a, b) => b.weight - a.weight)

  console.log('[INCIDENT_INTELLIGENCE] Calculated weights:', weights.map(w => ({
    category: w.category,
    weight: w.weight,
    relevance: w.evidence.relevanceScore
  })))

  return weights
}

/**
 * Calculate category weight with multi-factor relevance
 */
function calculateCategoryWeightWithMultiFactor(
  category: string,
  incidents: SearchResult[],
  relevanceScores: number[],
  context: SystemContext
): RiskWeight {
  // Average multi-factor relevance
  const avgRelevance = relevanceScores.length > 0
    ? relevanceScores.reduce((a, b) => a + b, 0) / relevanceScores.length
    : 0.5

  // Calculate incident frequency (normalized to 0-10)
  const incidentFrequency = Math.min(incidents.length / 100, 1) * 10

  // Calculate average severity
  const avgSeverity = incidents.reduce((sum, inc) => {
    const severity = inc.metadata?.severity
    const severityScore = severity === 'high' ? 8 : severity === 'medium' ? 5 : 2
    return sum + severityScore
  }, 0) / incidents.length

  // Technology alignment bonus
  const techAlignment = calculateTechnologyAlignment(category, context.technologyStack)

  // Data type alignment bonus
  const dataTypeAlignment = calculateDataTypeAlignment(category, context.dataTypes)

  // Determine regulatory impact
  const regulatoryImpact = determineRegulatoryImpact(category, context.industry)

  // Calculate final weight with multi-factor components
  const weight = (
    incidentFrequency * 0.3 +           // Reduced from 0.4
    avgSeverity * 0.25 +                 // Reduced from 0.3
    avgRelevance * 10 * 0.25 +           // NEW: Multi-factor relevance
    techAlignment * 0.1 +                // NEW: Technology alignment
    dataTypeAlignment * 0.05 +           // NEW: Data type alignment
    regulatoryImpactScore(regulatoryImpact) * 0.05  // Reduced from 0.1
  )

  // Get recent examples
  const recentExamples = incidents
    .slice(0, 5)
    .map(inc => ({
      id: inc.id,
      title: inc.metadata?.embeddingText?.substring(0, 100) || 'Unknown incident',
      date: inc.metadata?.incidentDate || 'Unknown',
      severity: inc.metadata?.severity === 'high' ? 8 : inc.metadata?.severity === 'medium' ? 5 : 2,
      impact: inc.metadata?.embeddingText?.substring(0, 200) || 'Unknown'
    }))

  // Calculate statistics
  const totalCost = incidents.reduce((sum, inc) => sum + (inc.metadata?.estimatedCost || 0), 0)
  const avgCost = totalCost / incidents.length
  const affectedSystemsSet = new Set(incidents.map(inc => inc.metadata?.organization).filter(Boolean))

  return {
    category,
    weight: Math.round(weight * 10) / 10,
    reasoning: {
      incidentFrequency: Math.round(incidentFrequency * 10) / 10,
      avgSeverity: Math.round(avgSeverity * 10) / 10,
      techRelevance: Math.round(avgRelevance * 100) / 100,
      regulatoryImpact
    },
    evidence: {
      incidentCount: incidents.length,
      avgSeverity: Math.round(avgSeverity * 10) / 10,
      relevanceScore: Math.round(avgRelevance * 100) / 100, // Multi-factor relevance
      recentExamples,
      statistics: {
        totalCost,
        avgCost: Math.round(avgCost),
        affectedSystems: affectedSystemsSet.size
      }
    }
  }
}

/**
 * Calculate technology alignment for a risk category
 */
function calculateTechnologyAlignment(
  category: string,
  techStack: string[]
): number {
  // Map categories to relevant technologies
  const categoryTechMap: Record<string, string[]> = {
    'model_bias': ['gpt', 'claude', 'bert', 'llm', 'ai model'],
    'data_breach': ['database', 'postgresql', 'mongodb', 'redis'],
    'access_control': ['aws', 'azure', 'gcp', 'cloud'],
    'api_security': ['api', 'rest', 'graphql'],
    // Add more mappings as needed
  }

  const relevantTechs = categoryTechMap[category] || []
  if (relevantTechs.length === 0) return 0.5 // Neutral

  const techStackLower = techStack.map(t => t.toLowerCase())
  const matches = relevantTechs.filter(tech =>
    techStackLower.some(stackTech => 
      stackTech.includes(tech) || tech.includes(stackTech)
    )
  )

  return matches.length / Math.max(1, relevantTechs.length)
}

/**
 * Calculate data type alignment for a risk category
 */
function calculateDataTypeAlignment(
  category: string,
  dataTypes: string[]
): number {
  // Map categories to relevant data types
  const categoryDataTypeMap: Record<string, string[]> = {
    'data_breach': ['pii', 'phi', 'financial'],
    'privacy_violation': ['pii', 'phi'],
    'gdpr_violation': ['pii', 'personal'],
    'hipaa_violation': ['phi', 'health'],
    // Add more mappings as needed
  }

  const relevantDataTypes = categoryDataTypeMap[category] || []
  if (relevantDataTypes.length === 0) return 0.5 // Neutral

  const dataTypesLower = dataTypes.map(t => t.toLowerCase())
  const matches = relevantDataTypes.filter(dt =>
    dataTypesLower.some(sysDt => 
      sysDt.includes(dt) || dt.includes(sysDt)
    )
  )

  return matches.length / Math.max(1, relevantDataTypes.length)
}
```

---

### 4. Enhanced LLM Question Formalization

**File**: `lib/ai/question-generator.ts` (update `generateQuestionForCategory`)

```typescript
/**
 * Generate a formalized question for a specific risk category using LLM
 */
async function generateQuestionForCategory(
  risk: RiskWeight,
  context: SystemContext
): Promise<DynamicQuestion> {
  console.log(`[QUESTION_GENERATOR] Generating formalized question for: ${risk.category} (weight: ${risk.weight})`)

  // Build comprehensive evidence summary for LLM
  const evidenceSummary = `
Risk Category: ${risk.category}
Risk Weight: ${risk.weight}/10

System Context:
- Description: ${context.description}
- Technology Stack: ${context.technologyStack.join(', ')}
- Data Types: ${context.dataTypes.join(', ')}
- Data Sources: ${context.dataSources.join(', ')}
- Industry: ${context.industry}
- Deployment: ${context.deployment}

Evidence from Incident Database:
- ${risk.evidence.incidentCount} relevant incidents found
- Average severity: ${risk.evidence.avgSeverity}/10
- Multi-factor relevance: ${(risk.evidence.relevanceScore * 100).toFixed(0)}%
- Estimated avg cost: $${Math.round(risk.evidence.statistics.avgCost / 1000)}K per incident
- Affected organizations: ${risk.evidence.statistics.affectedSystems}

Recent Examples:
${risk.evidence.recentExamples.slice(0, 5).map((ex, i) =>
  `${i + 1}. ${ex.title} (${ex.date}, severity: ${ex.severity}/10)`
).join('\n')}

Technology Alignment: ${(calculateTechnologyAlignment(risk.category, context.technologyStack) * 100).toFixed(0)}%
Data Type Alignment: ${(calculateDataTypeAlignment(risk.category, context.dataTypes) * 100).toFixed(0)}%
  `.trim()

  // Enhanced LLM prompt for formal question generation
  const completion = await openai.chat.completions.create({
    model: 'gpt-4',
    messages: [
      {
        role: 'system',
        content: `You are a cybersecurity and AI risk assessment expert. Generate a formal, structured risk assessment question based on real-world incident data and system context.

The question must:
1. Be specific to the user's system (technologies: ${context.technologyStack.join(', ')}, data types: ${context.dataTypes.join(', ')}, sources: ${context.dataSources.join(', ')})
2. Reference the risk category: ${risk.category}
3. Incorporate evidence from ${risk.evidence.incidentCount} real-world incidents
4. Be clear and actionable (answerable with: "addressed", "partially addressed", "not addressed", or "not applicable")
5. Focus on controls, mitigations, or safeguards
6. Be concise (1-2 sentences max)
7. Use formal, professional language

Format: Return ONLY the question text, nothing else.`
      },
      {
        role: 'user',
        content: evidenceSummary
      }
    ],
    temperature: 0.7,
    max_tokens: 200
  })

  const questionText = completion.choices[0].message.content?.trim() ||
    `How do you mitigate ${risk.category} risks in your ${context.deployment} system using ${context.technologyStack.slice(0, 2).join('/')}?`

  console.log(`[QUESTION_GENERATOR] Generated formalized question: ${questionText.substring(0, 80)}...`)

  return {
    id: `dynamic_${risk.category.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Date.now()}`,
    text: questionText,
    category: risk.category,
    weight: risk.weight,
    evidence: risk.evidence,
    reasoning: risk.reasoning,
    aiGenerated: true
  }
}
```

---

### 5. Filter Applicable Risks

**File**: `lib/ai/question-generator.ts` (update `generateDynamicQuestions`)

```typescript
/**
 * Generate context-aware risk assessment questions with filtering
 */
export async function generateDynamicQuestions(
  context: SystemContext,
  options: QuestionGenerationOptions = {}
): Promise<DynamicQuestion[]> {
  console.log('[QUESTION_GENERATOR] Generating dynamic questions with multi-factor relevance:', context)

  const {
    maxQuestions = 10,
    minWeight = 5.0,
    includeEvidence = true
  } = options

  // Step 1: Calculate risk weights with multi-factor relevance
  console.log('[QUESTION_GENERATOR] Step 1: Calculating risk weights with multi-factor matching...')
  const riskWeights = await calculateRiskWeights(context)

  console.log(`[QUESTION_GENERATOR] Found ${riskWeights.length} risk categories`)
  console.log('[QUESTION_GENERATOR] Top risks:', riskWeights.slice(0, 5).map(w => ({
    category: w.category,
    weight: w.weight,
    relevance: w.evidence.relevanceScore,
    incidents: w.evidence.incidentCount
  })))

  // Step 2: Filter by minimum weight and relevance
  const applicableRisks = riskWeights
    .filter(r => {
      // Minimum weight threshold
      if (r.weight < minWeight) return false
      
      // Minimum relevance threshold (multi-factor)
      if (r.evidence.relevanceScore < 0.5) return false
      
      // Minimum incident count
      if (r.evidence.incidentCount < 3) return false
      
      return true
    })
    .slice(0, maxQuestions)

  console.log(`[QUESTION_GENERATOR] Filtered to ${applicableRisks.length} applicable risks`)

  if (applicableRisks.length === 0) {
    console.warn('[QUESTION_GENERATOR] No applicable risks found, using top 5 regardless')
    applicableRisks.push(...riskWeights.slice(0, Math.min(5, riskWeights.length)))
  }

  // Step 3: Generate formalized questions using LLM
  console.log('[QUESTION_GENERATOR] Step 2: Generating formalized questions with LLM...')
  const questions: DynamicQuestion[] = []

  for (const risk of applicableRisks) {
    try {
      const question = await generateQuestionForCategory(risk, context)
      questions.push(question)
    } catch (error) {
      console.error(`[QUESTION_GENERATOR] Failed to generate question for ${risk.category}:`, error)
      // Fallback to generic question
      questions.push(createFallbackQuestion(risk, context))
    }
  }

  console.log(`[QUESTION_GENERATOR] Generated ${questions.length} formalized questions`)
  console.log('[QUESTION_GENERATOR] Question summary:', questions.map(q => ({
    category: q.category,
    weight: q.weight,
    relevance: q.evidence.relevanceScore,
    text: q.text.substring(0, 60) + '...'
  })))

  return questions
}
```

---

## 📝 API Endpoint Updates

### Update Request/Response Types

**File**: `app/api/review/[id]/generate-questions/route.ts`

```typescript
// Update request body to include dataTypes and dataSources
const backendBody = {
  systemDescription,
  technologyStack: Array.isArray(selectedTech) ? selectedTech : [],
  dataTypes: assessment.dataTypes || [],        // NEW
  dataSources: assessment.dataSources || [],    // NEW (if available)
  industry,
  deployment,
  selectedDomains,
  jurisdictions,
  maxQuestions: totalMaxQuestions,
  minWeight: 0.7,
  questionsPerDomain: questionsPerDomain,
  minRiskPotential: 0.7
}
```

---

## 📦 Vector Database Metadata Collection

### ⚠️ CRITICAL: Backend Must Collect Metadata

The backend **MUST** collect and store the following metadata fields in vector database collections to enable multi-factor relevance matching:

### Required Metadata Fields

**File**: `lib/ai/dvecdb-embeddings.ts` (update `IncidentMetadata` interface)

```typescript
export interface IncidentMetadata {
  // Existing fields
  incidentId: string
  incidentType: string // 'cyber', 'failure_pattern', 'regulation_violation'
  organization?: string
  industry?: string
  severity?: string
  incidentDate?: string // ISO date string

  // Security controls (for ROI analysis)
  hadMfa?: boolean
  hadBackups?: boolean
  hadIrPlan?: boolean

  // Financial impact
  estimatedCost?: number
  downtimeHours?: number
  recordsAffected?: number

  // Additional context
  attackType?: string
  attackVector?: string
  failureType?: string
  rootCause?: string
  tags?: string // Comma-separated tags

  // Source text (for display in results)
  embeddingText: string

  // ⚠️ NEW: Required for multi-factor relevance matching
  // Technology stack used in the incident
  technologyStack?: string[]  // e.g., ['GPT-4', 'AWS', 'PostgreSQL', 'Docker']
  
  // Data types involved in the incident
  dataTypes?: string[]  // e.g., ['PII', 'Financial', 'Health', 'Credit Card']
  
  // Data sources involved in the incident
  dataSources?: string[]  // e.g., ['API', 'Database', 'File Upload', 'Third-party Service']
}
```

### Backend Metadata Collection Instructions

#### 1. Update Metadata Extraction

**File**: `scripts/generate-dvecdb-embeddings.ts` (or equivalent embedding generation script)

```typescript
/**
 * Extract technology stack from incident data
 */
function extractTechnologyStack(incident: any): string[] {
  const technologies: string[] = []
  
  // Extract from explicit fields
  if (incident.modelType) technologies.push(incident.modelType)
  if (incident.technologyStack && Array.isArray(incident.technologyStack)) {
    technologies.push(...incident.technologyStack)
  }
  
  // Extract from description/embeddingText using keyword matching
  const text = (incident.description || incident.embeddingText || '').toLowerCase()
  
  // Common technology keywords
  const techKeywords = {
    'GPT-4': ['gpt-4', 'gpt4', 'openai gpt-4'],
    'GPT-3': ['gpt-3', 'gpt3', 'openai gpt-3'],
    'Claude': ['claude', 'anthropic claude'],
    'BERT': ['bert', 'google bert'],
    'AWS': ['aws', 'amazon web services', 'amazon aws'],
    'Azure': ['azure', 'microsoft azure'],
    'GCP': ['gcp', 'google cloud', 'google cloud platform'],
    'PostgreSQL': ['postgresql', 'postgres', 'postgres db'],
    'MongoDB': ['mongodb', 'mongo db'],
    'Redis': ['redis', 'redis cache'],
    'Docker': ['docker', 'docker container'],
    'Kubernetes': ['kubernetes', 'k8s', 'kube'],
    'React': ['react', 'react.js'],
    'Node.js': ['node.js', 'nodejs', 'node'],
    'Python': ['python'],
    'JavaScript': ['javascript', 'js'],
    'TypeScript': ['typescript', 'ts'],
    'TensorFlow': ['tensorflow', 'tf'],
    'PyTorch': ['pytorch'],
    'S3': ['s3', 'amazon s3'],
    'Lambda': ['lambda', 'aws lambda'],
    'EC2': ['ec2', 'aws ec2'],
    'RDS': ['rds', 'aws rds'],
    'DynamoDB': ['dynamodb', 'dynamo db'],
    'Elasticsearch': ['elasticsearch', 'elastic search'],
    'Kafka': ['kafka', 'apache kafka'],
    'RabbitMQ': ['rabbitmq', 'rabbit mq'],
    'Nginx': ['nginx'],
    'Apache': ['apache'],
    'Jenkins': ['jenkins'],
    'GitHub Actions': ['github actions', 'github ci'],
    'CircleCI': ['circleci', 'circle ci'],
    'Terraform': ['terraform'],
    'Ansible': ['ansible'],
    'Chef': ['chef'],
    'Puppet': ['puppet'],
  }
  
  // Match technologies from text
  for (const [tech, keywords] of Object.entries(techKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      technologies.push(tech)
    }
  }
  
  return [...new Set(technologies)] // Remove duplicates
}

/**
 * Extract data types from incident data
 */
function extractDataTypes(incident: any): string[] {
  const dataTypes: string[] = []
  
  // Extract from explicit fields
  if (incident.dataTypes && Array.isArray(incident.dataTypes)) {
    dataTypes.push(...incident.dataTypes)
  }
  
  // Extract from description/embeddingText using keyword matching
  const text = (incident.description || incident.embeddingText || '').toLowerCase()
  
  // Common data type keywords
  const dataTypeKeywords = {
    'PII': ['pii', 'personally identifiable information', 'personal data', 'personal information'],
    'PHI': ['phi', 'protected health information', 'health information', 'medical records'],
    'Financial': ['financial', 'financial data', 'payment', 'credit card', 'bank account', 'transaction'],
    'Health': ['health', 'health data', 'medical', 'patient data', 'healthcare'],
    'Credit': ['credit', 'credit card', 'credit data', 'credit score'],
    'Payment': ['payment', 'payment data', 'payment card', 'card number'],
    'Biometric': ['biometric', 'fingerprint', 'face recognition', 'iris', 'voice'],
    'Location': ['location', 'gps', 'geolocation', 'coordinates', 'address'],
    'Authentication': ['authentication', 'password', 'credentials', 'login'],
    'Authorization': ['authorization', 'permissions', 'access control'],
    'IP Address': ['ip address', 'ip', 'network address'],
    'Email': ['email', 'email address', 'email data'],
    'Phone': ['phone', 'phone number', 'telephone'],
    'SSN': ['ssn', 'social security number', 'social security'],
    'Driver License': ['driver license', 'drivers license', 'license number'],
    'Passport': ['passport', 'passport number'],
    'Bank Account': ['bank account', 'account number', 'routing number'],
    'Tax ID': ['tax id', 'ein', 'employer identification number'],
  }
  
  // Match data types from text
  for (const [dataType, keywords] of Object.entries(dataTypeKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      dataTypes.push(dataType)
    }
  }
  
  return [...new Set(dataTypes)] // Remove duplicates
}

/**
 * Extract data sources from incident data
 */
function extractDataSources(incident: any): string[] {
  const dataSources: string[] = []
  
  // Extract from explicit fields
  if (incident.dataSources && Array.isArray(incident.dataSources)) {
    dataSources.push(...incident.dataSources)
  }
  
  // Extract from description/embeddingText using keyword matching
  const text = (incident.description || incident.embeddingText || '').toLowerCase()
  
  // Common data source keywords
  const sourceKeywords = {
    'API': ['api', 'rest api', 'graphql', 'webhook', 'endpoint'],
    'Database': ['database', 'db', 'sql', 'nosql', 'data store', 'data storage'],
    'File Upload': ['file upload', 'file', 'upload', 'document upload', 'attachment'],
    'Third-party Service': ['third-party', 'third party', 'external service', 'integration'],
    'Cloud Storage': ['cloud storage', 's3', 'blob storage', 'object storage'],
    'Email': ['email', 'email service', 'smtp', 'mail'],
    'Message Queue': ['message queue', 'queue', 'kafka', 'rabbitmq', 'sqs'],
    'Streaming': ['streaming', 'data stream', 'real-time', 'realtime'],
    'Batch Processing': ['batch', 'batch processing', 'etl', 'data pipeline'],
    'Web Scraping': ['web scraping', 'scraping', 'crawling', 'crawler'],
    'Mobile App': ['mobile app', 'mobile application', 'ios', 'android'],
    'Web App': ['web app', 'web application', 'website', 'web service'],
    'Desktop App': ['desktop app', 'desktop application', 'client application'],
    'IoT Device': ['iot', 'internet of things', 'sensor', 'device'],
    'Social Media': ['social media', 'twitter', 'facebook', 'linkedin'],
    'Payment Gateway': ['payment gateway', 'stripe', 'paypal', 'payment processor'],
    'CRM': ['crm', 'customer relationship management', 'salesforce'],
    'ERP': ['erp', 'enterprise resource planning'],
    'Analytics': ['analytics', 'analytics platform', 'data analytics'],
    'Logging': ['logging', 'log', 'log file', 'audit log'],
    'Monitoring': ['monitoring', 'monitoring tool', 'observability'],
  }
  
  // Match data sources from text
  for (const [source, keywords] of Object.entries(sourceKeywords)) {
    if (keywords.some(keyword => text.includes(keyword))) {
      dataSources.push(source)
    }
  }
  
  return [...new Set(dataSources)] // Remove duplicates
}
```

#### 2. Update Metadata Preparation

**File**: `scripts/generate-dvecdb-embeddings.ts` (update metadata preparation)

```typescript
// In processCyberIncidents(), processFailurePatterns(), etc.

// Prepare metadata with extracted fields
const metadata: IncidentMetadata = {
  incidentId: incident.id,
  incidentType: 'cyber', // or 'failure_pattern', etc.
  organization: incident.organization || undefined,
  industry: incident.industry || undefined,
  severity: incident.severity,
  incidentDate: incident.incident_date.toISOString(),
  attackType: incident.attack_type,
  attackVector: incident.attack_vector || undefined,
  estimatedCost: incident.estimated_cost ? Number(incident.estimated_cost) : undefined,
  downtimeHours: incident.downtime_hours || undefined,
  hadMfa: incident.had_mfa || undefined,
  hadBackups: incident.had_backups || undefined,
  hadIrPlan: incident.had_ir_plan || undefined,
  embeddingText: text,
  
  // ⚠️ NEW: Extract and include technology, data types, and sources
  technologyStack: extractTechnologyStack(incident),
  dataTypes: extractDataTypes(incident),
  dataSources: extractDataSources(incident),
}
```

#### 3. Update Backend API Metadata Model

**File**: `python-services/embedding-service/main.py` (or equivalent backend service)

```python
class IncidentMetadata(BaseModel):
    """Metadata for incident embeddings"""
    # Existing fields
    incidentId: str
    incidentType: str
    organization: Optional[str] = None
    industry: Optional[str] = None
    severity: Optional[str] = None
    incidentDate: Optional[str] = None
    
    # Security controls
    hadMfa: Optional[bool] = None
    hadBackups: Optional[bool] = None
    hadIrPlan: Optional[bool] = None
    
    # Financial impact
    estimatedCost: Optional[float] = None
    downtimeHours: Optional[int] = None
    recordsAffected: Optional[int] = None
    
    # Additional context
    attackType: Optional[str] = None
    attackVector: Optional[str] = None
    failureType: Optional[str] = None
    rootCause: Optional[str] = None
    tags: Optional[str] = None
    
    # Source text
    embeddingText: str
    
    # ⚠️ NEW: Required for multi-factor relevance matching
    technologyStack: Optional[List[str]] = None  # e.g., ['GPT-4', 'AWS', 'PostgreSQL']
    dataTypes: Optional[List[str]] = None  # e.g., ['PII', 'Financial', 'Health']
    dataSources: Optional[List[str]] = None  # e.g., ['API', 'Database', 'File Upload']
```

#### 4. Update Vector DB Upsert

**File**: `python-services/embedding-service/main.py` (update upsert endpoint)

```python
@app.post("/embeddings/upsert")
async def upsert_embedding(request: UpsertEmbeddingRequest):
    """
    Upsert an embedding to d-vecDB with metadata
    
    ⚠️ IMPORTANT: Metadata MUST include technologyStack, dataTypes, and dataSources
    """
    try:
        # Validate metadata includes required fields
        if not request.metadata:
            raise ValueError("Metadata is required")
        
        # Ensure technologyStack, dataTypes, and dataSources are arrays
        metadata = request.metadata.dict()
        
        # Convert to arrays if they're strings (for backward compatibility)
        if 'technologyStack' in metadata and isinstance(metadata['technologyStack'], str):
            metadata['technologyStack'] = [metadata['technologyStack']]
        if 'dataTypes' in metadata and isinstance(metadata['dataTypes'], str):
            metadata['dataTypes'] = [metadata['dataTypes']]
        if 'dataSources' in metadata and isinstance(metadata['dataSources'], str):
            metadata['dataSources'] = [metadata['dataSources']]
        
        # Upsert to d-vecDB
        result = await dvecdb_client.upsert(
            collection_name=COLLECTION_NAME,
            id=request.id,
            vector=request.embedding,
            metadata=metadata
        )
        
        return {
            "success": True,
            "id": request.id,
            "message": "Embedding upserted successfully"
        }
    except Exception as e:
        logger.error(f"Failed to upsert embedding: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
```

### Metadata Collection Checklist

- [ ] Update `IncidentMetadata` interface to include `technologyStack`, `dataTypes`, `dataSources`
- [ ] Implement `extractTechnologyStack()` function
- [ ] Implement `extractDataTypes()` function
- [ ] Implement `extractDataSources()` function
- [ ] Update metadata preparation in embedding generation scripts
- [ ] Update backend API metadata model
- [ ] Update vector DB upsert to handle new metadata fields
- [ ] Re-run embedding generation for existing incidents (if needed)
- [ ] Verify metadata is stored correctly in vector DB
- [ ] Test multi-factor relevance matching with new metadata

### Migration Notes

If you have existing embeddings without the new metadata fields:

1. **Option 1: Re-generate embeddings** (recommended)
   - Re-run embedding generation scripts with new metadata extraction
   - This ensures all incidents have complete metadata

2. **Option 2: Backfill metadata** (if re-generation is not feasible)
   - Create a migration script to extract metadata from existing `embeddingText`
   - Update existing embeddings in vector DB with new metadata fields

---

## 🧪 Testing Requirements

### Unit Tests Needed

1. **Multi-factor relevance calculation**
   - Test technology matching
   - Test data type matching
   - Test source matching
   - Test combined relevance formula

2. **Question formalization**
   - Test LLM prompt generation
   - Test question structure
   - Test fallback handling

3. **Risk filtering**
   - Test minimum weight threshold
   - Test minimum relevance threshold
   - Test minimum incident count

4. **Metadata extraction**
   - Test technology extraction from text
   - Test data type extraction from text
   - Test source extraction from text

### Integration Tests Needed

1. **End-to-end question generation**
   - Test with real system context
   - Test with various technology stacks
   - Test with different data types
   - Verify question quality

2. **Vector DB integration**
   - Test multi-factor search
   - Test relevance scoring
   - Test filtering
   - Test metadata storage and retrieval

---

## 📋 Summary of Backend Changes

### Files to Modify

1. **`lib/ai/incident-intelligence.ts`**
   - ✅ Update `SystemContext` interface (add `dataTypes`, `dataSources`)
   - ✅ Add `searchIncidentsWithMultiFactorRelevance()` function
   - ✅ Add helper functions: `calculateTechnologyMatch()`, `calculateDataTypeMatch()`, `calculateSourceMatch()`
   - ✅ Add extraction functions: `extractTechnologiesFromMetadata()`, `extractDataTypesFromMetadata()`, `extractSourcesFromMetadata()`
   - ✅ Update `calculateRiskWeights()` to use multi-factor relevance
   - ✅ Add `calculateCategoryWeightWithMultiFactor()` function
   - ✅ Add `calculateTechnologyAlignment()` and `calculateDataTypeAlignment()` functions

2. **`lib/ai/question-generator.ts`**
   - ✅ Update `generateQuestionForCategory()` with enhanced LLM prompt
   - ✅ Update `generateDynamicQuestions()` with filtering logic
   - ✅ Add technology/data type alignment calculations

3. **`app/api/review/[id]/generate-questions/route.ts`**
   - ✅ Update request body to include `dataTypes` and `dataSources`

### New Dependencies

None - all existing dependencies are sufficient.

### Environment Variables

No new environment variables needed.

---

## ✅ Implementation Checklist

- [ ] Update `SystemContext` interface
- [ ] Implement multi-factor relevance search
- [ ] Implement technology/data type/source matching functions
- [ ] Update risk weight calculation
- [ ] Enhance LLM question formalization
- [ ] Add filtering logic
- [ ] Update API endpoints
- [ ] Add unit tests
- [ ] Add integration tests
- [ ] Update documentation

---

## 🚀 Next Steps

1. **Backend Implementation**: Implement the changes outlined above
2. **Frontend Updates**: Update frontend to pass `dataTypes` and `dataSources` (if not already available)
3. **Testing**: Test with various system contexts
4. **Validation**: Verify question quality and relevance

---

## 📚 References

- Current implementation: `lib/ai/question-generator.ts`
- Current relevance: `lib/ai/incident-intelligence.ts`
- Vector DB: `lib/ai/dvecdb-embeddings.ts`
- API endpoint: `app/api/review/[id]/generate-questions/route.ts`

