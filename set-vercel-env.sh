#!/bin/bash

# Vercel Environment Variables Setup Script
# This script helps you set all required environment variables in Vercel

echo "🚀 Sengol API - Vercel Environment Variables Setup"
echo "=================================================="
echo ""
echo "This script will guide you through setting up environment variables in Vercel."
echo "You'll need your Vercel project linked. Run 'vercel link' first if needed."
echo ""

# Check if vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "❌ Vercel CLI is not installed."
    echo "Install it with: npm i -g vercel"
    exit 1
fi

echo "✅ Vercel CLI found"
echo ""

# Prompt for environment
read -p "Select environment (production/preview/development) [production]: " ENV
ENV=${ENV:-production}

echo ""
echo "📝 Setting required variables..."
echo ""

# DATABASE_URL
read -p "DATABASE_URL (PostgreSQL connection string): " DATABASE_URL
if [ -n "$DATABASE_URL" ]; then
    echo "$DATABASE_URL" | vercel env add DATABASE_URL $ENV
    echo "✅ DATABASE_URL set"
fi

# JWT_SECRET
read -p "JWT_SECRET (use a strong random string): " JWT_SECRET
if [ -n "$JWT_SECRET" ]; then
    echo "$JWT_SECRET" | vercel env add JWT_SECRET $ENV
    echo "✅ JWT_SECRET set"
fi

# OPENAI_API_KEY
read -p "OPENAI_API_KEY (sk-...): " OPENAI_API_KEY
if [ -n "$OPENAI_API_KEY" ]; then
    echo "$OPENAI_API_KEY" | vercel env add OPENAI_API_KEY $ENV
    echo "✅ OPENAI_API_KEY set"
fi

# DVECDB_HOST
read -p "DVECDB_HOST [99.213.88.59]: " DVECDB_HOST
DVECDB_HOST=${DVECDB_HOST:-99.213.88.59}
echo "$DVECDB_HOST" | vercel env add DVECDB_HOST $ENV
echo "✅ DVECDB_HOST set"

# PYTHON_BACKEND_URL
read -p "PYTHON_BACKEND_URL: " PYTHON_BACKEND_URL
if [ -n "$PYTHON_BACKEND_URL" ]; then
    echo "$PYTHON_BACKEND_URL" | vercel env add PYTHON_BACKEND_URL $ENV
    echo "✅ PYTHON_BACKEND_URL set"
fi

# ALLOWED_ORIGINS
read -p "ALLOWED_ORIGINS (comma-separated, e.g., https://app.sengol.ai): " ALLOWED_ORIGINS
if [ -n "$ALLOWED_ORIGINS" ]; then
    echo "$ALLOWED_ORIGINS" | vercel env add ALLOWED_ORIGINS $ENV
    echo "✅ ALLOWED_ORIGINS set"
fi

echo ""
echo "📝 Setting optional variables (press Enter to skip)..."
echo ""

# Optional variables
read -p "DVECDB_PORT [40560]: " DVECDB_PORT
if [ -n "$DVECDB_PORT" ]; then
    echo "$DVECDB_PORT" | vercel env add DVECDB_PORT $ENV
    echo "✅ DVECDB_PORT set"
fi

read -p "CACHE_ENABLED [true]: " CACHE_ENABLED
if [ -n "$CACHE_ENABLED" ]; then
    echo "$CACHE_ENABLED" | vercel env add CACHE_ENABLED $ENV
    echo "✅ CACHE_ENABLED set"
fi

read -p "CACHE_TTL [3600]: " CACHE_TTL
if [ -n "$CACHE_TTL" ]; then
    echo "$CACHE_TTL" | vercel env add CACHE_TTL $ENV
    echo "✅ CACHE_TTL set"
fi

echo ""
echo "✅ Environment variables setup complete!"
echo ""
echo "Next steps:"
echo "1. Verify variables in Vercel dashboard:"
echo "   https://vercel.com/[your-team]/sengol-api/settings/environment-variables"
echo ""
echo "2. Redeploy your application:"
echo "   vercel --prod"
echo ""
echo "3. Check deployment status:"
echo "   vercel logs"
echo ""
