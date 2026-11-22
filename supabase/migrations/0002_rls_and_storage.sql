-- ============================================================================
-- WORKISM 3.0 — Migration 0002: Row Level Security, Triggers & Storage Policies
-- ============================================================================

-- Helper functions executed with definer rights to avoid recursive RLS queries.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'student');
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_instructor_for_project(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists(
    select 1 from public.projects p
    where p.id = p_project_id and p.instructor_id = auth.uid()
  ) or exists(
    select 1 from public.instructor_assignments ia
    where ia.instructor_id = auth.uid()
      and ia.scope_type = 'project'
      and ia.scope_id = p_project_id
  );
$$;

create or replace function public.is_instructor_for_course(p_course_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists(
    select 1 from public.courses c
    where c.id = p_course_id and c.instructor_id = auth.uid()
  ) or exists(
    select 1 from public.instructor_assignments ia
    where ia.instructor_id = auth.uid()
      and ia.scope_type = 'course'
      and ia.scope_id = p_course_id
  );
$$;

create or replace function public.is_instructor_for_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists(
    select 1 from public.instructor_assignments ia
    where ia.instructor_id = auth.uid()
      and ia.scope_type = 'student'
      and ia.scope_id = p_student_id::text
  );
$$;

-- Defense-in-depth: block any non-admin / non-service-role attempt to alter role.
create or replace function public.prevent_role_self_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role then
    if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
       and not public.is_admin() then
      raise exception 'Role escalation is forbidden' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_role_escalation on public.profiles;
create trigger trg_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_self_escalation();

-- ----------------------------------------------------------------------------
-- Enable RLS on ALL tables
-- ----------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.instructor_assignments enable row level security;
alter table public.spoken_languages enable row level security;
alter table public.programming_languages enable row level security;
alter table public.localized_content enable row level security;
alter table public.skill_categories enable row level security;
alter table public.skills enable row level security;
alter table public.skill_assessments enable row level security;
alter table public.assessment_questions enable row level security;
alter table public.assessment_question_keys enable row level security;
alter table public.assessment_attempts enable row level security;
alter table public.user_skill_scores enable row level security;
alter table public.skill_history enable row level security;
alter table public.courses enable row level security;
alter table public.course_modules enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.learning_roadmaps enable row level security;
alter table public.roadmap_milestones enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.tutor_messages enable row level security;
alter table public.coding_challenges enable row level security;
alter table public.coding_challenge_hidden_tests enable row level security;
alter table public.code_submissions enable row level security;
alter table public.execution_jobs enable row level security;
alter table public.projects enable row level security;
alter table public.project_rubrics enable row level security;
alter table public.project_submissions enable row level security;
alter table public.project_evaluations enable row level security;
alter table public.certificate_templates enable row level security;
alter table public.issued_certificates enable row level security;
alter table public.certificate_verifications enable row level security;
alter table public.certificate_audit_log enable row level security;
alter table public.notifications enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.rate_limit_buckets enable row level security;
alter table public.security_audit_logs enable row level security;

-- ----------------------------------------------------------------------------
-- Profiles & Instructor Assignments
-- ----------------------------------------------------------------------------
create policy "profiles_select_own_or_scoped_staff"
  on public.profiles for select to authenticated
  using (auth.uid() = id or public.is_instructor_for_student(id));

create policy "profiles_update_own_non_role"
  on public.profiles for update to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id and role = (select p.role from public.profiles p where p.id = auth.uid()));

create policy "profiles_admin_all"
  on public.profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "instructor_assignments_select_own_or_admin"
  on public.instructor_assignments for select to authenticated
  using (instructor_id = auth.uid() or public.is_admin());

create policy "instructor_assignments_admin_write"
  on public.instructor_assignments for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Public Catalogs (read-only for authenticated & anon where appropriate)
-- ----------------------------------------------------------------------------
create policy "spoken_languages_read" on public.spoken_languages for select to anon, authenticated using (enabled = true or public.is_admin());
create policy "spoken_languages_admin" on public.spoken_languages for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "programming_languages_read" on public.programming_languages for select to anon, authenticated using (enabled = true or public.is_admin());
create policy "programming_languages_admin" on public.programming_languages for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "localized_content_read" on public.localized_content for select to authenticated using (true);
create policy "localized_content_admin" on public.localized_content for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "skill_categories_read" on public.skill_categories for select to authenticated using (true);
create policy "skills_read" on public.skills for select to authenticated using (true);
create policy "skill_assessments_read" on public.skill_assessments for select to authenticated using (active = true or public.is_admin());
create policy "assessment_questions_read" on public.assessment_questions for select to authenticated using (true);

-- STRICT: answer keys and hidden tests are NEVER readable or writable by students!
create policy "assessment_question_keys_admin_only"
  on public.assessment_question_keys for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "coding_challenges_read" on public.coding_challenges for select to authenticated using (published = true or public.is_admin());
create policy "coding_challenge_hidden_tests_admin_only"
  on public.coding_challenge_hidden_tests for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ----------------------------------------------------------------------------
-- Student Assessments, Scores & History (students read own; official writes server-only)
-- ----------------------------------------------------------------------------
create policy "assessment_attempts_select_own_or_staff"
  on public.assessment_attempts for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_student(user_id));

