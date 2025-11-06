/**
 * System Analysis Service
 *
 * Analyzes system descriptions using LLM to suggest tech stack,
 * data types, and industry classification
 */

import { resilientOpenAIClient } from '../lib/openai-resilient'

interface SystemAnalysisResult {
  techStack: {
    detected: string[]
    aiML: string[]
    dataStorage: string[]
    infrastructure: string[]
    mlops: string[]
    security: string[]
    monitoring: string[]
    integration: string[]
  }
  dataTypes: {
    detected: string[]
    allOptions: string[]
  }
  industry: string
}

/**
 * Analyze system description and suggest tech stack, data types, and industry
 */
export async function analyzeSystem(systemDescription: string): Promise<SystemAnalysisResult> {
  console.log('[SystemAnalysis] Analyzing system description...')

  const prompt = `You are an expert system architect and technology consultant. Analyze the following system description and provide detailed suggestions.

**SYSTEM DESCRIPTION:**
${systemDescription}

**TASK:**
Provide a JSON response with:

1. **techStack**: Categorize technologies the system likely uses or should use:
   - detected: Technologies explicitly mentioned or strongly implied in the description
   - aiML: AI/ML technologies (e.g., GPT-4, TensorFlow, PyTorch, Claude, Llama, BERT, scikit-learn)
   - dataStorage: Databases and storage (e.g., PostgreSQL, MongoDB, Redis, Elasticsearch, S3, DynamoDB)
   - infrastructure: Cloud and infrastructure (e.g., AWS, Azure, GCP, Docker, Kubernetes, Terraform)
   - mlops: MLOps tools (e.g., MLflow, Weights & Biases, Kubeflow, SageMaker, Vertex AI)
   - security: Security tools (e.g., HashiCorp Vault, AWS KMS, OAuth, Auth0, Okta)
   - monitoring: Monitoring and observability (e.g., Datadog, Prometheus, Grafana, New Relic, Sentry)
   - integration: Integration and messaging (e.g., Kafka, RabbitMQ, API Gateway, GraphQL, REST)

2. **dataTypes**: Types of data the system handles:
   - detected: Data types explicitly mentioned or strongly implied
   - allOptions: All data types that might be relevant (include: PII, Financial Data, Health Records, Biometric Data, Payment Card Data, Customer Data, Analytics Data, System Logs, API Keys, Credentials, User Content, Transaction Records, Intellectual Property, Trade Secrets, Employee Data, Legal Documents, Contracts, Research Data, Telemetry Data, Location Data)

3. **industry**: Primary industry (e.g., E-commerce, Healthcare, Finance, Technology, Manufacturing, Education, Government, Retail, Telecommunications, Energy, Transportation, Media & Entertainment, Professional Services)

**GUIDELINES:**
- Be comprehensive but accurate - only include technologies that are likely relevant
- For "detected", only include what's explicitly mentioned or strongly implied
- For suggestions (aiML, dataStorage, etc.), include technologies that would be appropriate for this type of system
- Provide at least 5-8 options per technology category
- Be specific with technology names (e.g., "PostgreSQL" not just "Database")
- For data types, be thorough - systems often handle more data types than initially obvious

Return ONLY valid JSON in this exact format:
{
  "techStack": {
    "detected": ["Tech1", "Tech2"],
    "aiML": ["GPT-4", "TensorFlow", ...],
    "dataStorage": ["PostgreSQL", "Redis", ...],
    "infrastructure": ["AWS", "Docker", ...],
    "mlops": ["MLflow", "SageMaker", ...],
    "security": ["HashiCorp Vault", "Auth0", ...],
    "monitoring": ["Datadog", "Prometheus", ...],
    "integration": ["Kafka", "REST API", ...]
  },
  "dataTypes": {
    "detected": ["PII", "Customer Data"],
    "allOptions": ["PII", "Financial Data", "Customer Data", ...]
  },
  "industry": "E-commerce"
}`

  try {
    const response = await resilientOpenAIClient.chatCompletion(
      [{ role: 'user', content: prompt }],
      {
        model: 'gpt-4o-mini',
        temperature: 0.5,
        maxTokens: 800,
        responseFormat: { type: 'json_object' },
      }
    )

    const analysis: SystemAnalysisResult = JSON.parse(response)

    // Validate and ensure all required fields exist
    if (!analysis.techStack) {
      analysis.techStack = {
        detected: [],
        aiML: [],
        dataStorage: [],
        infrastructure: [],
        mlops: [],
        security: [],
        monitoring: [],
        integration: [],
      }
    }

    if (!analysis.dataTypes) {
      analysis.dataTypes = {
        detected: [],
        allOptions: [
          'PII',
          'Financial Data',
          'Customer Data',
          'Analytics Data',
          'System Logs',
          'API Keys',
          'User Content',
          'Transaction Records',
        ],
      }
    }

    if (!analysis.industry) {
      analysis.industry = 'Technology'
    }

    console.log(`[SystemAnalysis] Detected industry: ${analysis.industry}`)
    console.log(`[SystemAnalysis] Detected ${analysis.techStack.detected.length} technologies`)
    console.log(`[SystemAnalysis] Detected ${analysis.dataTypes.detected.length} data types`)

    return analysis
  } catch (error) {
    console.error('[SystemAnalysis] Error:', error)

    // Return fallback analysis if LLM fails
    return {
      techStack: {
        detected: [],
        aiML: ['GPT-4', 'TensorFlow', 'PyTorch', 'scikit-learn', 'Claude'],
        dataStorage: ['PostgreSQL', 'MongoDB', 'Redis', 'Elasticsearch', 'S3'],
        infrastructure: ['AWS', 'Docker', 'Kubernetes', 'Azure', 'GCP'],
        mlops: ['MLflow', 'Weights & Biases', 'SageMaker', 'Kubeflow'],
        security: ['HashiCorp Vault', 'Auth0', 'AWS KMS', 'OAuth', 'JWT'],
        monitoring: ['Datadog', 'Prometheus', 'Grafana', 'New Relic', 'Sentry'],
        integration: ['REST API', 'GraphQL', 'Kafka', 'RabbitMQ', 'WebSocket'],
      },
      dataTypes: {
        detected: [],
        allOptions: [
          'PII',
          'Financial Data',
          'Health Records',
          'Customer Data',
          'Analytics Data',
          'System Logs',
          'API Keys',
          'User Content',
          'Transaction Records',
        ],
      },
      industry: 'Technology',
    }
  }
}
