import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { applyNeonMigrations, splitSqlStatements, type MigrationClient } from '../../scripts/migrate-neon.ts';
import { createApp } from '../app.ts';
import { readEnv } from '../env.ts';
import { createMemoryRuntime } from '../memory-runtime.ts';
import { createNeonRuntime, type NeonQueryExecutor, type VerifiedSupabaseIdentity } from '../neon-runtime.ts';
import { ApiError } from '../security.ts';

const ROOT = join(import.meta.dirname, '..', '..');

const USER_A: VerifiedSupabaseIdentity = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user-a@example.test',
  displayName: 'User A',
};

const USER_B: VerifiedSupabaseIdentity = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'user-b@example.test',
  displayName: 'User B',
};

const PREVIEW_ENV = readEnv({
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
  DATABASE_URL: 'postgresql://neondb_owner:replace_me@ep-dev.example.neon.tech/neondb?sslmode=require',
  ALLOWED_ORIGINS: 'https://workism-preview.vercel.app',
});

const HYBRID_ENV = readEnv({
  VITE_SUPABASE_URL: 'https://example.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
  DATABASE_URL: 'postgresql://neondb_owner:replace_me@ep-dev.example.neon.tech/neondb?sslmode=require',
  CERTIFICATE_SIGNING_SECRET: 'workism-test-hmac-secret-key-minimum-32-chars-ok',
  ALLOWED_ORIGINS: 'https://workism-preview.vercel.app',
  AI_DAILY_QUOTA: '10',
});

/** Minimal in-memory Postgres simulator for public.profiles that records every parameterized SQL call. */
function createFakeNeonDb() {
  const rows = new Map<string, Record<string, unknown>>();
  const queries: { text: string; params: unknown[] }[] = [];

  const query: NeonQueryExecutor = async (text, params = []) => {
    queries.push({ text, params: [...params] });
    const norm = text.replace(/\s+/g, ' ').trim().toLowerCase();

    if (norm.startsWith('insert into public.profiles')) {
      const [id, displayName, email] = params as [string, string, string];
      if (!rows.has(id)) {
        rows.set(id, {
          id,
          role: 'student',
          display_name: displayName,
          email,
          career_goal: '',
          interests: [],
          learning_style: '',
          learning_pace: '',
          preferred_language: 'en',
          preferred_code_language: '',
          github_username: '',
          portfolio_slug: null,
          portfolio_public: false,
          show_scores_public: false,
          in_app_notices: true,
        });
      }
      return [];
    }

    if (norm.startsWith('select ') && norm.includes('from public.profiles where id = $1')) {
      const id = String(params[0]);
      const row = rows.get(id);
      return row ? [{ ...row, interests: [...(row.interests as string[])] }] : [];
    }

    if (norm.startsWith('select ') && norm.includes('from public.profiles order by')) {
      return [...rows.values()].map((row) => ({ ...row, interests: [...(row.interests as string[])] }));
    }

    if (norm.startsWith('update public.profiles set ')) {
      const id = String(params[0]);
      const row = rows.get(id);
      if (!row) return [];
      const setMatch = /update public\.profiles set (.+) where id = \$1 returning /i.exec(norm);
      assert.ok(setMatch, `Unexpected UPDATE shape: ${text}`);
      const assignments = setMatch[1].split(',').map((s) => s.trim());
      const updated = { ...row };
      for (const assign of assignments) {
        const m = /^([a-z_]+) = \$(\d+)$/.exec(assign);
        assert.ok(m, `Non-parameterized assignment: ${assign}`);
        const col = m[1];
        const idx = Number(m[2]) - 1;
        updated[col] = params[idx];
      }
      rows.set(id, updated);
      return [{ ...updated, interests: [...(updated.interests as string[])] }];
    }

    throw new Error(`Unexpected SQL in test fake: ${text}`);
  };

  return { rows, queries, query };
}

