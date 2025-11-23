/**
 * Smart Cache Invalidation
 * 
 * Intelligently invalidates cache when system description changes significantly.
 * Uses semantic similarity to determine if cache should be invalidated.
 */

import crypto from 'crypto'

/**
 * Calculate simple text similarity using word overlap
 * Returns a value between 0 and 1 (1 = identical, 0 = completely different)
 */
function calculateTextSimilarity(text1: string, text2: string): number {
  if (!text1 || !text2) return 0

  // Normalize texts
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')

  const normalized1 = normalize(text1)
  const normalized2 = normalize(text2)

  if (normalized1 === normalized2) return 1

  // Split into words
  const words1 = new Set(normalized1.split(' ').filter(w => w.length > 2))
  const words2 = new Set(normalized2.split(' ').filter(w => w.length > 2))

  if (words1.size === 0 || words2.size === 0) return 0

  // Calculate Jaccard similarity (intersection over union)
  const intersection = new Set([...words1].filter(w => words2.has(w)))
  const union = new Set([...words1, ...words2])

  return intersection.size / union.size
}

/**
 * Check if cache should be invalidated based on system description change
 * 
 * @param oldDescription Previous system description
 * @param newDescription New system description
 * @param threshold Similarity threshold below which cache should be invalidated (default: 0.8 = 80% similarity)
 * @returns true if cache should be invalidated
 */
export function shouldInvalidateCache(
  oldDescription: string,
  newDescription: string,
  threshold: number = 0.8
): boolean {
  if (!oldDescription || !newDescription) return true
  if (oldDescription === newDescription) return false

  const similarity = calculateTextSimilarity(oldDescription, newDescription)
  const shouldInvalidate = similarity < threshold

  console.log(`[CACHE_INVALIDATION] Similarity: ${(similarity * 100).toFixed(1)}%, Threshold: ${(threshold * 100).toFixed(1)}%, Invalidate: ${shouldInvalidate}`)

  return shouldInvalidate
}

/**
 * Generate cache key with versioning
 * Includes system description hash for easy comparison
 */
export function generateCacheKeyWithVersion(
  systemDescription: string,
  otherParams: Record<string, any> = {},
  version: string = 'v9'
): { key: string; descriptionHash: string } {
  const descriptionHash = crypto
    .createHash('sha256')
    .update(systemDescription.trim().toLowerCase())
    .digest('hex')
    .substring(0, 16)

  const normalized = {
    ...otherParams,
    descriptionHash,
    version,
  }

  const key = crypto
    .createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .substring(0, 16)

  return {
    key: `questions:${key}`,
    descriptionHash,
  }
}

/**
 * Compare cache keys to determine if they're for the same system
 */
export function areCacheKeysForSameSystem(
  key1: string,
  key2: string
): boolean {
  // Extract description hash from keys if present
  // This is a simple implementation - in production, you might store metadata separately
  return key1 === key2
}

