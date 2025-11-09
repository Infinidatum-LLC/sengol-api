/**
 * Test Dynamic Question Generation with Gemini Grounding
 *
 * This script tests the end-to-end flow:
 * 1. Load incident data from Cloud Storage
 * 2. Use Gemini to rank incidents by relevance
 * 3. Generate dynamic questions based on project context
 */

import { findSimilarIncidents } from '../src/services/incident-search'
import { generateDynamicQuestions } from '../src/services/dynamic-question-generator'

async function testQuestionGeneration() {
  console.log('🧪 Testing Dynamic Question Generation with Gemini Grounding\n')

  // Test project context
  const projectContext = {
    projectName: 'E-Commerce Platform',
    projectDescription: 'Building a cloud-based e-commerce platform for retail customers with payment processing and inventory management',
    industry: 'Retail',
    complianceFrameworks: ['PCI DSS', 'GDPR'],
    organizationSize: 'Medium',
    technologies: ['AWS', 'Node.js', 'PostgreSQL', 'Redis'],
  }

  console.log('📋 Project Context:')
  console.log(JSON.stringify(projectContext, null, 2))
  console.log()

  try {
    // Step 1: Test incident search
    console.log('🔍 Step 1: Testing incident search with Gemini grounding...\n')

    const incidents = await findSimilarIncidents(
      projectContext.projectDescription,
      {
        limit: 10,
        minSimilarity: 0.7,
        industry: projectContext.industry,
      }
    )

    console.log(`✅ Found ${incidents.length} relevant incidents`)

    if (incidents.length > 0) {
      console.log('\n📊 Sample Incidents:')
      incidents.slice(0, 3).forEach((inc, idx) => {
        console.log(`\n${idx + 1}. ${inc.incidentType} - ${inc.severity || 'unknown'} severity`)
        console.log(`   Organization: ${inc.organization || 'N/A'}`)
        console.log(`   Industry: ${inc.industry || 'N/A'}`)
        console.log(`   Similarity: ${inc.similarity.toFixed(3)}`)
        console.log(`   Summary: ${inc.embeddingText.substring(0, 150)}...`)
      })
    }

    // Step 2: Test dynamic question generation
    console.log('\n\n🎯 Step 2: Testing dynamic question generation...\n')

    const questions = await generateDynamicQuestions(
      projectContext.projectDescription,
      {
        industry: projectContext.industry,
        complianceFrameworks: projectContext.complianceFrameworks,
        organizationSize: projectContext.organizationSize,
        technologies: projectContext.technologies,
        maxQuestions: 15,
      }
    )

    console.log(`✅ Generated ${questions.length} dynamic questions`)

    if (questions.length > 0) {
      console.log('\n📝 Sample Questions:')
      questions.slice(0, 5).forEach((q, idx) => {
        console.log(`\n${idx + 1}. ${q.question}`)
        console.log(`   Category: ${q.category}`)
        console.log(`   Risk Level: ${q.riskLevel}`)
        console.log(`   Context: ${q.context.substring(0, 100)}...`)
        console.log(`   Evidence Sources: ${q.evidenceCount} incidents`)
      })
    }

    console.log('\n\n' + '='.repeat(80))
    console.log('✅ TEST PASSED: Question generation working with Gemini grounding!')
    console.log('='.repeat(80))
    console.log('\n📊 Summary:')
    console.log(`   - Incidents found: ${incidents.length}`)
    console.log(`   - Questions generated: ${questions.length}`)
    console.log(`   - Data source: Cloud Storage (Gemini grounding)`)
    console.log(`   - No manual embeddings required ✓`)
    console.log()

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error)
    console.error('\nError details:', error instanceof Error ? error.message : String(error))
    console.error('\nStack trace:', error instanceof Error ? error.stack : '')
    process.exit(1)
  }
}

// Run the test
testQuestionGeneration()
  .then(() => {
    console.log('✅ Test completed successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('❌ Test failed:', error)
    process.exit(1)
  })