async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await app.fetch(
    new Request(`https://workism-preview.vercel.app${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const ct = res.headers.get('content-type') ?? '';
  const body = ct.includes('application/json') ? await res.json().catch(() => null) : new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, json: body };
}

function makeNeonOnlyApp() {
  const db = createFakeNeonDb();
  const tokens = new Map<string, VerifiedSupabaseIdentity>([
    ['tok-a', USER_A],
    ['tok-b', USER_B],
  ]);
  const runtime = createNeonRuntime(PREVIEW_ENV, {
    query: db.query,
    verifySupabaseUser: async (token) => tokens.get(token) ?? null,
  });
  const app = createApp(runtime, PREVIEW_ENV);
  return { db, runtime, app };
}

test('default createApp entry point selects Neon runtime when DATABASE_URL is set and rejects anonymous calls with 401 no-store', async () => {
  const defaultApp = createApp(undefined, PREVIEW_ENV);

  const health = await call(defaultApp, 'GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.json.capabilities.supabaseAuthConfigured, true);
  assert.equal(health.json.capabilities.neonDatabaseConfigured, true);
  assert.equal(health.json.capabilities.supabaseConfigured, false);

  for (const [method, path, body] of [
    ['GET', '/api/me/workspace', undefined],
    ['GET', '/api/profile', undefined],
    ['PATCH', '/api/profile', { displayName: 'Anon' }],
    ['POST', '/api/assessments/js/attempts', {}],
    ['POST', '/api/ai/tutor', { messages: [{ role: 'user', text: 'hi' }] }],
  ] as const) {
    const res = await call(defaultApp, method, path, body ? { body } : {});
    assert.equal(res.status, 401, `${method} ${path} must return 401 without Bearer token`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  }

  const { app } = makeNeonOnlyApp();
  const badToken = await call(app, 'GET', '/api/me/workspace', { token: 'invalid-jwt' });
  assert.equal(badToken.status, 401);
});

test('configuring DATABASE_URL routes migrated profile operations to Neon while preserving all unmigrated workflows without 501', async () => {
  const db = createFakeNeonDb();
  const mem = createMemoryRuntime({
    aiResponder: ({ endpoint, languageCode }) => {
      if (endpoint === 'project_feedback') {
        return '```json\n{"observations":["Keyboard notes included."],"nextSteps":["Add contrast audit."]}\n```';
      }
      if (endpoint === 'ai_roadmap') {
        return JSON.stringify({
          summary: `Hybrid roadmap (${languageCode})`,
          milestones: [{ courseId: 'javascript-foundations', skillId: 'js', title: 'JS', objective: 'Finish lessons', lessonIds: ['js-2', 'js-3', 'js-4', 'js-5'] }],
        });
      }
      return `[${languageCode}] Use \`const\` for immutable bindings.`;
    },
  });

  const learner = mem.seedUser({ email: 'alice@example.test', password: 'Password1', displayName: 'Alice', role: 'student' });
  const instructor = mem.seedUser({ email: 'inst@example.test', password: 'Password1', displayName: 'Instructor', role: 'instructor', assignedProjects: ['accessible-portfolio'] });
  const admin = mem.seedUser({ email: 'admin@example.test', password: 'Password1', displayName: 'Admin', role: 'admin' });

  // Seed staff roles in Neon so verifyToken resolves authoritative staff roles cleanly
  db.rows.set(instructor.id, { id: instructor.id, role: 'instructor', display_name: 'Instructor', email: 'inst@example.test', career_goal: '', interests: [], learning_style: '', learning_pace: '', preferred_language: 'en', preferred_code_language: '', github_username: '', portfolio_slug: null, portfolio_public: false, show_scores_public: false, in_app_notices: true });
  db.rows.set(admin.id, { id: admin.id, role: 'admin', display_name: 'Admin', email: 'admin@example.test', career_goal: '', interests: [], learning_style: '', learning_pace: '', preferred_language: 'en', preferred_code_language: '', github_username: '', portfolio_slug: null, portfolio_public: false, show_scores_public: false, in_app_notices: true });

  const hybridRuntime = createNeonRuntime(HYBRID_ENV, { query: db.query, fallback: mem.runtime });
  const app = createApp(hybridRuntime, HYBRID_ENV);

  // 1. Migrated write -> persisted in Neon
  const patched = await call(app, 'PATCH', '/api/profile', {
    token: learner.token,
    body: { displayName: 'Alice Neon', careerGoal: 'fullstack', interests: ['js', 'db'], learningStyle: 'hands-on', preferredLanguage: 'ta', inAppNotices: true, showScoresPublic: true },
  });
  assert.equal(patched.status, 200);
  assert.equal(db.rows.get(learner.id)?.display_name, 'Alice Neon');
  assert.equal(db.rows.get(learner.id)?.preferred_language, 'ta');

  // 2. Unmigrated assessment workflow -> works (NOT 501!) and reflects inside GET /api/me/workspace
  const started = await call(app, 'POST', '/api/assessments/js/attempts', { token: learner.token, body: { languageCode: 'ta' } });
  assert.equal(started.status, 201);
  const graded = await call(app, 'POST', `/api/assessments/attempts/${started.json.attempt.id}/submit`, {
    token: learner.token,
    body: { answers: [1, 1, 1, 1, 1], languageCode: 'ta' },
  });
  assert.equal(graded.status, 200);
  assert.equal(graded.json.attempt.scorePercent, 100);

  // 3. Unmigrated course enrollment, lessons, roadmap, tutor history, code submission
  assert.equal((await call(app, 'POST', '/api/courses/javascript-foundations/enroll', { token: learner.token })).status, 200);
  for (const lessonId of ['js-1', 'js-2', 'js-3', 'js-4', 'js-5']) {
    assert.equal((await call(app, 'POST', `/api/lessons/${lessonId}/complete`, { token: learner.token, body: { courseId: 'javascript-foundations', answerIndex: 1 } })).status, 200);
  }
  const roadmap = await call(app, 'POST', '/api/ai/roadmap', { token: learner.token, body: { goal: 'fullstack', languageCode: 'ta' } });
  assert.equal(roadmap.status, 201);

  const tutor = await call(app, 'POST', '/api/ai/tutor', { token: learner.token, body: { messages: [{ role: 'user', text: 'Explain const' }], languageCode: 'ta' } });
  assert.equal(tutor.status, 200);
  const hist = await call(app, 'GET', '/api/ai/tutor/history', { token: learner.token });
  assert.equal(hist.status, 200);
  assert.equal(hist.json.messages.length, 2);
  assert.equal((await call(app, 'DELETE', '/api/ai/tutor/history', { token: learner.token })).status, 200);

  const codeExec = await call(app, 'POST', '/api/code/execute', { token: learner.token, body: { challengeId: 'sum-even', languageId: 'python', code: 'def sumEven(n): return 0' } });
  assert.equal(codeExec.status, 503);
  assert.equal(codeExec.json.simulated, false);
  assert.equal((await call(app, 'POST', '/api/code/submissions', { token: learner.token, body: { challengeId: 'sum-even', languageId: 'javascript', code: 'function sumEven(){return 0}', executionMode: 'browser_js', passedCount: 4, totalCount: 4, results: [] } })).status, 201);

  // 4. Project submission (with markdown-fenced AI JSON response!) + instructor review + certificate issuance + verify + PDF + revoke by WRK code
  const sub = await call(app, 'POST', '/api/projects/accessible-portfolio/submissions', {
    token: learner.token,
    body: { repo: 'https://github.com/alice/portfolio', note: 'Keyboard tested' },
  });
  assert.equal(sub.status, 201);
  assert.ok(String(sub.json.submission.aiFeedback).includes('Keyboard notes included.'));

  const review = await call(app, 'POST', `/api/instructor/submissions/${sub.json.submission.id}/review`, {
    token: instructor.token,
    body: {
      rubricScores: [
        { criterion: 'Accessibility', score: 40, maxPoints: 40, comment: 'Great' },
        { criterion: 'Code clarity', score: 30, maxPoints: 30, comment: 'Clean' },
        { criterion: 'Performance', score: 30, maxPoints: 30, comment: 'Fast' },
      ],
      feedback: 'Approved for certification.',
      approved: true,
    },
  });
  assert.equal(review.status, 200);

  const issued = await call(app, 'POST', '/api/certificates/javascript-practitioner/issue', { token: learner.token, body: {} });
  assert.equal(issued.status, 201);
  const code = String(issued.json.certificate.verificationCode);
  assert.equal((await call(app, 'GET', `/api/verify/${code}`)).status, 200);
  const pdf = await call(app, 'GET', `/api/certificates/${code}/pdf`);
  assert.equal(pdf.status, 200);
  assert.ok(new TextDecoder().decode(pdf.json as Uint8Array).startsWith('%PDF-1.4'));

  // Combined workspace returns Neon profile + real assessed skill + real verified project + issued cert + notifications
  const ws = await call(app, 'GET', '/api/me/workspace', { token: learner.token });
  assert.equal(ws.status, 200);
  assert.equal(ws.json.name, 'Alice Neon');
  assert.equal(ws.json.skills.find((s: { id: string }) => s.id === 'js').score, 100);
  assert.equal(ws.json.projects.find((p: { id: string }) => p.id === 'accessible-portfolio').status, 'verified');
  assert.equal(ws.json.certificates.find((c: { templateId: string }) => c.templateId === 'javascript-practitioner').status, 'verified');
  assert.ok(ws.json.notifications.length > 0);
  assert.equal((await call(app, 'POST', '/api/notifications/read', { token: learner.token })).status, 200);

  // Admin can revoke directly by verification code (WRK-...) and public verify immediately reflects revoked
  const revoked = await call(app, 'POST', `/api/admin/certificates/${code}/revoke`, {
    token: admin.token,
    body: { reason: 'Routine audit test revocation' },
  });
  assert.equal(revoked.status, 200);
  const verifyAfter = await call(app, 'GET', `/api/verify/${code}`);
  assert.equal(verifyAfter.status, 200);
  assert.equal(verifyAfter.json.status, 'revoked');
});

