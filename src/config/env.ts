import dotenv from 'dotenv'

dotenv.config()

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000'),
  apiVersion: process.env.API_VERSION || 'v1',

  // Database
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL,

  // d-vecDB
  dvecdbHost: process.env.DVECDB_HOST!,
  dvecdbPort: parseInt(process.env.DVECDB_PORT || '8080'),
  dvecdbCollection: process.env.DVECDB_COLLECTION || 'incidents',

  // Auth
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',

  // External services
  openaiApiKey: process.env.OPENAI_API_KEY!,
  pythonBackendUrl: process.env.PYTHON_BACKEND_URL!,

  // CORS
  allowedOrigins: (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(','),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info'
}

// Validate required env vars
const required = ['DATABASE_URL', 'JWT_SECRET', 'OPENAI_API_KEY']
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}
