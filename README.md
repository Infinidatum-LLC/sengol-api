# Sengol API (Middleware)

Business logic and API layer for Sengol AI platform.

## Architecture

```
Frontend (Next.js) → Middleware (this) → Backend (Python)
                          ↓
                    PostgreSQL, d-vecDB
```

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Setup Prisma:
   ```bash
   npx prisma generate
   npx prisma db push
   ```

4. Start development server:
   ```bash
   npm run dev
   ```

## API Endpoints

- `GET /health` - Health check
- `POST /api/auth/login` - User login
- `POST /api/auth/register` - User registration
- `POST /api/review/:id/generate-questions` - Generate assessment questions

## Testing

```bash
npm test
npm run test:watch
```

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.
