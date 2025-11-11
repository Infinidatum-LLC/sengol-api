#!/usr/bin/env npx tsx

/**
 * Test Qdrant Connection and Search
 * Diagnose why relevance scores are showing 0%
 */

import { getQdrantClient, getCollectionInfo, checkQdrantHealth, searchIncidents } from './src/lib/qdrant-client'

async function testQdrantConnection() {
  console.log('\n🔍 QDRANT DIAGNOSIS - Finding 0% Relevance Root Cause\n')
  console.log('=' .repeat(80))

  // Test 1: Health Check
  console.log('\n📊 Test 1: Health Check')
  console.log('-'.repeat(80))
  try {
    const healthy = await checkQdrantHealth()
    console.log(`${healthy ? '✅' : '❌'} Health check: ${healthy ? 'PASSED' : 'FAILED'}`)
    if (!healthy) {
      console.error('❌ QDRANT IS NOT HEALTHY - Cannot proceed with testing')
      return
    }
  } catch (error: any) {
    console.error(`❌ Health check failed: ${error.message}`)
    console.error('   Possible causes:')
    console.error('   - Qdrant VM is down')
    console.error('   - Network connectivity issues')
    console.error('   - Incorrect QDRANT_HOST or QDRANT_PORT')
    return
  }

  // Test 2: Collection Info
  console.log('\n📊 Test 2: Collection Info')
  console.log('-'.repeat(80))
  try {
    const info = await getCollectionInfo()
    console.log(`✅ Collection: sengol_incidents_full`)
    console.log(`   - Points: ${info.points_count?.toLocaleString() || 0}`)
    console.log(`   - Status: ${info.status}`)
    console.log(`   - Dimensions: ${info.config?.params?.vectors?.size || 'N/A'}`)
    console.log(`   - Distance Metric: ${info.config?.params?.vectors?.distance || 'N/A'}`)

    if (info.points_count === 0) {
      console.error('\n❌ CRITICAL: Collection is EMPTY (0 points)')
      console.error('   Root Cause: No data has been loaded into Qdrant')
      console.error('   Solution: Re-crawl and re-embed all data sources')
      console.error('   This explains the 0% relevance scores!')
      return
    }
  } catch (error: any) {
    console.error(`❌ Failed to get collection info: ${error.message}`)
  }

  // Test 3: Vector Search with Healthcare AI Query
  console.log('\n📊 Test 3: Vector Search (Healthcare AI System)')
  console.log('-'.repeat(80))

  const testQuery = "A healthcare AI chatbot that processes patient medical records and provides diagnostic suggestions to doctors"
  console.log(`Query: "${testQuery.substring(0, 80)}..."`)

  try {
    const results = await searchIncidents(testQuery, {
      limit: 10,
      scoreThreshold: 0.0, // NO threshold - get all results
    })

    console.log(`\n${results.length > 0 ? '✅' : '❌'} Search completed: ${results.length} results found`)

    if (results.length === 0) {
      console.error('\n❌ ZERO results found even with 0.0 threshold!')
      console.error('   Possible root causes:')
      console.error('   1. ❌ Qdrant collection is empty')
      console.error('   2. ❌ Embedding generation is failing for queries')
      console.error('   3. ❌ Query embedding dimension != stored embedding dimension')
      console.error('   4. ❌ OpenAI API key is invalid or rate limited')
      console.error('\n   Recommendation: Check logs for embedding generation errors')
    } else {
      console.log('\n📋 Top 10 Results:')
      results.forEach((result, idx) => {
        console.log(`\n   ${idx + 1}. Score: ${result.score.toFixed(4)}`)
        console.log(`      Content: ${result.payload.content?.substring(0, 150) || 'N/A'}`)
        console.log(`      Source: ${result.payload.source_file}`)
        console.log(`      Type: ${result.payload.type || 'N/A'}`)
        console.log(`      Category: ${result.payload.category || 'N/A'}`)
        if (result.payload.metadata) {
          console.log(`      Industry: ${result.payload.metadata.industry || 'N/A'}`)
          console.log(`      Severity: ${result.payload.metadata.severity || 'N/A'}`)
        }
      })

      // Calculate statistics
      const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length
      const maxScore = Math.max(...results.map(r => r.score))
      const minScore = Math.min(...results.map(r => r.score))

      console.log(`\n📈 Similarity Statistics:`)
      console.log(`   - Average: ${avgScore.toFixed(4)}`)
      console.log(`   - Maximum: ${maxScore.toFixed(4)}`)
      console.log(`   - Minimum: ${minScore.toFixed(4)}`)

      if (maxScore < 0.3) {
        console.warn('\n⚠️  WARNING: Max score < 0.3 - LOW RELEVANCE')
        console.warn('   Possible causes:')
        console.warn('   - Embeddings generated with different model')
        console.warn('   - Data mismatch between query type and stored incidents')
        console.warn('   - Need to re-embed with consistent embedding model')
      }

      if (avgScore < 0.2) {
        console.error('\n❌ CRITICAL: Average score < 0.2 - VERY LOW RELEVANCE')
        console.error('   Root Cause: Embeddings are incompatible')
        console.error('   Solution: Re-crawl and re-embed all data with text-embedding-3-small')
      } else if (avgScore > 0.3) {
        console.log('\n✅ GOOD: Average score > 0.3 - Embeddings appear compatible')
      }
    }

  } catch (error: any) {
    console.error(`\n❌ Search failed: ${error.message}`)
    if (error.message.includes('ECONNREFUSED')) {
      console.error('   Root Cause: Cannot connect to Qdrant VM')
      console.error('   Solution: Check VM status and network connectivity')
    } else if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('   Root Cause: OpenAI API authentication failed')
      console.error('   Solution: Check OPENAI_API_KEY environment variable')
    }
    console.error(`   Stack: ${error.stack}`)
  }

  // Test 4: Check Environment Variables
  console.log('\n📊 Test 4: Environment Variables')
  console.log('-'.repeat(80))
  console.log(`   QDRANT_HOST: ${process.env.QDRANT_HOST || '10.128.0.2'}`)
  console.log(`   QDRANT_PORT: ${process.env.QDRANT_PORT || '6333'}`)
  console.log(`   OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? `✅ Set (${process.env.OPENAI_API_KEY.substring(0, 20)}...)` : '❌ Missing'}`)

  console.log('\n' + '='.repeat(80))
  console.log('🏁 Diagnosis completed\n')
}

testQdrantConnection().catch(console.error)
