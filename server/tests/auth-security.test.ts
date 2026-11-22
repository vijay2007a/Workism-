import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.ts';
import { readEnv } from '../env.ts';
import { createMemoryRuntime } from '../memory-runtime.ts';
import { isSafeGithubRepoUrl, isSafeRedirectUrl } from '../security.ts';
import { sanitizeFilename, validateUploadBytes, validateUploadMetadata } from '../uploads.ts';

const TEST_ENV = readEnv({
  CERTIFICATE_SIGNING_SECRET: 'test-only-hmac-signing-secret-at-least-32-chars!',
  ALLOWED_ORIGINS: 'https://workism.app,http://localhost:5173',
  AI_DAILY_QUOTA: '3',
});

async function call(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; origin?: string; ip?: string } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (opts.origin) headers.Origin = opts.origin;
  if (opts.ip) headers['x-forwarded-for'] = opts.ip;
  const res = await app.fetch(
    new Request(`https://workism.app${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const json = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, json };
}

test('registration rejects role escalation attempts and defaults new accounts to student', async () => {
  const mem = createMemoryRuntime();
  const app = createApp(mem.runtime, TEST_ENV);

  // Attempting to pass role: admin must be rejected by strict schema
  const bad = await call(app, 'POST', '/api/auth/register', {
    body: { name: 'Mallory', email: 'mallory@example.com', password: 'Password1', role: 'admin' },
  });
  assert.equal(bad.status, 400);

  const ok = await call(app, 'POST', '/api/auth/register', {
    body: { name: 'Asha', email: 'asha@example.com', password: 'Password1' },
  });
  assert.equal(ok.status, 201);
  assert.equal(ok.json.role, 'student');

  // Attempting to self-promote via PATCH /api/profile must be rejected
  const escalate = await call(app, 'PATCH', '/api/profile', {
    token: ok.json.accessToken,
    body: { role: 'admin' },
  });
  assert.equal(escalate.status, 400);
});

test('negative authorization: Student A cannot access Student B attempts, instructor routes, or admin routes', async () => {
  const mem = createMemoryRuntime();
  const studentA = mem.seedUser({ email: 'a@example.com', password: 'Password1', displayName: 'Student A', role: 'student' });
  const studentB = mem.seedUser({ email: 'b@example.com', password: 'Password1', displayName: 'Student B', role: 'student' });
  const instructorScoped = mem.seedUser({
    email: 'inst@example.com',
    password: 'Password1',
    displayName: 'Instructor',
    role: 'instructor',
    assignedProjects: ['accessible-portfolio'],
  });
  const app = createApp(mem.runtime, TEST_ENV);

  // Student A starts an assessment attempt
  const start = await call(app, 'POST', '/api/assessments/js/attempts', { token: studentA.token, body: {} });
  assert.equal(start.status, 201);
  // Answer key must NOT be returned in questions
  for (const q of start.json.questions) {
    assert.equal('correctIndex' in q, false);
    assert.equal('answer' in q, false);
  }

  // Student B cannot submit Student A's attempt
  const hijack = await call(app, 'POST', `/api/assessments/attempts/${start.json.attempt.id}/submit`, {
    token: studentB.token,
    body: { answers: [1, 1, 1, 1, 1] },
  });
  assert.equal(hijack.status, 404);

  // Student A cannot access instructor or admin endpoints
  assert.equal((await call(app, 'GET', '/api/instructor/submissions', { token: studentA.token })).status, 403);
  assert.equal((await call(app, 'GET', '/api/admin/users', { token: studentA.token })).status, 403);
  assert.equal((await call(app, 'GET', '/api/admin/audit-logs', { token: studentA.token })).status, 403);

  // Public unauthenticated caller cannot access protected endpoints or AI tutor
  assert.equal((await call(app, 'GET', '/api/me/workspace')).status, 401);
  assert.equal((await call(app, 'POST', '/api/ai/tutor', { body: { messages: [{ role: 'user', text: 'hi' }] } })).status, 401);

  // Student A submits an unassigned project ('inventory-api')
  const sub = await call(app, 'POST', '/api/projects/inventory-api/submissions', {
    token: studentA.token,
    body: { repo: 'https://github.com/studenta/inventory-api', note: 'Ready' },
  });
  assert.equal(sub.status, 201);
  assert.notEqual(sub.json.submission.status, 'verified'); // Student cannot self-verify

  // Scoped instructor (assigned only to 'accessible-portfolio') cannot review 'inventory-api'
  const outOfScope = await call(app, 'POST', `/api/instructor/submissions/${sub.json.submission.id}/review`, {
    token: instructorScoped.token,
    body: { rubricScores: [{ criterion: 'Tests', score: 30, maxPoints: 30, comment: 'ok' }], feedback: 'Out of scope attempt', approved: true },
  });
  assert.equal(outOfScope.status, 404);
});

test('strict CORS, safe redirects, SSRF-safe GitHub URLs, and security headers', async () => {
  const mem = createMemoryRuntime();
  const app = createApp(mem.runtime, TEST_ENV);

  const goodCors = await call(app, 'GET', '/api/health', { origin: 'https://workism.app' });
  assert.equal(goodCors.headers.get('access-control-allow-origin'), 'https://workism.app');
  assert.equal(goodCors.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(goodCors.headers.get('x-frame-options'), 'DENY');

  const evilCors = await call(app, 'GET', '/api/health', { origin: 'https://evil.example' });
  assert.equal(evilCors.headers.get('access-control-allow-origin'), null);

  assert.equal(isSafeRedirectUrl('/dashboard', TEST_ENV.allowedOrigins), true);
  assert.equal(isSafeRedirectUrl('https://workism.app/auth/callback', TEST_ENV.allowedOrigins), true);
  assert.equal(isSafeRedirectUrl('//evil.com/phish', TEST_ENV.allowedOrigins), false);
  assert.equal(isSafeRedirectUrl('https://evil.com/phish', TEST_ENV.allowedOrigins), false);

  assert.equal(isSafeGithubRepoUrl('https://github.com/vijay2007a/Workism-'), true);
  assert.equal(isSafeGithubRepoUrl('http://127.0.0.1/admin'), false);
  assert.equal(isSafeGithubRepoUrl('https://github.com.evil.com/a/b'), false);
  assert.equal(isSafeGithubRepoUrl('https://user:pass@github.com/a/b'), false);
});

test('rate limiting blocks brute-force logins and enforces daily AI quota', async () => {
  const mem = createMemoryRuntime({ aiDailyQuota: 2 });
  const student = mem.seedUser({ email: 'rate@example.com', password: 'Password1', displayName: 'Rate', role: 'student' });
  const app = createApp(mem.runtime, TEST_ENV);

  // Exceed 15 login attempts per IP
  let blockedStatus = 0;
  for (let i = 0; i < 16; i++) {
    const r = await call(app, 'POST', '/api/auth/login', {
      ip: '203.0.113.10',
      body: { email: 'rate@example.com', password: 'WrongPassword1' },
    });
    if (r.status === 429) blockedStatus = 429;
  }
  assert.equal(blockedStatus, 429);

  // AI quota blocks on 3rd request when daily quota = 2
  const r1 = await call(app, 'POST', '/api/ai/tutor', { token: student.token, body: { messages: [{ role: 'user', text: 'Q1' }] } });
  const r2 = await call(app, 'POST', '/api/ai/tutor', { token: student.token, body: { messages: [{ role: 'user', text: 'Q2' }] } });
  const r3 = await call(app, 'POST', '/api/ai/tutor', { token: student.token, body: { messages: [{ role: 'user', text: 'Q3' }] } });
  assert.equal(r1.status, 200);
  assert.equal(r2.status, 200);
  assert.equal(r3.status, 429);
  assert.equal(r3.json.error.code, 'ai_quota_exceeded');
});

test('file upload security rejects path traversal, executable files, forged magic bytes, and Zip Slip', () => {
  assert.equal(sanitizeFilename('../../notes.pdf'), 'notes.pdf');
  assert.throws(() => sanitizeFilename('payload.exe'), /Executable/);
  assert.throws(() => sanitizeFilename('xss.html'), /Executable/);
  assert.throws(() => validateUploadMetadata('report.pdf', 'image/png', 100), /extension/);
  assert.throws(() => validateUploadMetadata('huge.pdf', 'application/pdf', 20 * 1024 * 1024), /size/);

  // Forged PDF (plain text masquerading as PDF)
  assert.throws(() => validateUploadBytes(new TextEncoder().encode('not really a pdf'), 'application/pdf'), /contents/);

  // Valid PDF magic bytes pass
  assert.doesNotThrow(() => validateUploadBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]), 'application/pdf'));

  // Craft a minimal ZIP local header containing a Zip Slip entry "../evil.txt"
  const nameBytes = new TextEncoder().encode('../evil.txt');
  const zip = new Uint8Array(30 + nameBytes.length);
  const dv = new DataView(zip.buffer);
  dv.setUint32(0, 0x04034b50, true);
  dv.setUint16(26, nameBytes.length, true);
  zip.set(nameBytes, 30);
  assert.throws(() => validateUploadBytes(zip, 'application/zip'), /path traversal/);
});

test('server rejects expired assessment attempts and path-traversal storage paths', async () => {
  const mem = createMemoryRuntime();
  const student = mem.seedUser({ email: 'exp@example.com', password: 'Password1', displayName: 'Exp', role: 'student' });
  const app = createApp(mem.runtime, TEST_ENV);

  // Create an already-expired attempt directly via runtime
  const expired = await mem.runtime.db.createAssessmentAttempt(student.id, 'assess-js', 'js', -60, 'en');
  const submitExpired = await call(app, 'POST', `/api/assessments/attempts/${expired.id}/submit`, {
    token: student.token,
    body: { answers: [1, 1, 1, 1, 1] },
  });
  assert.equal(submitExpired.status, 410);
  assert.equal(submitExpired.json.error.code, 'attempt_expired');

  // Path traversal in storagePath is rejected even under the user's own prefix
  const badPath = await call(app, 'POST', '/api/projects/accessible-portfolio/submissions', {
    token: student.token,
    body: { storagePath: `${student.id}/../other-user/secret.pdf`, note: 'Attempt traversal' },
  });
  assert.equal(badPath.status, 403);
  assert.equal(badPath.json.error.code, 'forbidden_storage_path');
});
