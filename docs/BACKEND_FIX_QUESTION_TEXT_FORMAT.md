# Backend Fix: Question Text Format

**Date**: December 2024
**Priority**: 🔴 CRITICAL
**Status**: Requires Backend Implementation
**Issue**: Questions showing category names instead of full question text

---

## 🚨 Problem

### Current Behavior (WRONG)
Frontend is displaying questions like:
```
"Vector Database Security"
"API Authentication"
"Data Encryption"
```

These are **category names**, not actual questions!

### Expected Behavior (CORRECT)
Questions should be full, actionable questions like:
```
"How do you secure access to your vector database storing PII?"
"Do you implement OAuth 2.0 for API authentication?"
"Do you encrypt customer data at rest in your PostgreSQL database?"
```

---

## 🔍 Root Cause

The backend's question generation endpoint is returning:
```json
{
  "id": "dynamic_123",
  "label": "Vector Database Security",  ← WRONG: Just category name
  "text": "Vector Database Security",   ← WRONG: Also just category name
  "category": "vector_database_security"
}
```

**Should return**:
```json
{
  "id": "dynamic_123",
  "label": "Vector Database Security - PostgreSQL",  ← SHORT: For UI labels
  "text": "How do you secure access to your vector database storing PII and financial data?",  ← FULL QUESTION
  "category": "vector_database_security"
}
```

---

## 🔧 Fix Required

### File to Fix
**Backend**: `/api/review/{id}/generate-questions` endpoint

The backend is using the LLM to generate questions but incorrectly mapping the response.

### Current Code (WRONG)
```python
# In question generator
def generate_question_for_category(risk, context):
    # ... LLM call ...
    
    return {
        "id": f"dynamic_{risk.category}_{timestamp}",
        "label": risk.category.replace('_', ' ').title(),  # ❌ WRONG: Just category
        "text": risk.category.replace('_', ' ').title(),   # ❌ WRONG: Just category
        "category": risk.category,
        "weight": risk.weight,
        "evidence": risk.evidence,
        # ...
    }
```

### Fixed Code (CORRECT)
```python
# In question generator
def generate_question_for_category(risk, context):
    # Build comprehensive evidence summary for LLM
    evidence_summary = f"""
Risk Category: {risk.category}
Risk Weight: {risk.weight}/10 (Multi-factor relevance: {risk.evidence.relevance_score * 100:.0f}%)

System Context:
- Description: {context.description}
- Technology Stack: {', '.join(context.technology_stack)}
- Data Types Handled: {', '.join(context.data_types)}
- Data Sources Used: {', '.join(context.data_sources)}
- Industry: {context.industry}
- Deployment: {context.deployment}

Evidence from Incident Database (78K+ incidents):
- {risk.evidence.incident_count} highly relevant incidents found
- Average severity: {risk.evidence.avg_severity}/10
- Multi-factor relevance score: {risk.evidence.relevance_score * 100:.0f}%
- Estimated avg cost: ${risk.evidence.statistics.avg_cost / 1000:.0f}K per incident
- Affected organizations: {risk.evidence.statistics.affected_systems}

Recent Examples (Most Relevant):
{'\n'.join([f"{i+1}. {ex.title} ({ex.date}, severity: {ex.severity}/10)" 
            for i, ex in enumerate(risk.evidence.recent_examples[:5])])}

Regulatory Impact: {risk.reasoning.regulatory_impact}
"""
    
    # Generate formalized question with LLM
    completion = openai.ChatCompletion.create(
        model="gpt-4",
        messages=[
            {
                "role": "system",
                "content": f"""You are a cybersecurity and AI risk assessment expert. Generate a formal, structured risk assessment question based on real-world incident data and comprehensive system context.

The question MUST:
1. Be highly specific to the user's system:
   - Technologies: {', '.join(context.technology_stack[:3])}
   - Data types: {', '.join(context.data_types[:3])}
   - Data sources: {', '.join(context.data_sources[:3])}
2. Reference the risk category: {risk.category}
3. Incorporate evidence from {risk.evidence.incident_count} real-world incidents with {risk.evidence.relevance_score * 100:.0f}% relevance
4. Be clear and actionable (answerable with: "addressed", "partially addressed", "not addressed", or "not applicable")
5. Focus on specific controls, mitigations, or safeguards
6. Use formal, professional language
7. Be concise (1-2 sentences max)
8. Highlight the connection to the user's specific technology/data context

Format: Return ONLY the question text, nothing else. Do not include any preamble or explanation."""
            },
            {
                "role": "user",
                "content": evidence_summary
            }
        ],
        temperature=0.7,
        max_tokens=250
    )
    
    # ✅ Extract the FULL QUESTION from LLM response
    question_text = completion.choices[0].message.content.strip()
    
    # ✅ Create a short label for UI (category + key tech)
    key_tech = context.technology_stack[0] if context.technology_stack else ''
    short_label = f"{risk.category.replace('_', ' ').title()}"
    if key_tech:
        short_label += f" - {key_tech}"
    
    # ✅ Fallback if LLM fails
    if not question_text or len(question_text) < 20:
        tech_list = '/'.join(context.technology_stack[:2])
        data_list = '/'.join(context.data_types[:2])
        question_text = f"How do you address {risk.category.replace('_', ' ')} risks in your {context.deployment} system using {tech_list} with {data_list} data?"
    
    return {
        "id": f"dynamic_{risk.category.lower().replace(' ', '_')}_{int(time.time() * 1000)}",
        "label": short_label,  # ✅ SHORT: For UI labels/headers
        "text": question_text,  # ✅ FULL QUESTION: What users see and answer
        "question": question_text,  # ✅ ALIAS: For backward compatibility
        "category": risk.category,
        "weight": risk.weight,
        "evidence": {
            "incident_count": risk.evidence.incident_count,
            "avg_severity": risk.evidence.avg_severity,
            "relevance_score": risk.evidence.relevance_score,
            "recent_examples": risk.evidence.recent_examples,
            "statistics": risk.evidence.statistics
        },
        "reasoning": risk.reasoning,
        "ai_generated": True,
        "domain": infer_domain_from_category(risk.category),  # ai, cyber, or cloud
        # Additional helpful fields
        "priority": calculate_priority(risk.weight),  # critical, high, medium, low
        "description": f"Evidence from {risk.evidence.incident_count} incidents, {risk.evidence.relevance_score * 100:.0f}% relevance",
        "importance": f"Based on {risk.evidence.incident_count} incidents with average severity {risk.evidence.avg_severity}/10",
        "weightage_explanation": f"Multi-factor relevance: {risk.evidence.relevance_score * 100:.0f}% (technology: {risk.evidence.tech_match * 100:.0f}%, data: {risk.evidence.data_match * 100:.0f}%)"
    }
```

