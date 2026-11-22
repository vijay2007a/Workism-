import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../app.ts';
import { readEnv } from '../env.ts';
import { createMemoryRuntime } from '../memory-runtime.ts';

const TEST_ENV = readEnv({
  CERTIFICATE_SIGNING_SECRET: 'workism-test-hmac-secret-key-minimum-32-chars-ok',
  ALLOWED_ORIGINS: 'https://workism.app,http://localhost:5173',
  AI_DAILY_QUOTA: '40',
});

async function apiCall(
  app: ReturnType<typeof createApp>,
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
) {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await app.fetch(
    new Request(`https://workism.app${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    }),
  );
  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : new Uint8Array(await res.arrayBuffer());
  return { status: res.status, headers: res.headers, body };
}

test('full 14-step WORKISM student lifecycle: register -> assess -> roadmap -> lessons -> project -> review -> signed certificate -> verify -> revoke -> portfolio', async () => {
  const mem = createMemoryRuntime({
    aiResponder: ({ endpoint, languageCode }) => {
      if (endpoint === 'ai_roadmap') {
        return JSON.stringify({
          summary: `Roadmap in ${languageCode}`,
          milestones: [
            {
              courseId: 'javascript-foundations',
              skillId: 'js',
              title: 'JavaScript Foundations',
              objective: 'Finish remaining lessons',
              // Deliberately include already completed lesson 'js-1' to verify sanitizer strips it
              lessonIds: ['js-1', 'js-2', 'js-3', 'js-4', 'js-5'],
            },
          ],
        });
      }
      return `[${languageCode}] Helpful explanation preserving \`const x = 1;\``;
    },
  });

  const instructor = mem.seedUser({
    email: 'instructor@workism.edu',
    password: 'Password1',
    displayName: 'Prof. Kumar',
    role: 'instructor',
    assignedProjects: ['accessible-portfolio'],
  });
  const admin = mem.seedUser({
    email: 'admin@workism.edu',
    password: 'Password1',
    displayName: 'Admin',
    role: 'admin',
  });
  const app = createApp(mem.runtime, TEST_ENV);

  // 1-3. Register & log in
  const reg = await apiCall(app, 'POST', '/api/auth/register', {
    body: { name: 'Priya Nair', email: 'priya@example.com', password: 'Password1' },
  });
  assert.equal(reg.status, 201);
  const login = await apiCall(app, 'POST', '/api/auth/login', {
    body: { email: 'priya@example.com', password: 'Password1' },
  });
  assert.equal(login.status, 200);
  const token = login.body.accessToken as string;

  // 4-5. Update profile, learning goal, and preferred language (Tamil)
  const prof = await apiCall(app, 'PATCH', '/api/profile', {
    token,
    body: {
      careerGoal: 'fullstack',
      interests: ['js', 'py'],
      preferredLanguage: 'ta',
      portfolioSlug: 'priya-nair',
      portfolioPublic: false,
      showScoresPublic: false,
    },
  });
  assert.equal(prof.status, 200);
  assert.equal(prof.body.profile.preferredLanguage, 'ta');

  // 6-7. Take JavaScript skill assessment and verify official server grading
  const start = await apiCall(app, 'POST', '/api/assessments/js/attempts', { token, body: { languageCode: 'ta' } });
  assert.equal(start.status, 201);
  assert.equal(start.body.questions.length, 5);
  // All 5 JS questions in seed have correctIndex = 1
  const graded = await apiCall(app, 'POST', `/api/assessments/attempts/${start.body.attempt.id}/submit`, {
    token,
    body: { answers: [1, 1, 1, 1, 0], languageCode: 'ta' }, // 4/5 = 80%
  });
  assert.equal(graded.status, 200);
  assert.equal(graded.body.attempt.scorePercent, 80);
  assert.equal(graded.body.passed, true);
  assert.ok(String(graded.body.attempt.aiExplanation).includes('[ta]'));

  // Double-submission must be rejected
  const dup = await apiCall(app, 'POST', `/api/assessments/attempts/${start.body.attempt.id}/submit`, {
    token,
    body: { answers: [1, 1, 1, 1, 1] },
  });
  assert.equal(dup.status, 409);

  // 8-9. Complete lesson js-1, verify sequential lock on js-3, generate AI roadmap skipping js-1, then complete remaining lessons
  const locked = await apiCall(app, 'POST', '/api/lessons/js-3/complete', {
    token,
    body: { courseId: 'javascript-foundations', checkPassed: true },
  });
  assert.equal(locked.status, 409);

  const done1 = await apiCall(app, 'POST', '/api/lessons/js-1/complete', {
    token,
    body: { courseId: 'javascript-foundations', checkPassed: true },
  });
  assert.equal(done1.status, 200);

  const roadmap = await apiCall(app, 'POST', '/api/ai/roadmap', { token, body: { languageCode: 'ta' } });
  assert.equal(roadmap.status, 201);
  assert.equal(roadmap.body.generatedBy, 'gemini');
  // Completed lesson js-1 MUST NOT be regenerated in the roadmap
  assert.equal(roadmap.body.roadmap.milestones[0].lessonIds.includes('js-1'), false);
  assert.deepEqual(roadmap.body.roadmap.milestones[0].lessonIds, ['js-2', 'js-3', 'js-4', 'js-5']);

  for (const lid of ['js-2', 'js-3', 'js-4', 'js-5']) {
    const r = await apiCall(app, 'POST', `/api/lessons/${lid}/complete`, {
      token,
      body: { courseId: 'javascript-foundations', checkPassed: true },
    });
    assert.equal(r.status, 200);
  }

  // Multilingual AI tutor check (Arabic RTL + Tamil)
  const tutorAr = await apiCall(app, 'POST', '/api/ai/tutor', {
    token,
    body: { languageCode: 'ar', messages: [{ role: 'user', text: 'Explain closures' }] },
  });
  assert.equal(tutorAr.status, 200);
  assert.ok(String(tutorAr.body.text).includes('[ar]'));

  // Unsupported remote code execution MUST return explicit unavailable state (never simulated pass)
  const execPy = await apiCall(app, 'POST', '/api/code/execute', {
    token,
    body: { challengeId: 'sum-even', languageId: 'python', code: 'def sum_even(x): return 0' },
  });
  assert.equal(execPy.status, 503);
  assert.equal(execPy.body.status, 'unavailable');
  assert.equal(execPy.body.simulated, false);

  // 10. Certificate issuance BEFORE project verification MUST fail with 403
  const earlyIssue = await apiCall(app, 'POST', '/api/certificates/javascript-practitioner/issue', { token, body: {} });
  assert.equal(earlyIssue.status, 403);
  assert.equal(earlyIssue.body.error.code, 'not_eligible');

  // 11. Submit project with GitHub URL + valid PDF bytes -> instructor rubric review & approve
  const validPdfB64 = Buffer.from('%PDF-1.4\n%WORKISM submission').toString('base64');
  const projSub = await apiCall(app, 'POST', '/api/projects/accessible-portfolio/submissions', {
    token,
    body: {
      repo: 'https://github.com/priya/accessible-portfolio',
      fileName: 'report.pdf',
      fileMime: 'application/pdf',
      fileBase64: validPdfB64,
      note: 'Tested keyboard navigation and contrast.',
    },
  });
  assert.equal(projSub.status, 201);
  assert.equal(projSub.body.submission.status, 'evaluated');

  const review = await apiCall(app, 'POST', `/api/instructor/submissions/${projSub.body.submission.id}/review`, {
    token: instructor.token,
    body: {
      rubricScores: [
        { criterion: 'Accessibility', score: 38, maxPoints: 40, comment: 'Great contrast' },
        { criterion: 'Code clarity', score: 28, maxPoints: 30, comment: 'Clean HTML' },
        { criterion: 'Performance', score: 27, maxPoints: 30, comment: 'Fast load' },
      ],
      feedback: 'Verified! Meets all accessibility and performance criteria.',
      approved: true,
    },
  });
  assert.equal(review.status, 200);
  assert.equal(review.body.submission.status, 'verified');
  assert.equal(review.body.submission.overallScore, 93);

  // 12-13. Now eligible -> issue cryptographically signed certificate & download PDF
  const issued = await apiCall(app, 'POST', '/api/certificates/javascript-practitioner/issue', { token, body: {} });
  assert.equal(issued.status, 201);
  const code = issued.body.certificate.verificationCode as string;
  assert.match(code, /^WRK-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal(issued.body.certificate.signatureAlg, 'HMAC-SHA256');

  const pdfRes = await apiCall(app, 'GET', `/api/certificates/${code}/pdf`);
  assert.equal(pdfRes.status, 200);
  assert.equal(pdfRes.headers.get('content-type'), 'application/pdf');
  const pdfText = new TextDecoder().decode(pdfRes.body as Uint8Array);
  assert.ok(pdfText.startsWith('%PDF-1.4'));
  assert.ok(pdfText.includes(code));

  // 14. Public verification returns ONLY permitted fields (no email/user_id)
  const verified = await apiCall(app, 'GET', `/api/verify/${code}`);
  assert.equal(verified.status, 200);
  assert.equal(verified.body.status, 'verified');
  assert.equal(verified.body.signatureVerified, true);
  assert.equal(verified.body.holderName, 'Priya Nair');
  assert.equal('email' in verified.body, false);
  assert.equal('userId' in verified.body, false);

  // Portfolio privacy: private by default -> 404, then public without scores -> scores hidden
  assert.equal((await apiCall(app, 'GET', '/api/portfolio/priya-nair')).status, 404);
  await apiCall(app, 'PATCH', '/api/portfolio', { token, body: { portfolioPublic: true, showScoresPublic: false } });
  const pubPort = await apiCall(app, 'GET', '/api/portfolio/priya-nair');
  assert.equal(pubPort.status, 200);
  assert.equal(pubPort.body.portfolio.skills[0].score, null);
  assert.equal(pubPort.body.portfolio.certificates.length, 1);

  // Tamper check: mutating stored holderName breaks HMAC verification
  const stored = mem.inspect.issuedCerts.get(issued.body.certificate.id)!;
  const origSig = stored.signatureHex;
  stored.signatureHex = '0'.repeat(64);
  const tampered = await apiCall(app, 'GET', `/api/verify/${code}`);
  assert.equal(tampered.status, 409);
  stored.signatureHex = origSig;

  // Admin revocation: revoked certificate reports status = 'revoked' and rejects PDF download
  const revoked = await apiCall(app, 'POST', `/api/admin/certificates/${issued.body.certificate.id}/revoke`, {
    token: admin.token,
    body: { reason: 'Academic integrity audit test' },
  });
  assert.equal(revoked.status, 200);
  const verifyRevoked = await apiCall(app, 'GET', `/api/verify/${code}`);
  assert.equal(verifyRevoked.status, 200);
  assert.equal(verifyRevoked.body.status, 'revoked');
  assert.equal((await apiCall(app, 'GET', `/api/certificates/${code}/pdf`)).status, 409);

  // Admin audit logs record sensitive events
  const logs = await apiCall(app, 'GET', '/api/admin/audit-logs', { token: admin.token });
  assert.equal(logs.status, 200);
  assert.ok(logs.body.logs.some((l: { action: string }) => l.action === 'certificate_revoked'));
});
