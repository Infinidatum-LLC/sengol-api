# Incident-Question Mapping Documentation

## Overview

Every dynamically generated question in Sengol is **evidence-based** - meaning it's directly linked to real historical security incidents from Qdrant (78,827+ incidents). This document explains how to access and display this incident-question mapping in the frontend.

**Important:** Both **risk questions** and **compliance questions** share the exact same incident mapping structure. All guidance in this document applies equally to both question types.

## Data Structure

### Question Object

Each `DynamicQuestion` contains comprehensive incident mapping through multiple fields:

```typescript
interface DynamicQuestion {
  id: string
  label: string  // The question text
  description: string

  // ✅ PRIMARY MAPPING: Full incident array
  relatedIncidents: IncidentMatch[]  // Array of 3-15 incidents that influenced this question
  similarIncidents?: IncidentMatch[]  // Alias for relatedIncidents

  // ✅ EVIDENCE SUMMARY: Quick access to top incidents
  evidence: IncidentEvidence {
    incidentCount: number  // Total number of incidents found
    avgSeverity: number    // Average severity (0-10 scale)
    relevanceScore: number // Average similarity score (0-1)
    recentExamples: Array<{  // Top 5 incidents, pre-formatted for display
      id: string
      title: string  // Short description (max 100 chars)
      organization: string
      date: string  // ISO format
      severity: number  // 0-10 scale
      incidentType: string
      category: string
      description: string
      estimatedCost: number
      cost: number  // Alias for estimatedCost
      similarity: number  // 0-1 similarity score
      relevanceScore: number  // Multi-factor relevance (0-1)
    }>
    statistics: {
      totalCost: number
      avgCost: number
      affectedSystems: number
    }
  }

  // Weightage information
  finalWeight: number  // Composite weight influenced by incidents
  evidenceWeight: number  // Weight specifically from incident frequency/severity
  weightageExplanation: string  // Human-readable explanation
}
```

### IncidentMatch Object

Full incident details available in `relatedIncidents` array:

```typescript
interface IncidentMatch {
  id: string
  incidentId: string
  incidentType: string  // e.g., "Ransomware", "Data Breach", "API Vulnerability"
  attackType?: string | null
  organization?: string | null  // Company name
  industry?: string | null  // e.g., "Healthcare", "Finance"
  severity?: string | null  // "low", "medium", "high", "critical"
  incidentDate?: Date | null
  hadMfa?: boolean | null  // Did they have MFA?
  hadBackups?: boolean | null  // Did they have backups?
  hadIrPlan?: boolean | null  // Did they have incident response plan?
  estimatedCost?: number | null  // Financial impact in dollars
  downtimeHours?: number | null
  recordsAffected?: number | null
  similarity: number  // Vector similarity score (0-1), higher = more relevant
  embeddingText: string  // Short incident description
}
```

## How to Display Incident Mapping

### Option 1: Quick Summary (Recommended for Question List)

Display incident count and relevance for each question:

```tsx
function QuestionCard({ question }: { question: DynamicQuestion }) {
  const { incidentCount, relevanceScore } = question.evidence

  return (
    <div className="question-card">
      <h3>{question.label}</h3>
      <div className="evidence-badge">
        <span className="icon">📊</span>
        <span>Based on {incidentCount} incidents</span>
        <span className="relevance">{(relevanceScore * 100).toFixed(0)}% relevance</span>
      </div>
    </div>
  )
}
```

### Option 2: Expanded View with Top Incidents

Show top 3-5 incidents when user expands question:

