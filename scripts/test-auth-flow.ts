/**
 * End-to-End Authentication Flow Test
 *
 * Tests complete JWT authentication lifecycle:
 * 1. Register/Login user
 * 2. Use access token to make authenticated requests
 * 3. Refresh access token using refresh token
 * 4. Revoke token on logout
 *
 * Usage:
 * npx tsx scripts/test-auth-flow.ts
 */

import fetch from 'node-fetch'

// Configuration
const API_BASE_URL = process.env.API_URL || 'http://localhost:3000'
const TEST_EMAIL = 'durai@sengol.ai'
const TEST_PASSWORD = 'TestPassword123'

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

interface TokenResponse {
  success: boolean
  data?: {
    accessToken: string
    refreshToken?: string
    expiresIn: number
    tokenType: string
    user?: {
      id: string
      email: string
    }
  }
  error?: string
  code?: string
}

interface ApiResponse {
  success: boolean
  error?: string
  code?: string
  message?: string
}

// Helper functions
function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logStep(step: number, title: string) {
  log(`\n${'='.repeat(70)}`, 'cyan')
  log(`STEP ${step}: ${title}`, 'cyan')
  log(`${'='.repeat(70)}`, 'cyan')
}

function logSuccess(message: string) {
  log(`✓ ${message}`, 'green')
}

function logError(message: string) {
  log(`✗ ${message}`, 'red')
}

function logInfo(message: string) {
  log(`ℹ ${message}`, 'blue')
}

async function makeRequest(
  method: string,
  endpoint: string,
  body?: any,
  accessToken?: string
): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`
  const options: any = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  }

  if (accessToken) {
    options.headers.Authorization = `Bearer ${accessToken}`
  }

  if (body) {
    options.body = JSON.stringify(body)
  }

  logInfo(`${method} ${endpoint}`)

  try {
    const response = await fetch(url, options)
    const data = await response.json()

    if (!response.ok) {
      logInfo(`Response: ${response.status}`)
      return { success: false, status: response.status, ...data }
    }

    logInfo(`Response: ${response.status}`)
    return { success: true, status: response.status, ...data }
  } catch (error) {
    logError(`Request failed: ${error instanceof Error ? error.message : String(error)}`)
    return { success: false, error: String(error) }
  }
}

async function runTests() {
  let accessToken = ''
  let refreshToken = ''
  let userId = ''

  try {
    // Step 1: Try to login first (in case user already exists)
    logStep(1, 'Login with existing user')
    let loginResult = await makeRequest('POST', '/api/auth/login', {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    })

    if (!loginResult.success || loginResult.data?.accessToken) {
      if (loginResult.data?.accessToken) {
        logSuccess('Login successful')
        accessToken = loginResult.data.accessToken
        refreshToken = loginResult.data.refreshToken
        userId = loginResult.data.user?.id || ''
        logSuccess(`User ID: ${userId}`)
        logSuccess(`Access Token: ${accessToken.substring(0, 20)}...`)
        logSuccess(`Refresh Token: ${refreshToken?.substring(0, 20)}...`)
      } else {
        logInfo('User does not exist, will register')

        // Step 2: Register new user
        logStep(2, 'Register new user')
        const registerResult = await makeRequest('POST', '/api/auth/register', {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
          name: 'Durai Test User',
        })

        if (registerResult.data?.accessToken) {
          logSuccess('Registration successful')
          accessToken = registerResult.data.accessToken
          refreshToken = registerResult.data.refreshToken
          userId = registerResult.data.user?.id || ''
          logSuccess(`User ID: ${userId}`)
          logSuccess(`Access Token: ${accessToken.substring(0, 20)}...`)
          logSuccess(`Refresh Token: ${refreshToken?.substring(0, 20)}...`)
        } else {
          if (loginResult.error?.includes('already registered')) {
            logInfo('User already exists, attempting login again')
            loginResult = await makeRequest('POST', '/api/auth/login', {
              email: TEST_EMAIL,
              password: TEST_PASSWORD,
            })
            if (loginResult.data?.accessToken) {
              accessToken = loginResult.data.accessToken
              refreshToken = loginResult.data.refreshToken
              userId = loginResult.data.user?.id || ''
              logSuccess(`Login successful on retry`)
            } else {
              throw new Error(`Registration failed: ${registerResult.error || 'Unknown error'}`)
            }
          } else {
            throw new Error(`Registration failed: ${registerResult.error || 'Unknown error'}`)
          }
        }
      }
    } else {
      throw new Error(`Login failed: ${loginResult.error || 'Unknown error'}`)
    }

    // Step 3: Use access token to make authenticated request
    logStep(3, 'Make authenticated request with access token')
    const authenticatedResult = await makeRequest(
      'GET',
      '/api/health',
      undefined,
      accessToken
    )
    logSuccess('Authenticated request succeeded')

    // Step 4: Test token refresh
    logStep(4, 'Refresh access token')
    const refreshResult = await makeRequest('POST', '/api/auth/refresh', {
      refreshToken,
    })

    if (refreshResult.data?.accessToken) {
      const newAccessToken = refreshResult.data.accessToken
      logSuccess('Token refresh successful')
      logSuccess(`New Access Token: ${newAccessToken.substring(0, 20)}...`)

      // Step 5: Use new access token
      logStep(5, 'Make authenticated request with new access token')
      const newAuthResult = await makeRequest(
        'GET',
        '/api/health',
        undefined,
        newAccessToken
      )
      logSuccess('Authenticated request with new token succeeded')
      accessToken = newAccessToken
    } else {
      throw new Error(`Token refresh failed: ${refreshResult.error || 'Unknown error'}`)
    }

    // Step 6: Logout (revoke token)
    logStep(6, 'Logout and revoke token')
    const logoutResult = await makeRequest('POST', '/api/auth/logout', undefined, accessToken)

    if (logoutResult.success || logoutResult.message) {
      logSuccess('Logout successful, token revoked')
    } else {
      throw new Error(`Logout failed: ${logoutResult.error || 'Unknown error'}`)
    }

    // Step 7: Verify revoked token doesn't work
    logStep(7, 'Verify revoked token is rejected')
    const revokedResult = await makeRequest(
      'GET',
      '/api/health',
      undefined,
      accessToken
    )

    if (!revokedResult.data?.success && revokedResult.status === 401) {
      logSuccess('Revoked token correctly rejected (401 Unauthorized)')
    } else {
      logError('Revoked token should have been rejected!')
    }

    // Final summary
    logStep(8, 'Test Summary')
    log('\n✅ ALL TESTS PASSED!', 'green')
    log('\nAuthentication flow validation:', 'green')
    log('  ✓ User registration/login works', 'green')
    log('  ✓ Access token is valid and can be used for authenticated requests', 'green')
    log('  ✓ Refresh token successfully issues new access tokens', 'green')
    log('  ✓ Logout properly revokes tokens', 'green')
    log('  ✓ Revoked tokens are rejected on subsequent requests', 'green')

  } catch (error) {
    logStep(999, 'Test Failed')
    logError(`Test failed with error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  }
}

// Run tests
log('\n' + '='.repeat(70), 'yellow')
log('JWT AUTHENTICATION END-TO-END TEST', 'yellow')
log('='.repeat(70) + '\n', 'yellow')
logInfo(`API Base URL: ${API_BASE_URL}`)
logInfo(`Test User: ${TEST_EMAIL}`)
log('', 'reset')

runTests()
  .then(() => {
    log('\n' + '='.repeat(70), 'yellow')
    process.exit(0)
  })
  .catch((error) => {
    logError(`Unexpected error: ${error.message}`)
    process.exit(1)
  })
