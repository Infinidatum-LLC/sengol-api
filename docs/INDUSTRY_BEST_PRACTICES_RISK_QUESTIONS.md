# Industry Best Practices: Risk Assessment Questions

**Date**: December 2024
**Research**: How leading platforms handle dynamic risk assessment questions

---

## 🏢 Industry Leaders Analysis

### 1. **Vanta (Compliance Automation)**

**Approach**:
- Starts with framework-specific questions (SOC2, ISO27001, HIPAA, etc.)
- Customizes based on:
  * Company size
  * Industry sector
  * Technology integrations detected
  * Data types identified
- **Question Format**: Yes/No/Partial/N/A with evidence upload
- **Display**: Progressive disclosure - shows relevant questions only

**Key Features**:
```
Question: "Do you encrypt customer data at rest?"
├─ Why this matters: [Context about compliance requirement]
├─ Evidence needed: [List of acceptable evidence]
├─ Examples: [Link to example implementations]
└─ Related to: SOC2 CC6.1, ISO27001 A.10.1.1
```

**Question Prioritization**:
- ⭐ Critical (compliance blocking)
- 🔴 High priority (security risk)
- 🟡 Medium priority (best practice)
- ⚪ Low priority (optional)

---

### 2. **Drata (Continuous Compliance)**

**Approach**:
- **Smart Questionnaire Engine**
  * Auto-generates questions from framework requirements
  * Maps to detected technology stack (AWS, GitHub, Slack, etc.)
  * Only asks about what you actually use
- **Context-Aware**:
  * If GitHub detected → show code repository questions
  * If AWS detected → show cloud security questions
  * If no HR system → skip HR-related questions

**Question Display**:
```
Section: Access Control
├─ 12 questions total
├─ 3 critical, 5 high, 4 medium
├─ 8 auto-answered via integrations
├─ 4 require manual input
└─ Estimated time: 15 minutes
```

**Progressive Questionnaire**:
1. Start with critical questions (blocking compliance)
2. Then high-priority security questions
3. Then medium-priority best practices
4. Optional deep-dive questions at the end

---

### 3. **SecurityScorecard / BitSight (Risk Ratings)**

**Approach**:
- **Hybrid Assessment**
  * External scanning (passive data collection)
  * Self-assessment questionnaire (internal controls)
  * Vendor questionnaires (third-party risk)

**Question Adaptation**:
- Questions adapt based on:
  * External security posture detected
  * Industry benchmarks
  * Company size and complexity
  * Previous assessment history

**Display Pattern**:
```
Risk Domain: Network Security
└─ Based on external scan, we detected:
    ├─ 15 open ports (high risk)
    ├─ SSL certificate issues (medium risk)
    └─ No DDoS protection (low risk)
    
    Related Questions:
    1. [CRITICAL] Do you have a firewall policy? (addresses open ports issue)
    2. [HIGH] When was your SSL certificate last updated? (addresses SSL issue)
    3. [MEDIUM] Do you use DDoS protection services? (addresses DDoS gap)
```

---

### 4. **ServiceNow GRC (Enterprise)**

**Approach**:
- **Risk-Based Questionnaire**
  * Questions prioritized by risk score
  * Inherent risk × control effectiveness
  * Only show questions for material risks
- **Dynamic Branching**:
  * Answer "No" → triggers follow-up questions
  * Answer "Partial" → asks for details
  * Answer "N/A" → skips related questions

**Question Tree Example**:
```
Q1: Do you handle PII? [Yes/No]
  └─ If YES:
      Q1.1: What types of PII? [Multi-select]
      Q1.2: Where is PII stored? [Text]
      Q1.3: Is PII encrypted? [Yes/No/Partial]
        └─ If NO or PARTIAL:
            Q1.3.1: What is your plan to implement encryption? [Text]
            Q1.3.2: Target date? [Date]
  └─ If NO:
      [Skip all PII-related questions]
```

---

### 5. **OneTrust (Privacy Management)**

**Approach**:
- **Context-Driven Questionnaires**
  * Questions based on data inventory
  * Automatically pulled from data mapping
  * Only asks about actual data flows
- **Multi-Language Support**
- **Role-Based Assignment**
  * Technical questions → CTO/CISO
  * Legal questions → Legal team
  * Operational questions → Operations team

**Smart Display**:
```
Data Flow: Customer PII → AWS S3 → Analytics Platform
└─ Auto-generated questions:
    1. Who has access to AWS S3 bucket? [Auto-answered from AWS IAM]
    2. Is data encrypted in S3? [Auto-answered from AWS config]
    3. What is the data retention policy? [Requires manual input]
    4. How is data deleted? [Requires manual input]
```

---

## 📊 Common Patterns Across Leaders

### 1. **Progressive Disclosure**
- Start with high-priority questions only
- Show detailed questions as needed
- Use accordion/expandable sections
- Don't overwhelm users with 100+ questions at once

