# Backend API Specification (api.sengol.ai)

**Purpose**: Move all LLM calls and vector database operations to the backend API to centralize OpenAI API usage, improve security, and enable better rate limiting and monitoring.

---

## Required API Endpoints

### 1. **System Analysis Endpoint**

**Endpoint**: `POST /api/review/analyze-system`

**Purpose**: Analyzes system description using LLM to suggest tech stack, data types, and industry classification.

**Request Body**:
```json
{
  "systemDescription": "AI-powered customer service chatbot for e-commerce platform..."
}
```

**Response**:
```json
{
  "success": true,
  "suggestions": {
    "techStack": {
      "detected": ["GPT-4", "React", "PostgreSQL"],
      "aiML": ["GPT-4", "TensorFlow", "PyTorch", ...],
      "dataStorage": ["PostgreSQL", "MongoDB", "Redis", ...],
      "infrastructure": ["AWS", "Docker", "Kubernetes", ...],
      "mlops": ["MLflow", "Weights & Biases", ...],
      "security": ["HashiCorp Vault", "AWS KMS", ...],
      "monitoring": ["Datadog", "Prometheus", ...],
      "integration": ["Kafka", "RabbitMQ", ...]
    },
    "dataTypes": {
      "detected": ["PII", "Financial Data"],
      "allOptions": ["PII", "Financial Data", "Health Records", ...]
    },
    "industry": "E-commerce"
  }
}
```

**LLM Usage**:
- Model: `gpt-4o-mini`
- Purpose: System architecture analysis and tech stack suggestion
- Temperature: 0.5
- Max Tokens: 800

---

### 2. **Dynamic Question Generation Endpoint**

**Endpoint**: `POST /api/review/{assessmentId}/generate-questions`

**Purpose**: Generates dynamic risk and compliance questions using LLM + vector database search.

**Request Body**:
```json
{
  "systemDescription": "AI-powered customer service chatbot...",
  "technologyStack": ["GPT-4", "React", "PostgreSQL"],
  "industry": "E-commerce",
  "deployment": "cloud",
  "selectedDomains": ["ai", "cyber", "cloud"],
  "jurisdictions": ["US", "EU"],
  "maxQuestions": 15,
  "minWeight": 4.0
}
```

**Response**:
```json
{
  "success": true,
  "data": {
    "riskQuestions": [
      {
        "id": "dynamic_data_breach_1234567890",
        "label": "How do you prevent PII leakage in chat logs?",
        "description": "Evidence from 2,341 incidents with average severity 8.5/10",
        "priority": "high",
        "importance": "Evidence from 2,341 incidents with average severity 8.5/10",
        "examples": [
          "Incident 1: Customer service chatbot exposed PII in logs...",
          "Incident 2: Chat history stored without encryption..."
        ],
        "mitigations": [],
        "regulations": [],
        "evidenceQuery": "data_breach",
        "averageIncidentCost": 2400000,
        "incidentFrequency": "very_common",
        "weight": 9.2,
        "evidence": {
          "incidentCount": 2341,
          "avgSeverity": 8.5,
          "relevanceScore": 0.92,
          "recentExamples": [
            {
              "id": "inc_123",
              "title": "Chatbot PII Leakage Incident",
              "date": "2024-01-15",
              "severity": 9,
              "impact": "Exposed 50K customer records"
            }
          ],
          "statistics": {
            "totalCost": 5600000000,
            "avgCost": 2400000,
            "affectedSystems": 150
          }
        },
        "reasoning": {
          "incidentFrequency": 8.5,
          "avgSeverity": 8.5,
          "techRelevance": 0.92,
          "regulatoryImpact": "high"
        },
        "aiGenerated": true
      }
    ],
    "complianceQuestions": [
      {
        "id": "dynamic_compliance_gdpr_1234567890",
        "label": "Compliance: GDPR Data Processing",
        "description": "Based on 1,876 similar incidents",
        "priority": "high",
        "importance": "Evidence from 1,876 compliance incidents with average severity 8.1/10",
        "examples": ["...", "..."],
        "mitigations": [],
        "regulations": ["GDPR"],
        "evidenceQuery": "gdpr_violation",
        "averageFine": 4500000,
        "weight": 8.1,
        "aiGenerated": true
      }
    ],
    "metadata": {
      "totalRiskQuestions": 25,
      "totalComplianceQuestions": 12,
      "dynamicRiskCount": 15,
      "standardRiskCount": 10,
      "dynamicComplianceCount": 8,
      "standardComplianceCount": 4,
      "avgRiskWeight": 7.2,
      "avgComplianceWeight": 6.8,
      "systemContext": {
        "description": "AI-powered customer service chatbot...",
        "techStack": ["GPT-4", "React", "PostgreSQL"],
        "industry": "E-commerce",
        "deployment": "cloud"
      }
    }
  }
}
```

