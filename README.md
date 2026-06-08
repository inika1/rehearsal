# Bridge

Prep for difficult conversations with a guided coaching session. Mobile app (Expo/React Native) + Express API backend.

```
mobile/    Expo app            -> App Store / Play Store
backend/   Express API + Supabase -> deploys to Railway
```

## Local dev

```
cd backend && cp .env.example .env   # fill in ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_KEY
npm install && npm run dev           # runs on http://localhost:4000
```

## Secrets

Backend env vars (set in Railway):
- `ANTHROPIC_API_KEY`
- `SUPABASE_URL`
- `SUPABASE_KEY`

## Database

Run `supabase_schema.sql` once in the Supabase SQL editor.
