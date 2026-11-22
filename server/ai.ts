import { GoogleGenAI } from '@google/genai';
import { z } from 'zod';
import type { ServerEnv } from './env.ts';
import { ApiError } from './security.ts';
import type { AiCompletionResult, CourseRecord, RoadmapMilestone, UserSkillView } from './types.ts';

export const SPOKEN_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ta: 'Tamil',
  hi: 'Hindi',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  bn: 'Bengali',
  mr: 'Marathi',
  gu: 'Gujarati',
  pa: 'Punjabi',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  ko: 'Korean',
  ar: 'Arabic',
  zh: 'Simplified Chinese',
  pt: 'Portuguese',
};

export function resolveLanguageName(code: string): string {
  return SPOKEN_LANGUAGE_NAMES[code] ?? 'English';
}

export function multilingualInstruction(languageCode: string): string {
  const name = resolveLanguageName(languageCode);
  return `Respond in ${name} (${languageCode}). Preserve all programming code syntax, keywords, identifiers, file paths, and CLI commands strictly in English inside fenced code blocks while explaining concepts naturally in ${name}.`;
}

const MAX_CONCURRENT_AI = 6;
const AI_TIMEOUT_MS = 20_000;
let activeAiCalls = 0;

export function createGeminiClient(
  env: ServerEnv,
  logUsage: (entry: {
    userId: string;
    endpoint: string;
    model: string;
    languageCode: string;
    promptTokens: number;
    outputTokens: number;
    latencyMs: number;
    status: 'ok' | 'error' | 'quota_blocked' | 'timeout';
  }) => Promise<void>,
  getDailyUsageCount: (userId: string) => Promise<number>,
) {
  const sdk = env.geminiApiKey ? new GoogleGenAI({ apiKey: env.geminiApiKey }) : null;

  async function complete(input: {
    userId: string;
    endpoint: string;
    languageCode: string;
    systemPrompt: string;
    userPrompt: string;
    maxOutputTokens?: number;
  }): Promise<AiCompletionResult> {
    if (!sdk) {
      throw new ApiError(503, 'ai_not_configured', 'Gemini AI service is not configured on this server.');
    }

    const usedToday = await getDailyUsageCount(input.userId);
    if (usedToday >= env.aiDailyQuota) {
      await logUsage({
        userId: input.userId,
        endpoint: input.endpoint,
        model: env.geminiModel,
        languageCode: input.languageCode,
        promptTokens: 0,
        outputTokens: 0,
        latencyMs: 0,
        status: 'quota_blocked',
      });
      throw new ApiError(429, 'ai_quota_exceeded', 'Daily AI usage quota reached. Try again tomorrow.');
    }

    if (activeAiCalls >= MAX_CONCURRENT_AI) {
      throw new ApiError(503, 'ai_busy', 'AI tutor is temporarily at capacity. Please retry shortly.');
    }

    const started = Date.now();
    activeAiCalls += 1;
    try {
      let lastErr: unknown;
      for (let attempt = 0; attempt < 2; attempt++) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
        try {
          const response = await sdk.models.generateContent({
            model: env.geminiModel,
            contents: input.userPrompt.slice(0, 8000),
            config: {
              systemInstruction: input.systemPrompt,
              maxOutputTokens: Math.min(input.maxOutputTokens ?? 800, 1200),
              temperature: 0.4,
              abortSignal: controller.signal,
            },
          });
          clearTimeout(timer);
          const text = (response.text ?? '').trim();
          const promptTokens = response.usageMetadata?.promptTokenCount ?? 0;
          const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;
          const latencyMs = Date.now() - started;
          await logUsage({
            userId: input.userId,
            endpoint: input.endpoint,
            model: env.geminiModel,
            languageCode: input.languageCode,
            promptTokens,
            outputTokens,
            latencyMs,
            status: 'ok',
          });
          return { text, model: env.geminiModel, promptTokens, outputTokens, latencyMs };
        } catch (err) {
          clearTimeout(timer);
          lastErr = err;
          if (controller.signal.aborted) {
            await logUsage({
              userId: input.userId,
              endpoint: input.endpoint,
              model: env.geminiModel,
              languageCode: input.languageCode,
              promptTokens: 0,
              outputTokens: 0,
              latencyMs: Date.now() - started,
              status: 'timeout',
            });
            throw new ApiError(504, 'ai_timeout', 'AI request timed out. Please try again.');
          }
        }
      }
      await logUsage({
        userId: input.userId,
        endpoint: input.endpoint,
        model: env.geminiModel,
        languageCode: input.languageCode,
        promptTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        status: 'error',
      });
      throw lastErr instanceof ApiError ? lastErr : new ApiError(502, 'ai_upstream_error', 'AI service could not complete the request.');
    } finally {
      activeAiCalls -= 1;
    }
  }

  return { complete };
}

