# WORKISM 3.0 — Backend Implementation Plan

## Phase 0 — Repository Discovery & Audit Summary

| Area | Verified Finding |
|---|---|
| Real source location | Local workspace `c:\Users\tamiz\OneDrive\Desktop\Cloud` (complete React 19 + Vite 8 + TypeScript 7 + Tailwind 4 + Motion + OGL + Recharts + `uqr` frontend) |
| Remote repository | `https://github.com/vijay2007a/Workism-` verified **empty** (`git ls-remote` returned 0 refs) |
| Local Git state | Not yet initialized (no `.git` directory). Safe initialization on `main` required after hardening `.gitignore` |
| Existing routes | `/`, `/login`, `/register`, `/onboarding`, `/verify/:id`, `/dashboard`, `/skills`, `/learn`, `/learn/:courseId/:lessonId?`, `/learn/languages`, `/labs`, `/labs/:id`, `/assessments`, `/assessments/quiz/:skillId`, `/assessments/code/:id`, `/certificates`, `/certificates/:id`, `/portfolio`, `/assistant`, `/settings` |
| Existing API contract | `src/services/index.ts` (provisional endpoints: `GET /me/workspace`, `POST /auth/login`, `POST /auth/register`, `POST /projects/:id/submissions`, `GET /certificates/:id`, `POST /assistant/messages`) |
| Existing auth & DB | None connected; local `localStorage` (`workism:v1`) + labelled sample records in `src/data/sample.ts` |
| Baseline checks | 46/46 unit tests pass (`npm test`), 0 lint issues (`oxlint`), 0 typecheck errors (`tsc --noEmit`) |
| Environment & CLIs | Node `v24.15.0`, npm `11.12.1`, Git present; `gh`, `supabase`, `vercel`, `gitleaks` absent. No live Supabase/Gemini/Vercel credentials in workspace or environment |
| Security findings | 1) Original `.gitignore` lacked `.env`, `.env.*`, `*.key`, `*.pem`, `.vercel/`, `*.db`. 2) No secret scanner configured. 3) No CSP/security headers or Vercel deployment config. 4) Quiz answers and hidden coding test cases currently live client-side in sample mode |
| Ponytail methodology | Official Ponytail plugin is active in the environment (`ponytail`, `ponytail-review`, `ponytail-audit`). Applied throughout |

---

## Proposed Backend Architecture

```text
React + Vite SPA (existing Liquid Glass UI preserved)
  ├── Browser Supabase Client (VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY)
  │     └── Supabase Auth (Email/Password, Verification, Google OAuth, Recovery, Sessions)
  └── Authenticated Fetch (/api/* with Bearer JWT)
        └── Single Vercel Web-Standard Serverless Function (api/index.ts -> server/app.ts)
              ├── Security layer: strict CORS, CSP/security headers, Zod validation, PG-backed rate limits
              ├── RLS-scoped Supabase client (user JWT + publishable key) for standard learner reads/writes
              ├── Privileged Supabase client (SUPABASE_SECRET_KEY) ONLY for:
              │     • server-graded official skill scores & answer-key lookup
              │     • HMAC-SHA256 certificate signing, issuance & public verification
              │     • instructor/admin role-checked workflows & audit logs
              │     • shared PostgreSQL rate-limit buckets & AI quota tracking
              ├── Google Gemini (@google/genai, gemini-2.5-flash) — server-only with quotas/timeouts
              ├── Supabase Storage (private bucket `project-submissions`, signed URLs, MIME/magic-byte validation)
              └── External Isolated Code Execution Boundary (CODE_EXECUTION_URL; explicit unavailable state if unset)
```

**Why a single Vercel Function (`api/index.ts` + `vercel.json` rewrite)?**
- Respects Vercel Hobby's 12-function limit and eliminates cold-start sprawl.
- Uses standard Web Fetch `Request`/`Response` directly (zero Express/Fastify/Next.js bloat — Ponytail rule).
- Lets Node 24's built-in test runner execute the exact HTTP app in milliseconds with isolated test doubles.

---

## Phased Execution Plan

### Phase 1 — Plan & Safe Git Baseline
- **Objective**: Hardened `.gitignore`, safe `.env.example`, `BACKEND_IMPLEMENTATION_PLAN.md`, secret scanner (`scripts/secret-scan.ts`), `git init -b main` linked to `https://github.com/vijay2007a/Workism-`.
- **Existing files**: `.gitignore`, `.env.example`.
- **New files**: `BACKEND_IMPLEMENTATION_PLAN.md`, `scripts/secret-scan.ts`.
- **Security**: Verify zero secrets before initial baseline commit.
- **Completion criteria**: Clean baseline commit on `main`, secret scan passes, 46/46 baseline tests pass.
- **Commit checkpoint**: `chore: initialize repository with secret protections and backend plan`.

