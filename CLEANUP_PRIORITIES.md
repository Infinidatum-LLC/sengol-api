# Code Cleanup Priorities

## ✅ Completed

### Infrastructure Created
- ✅ Type-safe request interfaces (`src/types/request.ts`)
- ✅ Validation utilities (`src/lib/validation.ts`)
- ✅ Response helpers (`src/lib/response-helpers.ts`)
- ✅ Example refactoring (`council-policies.routes.ts`)

## 🔴 High Priority (Apply Immediately)

### 1. Type Safety Issues
**Files with most `as any` usage:**
- `council-vendors.routes.ts` - 13 instances
- `council-schedules.routes.ts` - Similar patterns
- `council-violations.routes.ts` - Similar patterns
- `council-status.routes.ts` - 1 instance
- `assessments.routes.ts` - Multiple instances

**Action**: Apply the same cleanup pattern from `council-policies.routes.ts`

### 2. Inconsistent Error Handling
**Issue**: Error responses vary in format
**Impact**: Inconsistent API behavior

**Action**: Replace all error responses with helper functions

### 3. Missing Input Validation
**Issue**: Many routes don't validate input
**Impact**: Potential security issues, invalid data

**Action**: Add validation to all routes accepting user input

## 🟡 Medium Priority

### 4. Code Duplication
**Patterns to extract:**
- Geography account ID extraction (already done via helper)
- Pagination parsing (already done via helper)
- WHERE clause building (could create helper)
- Update field building (could create helper)

### 5. TODO Comments
**Locations:**
- `src/routes/index.ts:34` - Stripe webhook handler
- Frontend: Multiple TODOs in notification/webhook managers

**Action**: Document and prioritize

### 6. Console.log Statements
**Issue**: Debug console.logs left in production code
**Action**: Replace with proper logging or remove

## 🟢 Low Priority

### 7. Code Organization
- Group related routes
- Extract common middleware
- Create route factories for CRUD patterns

### 8. Documentation
- Add JSDoc to all public functions
- Document API response formats
- Create API documentation

## Quick Wins

1. **Apply cleanup to council routes** (2-3 hours)
   - Use existing pattern from `council-policies.routes.ts`
   - All council routes follow same structure

2. **Add validation to assessment routes** (1-2 hours)
   - Already have validation helpers
   - Just need to apply them

3. **Standardize error responses** (1 hour)
   - Replace all error responses with helpers
   - Consistent format across API

## Estimated Time

- **High Priority**: 6-8 hours
- **Medium Priority**: 4-6 hours
- **Low Priority**: 8-12 hours
- **Total**: 18-26 hours

## Next Steps

1. Apply cleanup to `council-vendors.routes.ts` (highest priority)
2. Apply cleanup to `council-schedules.routes.ts`
3. Apply cleanup to `council-violations.routes.ts`
4. Apply cleanup to `assessments.routes.ts`
5. Review and clean up frontend API routes

