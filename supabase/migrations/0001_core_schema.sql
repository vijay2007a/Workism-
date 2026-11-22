-- ============================================================================
-- WORKISM 3.0 — Migration 0001: Core Relational Schema
-- Target: Supabase PostgreSQL 15+
-- ============================================================================

create extension if not exists pgcrypto;

-- Shared updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- 1. Identity & Roles
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  email text,
  career_goal text not null default '',
  interests text[] not null default '{}',
  learning_style text not null default '',
  learning_pace text not null default '',
  preferred_language text not null default 'en',
  preferred_code_language text not null default '',
  github_username text not null default '' check (github_username = '' or github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  portfolio_slug text unique check (portfolio_slug is null or portfolio_slug ~ '^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$'),
  portfolio_public boolean not null default false,
  show_scores_public boolean not null default false,
  in_app_notices boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Always create new auth users as 'student'; never trust signup metadata for role.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := left(coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'full_name', ''), 60);
  insert into public.profiles (id, role, display_name, email)
  values (new.id, 'student', btrim(v_name), new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table if not exists public.instructor_assignments (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  scope_type text not null check (scope_type in ('course', 'project', 'student')),
  scope_id text not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (instructor_id, scope_type, scope_id)
);

create index if not exists idx_instructor_assignments_instructor on public.instructor_assignments(instructor_id);
create index if not exists idx_instructor_assignments_scope on public.instructor_assignments(scope_type, scope_id);

-- ----------------------------------------------------------------------------
-- 2. Spoken & Programming Languages + Localization Cache
-- ----------------------------------------------------------------------------
create table if not exists public.spoken_languages (
  code text primary key,
  native_name text not null,
  english_name text not null,
  is_rtl boolean not null default false,
  ai_quality_tier text not null default 'high' check (ai_quality_tier in ('high', 'good', 'beta')),
  enabled boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.programming_languages (
  id text primary key,
  name text not null,
  mark text not null,
  color text not null,
  kinds text[] not null default '{}',
  note text not null default '',
  can_ai_explain boolean not null default true,
  has_assessments boolean not null default false,
  can_execute_sandbox boolean not null default false,
  execution_runtime text,
  enabled boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.localized_content (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('lesson', 'course', 'project', 'skill_insight', 'roadmap')),
  entity_id text not null,
  language_code text not null references public.spoken_languages(code) on delete cascade,
  content jsonb not null,
  source_hash text not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, language_code)
);

-- ----------------------------------------------------------------------------
-- 3. Skills & Server-Graded Assessments
-- ----------------------------------------------------------------------------
create table if not exists public.skill_categories (
  id text primary key,
  name text not null,
  sort_order int not null default 0
);

create table if not exists public.skills (
  id text primary key,
  category_id text not null references public.skill_categories(id),
  name text not null,
  default_target int not null default 75 check (default_target between 1 and 100),
  sort_order int not null default 0
);

create table if not exists public.skill_assessments (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null unique references public.skills(id) on delete cascade,
  title text not null,
  pass_mark int not null default 70 check (pass_mark between 1 and 100),
  time_limit_seconds int not null default 300 check (time_limit_seconds between 60 and 7200),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.assessment_questions (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.skill_assessments(id) on delete cascade,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  explanation text not null,
  difficulty text not null default 'core' check (difficulty in ('foundation', 'core', 'applied')),
  sort_order int not null default 0
);

create index if not exists idx_assessment_questions_assessment on public.assessment_questions(assessment_id, sort_order);

-- Isolated answer key table: never readable by students via PostgREST/RLS.
create table if not exists public.assessment_question_keys (
  question_id uuid primary key references public.assessment_questions(id) on delete cascade,
  correct_index int not null check (correct_index >= 0)
);

create table if not exists public.assessment_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  assessment_id uuid not null references public.skill_assessments(id) on delete cascade,
  skill_id text not null references public.skills(id),
  status text not null default 'in_progress' check (status in ('in_progress', 'submitted', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  answers jsonb not null default '[]'::jsonb,
  correct_count int check (correct_count is null or correct_count >= 0),
  total_count int check (total_count is null or total_count >= 0),
  score_percent int check (score_percent is null or score_percent between 0 and 100),
  ai_explanation text,
  language_code text not null default 'en'
);

create index if not exists idx_assessment_attempts_user_skill on public.assessment_attempts(user_id, skill_id, started_at desc);

create table if not exists public.user_skill_scores (
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null references public.skills(id) on delete cascade,
  score int not null default 0 check (score between 0 and 100),
  target int not null default 75 check (target between 1 and 100),
  source text not null default 'assessed' check (source in ('assessed', 'practice')),
  updated_at timestamptz not null default now(),
  primary key (user_id, skill_id)
);

create table if not exists public.skill_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text not null references public.skills(id) on delete cascade,
  score int not null check (score between 0 and 100),
  attempt_id uuid references public.assessment_attempts(id) on delete set null,
  recorded_at timestamptz not null default now()
);

create index if not exists idx_skill_history_user_skill on public.skill_history(user_id, skill_id, recorded_at asc);

create or replace view public.user_skill_gaps with (security_invoker = true) as
select
  uss.user_id,
  uss.skill_id,
  s.name as skill_name,
  uss.score,
  uss.target,
  greatest(uss.target - uss.score, 0) as gap,
  (uss.score >= uss.target) as meets_target
from public.user_skill_scores uss
join public.skills s on s.id = uss.skill_id;

-- ----------------------------------------------------------------------------
-- 4. Courses, Adaptive Roadmaps & AI Tutor
-- ----------------------------------------------------------------------------
create table if not exists public.courses (
  id text primary key,
  skill_id text not null references public.skills(id),
  title text not null,
  blurb text not null,
  level text not null check (level in ('Beginner', 'Intermediate', 'Advanced')),
  instructor_id uuid references public.profiles(id) on delete set null,
  published boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.course_modules (
  id text primary key,
  course_id text not null references public.courses(id) on delete cascade,
  title text not null,
  sort_order int not null default 0
);

create index if not exists idx_course_modules_course on public.course_modules(course_id, sort_order);

create table if not exists public.lessons (
  id text primary key,
  module_id text not null references public.course_modules(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  title text not null,
  minutes int not null check (minutes > 0),
  body jsonb not null check (jsonb_typeof(body) = 'array'),
  code_sample text,
  check_question jsonb not null,
  sort_order int not null default 0
);

create index if not exists idx_lessons_course on public.lessons(course_id, sort_order);

create table if not exists public.enrollments (
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, course_id)
);

create table if not exists public.lesson_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id text not null references public.lessons(id) on delete cascade,
  course_id text not null references public.courses(id) on delete cascade,
  check_passed boolean not null default true,
  completed_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists idx_lesson_progress_user_course on public.lesson_progress(user_id, course_id);

create table if not exists public.learning_roadmaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal text not null,
  preferred_language text not null default 'en',
  status text not null default 'active' check (status in ('active', 'archived')),
  summary text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_learning_roadmaps_user on public.learning_roadmaps(user_id, created_at desc);

create trigger trg_learning_roadmaps_updated_at
  before update on public.learning_roadmaps
  for each row execute function public.set_updated_at();

create table if not exists public.roadmap_milestones (
  id uuid primary key default gen_random_uuid(),
  roadmap_id uuid not null references public.learning_roadmaps(id) on delete cascade,
  course_id text references public.courses(id) on delete set null,
  skill_id text references public.skills(id) on delete set null,
  title text not null,
  objective text not null,
  lesson_ids text[] not null default '{}',
  sort_order int not null default 0,
  completed_at timestamptz
);

create index if not exists idx_roadmap_milestones_roadmap on public.roadmap_milestones(roadmap_id, sort_order);

create table if not exists public.ai_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  skill_id text references public.skills(id) on delete set null,
  course_id text references public.courses(id) on delete set null,
  language_code text not null default 'en',
  recommendation text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.tutor_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  language_code text not null default 'en',
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);

create index if not exists idx_tutor_messages_user on public.tutor_messages(user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 5. Coding Challenges & Execution Jobs
-- ----------------------------------------------------------------------------
create table if not exists public.coding_challenges (
  id text primary key,
  skill_id text not null references public.skills(id),
  language_id text not null references public.programming_languages(id),
  title text not null,
  minutes int not null default 15 check (minutes > 0),
  brief text not null,
  fn_name text not null,
  starter_code text not null,
  public_tests jsonb not null default '[]'::jsonb,
  published boolean not null default true
);

-- Isolated hidden test cases: never readable by students.
create table if not exists public.coding_challenge_hidden_tests (
  challenge_id text primary key references public.coding_challenges(id) on delete cascade,
  tests jsonb not null check (jsonb_typeof(tests) = 'array')
);

create table if not exists public.code_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  challenge_id text not null references public.coding_challenges(id) on delete cascade,
  language_id text not null references public.programming_languages(id),
  source_code text not null check (char_length(source_code) <= 32768),
  execution_mode text not null check (execution_mode in ('browser_js', 'remote_sandbox', 'unavailable')),
  passed_count int not null default 0 check (passed_count >= 0),
  total_count int not null default 0 check (total_count >= 0),
  results jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_code_submissions_user on public.code_submissions(user_id, challenge_id, created_at desc);

create table if not exists public.execution_jobs (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid references public.code_submissions(id) on delete set null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  language_id text not null references public.programming_languages(id),
  status text not null check (status in ('queued', 'running', 'completed', 'failed', 'unavailable')),
  runtime_ms int,
  memory_kb int,
  stdout_excerpt text,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

-- ----------------------------------------------------------------------------
-- 6. Projects, Rubrics, Submissions & Evaluations
-- ----------------------------------------------------------------------------
create table if not exists public.projects (
  id text primary key,
  title text not null,
  brief text not null,
  level text not null check (level in ('Beginner', 'Intermediate', 'Advanced')),
  estimated_hours int not null check (estimated_hours > 0),
  skill_ids text[] not null default '{}',
  requirements jsonb not null check (jsonb_typeof(requirements) = 'array'),
  instructor_id uuid references public.profiles(id) on delete set null,
  published boolean not null default true,
  sort_order int not null default 0
);

create table if not exists public.project_rubrics (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  criterion text not null,
  description text not null default '',
  max_points int not null default 25 check (max_points between 1 and 100),
  sort_order int not null default 0,
  unique (project_id, criterion)
);

create table if not exists public.project_submissions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  version int not null default 1 check (version >= 1),
  repo_url text check (repo_url is null or repo_url ~ '^https://github\.com/[A-Za-z0-9_-]+/[A-Za-z0-9._-]+/?$'),
  storage_path text,
  file_name text,
  file_size_bytes int check (file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 10485760)),
  file_mime text,
  note text not null default '' check (char_length(note) <= 1000),
  status text not null default 'submitted' check (status in ('submitted', 'evaluating', 'evaluated', 'verified', 'changes_requested')),
  overall_score int check (overall_score is null or overall_score between 0 and 100),
  ai_feedback text,
  automated_tests jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (repo_url is not null or storage_path is not null)
);

create index if not exists idx_project_submissions_user_project on public.project_submissions(user_id, project_id, version desc);
create index if not exists idx_project_submissions_status on public.project_submissions(status, created_at desc);

create trigger trg_project_submissions_updated_at
  before update on public.project_submissions
  for each row execute function public.set_updated_at();

create table if not exists public.project_evaluations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.project_submissions(id) on delete cascade,
  evaluator_id uuid references public.profiles(id) on delete set null,
  evaluator_type text not null check (evaluator_type in ('ai', 'instructor', 'automated')),
  rubric_scores jsonb not null default '[]'::jsonb,
  total_score int check (total_score is null or total_score between 0 and 100),
  feedback text not null default '',
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_evaluations_submission on public.project_evaluations(submission_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 7. Certificates, Integrity Signatures & Verification Audit
-- ----------------------------------------------------------------------------
create table if not exists public.certificate_templates (
  id text primary key,
  title text not null,
  skill_id text not null references public.skills(id),
  course_id text not null references public.courses(id),
  project_id text not null references public.projects(id),
  pass_mark int not null default 70 check (pass_mark between 1 and 100),
  active boolean not null default true
);

create table if not exists public.issued_certificates (
  id uuid primary key default gen_random_uuid(),
  verification_code text not null unique,
  template_id text not null references public.certificate_templates(id),
  user_id uuid not null references public.profiles(id) on delete cascade,
  holder_name text not null,
  title text not null,
  skill_name text not null,
  status text not null default 'verified' check (status in ('verified', 'revoked')),
  issued_at timestamptz not null default now(),
  issued_by uuid references public.profiles(id) on delete set null,
  signature_alg text not null default 'HMAC-SHA256',
  signature_payload jsonb not null,
  signature_hex text not null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revocation_reason text,
  unique (user_id, template_id)
);

create index if not exists idx_issued_certificates_code on public.issued_certificates(verification_code);

create table if not exists public.certificate_verifications (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid references public.issued_certificates(id) on delete set null,
  verification_code text not null,
  outcome text not null check (outcome in ('verified', 'revoked', 'not_found', 'tampered')),
  client_hash text,
  checked_at timestamptz not null default now()
);

create table if not exists public.certificate_audit_log (
  id uuid primary key default gen_random_uuid(),
  certificate_id uuid not null references public.issued_certificates(id) on delete cascade,
  action text not null check (action in ('issued', 'revoked', 'reinstated')),
  actor_id uuid references public.profiles(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 8. Notifications, AI Quotas, Shared Rate Limits & Security Audit Logs
-- ----------------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  dedupe_key text,
  text text not null,
  link_to text not null default '/dashboard',
  read boolean not null default false,
  created_at timestamptz not null default now(),
  unique (user_id, dedupe_key)
);

create index if not exists idx_notifications_user on public.notifications(user_id, created_at desc);

create table if not exists public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  model text not null,
  language_code text not null default 'en',
  prompt_tokens int not null default 0,
  output_tokens int not null default 0,
  latency_ms int not null default 0,
  status text not null check (status in ('ok', 'error', 'quota_blocked', 'timeout')),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_usage_user_day on public.ai_usage_logs(user_id, created_at desc);

create table if not exists public.rate_limit_buckets (
  bucket_key text primary key,
  hits int not null default 1,
  reset_at timestamptz not null
);

-- Atomic serverless-safe rate limiter backed by PostgreSQL.
create or replace function public.check_rate_limit(
  p_key text,
  p_limit int,
  p_window_seconds int
)
returns table(allowed boolean, remaining int, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_new_reset timestamptz := v_now + make_interval(secs => p_window_seconds);
  v_hits int;
  v_reset timestamptz;
begin
  insert into public.rate_limit_buckets (bucket_key, hits, reset_at)
  values (p_key, 1, v_new_reset)
  on conflict (bucket_key) do update
  set
    hits = case when public.rate_limit_buckets.reset_at <= v_now then 1 else public.rate_limit_buckets.hits + 1 end,
    reset_at = case when public.rate_limit_buckets.reset_at <= v_now then v_new_reset else public.rate_limit_buckets.reset_at end
  returning public.rate_limit_buckets.hits, public.rate_limit_buckets.reset_at
  into v_hits, v_reset;

  allowed := v_hits <= p_limit;
  remaining := greatest(p_limit - v_hits, 0);
  reset_at := v_reset;
  return next;
end;
$$;

revoke all on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

create table if not exists public.security_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  ip_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_audit_created on public.security_audit_logs(created_at desc);
