# Code Cleanup Report

## Issues Identified

### 1. Type Safety Issues ⚠️ CRITICAL
**Problem**: Extensive use of `as any` type assertions throughout routes
**Impact**: Loss of type safety, potential runtime errors
**Files Affected**: All route files in `src/routes/`

**Examples**:
```typescript
// ❌ Bad
const userId = (request as any).userId
const geographyAccountId = (request.headers as any)['x-geography-account-id'] || 'default'

// ✅ Good (after fix)
const userId = getUserId(request as AuthenticatedRequest)
const geographyAccountId = getGeographyAccountId(request as GeographyRequest)
```

**Fix**: Created `src/types/request.ts` with proper type definitions and helper functions

### 2. Inconsistent Error Handling ⚠️ HIGH
**Problem**: Error responses vary in format across routes
**Impact**: Inconsistent API behavior, harder to debug

**Examples**:
```typescript
// ❌ Inconsistent
return reply.status(404).send({
  success: false,
  error: 'Not found',
  code: 'NOT_FOUND',
  statusCode: 404,
})

// ✅ Consistent (after fix)
sendNotFound(reply, 'Resource')
```

**Fix**: Created `src/lib/response-helpers.ts` with standardized response functions

### 3. Code Duplication ⚠️ MEDIUM
**Problem**: Repeated patterns for:
- Extracting userId and geographyAccountId
- Parsing pagination parameters
- Building WHERE clauses
- Error handling

**Fix**: 
- Created helper functions in `src/types/request.ts`
- Created validation utilities in `src/lib/validation.ts`
- Created response helpers in `src/lib/response-helpers.ts`

### 4. Missing Input Validation ⚠️ HIGH
**Problem**: Many routes don't validate input before database queries
**Impact**: Potential SQL injection, invalid data in database

**Fix**: Created `src/lib/validation.ts` with reusable validation functions

### 5. TODO Comments ⚠️ LOW
**Problem**: Several TODO comments indicating incomplete functionality
**Locations**:
- `src/routes/index.ts:34` - Stripe webhook handler
- `src/controllers/vector-search.controller.ts.disabled` - Vertex AI migration
- Frontend: Multiple TODOs in notification and webhook managers

**Action**: Document and prioritize implementation

### 6. Inconsistent Type Assertions ⚠️ MEDIUM
**Problem**: Using `as` type assertions on database query results without proper typing
**Impact**: Potential runtime errors if database schema changes

**Example**:
```typescript
// ❌ Bad
const policies = policiesResult.rows.map((row: any) => ({
  id: row.id,
  // ...
}))

// ✅ Good (after fix)
const policies = policiesResult.rows.map((row) => ({
  id: row.id as string,
  name: row.name as string,
  // ...
}))
```

## Improvements Made

### 1. Type Safety Infrastructure ✅
- Created `src/types/request.ts` with:
  - `AuthenticatedRequest` interface
  - `GeographyRequest` interface
  - `getUserId()` helper
  - `getGeographyAccountId()` helper
  - `parsePagination()` helper

### 2. Validation Utilities ✅
- Created `src/lib/validation.ts` with:
  - `validateUUID()` - UUID format validation
  - `validateRequiredString()` - Required string validation
  - `validateOptionalString()` - Optional string validation
  - `validateEnum()` - Enum value validation
  - `validateNumber()` - Number range validation

### 3. Response Helpers ✅
- Created `src/lib/response-helpers.ts` with:
  - `sendSuccess()` - Standard success response
  - `sendError()` - Standard error response
  - `sendPaginated()` - Paginated response
  - `sendNotFound()` - 404 response
  - `sendUnauthorized()` - 401 response
  - `sendForbidden()` - 403 response
  - `sendValidationError()` - 400 validation error
  - `sendInternalError()` - 500 internal error

### 4. Refactored Example Route ✅
- Refactored `council-policies.routes.ts` as example:
  - Removed all `as any` assertions
  - Added proper type safety
  - Used validation helpers
  - Used response helpers
  - Consistent error handling

## Remaining Work

### High Priority
1. **Apply cleanup to all routes**:
   - [ ] `council-vendors.routes.ts` - 13 instances of `as any`
   - [ ] `council-schedules.routes.ts` - Similar patterns
   - [ ] `council-violations.routes.ts` - Similar patterns
   - [ ] `council-status.routes.ts` - Similar patterns
   - [ ] `assessments.routes.ts` - Similar patterns
   - [ ] All other route files

2. **Add input validation** to all routes that accept user input

3. **Standardize error handling** across all routes

### Medium Priority
1. **Remove or implement TODOs**:
   - Stripe webhook handler activation
   - Vector search migration
   - Frontend notification/webhook TODOs

2. **Add JSDoc comments** to all public functions

3. **Create unit tests** for validation and helper functions

### Low Priority
1. **Code organization**:
   - Group related routes
   - Extract common middleware
   - Create route factories for common patterns

2. **Performance optimization**:
   - Review database queries for N+1 problems
   - Add query result caching where appropriate
   - Optimize pagination queries

## Recommendations

1. **Immediate**: Apply the cleanup pattern from `council-policies.routes.ts` to all other route files
2. **Short-term**: Add comprehensive input validation to all routes
3. **Medium-term**: Create route factories for common CRUD patterns
4. **Long-term**: Add comprehensive test coverage

## Files Created

1. `src/types/request.ts` - Request type definitions and helpers
2. `src/lib/validation.ts` - Validation utilities
3. `src/lib/response-helpers.ts` - Standardized response helpers
4. `CODE_CLEANUP_REPORT.md` - This report

## Next Steps

1. Review and approve the cleanup approach
2. Apply cleanup to remaining routes systematically
3. Add tests for new utilities
4. Update documentation

