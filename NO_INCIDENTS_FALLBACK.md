# Handling Cases with No Similar Incidents

## Problem

What happens when the 78K+ incident database doesn't have similar incidents to the user's system description?

## Solution: Multi-Layer Fallback Strategy

### Layer 1: Broader Search

If initial search (similarity ≥ 0.3) returns no results:

1. **Lower Similarity Threshold**: Retry with 0.2 (20% similarity)
2. **Remove Industry Filter**: If still no results, try without industry filter
3. **General Search**: Search for general risk patterns if specific search fails

### Layer 2: Adaptive Weighting

When incidents are found but have low similarity (< 0.4):

**Standard Weighting (Good Evidence):**
```
Final Weight = (Base Weight × 50%) + (Evidence Weight × 30%) + (Industry Weight × 20%)
```

**Adaptive Weighting (Low Evidence):**
```
Final Weight = (Base Weight × 60%) + (Evidence Weight × 10%) + (Industry Weight × 30%)
```

This means:
- **With good evidence**: Evidence has 30% impact
- **With low/no evidence**: LLM analysis has 60% impact, industry patterns have 30%

### Layer 3: Enhanced LLM Prompting

When no incidents are found, the LLM prompt includes:

1. **Explicit Guidance**: "No similar incidents found - use industry best practices"
2. **Weighting Strategy**: Instructions on how to weight without evidence
3. **System Context Focus**: Emphasize system criticality, data types, tech stack
4. **Industry Standards**: Reference industry-specific risk patterns

### Layer 4: Evidence Weight Calculation

**With Incidents:**
```
Evidence Weight = (Count × 30%) + (Similarity × 50%) + (Severity × 20%)
```

**Without Incidents:**
```
Evidence Weight = 0.25 (low baseline)
```

**With Low-Quality Incidents (similarity < 0.4):**
```
Evidence Weight = 0.3 (slightly higher but still low)
```

## Example Scenarios

### Scenario 1: No Similar Incidents Found

**System**: "Novel quantum computing system using proprietary algorithms"

**What Happens:**
1. Initial search (similarity ≥ 0.3) → 0 results
2. Broader search (similarity ≥ 0.2) → 0 results
3. LLM receives: "No similar incidents - use industry best practices"
4. LLM generates questions based on:
   - System criticality
   - Data types (if any)
   - Technology stack vulnerabilities
   - Industry standards
5. Weight calculation:
   - Base Weight: 75% (from LLM analysis)
   - Evidence Weight: 25% (no evidence baseline)
   - Industry Weight: 90% (if industry specified)
   - Final Weight: (0.75 × 0.6) + (0.25 × 0.1) + (0.9 × 0.3) = 0.715 (71.5%)

### Scenario 2: Low Similarity Incidents Found

**System**: "AI-powered medical device using GPT-4"

**What Happens:**
1. Initial search → 5 incidents found, but avg similarity = 0.35 (35%)
2. System detects low relevance
3. Evidence weight = 0.3 (low quality)
4. Uses adaptive weighting (LLM-heavy)
5. Final Weight: (0.80 × 0.6) + (0.30 × 0.1) + (0.95 × 0.3) = 0.75 (75%)

### Scenario 3: High Similarity Incidents Found

**System**: "E-commerce platform using AWS, PostgreSQL, processing credit cards"

**What Happens:**
1. Initial search → 25 incidents found, avg similarity = 0.78 (78%)
2. Evidence weight = 0.85 (high quality)
3. Uses standard weighting
4. Final Weight: (0.85 × 0.5) + (0.85 × 0.3) + (0.9 × 0.2) = 0.86 (86%)

## Benefits

✅ **Always Works**: System generates questions even with no incidents
✅ **Quality Maintained**: LLM analysis ensures good questions
✅ **Adaptive**: Automatically adjusts weighting based on evidence quality
✅ **Transparent**: Logs show why weights are calculated as they are
✅ **Graceful Degradation**: System works well even without incident database

## Logs to Watch

**No Incidents:**
```
⚠️  WARNING: No incidents found with similarity >= 0.3
[FALLBACK] Attempting broader search with lower similarity threshold...
[FALLBACK] Still no incidents found even with lower threshold
[FALLBACK] Will use LLM-only analysis with general industry patterns
[EVIDENCE_WEIGHT] No incidents - returning 0.25 (low evidence weight, will rely on LLM analysis)
[WEIGHT_CALC] "Access Control": LOW EVIDENCE - Using adaptive weighting (LLM-heavy)
```

**Low Similarity:**
```
⚠️  WARNING: Found incidents but average similarity is low (35%)
[FALLBACK] Incidents may not be highly relevant - will rely more on LLM analysis
[EVIDENCE_WEIGHT] Low relevance incidents (avg similarity: 35%, count: 5) - returning 0.3
[WEIGHT_CALC] "AI Security": LOW EVIDENCE - Using adaptive weighting (LLM-heavy)
```

## Configuration

### Similarity Thresholds

- **Initial Search**: 0.3 (30% similarity) - Default
- **Fallback Search**: 0.2 (20% similarity) - If no results
- **Low Quality Threshold**: 0.4 (40% similarity) - Triggers adaptive weighting

### Weight Adjustments

- **No Evidence**: Evidence weight = 0.25, LLM weight = 60%
- **Low Evidence**: Evidence weight = 0.3, LLM weight = 60%
- **Good Evidence**: Evidence weight = calculated, LLM weight = 50%

## Testing

To test fallback behavior:

1. **Use unique system description**: "Quantum AI system using proprietary neural networks"
2. **Check logs**: Should see fallback messages
3. **Verify questions**: Should still generate good questions
4. **Check weights**: Should use adaptive weighting (LLM-heavy)