create policy "user_skill_scores_select_own_or_staff"
  on public.user_skill_scores for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_student(user_id));

create policy "skill_history_select_own_or_staff"
  on public.skill_history for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_student(user_id));

-- ----------------------------------------------------------------------------
-- Courses, Lessons, Enrollments, Progress, Roadmaps & Tutor
-- ----------------------------------------------------------------------------
create policy "courses_read" on public.courses for select to authenticated using (published = true or instructor_id = auth.uid() or public.is_admin());
create policy "courses_staff_write" on public.courses for all to authenticated using (public.is_instructor_for_course(id)) with check (public.is_instructor_for_course(id));

create policy "course_modules_read" on public.course_modules for select to authenticated using (true);
create policy "lessons_read" on public.lessons for select to authenticated using (true);

create policy "enrollments_own" on public.enrollments for all to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_course(course_id))
  with check (user_id = auth.uid());

create policy "lesson_progress_own" on public.lesson_progress for all to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_course(course_id))
  with check (user_id = auth.uid());

create policy "learning_roadmaps_own" on public.learning_roadmaps for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_student(user_id));

create policy "roadmap_milestones_own" on public.roadmap_milestones for select to authenticated
  using (exists(select 1 from public.learning_roadmaps r where r.id = roadmap_id and (r.user_id = auth.uid() or public.is_instructor_for_student(r.user_id))));

create policy "ai_recommendations_own" on public.ai_recommendations for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_student(user_id));

create policy "tutor_messages_own" on public.tutor_messages for select to authenticated
  using (user_id = auth.uid());
create policy "tutor_messages_delete_own" on public.tutor_messages for delete to authenticated
  using (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Code Submissions & Execution Jobs
-- ----------------------------------------------------------------------------
create policy "code_submissions_own_select" on public.code_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_student(user_id));

create policy "execution_jobs_own_select" on public.execution_jobs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- ----------------------------------------------------------------------------
-- Projects, Rubrics, Submissions & Evaluations
-- ----------------------------------------------------------------------------
create policy "projects_read" on public.projects for select to authenticated using (published = true or instructor_id = auth.uid() or public.is_admin());
create policy "project_rubrics_read" on public.project_rubrics for select to authenticated using (true);
create policy "project_rubrics_staff_write" on public.project_rubrics for all to authenticated
  using (public.is_instructor_for_project(project_id))
  with check (public.is_instructor_for_project(project_id));

create policy "project_submissions_select_own_or_instructor" on public.project_submissions for select to authenticated
  using (user_id = auth.uid() or public.is_instructor_for_project(project_id));

-- Students may insert submissions only in 'submitted' status (never self-verified!).
create policy "project_submissions_student_insert" on public.project_submissions for insert to authenticated
  with check (user_id = auth.uid() and status = 'submitted' and overall_score is null);

create policy "project_evaluations_select_own_or_instructor" on public.project_evaluations for select to authenticated
  using (exists(
    select 1 from public.project_submissions ps
    where ps.id = submission_id and (ps.user_id = auth.uid() or public.is_instructor_for_project(ps.project_id))
  ));