```tsx
function QuestionDetails({ question }: { question: DynamicQuestion }) {
  const topIncidents = question.evidence.recentExamples.slice(0, 3)

  return (
    <div className="question-details">
      <h3>{question.label}</h3>
      <p>{question.description}</p>

      <div className="evidence-section">
        <h4>Based on Real Incidents:</h4>
        {topIncidents.map((incident) => (
          <div key={incident.id} className="incident-card">
            <div className="incident-header">
              <strong>{incident.organization}</strong>
              <span className="date">{new Date(incident.date).toLocaleDateString()}</span>
              <span className={`severity severity-${incident.severity}`}>
                {incident.severity}/10
              </span>
            </div>
            <div className="incident-body">
              <p>{incident.title}</p>
              <div className="incident-meta">
                <span className="type">{incident.incidentType}</span>
                {incident.cost > 0 && (
                  <span className="cost">
                    ${(incident.cost / 1000).toFixed(0)}K impact
                  </span>
                )}
                <span className="similarity">
                  {(incident.similarity * 100).toFixed(0)}% similar to your system
                </span>
              </div>
            </div>
          </div>
        ))}

        <button onClick={() => showAllIncidents(question.relatedIncidents)}>
          View all {question.evidence.incidentCount} incidents
        </button>
      </div>
    </div>
  )
}
```

### Option 3: Full Incident Modal

Show complete incident details when user clicks "View all incidents":

```tsx
function IncidentModal({ incidents }: { incidents: IncidentMatch[] }) {
  return (
    <Modal>
      <h2>Related Security Incidents ({incidents.length})</h2>

      <div className="filters">
        <select onChange={(e) => filterBySeverity(e.target.value)}>
          <option>All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
        </select>

        <select onChange={(e) => filterByType(e.target.value)}>
          <option>All Types</option>
          <option value="ransomware">Ransomware</option>
          <option value="data breach">Data Breach</option>
          <option value="api">API Vulnerability</option>
        </select>
      </div>

      <div className="incident-list">
        {incidents
          .sort((a, b) => b.similarity - a.similarity)  // Sort by relevance
          .map((incident) => (
            <div key={incident.id} className="incident-full">
              <div className="incident-header">
                <h3>{incident.organization || 'Organization'}</h3>
                <div className="badges">
                  <span className="severity">{incident.severity}</span>
                  <span className="type">{incident.incidentType}</span>
                  <span className="similarity">
                    {(incident.similarity * 100).toFixed(0)}% match
                  </span>
                </div>
              </div>

              <div className="incident-details">
                <p className="description">{incident.embeddingText}</p>

                <div className="metadata">
                  {incident.industry && (
                    <span>Industry: {incident.industry}</span>
                  )}
                  {incident.incidentDate && (
                    <span>Date: {new Date(incident.incidentDate).toLocaleDateString()}</span>
                  )}
                  {incident.estimatedCost && (
                    <span>Cost: ${(incident.estimatedCost / 1000).toFixed(0)}K</span>
                  )}
                  {incident.recordsAffected && (
                    <span>Records: {incident.recordsAffected.toLocaleString()}</span>
                  )}
                  {incident.downtimeHours && (
                    <span>Downtime: {incident.downtimeHours}h</span>
                  )}
                </div>

                <div className="controls">
                  {incident.hadMfa !== null && (
                    <span className={incident.hadMfa ? 'yes' : 'no'}>
                      MFA: {incident.hadMfa ? '✓' : '✗'}
                    </span>
                  )}
                  {incident.hadBackups !== null && (
                    <span className={incident.hadBackups ? 'yes' : 'no'}>
                      Backups: {incident.hadBackups ? '✓' : '✗'}
                    </span>
                  )}
                  {incident.hadIrPlan !== null && (
                    <span className={incident.hadIrPlan ? 'yes' : 'no'}>
                      IR Plan: {incident.hadIrPlan ? '✓' : '✗'}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
      </div>
    </Modal>
  )
}
```

## Best Practices for UI Team

### 1. Always Show Incident Count

Make it visible that questions are evidence-based:

```tsx
// ✅ Good
"Based on 42 incidents (87% relevance)"

// ❌ Bad
"AI-generated question"
```

### 2. Sort by Similarity Score

When displaying incidents, always sort by `similarity` field (descending):

```tsx
const sortedIncidents = question.relatedIncidents
  .sort((a, b) => b.similarity - a.similarity)
  .slice(0, 10)  // Top 10 most relevant
```

### 3. Use Severity Color Coding

Visual hierarchy for severity:

