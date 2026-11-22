# WORKISM 3.0 — API Documentation

All endpoints are served under `/api/*` via `api/index.ts` -> `server/app.ts`.
Authenticated routes require `Authorization: Bearer <supabase_access_token>`.
All JSON error responses follow `{ "error": { "code": string, "message": string, "details"?: object } }` and never expose stack traces or server credentials.

## Health & Catalog

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | Public | Health check and boolean capability report (never reveals secrets) |
| `GET` | `/api/languages/spoken` | Public | List enabled spoken languages (18 languages, RTL flags, AI quality tier) |
| `GET` | `/api/languages/programming` | Public | List programming languages with separated `canAiExplain`, `hasAssessments`, `canExecuteSandbox` flags |

## Authentication

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/api/auth/register` | Public | 10 / 10m per IP | Register new student account (strictly rejects `role` field; always `student`) |
| `POST` | `/api/auth/login` | Public | 15 / 5m per IP | Email/password login returning verified tokens and role |
| `POST` | `/api/auth/logout` | User | — | Revoke current session |
| `POST` | `/api/auth/recover` | Public | 5 / 10m per IP | Send password recovery email (validates safe redirect; non-enumerating) |
| `POST` | `/api/auth/reset` | User | 5 / 10m per IP | Reset password using active recovery session |
| `POST` | `/api/auth/oauth/google` | Public | 20 / 5m per IP | Return Supabase Google OAuth URL for allowlisted redirect |
| `GET` | `/api/auth/session` | User | — | Return authenticated user identity, authoritative role, and profile |

## Workspace, Profile & Notifications

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/me/workspace` | User | Complete learner workspace (profile, assessed skills for Liquid Skill Blob, courses, lessonsDone, projects, certificates, roadmap, notifications) |
| `GET` | `/api/profile` | User | Get own profile |
| `PATCH` | `/api/profile` | User | Update non-privileged profile & preference fields (rejects `role`/`id`/`email`) |
| `GET` | `/api/notifications` | User | List recent user notifications |
| `POST` | `/api/notifications/read` | User | Mark notifications read |

## Skills, Assessments, Courses & Adaptive AI

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/skills` | User | — | Official skill scores, history, and sorted skill gaps |
| `GET` | `/api/assessments/:skillId` | User | — | Assessment metadata & questions (answer keys stripped) |
| `POST` | `/api/assessments/:skillId/attempts` | User | 15 / 10m | Start timed assessment attempt |
| `POST` | `/api/assessments/attempts/:attemptId/submit` | User | 15 / 10m | Server-side grade against DB answer keys, enforce deadline & single-submission, update official score + optional multilingual Gemini coaching |
| `GET` | `/api/courses` | User | — | Published courses, modules, and lessons |
| `POST` | `/api/courses/:courseId/enroll` | User | — | Enroll in course |
| `POST` | `/api/lessons/:lessonId/complete` | User | — | Submit `{ courseId, answerIndex }` with a zero-based practice answer. The server checks the answer and sequential unlock order. |
| `GET` | `/api/learning/roadmap` | User | — | Active persisted learning roadmap |
| `POST` | `/api/ai/roadmap` | User | 6 / 10m + AI quota | Generate & persist adaptive Gemini roadmap (never regenerates completed lessons) |
| `GET` | `/api/ai/tutor/history` | User | — | Fetch recent AI tutor messages |
| `POST` | `/api/ai/tutor` (alias `/api/assistant/messages`) | User | 20 / 10m + AI quota | Multilingual Gemini tutor (preserves code syntax, enforces daily quota) |
| `DELETE` | `/api/ai/tutor/history` | User | — | Clear tutor conversation history |
| `POST` | `/api/code/execute` | User | 15 / 5m | Execute code via external isolated sandbox (`503 unavailable` with `simulated: false` when unconfigured) |
| `POST` | `/api/code/submissions` | User | 30 / 5m | Record code challenge submission |

## Projects, Certificates & Portfolios

| Method | Path | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/api/projects` | User | — | Project catalog + own submissions |
| `POST` | `/api/projects/:id/upload-url` | User | 15 / 10m | Request short-lived signed Storage upload URL (validates filename/MIME/size) |
| `POST` | `/api/projects/:id/submissions` | User | 10 / 10m | Submit a GitHub URL and/or a validated private file. Use the signed upload ticket, then submit `storagePath`, `fileName`, `fileMime` and `fileSizeBytes`. Archive submissions require a scanner. |
| `GET` | `/api/certificates` | User | — | Certificate templates, live eligibility breakdown, and issued records |
| `POST` | `/api/certificates/:templateId/issue` | User | 10 / 10m | Verify 100% course + assessed score >= pass mark + verified project; sign with HMAC-SHA256 & persist |
| `GET` | `/api/certificates/:code/pdf` | Public | 30 / 10m | Download generated `%PDF-1.4` certificate (rejects revoked or tampered) |
| `GET` | `/api/verify/:code` (alias `/api/certificates/:id`) | Public | 60 / 10m | Verify cryptographic signature & revocation status; returns only public metadata |
| `GET` / `PATCH` | `/api/portfolio` | User | — | Read/update portfolio slug and privacy toggles |
| `GET` | `/api/portfolio/:slug` | Public | 60 / 10m | Read opted-in public student portfolio (omits scores unless `showScoresPublic = true`) |

## Instructor & Administrator Endpoints

| Method | Path | Role | Description |
|---|---|---|---|
| `GET` | `/api/instructor/overview` | `instructor`, `admin` | Course/project/submission counts |
| `GET` | `/api/instructor/submissions` | `instructor`, `admin` | Submissions within assigned project scope |
| `GET` | `/api/instructor/submissions/:id/file` | `instructor`, `admin` | Get a five-minute download URL for an assigned submission |
| `POST` | `/api/instructor/submissions/:id/review` | `instructor`, `admin` | Score rubric, verify/approve or request changes, notify student, log audit |
| `POST` | `/api/instructor/courses` | `instructor`, `admin` | Create new course |
| `POST` | `/api/instructor/rubrics` | `instructor`, `admin` | Create/update project rubric criterion |
| `GET` | `/api/admin/overview` | `admin` | Platform user/role/course/language counts and AI usage summary |
| `GET` | `/api/admin/users` | `admin` | List all user profiles |
| `PATCH` | `/api/admin/users/:id/role` | `admin` | Change user role (blocks self-demotion; audited) |
| `POST` | `/api/admin/certificates/:id/revoke` | `admin` | Revoke certificate with reason (audited) |
| `PATCH` | `/api/admin/languages/:code` | `admin` | Enable/disable spoken language (audited) |
| `GET` | `/api/admin/ai-usage` | `admin` | Aggregated AI usage & quota metrics |
| `GET` | `/api/admin/audit-logs` | `admin` | Latest 100 security audit log entries |
