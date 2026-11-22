-- ============================================================================
-- WORKISM 3.0 — Neon Migration 0001: Authenticated Workspace Profile Schema
-- Target: Neon PostgreSQL 16+ (Supabase Auth remains the external IdP;
--         profiles.id stores the verified Supabase Auth user UUID.)
-- ============================================================================

create table if not exists public.schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key,
  role text not null default 'student' check (role in ('student', 'instructor', 'admin')),
  display_name text not null default '' check (char_length(display_name) <= 60),
  email text not null default '',
  career_goal text not null default '' check (char_length(career_goal) <= 40),
  interests text[] not null default '{}',
  learning_style text not null default '' check (char_length(learning_style) <= 32),
  learning_pace text not null default '' check (char_length(learning_pace) <= 32),
  preferred_language text not null default 'en' check (char_length(preferred_language) between 2 and 8),
  preferred_code_language text not null default '' check (char_length(preferred_code_language) <= 32),
  github_username text not null default '' check (github_username = '' or github_username ~ '^[A-Za-z0-9-]{1,39}$'),
  portfolio_slug text unique check (portfolio_slug is null or portfolio_slug ~ '^[a-z0-9][a-z0-9-]{2,38}[a-z0-9]$'),
  portfolio_public boolean not null default false,
  show_scores_public boolean not null default false,
  in_app_notices boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_profiles_updated_at on public.profiles;
create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();
