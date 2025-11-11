// Direct Qdrant search test
const { QdrantClient } = require('@qdrant/js-client-rest');
const { OpenAI } = require('openai');

const QDRANT_HOST = '34.44.96.148';
const QDRANT_PORT = 6333;
const COLLECTION_NAME = 'sengol_incidents_full';

async function testQdrantSearch() {
  console.log('🔍 Testing Qdrant Search...\n');

  // Initialize clients
  const qdrant = new QdrantClient({
    url: `http://${QDRANT_HOST}:${QDRANT_PORT}`,
  });

  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });

  // Test query
  const query = 'ransomware attack on healthcare provider';
  console.log(`Query: "${query}"\n`);

  // Generate embedding
  console.log('[1/3] Generating embedding...');
  const embeddingResponse = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: query,
    dimensions: 1536,
  });
  const queryVector = embeddingResponse.data[0].embedding;
  console.log(`✅ Generated ${queryVector.length}-dimensional embedding\n`);

  // Test search with different thresholds
  const thresholds = [0.1, 0.2, 0.3, 0.5, 0.7];

  for (const threshold of thresholds) {
    console.log(`[Testing] Threshold: ${threshold}`);

    try {
      const searchResult = await qdrant.search(COLLECTION_NAME, {
        vector: queryVector,
        limit: 10,
        score_threshold: threshold,
        with_payload: true,
      });

      console.log(`  ✅ Found ${searchResult.length} results`);

      if (searchResult.length > 0) {
        const topResult = searchResult[0];
        console.log(`  📊 Top result score: ${topResult.score.toFixed(4)}`);
        console.log(`  📄 Source: ${topResult.payload.source_file || 'N/A'}`);
        console.log(`  📝 Content preview: ${(topResult.payload.content || topResult.payload.raw_content || 'N/A').substring(0, 100)}...`);
      }
    } catch (error) {
      console.log(`  ❌ Error: ${error.message}`);
    }

    console.log('');
  }

  // Also test with NO threshold
  console.log(`[Testing] No threshold (any score)`);
  try {
    const searchResult = await qdrant.search(COLLECTION_NAME, {
      vector: queryVector,
      limit: 10,
      with_payload: true,
    });

    console.log(`  ✅ Found ${searchResult.length} results`);

    if (searchResult.length > 0) {
      console.log(`  📊 Score range: ${searchResult[searchResult.length - 1].score.toFixed(4)} - ${searchResult[0].score.toFixed(4)}`);

      searchResult.slice(0, 3).forEach((result, idx) => {
        console.log(`\n  [Result ${idx + 1}] Score: ${result.score.toFixed(4)}`);
        console.log(`    Source: ${result.payload.source_file || 'N/A'}`);
        if (result.payload.metadata) {
          console.log(`    Severity: ${result.payload.metadata.severity || 'N/A'}`);
          console.log(`    Industry: ${result.payload.metadata.industry || 'N/A'}`);
        }
      });
    }
  } catch (error) {
    console.log(`  ❌ Error: ${error.message}`);
  }
}

testQdrantSearch().catch(console.error);
