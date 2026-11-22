-- Run as the migration owner on a WORKISM database. All fixtures roll back.
begin;
do $$
declare
  student_a uuid := gen_random_uuid();
  student_b uuid := gen_random_uuid();
  teacher uuid := gen_random_uuid();
  administrator uuid := gen_random_uuid();
  attempt uuid;
  submission uuid;
  item public.learning_roadmaps;
  allowed boolean;
begin
  if exists(select from pg_class where relnamespace='public'::regnamespace and relkind='r' and not relrowsecurity) then
    raise exception 'A public table lacks RLS';
  end if;
  insert into auth.users(id,raw_user_meta_data) values
    (student_a,'{"role":"admin"}'),(student_b,'{}'),(teacher,'{}'),(administrator,'{}');
  if (select role from public.profiles where id=student_a) <> 'student' then raise exception 'Signup role'; end if;
  update public.profiles set role='instructor' where id=teacher;
  update public.profiles set role='admin' where id=administrator;
  insert into public.instructor_assignments(instructor_id,scope_type,scope_id) values(teacher,'project','accessible-portfolio');
  set local role service_role;
  insert into public.assessment_attempts(user_id,assessment_id,skill_id,expires_at)
    select student_a,id,skill_id,now()+interval '5 minutes' from public.skill_assessments where skill_id='js'
    returning id into strict attempt;
  update public.assessment_attempts set status='submitted',score_percent=80 where id=attempt;
  if (select score from public.user_skill_scores where user_id=student_a and skill_id='js') is distinct from 80
    or (select count(*) from public.skill_history where attempt_id=attempt) <> 1 then raise exception 'Grade persistence'; end if;
  item := public.save_learning_roadmap(student_a,'Web development','en','Integration check',
    '[{"courseId":"javascript-foundations","skillId":"js","title":"JS","objective":"Practice","lessonIds":["js-1"]}]');
  if (select count(*) from public.roadmap_milestones where roadmap_id=item.id) <> 1 then raise exception 'Roadmap persistence'; end if;
  insert into public.project_submissions(project_id,user_id,repo_url) values('accessible-portfolio',student_a,'https://github.com/example/fixture') returning id into submission;
  insert into public.project_submissions(project_id,user_id,repo_url) values('inventory-api',student_b,'https://github.com/example/fixture');
  perform public.review_submission(submission,teacher,'[]',80,'Test review',true);
  if not exists(select from public.project_evaluations where submission_id=submission and approved) then raise exception 'Review persistence'; end if;
  select r.allowed into strict allowed from public.check_rate_limit('integration-'||student_a,1,60) r;
  if not allowed then raise exception 'First reservation'; end if;
  select r.allowed into strict allowed from public.check_rate_limit('integration-'||student_a,1,60) r;
  if allowed then raise exception 'Second reservation'; end if;
  reset role;
  set local role authenticated;
  perform set_config('request.jwt.claim.sub',student_a::text,true);
  update public.profiles set display_name='Test student' where id=student_a;
  if (select count(*) from public.profiles where id in(student_a,student_b)) <> 1 or
     not exists(select from public.profiles where id=student_a and display_name='Test student') then raise exception 'Profile access'; end if;
  if has_column_privilege(current_user,'public.profiles','role','update') or
    has_table_privilege(current_user,'public.user_skill_scores','update') or
    has_table_privilege(current_user,'public.assessment_question_keys','select') or
    has_table_privilege(current_user,'public.issued_certificates','insert') or
    has_table_privilege(current_user,'public.project_submissions','insert') or
    has_table_privilege(current_user,'public.lesson_progress','insert') or
    has_table_privilege(current_user,'public.profiles','truncate') or
    has_function_privilege(current_user,'public.check_rate_limit(text,int,int)','execute') then raise exception 'Unexpected student privileges'; end if;
  perform set_config('request.jwt.claim.sub',student_b::text,true);
  if exists(select from public.user_skill_scores where user_id=student_a) or
     exists(select from public.project_submissions where id=submission) then raise exception 'Student isolation'; end if;
  perform set_config('request.jwt.claim.sub',teacher::text,true);
  if not exists(select from public.project_submissions where id=submission) or
     exists(select from public.project_submissions where user_id=student_b) then raise exception 'Instructor scope'; end if;
  perform set_config('request.jwt.claim.sub',administrator::text,true);
  if not public.is_admin() or (select count(*) from public.project_submissions where user_id in(student_a,student_b)) <> 2 then raise exception 'Administrator scope'; end if;
  reset role;
  if has_table_privilege('anon','public.project_submissions','select') or
     has_function_privilege('anon','public.verify_certificate_public(text)','execute') or
     not exists(select from storage.buckets where id='project-submissions' and not public and file_size_limit=10485760) then
    raise exception 'Anonymous or storage boundary';
  end if;
end
$$;
select 'WORKISM integration assertions passed' as result;
rollback;
