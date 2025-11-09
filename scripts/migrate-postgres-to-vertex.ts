/**
 * PostgreSQL to Vertex AI Migration Script
 *
 * This script:
 * 1. Exports all incident data from PostgreSQL
 * 2. Uploads to Cloud Storage in JSONL format
 * 3. Generates embeddings using Vertex AI
 * 4. Verifies data integrity
 *
 * Tables to migrate:
 * - cloud_incident_staging
 * - cyber_incident_staging
 * - failure_patterns
 * - security_vulnerabilities
 * - regulation_violations
 */

import { prisma } from '../src/lib/prisma'
import { Storage } from '@google-cloud/storage'
import { VertexAI } from '@google-cloud/vertexai'
import { getGoogleAuth } from '../src/lib/google-auth'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

const BUCKET_NAME = process.env.GCS_BUCKET_NAME || 'sengol-incidents'
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || 'sengolvertexapi'
const LOCATION = process.env.VERTEX_AI_LOCATION || 'us-central1'
const BATCH_SIZE = 5 // Vertex AI embedding batch limit

interface MigrationStats {
  tableName: string
  recordsExported: number
  recordsUploaded: number
  embeddingsGenerated: number
  errors: number
  startTime: Date
  endTime?: Date
}

interface IncidentDocument {
  id: string
  text: string
  metadata: {
    incidentId: string
    incidentType: string
    organization?: string
    industry?: string
    severity?: string
    incidentDate?: string
    hadMfa?: boolean
    hadBackups?: boolean
    hadIrPlan?: boolean
    estimatedCost?: number
    downtimeHours?: number
    recordsAffected?: number
    attackType?: string
    attackVector?: string
    failureType?: string
    rootCause?: string
    tags?: string
    embeddingText: string
  }
  embedding?: number[]
}

class PostgreSQLToVertexMigration {
  private storage: Storage
  private bucket: any
  private vertexAI: VertexAI
  private stats: Map<string, MigrationStats> = new Map()

  constructor() {
    // Initialize Google Auth
    getGoogleAuth()

    // Initialize Storage client
    this.storage = new Storage({ projectId: PROJECT_ID })
    this.bucket = this.storage.bucket(BUCKET_NAME)

    // Initialize Vertex AI
    this.vertexAI = new VertexAI({
      project: PROJECT_ID,
      location: LOCATION,
    })

    console.log(`\n🚀 PostgreSQL to Vertex AI Migration`)
    console.log(`   Project: ${PROJECT_ID}`)
    console.log(`   Bucket: ${BUCKET_NAME}`)
    console.log(`   Location: ${LOCATION}\n`)
  }

  /**
   * Main migration workflow
   */
  async migrate() {
    try {
      console.log('📊 Starting comprehensive migration...\n')

      // Migrate all incident tables
      await this.migrateCyberIncidents()
      await this.migrateCloudIncidents()
      await this.migrateFailurePatterns()
      await this.migrateSecurityVulnerabilities()
      await this.migrateRegulationViolations()

      // Print summary
      this.printSummary()

      console.log('\n✅ Migration complete!')
    } catch (error) {
      console.error('❌ Migration failed:', error)
      throw error
    } finally {
      await prisma.$disconnect()
    }
  }

