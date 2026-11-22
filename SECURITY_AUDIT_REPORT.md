# WORKISM 3.0 — Security Audit Report

**Audit Date:** 2026-11-22  
**Reference Baseline:** Supabase Production Security Checklist (`https://supabase.com/docs/guides/security/production-checklist`), OWASP API Security Top 10, Ponytail Audit Methodology  
**Scope:** PostgreSQL migrations & RLS policies, Vercel Web-Standard API (`api/`, `server/`), Supabase Storage rules, Gemini AI boundary, Vite client bundle (`dist/`), `.gitignore` & Git commit history.

## Integration verification on 22 November 2026

| Finding | Severity | Resolution and evidence |
|---|---|---|
| The hosted project's default grants blocked backend writes and included unnecessary learner privileges. | High | The production integrity migration grants only required Data API access. Hosted assertions verified student isolation, scoped staff access, protected grades, answer keys and certificate issuance. |
| The original assessment bank reused public practice answers. Grade writes and review writes could partially succeed. | High | New attempts use 15 distinct official questions with private answer keys. Hosted tests checked atomic grade history, review persistence and roadmap milestones. |
| The public verification RPC included a signed payload containing an internal user ID. | High | Public callers now reach verification through the application. The raw RPC cannot be executed by anonymous users. Local tests checked signed fields, revocation and public responses. |
| Concurrent Gemini requests could pass a count-based quota, and a failed count defaulted to zero. | High | The server reserves quota before provider use with the shared database limiter. The hosted test verified admission and rejection at the limit. Provider calls await confirmed key rotation. |
| A direct project submission could reference an unchecked upload. | High | The API reads the private object and validates its path, size, type and bytes before accepting it. Scoped staff can request a short-lived download. Archive submissions are disabled pending a scanner. Signed HTTP transfer awaits an authenticated preview session. |
| Browser account changes could retain the previous learner's data, or display practice results while an official grade was pending. | High | Hosted learner state is kept in memory and reset on account changes. Official scores are displayed after successful submission. Build and type checks passed. |

Supabase project `vkajgacpwdfaudvpgxrr` has 38 application tables with RLS enabled, 62 foreign keys and a private 10 MiB submission bucket. Migrations `0001`–`0004` and `20261122103523_production_integrity` were applied and recorded. The hosted test in `supabase/tests/integration.sql` rolled back all fixtures. The database returned zero auth users and zero assessment attempts afterwards.

Supabase Auth reports email sign-up enabled, email confirmation required, and Google sign-in disabled. An inbox-backed confirmation/recovery journey, authenticated preview requests, Gemini billing and signing-key operation remain release checks. Backup restoration and malware scanning have not been verified. The database advisor flags callable policy helpers and the platform's RLS event function. The rate-limit table intentionally has no learner policy.

Local verification passed all 68 tests, type checking, lint, a production build, secret scans of the working tree, Git history and compiled assets, and npm audit with zero reported advisories. Secret scanning detects known patterns. The previously exposed Gemini credential is a separate rotation requirement.

## Historical findings from the initial implementation

## Findings Identified & Remediated During Audit

