# Deployment Guide

## Option 1: Railway (Recommended - Easiest)

1. **Install Railway CLI**:
```bash
npm i -g @railway/cli
railway login
```

2. **Deploy**:
```bash
railway init
railway up
```

3. **Add Environment Variables** in Railway dashboard:
```
DATABASE_URL=<your-neon-db>
DVECDB_HOST=99.213.88.59
DVECDB_PORT=40560
JWT_SECRET=<generate-random-secret>
OPENAI_API_KEY=<your-key>
ALLOWED_ORIGINS=https://sengol.ai,https://www.sengol.ai
```

4. **Get your API URL**: Railway will provide URL like `https://sengol-api-production.up.railway.app`

## Option 2: Existing VPS (64.227.20.45)

1. **SSH to VPS**:
```bash
ssh root@64.227.20.45
cd /root
git clone <your-github-repo>
cd sengol-api
```

2. **Install dependencies**:
```bash
npm install
npx prisma generate
```

3. **Create .env**:
```bash
cp .env.example .env
nano .env  # Edit with your values
```

4. **Start with PM2**:
```bash
npm run build
pm2 start dist/app.js --name sengol-api
pm2 save
```

5. **Setup Nginx reverse proxy**:
```nginx
location /api {
  proxy_pass http://localhost:4000;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection 'upgrade';
  proxy_set_header Host $host;
  proxy_cache_bypass $http_upgrade;
}
```

## Frontend Configuration

Update Next.js `.env`:
```bash
NEXT_PUBLIC_API_URL=https://api.sengol.ai  # or Railway URL
```

## Health Check

```bash
curl https://your-api-url/health
```

## Monitoring

Railway provides built-in monitoring. For VPS, setup:
- PM2 monitoring: `pm2 monit`
- Logs: `pm2 logs sengol-api`