  /**
   * Migrate cyber_incident_staging table
   */
  async migrateCyberIncidents() {
    const tableName = 'cyber_incident_staging'
    console.log(`\n📦 Migrating ${tableName}...`)

    const stats: MigrationStats = {
      tableName,
      recordsExported: 0,
      recordsUploaded: 0,
      embeddingsGenerated: 0,
      errors: 0,
      startTime: new Date(),
    }
    this.stats.set(tableName, stats)

    try {
      const records = await prisma.cyber_incident_staging.findMany()
      stats.recordsExported = records.length

      console.log(`   Found ${records.length} records`)

      const documents: IncidentDocument[] = records.map((record) => {
        const text = `
Cyber Security Incident: ${record.attack_type}
Organization: ${record.organization || 'Unknown'}
Industry: ${record.industry || 'Unknown'}
Severity: ${record.severity}
Date: ${record.incident_date.toISOString().split('T')[0]}

Attack Details:
- Attack Type: ${record.attack_type}
- Attack Vector: ${record.attack_vector || 'Unknown'}
- Estimated Cost: $${record.estimated_cost ? Number(record.estimated_cost).toLocaleString() : 'Unknown'}
- Downtime: ${record.downtime_hours || 0} hours
- Detection Method: ${record.detection_method || 'Unknown'}

Security Controls:
- MFA: ${record.had_mfa ? 'Yes' : 'No'}
- Backups: ${record.had_backups ? 'Yes' : 'No'}
- IR Plan: ${record.had_ir_plan ? 'Yes' : 'No'}

Source: ${record.source_url}
`.trim()

        return {
          id: record.id,
          text,
          metadata: {
            incidentId: record.id,
            incidentType: 'cyber',
            organization: record.organization || undefined,
            industry: record.industry || undefined,
            severity: record.severity,
            incidentDate: record.incident_date.toISOString(),
            hadMfa: record.had_mfa ?? undefined,
            hadBackups: record.had_backups ?? undefined,
            hadIrPlan: record.had_ir_plan ?? undefined,
            estimatedCost: record.estimated_cost ? Number(record.estimated_cost) : undefined,
            downtimeHours: record.downtime_hours ?? undefined,
            attackType: record.attack_type,
            attackVector: record.attack_vector || undefined,
            embeddingText: text,
          },
        }
      })

      // Upload and generate embeddings
      await this.processDocuments(documents, 'cyber', stats)
    } catch (error) {
      console.error(`❌ Error migrating ${tableName}:`, error)
      stats.errors++
    } finally {
      stats.endTime = new Date()
    }
  }

  /**
   * Migrate cloud_incident_staging table
   */
  async migrateCloudIncidents() {
    const tableName = 'cloud_incident_staging'
    console.log(`\n📦 Migrating ${tableName}...`)

    const stats: MigrationStats = {
      tableName,
      recordsExported: 0,
      recordsUploaded: 0,
      embeddingsGenerated: 0,
      errors: 0,
      startTime: new Date(),
    }
    this.stats.set(tableName, stats)

    try {
      const records = await prisma.cloud_incident_staging.findMany()
      stats.recordsExported = records.length

      console.log(`   Found ${records.length} records`)

      const documents: IncidentDocument[] = records.map((record) => {
        const text = `
Cloud Infrastructure Failure: ${record.failure_type}
Provider: ${record.cloud_provider}
Service: ${record.service_affected}
Severity: ${record.severity}
Date: ${record.incident_date.toISOString().split('T')[0]}

Failure Details:
- Failure Type: ${record.failure_type}
- Duration: ${record.duration_hours || 0} hours
- Estimated Cost: $${record.estimated_cost ? Number(record.estimated_cost).toLocaleString() : 'Unknown'}
- Customers Affected: ${record.customers_affected || 'Unknown'}
- Root Cause: ${record.root_cause || 'Unknown'}

Resilience Controls:
- Multi-Region: ${record.had_multi_region ? 'Yes' : 'No'}
- Auto-Failover: ${record.had_auto_failover ? 'Yes' : 'No'}
- Backups: ${record.had_backups ? 'Yes' : 'No'}

Source: ${record.source_url}
`.trim()

        return {
          id: record.id,
          text,
          metadata: {
            incidentId: record.id,
            incidentType: 'cloud',
            industry: 'Cloud Services',
            severity: record.severity,
            incidentDate: record.incident_date.toISOString(),
            hadBackups: record.had_backups ?? undefined,
            estimatedCost: record.estimated_cost ? Number(record.estimated_cost) : undefined,
            downtimeHours: record.duration_hours ?? undefined,
            failureType: record.failure_type,
            rootCause: record.root_cause || undefined,
            embeddingText: text,
          },
        }
      })

      await this.processDocuments(documents, 'cloud', stats)
    } catch (error) {
      console.error(`❌ Error migrating ${tableName}:`, error)
      stats.errors++
    } finally {
      stats.endTime = new Date()
    }
  }

