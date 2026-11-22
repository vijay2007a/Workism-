# WORKISM 3.0 — Deployment & Operations Guide

## 1. Prerequisites & Missing External Configuration

Before deploying to production, configure your existing **Supabase project**, **Google Gemini API key**, and **Vercel project**. Never place real values in Git or `.env.example`.

### Required Environment Variables

Configure these in **Vercel Project Settings -> Environment Variables** (separate values for Production vs Preview; never grant Preview production secrets):

| Variable | Visibility | Where Used | Purpose |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Client (Public) | Browser SPA | Supabase project HTTPS URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Client (Public) | Browser SPA | Supabase publishable/anon key (RLS-restricted) |
| `VITE_API_URL` | Client (Public, optional) | Browser SPA | Leave blank on Vercel to use same-origin `/api` |
| `SUPABASE_URL` | Server-only | Vercel API | Same Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Server-only | Vercel API | RLS-scoped server queries |
| `SUPABASE_SECRET_KEY` | **Server-only Secret** | Vercel API | Privileged operations (grading, cert signing, audit, rate limits) |
| `DATABASE_URL` | **Server-only Secret** | CI / Migrations | Direct Postgres URL for running SQL migrations |
| `GEMINI_API_KEY` | **Server-only Secret** | Vercel API | Google Gemini API key (`@google/genai`) |
| `GEMINI_MODEL` | Server-only (optional) | Vercel API | Defaults to `gemini-2.5-flash` |
| `CERTIFICATE_SIGNING_SECRET` | **Server-only Secret** | Vercel API | Min 32-char cryptographically random secret (`openssl rand -hex 32`) |
| `ALLOWED_ORIGINS` | Server-only | Vercel API | Comma-separated exact production origins (e.g., `https://workism.vercel.app`) |
| `AI_DAILY_QUOTA` | Server-only (optional) | Vercel API | Per-user daily AI request cap (default `40`) |
| `CODE_EXECUTION_URL` | Server-only (optional) | Vercel API | External isolated sandbox endpoint (leave empty to report explicit unavailable state) |
| `CODE_EXECUTION_TOKEN` | **Server-only Secret** (optional) | Vercel API | Bearer token for external sandbox |

## 2. Supabase Project Setup

1. **Apply SQL Migrations** in order:
   - `supabase/migrations/0001_core_schema.sql`
   - `supabase/migrations/0002_rls_and_storage.sql`
   - `supabase/migrations/0003_seed_catalog.sql`
   - `supabase/migrations/0004_security_hardening.sql`
2. **Authentication Settings** (Supabase Dashboard -> Authentication):
   - Enable Email provider with **Confirm email** enabled.
   - Configure **Google OAuth** client ID & secret in Supabase Auth Providers (never in frontend code).
   - Set **Site URL** to `https://<your-domain>` and **Redirect URLs** to:
     - `https://<your-domain>/auth/callback`
     - `https://<your-domain>/reset-password`
     - `http://localhost:5173/auth/callback` (development only)
     - `http://localhost:5173/reset-password` (development only)
   - Enable Auth rate limits and Leaked Password Protection.
3. **Promote First Administrator** (run once in Supabase SQL Editor after registering your admin account):
   ```sql
   update public.profiles set role = 'admin' where email = 'admin@your-domain.edu';
   ```
4. **Verify Storage Bucket**: Confirm `project-submissions` exists in Storage with `Public: false` and 10 MB limit.

## 3. Local Development

1. Copy `.env.example` to `.env.local` and fill in your **non-production** Supabase & Gemini credentials.
2. Run local API server and Vite frontend in two terminals (or use `npx vercel dev`):
   ```bash
   npm run dev:api   # http://127.0.0.1:3001
   npm run dev       # http://localhost:5173 (proxies /api -> 127.0.0.1:3001)
   ```
3. Run tests, lint, typecheck, production build, and secret scans:
   ```bash
   npm test
   npm run lint
   npm run build
   npm run scan:secrets
   npm run scan:dist
   ```

## 4. Vercel Deployment

1. Import `https://github.com/vijay2007a/Workism-` into Vercel (Framework Preset: **Vite**).
2. `vercel.json` automatically configures:
   - Build command: `npm run build` (`dist/` output)
   - Single serverless API function: `/api/(.*)` -> `/api/index`
   - SPA client-side routing fallback to `/index.html`
   - Strict CSP, HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`.
3. Add the environment variables above and trigger deployment.
4. Post-deploy verification checklist:
   - `GET https://<your-domain>/api/health` returns `{ ok: true, capabilities: { supabaseConfigured: true, geminiConfigured: true, certificateSigningConfigured: true } }`.
   - Register a test student, verify email, log in, take an assessment, check official score on Liquid Skill Blob, test AI tutor in English & Tamil/Arabic, submit a project, approve as instructor, issue certificate, and scan QR to confirm `/verify/WRK-...`.
   - Confirm browser DevTools Sources/Network contain zero private keys or `SUPABASE_SECRET_KEY`.
