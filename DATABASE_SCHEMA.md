# WORKISM 3.0 — Database Schema & RLS Reference

SQL migrations live in [`supabase/migrations/`](file:///c:/Users/tamiz/OneDrive/Desktop/Cloud/supabase/migrations/):

1. `0001_core_schema.sql` — Tables, primary/foreign keys, check constraints, indexes, triggers, `user_skill_gaps` view, and atomic `check_rate_limit` RPC.
2. `0002_rls_and_storage.sql` — Row Level Security enabled on all 38 tables, non-recursive role helper functions, `prevent_role_self_escalation` trigger, `verify_certificate_public` & `get_public_portfolio` RPCs, and private `project-submissions` Storage bucket + policies.
3. `0003_seed_catalog.sql` — Idempotent seed of 18 spoken languages, 22 programming languages, 5 skills, 5 courses (25 lessons), 5 assessments + isolated answer keys, 2 coding challenges + isolated hidden tests, 4 projects + 12 rubric criteria, and 4 certificate templates.
4. `0004_security_hardening.sql` — Index on `rate_limit_buckets(reset_at)` and opportunistic expired-bucket cleanup inside `check_rate_limit()`.

## Entity Groups

| Domain | Tables / Views | RLS & Access Rules |
|---|---|---|
| **Identity** | `profiles`, `instructor_assignments` | Users read/update own non-role fields; `handle_new_user()` forces `'student'`; `trg_prevent_role_escalation` + RLS block role tampering; admins manage assignments & roles |
| **Languages** | `spoken_languages`, `programming_languages`, `localized_content` | Public/authenticated read of enabled catalogs; admin write; programming languages separate `can_ai_explain`, `has_assessments`, `can_execute_sandbox` |
| **Skills & Assessments** | `skill_categories`, `skills`, `skill_assessments`, `assessment_questions`, `assessment_question_keys`, `assessment_attempts`, `user_skill_scores`, `skill_history`, `user_skill_gaps` | Students read own attempts/scores/history; `assessment_question_keys` is admin-only; official score writes happen exclusively server-side after grading |
| **Learning & AI** | `courses`, `course_modules`, `lessons`, `enrollments`, `lesson_progress`, `learning_roadmaps`, `roadmap_milestones`, `ai_recommendations`, `tutor_messages` | Published catalog readable by learners; enrollments/progress/roadmaps/tutor history strictly scoped to `auth.uid()` (plus scoped instructors for courses/students) |
| **Programming** | `coding_challenges`, `coding_challenge_hidden_tests`, `code_submissions`, `execution_jobs` | `coding_challenge_hidden_tests` is admin-only; submissions/jobs readable only by owner or scoped staff |
| **Projects** | `projects`, `project_rubrics`, `project_submissions`, `project_evaluations` | Students insert submissions only as `status = 'submitted'` with `overall_score IS NULL`; scoped instructors review/verify via backend |
| **Certificates** | `certificate_templates`, `issued_certificates`, `certificate_verifications`, `certificate_audit_log` | Students read own issued certificates; issuance & revocation strictly server-side; `verify_certificate_public(code)` returns only non-PII credential fields |
| **Platform Ops** | `notifications`, `ai_usage_logs`, `rate_limit_buckets`, `security_audit_logs` | Notifications owned by user; AI usage readable by owner or admin; `security_audit_logs` admin-only; `rate_limit_buckets` `service_role`/RPC only |
| **Storage** | `storage.buckets` (`project-submissions`) | Private (`public = false`), 10 MB limit, allowed MIME allowlist, path-prefixed by `auth.uid()` |

## Applying Migrations

Using Supabase CLI (linked to your existing project):
```bash
supabase db push
```
Or execute `0001_core_schema.sql`, `0002_rls_and_storage.sql`, `0003_seed_catalog.sql`, and `0004_security_hardening.sql` sequentially in the Supabase Dashboard SQL Editor.