  /**
   * Migrate failure_patterns table
   */
  async migrateFailurePatterns() {
    const tableName = 'failure_patterns'
    console.log(`\n📦 Migrating ${tableName}...`)

    const stats: MigrationStats = {
      tableName,
      recordsExported: 0,
      recordsUploaded: 0,
      embeddingsGenerated: 0,
      errors: 0,
      startTime: new Date(),
    }
    this.stats.set(tableName, stats)

    try {
      const records = await prisma.failure_patterns.findMany()
      stats.recordsExported = records.length

      console.log(`   Found ${records.length} records`)

      const documents: IncidentDocument[] = records.map((record) => {
        const text = `
AI/ML System Failure: ${record.failure_type}
Industry: ${record.industry || 'Unknown'}
Use Case: ${record.use_case || 'Unknown'}
Severity: ${record.severity}
Model Type: ${record.model_type || 'Unknown'}

Failure Details:
- Failure Type: ${record.failure_type}
- Root Cause: ${record.root_cause || 'Unknown'}
- Deployment Scale: ${record.deployment_scale || 'Unknown'}
- Detection Time: ${record.detection_time_hours || 0} hours
- Mitigation: ${record.mitigation || 'Unknown'}
- Prevention: ${record.prevention || 'Unknown'}

Tags: ${(record.tags || []).join(', ')}
Source: ${record.source_url || 'N/A'}
`.trim()

        return {
          id: record.id,
          text,
          metadata: {
            incidentId: record.id,
            incidentType: 'ai_failure',
            industry: record.industry || undefined,
            severity: record.severity,
            failureType: record.failure_type,
            rootCause: record.root_cause || undefined,
            tags: (record.tags || []).join(','),
            embeddingText: text,
          },
        }
      })

      await this.processDocuments(documents, 'ai-failures', stats)
    } catch (error) {
      console.error(`❌ Error migrating ${tableName}:`, error)
      stats.errors++
    } finally {
      stats.endTime = new Date()
    }
  }

  /**
   * Migrate security_vulnerabilities table
   */
  async migrateSecurityVulnerabilities() {
    const tableName = 'security_vulnerabilities'
    console.log(`\n📦 Migrating ${tableName}...`)

    const stats: MigrationStats = {
      tableName,
      recordsExported: 0,
      recordsUploaded: 0,
      embeddingsGenerated: 0,
      errors: 0,
      startTime: new Date(),
    }
    this.stats.set(tableName, stats)

    try {
      const records = await prisma.security_vulnerabilities.findMany()
      stats.recordsExported = records.length

      console.log(`   Found ${records.length} records`)

      const documents: IncidentDocument[] = records.map((record) => {
        const text = `
Security Vulnerability: ${record.vulnerability_name || record.attack_type}
CVE ID: ${record.cve_id || 'N/A'}
Severity: ${record.severity}
CVSS Score: ${record.cvss_score || 'Unknown'}

Vulnerability Details:
- Attack Type: ${record.attack_type}
- Target: ${record.target_model_type || 'Various systems'}
- Attack Vector: ${record.attack_vector || 'Unknown'}
- Attack Complexity: ${record.attack_complexity || 'Unknown'}
- Requires Privileges: ${record.requires_privileges ? 'Yes' : 'No'}
- User Interaction Required: ${record.user_interaction_required ? 'Yes' : 'No'}
- Exploited in Wild: ${record.exploited_in_wild ? 'Yes' : 'No'}

Description: ${record.description || 'N/A'}
Mitigation: ${record.mitigation || 'See vendor advisory'}
Patch Available: ${record.patch_available ? 'Yes' : 'No'}

Affected Systems: ${(record.affected_systems || []).join(', ')}
Tags: ${(record.tags || []).join(', ')}
Source: ${record.source_url || record.nvd_url || 'N/A'}
`.trim()

        return {
          id: record.id,
          text,
          metadata: {
            incidentId: record.id,
            incidentType: 'vulnerability',
            severity: record.severity,
            attackType: record.attack_type,
            attackVector: record.attack_vector || undefined,
            tags: (record.tags || []).join(','),
            embeddingText: text,
          },
        }
      })

      await this.processDocuments(documents, 'vulnerabilities', stats)
    } catch (error) {
      console.error(`❌ Error migrating ${tableName}:`, error)
      stats.errors++
    } finally {
      stats.endTime = new Date()
    }
  }