test('User A saves workspace profile to Neon, reloads it, and all queries remain parameterized', async () => {
  const { app, db } = makeNeonOnlyApp();

  const initial = await call(app, 'GET', '/api/me/workspace', { token: 'tok-a' });
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('cache-control'), 'no-store');
  assert.equal(initial.json.role, 'student');
  assert.equal(initial.json.profile.id, USER_A.id);
  assert.equal(initial.json.profile.displayName, 'User A');

  const injectionName = "Ada O'Brien'; DROP TABLE profiles;--";
  const saved = await call(app, 'PATCH', '/api/profile', {
    token: 'tok-a',
    body: {
      displayName: injectionName,
      careerGoal: 'backend',
      interests: ['db', 'cl'],
    },
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.profile.displayName, injectionName);

  const reloaded = await call(app, 'GET', '/api/me/workspace', { token: 'tok-a' });
  assert.equal(reloaded.status, 200);
  assert.equal(reloaded.json.name, injectionName);
  assert.equal(reloaded.json.profile.careerGoal, 'backend');
  assert.deepEqual(reloaded.json.profile.interests, ['db', 'cl']);

  for (const q of db.queries) {
    assert.equal(q.text.includes("O'Brien"), false, 'User input must never be interpolated into SQL');
    assert.equal(q.text.includes('DROP TABLE'), false, 'User input must never be interpolated into SQL');
  }
});