```css
.severity-critical { background: #dc2626; }
.severity-high { background: #ea580c; }
.severity-medium { background: #f59e0b; }
.severity-low { background: #84cc16; }
```

### 4. Highlight Cost Impact

Emphasize financial impact when available:

```tsx
{incident.estimatedCost && (
  <div className="cost-impact">
    💰 ${(incident.estimatedCost / 1_000).toFixed(0)}K estimated impact
  </div>
)}
```

### 5. Show Security Controls

Display what security controls were present:

```tsx
<div className="security-controls">
  <span className={incident.hadMfa ? 'present' : 'absent'}>
    {incident.hadMfa ? '🔒 Had MFA' : '⚠️ No MFA'}
  </span>
  <span className={incident.hadBackups ? 'present' : 'absent'}>
    {incident.hadBackups ? '💾 Had Backups' : '⚠️ No Backups'}
  </span>
</div>
```

## API Response Example

When you call `GET /api/review/:id/generate-questions`, you'll receive:

```json
{
  "riskQuestions": [
    {
      "id": "q_ai_model_security",
      "label": "How do you protect AI models from adversarial attacks and prompt injection?",
      "description": "AI models can be manipulated...",

      "evidence": {
        "incidentCount": 15,
        "avgSeverity": 7.2,
        "relevanceScore": 0.842,
        "recentExamples": [
          {
            "id": "inc_2024_openai_prompt",
            "title": "OpenAI GPT-4 Jailbreak via Prompt Injection",
            "organization": "OpenAI",
            "date": "2024-03-15T00:00:00Z",
            "severity": 8,
            "incidentType": "Prompt Injection",
            "category": "AI Security",
            "estimatedCost": 0,
            "cost": 0,
            "similarity": 0.87,
            "relevanceScore": 0.91
          },
          // ... 4 more examples
        ]
      },

      "relatedIncidents": [
        {
          "id": "qdrant_12345",
          "incidentId": "qdrant_12345",
          "incidentType": "Prompt Injection",
          "organization": "OpenAI",
          "industry": "ai_research",
          "severity": "high",
          "incidentDate": "2024-03-15T00:00:00.000Z",
          "estimatedCost": 0,
          "similarity": 0.87,
          "embeddingText": "vulnerability prompt injection jailbreak GPT-4 OpenAI March 2024",
          "hadMfa": null,
          "hadBackups": null,
          "hadIrPlan": null
        },
        // ... 14 more incidents
      ],

      "finalWeight": 8.4,
      "evidenceWeight": 0.78,
      "weightageExplanation": "High weight due to 15 incidents with avg severity 7.2/10"
    }
  ],
  "complianceQuestions": [...],
  "statistics": {
    "totalIncidents": 100,
    "similarIncidentsCount": 100,
    "incidentSearchCount": 100
  }
}
```

## UI/UX Recommendations

### Progressive Disclosure

1. **Question Card (Collapsed)**: Show count + relevance badge
2. **Question Card (Expanded)**: Show top 3 incidents inline
3. **Modal/Drawer**: Show all incidents with filtering

### Trust Building

- Always display incident count prominently
- Show similarity scores to demonstrate relevance
- Link to incident details when possible
- Display cost impacts to show real-world consequences

### Filtering & Sorting

Allow users to filter incidents by:
- Severity (critical, high, medium, low)
- Incident type (ransomware, data breach, etc.)
- Date range
- Cost impact range
- Presence of security controls (MFA, backups, IR plan)

## Notes

- **Incident Count**: Top risk questions typically have 10-15 incidents, compliance questions have 5-10
- **Similarity Scores**: Range from 0.3 to 1.0 (we filter out < 0.3 as irrelevant)
- **Data Freshness**: Incidents are updated continuously via crawler pipeline
- **Backward Compatibility**: Use `relatedIncidents` OR `similarIncidents` (they're the same array)

## Questions?

Contact the backend team if you need:
- Additional incident fields exposed
- Different sorting/filtering options
- Custom aggregations
- Real-time incident updates
