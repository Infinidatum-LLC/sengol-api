/**
 * Diagnostic script to troubleshoot dynamic question generation
 *
 * This script will test the question generation system and identify issues.
 */

// CRITICAL: Load environment variables BEFORE any imports
// This must happen first because some modules initialize Google Cloud clients at import time
require('dotenv').config()

import { generateDynamicQuestions } from '../src/services/dynamic-question-generator'
import { prisma } from '../src/lib/prisma'

async function main() {
  console.log('🔍 Dynamic Question Generation Diagnostic Tool\n')
  console.log('=' .repeat(60))

  // Test 1: Check environment variables
  console.log('\n📋 Test 1: Checking environment variables...')
  const requiredEnvVars = [
    'GOOGLE_CLOUD_PROJECT',
    'VERTEX_AI_LOCATION',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GCS_BUCKET_NAME',
    'UPSTASH_REDIS_REST_URL',
    'UPSTASH_REDIS_REST_TOKEN'
  ]

  const missingVars: string[] = []
  for (const varName of requiredEnvVars) {
    const value = process.env[varName]
    if (!value) {
      console.log(`  ❌ ${varName}: MISSING`)
      missingVars.push(varName)
    } else {
      // Show truncated value for security
      const displayValue = value.length > 30 ? value.substring(0, 30) + '...' : value
      console.log(`  ✅ ${varName}: ${displayValue}`)
    }
  }

  if (missingVars.length > 0) {
    console.error(`\n⚠️  Missing environment variables: ${missingVars.join(', ')}`)
    console.error('   These are required for question generation to work.')
    console.error('   Please check your .env file.')
    process.exit(1)
  }

  // Test 2: Check database connection
  console.log('\n📋 Test 2: Checking database connection...')
  try {
    const userCount = await prisma.user.count()
    console.log(`  ✅ Database connected (${userCount} users found)`)
  } catch (error) {
    console.error(`  ❌ Database connection failed:`, error)
    process.exit(1)
  }

  // Test 3: Check for existing risk assessments
  console.log('\n📋 Test 3: Checking for risk assessments...')
  const assessments = await prisma.riskAssessment.findMany({
    take: 5,
    select: {
      id: true,
      name: true,
      systemDescription: true,
      dynamicQuestions: true,
      questionGeneratedAt: true,
    },
    orderBy: { createdAt: 'desc' }
  })

  console.log(`  Found ${assessments.length} risk assessments`)

  for (const assessment of assessments) {
    const hasQuestions = assessment.dynamicQuestions !== null
    const questionCount = hasQuestions
      ? (assessment.dynamicQuestions as any)?.riskQuestions?.length || 0
      : 0

    console.log(`\n  Assessment: ${assessment.name || assessment.id}`)
    console.log(`    System Description: ${assessment.systemDescription ? 'Present' : 'Missing'}`)
    console.log(`    Dynamic Questions: ${hasQuestions ? `✅ ${questionCount} questions` : '❌ Not generated'}`)
    console.log(`    Generated At: ${assessment.questionGeneratedAt || 'Never'}`)
  }

  // Test 4: Try generating questions with a test scenario
  console.log('\n📋 Test 4: Testing question generation with sample system...')

  const testScenario = {
    systemDescription: 'A healthcare application that uses GPT-4 to analyze patient medical records and provide diagnostic suggestions. The system stores PHI data in a PostgreSQL database hosted on AWS, and uses OpenAI API for AI processing.',
    selectedDomains: ['ai', 'cyber', 'cloud'],
    industry: 'healthcare',
    techStack: ['GPT-4', 'PostgreSQL', 'AWS', 'OpenAI API'],
    dataTypes: ['PHI', 'Medical Records', 'Patient Data'],
    jurisdictions: ['US'],
    questionIntensity: 'high' as const
  }

  console.log(`  Scenario: ${testScenario.systemDescription.substring(0, 100)}...`)
  console.log(`  Domains: ${testScenario.selectedDomains.join(', ')}`)
  console.log(`  Industry: ${testScenario.industry}`)

  try {
    const startTime = Date.now()
    const result = await generateDynamicQuestions(testScenario)
    const duration = ((Date.now() - startTime) / 1000).toFixed(1)

    console.log(`\n  ✅ Question generation successful!`)
    console.log(`  ⏱️  Duration: ${duration}s`)
    console.log(`  📊 Results:`)
    console.log(`     - Risk questions: ${result.riskQuestions.length}`)
    console.log(`     - Compliance questions: ${result.complianceQuestions.length}`)
    console.log(`     - Total: ${result.riskQuestions.length + result.complianceQuestions.length}`)
    console.log(`     - Incidents analyzed: ${result.incidentSummary.totalIncidentsAnalyzed}`)
    console.log(`     - Avg incident cost: $${result.incidentSummary.avgIncidentCost.toLocaleString()}`)

    if (result.riskQuestions.length > 0) {
      console.log(`\n  Sample questions generated:`)
      result.riskQuestions.slice(0, 3).forEach((q, i) => {
        console.log(`\n  ${i + 1}. [${q.priority.toUpperCase()}] ${q.label}`)
        console.log(`     Question: ${q.text || q.question}`)
        console.log(`     Weight: ${(q.finalWeight * 100).toFixed(0)}%`)
        console.log(`     Evidence: ${q.evidence.incidentCount} incidents`)
      })
    }

    if (result.riskQuestions.length === 0 && result.complianceQuestions.length === 0) {
      console.warn(`\n  ⚠️  WARNING: No questions were generated!`)
      console.warn(`     This could mean:`)
      console.warn(`     1. Vertex AI didn't return any similar incidents`)
      console.warn(`     2. All questions were filtered out due to low weight/relevance`)
      console.warn(`     3. LLM failed to generate questions`)
    }

  } catch (error) {
    console.error(`\n  ❌ Question generation failed!`)
    console.error(`  Error:`, error)

    if (error instanceof Error) {
      console.error(`  Message: ${error.message}`)
      console.error(`  Stack:`, error.stack)
    }

    console.error(`\n  Possible causes:`)
    console.error(`  1. Google Cloud authentication issues (check GOOGLE_APPLICATION_CREDENTIALS)`)
    console.error(`  2. Vertex AI connection issues (check GOOGLE_CLOUD_PROJECT, VERTEX_AI_LOCATION)`)
    console.error(`  3. GCS bucket access issues (check GCS_BUCKET_NAME and permissions)`)
    console.error(`  4. Network connectivity problems`)
    console.error(`  5. Insufficient Google Cloud permissions`)
    process.exit(1)
  }

  // Test 5: Check if questions can be saved
  console.log('\n📋 Test 5: Testing question persistence...')

  try {
    // Find or create a test assessment
    let testAssessment = await prisma.riskAssessment.findFirst({
      where: {
        name: 'DIAGNOSTIC_TEST_ASSESSMENT'
      }
    })

    if (!testAssessment) {
      // Get first user
      const user = await prisma.user.findFirst()
      if (!user) {
        console.warn(`  ⚠️  No users found, skipping persistence test`)
      } else {
        testAssessment = await prisma.riskAssessment.create({
          data: {
            name: 'DIAGNOSTIC_TEST_ASSESSMENT',
            userId: user.id,
            systemDescription: testScenario.systemDescription,
            industry: testScenario.industry,
            techStack: testScenario.techStack,
            dataTypes: testScenario.dataTypes,
          }
        })
        console.log(`  Created test assessment: ${testAssessment.id}`)
      }
    }

    if (testAssessment) {
      // Try to save questions
      const result = await generateDynamicQuestions(testScenario)

      await prisma.riskAssessment.update({
        where: { id: testAssessment.id },
        data: {
          dynamicQuestions: result as any,
          questionGeneratedAt: new Date()
        }
      })

      console.log(`  ✅ Questions saved to assessment ${testAssessment.id}`)

      // Verify retrieval
      const retrieved = await prisma.riskAssessment.findUnique({
        where: { id: testAssessment.id },
        select: {
          dynamicQuestions: true,
          questionGeneratedAt: true
        }
      })

      if (retrieved?.dynamicQuestions) {
        const questions = retrieved.dynamicQuestions as any
        console.log(`  ✅ Questions retrieved successfully`)
        console.log(`     Risk: ${questions.riskQuestions?.length || 0}`)
        console.log(`     Compliance: ${questions.complianceQuestions?.length || 0}`)
      } else {
        console.error(`  ❌ Failed to retrieve saved questions`)
      }
    }
  } catch (error) {
    console.error(`  ❌ Persistence test failed:`, error)
  }

  console.log('\n' + '='.repeat(60))
  console.log('✅ Diagnostic complete!')
  console.log('\n📝 Summary:')
  console.log('  1. Environment variables: ✅ All present')
  console.log('  2. Database connection: ✅ Working')
  console.log('  3. Question generation: Check results above')
  console.log('  4. Question persistence: Check results above')

  await prisma.$disconnect()
}

main().catch((error) => {
  console.error('❌ Diagnostic script failed:', error)
  process.exit(1)
})
