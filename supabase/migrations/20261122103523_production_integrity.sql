-- Specify Data API grants explicitly for both legacy and opt-in Supabase projects.
do $$
declare
  relation_name text;
begin
  foreach relation_name in array array[
    'profiles','instructor_assignments','spoken_languages','programming_languages','localized_content',
    'skill_categories','skills','skill_assessments','assessment_questions','assessment_question_keys',
    'assessment_attempts','user_skill_scores','skill_history','courses','course_modules','lessons',
    'enrollments','lesson_progress','learning_roadmaps','roadmap_milestones','ai_recommendations','tutor_messages',
    'coding_challenges','coding_challenge_hidden_tests','code_submissions','execution_jobs','projects',
    'project_rubrics','project_submissions','project_evaluations','certificate_templates','issued_certificates',
    'certificate_verifications','certificate_audit_log','notifications','ai_usage_logs','rate_limit_buckets',
    'security_audit_logs'
  ] loop
    execute format('revoke all privileges on public.%I from public, anon, authenticated', relation_name);
    execute format('grant select, insert, update, delete on public.%I to service_role', relation_name);
  end loop;
end $$;

grant select on public.profiles, public.skills, public.user_skill_scores, public.skill_history,
  public.assessment_attempts, public.project_submissions, public.lesson_progress, public.issued_certificates,
  public.learning_roadmaps, public.roadmap_milestones, public.project_rubrics to authenticated;
grant update(display_name, career_goal, interests, learning_style, learning_pace, preferred_language,
  preferred_code_language, github_username, portfolio_slug, portfolio_public, show_scores_public,
  in_app_notices) on public.profiles to authenticated;
grant insert, update on public.project_rubrics to authenticated;
revoke all on public.user_skill_gaps from public, anon, authenticated;
grant select on public.user_skill_gaps to authenticated, service_role;

alter policy profiles_update_own_non_role on public.profiles
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
-- Invoker identity is the database role selected by PostgREST. Privileged maintenance
-- and the RBAC-checked backend can manage roles without depending on legacy JWT GUCs.
create or replace function public.prevent_role_self_escalation() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if new.role is distinct from old.role and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'Role escalation is forbidden' using errcode = '42501';
  end if;
  return new;
end $$;
alter function public.set_updated_at() set search_path = '';
revoke execute on function public.verify_certificate_public(text), public.get_public_portfolio(text),
  public.handle_new_user(), public.prevent_role_self_escalation(), public.set_updated_at(),
  public.current_user_role(), public.is_admin(), public.is_instructor_for_course(text),
  public.is_instructor_for_project(text), public.is_instructor_for_student(uuid)
  from public, anon, authenticated;
grant execute on function public.get_public_portfolio(text) to service_role;
grant execute on function public.is_admin(), public.current_user_role(),
  public.is_instructor_for_course(text), public.is_instructor_for_project(text),
  public.is_instructor_for_student(uuid) to authenticated, service_role;

-- Recheck the current role as well as assignments so demotion takes effect immediately.
create or replace function public.is_instructor_for_project(p_project_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.current_user_role() = 'instructor' and
    (exists(select from public.projects where id=p_project_id and instructor_id=auth.uid())
     or exists(select from public.instructor_assignments where instructor_id=auth.uid()
       and scope_type='project' and scope_id=p_project_id)));
$$;
create or replace function public.is_instructor_for_course(p_course_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.current_user_role() = 'instructor' and
    (exists(select from public.courses where id=p_course_id and instructor_id=auth.uid())
     or exists(select from public.instructor_assignments where instructor_id=auth.uid()
       and scope_type='course' and scope_id=p_course_id)));