export const RoadmapAiSchema = z.object({
  summary: z.string().min(10).max(800),
  milestones: z.array(
    z.object({
      courseId: z.string().nullable(),
      skillId: z.string().nullable(),
      title: z.string().min(2).max(120),
      objective: z.string().min(5).max(400),
      lessonIds: z.array(z.string()).max(12),
    }),
  ).min(1).max(8),
});

/** Deterministic fallback roadmap built from real skill gaps while skipping already-completed lessons. */
export function buildDeterministicRoadmap(
  goal: string,
  skills: readonly UserSkillView[],
  courses: readonly CourseRecord[],
  lessonsDone: readonly string[],
): { summary: string; milestones: RoadmapMilestone[] } {
  const doneSet = new Set(lessonsDone);
  const gapBySkill = new Map(skills.map((s) => [s.id, s.target - s.score]));
  const remaining = courses
    .map((c) => ({
      course: c,
      gap: gapBySkill.get(c.skill) ?? 50,
      pendingLessons: c.modules.flatMap((m) => m.lessons.map((l) => l.id)).filter((id) => !doneSet.has(id)),
    }))
    .filter((x) => x.pendingLessons.length > 0)
    .sort((a, b) => b.gap - a.gap);

  const milestones: RoadmapMilestone[] = remaining.slice(0, 5).map(({ course, pendingLessons }) => ({
    courseId: course.id,
    skillId: course.skill,
    title: course.title,
    objective: `Complete ${pendingLessons.length} remaining lesson(s) to close the gap in ${course.title}.`,
    lessonIds: pendingLessons,
  }));

  return {
    summary: milestones.length
      ? `Personalized path toward "${goal || 'core engineering skills'}" focusing on ${milestones.map((m) => m.title).join(', ')}. Completed lessons are preserved.`
      : 'All available course lessons are complete. Focus on practical project verification and assessments.',
    milestones,
  };
}

/** Filters AI-generated roadmap so completed lessons are never regenerated and unknown IDs are dropped. */
export function sanitizeAiRoadmap(
  rawText: string,
  courses: readonly CourseRecord[],
  lessonsDone: readonly string[],
): { summary: string; milestones: RoadmapMilestone[] } | null {
  const cleaned = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return null;
  }
  const checked = RoadmapAiSchema.safeParse(parsed);
  if (!checked.success) return null;

  const doneSet = new Set(lessonsDone);
  const validCourses = new Set(courses.map((c) => c.id));
  const validLessons = new Set(courses.flatMap((c) => c.modules.flatMap((m) => m.lessons.map((l) => l.id))));

  const milestones = checked.data.milestones
    .map((m) => ({
      ...m,
      courseId: m.courseId && validCourses.has(m.courseId) ? m.courseId : null,
      lessonIds: m.lessonIds.filter((id) => validLessons.has(id) && !doneSet.has(id)),
    }))
    .filter((m) => m.lessonIds.length > 0 || m.courseId === null);

  if (milestones.length === 0) return null;
  return { summary: checked.data.summary, milestones };
}
