import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIGRATIONS = join(import.meta.dirname, '..', '..', 'supabase', 'migrations');
const coreSql = readFileSync(join(MIGRATIONS, '0001_core_schema.sql'), 'utf8');
const rlsSql = readFileSync(join(MIGRATIONS, '0002_rls_and_storage.sql'), 'utf8');
const seedSql = readFileSync(join(MIGRATIONS, '0003_seed_catalog.sql'), 'utf8');

test('every public table created in 0001 has Row Level Security enabled in 0002', () => {
  const tables = [...coreSql.matchAll(/create table if not exists public\.([a-z0-9_]+)/gi)].map((m) => m[1]);
  assert.ok(tables.length >= 30, `expected >= 30 tables, found ${tables.length}`);
  for (const table of tables) {
    assert.match(
      rlsSql,
      new RegExp(`alter table public\\.${table} enable row level security;`, 'i'),
      `Missing RLS enablement for table public.${table}`,
    );
  }
});

test('new auth users always default to student and role self-escalation is blocked by trigger and RLS', () => {
  assert.match(coreSql, /values \(new\.id,\s*'student'/i);
  assert.match(rlsSql, /create or replace function public\.prevent_role_self_escalation/i);
  assert.match(rlsSql, /raise exception 'Role escalation is forbidden'/i);
  assert.match(rlsSql, /create trigger trg_prevent_role_escalation/i);
  assert.match(rlsSql, /with check \(auth\.uid\(\) = id and role = \(select p\.role from public\.profiles p where p\.id = auth\.uid\(\)\)\)/i);
});

test('answer keys and hidden coding tests are isolated and restricted to admins only', () => {
  assert.match(coreSql, /create table if not exists public\.assessment_question_keys/i);
  assert.match(coreSql, /create table if not exists public\.coding_challenge_hidden_tests/i);
  assert.match(rlsSql, /on public\.assessment_question_keys for all to authenticated\s+using \(public\.is_admin\(\)\)/i);
  assert.match(rlsSql, /on public\.coding_challenge_hidden_tests for all to authenticated\s+using \(public\.is_admin\(\)\)/i);
});

test('students cannot directly insert or approve issued certificates or official skill scores', () => {
  assert.doesNotMatch(rlsSql, /on public\.issued_certificates for (?:insert|update|all) to authenticated/i);
  assert.doesNotMatch(rlsSql, /on public\.user_skill_scores for (?:insert|update|all) to authenticated/i);
  assert.match(rlsSql, /on public\.project_submissions for insert to authenticated\s+with check \(user_id = auth\.uid\(\) and status = 'submitted' and overall_score is null\)/i);
});

test('public verification RPC exposes only approved metadata without private student info', () => {
  const fnMatch = rlsSql.match(/create or replace function public\.verify_certificate_public[\s\S]*?\$\$;/i);
  assert.ok(fnMatch, 'verify_certificate_public RPC missing');
  const body = fnMatch[0];
  assert.doesNotMatch(body, /\bemail\b/i);
  assert.doesNotMatch(body, /\buser_id\b/i);
  assert.match(body, /\bsignature_hex\b/i);
});

test('project-submissions storage bucket is private, size-capped at 10MB, and path-scoped to auth.uid()', () => {
  assert.match(rlsSql, /values \(\s*'project-submissions',\s*'project-submissions',\s*false,\s*10485760/i);
  assert.match(rlsSql, /\(storage\.foldername\(name\)\)\[1\] = auth\.uid\(\)::text/i);
});

test('catalog seed covers 18 spoken languages, 22 programming languages, 5 skills, 5 courses, 4 projects, 4 certificates', () => {
  const spoken = [...seedSql.matchAll(/\('([a-z]{2})',\s*'[^']+',\s*'[^']+',\s*(?:true|false),\s*'(?:high|good|beta)',\s*\d+\)/g)];
  assert.equal(spoken.length, 18);
  assert.ok(seedSql.includes("('pt', 'Português', 'Portuguese'"));
  assert.ok(seedSql.includes("('ar', 'العربية', 'Arabic', true"));

  const prog = [...seedSql.matchAll(/\('[a-z]+',\s*'[^']+',\s*'[^']+',\s*'#[0-9a-f]+',\s*array\[/g)];
  assert.equal(prog.length, 22);

  for (const id of ['javascript-foundations', 'python-problem-solving', 'machine-learning-essentials', 'databases-with-sql', 'cloud-basics']) {
    assert.ok(seedSql.includes(`'${id}'`), `missing course ${id}`);
  }
  for (const id of ['accessible-portfolio', 'ticket-classifier', 'inventory-api', 'static-site-deploy']) {
    assert.ok(seedSql.includes(`'${id}'`), `missing project ${id}`);
  }
  for (const id of ['javascript-practitioner', 'python-practitioner', 'sql-practitioner', 'cloud-practitioner']) {
    assert.ok(seedSql.includes(`'${id}'`), `missing certificate template ${id}`);
  }
});