$$;
create or replace function public.is_instructor_for_student(p_student_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_admin() or (public.current_user_role() = 'instructor' and
    exists(select from public.instructor_assignments where instructor_id=auth.uid()
      and scope_type='student' and scope_id=p_student_id::text));
$$;
drop policy project_submissions_student_insert on public.project_submissions;
drop policy storage_project_submissions_own_upload on storage.objects;
drop policy storage_project_submissions_own_delete on storage.objects;

-- Score, history and finalized attempt must commit together.
create function public.record_final_grade() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.user_skill_scores(user_id,skill_id,score,target,source)
    select new.user_id,new.skill_id,new.score_percent,default_target,'assessed'
    from public.skills where id=new.skill_id
  on conflict (user_id,skill_id) do update set score=excluded.score, source='assessed', updated_at=now();
  insert into public.skill_history(user_id,skill_id,score,attempt_id)
    values(new.user_id,new.skill_id,new.score_percent,new.id);
  return new;
end $$;
revoke all on function public.record_final_grade() from public, anon, authenticated;
create trigger record_final_grade after update of status on public.assessment_attempts
  for each row when (old.status='in_progress' and new.status='submitted') execute function public.record_final_grade();

create function public.save_learning_roadmap(p_user uuid,p_goal text,p_language text,p_summary text,p_items jsonb)
returns public.learning_roadmaps language plpgsql security invoker set search_path = '' as $$
declare saved public.learning_roadmaps;
begin
  perform 1 from public.profiles where id=p_user for update;
  update public.learning_roadmaps set status='archived' where user_id=p_user and status='active';
  insert into public.learning_roadmaps(user_id,goal,preferred_language,summary)
    values(p_user,p_goal,p_language,p_summary) returning * into saved;
  insert into public.roadmap_milestones(roadmap_id,course_id,skill_id,title,objective,lesson_ids,sort_order)
    select saved.id,m->>'courseId',m->>'skillId',m->>'title',m->>'objective',
      array(select jsonb_array_elements_text(m->'lessonIds')),i
    from jsonb_array_elements(p_items) with ordinality as j(m,i);
  return saved;
end $$;
revoke all on function public.save_learning_roadmap(uuid,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.save_learning_roadmap(uuid,text,text,text,jsonb) to service_role;

-- Older installations used the browser's lesson practice questions as the official bank.
do $$ begin
  if exists(select from public.assessment_attempts where status='in_progress' and expires_at+interval '15 seconds'>now()) then
    raise exception 'Wait for active assessments to finish before updating the question bank.';
  end if;
end $$;
-- Preserve those rows for historical attempts and give new attempts separate questions.
alter table public.assessment_questions add column practice_derived boolean not null default false;
update public.assessment_questions q set practice_derived=true
from public.skill_assessments a, public.lessons l, public.courses c
where a.id=q.assessment_id and c.id=l.course_id and c.skill_id=a.skill_id
  and q.prompt=l.check_question->>'q' and q.options=l.check_question->'options';

do $$
declare
  item record;
  question_id uuid;
  opts jsonb;
  correct integer;
begin
  for item in select * from (values
    ('js',1,'What does [2, 4, 6].filter(x => x > 2).length return?','2','3','4','Only 4 and 6 pass the filter.'),
    ('js',2,'Which change keeps the original array intact?','Build a new array using map','Call splice on it','Assign it to another variable and call push','map creates a new array.'),
    ('js',3,'When does a finally block run?','After the try or catch completes','Only if an error is thrown','Only if the try block succeeds','finally runs on both success and failure.'),
    ('py',1,'What is len(set([3, 3, 5, 5, 8]))?','3','5','8','A set contains each distinct value once.'),
    ('py',2,'How can a function avoid sharing a default list across calls?','Use None and construct a fresh list inside','Use a default list literal','Call append on the default','Default expressions are evaluated at definition time.'),
    ('py',3,'Which sequence does range(2, 7, 2) produce?','2, 4, 6','2, 4, 6, 8','2, 3, 4, 5, 6','The stop value is excluded and the step is two.'),
    ('ml',1,'Which split estimates how a model performs on future observations?','Train on earlier dates and evaluate on later dates','Train on every date and evaluate on the same dates','Fit preprocessing on future labels','A chronological holdout approximates future usage.'),
    ('ml',2,'A classifier flags 8 correct cases out of 10 alerts. What is its precision?','80%','20%','10%','Precision divides true positives by all predicted positives.'),
    ('ml',3,'What is a useful baseline for a regression task?','Predict the training target mean','Look up each test target','Train on the evaluation labels','A simple training-only predictor provides a comparison.'),
    ('db',1,'Which constraint prevents two accounts sharing the same non-null handle?','UNIQUE','FOREIGN KEY','DEFAULT','A unique constraint rejects duplicate values.'),
    ('db',2,'Which aggregate excludes null entries in a column?','COUNT(column_name)','COUNT(*)','COUNT(1)','COUNT of an expression counts its non-null values.'),
    ('db',3,'Which join keeps every row from the left input?','LEFT JOIN','INNER JOIN','CROSS JOIN followed by an equality filter','Unmatched left rows are retained with nulls on the right.'),
    ('cl',1,'Which action verifies that a backup can recover application data?','Restore it to an isolated environment and validate records','Check only the backup filename','Increase backup retention','A restore drill tests recoverability.'),
    ('cl',2,'What helps a retried payment request avoid a second charge?','An idempotency key','A longer client timeout','Disabling monitoring','An idempotency key identifies repeated operations.'),
    ('cl',3,'A worker reads from a queue. Which permission should it receive?','Read and acknowledge on its assigned queue','Account-wide administration','Delete every queue','Scope permissions to the assigned resource and actions.')
  ) as bank(skill,position,prompt,answer,other1,other2,reason) loop
    select jsonb_agg(v order by n) into opts from
      (select v,random() as n from unnest(array[item.answer,item.other1,item.other2]) v) shuffled;
    select i-1 into correct from jsonb_array_elements_text(opts) with ordinality choice(v,i) where v=item.answer;
    insert into public.assessment_questions(assessment_id,prompt,options,explanation,sort_order)
      select id,item.prompt,opts,item.reason,item.position from public.skill_assessments where skill_id=item.skill
      returning id into question_id;
    insert into public.assessment_question_keys values(question_id,correct);
  end loop;
end $$;

create function public.assign_submission_version() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
  perform 1 from public.profiles where id=new.user_id for update;
  select coalesce(max(version),0)+1 into new.version from public.project_submissions
    where user_id=new.user_id and project_id=new.project_id;
  return new;
end $$;
revoke execute on function public.assign_submission_version() from public, anon, authenticated;
create trigger assign_submission_version before insert on public.project_submissions
  for each row execute function public.assign_submission_version();

create function public.review_submission(p_submission uuid,p_evaluator uuid,p_scores jsonb,
  p_total integer,p_feedback text,p_approved boolean) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare sub public.project_submissions; ev public.project_evaluations;
begin
  update public.project_submissions set status=case when p_approved then 'verified' else 'changes_requested' end,
    overall_score=p_total, ai_feedback=p_feedback where id=p_submission returning * into strict sub;
  insert into public.project_evaluations(submission_id,evaluator_id,evaluator_type,rubric_scores,total_score,feedback,approved)
    values(sub.id,p_evaluator,'instructor',p_scores,p_total,p_feedback,p_approved) returning * into ev;
  return jsonb_build_object('submission',to_jsonb(sub),'evaluation',to_jsonb(ev));
end $$;
revoke all on function public.review_submission(uuid,uuid,jsonb,integer,text,boolean) from public, anon, authenticated;
grant execute on function public.review_submission(uuid,uuid,jsonb,integer,text,boolean) to service_role;