---

## 📋 Expected Response Format

### Endpoint
`POST /api/review/{assessmentId}/generate-questions`

### Request Body
```json
{
  "systemDescription": "AI-powered chatbot using GPT-4...",
  "technologyStack": ["GPT-4", "PostgreSQL", "AWS S3", "React"],
  "dataTypes": ["PII", "Financial", "Authentication"],
  "dataSources": ["API", "Database", "File Upload"],
  "industry": "fintech",
  "deployment": "cloud",
  "selectedDomains": ["ai", "cyber", "cloud"],
  "maxQuestions": 75,
  "minWeight": 0.7
}
```

### Response Format
```json
{
  "success": true,
  "data": {
    "riskQuestions": [
      {
        "id": "dynamic_data_encryption_1234567890",
        "label": "Data Encryption - PostgreSQL",
        "text": "How do you ensure PII and financial data are encrypted at rest in your PostgreSQL database, and what encryption standards (e.g., AES-256) are implemented?",
        "question": "How do you ensure PII and financial data are encrypted at rest in your PostgreSQL database, and what encryption standards (e.g., AES-256) are implemented?",
        "category": "data_encryption",
        "domain": "cyber",
        "priority": "critical",
        "weight": 0.87,
        "description": "Evidence from 23 incidents, 89% relevance",
        "importance": "Based on 23 incidents with average severity 8.2/10",
        "weightageExplanation": "Multi-factor relevance: 89% (technology: 92%, data: 95%, source: 78%)",
        "relatedIncidentCount": 23,
        "relatedIncidents": [
          {
            "organization": "FinTech Corp",
            "incidentType": "data_breach",
            "estimatedCost": 2300000,
            "similarity": "92%",
            "severity": "high",
            "date": "2023-08-15",
            "description": "Unencrypted database exposed PII..."
          }
        ],
        "evidence": {
          "incidentCount": 23,
          "avgSeverity": 8.2,
          "relevanceScore": 0.89,
          "recentExamples": [...],
          "statistics": {
            "totalCost": 52900000,
            "avgCost": 2300000,
            "affectedSystems": 18
          }
        },
        "reasoning": {
          "incidentFrequency": 7.8,
          "avgSeverity": 8.2,
          "techRelevance": 0.89,
          "regulatoryImpact": "critical"
        },
        "mitigations": [
          "Implement AES-256 encryption at rest",
          "Use AWS KMS for key management",
          "Regular encryption audits"
        ],
        "examples": [
          "FinTech Corp: Unencrypted database breach (2023)",
          "Healthcare Inc: Database misconfiguration (2023)",
          "Retail Co: Backup exposure incident (2024)"
        ],
        "regulations": [
          "GDPR Article 32",
          "SOC2 CC6.1",
          "HIPAA §164.312(a)(2)(iv)",
          "PCI-DSS Requirement 3.4"
        ],
        "confidence": "high",
        "aiGenerated": true
      },
      {
        "id": "dynamic_api_authentication_1234567891",
        "label": "API Authentication - GPT-4",
        "text": "Do you implement OAuth 2.0 or similar strong authentication mechanisms for your GPT-4 API integrations to prevent unauthorized access to PII?",
        "question": "Do you implement OAuth 2.0 or similar strong authentication mechanisms for your GPT-4 API integrations to prevent unauthorized access to PII?",
        "category": "api_authentication",
        "domain": "ai",
        "priority": "high",
        "weight": 0.78,
        "description": "Evidence from 18 incidents, 82% relevance",
        "importance": "Based on 18 incidents with average severity 7.5/10",
        "weightageExplanation": "Multi-factor relevance: 82% (technology: 88%, data: 85%, source: 72%)",
        "relatedIncidentCount": 18,
        "relatedIncidents": [...],
        "evidence": {...},
        "reasoning": {...},
        "mitigations": [...],
        "examples": [...],
        "regulations": [...],
        "confidence": "high",
        "aiGenerated": true
      }
    ],
    "complianceQuestions": [...],
    "metadata": {
      "totalRiskQuestions": 75,
      "totalComplianceQuestions": 45,
      "avgRiskWeight": 0.73,
      "topCategories": ["data_encryption", "api_authentication", "access_control"],
      "generatedAt": "2024-12-10T10:30:00Z",
      "model": "gpt-4",
      "multiFactorRelevance": true
    }
  }
}
```

