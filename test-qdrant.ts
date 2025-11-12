/**
 * Test the new simplified Qdrant client
 * Run from project root: npx tsx test-qdrant.ts
 */

import { searchIncidents, healthCheck } from './src/lib/qdrant-client'

async function test() {
  console.log('='.repeat(70))
  console.log('TESTING NEW QDRANT CLIENT')
  console.log('='.repeat(70))

  // Test 1: Health check
  console.log('\n[Test 1] Health check...')
  const healthy = await healthCheck()
  console.log(`Health check: ${healthy ? '✅ PASSED' : '❌ FAILED'}`)

  if (!healthy) {
    console.error('Health check failed, aborting tests')
    process.exit(1)
  }

  // Test 2: Search for healthcare AI incidents
  console.log('\n[Test 2] Searching for healthcare AI incidents...')
  const query = 'Healthcare AI chatbot vulnerability data breach patient privacy HIPAA'
  const results = await searchIncidents(query, 10, 0.3)

  console.log(`\n✅ Search returned ${results.length} results`)

  if (results.length > 0) {
    console.log(`\nTop 3 results:`)
    results.slice(0, 3).forEach((r, i) => {
      const content = (r.payload?.content || 'N/A').toString().substring(0, 80)
      console.log(`  ${i+1}. Score: ${r.score.toFixed(4)} - ${content}...`)
    })
  } else {
    console.error('❌ FAILED: No results returned')
    process.exit(1)
  }

  console.log('\n' + '='.repeat(70))
  console.log('🎉 ALL TESTS PASSED')
  console.log('='.repeat(70))
}

test().catch(err => {
  console.error('❌ Test failed:', err)
  process.exit(1)
})