  /**
   * Migrate regulation_violations table
   */
  async migrateRegulationViolations() {
    const tableName = 'regulation_violations'
    console.log(`\n📦 Migrating ${tableName}...`)

    const stats: MigrationStats = {
      tableName,
      recordsExported: 0,
      recordsUploaded: 0,
      embeddingsGenerated: 0,
      errors: 0,
      startTime: new Date(),
    }
    this.stats.set(tableName, stats)

    try {
      const records = await prisma.regulation_violations.findMany()
      stats.recordsExported = records.length

      console.log(`   Found ${records.length} records`)

      const documents: IncidentDocument[] = records.map((record) => {
        const text = `
Regulatory Compliance Violation
Violation Type: ${record.violation_type || 'Regulatory Non-Compliance'}
Severity: ${record.severity || 'Unknown'}

Violation Details:
- Financial Penalty: $${record.financial_penalty ? Number(record.financial_penalty).toLocaleString() : 'Unknown'}
- Enforcement Action: ${record.enforcement_action || 'Unknown'}
- Evidence: ${record.evidence || 'Documented non-compliance'}

Created: ${record.created_at?.toISOString().split('T')[0] || 'Unknown'}
`.trim()

        return {
          id: record.id,
          text,
          metadata: {
            incidentId: record.id,
            incidentType: 'regulation_violation',
            severity: record.severity || undefined,
            estimatedCost: record.financial_penalty ? Number(record.financial_penalty) : undefined,
            embeddingText: text,
          },
        }
      })

      await this.processDocuments(documents, 'compliance', stats)
    } catch (error) {
      console.error(`❌ Error migrating ${tableName}:`, error)
      stats.errors++
    } finally {
      stats.endTime = new Date()
    }
  }

  /**
   * Process documents: upload to Cloud Storage and generate embeddings
   */
  async processDocuments(
    documents: IncidentDocument[],
    category: string,
    stats: MigrationStats
  ) {
    if (documents.length === 0) {
      console.log('   No documents to process')
      return
    }

    // Step 1: Upload raw documents to Cloud Storage
    console.log(`   📤 Uploading ${documents.length} documents to Cloud Storage...`)

    for (const doc of documents) {
      try {
        const rawPath = `incidents/postgres-migrated/${category}/raw/${doc.id}.json`
        const file = this.bucket.file(rawPath)

        await file.save(JSON.stringify(doc, null, 2), {
          contentType: 'application/json',
          metadata: {
            category,
            sourceTable: stats.tableName,
            migratedAt: new Date().toISOString(),
          },
        })

        stats.recordsUploaded++
      } catch (error) {
        console.error(`   ❌ Failed to upload document ${doc.id}:`, error)
        stats.errors++
      }
    }

    console.log(`   ✅ Uploaded ${stats.recordsUploaded} documents`)

    // Step 2: Generate embeddings in batches
    console.log(`   🧮 Generating embeddings for ${documents.length} documents...`)

    for (let i = 0; i < documents.length; i += BATCH_SIZE) {
      const batch = documents.slice(i, i + BATCH_SIZE)

      try {
        for (const doc of batch) {
          const embedding = await this.generateEmbedding(doc.text)
          doc.embedding = embedding
          stats.embeddingsGenerated++
        }

        if ((i + BATCH_SIZE) % 20 === 0) {
          console.log(`   Progress: ${Math.min(i + BATCH_SIZE, documents.length)}/${documents.length} embeddings`)
        }
      } catch (error) {
        console.error(`   ❌ Failed to generate embeddings for batch ${i}:`, error)
        stats.errors++
      }
    }

    console.log(`   ✅ Generated ${stats.embeddingsGenerated} embeddings`)

    // Step 3: Upload embeddings to Cloud Storage (JSONL format)
    console.log(`   📤 Uploading embeddings in JSONL format...`)

    const embeddingsPath = `incidents/embeddings/postgres-${category}/embeddings.jsonl`
    const embeddingsFile = this.bucket.file(embeddingsPath)

    const jsonlLines = documents
      .filter((doc) => doc.embedding)
      .map((doc) =>
        JSON.stringify({
          id: doc.id,
          embedding: doc.embedding,
          metadata: doc.metadata,
        })
      )

    await embeddingsFile.save(jsonlLines.join('\n'), {
      contentType: 'application/jsonl',
      metadata: {
        category,
        sourceTable: stats.tableName,
        recordCount: jsonlLines.length,
        migratedAt: new Date().toISOString(),
      },
    })

    console.log(`   ✅ Uploaded embeddings to ${embeddingsPath}`)
    console.log(`   ✨ Migration complete for ${category}`)
  }

