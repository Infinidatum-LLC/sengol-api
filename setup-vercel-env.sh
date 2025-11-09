#!/bin/bash

# Setup Vercel Environment Variables for Google Cloud Migration
# This script sets all required environment variables in Vercel

set -e

echo "🚀 Setting up Vercel environment variables for Google Cloud migration..."
echo ""

# Read the base64 credentials
CREDENTIALS_BASE64=$(cat /tmp/credentials-base64.txt)

# Set environment variables
echo "📝 Setting GOOGLE_CLOUD_PROJECT..."
vercel env add GOOGLE_CLOUD_PROJECT production <<EOF
sengolvertexapi
EOF

echo "📝 Setting VERTEX_AI_LOCATION..."
vercel env add VERTEX_AI_LOCATION production <<EOF
us-central1
EOF

echo "📝 Setting GCS_BUCKET_NAME..."
vercel env add GCS_BUCKET_NAME production <<EOF
sengol-incidents
EOF

echo "📝 Setting GOOGLE_CLOUD_CREDENTIALS_BASE64..."
vercel env add GOOGLE_CLOUD_CREDENTIALS_BASE64 production <<EOF
${CREDENTIALS_BASE64}
EOF

echo "📝 Setting DATABASE_URL..."
DATABASE_URL=$(grep "^DATABASE_URL=" .env | cut -d= -f2- | tr -d '"')
vercel env add DATABASE_URL production <<EOF
${DATABASE_URL}
EOF

echo ""
echo "✅ All Vercel environment variables have been set!"
echo ""
echo "Next steps:"
echo "1. Deploy to production: vercel --prod"
echo "2. Verify health: curl https://api.sengol.ai/health/detailed | jq .checks"