**LLM Usage**:
- Model: `gpt-4`
- Purpose: Generate context-specific risk assessment questions
- Temperature: 0.7
- Max Tokens: 200 per question
- Calls: Multiple (one per risk category)

**Backend Flow**:
1. Calculate risk weights from vector database (search incidents)
2. Filter top risk categories by weight
3. For each category, call LLM to generate question
4. Search vector database for compliance-related incidents
5. Generate compliance questions based on incidents
6. Merge with standard questions
7. Return combined question set

---

### 3. **Embedding Generation Endpoint**

**Endpoint**: `POST /api/embeddings/generate`

**Purpose**: Generate embeddings for text using OpenAI's embedding model.

**Request Body**:
```json
{
  "text": "AI-powered customer service chatbot for e-commerce platform..."
}
```

**Response**:
```json
{
  "success": true,
  "embedding": [0.123, -0.456, 0.789, ...], // 1536-dimensional vector
  "model": "text-embedding-3-small",
  "dimension": 1536
}
```

**LLM Usage**:
- Model: `text-embedding-3-small`
- Purpose: Generate embeddings for vector database
- Dimension: 1536

---

### 4. **Vector Search Endpoint**

**Endpoint**: `POST /api/embeddings/search`

**Purpose**: Search vector database for similar incidents using text query.

**Request Body**:
```json
{
  "queryText": "AI chatbot PII leakage customer data",
  "filter": {
    "industry": "E-commerce",
    "incidentType": "data_breach",
    "severity": "high"
  },
  "topK": 10,
  "minSimilarity": 0.6
}
```

**Response**:
```json
{
  "success": true,
  "results": [
    {
      "id": "inc_123",
      "score": 0.92,
      "distance": 0.08,
      "metadata": {
        "incidentId": "inc_123",
        "incidentType": "data_breach",
        "organization": "Company XYZ",
        "industry": "E-commerce",
        "severity": "high",
        "incidentDate": "2024-01-15",
        "embeddingText": "Customer service chatbot exposed PII...",
        "estimatedCost": 2400000,
        "recordsAffected": 50000
      }
    }
  ],
  "queryText": "AI chatbot PII leakage customer data",
  "topK": 10,
  "totalResults": 2341
}
```

**Backend Flow**:
1. Generate embedding for query text (calls OpenAI)
2. Search d-vecDB with embedding
3. Apply filters if provided
4. Return top K results sorted by similarity

---

### 5. **Batch Embedding Generation**

**Endpoint**: `POST /api/embeddings/batch-generate`

**Purpose**: Generate embeddings for multiple texts in batch (more efficient).

**Request Body**:
```json
{
  "texts": [
    "Text 1 to embed...",
    "Text 2 to embed...",
    "Text 3 to embed..."
  ]
}
```

**Response**:
```json
{
  "success": true,
  "embeddings": [
    [0.123, -0.456, ...],
    [0.789, -0.123, ...],
    [0.456, -0.789, ...]
  ],
  "model": "text-embedding-3-small",
  "dimension": 1536,
  "count": 3
}
```

**LLM Usage**:
- Model: `text-embedding-3-small`
- Purpose: Batch embedding generation
- Batch size: Up to 2048 texts per request (OpenAI limit)

---

### 6. **Quick Assessment Endpoint**

**Endpoint**: `POST /api/projects/{projectId}/quick-assessment`

**Purpose**: Generate quick risk/compliance assessment using LLM.

