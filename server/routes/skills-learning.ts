import { z } from 'zod';
import { buildDeterministicRoadmap, multilingualInstruction, sanitizeAiRoadmap } from '../ai.ts';
import { enforceRateLimit, requireAuth, type RouteDef } from '../router-utils.ts';
import { ApiError, jsonResponse, parseJsonBody } from '../security.ts';

const StartAttemptSchema = z.object({
  languageCode: z.string().trim().min(2).max(8).optional(),
});

const SubmitAttemptSchema = z.object({
  answers: z.array(z.number().int().min(0).max(10).nullable()).min(1).max(50),
  languageCode: z.string().trim().min(2).max(8).optional(),
});

const CompleteLessonSchema = z.object({
  courseId: z.string().trim().min(1).max(80),
  answerIndex: z.number().int().nonnegative(),
});

const RoadmapRequestSchema = z.object({
  goal: z.string().trim().max(100).optional(),
  languageCode: z.string().trim().min(2).max(8).optional(),
});

const TutorRequestSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    text: z.string().trim().min(1).max(4000),
  })).min(1).max(20),
  languageCode: z.string().trim().min(2).max(8).optional(),
  contextSkillId: z.string().trim().max(32).optional(),
});

const ExecuteCodeSchema = z.object({
  challengeId: z.string().trim().min(1).max(80),
  languageId: z.string().trim().min(1).max(32),
  code: z.string().min(1).max(32_768),
});

const RecordCodeSubmissionSchema = z.object({
  challengeId: z.string().trim().min(1).max(80),
  languageId: z.string().trim().min(1).max(32),
  code: z.string().min(1).max(32_768),
  executionMode: z.enum(['browser_js', 'unavailable']),
  passedCount: z.number().int().min(0).max(100),
  totalCount: z.number().int().min(0).max(100),
  results: z.array(z.object({ ok: z.boolean(), got: z.string().max(500) })).max(100).default([]),
});

async function handleTutor(ctx: Parameters<RouteDef['handler']>[0]) {
  const user = await requireAuth(ctx);
  await enforceRateLimit(ctx, 'ai:tutor', user.id, 20, 600);
  const body = await parseJsonBody(ctx.req, TutorRequestSchema);
  const profile = await ctx.runtime.db.getProfile(user.id, user);
  const skills = await ctx.runtime.db.getUserSkills(user.id, user);
  const languageCode = body.languageCode ?? profile?.preferredLanguage ?? 'en';
  const latestUserMsg = [...body.messages].reverse().find((m) => m.role === 'user');
  if (!latestUserMsg) throw new ApiError(400, 'validation_error', 'At least one user message is required.');

  // Provide anonymized skill summary context only (never private email or account IDs).
  const skillContext = skills.map((s) => `${s.name}: ${s.score}% (goal ${s.target}%)`).join(', ');
  const historyTranscript = body.messages
    .slice(-8)
    .map((m) => `${m.role === 'user' ? 'Learner' : 'Tutor'}: ${m.text}`)
    .join('\n');

  const systemPrompt = [
    'You are the WORKISM 3.0 Adaptive AI Tutor supporting SDG 4 Quality Education.',
    multilingualInstruction(languageCode),
    'Give clear, encouraging explanations, runnable code examples, debugging guidance, or short revision exercises.',
    'Never invent official scores, grades, or certificate approvals.',

  ].join(' ');

  const completion = await ctx.runtime.ai.complete({
    userId: user.id,
    endpoint: 'ai_tutor',
    languageCode,
    systemPrompt,
    userPrompt: JSON.stringify({ skills: skillContext, goal: profile?.careerGoal || '', conversation: historyTranscript }),
    maxOutputTokens: 700,
  });

  await ctx.runtime.db.appendTutorMessages(user.id, languageCode, latestUserMsg.text, completion.text);
  return jsonResponse({ text: completion.text, languageCode, model: completion.model }, 200, ctx.headers);
}

