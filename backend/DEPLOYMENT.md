# Railway Deployment Guide

## Prerequisites
- A [Railway](https://railway.app) account
- Git repository connected to Railway

## Environment Variables

Set these in Railway's dashboard under Variables:

- **SUPABASE_URL**: Your Supabase project URL
- **SUPABASE_SERVICE_ROLE_KEY**: Your Supabase service role key (server-side only)
- **ANTHROPIC_API_KEY**: (Optional) Your Anthropic API key for AI features
- **FRONTEND_ORIGIN**: Your deployed frontend URL (e.g., `https://rehearsal.vercel.app`)
- **NODE_ENV**: `production`

## Deployment Steps

1. **Connect Repository**
   - Go to [Railway Dashboard](https://railway.app/dashboard)
   - Click "New Project" → "Deploy from GitHub"
   - Select your repository

2. **Add Backend Service**
   - Click "Add a service" → "GitHub Repo"
   - Select the repository
   - Railway will detect `package.json` and `Procfile` automatically

3. **Configure Environment**
   - Go to the service settings
   - Add all required environment variables
   - Railway will automatically set `PORT` for the service

4. **Deploy**
   - Push to your main branch (or configured branch)
   - Railway will automatically build and deploy
   - Monitor logs in the Railway dashboard

## Health Check

The API includes a health check endpoint at `/health` that returns `{ ok: true }`. This is useful for monitoring and load balancing.

## Logs & Monitoring

- View real-time logs in Railway dashboard
- Check service status and metrics
- Configure alerts for failures

## Custom Domain

To add a custom domain:
1. In Railway dashboard, go to your service
2. Click "Networking"
3. Add your custom domain
4. Update your DNS records with the provided CNAME

## Rollback

To rollback to a previous deployment:
1. Go to your service in Railway dashboard
2. View deployment history
3. Click "Rollback" on a previous deployment

## Troubleshooting

If deployment fails:
- Check the Railway logs for error messages
- Verify all required environment variables are set
- Ensure `node_modules` is in `.gitignore`
- Check that Node version matches `engines.node` in `package.json`