-- ----------------------------------------------------------------------------
-- Certificates & Verification (issuance & revocation strictly server-side)
-- ----------------------------------------------------------------------------
create policy "certificate_templates_read" on public.certificate_templates for select to authenticated using (active = true or public.is_admin());

create policy "issued_certificates_select_own_or_admin" on public.issued_certificates for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "certificate_verifications_admin_select" on public.certificate_verifications for select to authenticated
  using (public.is_admin());

create policy "certificate_audit_log_admin_select" on public.certificate_audit_log for select to authenticated
  using (public.is_admin());

-- Public verification RPC exposing ONLY permitted public metadata (no email, no user_id).
create or replace function public.verify_certificate_public(p_code text)
returns table(
  verification_code text,
  template_id text,
  holder_name text,
  title text,
  skill_name text,
  status text,
  issued_at timestamptz,
  revoked_at timestamptz,
  signature_alg text,
  signature_hex text,
  signature_payload jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ic.verification_code,
    ic.template_id,
    ic.holder_name,
    ic.title,
    ic.skill_name,
    ic.status,
    ic.issued_at,
    ic.revoked_at,
    ic.signature_alg,
    ic.signature_hex,
    ic.signature_payload
  from public.issued_certificates ic
  where ic.verification_code = p_code
  limit 1;
$$;

grant execute on function public.verify_certificate_public(text) to anon, authenticated, service_role;

-- Public portfolio RPC exposing ONLY explicitly opted-in student records.
create or replace function public.get_public_portfolio(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_skills jsonb;
  v_projects jsonb;
  v_certs jsonb;
begin
  select id, display_name, career_goal, github_username, show_scores_public
  into v_profile
  from public.profiles
  where portfolio_slug = p_slug and portfolio_public = true
  limit 1;

  if not found then
    return null;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'name', s.name,
    'score', case when v_profile.show_scores_public then uss.score else null end,
    'source', uss.source
  ) order by s.sort_order), '[]'::jsonb)
  into v_skills
  from public.user_skill_scores uss
  join public.skills s on s.id = uss.skill_id
  where uss.user_id = v_profile.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', p.id,
    'title', p.title,
    'brief', p.brief,
    'repoUrl', ps.repo_url
  )), '[]'::jsonb)
  into v_projects
  from public.project_submissions ps
  join public.projects p on p.id = ps.project_id
  where ps.user_id = v_profile.id and ps.status = 'verified';

  select coalesce(jsonb_agg(jsonb_build_object(
    'verificationCode', ic.verification_code,
    'title', ic.title,
    'skillName', ic.skill_name,
    'issuedAt', ic.issued_at
  )), '[]'::jsonb)
  into v_certs
  from public.issued_certificates ic
  where ic.user_id = v_profile.id and ic.status = 'verified';

  return jsonb_build_object(
    'displayName', v_profile.display_name,
    'careerGoal', v_profile.career_goal,
    'githubUsername', v_profile.github_username,
    'showScores', v_profile.show_scores_public,
    'skills', v_skills,
    'projects', v_projects,
    'certificates', v_certs
  );
end;
$$;

grant execute on function public.get_public_portfolio(text) to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Notifications, AI Usage, Rate Limits & Security Audit
-- ----------------------------------------------------------------------------
create policy "notifications_own" on public.notifications for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "ai_usage_own_or_admin" on public.ai_usage_logs for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

create policy "security_audit_logs_admin_only" on public.security_audit_logs for select to authenticated
  using (public.is_admin());

-- rate_limit_buckets: no policies for anon/authenticated (service_role / RPC only).

-- ----------------------------------------------------------------------------
-- Private Supabase Storage Bucket for Project Submissions
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-submissions',
  'project-submissions',
  false,
  10485760,
  array['application/pdf', 'application/zip', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg']
)
on conflict (id) do update
set public = false, file_size_limit = 10485760, allowed_mime_types = excluded.allowed_mime_types;

create policy "storage_project_submissions_own_upload"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "storage_project_submissions_own_or_admin_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

create policy "storage_project_submissions_own_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'project-submissions'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