---

## ✅ Validation Rules

### Question Text Validation
```python
def validate_question_text(question_text: str) -> bool:
    """Validate that question text is a proper question"""
    
    # Must be at least 20 characters
    if len(question_text) < 20:
        return False
    
    # Should end with question mark or contain question words
    question_indicators = ['how', 'what', 'do you', 'are you', 'have you', 'does', 'is', '?']
    if not any(indicator in question_text.lower() for indicator in question_indicators):
        return False
    
    # Should NOT be just a category name (no spaces or very short)
    if len(question_text.split()) < 4:
        return False
    
    # Should reference specific technologies or data types from context
    # (This is validated by LLM prompt, but good to check)
    
    return True

def generate_question_for_category(risk, context):
    # ... LLM call ...
    
    question_text = completion.choices[0].message.content.strip()
    
    # ✅ VALIDATE before returning
    if not validate_question_text(question_text):
        logger.warning(f"Invalid question text generated for {risk.category}: {question_text}")
        # Use fallback
        question_text = create_fallback_question(risk, context)
    
    return {
        "text": question_text,
        # ... rest of response
    }
```

---

## 🧪 Testing

### Test Cases

#### Test 1: Verify Question Format
```python
def test_question_format():
    """Test that questions are properly formatted"""
    
    response = generate_questions({
        "systemDescription": "AI chatbot using GPT-4 with PostgreSQL",
        "technologyStack": ["GPT-4", "PostgreSQL"],
        "dataTypes": ["PII", "Financial"],
        "dataSources": ["API", "Database"],
        "industry": "fintech",
        "deployment": "cloud"
    })
    
    questions = response["data"]["riskQuestions"]
    
    for q in questions:
        # ✅ Must have text field
        assert "text" in q
        assert len(q["text"]) >= 20
        
        # ✅ Text should be different from label
        assert q["text"] != q["label"]
        
        # ✅ Text should be a question (contains question indicators)
        assert any(indicator in q["text"].lower() 
                  for indicator in ['how', 'what', 'do you', 'are you', '?'])
        
        # ✅ Should reference system context
        tech_mentioned = any(tech.lower() in q["text"].lower() 
                            for tech in ["gpt-4", "postgresql", "database"])
        data_mentioned = any(dt.lower() in q["text"].lower() 
                            for dt in ["pii", "financial", "data"])
        assert tech_mentioned or data_mentioned
        
        print(f"✅ Question {q['id']}: {q['text'][:80]}...")
```

