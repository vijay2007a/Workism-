import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDeterministicRoadmap,
  createGeminiClient,
  multilingualInstruction,
  sanitizeAiRoadmap,
  SPOKEN_LANGUAGE_NAMES,
} from '../ai.ts';
import { readEnv } from '../env.ts';
import { createSandboxRunner } from '../execution.ts';
import {
  checkCertificateEligibility,
  generateVerificationCode,
  renderCertificatePdf,
  signCertificatePayload,
  verifyCertificateSignature,
} from '../certificates.ts';
import type { CourseRecord, IssuedCertificateRecord } from '../types.ts';

test('multilingual instruction supports all 18 languages and preserves code syntax', () => {
  assert.equal(Object.keys(SPOKEN_LANGUAGE_NAMES).length, 18);
  for (const code of Object.keys(SPOKEN_LANGUAGE_NAMES)) {
    const prompt = multilingualInstruction(code);
    assert.ok(prompt.includes(`(${code})`));
    assert.match(prompt, /Preserve all programming code syntax/i);
  }
});

test('roadmap sanitizer drops completed lessons and unknown course/lesson IDs', () => {
  const courses: CourseRecord[] = [
    {
      id: 'js-course',
      skill: 'js',
      title: 'JS',
      blurb: 'JS basics',
      level: 'Beginner',
      modules: [
        {
          id: 'm1',
          title: 'M1',
          lessons: [
            { id: 'js-1', moduleId: 'm1', courseId: 'js-course', title: 'L1', minutes: 10, body: ['a'], check: { q: 'q', options: ['a', 'b'], answer: 0, why: 'w' } },
            { id: 'js-2', moduleId: 'm1', courseId: 'js-course', title: 'L2', minutes: 10, body: ['a'], check: { q: 'q', options: ['a', 'b'], answer: 0, why: 'w' } },
          ],
        },
      ],
    },
  ];
  const raw = JSON.stringify({
    summary: 'Focus on finishing your JS foundations.',
    milestones: [
      { courseId: 'js-course', skillId: 'js', title: 'JS', objective: 'Finish JS lessons', lessonIds: ['js-1', 'js-2', 'fake-lesson'] },
    ],
  });
  const sanitized = sanitizeAiRoadmap(raw, courses, ['js-1']);
  assert.ok(sanitized);
  assert.deepEqual(sanitized.milestones[0].lessonIds, ['js-2']);

  const det = buildDeterministicRoadmap('fullstack', [{ id: 'js', name: 'JS', score: 30, target: 85, history: [30], source: 'api' }], courses, ['js-1']);
  assert.deepEqual(det.milestones[0].lessonIds, ['js-2']);
});

test('Gemini client refuses requests cleanly when GEMINI_API_KEY is not configured', async () => {
  const client = createGeminiClient(readEnv({}), async () => {}, async () => true);
  await assert.rejects(
    () => client.complete({ userId: 'u1', endpoint: 'ai_tutor', languageCode: 'en', systemPrompt: 's', userPrompt: 'u' }),
    /not configured/i,
  );
});

test('sandbox runner enforces code size cap and never simulates passed tests when unconfigured', async () => {
  const runner = createSandboxRunner(readEnv({}));
  const tooBig = await runner.execute({ languageId: 'python', runtime: 'python3.12', code: 'x'.repeat(40_000), fnName: 'f', tests: [] });
  assert.equal(tooBig.status, 'failed');
  assert.equal(tooBig.simulated, false);

  const unavail = await runner.execute({ languageId: 'python', runtime: 'python3.12', code: 'def f(): return 1', fnName: 'f', tests: [{ args: [], expected: 1 }] });
  assert.equal(unavail.status, 'unavailable');
  assert.equal(unavail.simulated, false);
  assert.equal(unavail.results, undefined);
});

test('HMAC-SHA256 certificate signatures reject short secrets, tampering, and incomplete eligibility', () => {
  const secret = 'this-is-a-strong-signing-secret-with-more-than-32-chars';
  const code = generateVerificationCode();
  const payload = {
    verificationCode: code,
    templateId: 'javascript-practitioner',
    userId: 'user-1',
    holderName: 'Asha',
    title: 'JavaScript Practitioner',
    issuedAt: '2026-11-22T10:00:00.000Z',
  };
  assert.throws(() => signCertificatePayload(payload, 'short'), /at least 32/);

  const sig = signCertificatePayload(payload, secret);
  const cert: IssuedCertificateRecord = {
    id: 'c1',
    verificationCode: code,
    templateId: payload.templateId,
    userId: payload.userId,
    holderName: payload.holderName,
    title: payload.title,
    skillName: 'JavaScript',
    status: 'verified',
    issuedAt: payload.issuedAt,
    issuedBy: payload.userId,
    signatureAlg: 'HMAC-SHA256',
    signaturePayload: payload as unknown as Record<string, unknown>,
    signatureHex: sig,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
  };
  assert.equal(verifyCertificateSignature(cert, secret), true);
  assert.equal(verifyCertificateSignature({ ...cert, holderName: 'Different learner' }, secret), false);
  assert.equal(verifyCertificateSignature({ ...cert, signatureHex: sig.replace(/^./, sig[0] === 'a' ? 'b' : 'a') }, secret), false);
  assert.equal(verifyCertificateSignature(cert, 'wrong-secret-key-that-is-still-over-32-chars-long'), false);

  const pdf = renderCertificatePdf(cert, `https://workism.app/verify/${code}`);
  const text = new TextDecoder().decode(pdf);
  assert.ok(text.startsWith('%PDF-1.4'));
  assert.ok(text.includes('Asha'));
  assert.ok(text.includes(code));

  const elig = checkCertificateEligibility(
    { id: 't1', title: 'T', skillId: 'js', courseId: 'c1', projectId: 'p1', passMark: 70 },
    { id: 'c1', skill: 'js', title: 'C', blurb: 'b', level: 'Beginner', modules: [{ id: 'm1', title: 'M', lessons: [{ id: 'l1', moduleId: 'm1', courseId: 'c1', title: 'L', minutes: 5, body: [], check: { q: 'q', options: ['a', 'b'], answer: 0, why: 'w' } }] }] },
    ['l1'],
    [{ id: 'js', name: 'JS', score: 69, target: 80, history: [69], source: 'api' }],
    [],
  );
  assert.equal(elig.eligible, false);
  assert.equal(elig.courseComplete, true);
  assert.equal(elig.assessmentPassed, false);
  assert.equal(elig.projectVerified, false);
});