test('User B cannot read or modify User A workspace via session, query params, body workspaceId, or storage layer', async () => {
  const { app, db, runtime } = makeNeonOnlyApp();

  await call(app, 'PATCH', '/api/profile', {
    token: 'tok-a',
    body: { displayName: 'Alice Private', careerGoal: 'fullstack', interests: ['js'] },
  });

  const bWorkspace = await call(app, 'GET', '/api/me/workspace', { token: 'tok-b' });
  assert.equal(bWorkspace.status, 200);
  assert.equal(bWorkspace.json.profile.id, USER_B.id);
  assert.notEqual(bWorkspace.json.name, 'Alice Private');

  for (const path of [
    `/api/me/workspace?workspaceId=${USER_A.id}`,
    `/api/me/workspace?userId=${USER_A.id}`,
    `/api/me/workspace?id=${USER_A.id}`,
    `/api/profile?workspaceId=${USER_A.id}`,
    `/api/portfolio?workspaceId=${USER_A.id}`,
    `/api/skills?userId=${USER_A.id}`,
    `/api/projects?workspaceId=${USER_A.id}`,
    `/api/certificates?userId=${USER_A.id}`,
    `/api/notifications?workspaceId=${USER_A.id}`,
    `/api/learning/roadmap?userId=${USER_A.id}`,
    `/api/ai/tutor/history?workspaceId=${USER_A.id}`,
    `/api/auth/session?workspaceId=${USER_A.id}`,
  ]) {
    const res = await call(app, 'GET', path, { token: 'tok-b' });
    assert.equal(res.status, 403, `Expected 403 for GET ${path}`);
  }

  for (const [path, body] of [
    ['/api/profile', { workspaceId: USER_A.id, displayName: 'Hijacked' }],
    ['/api/profile', { userId: USER_A.id, displayName: 'Hijacked' }],
    ['/api/profile', { id: USER_A.id, displayName: 'Hijacked' }],
    [`/api/profile?workspaceId=${USER_A.id}`, { displayName: 'Hijacked' }],
    ['/api/portfolio', { workspaceId: USER_A.id, portfolioPublic: true }],
    [`/api/portfolio?workspaceId=${USER_A.id}`, { portfolioPublic: true }],
  ] as const) {
    const res = await call(app, 'PATCH', path, { token: 'tok-b', body });
    assert.equal(res.status, 403, `Expected 403 for PATCH ${path}`);
  }

  const roleEscalation = await call(app, 'PATCH', '/api/profile', { token: 'tok-b', body: { role: 'admin' } });
  assert.equal(roleEscalation.status, 400);

  const userBCaller = { id: USER_B.id, email: USER_B.email, role: 'student' as const, displayName: USER_B.displayName, token: 'tok-b' };
  await assert.rejects(
    () => runtime.db.getProfile(USER_A.id, userBCaller),
    (err: unknown) => err instanceof ApiError && err.status === 403,
  );
  await assert.rejects(
    () => runtime.db.updateProfile(USER_A.id, { displayName: 'Direct Hack' }, userBCaller),
    (err: unknown) => err instanceof ApiError && err.status === 403,
  );

  assert.equal(db.rows.get(USER_A.id)?.display_name, 'Alice Private');
  assert.equal(db.rows.get(USER_A.id)?.career_goal, 'fullstack');
});

