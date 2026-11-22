# WORKISM 3.0 — Backend Architecture

## Overview

WORKISM 3.0 pairs the existing **React 19 + Vite 8 + TypeScript + Liquid Glass** frontend with a lean, single-function **Vercel Web-Standard Serverless API** backed by **Supabase PostgreSQL**, **Supabase Auth**, **Supabase Storage**, and **Google Gemini (`@google/genai`)**.

```text
Browser (React + Vite SPA)
 ├── Supabase Auth Client (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
 │     └── Email/Password, Email Verification, Google OAuth, Password Recovery
 └── Same-Origin API Client (/api/* with Bearer JWT)
       └── api/index.ts  ──►  server/app.ts (Web Standard Request/Response Router)
             ├── server/security.ts        (CORS allowlist, CSP/security headers, Zod, anti-SSRF)
             ├── server/router-utils.ts    (JWT verification, RBAC guards, PG rate limiter)
             ├── server/supabase-runtime.ts
             │     ├── RLS-scoped client (publishable key + user Bearer JWT)
             │     └── Privileged client (SUPABASE_SECRET_KEY — server-only trusted ops)
             ├── server/ai.ts              (@google/genai gemini-2.5-flash, quotas, timeouts, 18 languages)
             ├── server/certificates.ts    (Eligibility checks, HMAC-SHA256 signing, PDF 1.4 generator)
             ├── server/uploads.ts         (Filename sanitization, magic bytes, Zip Slip inspection)
             ├── server/execution.ts       (External isolated sandbox boundary; explicit unavailable state)
             └── server/routes/
                   ├── auth-workspace.ts   (Health, Auth, Workspace, Profile, Languages, Notifications)
                   ├── skills-learning.ts  (Assessments, Skills, Courses, Lessons, Roadmaps, AI Tutor, Code)
                   ├── projects-certs.ts   (Projects, Uploads, Certificates, Verify, Public Portfolios)
                   └── staff.ts            (Instructor & Administrator consoles)
```

## Key Architectural Decisions (Ponytail Methodology)

1. **Single Vercel Serverless Function (`api/index.ts`)**: `vercel.json` rewrites `/api/(.*)` to `/api/index`. This stays within Vercel Hobby's 12-function limit, avoids cold-start fragmentation, and requires zero extra HTTP frameworks (pure Web Fetch `Request`/`Response`).
2. **RLS First, Secret Key Only Where Required**: Ordinary student profile, progress, skill, and submission reads execute through `asUser(jwt)` using the Supabase publishable key so PostgreSQL RLS policies remain enforced. `SUPABASE_SECRET_KEY` is reserved strictly for trusted backend invariants: authoritative answer-key grading, official skill score writes, HMAC-SHA256 certificate issuance, atomic PG rate-limit buckets, audit logs, and role-checked instructor/admin operations.
3. **Isolated Authoritative Secrets & Test Data**: Assessment answer keys (`assessment_question_keys`) and hidden coding tests (`coding_challenge_hidden_tests`) live in dedicated admin-only tables unreachable from browser clients.
4. **Honest Execution Boundaries**: Untrusted learner code never runs in Vercel Functions. Browser JS challenges run in an opaque-origin `<iframe sandbox="allow-scripts">` Web Worker; multi-language server execution delegates to an external isolated sandbox (`CODE_EXECUTION_URL`) or returns HTTP `503` with `simulated: false`.
5. **Cryptographic Credential Integrity**: Certificates are signed with `HMAC-SHA256` over a canonical payload using `CERTIFICATE_SIGNING_SECRET` and verified in constant time (`crypto.timingSafeEqual`). Plain SHA-256 hashes are never treated as proof of issuance.
6. **Zero-Dependency PDF Generation**: `server/certificates.ts` generates standards-compliant single-page `%PDF-1.4` credentials directly in memory without headless Chromium bloat.
7. **Deterministic Testing with Isolated Doubles**: `server/memory-runtime.ts` mirrors the exact RLS, ownership, RBAC, quota, and rate-limit rules so the full 14-step lifecycle and negative security suite run in < 1 second without spending Gemini quota or touching production data.