export const skillsLearningRoutes: RouteDef[] = [
  {
    method: 'GET',
    pattern: '/api/skills',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const skills = await ctx.runtime.db.getUserSkills(user.id, user);
      const gaps = skills
        .map((s) => ({ id: s.id, name: s.name, score: s.score, target: s.target, gap: Math.max(s.target - s.score, 0) }))
        .sort((a, b) => b.gap - a.gap);
      return jsonResponse({ skills, gaps }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/assessments/:skillId',
    async handler(ctx) {
      await requireAuth(ctx);
      const assessment = await ctx.runtime.db.getAssessmentBySkill(ctx.params.skillId);
      if (!assessment) throw new ApiError(404, 'assessment_not_found', 'No active assessment found for this skill.');
      // Strip correctIndex and explanation before sending to student!
      return jsonResponse({
        id: assessment.id,
        skillId: assessment.skillId,
        title: assessment.title,
        passMark: assessment.passMark,
        timeLimitSeconds: assessment.timeLimitSeconds,
        questions: assessment.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          difficulty: q.difficulty,
        })),
      }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/assessments/:skillId/attempts',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'assessment:start', user.id, 15, 600);
      const body = await parseJsonBody(ctx.req, StartAttemptSchema);
      const assessment = await ctx.runtime.db.getAssessmentBySkill(ctx.params.skillId);
      if (!assessment) throw new ApiError(404, 'assessment_not_found', 'No active assessment found for this skill.');
      const profile = await ctx.runtime.db.getProfile(user.id, user);
      const lang = body.languageCode ?? profile?.preferredLanguage ?? 'en';
      const attempt = await ctx.runtime.db.createAssessmentAttempt(
        user.id,
        assessment.id,
        assessment.skillId,
        assessment.timeLimitSeconds,
        lang,
      );
      return jsonResponse({
        attempt: {
          id: attempt.id,
          assessmentId: attempt.assessmentId,
          skillId: attempt.skillId,
          expiresAt: attempt.expiresAt,
          passMark: assessment.passMark,
          timeLimitSeconds: assessment.timeLimitSeconds,
        },
        questions: assessment.questions.map((q) => ({
          id: q.id,
          prompt: q.prompt,
          options: q.options,
          difficulty: q.difficulty,
        })),
      }, 201, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/assessments/attempts/:attemptId/submit',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'assessment:submit', user.id, 15, 600);
      const body = await parseJsonBody(ctx.req, SubmitAttemptSchema);
      const attempt = await ctx.runtime.db.getAssessmentAttempt(ctx.params.attemptId, user);
      if (!attempt) throw new ApiError(404, 'attempt_not_found', 'Assessment attempt not found.');
      if (attempt.userId !== user.id) throw new ApiError(403, 'forbidden', 'Cannot submit another user attempt.');
      if (attempt.status !== 'in_progress') throw new ApiError(409, 'already_submitted', 'This attempt has already been submitted.');
      // Enforce server-side assessment time limit (+15s network grace).
      if (Date.now() > new Date(attempt.expiresAt).getTime() + 15_000) {
        throw new ApiError(410, 'attempt_expired', 'Assessment time limit has expired. Start a new attempt.');
      }

      const assessment = await ctx.runtime.db.getAssessmentBySkill(attempt.skillId);
      if (!assessment) throw new ApiError(404, 'assessment_not_found', 'Assessment definition missing.');

      // Official scoring strictly computed from authoritative database answer keys (never AI-invented).
      let correctCount = 0;
      const review = assessment.questions.map((q, idx) => {
        const chosen = body.answers[idx] ?? null;
        const correct = chosen === q.correctIndex;
        if (correct) correctCount += 1;
        return {
          questionId: q.id,
          prompt: q.prompt,
          chosenIndex: chosen,
          correctIndex: q.correctIndex,
          correct,
          explanation: q.explanation,
        };
      });
      const totalCount = assessment.questions.length;
      const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
      const passed = scorePercent >= assessment.passMark;
      const lang = body.languageCode ?? attempt.languageCode ?? 'en';

      // Optional Gemini explanation of actual missed topics (never modifies official score).
      let aiExplanation: string | null = null;
      const missed = review.filter((r) => !r.correct).map((r) => r.prompt);
      try {
        const aiRes = await ctx.runtime.ai.complete({
          userId: user.id,
          endpoint: 'assessment_explanation',
          languageCode: lang,
          systemPrompt: `You are a concise educational coach. ${multilingualInstruction(lang)} Explain the learner's real score without changing or inventing scores.`,
          userPrompt: `Skill: ${assessment.title}. Official score: ${scorePercent}% (${correctCount}/${totalCount}, pass mark ${assessment.passMark}%). Missed topics: ${missed.length ? missed.join('; ') : 'None'}. Give 2-3 actionable next steps.`,
          maxOutputTokens: 300,
        });
        aiExplanation = aiRes.text;
      } catch {
        aiExplanation = missed.length
          ? `Official score: ${scorePercent}%. Review the ${missed.length} missed question(s) and retake after completing the course lessons.`
          : `Official score: ${scorePercent}%. All questions answered correctly.`;
      }

      const finalized = await ctx.runtime.db.completeAssessmentAttempt({
        attemptId: attempt.id,
        userId: user.id,
        skillId: attempt.skillId,
        answers: body.answers,
        correctCount,
        totalCount,
        scorePercent,
        aiExplanation,
      });

      await ctx.runtime.db.pushNotification(
        user.id,
        `assessment-${attempt.skillId}`,
        `Your official ${assessment.title} score (${scorePercent}%) updated your skill profile.`,
        `/skills?focus=${attempt.skillId}`,
      );

      const skills = await ctx.runtime.db.getUserSkills(user.id, user);
      return jsonResponse({
        attempt: finalized,
        passed,
        passMark: assessment.passMark,
        review,
        skills,
      }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/courses',
    async handler(ctx) {
      await requireAuth(ctx);
      const courses = await ctx.runtime.db.listCourses();
      return jsonResponse({ courses }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/courses/:courseId/enroll',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const courses = await ctx.runtime.db.listCourses();
      if (!courses.some((c) => c.id === ctx.params.courseId)) {
        throw new ApiError(404, 'course_not_found', 'Course not found.');
      }
      await ctx.runtime.db.enrollCourse(user.id, ctx.params.courseId);
      return jsonResponse({ ok: true, courseId: ctx.params.courseId }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/lessons/:lessonId/complete',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const body = await parseJsonBody(ctx.req, CompleteLessonSchema);
      const courses = await ctx.runtime.db.listCourses();
      const course = courses.find((c) => c.id === body.courseId);
      if (!course) throw new ApiError(404, 'course_not_found', 'Course not found.');
      const ordered = course.modules.flatMap((m) => m.lessons);
      const idx = ordered.findIndex((l) => l.id === ctx.params.lessonId);
      if (idx === -1) throw new ApiError(404, 'lesson_not_found', 'Lesson not found in course.');

      const doneBefore = await ctx.runtime.db.listLessonsDone(user.id, user);
      // Enforce sequential unlock: all prior lessons in this course must be done.
      const missingPrior = ordered.slice(0, idx).find((l) => !doneBefore.includes(l.id));
      if (missingPrior) {
        throw new ApiError(409, 'lesson_locked', `Complete "${missingPrior.title}" before completing this lesson.`);
      }

      if (ordered[idx].check.answer !== body.answerIndex) {
        throw new ApiError(422, 'practice_incorrect', 'Review the lesson and try the practice question again.');
      }
      const lessonsDone = await ctx.runtime.db.completeLesson(user.id, course.id, ctx.params.lessonId, true);
      const courseFinished = ordered.every((l) => lessonsDone.includes(l.id));
      if (courseFinished) {
        await ctx.runtime.db.pushNotification(
          user.id,
          `course-${course.id}`,
          'You finished a course. Take its assessment next.',
          `/assessments/quiz/${course.skill}`,
        );
      }
      return jsonResponse({ lessonsDone, courseFinished }, 200, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/learning/roadmap',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const roadmap = await ctx.runtime.db.getActiveRoadmap(user.id, user);
      return jsonResponse({ roadmap }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/ai/roadmap',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'ai:roadmap', user.id, 6, 600);
      const body = await parseJsonBody(ctx.req, RoadmapRequestSchema);
      const [profile, skills, courses, lessonsDone] = await Promise.all([
        ctx.runtime.db.getProfile(user.id, user),
        ctx.runtime.db.getUserSkills(user.id, user),
        ctx.runtime.db.listCourses(),
        ctx.runtime.db.listLessonsDone(user.id, user),
      ]);

      const goal = body.goal || profile?.careerGoal || 'fullstack';
      const languageCode = body.languageCode || profile?.preferredLanguage || 'en';
      const deterministic = buildDeterministicRoadmap(goal, skills, courses, lessonsDone);

      let chosen = deterministic;
      let generatedBy: 'gemini' | 'deterministic_fallback' = 'deterministic_fallback';

      try {
        const remainingCatalog = courses.map((c) => ({
          courseId: c.id,
          skillId: c.skill,
          title: c.title,
          remainingLessons: c.modules.flatMap((m) => m.lessons.map((l) => l.id)).filter((id) => !lessonsDone.includes(id)),
        })).filter((c) => c.remainingLessons.length > 0);

        if (remainingCatalog.length > 0) {
          const aiRes = await ctx.runtime.ai.complete({
            userId: user.id,
            endpoint: 'ai_roadmap',
            languageCode,
            systemPrompt: [
              'Return strictly valid JSON with shape {"summary": string, "milestones": [{"courseId": string|null, "skillId": string|null, "title": string, "objective": string, "lessonIds": string[]}]}.',
              multilingualInstruction(languageCode),
              'Only include remaining lesson IDs provided below; NEVER include already completed lessons.',
            ].join(' '),
            userPrompt: JSON.stringify({
              goal,
              interests: profile?.interests ?? [],
              style: profile?.learningStyle ?? '',
              pace: profile?.learningPace ?? '',
              skills: skills.map((s) => ({ id: s.id, name: s.name, score: s.score, target: s.target })),
              remainingCatalog,
            }),
            maxOutputTokens: 700,
          });
          const validated = sanitizeAiRoadmap(aiRes.text, courses, lessonsDone);
          if (validated) {
            chosen = validated;
            generatedBy = 'gemini';
          }
        }
      } catch (err) {
        if (err instanceof ApiError && err.code === 'ai_quota_exceeded') throw err;
        // Safe fallback to deterministic gap-based roadmap.
      }

      const saved = await ctx.runtime.db.saveRoadmap(user.id, goal, languageCode, chosen.summary, chosen.milestones);
      return jsonResponse({ roadmap: saved, generatedBy }, 201, ctx.headers);
    },
  },
  {
    method: 'GET',
    pattern: '/api/ai/tutor/history',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      const messages = await ctx.runtime.db.listTutorMessages(user.id, 30);
      return jsonResponse({ messages }, 200, ctx.headers);
    },
  },
  { method: 'POST', pattern: '/api/ai/tutor', handler: handleTutor },
  { method: 'POST', pattern: '/api/assistant/messages', handler: handleTutor },
  {
    method: 'DELETE',
    pattern: '/api/ai/tutor/history',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await ctx.runtime.db.clearTutorMessages(user.id);
      return jsonResponse({ ok: true }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/code/execute',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'code:execute', user.id, 15, 300);
      const body = await parseJsonBody(ctx.req, ExecuteCodeSchema);
      const [challenge, languages] = await Promise.all([
        ctx.runtime.db.getChallenge(body.challengeId),
        ctx.runtime.db.listProgrammingLanguages(false),
      ]);
      if (!challenge) throw new ApiError(404, 'challenge_not_found', 'Coding challenge not found.');
      const lang = languages.find((l) => l.id === body.languageId);
      if (!lang) throw new ApiError(404, 'language_not_found', 'Programming language not found.');

      const result = await ctx.runtime.sandbox.execute({
        languageId: lang.id,
        runtime: lang.capabilities.executionRuntime,
        code: body.code,
        fnName: challenge.fnName,
        tests: [...challenge.publicTests, ...challenge.hiddenTests],
      });

      const passedCount = result.results ? result.results.filter((r) => r.ok).length : 0;
      const totalCount = result.results ? result.results.length : 0;
      await ctx.runtime.db.recordCodeSubmission({
        userId: user.id,
        challengeId: challenge.id,
        languageId: lang.id,
        sourceCode: body.code,
        executionMode: result.status === 'unavailable' ? 'unavailable' : 'remote_sandbox',
        passedCount,
        totalCount,
        // Never leak hidden test expected inputs/outputs back; return pass/fail summary for hidden tests.
        results: result.results
          ? result.results.map((r, i) => (i < challenge.publicTests.length ? r : { ok: r.ok, got: r.ok ? 'passed' : 'hidden test failed' }))
          : [],
      });

      if (result.status === 'unavailable') {
        return jsonResponse({
          status: 'unavailable',
          simulated: false,
          language: lang.id,
          capabilities: lang.capabilities,
          message: result.error,
        }, 503, ctx.headers);
      }

      return jsonResponse({
        status: result.status,
        simulated: false,
        passedCount,
        totalCount,
        publicResults: result.results?.slice(0, challenge.publicTests.length) ?? [],
        hiddenPassedCount: result.results ? result.results.slice(challenge.publicTests.length).filter((r) => r.ok).length : 0,
        hiddenTotalCount: challenge.hiddenTests.length,
        runtimeMs: result.runtimeMs,
        error: result.error,
      }, 200, ctx.headers);
    },
  },
  {
    method: 'POST',
    pattern: '/api/code/submissions',
    async handler(ctx) {
      const user = await requireAuth(ctx);
      await enforceRateLimit(ctx, 'code:submit', user.id, 30, 300);
      const body = await parseJsonBody(ctx.req, RecordCodeSubmissionSchema);
      const saved = await ctx.runtime.db.recordCodeSubmission({
        userId: user.id,
        challengeId: body.challengeId,
        languageId: body.languageId,
        sourceCode: body.code,
        executionMode: body.executionMode,
        passedCount: body.passedCount,
        totalCount: body.totalCount,
        results: body.results,
      });
      return jsonResponse({ id: saved.id }, 201, ctx.headers);
    },
  },
];