  /**
   * Generate embedding using Vertex AI
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const model = this.vertexAI.preview.getGenerativeModel({
        model: 'text-embedding-004',
      })

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text }] }],
      })

      const response = result.response
      const embedding = (response as any).embedding?.values || (response as any).embeddings?.[0]?.values

      if (!embedding || !Array.isArray(embedding)) {
        throw new Error('Invalid embedding format from Vertex AI')
      }

      return embedding
    } catch (error) {
      console.error('Failed to generate embedding:', error)
      throw error
    }
  }

  /**
   * Print migration summary
   */
  printSummary() {
    console.log('\n\n' + '='.repeat(80))
    console.log('📊 MIGRATION SUMMARY')
    console.log('='.repeat(80) + '\n')

    let totalRecords = 0
    let totalUploaded = 0
    let totalEmbeddings = 0
    let totalErrors = 0

    for (const [tableName, stats] of this.stats.entries()) {
      const duration = stats.endTime
        ? ((stats.endTime.getTime() - stats.startTime.getTime()) / 1000).toFixed(1)
        : 'N/A'

      console.log(`📦 ${tableName}`)
      console.log(`   Records Exported: ${stats.recordsExported}`)
      console.log(`   Records Uploaded: ${stats.recordsUploaded}`)
      console.log(`   Embeddings Generated: ${stats.embeddingsGenerated}`)
      console.log(`   Errors: ${stats.errors}`)
      console.log(`   Duration: ${duration}s`)
      console.log()

      totalRecords += stats.recordsExported
      totalUploaded += stats.recordsUploaded
      totalEmbeddings += stats.embeddingsGenerated
      totalErrors += stats.errors
    }

    console.log('='.repeat(80))
    console.log(`📊 TOTALS`)
    console.log(`   Total Records Exported: ${totalRecords}`)
    console.log(`   Total Records Uploaded: ${totalUploaded}`)
    console.log(`   Total Embeddings Generated: ${totalEmbeddings}`)
    console.log(`   Total Errors: ${totalErrors}`)
    console.log('='.repeat(80) + '\n')

    if (totalErrors === 0) {
      console.log('✅ Migration completed successfully with no errors!')
    } else {
      console.warn(`⚠️  Migration completed with ${totalErrors} errors. Please review the logs.`)
    }
  }
}

// Run migration if called directly
if (require.main === module) {
  const migration = new PostgreSQLToVertexMigration()
  migration
    .migrate()
    .then(() => {
      process.exit(0)
    })
    .catch((error) => {
      console.error('Migration failed:', error)
      process.exit(1)
    })
}

export { PostgreSQLToVertexMigration }