**Request Body**:
```json
{
  "systemDescription": "AI-powered customer service chatbot...",
  "type": "risk" // or "compliance"
}
```

**Response**:
```json
{
  "success": true,
  "assessment": "High risk: PII exposure in chat logs (2.3K incidents), prompt injection vulnerabilities (1.2K incidents), GDPR compliance gaps (1.8K incidents).",
  "wordCount": 28,
  "projectName": "Customer Service Chatbot"
}
```

**LLM Usage**:
- Model: `gpt-4o-mini`
- Purpose: Quick 30-word assessment
- Temperature: 0.3
- Max Tokens: 100

---

### 7. **Risk Weight Calculation Endpoint**

**Endpoint**: `POST /api/risk/calculate-weights`

**Purpose**: Calculate risk weights from system context and incident database.

**Request Body**:
```json
{
  "systemDescription": "AI-powered customer service chatbot...",
  "technologyStack": ["GPT-4", "React", "PostgreSQL"],
  "industry": "E-commerce",
  "deployment": "cloud"
}
```

**Response**:
```json
{
  "success": true,
  "riskWeights": [
    {
      "category": "data_breach",
      "weight": 9.2,
      "reasoning": {
        "incidentFrequency": 8.5,
        "avgSeverity": 8.5,
        "techRelevance": 0.92,
        "regulatoryImpact": "high"
      },
      "evidence": {
        "incidentCount": 2341,
        "avgSeverity": 8.5,
        "relevanceScore": 0.92,
        "recentExamples": [...],
        "statistics": {
          "totalCost": 5600000000,
          "avgCost": 2400000,
          "affectedSystems": 150
        }
      }
    }
  ],
  "totalIncidentsAnalyzed": 2341,
  "topCategories": ["data_breach", "prompt_injection", "gdpr_violation"]
}
```

**Backend Flow**:
1. Build query from system context
2. Search vector database (top 100 incidents)
3. Aggregate incidents by category
4. Calculate weights for each category
5. Sort by weight (highest risk first)
6. Return risk weights

---

### 8. **Evidence-Based Analysis Endpoint**

**Endpoint**: `POST /api/risk/evidence-based-analysis`

**Purpose**: Provide evidence-based risk analysis using LLM + incident database.

**Request Body**:
```json
{
  "systemDescription": "AI-powered customer service chatbot...",
  "riskCategory": "data_breach",
  "industry": "E-commerce",
  "maxExamples": 5
}
```

**Response**:
```json
{
  "success": true,
  "analysis": {
    "riskCategory": "data_breach",
    "incidentCount": 2341,
    "avgSeverity": 8.5,
    "keyFindings": [
      "PII exposure in chat logs is the most common vector (45% of incidents)",
      "Average cost per incident: $2.4M",
      "Most affected industries: E-commerce (32%), Healthcare (28%), Finance (18%)"
    ],
    "recentExamples": [
      {
        "id": "inc_123",
        "title": "Chatbot PII Leakage Incident",
        "date": "2024-01-15",
        "severity": 9,
        "impact": "Exposed 50K customer records",
        "cost": 2400000
      }
    ],
    "recommendations": [
      "Implement data encryption for chat logs",
      "Regular PII scanning and redaction",
      "Access controls for chat log storage"
    ]
  }
}
```

**LLM Usage**:
- Model: `gpt-4`
- Purpose: Analyze incident patterns and generate recommendations
- Temperature: 0.5
- Max Tokens: 500

---

## Implementation Priority

### **Phase 1: Critical (Must Have)**
1. ✅ **System Analysis Endpoint** - Currently used in Step 1
2. ✅ **Dynamic Question Generation Endpoint** - Currently used in Step 1
3. ✅ **Vector Search Endpoint** - Used throughout for incident search

### **Phase 2: Important (Should Have)**
4. ✅ **Embedding Generation Endpoint** - For custom vector searches
5. ✅ **Risk Weight Calculation Endpoint** - For dynamic question generation
6. ✅ **Quick Assessment Endpoint** - For project dashboard

### **Phase 3: Nice to Have**
7. ✅ **Batch Embedding Generation** - For bulk operations
8. ✅ **Evidence-Based Analysis Endpoint** - For detailed risk reports