| # | Severity | Finding | Affected Component | Remediation Applied | Test Evidence |
|---|---|---|---|---|---|
| 1 | **Critical** | Original `.gitignore` did not exclude `.env`, `.env.*`, `*.pem`, `*.key`, `.vercel/`, or local DB files | `.gitignore` | Hardened `.gitignore` before `git init`; added `scripts/secret-scan.ts` executed on staged files and built `dist/` bundle | `npm run scan:secrets` & `npm run scan:dist` pass with 0 findings; `server/tests/deployment.test.ts` |
| 2 | **High** | Assessment deadline (`expiresAt`) was stored on attempt start but not enforced during submission | `server/routes/skills-learning.ts` | Added server-side deadline enforcement (+15s network grace) rejecting expired attempts with HTTP `410 attempt_expired` | `server/tests/auth-security.test.ts` ("server rejects expired assessment attempts") |
| 3 | **High** | Inline validated project file uploads built a storage path without writing bytes to private Supabase Storage | `server/routes/projects-certs.ts`, `server/supabase-runtime.ts` | Added `storage.uploadBytes(...)` writing validated bytes directly into private `project-submissions` bucket (`upsert: false`) and rejecting `..`/`\` traversal in `storagePath` | `server/tests/auth-security.test.ts` & `server/tests/lifecycle.test.ts` |
| 4 | **High** | Concurrent double-submission of an assessment attempt could pass initial status check and write duplicate `skill_history` rows | `server/supabase-runtime.ts` | Added `.eq('status', 'in_progress')` guard on the atomic `UPDATE` returning `409 already_submitted` if already finalized | `server/tests/lifecycle.test.ts` (duplicate submission returns `409`) |
| 5 | **Medium** | Public PDF certificate download endpoint lacked rate limiting | `server/routes/projects-certs.ts` | Added `enforceRateLimit(ctx, 'cert:pdf', ctx.ipHash, 30, 600)` | Verified in `server/routes/projects-certs.ts` |
| 6 | **Medium** | `rate_limit_buckets` table lacked expiration index and pruning, risking unbounded table growth under sustained load | `supabase/migrations/0004_security_hardening.sql` | Added `idx_rate_limit_buckets_reset` and probabilistic pruning of buckets expired > 24h inside `check_rate_limit()` | Verified in `supabase/migrations/0004_security_hardening.sql` |
| 7 | **Low** | `AuthProvider` retained unused local `role` state duplicating `WorkspaceProvider.role` | `src/lib/auth.tsx` | Removed redundant state so `WorkspaceProvider` is the single source of truth from server session | `npm run typecheck` & `npm run lint` (0 errors) |

---

## Controls Verified

1. **Authentication & Role Protection**:
   - All authenticated endpoints verify Bearer JWTs through Supabase Auth (`auth.getUser`) and fetch authoritative roles from `profiles`. Client-supplied `userId` or `role` fields are rejected by strict Zod schemas (`RegisterSchema.strict()`, `ProfilePatchSchema.strict()`).
   - PostgreSQL `handle_new_user()` trigger hardcodes `role = 'student'` on signup; `trg_prevent_role_escalation` trigger and RLS `WITH CHECK` prevent self-escalation even via direct PostgREST access.
   - Open redirects blocked via `isSafeRedirectUrl` allowlist.
2. **Row Level Security & Data Isolation**:
   - Every table in `0001_core_schema.sql` has `ENABLE ROW LEVEL SECURITY` verified by `server/tests/schema.test.ts`.
   - Authoritative assessment answer keys (`assessment_question_keys`) and hidden coding tests (`coding_challenge_hidden_tests`) are isolated into admin-only tables.
   - Public verification (`verify_certificate_public`) and public portfolios (`get_public_portfolio`) expose only approved non-PII fields.
3. **Secret & Bundle Hygiene**:
   - Zero server credentials committed to Git history (`git log` scanned before every commit).
   - Client code uses only `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optional `VITE_API_URL`.
   - Production `dist/` bundle scanned with `npm run scan:dist` — 0 leaked env var names or secrets.
4. **AI Cost & Abuse Controls**:
   - Gemini SDK (`@google/genai`) runs strictly server-side behind verified auth, PG-backed rate limits, daily per-user quota (`AI_DAILY_QUOTA`), concurrency cap (`6`), 20s timeout, bounded retry (1), and usage logging (`ai_usage_logs`).
5. **Code Execution & Upload Safety**:
   - Untrusted code is NEVER executed on Vercel or the primary Node backend; non-JS execution routes to an isolated external boundary (`CODE_EXECUTION_URL`) or returns explicit `503 unavailable` with `simulated: false`.
   - File uploads enforce MIME/extension parity, magic-byte inspection, Zip Slip & executable archive screening, 10 MB bucket cap (3 MB inline cap), and `auth.uid()` storage path prefixing.
6. **Dependency Audit**:
   - `npm audit --json` reported **0 vulnerabilities** across 233 installed packages (0 critical, 0 high, 0 moderate, 0 low).

---

## Remaining Risks & Operator Responsibilities

1. **Live Supabase Dashboard Hardening**: Enable email confirmation, Supabase Auth rate limits, Leaked Password Protection (HIBP), CAPTCHA/Turnstile on auth if exposed to public bots, and restrict Auth Redirect URLs to your exact production domain.
2. **Database Backup & PITR**: Configure automated daily backups / Point-in-Time Recovery in Supabase before onboarding live learners.
3. **Malware Scanning for Uploaded Archives**: Structural magic-byte and Zip Slip checks block malformed/executable archives; integrate an asynchronous antivirus scanner (e.g., ClamAV worker subscribed to Storage object events) before opening uploads to untrusted public users at scale.
4. **Inline vs Direct Signed Upload**: Current `ProjectPage.tsx` uses inline base64 up to 3 MB (`shortcut:` documented in code) to fit within Vercel's 4.5 MB request body cap; switch the frontend upload step to direct `PUT` against `/api/projects/:id/upload-url` when supporting 3–10 MB archives.
5. **External Code Sandbox**: Configure a hardened container/microVM runner (e.g., Judge0/Piston/Firecracker with `--network=none`, cgroups memory/CPU limits, and zero production secrets) for `CODE_EXECUTION_URL` to enable server-side non-JS test execution.
6. **Signing Key Rotation**: Store `CERTIFICATE_SIGNING_SECRET` (≥ 32 random bytes) exclusively in Vercel encrypted production env vars; plan a versioned key-ID (`kid`) scheme if key rotation is required later.