test('public certificate verification and PDF download return 503 instead of false tampered when signing secret is unconfigured', async () => {
  const mem = createMemoryRuntime();
  const appNoSecret = createApp(mem.runtime, PREVIEW_ENV);

  const verify = await call(appNoSecret, 'GET', '/api/verify/WRK-TEST-1234-5678');
  assert.equal(verify.status, 503);
  assert.equal(verify.json.error.code, 'signing_not_configured');

  const pdf = await call(appNoSecret, 'GET', '/api/certificates/WRK-TEST-1234-5678/pdf');
  assert.equal(pdf.status, 503);
  assert.equal(pdf.json.error.code, 'signing_not_configured');
});

test('Neon migration 0001 applies idempotently and rolls back cleanly on statement failure', async () => {
  const migrationsDir = join(ROOT, 'neon', 'migrations');
  const sql = readFileSync(join(migrationsDir, '0001_workspace_schema.sql'), 'utf8');

  const stmts = splitSqlStatements(sql);
  const executableSql = stmts.join('\n');
  assert.doesNotMatch(executableSql, /\bauth\.users\b/i, 'Neon schema must not reference Supabase auth.users');
  assert.doesNotMatch(executableSql, /\bauth\.uid\s*\(/i, 'Neon schema must not depend on Supabase auth.uid()');
  assert.match(executableSql, /create table if not exists public\.profiles/i);
  assert.match(executableSql, /set search_path = ''/i);
  assert.equal(stmts.length, 5);
  assert.match(stmts[1], /\$\$/);

  const appliedVersions = new Set<string>();
  const committedObjects: string[] = [];
  const fakeClient: MigrationClient = {
    async query(text) {
      if (text.toLowerCase().startsWith('select version from public.schema_migrations')) {
        return [...appliedVersions].map((version) => ({ version }));
      }
      return [];
    },
    async transaction(statements) {
      const stagedObjects: string[] = [];
      let stagedVersion: string | null = null;
      for (const s of statements) {
        if (s.text.includes('RAISE_SIMULATED_FAILURE')) {
          throw new Error('Simulated DDL failure');
        }
        if (s.text.toLowerCase().startsWith('insert into public.schema_migrations')) {
          stagedVersion = String(s.params?.[0] ?? '');
        } else {
          stagedObjects.push(s.text);
        }
      }
      committedObjects.push(...stagedObjects);
      if (stagedVersion) appliedVersions.add(stagedVersion);
    },
  };

  // Fresh install + repeat idempotency
  const first = await applyNeonMigrations(fakeClient, migrationsDir);
  assert.deepEqual(first.applied, ['0001_workspace_schema']);
  assert.deepEqual(first.skipped, []);
  const second = await applyNeonMigrations(fakeClient, migrationsDir);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, ['0001_workspace_schema']);

  // Rollback on failure: partial migration must neither commit DDL nor record version
  const tmpDir = mkdtempSync(join(tmpdir(), 'workism-mig-'));
  try {
    writeFileSync(join(tmpDir, '0002_bad.sql'), 'create table public.temp_ok (id int);\nRAISE_SIMULATED_FAILURE;\n');
    const beforeCount = committedObjects.length;
    await assert.rejects(() => applyNeonMigrations(fakeClient, tmpDir), /Simulated DDL failure/);
    assert.equal(committedObjects.length, beforeCount, 'Failed transaction must roll back earlier statements');
    assert.equal(appliedVersions.has('0002_bad'), false, 'Failed migration must not be recorded in schema_migrations');
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