### Phase 2 — Supabase Dependencies, Schema & Migrations
- **Objective**: Install `@supabase/supabase-js`, `@google/genai`, `zod`; author PostgreSQL schema migrations and catalog seed.
- **Existing files**: `package.json`, `tsconfig.json`.
- **New files**: `supabase/migrations/0001_core_schema.sql`, `supabase/migrations/0002_rls_and_storage.sql`, `supabase/migrations/0003_seed_catalog.sql`.
- **Database changes**: Identity (`profiles`, `instructor_assignments`), Languages (`spoken_languages`, `programming_languages`, `localized_content`), Skills (`skill_categories`, `skills`, `skill_assessments`, `assessment_questions`, `assessment_attempts`, `user_skill_scores`, `skill_history`), Learning (`courses`, `course_modules`, `lessons`, `enrollments`, `lesson_progress`, `learning_roadmaps`, `roadmap_milestones`, `ai_recommendations`, `tutor_messages`), Programming (`coding_challenges`, `coding_challenge_hidden_tests`, `code_submissions`, `execution_jobs`), Projects (`projects`, `project_rubrics`, `project_submissions`, `project_evaluations`), Certificates (`certificate_templates`, `issued_certificates`, `certificate_verifications`, `certificate_audit_log`), Platform (`notifications`, `ai_usage_logs`, `rate_limit_buckets`, `security_audit_logs`).
- **Security**: Separate answer keys and hidden tests from student-readable surfaces; enforce check constraints and foreign keys.
- **Tests**: SQL migration structural integrity & policy verification test (`server/tests/schema.test.ts`).
- **Commit checkpoint**: `feat(db): add Supabase PostgreSQL schema, RLS policies, storage rules, and catalog seed`.

### Phase 3 — Core Backend Foundation & Supabase Auth
- **Objective**: Build `server/env.ts`, `server/supabase.ts`, `server/security.ts`, `server/auth.ts`, `server/app.ts`, `api/index.ts`, plus auth endpoints (`register`, `login`, `logout`, `recover`, `reset`, `oauth/google`, `session`).
- **Security**: Verified Supabase JWTs only; public signup locked to `student` role; safe redirect validation; PG-backed rate limiting; strict CORS and response sanitization.
- **Tests**: Auth flow, role escalation prevention, redirect validation, rate-limit tests (`server/tests/auth.test.ts`).
- **Commit checkpoint**: `feat(auth): implement Supabase Auth endpoints, JWT verification, and security middleware`.

### Phase 4 — Row Level Security & Negative Authorization Suite
- **Objective**: Verify RLS policies across all tables and storage buckets, plus server-side RBAC enforcement.
- **Security**: Prove Student A cannot read/write Student B's records, students cannot self-promote to admin, cannot tamper official scores, cannot read hidden tests/answers, cannot self-issue certificates, and public users cannot read private records.
- **Tests**: Comprehensive negative authorization & RLS policy test suite (`server/tests/security-rls.test.ts`).
- **Commit checkpoint**: `test(security): verify RLS policies and negative authorization boundaries`.

### Phase 5 — Skill Profiling & Server-Graded Assessments
- **Objective**: Implement `/api/skills`, `/api/assessments/:skillId`, attempt creation, server-side grading against authoritative answer keys, score & history persistence, skill gap calculation, and Gemini result explanation (without inventing scores).
- **Tests**: Accurate score math, answer-key secrecy, Liquid Skill Blob payload contract (`server/tests/skills.test.ts`).
- **Commit checkpoint**: `feat(skills): implement server-graded skill assessments and profile scoring APIs`.

### Phase 6 & 7 — Adaptive AI Learning, Multilingual Support & AI Tutor
- **Objective**: Implement course catalog, enrollment, sequential lesson completion, persisted personalized AI roadmaps, multilingual AI tutor with quotas/rate limits/context preservation, and Portuguese (`pt`) + 17 existing spoken languages (including RTL `ar`).
- **New files**: `server/ai.ts`, `server/routes/learning.ts`, `src/locales/pt.ts`.
- **Security**: Authenticated AI endpoints only, daily per-user quota, token/size caps, timeouts, bounded retries, prompt privacy, syntax-preserving multilingual instruction.
- **Tests**: Roadmap generation, completed-lesson preservation, quota enforcement, multilingual tutor behavior (`server/tests/learning-ai.test.ts`).
- **Commit checkpoint**: `feat(learning): add adaptive AI roadmaps, multilingual Gemini tutor, and progress APIs`.

