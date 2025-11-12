# Dockerfile for sengol-api - Multi-stage build for Cloud Run

# Stage 1: Builder - Install all dependencies and compile TypeScript
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including devDependencies for TypeScript build)
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma/
RUN npx prisma generate

# Copy source code
COPY src ./src/

# Build TypeScript to dist/
RUN npm run build

# Stage 2: Production - Copy only compiled code and production dependencies
FROM node:20-alpine

WORKDIR /app

# Install OpenSSL for Prisma (Alpine uses OpenSSL 3.x)
RUN apk add --no-cache openssl

# Copy package files for production install
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy Prisma schema and generate client with correct binary target
COPY prisma ./prisma/
RUN npx prisma generate

# Copy compiled JavaScript from builder stage
COPY --from=builder /app/dist ./dist

# Cloud Run injects PORT env var dynamically (usually 8080)
# Our app.ts already respects process.env.PORT via src/config/env.ts:7
ENV NODE_ENV=production

# Start the compiled application
CMD ["npm", "start"]
