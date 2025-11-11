/**
 * Test Qdrant Vector Search Precision and Recall
 *
 * This script tests the Qdrant vector database to assess:
 * 1. Similarity score distributions
 * 2. Relevance of returned results
 * 3. Whether embeddings are working correctly
 * 4. Precision/recall issues
 */

import { QdrantClient } from '@qdrant/js-client-rest'
import { OpenAI } from 'openai'

const QDRANT_HOST = (process.env.QDRANT_HOST || '34.44.96.148').trim()
const QDRANT_PORT = parseInt((process.env.QDRANT_PORT || '6333').trim())
const COLLECTION_NAME = 'sengol_incidents_full'

async function testVectorSearch() {
  console.log('\n========================================')
  console.log('Qdrant Precision/Recall Test')
  console.log('========================================\n')

  const qdrant = new QdrantClient({
    url: `http://${QDRANT_HOST}:${QDRANT_PORT}`,
  })

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  })

  // Test queries with expected incident types
  const testQueries = [
    {
      query: 'AI chatbot data breach with customer PII exposed',
      expected: ['data breach', 'PII', 'customer data', 'AI', 'chatbot'],
    },
    {
      query: 'Ransomware attack on healthcare system encrypting patient records',
      expected: ['ransomware', 'healthcare', 'encryption', 'patient data'],
    },
    {
      query: 'SQL injection vulnerability in payment processing system',
      expected: ['SQL injection', 'payment', 'vulnerability', 'security'],
    },
    {
      query: 'Cloud storage misconfiguration exposing financial data',
      expected: ['cloud', 'misconfiguration', 'S3', 'storage', 'financial'],
    },
  ]

  for (const test of testQueries) {
    console.log(`\n\n🔍 TEST QUERY: "${test.query}"`)
    console.log(`   Expected concepts: ${test.expected.join(', ')}`)
    console.log('   ' + '='.repeat(80))

    // Generate embedding
    const embeddingStart = Date.now()
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: test.query,
      dimensions: 1536,
    })
    const queryVector = response.data[0].embedding
    const embeddingTime = Date.now() - embeddingStart
    console.log(`\n   ⏱️  Embedding generated in ${embeddingTime}ms`)

    // Search Qdrant with different thresholds
    const thresholds = [0.7, 0.5, 0.3, 0.1]

    for (const threshold of thresholds) {
      console.log(`\n   📊 Threshold: ${threshold} (${(threshold * 100).toFixed(0)}% similarity)`)

      const searchStart = Date.now()
      const searchResults = await qdrant.search(COLLECTION_NAME, {
        vector: queryVector,
        limit: 10,
        score_threshold: threshold,
        with_payload: true,
      })
      const searchTime = Date.now() - searchStart

      console.log(`      Found ${searchResults.length} results in ${searchTime}ms`)

      if (searchResults.length === 0) {
        console.log(`      ❌ NO RESULTS - threshold too high!`)
        continue
      }

      // Analyze score distribution
      const scores = searchResults.map(r => r.score)
      const minScore = Math.min(...scores)
      const maxScore = Math.max(...scores)
      const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length

      console.log(`      Score range: ${minScore.toFixed(3)} - ${maxScore.toFixed(3)} (avg: ${avgScore.toFixed(3)})`)

      // Show top 3 results with relevance analysis
      console.log(`\n      Top 3 Results:`)
      searchResults.slice(0, 3).forEach((result, idx) => {
        const payload = result.payload as any
        const embeddingText = payload.embedding_text || 'N/A'
        const category = payload.category || 'unknown'
        const severity = payload.metadata?.severity || 'unknown'

        // Check relevance to expected concepts
        const relevantConcepts = test.expected.filter(concept =>
          embeddingText.toLowerCase().includes(concept.toLowerCase())
        )

        const relevanceIndicator = relevantConcepts.length > 0 ? '✅' : '⚠️ '

        console.log(`      ${idx + 1}. ${relevanceIndicator} Score: ${result.score.toFixed(3)} | ${category} | ${severity}`)
        console.log(`         Text: "${embeddingText.substring(0, 100)}${embeddingText.length > 100 ? '...' : ''}"`)
        if (relevantConcepts.length > 0) {
          console.log(`         Matched concepts: ${relevantConcepts.join(', ')}`)
        } else {
          console.log(`         ⚠️  No expected concepts matched!`)
        }
      })
    }
  }

  // Test collection statistics
  console.log('\n\n========================================')
  console.log('Collection Statistics')
  console.log('========================================\n')

  try {
    const collectionInfo = await qdrant.getCollection(COLLECTION_NAME)
    console.log(`Collection: ${COLLECTION_NAME}`)
    console.log(`Total points: ${collectionInfo.points_count}`)
    console.log(`Vector dimensions: ${collectionInfo.config.params.vectors?.size || 'N/A'}`)
    console.log(`Distance metric: ${collectionInfo.config.params.vectors?.distance || 'N/A'}`)

    // Test random sampling
    console.log(`\n\nRandom Sample (5 points):`)
    const randomSample = await qdrant.scroll(COLLECTION_NAME, {
      limit: 5,
      with_payload: true,
    })

    randomSample.points.forEach((point, idx) => {
      const payload = point.payload as any
      const embeddingText = payload.embedding_text || 'N/A'
      const category = payload.category || 'unknown'
      console.log(`${idx + 1}. [${category}] "${embeddingText.substring(0, 80)}..."`)
    })

  } catch (error) {
    console.error('Failed to get collection info:', error)
  }

  console.log('\n\n========================================')
  console.log('Test Complete')
  console.log('========================================\n')
}

testVectorSearch().catch(console.error)
