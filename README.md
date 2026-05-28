# Rehearsal — split (frontend + backend)

/ frontend   Next.js UI            -> deploys to Vercel
/ backend    Express API + Supabase -> deploys to Railway

## Local dev
1. backend:  cd backend  && cp .env.example .env  (fill in keys)  && npm install && npm run dev
2. frontend: cd frontend && cp .env.example .env  (NEXT_PUBLIC_API_URL=http://localhost:4000) && npm install && npm run dev
3. Run supabase_schema.sql once in the Supabase SQL editor.

## Required GitHub secrets (Settings > Secrets and variables > Actions)
Frontend:  NEXT_PUBLIC_API_URL, VERCEL_TOKEN, VERCEL_ORG_ID, VERCEL_PROJECT_ID
Backend:   RAILWAY_TOKEN, RAILWAY_SERVICE
(Supabase + Anthropic keys are set in Railway, not GitHub.)