### 2. **Context-Rich Questions**
Every question includes:
- **Why it matters**: Business impact explanation
- **Evidence needed**: What to provide
- **Examples**: Good answer examples
- **Related frameworks**: SOC2, ISO27001, NIST, etc.
- **Risk level**: Critical/High/Medium/Low

### 3. **Smart Filtering**
- Show only applicable questions
- Skip irrelevant questions based on:
  * Technology stack detected
  * Company size
  * Industry sector
  * Previous answers
  * Risk assessment results

### 4. **Answer Options**
Standard across industry:
- ✅ **Addressed** (control in place)
- ⚠️ **Partially Addressed** (control partially implemented)
- ❌ **Not Addressed** (no control)
- 🚫 **Not Applicable** (doesn't apply to us)

### 5. **Evidence Collection**
Most platforms allow:
- Text descriptions
- File uploads (policies, screenshots, reports)
- Integration auto-evidence (AWS config, GitHub commits, etc.)
- Previous audit reports

---

## 🎯 Best Practices for Question Display

### ✅ Do's

1. **Start with Critical Questions**
   ```
   Section 1: Critical Security Controls (5 questions)
   ├─ Must be addressed for baseline security
   └─ Estimated time: 10 minutes
   
   Section 2: High-Priority Risks (12 questions)
   ├─ Important for comprehensive security
   └─ Estimated time: 20 minutes
   ```

2. **Provide Context**
   ```
   Q: Do you encrypt PII at rest?
   
   Why this matters:
   Unencrypted PII is vulnerable to breach. 
   Average data breach costs $4.45M (IBM 2023).
   
   Evidence from similar incidents:
   • 15 incidents in your industry (past 2 years)
   • Average cost: $2.3M per incident
   • Common cause: Unencrypted databases
   
   Required by:
   • GDPR Article 32
   • SOC2 CC6.1
   • HIPAA §164.312(a)(2)(iv)
   ```

3. **Show Progress**
   ```
   Risk Assessment Progress
   ━━━━━━━━━━━━━━━━━━━━━━━━ 65%
   
   ✓ Critical questions: 5/5 complete
   ✓ High priority: 8/12 complete
   ○ Medium priority: 0/15 (optional)
   
   Estimated completion: 15 minutes remaining
   ```

4. **Use Smart Defaults**
   - Pre-fill answers from integrations
   - Suggest answers based on industry benchmarks
   - Auto-complete for common responses

5. **Group by Domain**
   ```
   📊 Risk Domains
   
   ✓ Access Control (8/8 complete)
   ⚠️ Data Security (5/10 complete) ← You are here
   ○ Network Security (0/7)
   ○ Incident Response (0/5)
   ○ Vendor Management (0/12)
   ```

### ❌ Don'ts

1. **Don't Show All Questions at Once**
   - Overwhelming
   - Low completion rates
   - User fatigue

2. **Don't Use Technical Jargon**
   ```
   ❌ Bad: "Do you implement AES-256 encryption for data at rest?"
   ✅ Good: "Do you encrypt customer data when stored?"
           (Technical details in help text)
   ```

3. **Don't Ask Irrelevant Questions**
   ```
   If user says "We don't use AWS":
   ❌ Don't ask 20 AWS-specific questions
   ✅ Skip AWS questions, ask cloud-agnostic questions
   ```

4. **Don't Hide Risk Context**
   ```
   ❌ Bad: "Do you have MFA?"
   ✅ Good: "Do you have MFA?" 
           + Why: 99.9% of account compromises prevented by MFA
           + Evidence: 45 similar companies breached without MFA
   ```

---

## 🔧 Implementation Recommendations for Sengol

Based on industry best practices, here's what Sengol should do:

### 1. **Question Display Format**

```typescript
interface QuestionDisplay {
  // Question text (clear, actionable)
  question: string
  
  // Why it matters (business impact)
  context: {
    riskLevel: 'critical' | 'high' | 'medium' | 'low'
    businessImpact: string
    estimatedCost: number // Average incident cost
  }
  
  // Evidence from incidents
  evidence: {
    incidentCount: number
    relevanceScore: number // 0-100%
    recentExamples: string[] // Top 3 incidents
    industryStats: string // "45% of fintech companies affected"
  }
  
  // Regulatory/framework mapping
  compliance: {
    frameworks: string[] // ['SOC2', 'ISO27001', 'GDPR']
    requirements: string[] // ['CC6.1', 'A.10.1.1', 'Article 32']
  }
  
  // Help the user
  guidance: {
    goodExample: string // Example of good answer
    evidenceNeeded: string[] // What to provide
    relatedControls: string[] // Related security controls
  }
}
```

### 2. **Progressive Disclosure**

```
Step 1: Critical Questions Only (5-10 questions)
├─ Must be addressed
├─ Blocking security risks
└─ Estimated time: 10-15 minutes

Step 2: High-Priority Questions (15-20 questions)
├─ Important for comprehensive security
├─ Based on Step 1 answers
└─ Estimated time: 20-30 minutes

Step 3: Domain-Specific Deep Dive (optional)
├─ Technology-specific questions
├─ Industry-specific questions
└─ Estimated time: 30-45 minutes
```

### 3. **Smart Filtering Logic**

```python
def should_show_question(question, context):
    """Determine if question should be shown to user"""
    
    # Filter 1: Technology relevance
    if question.requires_tech not in context.tech_stack:
        return False
    
    # Filter 2: Multi-factor relevance
    relevance = calculate_multi_factor_relevance(question, context)
    if relevance < 0.5:  # 50% threshold
        return False
    
    # Filter 3: Risk threshold
    if question.risk_weight < 5.0:  # Only high-risk questions
        return False
    
    # Filter 4: Incident count
    if question.incident_count < 3:  # Need enough evidence
        return False
    
    # Filter 5: Answer dependencies
    if question.depends_on and not is_answered(question.depends_on):
        return False
    
    return True
```

### 4. **Recommended UI/UX**

#### Option A: Card-Based (Like Vanta)
```
┌──────────────────────────────────────────────────┐
│ 🔴 CRITICAL: Data Encryption                     │
├──────────────────────────────────────────────────┤
│ Do you encrypt customer PII at rest?             │
│                                                   │
│ 💡 Why this matters:                             │
│ Based on 15 similar incidents in your industry,  │
│ unencrypted data leads to avg breach cost $2.3M  │
│                                                   │
│ 📊 Evidence:                                     │
│ • 15 incidents (85% relevance to your system)    │
│ • Avg severity: 8/10                             │
│ • Your tech: PostgreSQL, AWS S3 (detected)       │
│                                                   │
│ ✅ Addressed  ⚠️ Partial  ❌ Not Addressed  🚫 N/A│
│                                                   │
│ 📝 Implementation details: [text box]            │
│ 📎 Upload evidence: [file upload]                │
└──────────────────────────────────────────────────┘
```

#### Option B: Compact List (Like Drata)
```
Data Security (5/10 complete) ━━━━━━━━━━━━━━ 50%

✓ 1. Encryption at rest                    [Addressed]
✓ 2. Encryption in transit                 [Addressed]
✓ 3. Key management                        [Addressed]
⚠️ 4. Data retention policy                [Partial]
❌ 5. Data deletion process                [Not Addressed] ← Expand
○ 6. Backup encryption                     [Pending]
○ 7. Access logging                        [Pending]
○ 8. Data classification                   [Pending]
○ 9. DLP controls                          [Pending]
○ 10. Data masking                         [Pending]
```

### 5. **Answer Options & Evidence**

```
Answer: [Dropdown]
├─ ✅ Addressed
│   └─ Implementation details: [Required text field]
│   └─ Evidence: [Optional file upload]
│
├─ ⚠️ Partially Addressed
│   └─ What's implemented: [Required text field]
│   └─ What's missing: [Required text field]
│   └─ Remediation plan: [Required text field]
│   └─ Target date: [Date picker]
│
├─ ❌ Not Addressed
│   └─ Why not: [Required text field]
│   └─ Risk accepted: [Checkbox]
│   └─ Remediation plan: [Optional text field]
│
└─ 🚫 Not Applicable
    └─ Reason: [Required text field]
```

---

## 📈 Success Metrics (Industry Standards)

### Completion Rates
- **Critical questions**: 95%+ completion
- **High priority**: 85%+ completion
- **Medium priority**: 60%+ completion
- **Overall assessment**: 80%+ completion

### Time to Complete
- **Per question**: 2-3 minutes average
- **Critical section**: 15-20 minutes
- **Full assessment**: 45-90 minutes
- **With integrations**: 20-30 minutes (auto-answered)

### User Satisfaction
- **Question clarity**: 4.5+/5.0
- **Relevance**: 4.3+/5.0
- **Context helpfulness**: 4.4+/5.0
- **Overall experience**: 4.2+/5.0

---

## 🎯 Sengol's Competitive Advantage

What makes Sengol better:

1. **78K+ Incident Database** (vs competitors' generic questions)
2. **Multi-Factor Relevance** (technology + data + sources)
3. **Real-Time Evidence** (actual incidents, not theoretical)
4. **Smart Filtering** (only applicable risks)
5. **LLM Formalization** (context-aware questions)

---

## 📚 References

- Vanta: https://www.vanta.com/products/risk-management
- Drata: https://www.drata.com/product/compliance-automation
- SecurityScorecard: https://securityscorecard.com/
- OneTrust: https://www.onetrust.com/products/grc/
- ServiceNow GRC: https://www.servicenow.com/products/governance-risk-compliance.html

---

**Conclusion**: Industry leaders all follow similar patterns:
1. Progressive disclosure (don't show everything at once)
2. Context-rich questions (why it matters + evidence)
3. Smart filtering (only applicable questions)
4. Clear answer options (Addressed/Partial/Not/N/A)
5. Evidence collection (text + files + integrations)

Sengol is already implementing these best practices with the added advantage of real incident data! 🎯