---

## Frontend Integration Changes

### Current Implementation (Local)
```typescript
// app/api/review/analyze-system/route.ts
const completion = await openai.chat.completions.create({...})
```

### New Implementation (Backend API)
```typescript
// app/api/review/analyze-system/route.ts
const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/review/analyze-system`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${process.env.API_AUTH_TOKEN}`
  },
  body: JSON.stringify({ systemDescription })
})
const data = await response.json()
```

### API Client Updates

**File**: `lib/api/client.ts`

Add methods:
```typescript
class ApiClient {
  // ... existing methods ...

  async analyzeSystem(systemDescription: string) {
    return this.request('/api/review/analyze-system', {
      method: 'POST',
      body: JSON.stringify({ systemDescription })
    })
  }

  async generateQuestions(assessmentId: string, data: {
    systemDescription: string
    technologyStack: string[]
    industry: string
    deployment: 'cloud' | 'on-prem' | 'hybrid'
    selectedDomains: string[]
    jurisdictions: string[]
  }) {
    return this.request(`/api/review/${assessmentId}/generate-questions`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }

  async searchIncidents(query: {
    queryText: string
    filter?: {
      industry?: string
      incidentType?: string
      severity?: string
    }
    topK?: number
    minSimilarity?: number
  }) {
    return this.request('/api/embeddings/search', {
      method: 'POST',
      body: JSON.stringify(query)
    })
  }

  async calculateRiskWeights(context: {
    systemDescription: string
    technologyStack: string[]
    industry: string
    deployment: 'cloud' | 'on-prem' | 'hybrid'
  }) {
    return this.request('/api/risk/calculate-weights', {
      method: 'POST',
      body: JSON.stringify(context)
    })
  }

  async quickAssessment(projectId: string, data: {
    systemDescription: string
    type: 'risk' | 'compliance'
  }) {
    return this.request(`/api/projects/${projectId}/quick-assessment`, {
      method: 'POST',
      body: JSON.stringify(data)
    })
  }
}
```

---

## Environment Variables

### Backend API (api.sengol.ai)
```env
OPENAI_API_KEY=sk-...
DVECDB_HOST=99.213.88.59
DVECDB_PORT=8080
DVECDB_COLLECTION=incidents
API_AUTH_TOKEN=your-secret-token
```

### Frontend (Next.js)
```env
NEXT_PUBLIC_API_URL=https://api.sengol.ai
API_AUTH_TOKEN=your-secret-token
```

---

## Error Handling

All endpoints should return consistent error format:
```json
{
  "success": false,
  "error": "Error message",
  "details": "Detailed error information",
  "code": "ERROR_CODE"
}
```

**Error Codes**:
- `UNAUTHORIZED` - Missing or invalid auth token
- `INVALID_INPUT` - Invalid request body
- `OPENAI_ERROR` - OpenAI API error
- `VECTOR_DB_ERROR` - Vector database error
- `RATE_LIMIT_EXCEEDED` - Too many requests
- `INTERNAL_ERROR` - Server error

---

## Rate Limiting

- **LLM Calls**: 100 requests/minute per user
- **Embedding Generation**: 1000 requests/minute per user
- **Vector Search**: 500 requests/minute per user
- **Batch Operations**: 10 requests/minute per user

---

## Authentication

All endpoints require authentication header:
```
Authorization: Bearer {API_AUTH_TOKEN}
```

---

## Testing

Each endpoint should have:
1. Unit tests for request/response validation
2. Integration tests with mock OpenAI responses
3. E2E tests with real API calls (staged)

---

## Monitoring

Track:
- LLM API call costs
- Response times
- Error rates
- Rate limit hits
- Vector database query performance

---

## Migration Checklist

- [ ] Implement all 8 endpoints on backend API
- [ ] Add authentication middleware
- [ ] Add rate limiting
- [ ] Add error handling
- [ ] Add logging and monitoring
- [ ] Update frontend API client
- [ ] Update all Next.js API routes to proxy to backend
- [ ] Remove OpenAI API key from frontend environment
- [ ] Test end-to-end flow
- [ ] Deploy and monitor