### Phase 8 — Programming Language Catalog & Isolated Execution Boundary
- **Objective**: Separate AI explanation, assessments, and sandbox execution capabilities per programming language; implement external sandbox execution adapter with strict limits and explicit `unavailable` state when unconfigured (never simulating passed tests).
- **New files**: `server/execution.ts`, `server/routes/code.ts`.
- **Tests**: Capability separation, sandbox limit validation, unavailable state contract (`server/tests/execution.test.ts`).
- **Commit checkpoint**: `feat(code): add programming language capabilities and isolated sandbox execution boundary`.

### Phase 9 — Project Assessment Engine & Secure File Uploads
- **Objective**: Implement project catalog, GitHub URL + private Supabase Storage file submissions, magic-byte & archive upload validation, rubric-based AI analytical feedback (never claiming unexecuted tests passed), instructor evaluation workflow, and resubmission history.
- **New files**: `server/uploads.ts`, `server/routes/projects.ts`.
- **Security**: Strict GitHub URL regex (anti-SSRF), private storage bucket, 10MB cap, magic-byte verification, filename sanitization, zip/executable rejection, short-lived signed URLs.
- **Tests**: Upload security, SSRF rejection, rubric evaluation & history tests (`server/tests/projects.test.ts`).
- **Commit checkpoint**: `feat(projects): implement project assessment engine and secure upload validation`.

### Phase 10, 11 & 12 — Certificates, Public Verification, Portfolios, Instructor & Admin
- **Objective**:
  - Eligibility-gated certificate issuance, HMAC-SHA256 cryptographic signing + verification, valid server-generated PDF certificates, revocation & audit trail, public `/api/verify/:code` revealing only safe fields.
  - Persistent student portfolios with privacy settings and shareable `/api/portfolio/:slug`.
  - Instructor review/rubric/course APIs and Admin user/role/language/revocation/AI-usage/audit-log APIs.
- **New files**: `server/certificates.ts`, `server/pdf.ts`, `server/routes/certificates.ts`, `server/routes/portfolio.ts`, `server/routes/staff.ts`.
- **Tests**: Eligibility enforcement, tamper detection, revocation rejection, portfolio privacy, instructor/admin RBAC (`server/tests/credentials-staff.test.ts`).
- **Commit checkpoint**: `feat(credentials): add signed certificates, portfolios, and instructor/admin APIs`.

### Phase 13 — Frontend Service & Screen Integration
- **Objective**: Connect existing React/Vite frontend (`src/lib/supabase.ts`, `src/lib/auth.tsx`, `src/services/index.ts`, pages & navbar) to real backend APIs while keeping Liquid Glass UI intact and sample fallback strictly for explicit unconfigured/demo mode. Add Instructor, Admin, Reset Password, Auth Callback, and Public Portfolio screens.
- **Tests**: Existing 46 frontend tests + new integration/E2E student lifecycle test (`server/tests/lifecycle.test.ts`).
- **Commit checkpoint**: `feat(frontend): integrate Supabase Auth, backend APIs, and role dashboards`.

### Phase 14–19 — Security Hardening, Automated Verification & Vercel Deployment Prep
- **Objective**: Add `vercel.json` (SPA fallback, `/api` rewrite, strict security headers), Vite dev API bridge (`server/dev-plugin.ts`), bundle secret-leak test (asserting zero private keys/server modules in `dist/`), dependency audit, and production build verification.
- **Commit checkpoint**: `chore(deploy): configure Vercel deployment, security headers, and bundle checks`.

### Phase 20–22 — Final Security Audit, Ponytail Refactor & Complete Documentation
- **Objective**: Run full Ponytail code quality review & security audit against Supabase's production checklist; generate `SECURITY_AUDIT_REPORT.md`, `BACKEND_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`, `API_DOCUMENTATION.md`, `DEPLOYMENT_GUIDE.md`; verify all tests, lint, typecheck, build, secret scan; safely push to GitHub if credentials permit.
- **Commit checkpoints**:
  - `docs: add architecture, schema, API, security audit, and deployment guides`
  - Final verified push (if remote auth available).