#### Test 2: Compare Before/After
```python
def test_question_quality():
    """Compare question quality before and after fix"""
    
    # ❌ BEFORE (WRONG)
    bad_question = {
        "label": "Vector Database Security",
        "text": "Vector Database Security"
    }
    
    # ✅ AFTER (CORRECT)
    good_question = {
        "label": "Vector Database Security - d-vecDB",
        "text": "How do you secure access to your d-vecDB vector database storing PII and financial data, including authentication, authorization, and encryption controls?"
    }
    
    # Validate improvement
    assert len(good_question["text"]) > len(bad_question["text"]) * 3
    assert "?" in good_question["text"] or "how" in good_question["text"].lower()
    assert any(word in good_question["text"].lower() 
              for word in ["secure", "authentication", "encryption", "protect"])
```

#### Test 3: Multi-Factor Context
```python
def test_multi_factor_context():
    """Test that questions include multi-factor context"""
    
    response = generate_questions({
        "systemDescription": "Healthcare AI platform",
        "technologyStack": ["GPT-4", "AWS S3", "MongoDB"],
        "dataTypes": ["PHI", "PII"],
        "dataSources": ["API", "File Upload", "Database"],
        "industry": "healthcare",
        "deployment": "cloud"
    })
    
    questions = response["data"]["riskQuestions"]
    
    for q in questions:
        # Should mention at least one tech from stack
        tech_found = any(tech.lower() in q["text"].lower() 
                        for tech in ["gpt-4", "aws", "s3", "mongodb"])
        
        # Should mention data types
        data_found = any(dt.lower() in q["text"].lower() 
                        for dt in ["phi", "pii", "health", "medical", "patient"])
        
        # Should have evidence
        assert q["relatedIncidentCount"] >= 3
        assert q["evidence"]["relevanceScore"] >= 0.5
        
        # Should have multi-factor relevance explanation
        assert "multi-factor" in q["weightageExplanation"].lower()
        
        print(f"✅ Question with context: {q['text'][:100]}...")
```

---

## 📊 Success Criteria

### ✅ Definition of Done

1. **All questions are full questions** (not category names)
   ```
   ✅ "How do you encrypt PII in PostgreSQL?"
   ❌ "Data Encryption"
   ```

2. **Questions reference system context**
   ```
   ✅ "...in your GPT-4 integration..."
   ❌ Generic questions without tech mention
   ```

3. **Label ≠ Text**
   ```
   label: "Data Encryption - PostgreSQL"  (short)
   text: "How do you encrypt PII in PostgreSQL using AES-256?"  (full)
   ```

4. **Backward compatibility**
   - `text` field: Full question (primary)
   - `question` field: Alias for `text` (compatibility)
   - `label` field: Short label for UI

5. **Validation passes**
   - All test cases pass
   - No questions < 20 characters
   - All questions have question indicators

---

## 🔄 Deployment

### Pre-Deployment Checklist
- [ ] Update question generator function
- [ ] Add validation for question text
- [ ] Update LLM prompts with multi-factor context
- [ ] Add test cases
- [ ] Run integration tests
- [ ] Verify response format matches spec

### Post-Deployment Verification
```bash
# Test the endpoint
curl -X POST https://api.sengol.ai/api/review/test-123/generate-questions \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "systemDescription": "AI chatbot using GPT-4 with PostgreSQL",
    "technologyStack": ["GPT-4", "PostgreSQL"],
    "dataTypes": ["PII", "Financial"],
    "dataSources": ["API", "Database"],
    "industry": "fintech",
    "deployment": "cloud",
    "maxQuestions": 10
  }'

# Verify response has proper question text
jq '.data.riskQuestions[0].text' response.json
# Should output: "How do you encrypt PII and Financial data in your PostgreSQL database?"
# NOT: "Data Encryption"
```

---

## 🚀 Priority

**CRITICAL** - This is blocking user experience. Questions like "Vector Database Security" are confusing users.

**Expected Timeline**: 
- Fix: 1-2 hours
- Testing: 30 minutes
- Deployment: 15 minutes
- **Total**: 2-3 hours

---

## 📞 Contact

If questions, contact frontend team or refer to:
- `/docs/BACKEND_REDESIGN_QUESTION_GENERATION.md` - Full architecture
- `/docs/INDUSTRY_BEST_PRACTICES_RISK_QUESTIONS.md` - Industry examples
- Frontend expects: `question.text` or `question.question` field

---

## ✅ Summary

**Problem**: Questions showing "Vector Database Security" (category) instead of full question

**Solution**: 
1. Use LLM response as `text` field (not category name)
2. Keep category as `category` field (for grouping)
3. Create short label as `label` field (for UI)

**Expected Result**:
```json
{
  "text": "How do you secure access to your vector database storing PII?",
  "label": "Vector Database Security",
  "category": "vector_database_security"
}
```

**Timeline**: 2-3 hours total

