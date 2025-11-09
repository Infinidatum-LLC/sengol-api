/**
 * Google Cloud Authentication Helper
 *
 * Supports multiple authentication methods:
 * 1. Service account key JSON (production/development)
 * 2. Workload Identity Federation (Vercel production - future)
 * 3. Application Default Credentials (Google Cloud environments)
 */

import { GoogleAuth } from 'google-auth-library'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

let cachedAuth: GoogleAuth | null = null
let credentialsInitialized = false

/**
 * Initialize Google Cloud credentials in environment
 * This writes the base64-encoded credentials to a temp file
 * and sets GOOGLE_APPLICATION_CREDENTIALS to point to it
 */
function initializeCredentials() {
  if (credentialsInitialized) {
    return
  }

  const credentialsBase64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  if (credentialsBase64 && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      const credentialsJson = Buffer.from(credentialsBase64, 'base64').toString('utf-8')

      // Parse to validate
      JSON.parse(credentialsJson)

      // Write to temp file
      const tmpDir = os.tmpdir()
      const credentialsPath = path.join(tmpDir, 'gcloud-credentials.json')
      fs.writeFileSync(credentialsPath, credentialsJson, { mode: 0o600 })

      // Set environment variable
      process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath

      console.log('[Google Auth] Initialized credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON')
      console.log(`[Google Auth] Credentials file: ${credentialsPath}`)

      credentialsInitialized = true
    } catch (error) {
      console.error('[Google Auth] Failed to initialize credentials:', error)
    }
  }
}

/**
 * Get Google Cloud credentials for the current environment
 */
export function getGoogleAuth(): GoogleAuth {
  if (cachedAuth) {
    return cachedAuth
  }

  // Initialize credentials if needed
  initializeCredentials()

  const project = process.env.GOOGLE_CLOUD_PROJECT
  if (!project) {
    throw new Error('GOOGLE_CLOUD_PROJECT environment variable is not set')
  }

  // Check if credentials file is set
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('[Google Auth] Using credentials from GOOGLE_APPLICATION_CREDENTIALS')
  }

  // Option 2: Use Workload Identity Federation (Vercel production)
  const workloadIdentityProvider = process.env.WORKLOAD_IDENTITY_PROVIDER
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL

  if (workloadIdentityProvider && serviceAccountEmail) {
    console.log('[Google Auth] Using Workload Identity Federation')
    console.log(`[Google Auth] Provider: ${workloadIdentityProvider}`)
    console.log(`[Google Auth] Service Account: ${serviceAccountEmail}`)

    // Note: Workload Identity Federation requires the OIDC token from Vercel
    // This is automatically provided by Vercel in the ACTIONS_ID_TOKEN_REQUEST_URL env var
    // The Google Auth library will handle the token exchange automatically

    cachedAuth = new GoogleAuth({
      projectId: project,
      scopes: [
        'https://www.googleapis.com/auth/cloud-platform',
        'https://www.googleapis.com/auth/devstorage.full_control',
      ],
    })

    return cachedAuth
  }

  // Option 3: Use Application Default Credentials (local dev, Google Cloud)
  console.log('[Google Auth] Using Application Default Credentials')

  cachedAuth = new GoogleAuth({
    projectId: project,
    scopes: [
      'https://www.googleapis.com/auth/cloud-platform',
      'https://www.googleapis.com/auth/devstorage.full_control',
    ],
  })

  return cachedAuth
}

/**
 * Get authenticated credentials for direct use
 */
export async function getCredentials() {
  const auth = getGoogleAuth()
  return await auth.getClient()
}

/**
 * Reset cached auth (useful for testing)
 */
export function resetAuth() {
  cachedAuth = null
}
